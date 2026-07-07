import type { Engine } from '../core/engine';
import type { ModMatrix, Routing } from '../mapping/modMatrix';

/** How the preset browser shelves looks — order here is display order. */
export const PRESET_CATEGORIES = [
  'Line & Shape',
  'Print & Paper',
  'Motion & Light',
  'Audio Reactive',
  'Collage & Mixed',
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

/** Where presets land when their category is unknown (v1 saves/imports). */
export const FALLBACK_CATEGORY: PresetCategory = 'Collage & Mixed';

export interface PresetData {
  /** Optional so v1 export files still import; resolve via categoryOf(). */
  category?: PresetCategory;
  /** One-liner for UI tooltips; built-ins always have one. */
  description?: string;
  global: { mirror: boolean; videoOpacity: number; paletteIndex: number };
  effects: Record<string, { enabled: boolean; values: Record<string, number> }>;
  routings: Routing[];
}

export function categoryOf(data: PresetData): PresetCategory {
  return data.category && (PRESET_CATEGORIES as readonly string[]).includes(data.category)
    ? data.category
    : FALLBACK_CATEGORY;
}

const STORAGE_KEY = 'fretart.presets.v2';
const LEGACY_STORAGE_KEY = 'fretart.presets.v1';

/**
 * Curated starting points. Values omitted here fall back to each param's
 * default, so built-ins stay valid as effects gain parameters.
 */
export const BUILT_IN_PRESETS: Record<string, PresetData> = {
  // ---- Line & Shape (muted, gallery-leaning palettes) ----
  'Line Drawing': {
    category: 'Line & Shape',
    description: 'One ink line wrapping the fingertips, pen-drawn strings between the hands.',
    // Studio Ink palette: warm paper, graphite + vermilion accent.
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
    category: 'Line & Shape',
    description: 'Matisse cut-out: a translucent pastel shape with a fine contour and soft echo.',
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
    category: 'Motion & Light',
    description: 'Pale constellation lines and dots glowing slowly on Prussian-blue darkness.',
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
    category: 'Line & Shape',
    description: 'Everything undulates gently even at rest — the hand-drawn line showcase.',
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
    category: 'Line & Shape',
    description: 'Charcoal life-drawing: faint fills and thin construction webs in Morandi tones.',
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
    category: 'Line & Shape',
    description: 'Taut hairline threads that ring with motion and fall dead straight in stillness.',
    // Naum Gabo string sculpture; Ink & Ember palette.
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
    category: 'Line & Shape',
    description: 'A contour-less pastel blob that breathes and drifts among soft particles.',
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
    category: 'Motion & Light',
    description: 'Near-black frame, pale hairlines, tiny precise dots — clinical data minimalism.',
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
  // ---- Print & Paper (area treatments: the enclosed region becomes a
  // re-rendered window on the feed, like the reference video) ----
  'Print Window': {
    category: 'Print & Paper',
    description: 'The finger shape becomes a halftone duotone print of whatever is behind it.',
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
    category: 'Print & Paper',
    description: 'The area between your hands inverts reality — a photographic negative in a contour.',
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
    category: 'Print & Paper',
    description: 'The shape pixelates what it covers; playing faster makes the cells coarser.',
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
  // ---- Facets (the finger quad as a folded screen-printed sheet) ----
  'Print Pyramid': {
    category: 'Print & Paper',
    description: 'Each facet of the fingertip pyramid printed on a different riso plate.',
    // The user-picked look from scratch/02, shaded by one key light.
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
    category: 'Print & Paper',
    description: 'Cyanotype relief: an architectural drawing that breathes on Prussian-blue night.',
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
  'Print Shop': {
    category: 'Print & Paper',
    description: 'The live feed as a riso print — dots coarsen with spread, plates slip with speed.',
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
    category: 'Motion & Light',
    description: 'Glowing strings and sparks over a long feedback trail — the stage look.',
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
    category: 'Collage & Mixed',
    description: 'Riso print, strings, and particles layered into one moving collage.',
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
  'Soft Collage': {
    category: 'Collage & Mixed',
    description: 'A dusty Morandi riso collage with a drawn contour and gentle echo.',
    global: { mirror: true, videoOpacity: 0.9, paletteIndex: 6 },
    effects: {
      riso: { enabled: true, values: { dotScale: 55, misreg: 0.006, opacity: 0.85 } },
      shapes: { enabled: true, values: { style: 0, line: 2, fill: 0, smooth: 0.7, breathe: 0.2, waviness: 0.1 } },
      facets: { enabled: false, values: {} },
      strings: { enabled: false, values: {} },
      particles: { enabled: true, values: { rate: 0.2, size: 5, opacity: 0.4, scatter: 0.2 } },
      echo: { enabled: true, values: { persist: 0.55, mix: 0.2, drift: 0.05, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'right.speed', target: 'riso.misreg', amount: 0.35 },
      { enabled: true, source: 'left.spread', target: 'riso.dotScale', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  // ---- Audio Reactive (all read 0 without a mic, so these still work
  // silently — sound just brings them to life) ----
  'Pluck Bloom': {
    category: 'Audio Reactive',
    description: 'Each pluck blooms the cut-out shape — play softly and it barely breathes.',
    global: { mirror: true, videoOpacity: 0.95, paletteIndex: 5 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 1, line: 1.4, fill: 0.2, smooth: 0.9, breathe: 0.05, waviness: 0.1 } },
      facets: { enabled: false, values: {} },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.5, mix: 0.18, drift: 0.04, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'audio.onset', target: 'shapes.breathe', amount: 0.6 },
      { enabled: true, source: 'audio.onset', target: 'shapes.fill', amount: 0.35 },
      { enabled: true, source: 'audio.level', target: 'shapes.line', amount: 0.25 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Attack Lines': {
    category: 'Audio Reactive',
    description: 'Pen strings ring only when a note is struck — staccato made visible.',
    global: { mirror: true, videoOpacity: 1, paletteIndex: 4 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 0, line: 1.8, fill: 0, smooth: 0.6, breathe: 0.1, waviness: 0 } },
      facets: { enabled: false, values: {} },
      strings: { enabled: true, values: { ink: 1, web: 0, cross: 1, thickness: 1.3, glow: 0.55, vibration: 0.08, frequency: 3, waviness: 0 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'audio.onset', target: 'strings.vibration', amount: 0.65 },
      { enabled: true, source: 'audio.level', target: 'strings.glow', amount: 0.3 },
      { enabled: true, source: 'audio.onset', target: 'shapes.breathe', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Bass Fold': {
    category: 'Audio Reactive',
    description: 'Low notes push the paper pyramid up out of the frame.',
    // spreadDrive off so the bass owns the apex; hands only place the sheet.
    global: { mirror: true, videoOpacity: 0.85, paletteIndex: 3 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: false, values: {} },
      facets: { enabled: true, values: { mode: 1, apex: 0.06, spreadDrive: 0, shade: 1, pattern: 0, density: 80, angle: 30, misreg: 0.1, edge: 0.6, paperBack: 0.85, opacity: 0.95 } },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: false, values: {} },
    },
    routings: [
      { enabled: true, source: 'audio.bass', target: 'facets.apex', amount: 0.55 },
      { enabled: true, source: 'audio.onset', target: 'facets.misreg', amount: 0.35 },
      { enabled: true, source: 'audio.level', target: 'facets.shade', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Resonance': {
    category: 'Audio Reactive',
    description: 'Sustain lingers — the louder the room rings, the longer the trails last.',
    global: { mirror: true, videoOpacity: 0.9, paletteIndex: 6 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 0, line: 2, fill: 0.08, smooth: 0.7, breathe: 0.2, waviness: 0.15 } },
      facets: { enabled: false, values: {} },
      strings: { enabled: false, values: {} },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.6, mix: 0.15, drift: 0.03, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'audio.level', target: 'echo.mix', amount: 0.45 },
      { enabled: true, source: 'audio.level', target: 'echo.persist', amount: 0.25 },
      { enabled: true, source: 'audio.pitch', target: 'shapes.waviness', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
  'Register Ribbon': {
    category: 'Audio Reactive',
    description: 'Melody as a ribbon — climb the neck and the strings ripple faster.',
    global: { mirror: true, videoOpacity: 0.2, paletteIndex: 7 },
    effects: {
      riso: { enabled: false, values: {} },
      shapes: { enabled: true, values: { style: 2, line: 1, fill: 0, smooth: 0.5, breathe: 0, waviness: 0 } },
      facets: { enabled: false, values: {} },
      strings: { enabled: true, values: { ink: 0, web: 0, cross: 1, thickness: 1.6, glow: 0.6, vibration: 0.2, frequency: 2, waviness: 0.1 } },
      particles: { enabled: false, values: {} },
      echo: { enabled: true, values: { persist: 0.7, mix: 0.3, drift: 0.05, hue: 0 } },
    },
    routings: [
      { enabled: true, source: 'audio.pitch', target: 'strings.waviness', amount: 0.55 },
      { enabled: true, source: 'audio.pitch', target: 'strings.frequency', amount: 0.5 },
      { enabled: true, source: 'audio.level', target: 'strings.glow', amount: 0.3 },
      { enabled: false, source: '', target: '', amount: 0 },
    ],
  },
};

export class PresetStore {
  /** Name of the last loaded/saved preset — recordings are named after it. */
  currentName = '';

  constructor(
    private engine: Engine,
    private matrix: ModMatrix,
  ) {}

  capture(): PresetData {
    const effects: PresetData['effects'] = {};
    for (const e of this.engine.effects) {
      effects[e.id] = { enabled: e.enabled, values: { ...e.values } };
    }
    // A user save is almost always a tweak of the look they loaded, so it
    // inherits that look's shelf in the browser.
    const current = BUILT_IN_PRESETS[this.currentName] ?? this.readStorage()[this.currentName];
    return {
      category: current ? categoryOf(current) : FALLBACK_CATEGORY,
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
      const v2 = localStorage.getItem(STORAGE_KEY);
      if (v2 !== null) return JSON.parse(v2);
      return this.migrateLegacy();
    } catch {
      return {};
    }
  }

  /** One-way v1 → v2 move: old saves land in the fallback category. */
  private migrateLegacy(): Record<string, PresetData> {
    const v1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (v1 === null) return {};
    let migrated: Record<string, PresetData> = {};
    try {
      const saves = JSON.parse(v1) as Record<string, PresetData>;
      for (const [name, data] of Object.entries(saves)) {
        migrated[name] = { ...data, category: categoryOf(data) };
      }
    } catch {
      migrated = {}; // corrupt v1: nothing worth carrying over
    }
    this.writeStorage(migrated);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return migrated;
  }

  /** Preset names shelved by category (display order), user saves after built-ins. */
  byCategory(): Partial<Record<PresetCategory, string[]>> {
    const grouped: Partial<Record<PresetCategory, string[]>> = {};
    const add = (name: string, data: PresetData) =>
      (grouped[categoryOf(data)] ??= []).push(name);
    for (const [name, data] of Object.entries(BUILT_IN_PRESETS)) add(name, data);
    for (const [name, data] of Object.entries(this.readStorage())) add(name, data);
    // Rebuild in canonical order so callers can iterate keys directly.
    const ordered: Partial<Record<PresetCategory, string[]>> = {};
    for (const cat of PRESET_CATEGORIES) {
      if (grouped[cat]?.length) ordered[cat] = grouped[cat];
    }
    return ordered;
  }

  private writeStorage(all: Record<string, PresetData>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  listNames(): string[] {
    return [...Object.keys(BUILT_IN_PRESETS), ...Object.keys(this.readStorage())];
  }

  describe(name: string): string | undefined {
    return (BUILT_IN_PRESETS[name] ?? this.readStorage()[name])?.description;
  }

  /** Built-ins can't be deleted; only names living in localStorage can. */
  isUserSave(name: string): boolean {
    return name in this.readStorage();
  }

  save(name: string): void {
    const all = this.readStorage();
    all[name] = this.capture();
    this.writeStorage(all);
    this.currentName = name;
  }

  load(name: string): boolean {
    const preset = BUILT_IN_PRESETS[name] ?? this.readStorage()[name];
    if (!preset) return false;
    this.apply(preset);
    this.currentName = name;
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
