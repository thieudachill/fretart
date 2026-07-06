import * as THREE from 'three';
import type { FrameFeatures, InkPalette, ParamDef } from '../core/types';

/**
 * Shared services every effect gets from the engine: the renderer, the live
 * video texture (with its cover-crop uniforms), current palette colors, and
 * helpers for the ping-pong render-target chain.
 */
export interface EngineContext {
  renderer: THREE.WebGLRenderer;
  videoTexture: THREE.VideoTexture;
  /** Cover-crop of the video into the canvas: videoUV = uOff + screenUV * uScl. */
  videoOff: THREE.Vector2;
  videoScl: THREE.Vector2;
  /** 1 when the base video is mirrored (selfie view). */
  mirror: number;
  /** Drawing-buffer size in px. */
  width: number;
  height: number;
  palette: InkPalette;
  paper: THREE.Color;
  inks: [THREE.Color, THREE.Color, THREE.Color];
  /** Screen-space camera: x 0..1 left->right, y 0..1 top->bottom, z free. */
  camera: THREE.OrthographicCamera;
  /** Copy input into output. */
  blit(input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget | null): void;
  /** Run a full-screen material into a target. */
  fsPass(material: THREE.Material, output: THREE.WebGLRenderTarget | null): void;
  /** Render a scene on top of what's already in the target (no clear). */
  drawScene(scene: THREE.Scene, output: THREE.WebGLRenderTarget | null): void;
}

/**
 * A composable visual layer. Effects are rendered in registry order over a
 * ping-pong render-target pair; each reads the previous layer's output and
 * writes its own. Every effect can be enabled/disabled independently.
 *
 * To add a new effect: subclass, define paramDefs, implement render(), add it
 * to the registry in engine setup. Nothing else changes.
 */
export abstract class EffectBase {
  abstract readonly id: string;
  abstract readonly label: string;
  enabled = false;

  /** Numeric params — drives both the Tweakpane UI and the mod matrix. */
  paramDefs: ParamDef[] = [];
  /** Base values set by UI sliders / presets. */
  values: Record<string, number> = {};
  /** Per-frame modulation offsets written by the mod matrix. */
  modOffsets: Record<string, number> = {};

  /** Call at the end of the subclass constructor, after paramDefs is set. */
  protected initDefaults(): void {
    for (const def of this.paramDefs) this.values[def.key] = def.default;
  }

  /** Effective param value: UI base + modulation, clamped to the def range. */
  protected p(key: string): number {
    const def = this.paramDefs.find((d) => d.key === key);
    if (!def) return 0;
    const v = (this.values[key] ?? def.default) + (this.modOffsets[key] ?? 0);
    return Math.min(def.max, Math.max(def.min, v));
  }

  init(_ctx: EngineContext): void {}
  resize(_ctx: EngineContext): void {}
  update(_features: FrameFeatures, _dt: number): void {}
  abstract render(
    ctx: EngineContext,
    input: THREE.WebGLRenderTarget,
    output: THREE.WebGLRenderTarget,
  ): void;
  dispose(): void {}
}
