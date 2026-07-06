import { describe, expect, it } from 'vitest';
import {
  bandEnergy,
  detectPitchHz,
  EnvelopeFollower,
  GUITAR_LOW_E_HZ,
  OnsetDetector,
  registerFromHz,
  rms,
} from './detectors';

const SR = 48000;
const N = 2048;
const DT = 1 / 60;

/** Time-domain buffer of summed sines: [{hz, amp}, ...]. */
function tone(partials: { hz: number; amp: number }[], n = N, sr = SR): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (const p of partials) buf[i] += p.amp * Math.sin((2 * Math.PI * p.hz * i) / sr);
  }
  return buf;
}

/** Deterministic pseudo-random noise buffer. */
function noise(n = N, amp = 0.5): Float32Array {
  const buf = new Float32Array(n);
  let seed = 1234567;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = amp * ((seed / 0x7fffffff) * 2 - 1);
  }
  return buf;
}

describe('rms', () => {
  it('measures a sine of amplitude A as A/√2', () => {
    expect(rms(tone([{ hz: 440, amp: 0.8 }]))).toBeCloseTo(0.8 / Math.SQRT2, 2);
  });

  it('is 0 for silence and tolerates empty buffers', () => {
    expect(rms(new Float32Array(N))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe('EnvelopeFollower', () => {
  it('attacks fast and releases slow', () => {
    const env = new EnvelopeFollower(0.015, 0.25);
    env.update(1, 0.03); // two attack constants of time
    const afterAttack = env.value;
    expect(afterAttack).toBeGreaterThan(0.8);
    env.update(0, 0.03); // same wall time falling
    expect(env.value).toBeGreaterThan(afterAttack * 0.8); // barely moved
  });

  it('converges to a held target', () => {
    const env = new EnvelopeFollower();
    for (let i = 0; i < 300; i++) env.update(0.6, DT);
    expect(env.value).toBeCloseTo(0.6, 3);
  });
});

describe('OnsetDetector', () => {
  const flat = (level: number) => new Float32Array(512).fill(level);

  function settle(det: OnsetDetector, frames = 30, level = 0.05): void {
    for (let i = 0; i < frames; i++) det.update(flat(level), DT);
  }

  it('fires on a sudden spectral rise and decays afterwards', () => {
    const det = new OnsetDetector();
    settle(det);
    expect(det.update(flat(0.5), DT)).toBe(1); // the pluck
    const after = det.update(flat(0.5), DT); // sustain: flux back to 0
    expect(after).toBeLessThan(1);
    expect(after).toBeGreaterThan(0.5);
    for (let i = 0; i < 60; i++) det.update(flat(0.5), DT);
    expect(det.envelope).toBeLessThan(0.01); // rung out
  });

  it('does not fire on steady sound or silence', () => {
    const det = new OnsetDetector();
    settle(det, 60, 0.3);
    expect(det.envelope).toBe(0);
    const silent = new OnsetDetector();
    settle(silent, 60, 0);
    expect(silent.envelope).toBe(0);
  });

  it('fires again for a second, separated attack', () => {
    const det = new OnsetDetector();
    settle(det);
    det.update(flat(0.5), DT);
    for (let i = 0; i < 40; i++) det.update(flat(0.05), DT); // back to quiet
    expect(det.envelope).toBeLessThan(0.02);
    expect(det.update(flat(0.5), DT)).toBe(1);
  });

  it('ignores re-triggers inside the refractory window', () => {
    const det = new OnsetDetector();
    settle(det);
    det.update(flat(0.4), DT); // trigger at t
    det.update(flat(0.05), DT); // dip
    const v = det.update(flat(0.8), DT); // 2 frames = 33ms < 60ms refractory
    expect(v).toBeLessThan(1);
  });

  it('needs warm-up history before it can trigger (no cold-start pops)', () => {
    const det = new OnsetDetector();
    det.update(flat(0.05), DT);
    expect(det.update(flat(0.9), DT)).toBe(0);
  });
});

describe('detectPitchHz', () => {
  it('finds pure tones across the guitar range within 1%', () => {
    for (const hz of [82.41, 110, 196, 329.63, 440, 1318.5]) {
      const found = detectPitchHz(tone([{ hz, amp: 0.5 }]), SR);
      expect(Math.abs(found - hz) / hz, `${hz} Hz`).toBeLessThan(0.01);
    }
  });

  it('finds the fundamental of a harmonic-rich pluck, not an octave error', () => {
    const found = detectPitchHz(
      tone([
        { hz: 196, amp: 0.5 },
        { hz: 392, amp: 0.3 },
        { hz: 588, amp: 0.2 },
        { hz: 784, amp: 0.1 },
      ]),
      SR,
    );
    expect(Math.abs(found - 196) / 196).toBeLessThan(0.02);
  });

  it('returns 0 for silence', () => {
    expect(detectPitchHz(new Float32Array(N), SR)).toBe(0);
  });

  it('returns 0 for noise (no false pitch on percussive scratch)', () => {
    expect(detectPitchHz(noise(), SR)).toBe(0);
  });
});

describe('registerFromHz', () => {
  it('spans the guitar: E2 → 0, E4 → 0.5, E6 → 1', () => {
    expect(registerFromHz(GUITAR_LOW_E_HZ)).toBe(0);
    expect(registerFromHz(GUITAR_LOW_E_HZ * 4)).toBeCloseTo(0.5, 6);
    expect(registerFromHz(GUITAR_LOW_E_HZ * 16)).toBeCloseTo(1, 6);
  });

  it('clamps outside the range and handles no-pitch', () => {
    expect(registerFromHz(40)).toBe(0);
    expect(registerFromHz(8000)).toBe(1);
    expect(registerFromHz(0)).toBe(0);
  });
});

describe('bandEnergy', () => {
  it('reads only the bins inside the band', () => {
    const spectrum = new Float32Array(1024); // fftSize 2048 → bin ≈ 23.4 Hz
    for (let i = 3; i <= 10; i++) spectrum[i] = 1; // ~70–235 Hz
    expect(bandEnergy(spectrum, SR, 2048, 60, 250)).toBeGreaterThan(0.7);
    expect(bandEnergy(spectrum, SR, 2048, 4000, 12000)).toBe(0);
  });

  it('returns 0 for degenerate bands', () => {
    expect(bandEnergy(new Float32Array(1024), SR, 2048, 300, 100)).toBe(0);
  });
});
