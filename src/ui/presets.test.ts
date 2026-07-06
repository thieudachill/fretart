import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_PRESETS,
  FALLBACK_CATEGORY,
  PRESET_CATEGORIES,
  PresetStore,
  categoryOf,
  type PresetData,
} from './presets';
import { ModMatrix } from '../mapping/modMatrix';
import { FakeEffect } from '../test/fakes';
import type { Engine } from '../core/engine';

/** The slice of Engine that PresetStore actually touches. */
function makeEngine(effects: FakeEffect[]): Engine {
  return {
    effects,
    mirror: true,
    videoOpacity: 1,
    paletteIndex: 0,
    setPalette(this: { paletteIndex: number }, i: number) {
      this.paletteIndex = i;
    },
  } as unknown as Engine;
}

describe('PresetStore', () => {
  let fxA: FakeEffect;
  let fxB: FakeEffect;
  let engine: Engine;
  let matrix: ModMatrix;
  let store: PresetStore;

  beforeEach(() => {
    localStorage.clear();
    fxA = new FakeEffect('alpha', 'Alpha');
    fxB = new FakeEffect('beta', 'Beta');
    engine = makeEngine([fxA, fxB]);
    matrix = new ModMatrix();
    store = new PresetStore(engine, matrix);
  });

  it('captures a full snapshot decoupled from live state', () => {
    fxA.enabled = true;
    fxA.values.amt = 1.5;
    const snap = store.capture();
    fxA.values.amt = 0.2; // later edits must not leak into the snapshot
    matrix.routings[0].amount = -1;
    expect(snap.effects.alpha.values.amt).toBe(1.5);
    expect(snap.routings[0].amount).not.toBe(-1);
  });

  it('round-trips through JSON without loss', () => {
    fxA.enabled = true;
    fxA.values.amt = 1.25;
    engine.videoOpacity = 0.5;
    const snap = store.capture();
    fxA.enabled = false;
    fxA.values.amt = 0;
    engine.videoOpacity = 1;
    store.apply(JSON.parse(JSON.stringify(snap)) as PresetData);
    expect(fxA.enabled).toBe(true);
    expect(fxA.values.amt).toBe(1.25);
    expect(engine.videoOpacity).toBe(0.5);
  });

  it('treats a preset as a full snapshot: unmentioned effects turn off and reset', () => {
    fxB.enabled = true;
    fxB.values.amt = 1.9;
    const onlyA: PresetData = {
      global: { mirror: false, videoOpacity: 1, paletteIndex: 2 },
      effects: { alpha: { enabled: true, values: { amt: 0.5 } } },
      routings: [],
    };
    store.apply(onlyA);
    expect(fxB.enabled).toBe(false);
    expect(fxB.values.amt).toBe(1); // back to the param default
    expect(engine.mirror).toBe(false);
    expect(engine.paletteIndex).toBe(2);
  });

  it('fills missing params with defaults and ignores unknown ones', () => {
    const sparse: PresetData = {
      global: { mirror: true, videoOpacity: 1, paletteIndex: 0 },
      effects: { alpha: { enabled: true, values: { size: 0.5, ghost: 9 } } },
      routings: [],
    };
    fxA.values.amt = 1.7;
    store.apply(sparse);
    expect(fxA.values.amt).toBe(1); // unmentioned param → default
    expect(fxA.values.size).toBe(0.5);
    expect(fxA.values.ghost).toBeUndefined();
  });

  it('tolerates presets naming effects this build does not have', () => {
    const alien: PresetData = {
      global: { mirror: true, videoOpacity: 1, paletteIndex: 0 },
      effects: { warp: { enabled: true, values: { x: 1 } } },
      routings: [],
    };
    expect(() => store.apply(alien)).not.toThrow();
  });

  it('overwrites only the routing slots a preset provides', () => {
    const original = { ...matrix.routings[2] };
    store.apply({
      global: { mirror: true, videoOpacity: 1, paletteIndex: 0 },
      effects: {},
      routings: [{ enabled: true, source: 'left.speed', target: 'alpha.amt', amount: 0.9 }],
    });
    expect(matrix.routings[0].amount).toBe(0.9);
    expect(matrix.routings[2]).toEqual(original);
  });

  it('saves, lists, loads, and deletes user presets in localStorage', () => {
    fxA.enabled = true;
    fxA.values.amt = 0.75;
    store.save('My Look');
    expect(store.listNames()).toContain('My Look');

    fxA.enabled = false;
    fxA.values.amt = 1;
    expect(store.load('My Look')).toBe(true);
    expect(fxA.enabled).toBe(true);
    expect(fxA.values.amt).toBe(0.75);

    store.delete('My Look');
    expect(store.listNames()).not.toContain('My Look');
  });

  it('returns false for unknown preset names', () => {
    expect(store.load('does not exist')).toBe(false);
  });

  it('remembers the current preset name for recordings, ignoring failed loads', () => {
    expect(store.currentName).toBe('');
    store.save('My Look');
    expect(store.currentName).toBe('My Look');
    store.load('does not exist');
    expect(store.currentName).toBe('My Look'); // a failed load changes nothing
    const builtIn = Object.keys(BUILT_IN_PRESETS)[0];
    store.load(builtIn);
    expect(store.currentName).toBe(builtIn);
  });

  it('survives corrupted localStorage', () => {
    localStorage.setItem('fretart.presets.v1', '{not json');
    expect(store.listNames()).toEqual(Object.keys(BUILT_IN_PRESETS));
    expect(() => store.save('Fresh')).not.toThrow();
    expect(store.listNames()).toContain('Fresh');
  });

  it('applies every built-in preset without throwing', () => {
    for (const name of Object.keys(BUILT_IN_PRESETS)) {
      expect(store.load(name), name).toBe(true);
    }
  });

  // ---- Schema v2: categories ----

  it('tolerates v1 preset data with no category (old export files)', () => {
    const v1: PresetData = {
      global: { mirror: true, videoOpacity: 1, paletteIndex: 0 },
      effects: { alpha: { enabled: true, values: { amt: 0.5 } } },
      routings: [],
    };
    expect(() => store.apply(v1)).not.toThrow();
    expect(categoryOf(v1)).toBe(FALLBACK_CATEGORY);
  });

  it('rejects unknown categories back to the fallback', () => {
    const odd = { category: 'Vaporwave' } as unknown as PresetData;
    expect(categoryOf(odd)).toBe(FALLBACK_CATEGORY);
  });

  it('saves inherit the category of the preset they were tweaked from', () => {
    const [name, data] = Object.entries(BUILT_IN_PRESETS)[0];
    store.load(name);
    store.save('My Tweak');
    const stored = JSON.parse(localStorage.getItem('fretart.presets.v2') ?? '{}') as Record<
      string,
      PresetData
    >;
    expect(categoryOf(stored['My Tweak'])).toBe(categoryOf(data));
  });

  it('migrates v1 localStorage saves to v2 with the fallback category', () => {
    const v1Saves = {
      'Old Look': {
        global: { mirror: true, videoOpacity: 0.8, paletteIndex: 1 },
        effects: { alpha: { enabled: true, values: { amt: 1.2 } } },
        routings: [],
      },
    };
    localStorage.setItem('fretart.presets.v1', JSON.stringify(v1Saves));
    expect(store.listNames()).toContain('Old Look');
    expect(store.load('Old Look')).toBe(true);
    expect(fxA.values.amt).toBe(1.2);
    // Migration is one-way: v2 now owns the data, the v1 key is gone.
    const v2 = JSON.parse(localStorage.getItem('fretart.presets.v2') ?? '{}') as Record<
      string,
      PresetData
    >;
    expect(categoryOf(v2['Old Look'])).toBe(FALLBACK_CATEGORY);
    expect(localStorage.getItem('fretart.presets.v1')).toBeNull();
  });

  it('does not re-run migration once v2 storage exists', () => {
    store.save('Fresh');
    localStorage.setItem('fretart.presets.v1', '{"Ghost": {}}');
    expect(store.listNames()).not.toContain('Ghost');
  });

  it('groups presets by category in canonical order, user saves after built-ins', () => {
    const [firstBuiltIn] = Object.entries(BUILT_IN_PRESETS)[0];
    store.load(firstBuiltIn);
    store.save('Aardvark Tweak'); // alphabetically first, but a user save
    const grouped = store.byCategory();
    expect(Object.keys(grouped)).toEqual(
      PRESET_CATEGORIES.filter((c) => grouped[c] && grouped[c].length > 0),
    );
    const cat = categoryOf(BUILT_IN_PRESETS[firstBuiltIn]);
    const names = grouped[cat]!;
    expect(names).toContain('Aardvark Tweak');
    expect(names.indexOf('Aardvark Tweak')).toBeGreaterThan(names.indexOf(firstBuiltIn));
    // Every listed name is loadable and every preset is listed exactly once.
    const all = Object.values(grouped).flat();
    expect(all.sort()).toEqual(store.listNames().sort());
  });
});
