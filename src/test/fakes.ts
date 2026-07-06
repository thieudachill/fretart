/** Shared test doubles — kept here so tests stay about behavior, not setup. */
import { EffectBase } from '../effects/Effect';
import { zeroAudio, type FrameFeatures, type HandFeatures, type Vec2 } from '../core/types';

/** Minimal concrete effect: two params, no rendering. */
export class FakeEffect extends EffectBase {
  readonly id: string;
  readonly label: string;

  constructor(id = 'fx', label = 'Fake FX') {
    super();
    this.id = id;
    this.label = label;
    this.paramDefs = [
      { key: 'amt', label: 'Amount', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'size', label: 'Size', min: -1, max: 1, step: 0.01, default: 0 },
    ];
    this.initDefaults();
  }

  render(): void {}

  /** Test window into the protected effective-value accessor. */
  effective(key: string): number {
    return this.p(key);
  }
}

function emptyHand(): HandFeatures {
  const zero = (): Vec2 => ({ x: 0, y: 0 });
  return {
    present: false,
    presence: 0,
    landmarks: Array.from({ length: 21 }, zero),
    tips: Array.from({ length: 5 }, zero),
    tipVelocities: Array.from({ length: 5 }, zero),
    tipSpeeds: [0, 0, 0, 0, 0],
    pinch: [0, 0, 0, 0],
    spread: 0,
    centroid: zero(),
    speed: 0,
  };
}

/** A silent frame; override just the signals a test cares about. */
export function makeFeatures(mutate?: (f: FrameFeatures) => void): FrameFeatures {
  const f: FrameFeatures = {
    left: emptyHand(),
    right: emptyHand(),
    handsDistance: 0,
    anyPresence: 0,
    audio: zeroAudio(),
    time: 0,
  };
  mutate?.(f);
  return f;
}
