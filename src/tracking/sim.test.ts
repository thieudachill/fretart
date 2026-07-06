import { describe, expect, it } from 'vitest';
import { SimPlayer, synthHands, type SimFixture } from './sim';
import type { RawHand } from './handTracker';

describe('synthHands', () => {
  it('produces both hands with full 21-landmark skeletons', () => {
    const hands = synthHands(1.5);
    expect(hands).toHaveLength(2);
    expect(hands.map((h) => h.handedness).sort()).toEqual(['Left', 'Right']);
    for (const h of hands) expect(h.landmarks).toHaveLength(21);
  });

  it('stays inside the video frame over a long session', () => {
    for (let t = 0; t < 60; t += 0.21) {
      for (const h of synthHands(t)) {
        for (const l of h.landmarks) {
          expect(l.x).toBeGreaterThan(0);
          expect(l.x).toBeLessThan(1);
          expect(l.y).toBeGreaterThan(0);
          expect(l.y).toBeLessThan(1);
        }
      }
    }
  });

  it('is a pure function of time (deterministic replays)', () => {
    expect(synthHands(7.32)).toEqual(synthHands(7.32));
  });

  it('actually moves — consecutive frames differ', () => {
    const a = synthHands(1.0)[1].landmarks[8];
    const b = synthHands(1.2)[1].landmarks[8];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1e-4);
  });
});

describe('SimPlayer', () => {
  const hand = (x: number): RawHand => ({
    handedness: 'Left',
    score: 1,
    landmarks: Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 })),
  });
  const fixture: SimFixture = {
    version: 1,
    frames: [
      { t: 0, hands: [hand(0.1)] },
      { t: 1, hands: [hand(0.2)] },
      { t: 2, hands: [hand(0.3)] },
    ],
  };

  it('replays the frame at or after the requested time', () => {
    const player = new SimPlayer(fixture);
    expect(player.at(0)[0].landmarks[0].x).toBe(0.1);
    expect(player.at(0.5)[0].landmarks[0].x).toBe(0.2);
    expect(player.at(1.7)[0].landmarks[0].x).toBe(0.3);
  });

  it('loops when time runs past the fixture duration', () => {
    const player = new SimPlayer(fixture);
    expect(player.at(2.5)[0].landmarks[0].x).toBe(player.at(0.5)[0].landmarks[0].x);
  });

  it('falls back to the synthetic player without a fixture', () => {
    const player = new SimPlayer(null);
    expect(player.at(3.1)).toEqual(synthHands(3.1));
  });
});
