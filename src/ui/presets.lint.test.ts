/**
 * Preset lint: every built-in preset must reference only things that exist —
 * real effect ids, real param keys within their ranges, real feature sources,
 * real palettes and categories. This is the test that catches a contributor
 * preset with a typo'd key before it silently falls back to defaults at
 * runtime. Effects are safe to instantiate here: constructors only build
 * paramDefs and CPU-side objects, no WebGL context is touched until init().
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_PRESETS, PRESET_CATEGORIES, categoryOf } from './presets';
import { PALETTES } from '../core/types';
import { FEATURE_SOURCES } from '../tracking/features';
import { ROUTING_SLOTS } from '../mapping/modMatrix';
import { RisoCollageEffect } from '../effects/risoCollage';
import { FingerShapesEffect } from '../effects/fingerShapes';
import { FacetFoldEffect } from '../effects/facetFold';
import { StringLinesEffect } from '../effects/stringLines';
import { ParticleTrailsEffect } from '../effects/particleTrails';
import { MotionEchoEffect } from '../effects/motionEcho';

const effects = [
  new RisoCollageEffect(),
  new FingerShapesEffect(),
  new FacetFoldEffect(),
  new StringLinesEffect(),
  new ParticleTrailsEffect(),
  new MotionEchoEffect(),
];
const paramsByEffect = new Map(effects.map((e) => [e.id, new Map(e.paramDefs.map((d) => [d.key, d]))]));
const sourceIds = new Set(FEATURE_SOURCES.map((s) => s.id));

const entries = Object.entries(BUILT_IN_PRESETS);

describe('built-in preset lint', () => {
  it('ships at least 20 presets with every category represented', () => {
    expect(entries.length).toBeGreaterThanOrEqual(20);
    const seen = new Set(entries.map(([, p]) => categoryOf(p)));
    for (const cat of PRESET_CATEGORIES) expect(seen, `category "${cat}" is empty`).toContain(cat);
  });

  it.each(entries)('%s declares a valid category and description', (_name, preset) => {
    expect(PRESET_CATEGORIES).toContain(preset.category);
    expect(preset.description, 'built-ins need a description for UI tooltips').toBeTruthy();
  });

  it.each(entries)('%s uses a palette that exists', (_name, preset) => {
    const i = preset.global.paletteIndex;
    expect(Number.isInteger(i)).toBe(true);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(PALETTES.length);
  });

  it.each(entries)('%s only references real effects, params, and in-range values', (_name, preset) => {
    for (const [effectId, saved] of Object.entries(preset.effects)) {
      const defs = paramsByEffect.get(effectId);
      expect(defs, `unknown effect "${effectId}"`).toBeDefined();
      for (const [key, value] of Object.entries(saved.values)) {
        const def = defs!.get(key);
        expect(def, `unknown param "${effectId}.${key}"`).toBeDefined();
        expect(value, `${effectId}.${key} below min`).toBeGreaterThanOrEqual(def!.min);
        expect(value, `${effectId}.${key} above max`).toBeLessThanOrEqual(def!.max);
      }
    }
  });

  it.each(entries)('%s routes only real sources to real targets', (_name, preset) => {
    expect(preset.routings.length).toBeLessThanOrEqual(ROUTING_SLOTS);
    for (const r of preset.routings) {
      if (!r.enabled) continue;
      expect(sourceIds.has(r.source), `unknown source "${r.source}"`).toBe(true);
      const dot = r.target.indexOf('.');
      expect(dot, `malformed target "${r.target}"`).toBeGreaterThan(0);
      const def = paramsByEffect.get(r.target.slice(0, dot))?.get(r.target.slice(dot + 1));
      expect(def, `unknown target "${r.target}"`).toBeDefined();
      expect(Math.abs(r.amount), 'routing amount outside -1..1').toBeLessThanOrEqual(1);
    }
  });

  it('Audio Reactive presets actually route sound', () => {
    for (const [name, preset] of entries) {
      if (categoryOf(preset) !== 'Audio Reactive') continue;
      const audioRouted = preset.routings.some((r) => r.enabled && r.source.startsWith('audio.'));
      expect(audioRouted, `${name} has no enabled audio.* routing`).toBe(true);
    }
  });
});
