import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  centroid,
  foldQuad,
  keyLightShade,
  maxRadius,
  sampleClosedCatmullRom,
  sortAroundCentroid,
} from './geometry';

describe('centroid', () => {
  it('is the mean of the points', () => {
    const c = centroid([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(c.x).toBeCloseTo(0.5, 12);
    expect(c.y).toBeCloseTo(0.5, 12);
  });

  it('tolerates an empty list', () => {
    expect(centroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe('sortAroundCentroid', () => {
  it('orders shuffled square corners into a simple polygon', () => {
    const tl = { x: 0, y: 0 };
    const tr = { x: 1, y: 0 };
    const br = { x: 1, y: 1 };
    const bl = { x: 0, y: 1 };
    // atan2 ascends from -π, so in y-down space the walk starts upper-left.
    expect(sortAroundCentroid([br, tl, bl, tr])).toEqual([tl, tr, br, bl]);
  });

  it('returns the same point objects, not copies', () => {
    const pts = [
      { x: 0.4, y: 0.1 },
      { x: 0.9, y: 0.5 },
      { x: 0.2, y: 0.8 },
    ];
    const sorted = sortAroundCentroid(pts);
    for (const p of sorted) expect(pts).toContain(p);
    expect(sorted).toHaveLength(3);
  });

  it('does not mutate the input array', () => {
    const pts = [
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ];
    const before = [...pts];
    sortAroundCentroid(pts);
    expect(pts).toEqual(before);
  });
});

describe('maxRadius', () => {
  it('finds the farthest point from the centroid', () => {
    const pts = [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.9 }, // 0.4 away
      { x: 0.6, y: 0.5 }, // 0.1 away
    ];
    expect(maxRadius(pts, { x: 0.5, y: 0.5 })).toBeCloseTo(0.4, 12);
  });

  it('is 0 for coincident points', () => {
    expect(maxRadius([{ x: 0.3, y: 0.3 }])).toBe(0);
  });
});

describe('foldQuad', () => {
  // A kite: diagonal 0-2 is short (vertical), 1-3 is long (horizontal).
  const kite = [
    { x: 0.5, y: 0.4 },
    { x: 0.9, y: 0.5 },
    { x: 0.5, y: 0.6 },
    { x: 0.1, y: 0.5 },
  ];

  it('puts the shorter diagonal at a—c', () => {
    const [a, , c] = foldQuad(kite);
    expect(a).toBe(kite[0]);
    expect(c).toBe(kite[2]);
  });

  it('rotates the quad when the other diagonal is shorter', () => {
    const rotated = [kite[1], kite[2], kite[3], kite[0]]; // now 1-3 is short
    const [a, b, c, d] = foldQuad(rotated);
    expect(a).toBe(kite[2]);
    expect(c).toBe(kite[0]);
    // Still the same cycle, just re-anchored.
    expect(b).toBe(kite[3]);
    expect(d).toBe(kite[1]);
  });
});

describe('keyLightShade', () => {
  const flat = [
    { x: 0.2, y: 0.2, z: 0 },
    { x: 0.8, y: 0.2, z: 0 },
    { x: 0.5, y: 0.8, z: 0 },
  ];

  it('gives a flat facet the straight-out lighting value', () => {
    // Normal (0,0,1) → d = 0.7 → (0.7+1)/2 = 0.85.
    expect(keyLightShade(flat, 16 / 9)).toBeCloseTo(0.85, 12);
  });

  it('is independent of triangle winding', () => {
    const reversed = [flat[2], flat[1], flat[0]];
    expect(keyLightShade(reversed, 16 / 9)).toBeCloseTo(keyLightShade(flat, 16 / 9), 12);
  });

  it('lights facets tilted toward the upper-left more than away', () => {
    // Lift the right edge: normal tips toward the light (upper-left).
    const towardLight = [
      { x: 0.2, y: 0.2, z: 0 },
      { x: 0.8, y: 0.2, z: 0.3 },
      { x: 0.8, y: 0.8, z: 0.3 },
    ];
    // Lift the left edge: normal tips away from the light.
    const awayFromLight = [
      { x: 0.2, y: 0.2, z: 0.3 },
      { x: 0.8, y: 0.2, z: 0 },
      { x: 0.8, y: 0.8, z: 0 },
    ];
    const a = keyLightShade(towardLight, 16 / 9);
    const b = keyLightShade(awayFromLight, 16 / 9);
    expect(a).toBeGreaterThan(0.85);
    expect(b).toBeLessThan(0.85);
  });

  it('stays clamped to 0..1', () => {
    for (const tri of [flat, [flat[0], { x: 0.2, y: 0.9, z: 2 }, flat[2]]]) {
      const s = keyLightShade(tri, 1);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('sampleClosedCatmullRom', () => {
  // Deterministic pseudo-random points (mulberry32) — no test flakiness.
  const rand = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('matches three.js CatmullRomCurve3 exactly (the code it replaced)', () => {
    const r = rand(42);
    for (const n of [3, 5, 8, 10]) {
      const points = Array.from({ length: n }, () => ({ x: r(), y: r() }));
      for (const tension of [0.1, 0.45, 0.8]) {
        const curve = new THREE.CatmullRomCurve3(
          points.map((p) => new THREE.Vector3(p.x, p.y, 0)),
          true,
          'catmullrom',
          tension,
        );
        const expected = curve.getPoints(95); // 96 points, as the effect uses
        const actual = sampleClosedCatmullRom(points, 96, tension);
        expect(actual).toHaveLength(expected.length);
        for (let i = 0; i < actual.length; i++) {
          expect(actual[i].x).toBeCloseTo(expected[i].x, 10);
          expect(actual[i].y).toBeCloseTo(expected[i].y, 10);
        }
      }
    }
  });

  it('closes the loop: last sample equals the first control point', () => {
    const points = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.2 },
      { x: 0.5, y: 0.9 },
    ];
    const s = sampleClosedCatmullRom(points, 32, 0.5);
    expect(s[0].x).toBeCloseTo(points[0].x, 12);
    expect(s[0].y).toBeCloseTo(points[0].y, 12);
    expect(s[s.length - 1].x).toBeCloseTo(points[0].x, 12);
    expect(s[s.length - 1].y).toBeCloseTo(points[0].y, 12);
  });
});
