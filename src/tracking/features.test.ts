import { describe, expect, it } from 'vitest';
import { FeatureExtractor, getFeatureValue, type ViewTransform } from './features';
import type { RawHand } from './handTracker';
import type { FrameFeatures } from '../core/types';

const DT = 1 / 60;
const IDENTITY: ViewTransform = { offU: 0, offV: 0, sclU: 1, sclV: 1 };
const TIP_IDS = [4, 8, 12, 16, 20];

/** All 21 landmarks at `palm`, with the 5 fingertips placed explicitly. */
function makeHand(
  handedness: 'Left' | 'Right',
  palm: { x: number; y: number },
  tips?: { x: number; y: number }[],
): RawHand {
  const landmarks = Array.from({ length: 21 }, () => ({ x: palm.x, y: palm.y, z: 0 }));
  if (tips) {
    for (let t = 0; t < 5; t++) landmarks[TIP_IDS[t]] = { x: tips[t].x, y: tips[t].y, z: 0 };
  }
  return { landmarks, handedness, score: 1 };
}

/** New extractor with prediction off, so positions can be asserted exactly. */
function plainExtractor(): FeatureExtractor {
  const ex = new FeatureExtractor();
  ex.lookaheadMs = 0;
  return ex;
}

describe('FeatureExtractor', () => {
  it('mirrors landmark x when mirror is on, and only then', () => {
    const raw = [makeHand('Left', { x: 0.2, y: 0.5 })];
    // First sample passes through the filters exactly.
    const mirrored = plainExtractor().update(raw, DT, IDENTITY, true, 0);
    expect(mirrored.left.landmarks[0].x).toBeCloseTo(0.8, 12);
    const straight = plainExtractor().update(raw, DT, IDENTITY, false, 0);
    expect(straight.left.landmarks[0].x).toBeCloseTo(0.2, 12);
  });

  it('maps video coords through the cover-crop view transform', () => {
    const view: ViewTransform = { offU: 0.25, offV: 0, sclU: 0.5, sclV: 1 };
    const raw = [makeHand('Left', { x: 0.5, y: 0.3 })];
    const f = plainExtractor().update(raw, DT, view, false, 0);
    expect(f.left.landmarks[0].x).toBeCloseTo((0.5 - 0.25) / 0.5, 12);
    expect(f.left.landmarks[0].y).toBeCloseTo(0.3, 12);
  });

  it('raises presence within attackTime and holds at 1', () => {
    const ex = plainExtractor(); // attackTime 0.06s → full in 4 frames at 60fps
    const raw = [makeHand('Right', { x: 0.5, y: 0.5 })];
    const first = ex.update(raw, DT, IDENTITY, false, 0);
    expect(first.right.presence).toBeGreaterThan(0);
    expect(first.right.presence).toBeLessThan(1);
    for (let i = 0; i < 4; i++) ex.update(raw, DT, IDENTITY, false, 0);
    expect(ex.update(raw, DT, IDENTITY, false, 0).right.presence).toBe(1);
  });

  it('fades presence out over releaseTime after tracking loss', () => {
    const ex = plainExtractor(); // releaseTime 0.3s → gone in 18 frames
    const raw = [makeHand('Right', { x: 0.5, y: 0.5 })];
    for (let i = 0; i < 10; i++) ex.update(raw, DT, IDENTITY, false, 0);
    let f = ex.update([], DT, IDENTITY, false, 0);
    expect(f.right.present).toBe(false);
    expect(f.right.presence).toBeGreaterThan(0.9); // fades, not snaps
    for (let i = 0; i < 20; i++) f = ex.update([], DT, IDENTITY, false, 0);
    expect(f.right.presence).toBe(0);
  });

  it('re-acquires cleanly after a full fade-out (filters reset)', () => {
    const ex = plainExtractor();
    for (let i = 0; i < 10; i++) ex.update([makeHand('Left', { x: 0.2, y: 0.2 })], DT, IDENTITY, false, 0);
    for (let i = 0; i < 30; i++) ex.update([], DT, IDENTITY, false, 0);
    // A fresh appearance far away must not be smoothed toward the old spot.
    const f = ex.update([makeHand('Left', { x: 0.9, y: 0.9 })], DT, IDENTITY, false, 0);
    expect(f.left.landmarks[0].x).toBeCloseTo(0.9, 12);
  });

  it('computes pinch distances from the thumb to each fingertip', () => {
    const tips = [
      { x: 0.5, y: 0.5 }, // thumb
      { x: 0.5, y: 0.6 }, // index — 0.1 away
      { x: 0.5, y: 0.5 }, // middle — touching
      { x: 0.8, y: 0.5 }, // ring — 0.3 away
      { x: 0.5, y: 0.1 }, // pinky — 0.4 away
    ];
    const f = plainExtractor().update([makeHand('Left', { x: 0.5, y: 0.5 }, tips)], DT, IDENTITY, false, 0);
    expect(f.left.pinch[0]).toBeCloseTo(0.1, 12);
    expect(f.left.pinch[1]).toBeCloseTo(0, 12);
    expect(f.left.pinch[2]).toBeCloseTo(0.3, 12);
    expect(f.left.pinch[3]).toBeCloseTo(0.4, 12);
  });

  it('computes centroid and spread of the fingertips', () => {
    const tips = [
      { x: 0.4, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.5, y: 0.4 },
      { x: 0.5, y: 0.6 },
      { x: 0.5, y: 0.5 },
    ];
    const f = plainExtractor().update([makeHand('Right', { x: 0.5, y: 0.5 }, tips)], DT, IDENTITY, false, 0);
    expect(f.right.centroid.x).toBeCloseTo(0.5, 12);
    expect(f.right.centroid.y).toBeCloseTo(0.5, 12);
    expect(f.right.spread).toBeCloseTo(0.1, 12);
  });

  it('extrapolates tips by lookaheadMs while landmarks stay honest', () => {
    const ex = new FeatureExtractor(); // default lookahead 30ms
    let f: FrameFeatures | null = null;
    for (let i = 0; i < 30; i++) {
      // Steady 0.6 units/s rightward motion.
      f = ex.update([makeHand('Left', { x: 0.2 + i * 0.01, y: 0.5 })], DT, IDENTITY, false, 0);
    }
    const hand = f!.left;
    expect(hand.tipVelocities[1].x).toBeGreaterThan(0.3);
    // tips = landmark tip + velocity * lookahead, exactly.
    const lead = hand.tips[1].x - hand.landmarks[8].x;
    expect(lead).toBeCloseTo(hand.tipVelocities[1].x * 0.03, 12);
    expect(lead).toBeGreaterThan(0); // prediction leads the motion
  });

  it('tracks closer to raw input at responsiveness 1 than 0', () => {
    const calm = plainExtractor();
    const snappy = plainExtractor();
    calm.setResponsiveness(0);
    snappy.setResponsiveness(1);
    let x = 0;
    let calmF: FrameFeatures | null = null;
    let snapF: FrameFeatures | null = null;
    for (let i = 0; i < 60; i++) {
      x = 0.2 + i * 0.008;
      const raw = [makeHand('Left', { x, y: 0.5 })];
      calmF = calm.update(raw, DT, IDENTITY, false, 0);
      snapF = snappy.update(raw, DT, IDENTITY, false, 0);
    }
    const calmLag = Math.abs(x - calmF!.left.landmarks[0].x);
    const snapLag = Math.abs(x - snapF!.left.landmarks[0].x);
    expect(snapLag).toBeLessThan(calmLag);
  });

  it('measures the distance between both hands only when both are present', () => {
    const ex = plainExtractor();
    const both = ex.update(
      [makeHand('Left', { x: 0.2, y: 0.5 }), makeHand('Right', { x: 0.8, y: 0.5 })],
      DT,
      IDENTITY,
      false,
      0,
    );
    expect(both.handsDistance).toBeCloseTo(0.6, 12);
    const one = plainExtractor().update([makeHand('Left', { x: 0.2, y: 0.5 })], DT, IDENTITY, false, 0);
    expect(one.handsDistance).toBe(0);
  });
});

describe('getFeatureValue', () => {
  it('returns 0 for unknown source ids', () => {
    const f = plainExtractor().update([], DT, IDENTITY, false, 0);
    expect(getFeatureValue(f, 'no.such.source')).toBe(0);
  });

  it('scales hand height into 0..1 gated by presence', () => {
    const ex = plainExtractor();
    const raw = [makeHand('Left', { x: 0.5, y: 0.3 })];
    for (let i = 0; i < 10; i++) ex.update(raw, DT, IDENTITY, false, 0); // presence → 1
    const f = ex.update(raw, DT, IDENTITY, false, 0);
    expect(getFeatureValue(f, 'left.height')).toBeCloseTo(0.7, 6);
  });

  it('reads 0 for an absent hand (sources are presence-gated)', () => {
    const f = plainExtractor().update([], DT, IDENTITY, false, 0);
    expect(getFeatureValue(f, 'right.speed')).toBe(0);
    expect(getFeatureValue(f, 'right.spread')).toBe(0);
  });

  it('exposes audio features to the mod matrix when provided', () => {
    const audio = { level: 0.8, onset: 1, pitch: 0.5, bass: 0.3, air: 0.1 };
    const f = plainExtractor().update([], DT, IDENTITY, false, 0, audio);
    expect(getFeatureValue(f, 'audio.level')).toBe(0.8);
    expect(getFeatureValue(f, 'audio.onset')).toBe(1);
    expect(getFeatureValue(f, 'audio.pitch')).toBe(0.5);
  });

  it('reads all audio sources as 0 when no mic is attached', () => {
    const f = plainExtractor().update([], DT, IDENTITY, false, 0);
    for (const id of ['audio.level', 'audio.onset', 'audio.pitch', 'audio.bass', 'audio.air']) {
      expect(getFeatureValue(f, id), id).toBe(0);
    }
  });
});
