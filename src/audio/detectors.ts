/**
 * Pure audio feature detectors — raw arrays and a sample rate in, numbers
 * out. No Web Audio objects anywhere, so everything here is unit-tested
 * against synthesized buffers (audioEngine.ts owns the browser plumbing).
 *
 * First principles: for driving visuals from a guitar we care about
 *   energy  — how hard the strings are worked   → RMS + envelope follower
 *   attack  — the instant a note starts          → positive spectral flux
 *   register— how high the note sits             → autocorrelation pitch
 *   timbre  — warmth vs sparkle                  → band energies
 */

/** Root mean square of a time-domain buffer (a sine of amplitude A → A/√2). */
export function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / (buf.length || 1));
}

/**
 * Asymmetric envelope follower: rises with the fast attack constant, falls
 * with the slow release — level jumps on a pluck, then rings out the way
 * the string does instead of flickering with the waveform.
 */
export class EnvelopeFollower {
  value = 0;

  constructor(
    private attack = 0.015,
    private release = 0.25,
  ) {}

  update(target: number, dt: number): number {
    const tau = target > this.value ? this.attack : this.release;
    this.value += (target - this.value) * (1 - Math.exp(-dt / tau));
    return this.value;
  }
}

/**
 * Note-attack detector: positive spectral flux (only energy *increases*
 * count — a note dying away is not an attack) compared against an adaptive
 * threshold built from recent flux statistics, so it self-calibrates to
 * playing intensity and room noise. On a hit, `envelope` snaps to 1 and
 * decays exponentially — ready to route straight to a visual param.
 */
export class OnsetDetector {
  /** The decaying 0..1 pluck envelope. */
  envelope = 0;

  private prev: Float32Array | null = null;
  private history: number[] = [];
  private sinceOnset = 1;

  constructor(
    /** Flux frames kept for the adaptive threshold (~0.7s at 60fps). */
    private historySize = 43,
    /** Ignore re-triggers within this many seconds (double-hit guard). */
    private refractory = 0.06,
    /** Envelope decay time constant, seconds. */
    private decayTau = 0.12,
  ) {}

  /** `spectrum` is normalized magnitudes 0..1; call once per frame. */
  update(spectrum: Float32Array, dt: number, sensitivity = 1): number {
    let flux = 0;
    if (this.prev && this.prev.length === spectrum.length) {
      for (let i = 0; i < spectrum.length; i++) {
        const d = spectrum[i] - this.prev[i];
        if (d > 0) flux += d;
      }
      flux /= spectrum.length;
    } else {
      this.prev = new Float32Array(spectrum.length);
    }
    this.prev.set(spectrum);

    // Threshold = mean + spread of recent flux, plus an absolute floor so
    // silence never triggers. Higher sensitivity lowers both.
    const h = this.history;
    let mean = 0;
    for (const v of h) mean += v;
    mean /= h.length || 1;
    let variance = 0;
    for (const v of h) variance += (v - mean) * (v - mean);
    variance /= h.length || 1;
    const threshold = mean + (1.5 * Math.sqrt(variance) + 0.005) / Math.max(0.01, sensitivity);

    this.sinceOnset += dt;
    if (h.length >= 8 && flux > threshold && this.sinceOnset >= this.refractory) {
      this.envelope = 1;
      this.sinceOnset = 0;
    } else {
      this.envelope *= Math.exp(-dt / this.decayTau);
      if (this.envelope < 1e-3) this.envelope = 0;
    }

    h.push(flux);
    if (h.length > this.historySize) h.shift();
    return this.envelope;
  }
}

/**
 * Fundamental frequency via normalized autocorrelation with parabolic peak
 * interpolation. Picks the *shortest* strong lag (≥90% of the best) to avoid
 * octave-down errors on harmonic-rich guitar tones. Returns 0 when the
 * buffer is too quiet or too noise-like to carry a pitch.
 */
export function detectPitchHz(
  buf: Float32Array,
  sampleRate: number,
  minHz = 70,
  maxHz = 1400,
): number {
  const n = buf.length;
  if (rms(buf) < 0.01) return 0;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minHz));
  if (maxLag <= minLag) return 0;

  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let num = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < n - lag; i++) {
      num += buf[i] * buf[i + lag];
      e1 += buf[i] * buf[i];
      e2 += buf[i + lag] * buf[i + lag];
    }
    corr[lag] = num / (Math.sqrt(e1 * e2) || 1);
  }

  let maxCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) maxCorr = Math.max(maxCorr, corr[lag]);
  if (maxCorr < 0.5) return 0; // unvoiced / noise

  let peak = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (corr[lag] >= 0.9 * maxCorr && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      peak = lag;
      break;
    }
  }
  if (peak === 0) return 0;

  const a = corr[peak - 1];
  const b = corr[peak];
  const c = corr[peak + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return sampleRate / (peak + shift);
}

/** Open low E — the bottom of a standard-tuned guitar. */
export const GUITAR_LOW_E_HZ = 82.407;

/** Maps a frequency onto the guitar's register: E2 → 0 … E6 → 1, log scale. */
export function registerFromHz(hz: number): number {
  if (hz <= 0) return 0;
  const octaves = Math.log2(hz / GUITAR_LOW_E_HZ);
  return Math.max(0, Math.min(1, octaves / 4));
}

/** Mean normalized magnitude of the FFT bins covering loHz..hiHz. */
export function bandEnergy(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
  loHz: number,
  hiHz: number,
): number {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(0, Math.floor(loHz / binHz));
  const hi = Math.min(spectrum.length - 1, Math.ceil(hiHz / binHz));
  if (hi < lo) return 0;
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += spectrum[i];
  return sum / (hi - lo + 1);
}
