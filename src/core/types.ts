export interface Vec2 {
  x: number;
  y: number;
}

/** Per-hand features in normalized screen space (x,y in [0,1], y down). */
export interface HandFeatures {
  /** Tracked this frame. */
  present: boolean;
  /** Eased 0..1 envelope — fades out over ~300ms on tracking loss so effects never pop. */
  presence: number;
  /** All 21 landmarks, screen space, smoothed. */
  landmarks: Vec2[];
  /** Fingertips: [thumb, index, middle, ring, pinky] (landmarks 4/8/12/16/20). */
  tips: Vec2[];
  /** Fingertip velocities in normalized units/second, smoothed. */
  tipVelocities: Vec2[];
  /** |tipVelocities| per fingertip. */
  tipSpeeds: number[];
  /** Thumb-tip to [index, middle, ring, pinky]-tip distances. */
  pinch: number[];
  /** Radius of fingertip bounding circle around the centroid. */
  spread: number;
  /** Centroid of the fingertips. */
  centroid: Vec2;
  /** Average fingertip speed. */
  speed: number;
}

export interface FrameFeatures {
  left: HandFeatures;
  right: HandFeatures;
  /** Centroid distance between hands (0 when either is absent). */
  handsDistance: number;
  /** max(left.presence, right.presence). */
  anyPresence: number;
  time: number;
}

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  default: number;
}

export interface InkPalette {
  name: string;
  /** Paper / background tint. */
  paper: string;
  /** Three ink colors, light-duty to heavy-duty. */
  inks: [string, string, string];
}

/**
 * Riso / screen-print inspired palettes shared by all effects so layered
 * output reads as one composition.
 */
export const PALETTES: InkPalette[] = [
  { name: 'Riso Classic', paper: '#f4f1e8', inks: ['#f6d000', '#ff4b36', '#0078bf'] },
  { name: 'Riso Cool', paper: '#f2f2ee', inks: ['#00a95c', '#0078bf', '#765ba7'] },
  { name: 'Neon Stage', paper: '#12121c', inks: ['#c8ff00', '#00e5ff', '#ff2e88'] },
  { name: 'Ink & Ember', paper: '#efe9dc', inks: ['#e8a020', '#c43a2f', '#20242c'] },
  // Muted / gallery palettes — see CLAUDE.md "Palette notes" for the art references.
  { name: 'Studio Ink', paper: '#f5f1e6', inks: ['#a39c8a', '#c65b3f', '#2b2a2e'] },
  { name: 'Pastel Play', paper: '#f3ede2', inks: ['#e9b8c8', '#a9c7e4', '#8e9ec4'] },
  { name: 'Morandi', paper: '#e8e2d6', inks: ['#b5a48f', '#8f9d92', '#7d6f75'] },
  { name: 'Cyanotype', paper: '#1b3a5c', inks: ['#5d87ab', '#9dbfd6', '#dcebf2'] },
];

export const PALETTE_OPTIONS = Object.fromEntries(PALETTES.map((p, i) => [p.name, i]));
