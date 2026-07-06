import * as THREE from 'three';
import type { FrameFeatures } from '../core/types';
import { EffectBase, type EngineContext } from './Effect';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uVideo;
  uniform vec2 uOff;
  uniform vec2 uScl;
  uniform float uMirror;
  uniform vec3 uPaper;
  uniform vec3 uInk0;
  uniform vec3 uInk1;
  uniform vec3 uInk2;
  uniform float uDotScale;
  uniform float uMisreg;
  uniform float uAlpha;
  uniform float uAspect;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec2 videoUV(vec2 uv) {
    uv = clamp(uv, 0.0, 1.0);
    if (uMirror > 0.5) uv.x = 1.0 - uv.x;
    // Sample the same cover-cropped region as the base pass, flipped to
    // texture space (v up), so the polygon shows a stretched live feed.
    return uOff + vec2(uv.x, 1.0 - uv.y) * uScl;
  }

  float luma(vec2 uv) {
    vec3 c = texture2D(uVideo, videoUV(uv)).rgb;
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  // Classic screen-print halftone: rotated dot grid, dot radius from coverage.
  float halftone(vec2 uv, float scale, float angle, float coverage) {
    float s = sin(angle);
    float c = cos(angle);
    vec2 p = mat2(c, -s, s, c) * (uv * vec2(uAspect, 1.0)) * scale;
    vec2 cell = fract(p) - 0.5;
    float r = length(cell);
    float radius = 0.72 * sqrt(clamp(coverage, 0.0, 1.0));
    return 1.0 - smoothstep(radius - 0.09, radius + 0.09, r);
  }

  void main() {
    vec2 uv = vUv;
    vec3 col = uPaper;

    // Three ink separations sampled with mis-registered offsets, like a riso
    // print where each drum was fed slightly off.
    float l0 = luma(uv + vec2(uMisreg, 0.0));
    float l1 = luma(uv + vec2(-uMisreg * 0.7, uMisreg * 0.6));
    float l2 = luma(uv);

    // Lightest ink: fine halftone dots over highlights-to-midtones.
    float cov0 = smoothstep(0.92, 0.25, l0);
    col = mix(col, uInk0, halftone(uv, uDotScale, 0.35, cov0) * 0.9);

    // Second ink: coarser dots at a different screen angle for the shadows.
    float cov1 = smoothstep(0.62, 0.12, l1);
    col = mix(col, uInk1, halftone(uv, uDotScale * 0.55, 1.25, cov1));

    // Darkest ink: solid blocks in deep shadows with a torn grainy edge.
    float grain = (hash(uv * 340.0) - 0.5) * 0.10;
    float solid = smoothstep(0.34 + grain, 0.20 + grain, l2);
    col = mix(col, uInk2, solid * 0.95);

    // Ink bleed noise so flats never look digital-clean.
    col *= 1.0 - hash(uv * 720.0) * 0.05;

    // Paper-white border frame around the polygon edge.
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    col = mix(uPaper, col, smoothstep(0.004, 0.022, edge));

    gl_FragColor = vec4(col, uAlpha);
  }
`;

/**
 * The reference-video look: a polygon whose corners ride the fingertips,
 * filled with the live feed re-rendered as a pop-art screen print — Ben-Day
 * halftone dots, posterized ink separations, riso mis-registration, on paper
 * white. Both hands -> quad between thumbs+indexes; one hand -> triangle.
 */
export class RisoCollageEffect extends EffectBase {
  readonly id = 'riso';
  readonly label = 'Riso Collage';

  private scene = new THREE.Scene();
  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;
  /** Smoothed alpha so the panel eases in/out with tracking. */
  private alpha = 0;
  /** Last known corner positions — held while fading out. */
  private corners = [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.3 },
    { x: 0.7, y: 0.7 },
    { x: 0.3, y: 0.7 },
  ];

  constructor() {
    super();
    this.paramDefs = [
      { key: 'dotScale', label: 'Dot density', min: 15, max: 160, step: 1, default: 70 },
      { key: 'misreg', label: 'Mis-registration', min: 0, max: 0.03, step: 0.001, default: 0.008 },
      { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, default: 0.96 },
      { key: 'anchor', label: 'Anchors (0=pinch 1=frame)', min: 0, max: 1, step: 1, default: 0 },
    ];
    this.initDefaults();
  }

  init(ctx: EngineContext): void {
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(4 * 3);
    // v up in uv space to match the flipped video texture.
    const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uVideo: { value: ctx.videoTexture },
        uOff: { value: ctx.videoOff },
        uScl: { value: ctx.videoScl },
        uMirror: { value: 1 },
        uPaper: { value: ctx.paper },
        uInk0: { value: ctx.inks[0] },
        uInk1: { value: ctx.inks[1] },
        uInk2: { value: ctx.inks[2] },
        uDotScale: { value: 70 },
        uMisreg: { value: 0.008 },
        uAlpha: { value: 0 },
        uAspect: { value: 1.6 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide, // corner order can invert when hands cross
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  update(features: FrameFeatures, dt: number): void {
    const l = features.left;
    const r = features.right;
    const frameMode = this.p('anchor') > 0.5;
    let targetAlpha = 0;

    if (l.presence > 0.05 && r.presence > 0.05) {
      // Quad stretched between both hands. Pinch mode rides thumb+index tips
      // (the reference video's gesture); frame mode uses index+pinky for a
      // wider, flatter banner.
      const [topA, botA] = frameMode ? [l.tips[4], l.tips[1]] : [l.tips[1], l.tips[0]];
      const [topB, botB] = frameMode ? [r.tips[4], r.tips[1]] : [r.tips[1], r.tips[0]];
      this.setCorner(0, topA);
      this.setCorner(1, topB);
      this.setCorner(2, botB);
      this.setCorner(3, botA);
      targetAlpha = Math.min(l.presence, r.presence);
    } else if (l.presence > 0.05 || r.presence > 0.05) {
      // Single hand: triangle thumb / index / pinky.
      const hand = l.presence > r.presence ? l : r;
      this.setCorner(0, hand.tips[1]);
      this.setCorner(1, hand.tips[4]);
      this.setCorner(2, hand.tips[0]);
      this.setCorner(3, hand.tips[0]); // degenerate 4th vertex -> triangle
      targetAlpha = hand.presence;
    }

    // Ease alpha toward target (fast in, slow out).
    const rate = targetAlpha > this.alpha ? 8 : 4;
    this.alpha += (targetAlpha - this.alpha) * Math.min(1, dt * rate);
  }

  private setCorner(i: number, p: { x: number; y: number }): void {
    // Light positional easing keeps the panel feeling like stretched paper
    // rather than being rigidly glued to the (slightly jittery) fingertips.
    this.corners[i].x += (p.x - this.corners[i].x) * 0.55;
    this.corners[i].y += (p.y - this.corners[i].y) * 0.55;
  }

  render(ctx: EngineContext, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget): void {
    ctx.blit(input, output);
    if (this.alpha < 0.01) return;

    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) positions.setXYZ(i, this.corners[i].x, this.corners[i].y, 0);
    positions.needsUpdate = true;

    const u = this.material.uniforms;
    u.uMirror.value = ctx.mirror;
    u.uDotScale.value = this.p('dotScale');
    u.uMisreg.value = this.p('misreg');
    u.uAlpha.value = this.alpha * this.p('opacity');
    u.uAspect.value = ctx.width / Math.max(1, ctx.height);

    ctx.drawScene(this.scene, output);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
