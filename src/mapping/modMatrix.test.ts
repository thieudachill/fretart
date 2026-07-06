import { beforeEach, describe, expect, it } from 'vitest';
import { ModMatrix } from './modMatrix';
import { FakeEffect, makeFeatures } from '../test/fakes';

// left.speed source = softClamp(speed, 0.35) * presence; speed 0.35 → 0.5.
const halfSignal = makeFeatures((f) => {
  f.left.presence = 1;
  f.left.speed = 0.35;
});

describe('ModMatrix', () => {
  let matrix: ModMatrix;
  let fx: FakeEffect;

  beforeEach(() => {
    matrix = new ModMatrix();
    matrix.routings = [
      { enabled: true, source: 'left.speed', target: 'fx.amt', amount: 0.5 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ];
    fx = new FakeEffect();
  });

  it('adds amount × range × signal on top of the base value', () => {
    matrix.apply([fx], halfSignal);
    // 0.5 (amount) × 2 (range of amt) × 0.5 (signal) = 0.5 offset over base 1.
    expect(fx.modOffsets.amt).toBeCloseTo(0.5, 12);
    expect(fx.effective('amt')).toBeCloseTo(1.5, 12);
  });

  it('never mutates the slider base values', () => {
    matrix.apply([fx], halfSignal);
    expect(fx.values.amt).toBe(1);
  });

  it('clamps the effective value to the param range', () => {
    matrix.routings[0].amount = 1;
    const fullSignal = makeFeatures((f) => {
      f.left.presence = 1;
      f.left.speed = 1000; // softClamp → ~1
    });
    matrix.apply([fx], fullSignal);
    expect(fx.effective('amt')).toBe(2); // base 1 + ~2 offset, clamped to max
  });

  it('supports negative amounts (inverse modulation)', () => {
    matrix.routings[0].amount = -0.5;
    matrix.apply([fx], halfSignal);
    expect(fx.effective('amt')).toBeCloseTo(0.5, 12);
  });

  it('accumulates multiple routings into the same target', () => {
    matrix.routings[1] = { enabled: true, source: 'left.speed', target: 'fx.amt', amount: 0.5 };
    matrix.apply([fx], halfSignal);
    expect(fx.modOffsets.amt).toBeCloseTo(1.0, 12);
  });

  it('clears stale offsets on every apply', () => {
    matrix.apply([fx], halfSignal);
    expect(fx.modOffsets.amt).not.toBe(0);
    matrix.apply([fx], makeFeatures()); // silence
    expect(fx.modOffsets.amt ?? 0).toBe(0);
    expect(fx.effective('amt')).toBe(1);
  });

  it('ignores disabled routings', () => {
    matrix.routings[0].enabled = false;
    matrix.apply([fx], halfSignal);
    expect(fx.modOffsets).toEqual({});
  });

  it('tolerates targets pointing at unknown effects or params', () => {
    matrix.routings[0].target = 'ghost.amt';
    matrix.routings[1] = { enabled: true, source: 'left.speed', target: 'fx.ghost', amount: 1 };
    matrix.routings[2] = { enabled: true, source: 'left.speed', target: 'malformed', amount: 1 };
    expect(() => matrix.apply([fx], halfSignal)).not.toThrow();
    expect(fx.modOffsets).toEqual({});
  });

  it('lists every effect param as a routable target', () => {
    const options = ModMatrix.targetOptions([fx]);
    expect(options['Fake FX: Amount']).toBe('fx.amt');
    expect(options['Fake FX: Size']).toBe('fx.size');
    expect(options['— none —']).toBe('');
  });
});
