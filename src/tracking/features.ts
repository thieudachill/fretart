import { zeroAudio, type AudioFeatures, type FrameFeatures, type HandFeatures, type Vec2 } from '../core/types';
import type { RawHand } from './handTracker';
import { OneEuroFilter } from './oneEuroFilter';

const NO_AUDIO = zeroAudio();

const TIP_IDS = [4, 8, 12, 16, 20];
const NUM_LANDMARKS = 21;

/** Maps normalized video coords -> normalized screen coords (cover crop). */
export interface ViewTransform {
  offU: number;
  offV: number;
  sclU: number;
  sclV: number;
}

function emptyHand(): HandFeatures {
  const zero = (): Vec2 => ({ x: 0, y: 0 });
  return {
    present: false,
    presence: 0,
    landmarks: Array.from({ length: NUM_LANDMARKS }, zero),
    tips: Array.from({ length: 5 }, zero),
    tipVelocities: Array.from({ length: 5 }, zero),
    tipSpeeds: [0, 0, 0, 0, 0],
    pinch: [0, 0, 0, 0],
    spread: 0,
    centroid: zero(),
    speed: 0,
  };
}

class HandState {
  features = emptyHand();
  filters: OneEuroFilter[] = [];
  prevTips: Vec2[] | null = null;

  constructor() {
    for (let i = 0; i < NUM_LANDMARKS * 2; i++) this.filters.push(new OneEuroFilter());
  }
}

/**
 * Turns raw MediaPipe landmarks into smoothed, screen-space, renderer-agnostic
 * features. This is the reusable foundation: effects, the mod matrix, and any
 * future chord/note detection all read from here.
 */
export class FeatureExtractor {
  private left = new HandState();
  private right = new HandState();

  /** Seconds to fade features out after tracking loss (guitar-neck occlusion). */
  releaseTime = 0.3;
  /** Seconds to fade in on acquisition. */
  attackTime = 0.06;
  /**
   * Latency compensation: fingertips are extrapolated this far ahead along
   * their smoothed velocity, hiding camera + inference + filter delay. Only
   * `tips` (and things derived from them) are predicted; `landmarks` stay
   * unpredicted for future chord/note analysis.
   */
  lookaheadMs = 30;

  setFilterParams(minCutoff: number, beta: number): void {
    for (const state of [this.left, this.right]) {
      for (const f of state.filters) f.setParams(minCutoff, beta);
    }
  }

  /**
   * One knob for the lag↔jitter tradeoff. 0 = dreamy/smooth, 1 = near-raw.
   * Maps to One Euro params: minCutoff handles rest jitter, beta how fast
   * the filter opens up under motion.
   */
  setResponsiveness(r: number): void {
    const t = Math.max(0, Math.min(1, r));
    this.setFilterParams(1 + 3 * t, 0.5 + 11.5 * t);
  }

  update(
    raw: RawHand[],
    dt: number,
    view: ViewTransform,
    mirror: boolean,
    time: number,
    audio: AudioFeatures = NO_AUDIO,
  ): FrameFeatures {
    const rawLeft = raw.find((h) => h.handedness === 'Left') ?? null;
    const rawRight = raw.find((h) => h.handedness === 'Right') ?? null;
    // Mirroring swaps which side of the screen each hand appears on; the
    // labels themselves stay correct.
    this.updateHand(this.left, rawLeft, dt, view, mirror);
    this.updateHand(this.right, rawRight, dt, view, mirror);

    const l = this.left.features;
    const r = this.right.features;
    const handsDistance =
      l.present && r.present
        ? Math.hypot(l.centroid.x - r.centroid.x, l.centroid.y - r.centroid.y)
        : 0;

    return {
      left: l,
      right: r,
      handsDistance,
      anyPresence: Math.max(l.presence, r.presence),
      audio,
      time,
    };
  }

  private updateHand(
    state: HandState,
    raw: RawHand | null,
    dt: number,
    view: ViewTransform,
    mirror: boolean,
  ): void {
    const f = state.features;
    const step = dt > 0 ? dt : 1 / 60;

    if (!raw) {
      f.present = false;
      f.presence = Math.max(0, f.presence - step / this.releaseTime);
      // Decay velocities so lingering effects wind down instead of freezing.
      for (let i = 0; i < 5; i++) {
        f.tipVelocities[i].x *= 0.85;
        f.tipVelocities[i].y *= 0.85;
        f.tipSpeeds[i] *= 0.85;
      }
      f.speed *= 0.85;
      if (f.presence === 0) {
        state.prevTips = null;
        for (const filt of state.filters) filt.reset();
      }
      return;
    }

    f.present = true;
    f.presence = Math.min(1, f.presence + step / this.attackTime);

    // Video coords -> screen coords through the cover crop, with smoothing.
    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const lm = raw.landmarks[i];
      const vx = mirror ? 1 - lm.x : lm.x;
      const sx = (vx - view.offU) / view.sclU;
      const sy = (lm.y - view.offV) / view.sclV;
      f.landmarks[i].x = state.filters[i * 2].filter(sx, step);
      f.landmarks[i].y = state.filters[i * 2 + 1].filter(sy, step);
    }
    for (let t = 0; t < 5; t++) {
      f.tips[t].x = f.landmarks[TIP_IDS[t]].x;
      f.tips[t].y = f.landmarks[TIP_IDS[t]].y;
    }

    // Velocities (exponentially smoothed to be usable as modulation signals).
    const smooth = 0.5;
    let speedSum = 0;
    for (let t = 0; t < 5; t++) {
      let vx = 0;
      let vy = 0;
      if (state.prevTips) {
        vx = (f.tips[t].x - state.prevTips[t].x) / step;
        vy = (f.tips[t].y - state.prevTips[t].y) / step;
      }
      f.tipVelocities[t].x = f.tipVelocities[t].x * (1 - smooth) + vx * smooth;
      f.tipVelocities[t].y = f.tipVelocities[t].y * (1 - smooth) + vy * smooth;
      f.tipSpeeds[t] = Math.hypot(f.tipVelocities[t].x, f.tipVelocities[t].y);
      speedSum += f.tipSpeeds[t];
    }
    f.speed = speedSum / 5;
    state.prevTips = f.tips.map((p) => ({ x: p.x, y: p.y }));

    // Predict forward — prevTips above stores the unpredicted positions so
    // next frame's velocity stays honest.
    const look = this.lookaheadMs / 1000;
    if (look > 0) {
      for (let t = 0; t < 5; t++) {
        f.tips[t].x += f.tipVelocities[t].x * look;
        f.tips[t].y += f.tipVelocities[t].y * look;
      }
    }

    // Pinches: thumb tip to each other fingertip.
    for (let t = 1; t < 5; t++) {
      f.pinch[t - 1] = Math.hypot(f.tips[0].x - f.tips[t].x, f.tips[0].y - f.tips[t].y);
    }

    // Centroid + spread of fingertips.
    let cx = 0;
    let cy = 0;
    for (const tip of f.tips) {
      cx += tip.x;
      cy += tip.y;
    }
    f.centroid.x = cx / 5;
    f.centroid.y = cy / 5;
    let spread = 0;
    for (const tip of f.tips) {
      spread = Math.max(spread, Math.hypot(tip.x - f.centroid.x, tip.y - f.centroid.y));
    }
    f.spread = spread;
  }
}

/** Soft-clamps an unbounded speed into 0..1 for modulation use. */
function softClamp(v: number, knee: number): number {
  return v / (v + knee);
}

export interface FeatureSource {
  id: string;
  label: string;
  get(f: FrameFeatures): number;
}

/**
 * Named scalar signals exposed to the modulation matrix. All return 0..1.
 * Future audio features (onset, pitch, RMS) plug into this same list.
 */
export const FEATURE_SOURCES: FeatureSource[] = [
  { id: 'left.speed', label: 'L hand speed', get: (f) => softClamp(f.left.speed, 0.35) * f.left.presence },
  { id: 'right.speed', label: 'R hand speed', get: (f) => softClamp(f.right.speed, 0.35) * f.right.presence },
  { id: 'left.spread', label: 'L finger spread', get: (f) => Math.min(1, f.left.spread * 5) * f.left.presence },
  { id: 'right.spread', label: 'R finger spread', get: (f) => Math.min(1, f.right.spread * 5) * f.right.presence },
  { id: 'left.pinchIndex', label: 'L thumb-index pinch', get: (f) => Math.min(1, f.left.pinch[0] * 4) * f.left.presence },
  { id: 'right.pinchIndex', label: 'R thumb-index pinch', get: (f) => Math.min(1, f.right.pinch[0] * 4) * f.right.presence },
  { id: 'hands.distance', label: 'Hands distance', get: (f) => Math.min(1, f.handsDistance * 1.5) },
  { id: 'left.height', label: 'L hand height', get: (f) => (1 - f.left.centroid.y) * f.left.presence },
  { id: 'right.height', label: 'R hand height', get: (f) => (1 - f.right.centroid.y) * f.right.presence },
  // Sound sources (src/audio) — 0 whenever no mic is listening.
  { id: 'audio.level', label: 'Sound level', get: (f) => f.audio.level },
  { id: 'audio.onset', label: 'Sound onset (pluck)', get: (f) => f.audio.onset },
  { id: 'audio.pitch', label: 'Sound register (low↔high)', get: (f) => f.audio.pitch },
  { id: 'audio.bass', label: 'Sound bass', get: (f) => f.audio.bass },
  { id: 'audio.air', label: 'Sound air (sparkle)', get: (f) => f.audio.air },
];

export function getFeatureValue(f: FrameFeatures, id: string): number {
  const src = FEATURE_SOURCES.find((s) => s.id === id);
  return src ? Math.max(0, Math.min(1, src.get(f))) : 0;
}
