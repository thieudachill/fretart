/**
 * Sim mode — develop and demo FretArt without a webcam.
 *
 * `?sim` replays a synthetic two-hand "player" (deterministic, generated
 * below); `?sim=<name>` replays a recorded fixture from
 * `public/fixtures/<name>.json`. Fixtures are recorded live with the dev-only
 * `J` hotkey (see main.ts), which downloads a JSON you can drop into that
 * folder. Everything downstream — features, mod matrix, effects — runs
 * exactly as with a real camera, which also makes the synthetic generator a
 * deterministic landmark source for tests.
 */
import type { RawHand } from './handTracker';

export interface SimFixture {
  version: 1;
  /** Frames with seconds-from-start timestamps, in recording order. */
  frames: { t: number; hands: RawHand[] }[];
}

const TAU = Math.PI * 2;

/**
 * Builds one plausible hand: wrist, thumb chain, four finger chains fanned
 * from the palm. Only the fingertips drive visuals, but all 21 landmarks are
 * filled so future chord/note analysis code sees a complete skeleton.
 * Video coordinates: x right, y down, 0..1.
 */
function buildHand(
  handedness: 'Left' | 'Right',
  palm: { x: number; y: number },
  fingerLift: (finger: number) => { dx: number; dy: number },
): RawHand {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const side = handedness === 'Left' ? 1 : -1; // thumb side in video space

  const wrist = { x: palm.x, y: palm.y + 0.085 };
  landmarks[0] = { x: wrist.x, y: wrist.y, z: 0 };

  // Thumb: 4 joints from the wrist toward the palm's thumb side.
  const thumbAngle = -Math.PI / 2 + side * 1.15;
  for (let j = 0; j < 4; j++) {
    const r = 0.028 * (j + 1);
    landmarks[1 + j] = {
      x: wrist.x + Math.cos(thumbAngle) * r,
      y: wrist.y + Math.sin(thumbAngle) * r * 0.9,
      z: 0,
    };
  }

  // Fingers index..pinky: fanned chains pointing up (negative y).
  const lengths = [0.115, 0.13, 0.12, 0.098];
  for (let f = 0; f < 4; f++) {
    const angle = -Math.PI / 2 + side * (f - 1.5) * 0.22;
    const lift = fingerLift(f);
    const tip = {
      x: palm.x + Math.cos(angle) * lengths[f] + lift.dx,
      y: palm.y + Math.sin(angle) * lengths[f] + lift.dy,
    };
    // Joints interpolate palm→tip with a slight knuckle arch.
    const stations = [0.35, 0.62, 0.84, 1];
    for (let j = 0; j < 4; j++) {
      const s = stations[j];
      landmarks[5 + f * 4 + j] = {
        x: palm.x + (tip.x - palm.x) * s,
        y: palm.y + (tip.y - palm.y) * s - Math.sin(s * Math.PI) * 0.008,
        z: 0,
      };
    }
  }

  return { landmarks, handedness, score: 1 };
}

/**
 * A deterministic phantom guitarist. The left hand frets — clustered tips,
 * slow positional drift, per-finger presses that change "chord" every couple
 * of seconds. The right hand plays fingerstyle — a rolling arpeggio wiggle
 * across the fingers. Pure function of time.
 */
export function synthHands(time: number): RawHand[] {
  // Fretting hand (person's left; video x mirrors to screen left by default).
  const fret = buildHand(
    'Left',
    {
      x: 0.66 + 0.035 * Math.sin(time * 0.37),
      y: 0.44 + 0.02 * Math.sin(time * 0.29 + 1.3),
    },
    (f) => {
      // Chord shapes: each finger holds an offset that re-rolls every 2s,
      // reached with a quick ease so changes read as deliberate presses.
      const chord = Math.floor(time / 2);
      const within = (time % 2) / 2;
      const ease = Math.min(1, within * 6);
      const at = (c: number) => Math.sin((c * 7.13 + f * 3.7) * 2.399) * 0.016;
      const hold = at(chord - 1) + (at(chord) - at(chord - 1)) * ease;
      // Faint vibrato while holding.
      const vibrato = 0.003 * Math.sin(time * TAU * 1.4 + f) * (1 - Math.abs(1 - within * 2));
      return { dx: hold * 0.4, dy: hold + vibrato };
    },
  );

  // Plucking hand (person's right): rolling arpeggio, thumb-side anchored.
  const pluck = buildHand(
    'Right',
    {
      x: 0.34 + 0.02 * Math.sin(time * 0.53 + 0.7),
      y: 0.52 + 0.012 * Math.sin(time * 0.41),
    },
    (f) => {
      // Each finger plucks in sequence — a p-i-m-a roll at ~100 bpm.
      const phase = time * 1.7 - f * 0.25;
      const stroke = Math.max(0, Math.sin(phase * TAU * 0.5));
      return {
        dx: 0.004 * Math.sin(phase * TAU),
        dy: stroke * stroke * 0.028,
      };
    },
  );

  return [fret, pluck];
}

/** Replays a fixture in a loop, or the synthetic player when none loaded. */
export class SimPlayer {
  constructor(private fixture: SimFixture | null = null) {}

  at(time: number): RawHand[] {
    const frames = this.fixture?.frames;
    if (!frames || frames.length < 2) return synthHands(time);
    const duration = frames[frames.length - 1].t;
    if (duration <= 0) return frames[0].hands;
    const t = time % duration;
    // Binary search the first frame at or after t.
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    return frames[lo].hands;
  }
}

/** Captures live raw hands into a downloadable fixture (dev hotkey `J`). */
export class FixtureRecorder {
  recording = false;
  private frames: SimFixture['frames'] = [];
  private t0 = -1;

  start(): void {
    this.frames = [];
    this.t0 = -1;
    this.recording = true;
  }

  add(time: number, hands: RawHand[]): void {
    if (!this.recording) return;
    if (this.t0 < 0) this.t0 = time;
    const round = (v: number) => Math.round(v * 1e4) / 1e4;
    this.frames.push({
      t: round(time - this.t0),
      hands: hands.map((h) => ({
        handedness: h.handedness,
        score: round(h.score),
        landmarks: h.landmarks.map((l) => ({ x: round(l.x), y: round(l.y), z: round(l.z) })),
      })),
    });
  }

  /** Stops and downloads the fixture; returns the number of frames captured. */
  stop(): number {
    this.recording = false;
    const count = this.frames.length;
    if (count === 0) return 0;
    const fixture: SimFixture = { version: 1, frames: this.frames };
    const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fretart-fixture.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    this.frames = [];
    return count;
  }
}
