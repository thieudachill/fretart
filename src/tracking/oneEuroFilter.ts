/**
 * One Euro filter (Casiez et al. 2012) — adaptive low-pass that kills jitter
 * at low speeds while staying responsive to fast motion. The standard choice
 * for landmark smoothing.
 */
export class OneEuroFilter {
  private xPrev = 0;
  private dxPrev = 0;
  private initialized = false;

  // Coordinates are normalized 0..1, so fingertip speeds run ~0.5-5 units/s
  // during playing; beta must be O(1-10) in these units for the cutoff to
  // actually open up on fast motion (a pixel-space beta like 0.03 keeps the
  // filter permanently sluggish, ~100ms behind a fast pluck).
  constructor(
    private minCutoff = 2.5,
    private beta = 6.0,
    private dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, dt: number): number {
    if (!this.initialized || dt <= 0) {
      this.initialized = true;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }

  setParams(minCutoff: number, beta: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  reset(): void {
    this.initialized = false;
  }
}
