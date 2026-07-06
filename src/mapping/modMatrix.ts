import type { FrameFeatures } from '../core/types';
import { getFeatureValue } from '../tracking/features';
import type { EffectBase } from '../effects/Effect';

export interface Routing {
  enabled: boolean;
  /** Feature source id from FEATURE_SOURCES ('' = none). */
  source: string;
  /** Target as '<effectId>.<paramKey>' ('' = none). */
  target: string;
  /** -1..1 — scaled by the target param's full range. */
  amount: number;
}

export const ROUTING_SLOTS = 4;

/**
 * Routes hand-feature signals into effect parameters as additive offsets on
 * top of the UI slider base values. Slider positions are never overwritten,
 * so manual control and finger-driven modulation coexist.
 */
export class ModMatrix {
  routings: Routing[] = [
    { enabled: true, source: 'right.speed', target: 'particles.rate', amount: 0.4 },
    { enabled: true, source: 'left.spread', target: 'riso.dotScale', amount: 0.35 },
    { enabled: false, source: 'hands.distance', target: 'echo.persist', amount: 0.3 },
    { enabled: false, source: 'left.speed', target: 'strings.vibration', amount: 0.5 },
  ];

  apply(effects: EffectBase[], features: FrameFeatures): void {
    for (const effect of effects) effect.modOffsets = {};
    for (const r of this.routings) {
      if (!r.enabled || !r.source || !r.target) continue;
      const dot = r.target.indexOf('.');
      if (dot < 0) continue;
      const effectId = r.target.slice(0, dot);
      const paramKey = r.target.slice(dot + 1);
      const effect = effects.find((e) => e.id === effectId);
      const def = effect?.paramDefs.find((d) => d.key === paramKey);
      if (!effect || !def) continue;
      const signal = getFeatureValue(features, r.source);
      effect.modOffsets[paramKey] =
        (effect.modOffsets[paramKey] ?? 0) + r.amount * (def.max - def.min) * signal;
    }
  }

  /** All routable targets, for the UI dropdowns. */
  static targetOptions(effects: EffectBase[]): Record<string, string> {
    const options: Record<string, string> = { '— none —': '' };
    for (const effect of effects) {
      for (const def of effect.paramDefs) {
        options[`${effect.label}: ${def.label}`] = `${effect.id}.${def.key}`;
      }
    }
    return options;
  }
}
