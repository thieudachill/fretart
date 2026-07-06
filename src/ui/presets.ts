import type { Engine } from '../core/engine';
import type { ModMatrix, Routing } from '../mapping/modMatrix';

export interface PresetData {
  global: { mirror: boolean; videoOpacity: number; paletteIndex: number };
  effects: Record<string, { enabled: boolean; values: Record<string, number> }>;
  routings: Routing[];
}

const STORAGE_KEY = 'fretart.presets.v1';

/**
 * Curated starting points. Values omitted here fall back to each param's
 * default, so built-ins stay valid as effects gain parameters.
 */
export const BUILT_IN_PRESETS: Record<string, PresetData> = {
  // ---- Line & shape presets (muted, gallery-leaning palettes) ----
  'Line Drawing': {
    // One-line contour drawing: single ink line wrapping all fingertips,
    // pen-drawn strings between the hands. Studio Ink palette (warm paper,
    // graphite + vermilion accent).
    global: { mirror: true, videoOpacity: 1, paletteIndex: 4 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 0, line: 2.4, fill: 0, smooth: 0.65, breathe: 0.25 } },
      strings: { enabled: true, values: { ink: 1, web: 0, cross: 1, thickness: 1.2, glow: 0.55, vibration: 0.35 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'strings.vibration', amount: 0.45 },
      { enabled: true, source: 'left.spread', target: 'shapes.smooth', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Cut-Out Studio': {
    // Matisse cut-out / Lieberman pastel blob: translucent filled shape with
    // a fine contour, soft echo. Pastel Play palette.
    global: { mirror: true, videoOpacity: 0.92, paletteIndex: 5 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, line: 1.6, fill: 0.55, smooth: 0.9, breathe: 0.4 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.55, mix: 0.22, drift: 0.06, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'hands.distance', target: 'shapes.fill', amount: 0.25 },
      { enabled: true, source: 'right.speed', target: 'shapes.breathe', amount: 0.4 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Blueprint': {
    // Cyanotype constellation: pale hairlines and dots on Prussian-blue
    // darkness, slow glowing echo — plotter systems meet blueprint prints.
    global: { mirror: true, videoOpacity: 0.14, paletteIndex: 7 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 2, line: 1, fill: 0, smooth: 0.5, breathe: 0 } },
      strings: { enabled: true, values: { ink: 0, web: 0, cross: 1, thickness: 1.4, glow: 0.55, vibration: 0.45 } },
      particles: { enabled: true, values: { rate: 0.25, size: 3.5, opacity: 0.4, inherit: 0.5, scatter: 0.15 } },
      echo: { enabled: true, values: { persist: 0.86, mix: 0.5, drift: 0.1, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'particles.rate', amount: 0.4 },
      { enabled: true, source: 'left.speed', target: 'strings.vibration', amount: 0.5 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Wavy Ink': {
    // Hand-drawn wavering line quality: everything undulates gently even at
    // rest — the waviness showcase. Studio Ink palette.
    global: { mirror: true, videoOpacity: 1, paletteIndex: 4 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 0, line: 2, fill: 0.06, smooth: 0.75, breathe: 0.3, waviness: 0.5 } },
      strings: { enabled: true, values: { ink: 1, web: 0, cross: 1, thickness: 1.4, glow: 0.6, vibration: 0.4, frequency: 4, waviness: 0.65 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'strings.waviness', amount: 0.35 },
      { enabled: true, source: 'left.spread', target: 'shapes.waviness', amount: 0.35 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Gesture Study': {
    // Charcoal life-drawing session: soft Morandi tones, faint filled shape,
    // dense thin webs inside each hand like construction lines.
    global: { mirror: true, videoOpacity: 0.9, paletteIndex: 6 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, line: 2.8, fill: 0.18, smooth: 0.5, breathe: 0.15, waviness: 0.15 } },
      strings: { enabled: true, values: { ink: 1, web: 1, cross: 0, thickness: 0.9, glow: 0.4, vibration: 0.2, waviness: 0.08 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.5, mix: 0.18, drift: 0, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'hands.distance', target: 'shapes.fill', amount: 0.2 },
      { enabled: true, source: 'right.speed', target: 'strings.glow', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Gabo Threads': {
    // Naum Gabo string sculpture: many taut straight hairline threads inside
    // and between the hands; motion makes them ring, stillness keeps them
    // perfectly straight. Ink & Ember palette.
    global: { mirror: true, videoOpacity: 1, paletteIndex: 3 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: false, values: {} },
      strings: { enabled: true, values: { ink: 1, web: 1, cross: 1, thickness: 0.8, glow: 0.5, vibration: 0.55, frequency: 2, waviness: 0 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'strings.vibration', amount: 0.5 },
      { enabled: true, source: 'hands.distance', target: 'strings.thickness', amount: 0.25 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Pastel Ribbon': {
    // Lieberman playfulness: contour-less pastel blob that breathes and
    // drifts, soft round particles, dreamy echo. Pastel Play palette.
    global: { mirror: true, videoOpacity: 0.95, paletteIndex: 5 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, line: 0, fill: 0.65, smooth: 1, breathe: 0.5, waviness: 0.3 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: true, values: { rate: 0.3, size: 9, opacity: 0.35, scatter: 0.4, life: 2 } },
      echo: { enabled: true, values: { persist: 0.7, mix: 0.3, drift: 0.15, hue: 0.05 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'particles.rate', amount: 0.4 },
      { enabled: true, source: 'left.spread', target: 'shapes.fill', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Data Field': {
    // Clinical data-minimalism (Ryoji Ikeda territory): near-black frame,
    // pale straight hairlines, constellation dots, tiny precise particles.
    global: { mirror: true, videoOpacity: 0.06, paletteIndex: 7 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 2, line: 1, fill: 0, smooth: 0.5, breathe: 0, waviness: 0 } },
      strings: { enabled: true, values: { ink: 0, web: 0, cross: 1, thickness: 1, glow: 0.8, vibration: 0.15, frequency: 6, waviness: 0 } },
      particles: { enabled: true, values: { rate: 0.15, size: 2.5, opacity: 0.6, inherit: 0.7, scatter: 0.05 } },
      echo: { enabled: true, values: { persist: 0.75, mix: 0.35, drift: 0, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'particles.rate', amount: 0.5 },
      { enabled: true, source: 'left.speed', target: 'strings.glow', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  // ---- Area-treatment presets (the region the lines enclose becomes a
  // re-rendered window on the feed, like the reference video) ----
  'Print Window': {
    // Closest to the reference: the finger shape is a halftone-duotone print
    // of whatever is behind it, with a drawn contour. Studio Ink palette.
    global: { mirror: true, videoOpacity: 1, paletteIndex: 4 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, fillStyle: 1, fill: 1, line: 2.2, smooth: 0.7, breathe: 0.25, waviness: 0.12, density: 110 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'left.spread', target: 'shapes.density', amount: 0.3 },
      { enabled: true, source: 'right.speed', target: 'shapes.breathe', amount: 0.35 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Negative Space': {
    // The area between your hands inverts reality — a photographic negative
    // held inside a thin contour. Morandi palette, soft echo.
    global: { mirror: true, videoOpacity: 0.95, paletteIndex: 6 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, fillStyle: 3, fill: 1, line: 1.8, smooth: 0.8, breathe: 0.3, waviness: 0.1 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.55, mix: 0.2, drift: 0.05, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'shapes.waviness', amount: 0.3 },
      { enabled: true, source: 'hands.distance', target: 'shapes.smooth', amount: 0.25 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Mosaic Lens': {
    // The shape pixelates what it covers into chunky mosaic cells; playing
    // faster makes the cells coarser (negative routing). Pastel Play.
    global: { mirror: true, videoOpacity: 1, paletteIndex: 5 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, fillStyle: 4, fill: 1, line: 1.2, smooth: 0.9, breathe: 0.2, waviness: 0, density: 60 } },
      strings: { enabled: true, values: { ink: 1, web: 0, cross: 1, thickness: 1, glow: 0.45, vibration: 0.3, waviness: 0 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'shapes.density', amount: -0.45 },
      { enabled: true, source: 'left.spread', target: 'shapes.fill', amount: 0.2 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  // ---- Facet presets (the finger quad as a folded screen-printed sheet) ----
  'Print Pyramid': {
    // The user-picked look from scratch/02: each facet of the fingertip
    // pyramid printed on a different riso plate — dither, sparse red dots,
    // poster bands, halftone — shaded by one key light. Riso Classic inks.
    global: { mirror: true, videoOpacity: 0.85, paletteIndex: 0 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: false, values: {} },
      facets: { enabled: true, values: { mode: 1, apex: 0.24, spreadDrive: 1, shade: 1, pattern: 0, density: 90, angle: 30, misreg: 0.15, edge: 0.6, paperBack: 0.9, opacity: 0.95 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'facets.misreg', amount: 0.35 },
      { enabled: true, source: 'hands.distance', target: 'facets.apex', amount: 0.2 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Blueprint Pyramid': {
    // Cyanotype relief: pale duotone screens on Prussian-blue night, thin
    // cross-hand strings, slow echo — an architectural drawing that breathes.
    global: { mirror: true, videoOpacity: 0.25, paletteIndex: 7 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: false, values: {} },
      facets: { enabled: true, values: { mode: 1, apex: 0.2, spreadDrive: 1, shade: 1.1, pattern: 1, density: 110, angle: 30, misreg: 0.08, edge: 0.75, paperBack: 0.75, opacity: 0.9 } },
      strings: { enabled: true, values: { ink: 0, web: 0, cross: 1, thickness: 1.2, glow: 0.5, vibration: 0.3, waviness: 0 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.6, mix: 0.25, drift: 0.04, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'facets.density', amount: -0.3 },
      { enabled: true, source: 'left.speed', target: 'strings.vibration', amount: 0.4 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  // ---- Print / pop presets ----
  'Print Shop': {
    global: { mirror: true, videoOpacity: 1, paletteIndex: 0 },
    effects: {
      riso: { enabled: true, values: {} },
      shapes: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.6, mix: 0.35, drift: 0.1, hue: 0 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'left.spread', target: 'riso.dotScale', amount: 0.35 },
      { enabled: true, source: 'right.speed', target: 'riso.misreg', amount: 0.4 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Neon Strings': {
    global: { mirror: true, videoOpacity: 0.14, paletteIndex: 2 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.9, mix: 0.8, drift: 0.25, hue: 0.2 } },
      strings: { enabled: true, values: { glow: 0.95, vibration: 0.7, thickness: 2.5 } },
      particles: { enabled: true, values: { rate: 0.45, size: 5, opacity: 0.7 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'particles.rate', amount: 0.5 },
      { enabled: true, source: 'left.speed', target: 'strings.vibration', amount: 0.5 },
      { enabled: true, source: 'hands.distance', target: 'echo.persist', amount: 0.15 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Full Collage': {
    global: { mirror: true, videoOpacity: 0.85, paletteIndex: 0 },
    effects: {
      riso: { enabled: true, values: {} },
      shapes: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.72, mix: 0.45, drift: 0.12, hue: 0.1 } },
      strings: { enabled: true, values: { glow: 0.6, thickness: 1.8 } },
      particles: { enabled: true, values: { rate: 0.4, size: 6, opacity: 0.6 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'particles.rate', amount: 0.4 },
      { enabled: true, source: 'left.spread', target: 'riso.dotScale', amount: 0.35 },
      { enabled: true, source: 'left.speed', target: 'strings.vibration', amount: 0.5 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
};

export class PresetStore {
  constructor(
    private engine: Engine,
    private matrix: ModMatrix,
  ) {}

  capture(): PresetData {
    const effects: PresetData['effects'] = {};
    for (const e of this.engine.effects) {
      effects[e.id] = { enabled: e.enabled, values: { ...e.values } };
    }
    return {
      global: {
        mirror: this.engine.mirror,
        videoOpacity: this.engine.videoOpacity,
        paletteIndex: this.engine.paletteIndex,
      },
      effects,
      routings: this.matrix.routings.map((r) => ({ ...r })),
    };
  }

  apply(data: PresetData): void {
    this.engine.mirror = data.global.mirror;
    this.engine.videoOpacity = data.global.videoOpacity;
    this.engine.setPalette(data.global.paletteIndex);
    for (const e of this.engine.effects) {
      const saved = data.effects[e.id];
      if (!saved) {
        // Preset predates this effect: a preset is a full snapshot, so an
        // unmentioned effect means "off", not "keep whatever was running".
        e.enabled = false;
        for (const def of e.paramDefs) e.values[def.key] = def.default;
        continue;
      }
      e.enabled = saved.enabled;
      for (const def of e.paramDefs) {
        e.values[def.key] = saved.values[def.key] ?? def.default;
      }
    }
    for (let i = 0; i < this.matrix.routings.length; i++) {
      if (data.routings[i]) this.matrix.routings[i] = { ...data.routings[i] };
    }
  }

  private readStorage(): Record<string, PresetData> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  private writeStorage(all: Record<string, PresetData>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  listNames(): string[] {
    return [...Object.keys(BUILT_IN_PRESETS), ...Object.keys(this.readStorage())];
  }

  save(name: string): void {
    const all = this.readStorage();
    all[name] = this.capture();
    this.writeStorage(all);
  }

  load(name: string): boolean {
    const preset = BUILT_IN_PRESETS[name] ?? this.readStorage()[name];
    if (!preset) return false;
    this.apply(preset);
    return true;
  }

  delete(name: string): void {
    const all = this.readStorage();
    delete all[name];
    this.writeStorage(all);
  }

  exportCurrent(): void {
    const blob = new Blob([JSON.stringify(this.capture(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fretart-preset.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  importFromFile(onApplied: () => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text()) as PresetData;
        this.apply(data);
        onApplied();
      } catch (err) {
        console.error('Invalid preset file', err);
      }
    };
    input.click();
  }
}
