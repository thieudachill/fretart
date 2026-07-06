import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { FrameFeatures, Vec2 } from '../core/types';
import { centroid, sampleClosedCatmullRom, sortAroundCentroid, type Pt2 } from '../core/geometry';
import { EffectBase, type EngineContext } from './Effect';
import { PRINT_HELPERS, PRINT_UNIFORMS } from './shaders/print';

/** Samples along the closed contour curve. */
const SAMPLES = 96;
const MAX_POINTS = 10; // 5 fingertips x 2 hands
const MAX_PAIRS = (MAX_POINTS * (MAX_POINTS - 1)) / 2;

const FILL_VERT = /* glsl */ `
  varying vec2 vScreen;
  void main() {
    vScreen = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Area treatments applied inside the shape — the reference video's core idea
 * (the region the lines enclose becomes a re-rendered window on the feed):
 * 0 flat ink wash · 1 halftone duotone · 2 posterized inks · 3 negative ·
 * 4 pixel mosaic · 5 stipple dither. Styles 1-5 sample the video in screen
 * space, so the shape acts as a lens over what's really there. Sampling +
 * halftone primitives live in shaders/print.ts, shared with the facet effect.
 */
const FILL_FRAG = /* glsl */ `
  ${PRINT_UNIFORMS}
  uniform vec3 uPaper;
  uniform vec3 uInk0;
  uniform vec3 uInk1;
  uniform vec3 uInk2;
  uniform float uAlpha;
  uniform float uStyle;
  uniform float uDensity;
  varying vec2 vScreen;
  ${PRINT_HELPERS}

  void main() {
    vec3 col;
    if (uStyle < 0.5) {
      // Flat ink wash (the original cut-out fill).
      col = uInk0;
    } else if (uStyle < 1.5) {
      // Halftone duotone: ink dots on paper, dot size from video luminance.
      float l = lumaAt(vScreen);
      float d = halftone(vScreen, uDensity, 0.4, smoothstep(0.95, 0.15, l));
      col = mix(uPaper, uInk2, d);
      col *= 1.0 - phash(vScreen * 640.0) * 0.05;
    } else if (uStyle < 2.5) {
      // Posterize into the four palette tones — flat screen-print bands.
      float l = lumaAt(vScreen);
      col = uInk2;
      col = mix(col, uInk1, smoothstep(0.26, 0.32, l));
      col = mix(col, uInk0, smoothstep(0.48, 0.55, l));
      col = mix(col, uPaper, smoothstep(0.72, 0.8, l));
      col *= 1.0 - phash(vScreen * 640.0) * 0.06;
    } else if (uStyle < 3.5) {
      // Negative: inverted reality inside the shape.
      col = 1.0 - videoAt(vScreen);
    } else if (uStyle < 4.5) {
      // Pixel mosaic: chunky cells, coarser as density drops.
      float n = max(4.0, uDensity * 0.5);
      vec2 grid = vec2(n * uAspect, n);
      vec2 cell = (floor(vScreen * grid) + 0.5) / grid;
      col = videoAt(cell);
    } else {
      // Stipple dither: hash-threshold grain — newsprint/data noise fabric.
      vec2 grid = vec2(uDensity * 3.0 * uAspect, uDensity * 3.0);
      vec2 cell = floor(vScreen * grid);
      float cov = 1.0 - lumaAt((cell + 0.5) / grid);
      col = mix(uPaper, uInk2, step(phash(cell), cov * 1.15));
    }
    gl_FragColor = vec4(col, uAlpha);
  }
`;

const DOT_VERT = /* glsl */ `
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`;

const DOT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float mask = 1.0 - smoothstep(0.35, 0.5, d);
    gl_FragColor = vec4(uColor, uAlpha * mask);
  }
`;

/**
 * Forms one organic shape from all visible fingertips (both hands merged),
 * in three switchable styles:
 *   0 — Contour: a single continuous closed curve through the fingertips,
 *       after the one-line drawing tradition (Picasso/Cocteau) and its
 *       contemporary minimalist revival. Thin ink line, optional faint wash.
 *   1 — Cut-out: the same curve filled flat with a translucent ink — Matisse
 *       paper cut-outs / Zach Lieberman's pastel gesture blobs.
 *   2 — Constellation: hairline lines between every fingertip pair plus dots
 *       at the tips — Sol LeWitt wall-drawing systems / pen-plotter art.
 */
export class FingerShapesEffect extends EffectBase {
  readonly id = 'shapes';
  readonly label = 'Finger Shapes';

  private scene = new THREE.Scene();
  private alpha = 0;
  private time = 0;

  // Contour + fill.
  private contour!: Line2;
  private contourGeom!: LineGeometry;
  private contourMat!: LineMaterial;
  private fillMesh!: THREE.Mesh;
  private fillGeom!: THREE.BufferGeometry;
  private fillMat!: THREE.ShaderMaterial;

  // Constellation.
  private webLines!: THREE.LineSegments;
  private webGeom!: THREE.BufferGeometry;
  private webMat!: THREE.LineBasicMaterial;
  private dots!: THREE.Points;
  private dotsGeom!: THREE.BufferGeometry;
  private dotsMat!: THREE.ShaderMaterial;

  private points: Vec2[] = [];
  private curveSamples: Pt2[] = [];

  constructor() {
    super();
    this.paramDefs = [
      { key: 'style', label: 'Style (0=line 1=fill 2=web)', min: 0, max: 2, step: 1, default: 0 },
      // Off by default: while playing, the thumb tip reads as a stray "palm
      // point" that drags the silhouette toward the hand's center.
      { key: 'thumb', label: 'Use thumb (0=tips only)', min: 0, max: 1, step: 1, default: 0 },
      { key: 'line', label: 'Line width px', min: 0, max: 6, step: 0.1, default: 2.2 },
      { key: 'fill', label: 'Fill opacity', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'smooth', label: 'Roundness', min: 0, max: 1, step: 0.01, default: 0.65 },
      { key: 'breathe', label: 'Breathing', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'waviness', label: 'Waviness', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'fillStyle', label: 'Area (0ink 1dot 2post 3neg 4pix 5stip)', min: 0, max: 5, step: 1, default: 0 },
      { key: 'density', label: 'Dot/pixel density', min: 10, max: 200, step: 1, default: 90 },
    ];
    this.initDefaults();
  }

  init(ctx: EngineContext): void {
    // Closed contour polyline.
    this.contourGeom = new LineGeometry();
    this.contourGeom.setPositions(new Array((SAMPLES + 1) * 3).fill(0));
    this.contourMat = new LineMaterial({
      color: 0x000000,
      linewidth: 2,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.contour = new Line2(this.contourGeom, this.contourMat);
    this.contour.frustumCulled = false;
    this.scene.add(this.contour);

    // Fill: triangle fan around the shape centroid (fingertip shapes are
    // star-shaped around their centroid, so a fan triangulates them fine).
    this.fillGeom = new THREE.BufferGeometry();
    this.fillGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((SAMPLES + 2) * 3), 3),
    );
    const fanIndices: number[] = [];
    for (let i = 0; i < SAMPLES; i++) fanIndices.push(0, i + 1, i + 2);
    this.fillGeom.setIndex(fanIndices);
    this.fillMat = new THREE.ShaderMaterial({
      vertexShader: FILL_VERT,
      fragmentShader: FILL_FRAG,
      uniforms: {
        uVideo: { value: ctx.videoTexture },
        uOff: { value: ctx.videoOff },
        uScl: { value: ctx.videoScl },
        uMirror: { value: 1 },
        uPaper: { value: ctx.paper },
        uInk0: { value: ctx.inks[0] },
        uInk1: { value: ctx.inks[1] },
        uInk2: { value: ctx.inks[2] },
        uAlpha: { value: 0 },
        uStyle: { value: 0 },
        uDensity: { value: 90 },
        uAspect: { value: 1.6 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.fillMesh = new THREE.Mesh(this.fillGeom, this.fillMat);
    this.fillMesh.frustumCulled = false;
    this.fillMesh.renderOrder = -1; // fill under the contour line
    this.scene.add(this.fillMesh);

    // Constellation: hairline segments between all fingertip pairs.
    this.webGeom = new THREE.BufferGeometry();
    this.webGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_PAIRS * 2 * 3), 3),
    );
    this.webMat = new THREE.LineBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.webLines = new THREE.LineSegments(this.webGeom, this.webMat);
    this.webLines.frustumCulled = false;
    this.scene.add(this.webLines);

    this.dotsGeom = new THREE.BufferGeometry();
    this.dotsGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3),
    );
    this.dotsMat = new THREE.ShaderMaterial({
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0x000000) },
        uAlpha: { value: 1 },
        uSize: { value: 8 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.dots = new THREE.Points(this.dotsGeom, this.dotsMat);
    this.dots.frustumCulled = false;
    this.scene.add(this.dots);
  }

  resize(ctx: EngineContext): void {
    this.contourMat.resolution.set(ctx.width, ctx.height);
    this.dotsMat.uniforms.uSize.value = 8 * (ctx.height / 720);
  }

  update(features: FrameFeatures, dt: number): void {
    this.time += dt;
    this.points.length = 0;
    const first = this.p('thumb') > 0.5 ? 0 : 1;
    for (const hand of [features.left, features.right]) {
      if (hand.presence < 0.05) continue;
      for (let t = first; t < 5; t++) this.points.push(hand.tips[t]);
    }

    const target = this.points.length >= 3 ? features.anyPresence : 0;
    const rate = target > this.alpha ? 8 : 4;
    this.alpha += (target - this.alpha) * Math.min(1, dt * rate);

    if (this.points.length >= 3) this.buildCurve();
  }

  private buildCurve(): void {
    // Order fingertips by angle around their centroid so the closed curve
    // wraps them into one coherent silhouette instead of self-crossing.
    const c = centroid(this.points);
    const ordered = sortAroundCentroid(this.points, c);

    const smooth = this.p('smooth');
    const breathe = this.p('breathe');
    this.curveSamples = sampleClosedCatmullRom(ordered, SAMPLES, 0.1 + smooth * 0.7);

    // Gentle organic wobble so a held shape still feels alive (Lieberman's
    // sketches breathe even at rest), plus optional high-frequency waviness
    // for a hand-drawn wavering-line quality (0 = clean straight curve).
    const waviness = this.p('waviness');
    if (breathe > 0 || waviness > 0) {
      for (let i = 0; i < this.curveSamples.length; i++) {
        const s = this.curveSamples[i];
        const angle = Math.atan2(s.y - c.y, s.x - c.x);
        const slow =
          Math.sin(angle * 3 + this.time * 1.8) * 0.35 + Math.sin(angle * 5 - this.time * 1.2) * 0.2;
        const fast =
          Math.sin(angle * 9 + this.time * 2.6) * 0.6 + Math.sin(angle * 14 - this.time * 1.9) * 0.4;
        const amount = breathe * 0.012 * slow + waviness * 0.01 * fast;
        s.x += Math.cos(angle) * amount;
        s.y += Math.sin(angle) * amount;
      }
    }
  }

  render(ctx: EngineContext, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget): void {
    ctx.blit(input, output);
    if (this.alpha < 0.01 || this.curveSamples.length === 0) return;

    const style = Math.round(this.p('style'));
    const lineWidth = this.p('line');
    const fillOpacity = this.p('fill');
    const isWeb = style === 2;

    this.contour.visible = !isWeb && lineWidth > 0.01;
    this.fillMesh.visible = !isWeb && (style === 1 ? fillOpacity > 0.01 : false);
    this.webLines.visible = isWeb;
    this.dots.visible = isWeb;

    if (!isWeb) {
      // Contour line through the sampled curve, closed.
      const flat: number[] = [];
      for (const s of this.curveSamples) flat.push(s.x, s.y, 0);
      flat.push(this.curveSamples[0].x, this.curveSamples[0].y, 0);
      this.contourGeom.setPositions(flat);
      // Darkest ink draws the line — reads as pen on the frame.
      this.contourMat.color.copy(ctx.inks[2]);
      this.contourMat.opacity = this.alpha * 0.9;
      this.contourMat.linewidth = lineWidth;

      if (this.fillMesh.visible) {
        const pos = this.fillGeom.getAttribute('position') as THREE.BufferAttribute;
        let cx = 0;
        let cy = 0;
        for (const s of this.curveSamples) {
          cx += s.x;
          cy += s.y;
        }
        cx /= this.curveSamples.length;
        cy /= this.curveSamples.length;
        pos.setXYZ(0, cx, cy, 0);
        for (let i = 0; i < SAMPLES; i++) {
          const s = this.curveSamples[i % this.curveSamples.length];
          pos.setXYZ(i + 1, s.x, s.y, 0);
        }
        pos.setXYZ(SAMPLES + 1, this.curveSamples[0].x, this.curveSamples[0].y, 0);
        pos.needsUpdate = true;
        const fu = this.fillMat.uniforms;
        fu.uAlpha.value = this.alpha * fillOpacity;
        fu.uStyle.value = Math.round(this.p('fillStyle'));
        fu.uDensity.value = this.p('density');
        fu.uMirror.value = ctx.mirror;
        fu.uAspect.value = ctx.width / Math.max(1, ctx.height);
      }
    } else {
      // Constellation: every pair, hairline, low opacity — plotter systems.
      const pos = this.webGeom.getAttribute('position') as THREE.BufferAttribute;
      let seg = 0;
      for (let a = 0; a < this.points.length; a++) {
        for (let b = a + 1; b < this.points.length; b++) {
          pos.setXYZ(seg * 2, this.points[a].x, this.points[a].y, 0);
          pos.setXYZ(seg * 2 + 1, this.points[b].x, this.points[b].y, 0);
          seg++;
        }
      }
      pos.needsUpdate = true;
      this.webGeom.setDrawRange(0, seg * 2);
      this.webMat.color.copy(ctx.inks[2]);
      this.webMat.opacity = this.alpha * 0.45;

      const dotPos = this.dotsGeom.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < this.points.length; i++) {
        dotPos.setXYZ(i, this.points[i].x, this.points[i].y, 0);
      }
      dotPos.needsUpdate = true;
      this.dotsGeom.setDrawRange(0, this.points.length);
      this.dotsMat.uniforms.uColor.value.copy(ctx.inks[2]);
      this.dotsMat.uniforms.uAlpha.value = this.alpha * 0.9;
    }

    ctx.drawScene(this.scene, output);
  }

  dispose(): void {
    this.contourGeom.dispose();
    this.contourMat.dispose();
    this.fillGeom.dispose();
    this.fillMat.dispose();
    this.webGeom.dispose();
    this.webMat.dispose();
    this.dotsGeom.dispose();
    this.dotsMat.dispose();
  }
}
