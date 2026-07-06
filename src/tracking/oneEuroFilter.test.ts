import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuroFilter';

const DT = 1 / 60;

describe('OneEuroFilter', () => {
  it('returns the input unchanged on the first sample', () => {
    const f = new OneEuroFilter();
    expect(f.filter(0.42, DT)).toBe(0.42);
  });

  it('passes constant input through exactly — no drift, no overshoot', () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 120; i++) out = f.filter(0.7, DT);
    expect(out).toBeCloseTo(0.7, 12);
  });

  it('converges to a step without overshooting', () => {
    const f = new OneEuroFilter();
    f.filter(0, DT);
    let prev = 0;
    let out = 0;
    for (let i = 0; i < 300; i++) {
      out = f.filter(1, DT);
      // Monotone rise, never past the target.
      expect(out).toBeGreaterThanOrEqual(prev);
      expect(out).toBeLessThanOrEqual(1);
      prev = out;
    }
    expect(out).toBeGreaterThan(0.999);
  });

  it('lags less on fast ramps when beta is higher', () => {
    const lagOnRamp = (beta: number): number => {
      const f = new OneEuroFilter(2.5, beta);
      let x = 0;
      let out = 0;
      for (let i = 0; i < 120; i++) {
        x = i * 0.02; // 1.2 units/s — a fast pluck in normalized space
        out = f.filter(x, DT);
      }
      return x - out;
    };
    expect(lagOnRamp(6)).toBeLessThan(lagOnRamp(0.5));
  });

  it('re-initializes on non-positive dt instead of dividing by zero', () => {
    const f = new OneEuroFilter();
    f.filter(0.2, DT);
    expect(f.filter(0.9, 0)).toBe(0.9);
    expect(Number.isFinite(f.filter(0.91, DT))).toBe(true);
  });

  it('reset() makes the next sample pass through exactly', () => {
    const f = new OneEuroFilter();
    for (let i = 0; i < 30; i++) f.filter(0.1, DT);
    f.reset();
    expect(f.filter(0.95, DT)).toBe(0.95);
  });

  it('setParams takes effect on subsequent samples', () => {
    const sluggish = new OneEuroFilter(0.1, 0);
    const retuned = new OneEuroFilter(0.1, 0);
    retuned.setParams(50, 50);
    sluggish.filter(0, DT);
    retuned.filter(0, DT);
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) {
      a = sluggish.filter(1, DT);
      b = retuned.filter(1, DT);
    }
    expect(b).toBeGreaterThan(a); // wider cutoff tracks the step faster
  });
});
