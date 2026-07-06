import * as THREE from 'three';
import type { FrameFeatures, HandFeatures } from '../core/types';
import { EffectBase, type EngineContext } from './Effect';
import { PRINT_HELPERS, PRINT_UNIFORMS } from './shaders/print';

const FACETS_PER_HAND = 4;
const MAX_FACETS = FACETS_PER_HAND * 2;
const MAX_EDGE_SEGMENTS = MAX_FACETS * 3;

/**
 * One facet's "printing plate": which treatment, which ink, density scale.
 * Styles: 0 paper · 1 flat wash · 2 halftone · 3 sparse dots · 4 stipple
 * dither · 5 posterize · 6 mosaic · 7 negative.
 */
interface FacetSpec {
  style: number;
  ink: number;
  den: number;
}

/** Curated facet recipes — validated in scratch/02-pyramid.html. */
const RECIPES: { name: string; facets: FacetSpec[] }[] = [
  {
    // The reference look: dense dither + sparse accent dots + poster bands.
    name: 'reference',
    facets: [
      { style: 4, ink: 2, den: 1.5 },
      { style: 3, ink: 1, den: 0.8 },
      { style: 5, ink: 2, den: 1 },
      { style: 2, ink: 2, den: 1 },
    ],
  },
  {
    name: 'duotone',
    facets: [
      { style: 2, ink: 2, den: 1 },
      { style: 2, ink: 1, den: 1.3 },
      { style: 4, ink: 2, den: 1.2 },
      { style: 1, ink: 0, den: 1 },
    ],
  },
  {
    // Window facets: reality remixed (mosaic/negative) beside print bands.
    name: 'window',
    facets: [
      { style: 6, ink: 2, den: 1 },
      { style: 7, ink: 2, den: 1 },
      { style: 5, ink: 2, den: 1 },
      { style: 4, ink: 2, den: 1.4 },
    ],
  },
  {
    // Quiet suprematist planes: washes and bare shaded paper.
    name: 'minimal',
    facets: [
      { style: 1, ink: 0, den: 1 },
      { style: 0, ink: 0, den: 1 },
      { style: 1, ink: 1, den: 1 },
      { style: 0, ink: 0, den: 1 },
    ],
  },
];

const FACET_VERT = /* glsl */ `
  varying vec2 vScreen;
  void main() {
    vScreen = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FACET_FRAG = /* glsl */ `
  ${PRINT_UNIFORMS}
  uniform vec3 uPaper;
  uniform vec3 uInk0;
  uniform vec3 uInk1;
  uniform vec3 uInk2;
  uniform vec3 uInk;
  uniform float uStyle;
  uniform float uDensity;
  uniform float uAngle;
  uniform float uShade;
  uniform float uShadeK;
  uniform float uPaperBack;
  uniform float uAlpha;
  uniform float uEnergy;
  uniform vec2 uMisreg;
  varying vec2 vScreen;
  ${PRINT_HELPERS}

  void main() {
    vec2 s = vScreen + uMisreg;
    // Shaded paper backing — one key light (upper-left) across all facets is
    // what makes flat triangles read as a folded 3D form.
    vec3 dark = mix(uPaper, vec3(0.03, 0.03, 0.07), 0.6);
    vec3 lit = mix(uPaper, vec3(1.0, 1.0, 0.99), 0.28);
    vec3 base = uShade < 0.5
      ? mix(dark, uPaper, uShade * 2.0)
      : mix(uPaper, lit, (uShade - 0.5) * 2.0);
    base = mix(uPaper, base, min(uShadeK, 1.0));
    float cov = (1.0 - lumaAt(s)) * (0.75 + 0.5 * uEnergy);

    vec3 col = base;
    float mask = 0.0;
    if (uStyle < 0.5) {
      // Bare paper facet — backing only.
    } else if (uStyle < 1.5) {
      col = mix(base, uInk, 0.5);
      mask = 0.5;
    } else if (uStyle < 2.5) {
      float d = halftone(s, uDensity, uAngle, cov);
      col = mix(base, uInk, d);
      mask = d;
    } else if (uStyle < 3.5) {
      // Sparse accent dots: only the darkest areas print, wide spacing.
      float d = halftone(s, uDensity * 0.55, uAngle, max(0.0, (cov - 0.45) * 1.8));
      col = mix(base, uInk, d);
      mask = d;
    } else if (uStyle < 4.5) {
      // Stipple dither.
      vec2 grid = vec2(uDensity * 2.6 * uAspect, uDensity * 2.6);
      vec2 cell = floor(s * grid);
      float c = (1.0 - lumaAt((cell + 0.5) / grid)) * (0.85 + 0.55 * uEnergy);
      float m = step(phash(cell), c * 1.1);
      col = mix(base, uInk, m);
      mask = m;
    } else if (uStyle < 5.5) {
      // Posterize into palette bands (shaded paper as the light band).
      float l = lumaAt(s);
      col = uInk2;
      col = mix(col, uInk1, smoothstep(0.26, 0.32, l));
      col = mix(col, uInk0, smoothstep(0.48, 0.55, l));
      col = mix(col, base, smoothstep(0.72, 0.8, l));
      mask = 1.0;
    } else if (uStyle < 6.5) {
      // Mosaic window.
      vec2 grid = vec2(uDensity * uAspect, uDensity);
      col = videoAt((floor(s * grid) + 0.5) / grid);
      mask = 1.0;
    } else {
      // Negative window.
      col = 1.0 - videoAt(s);
      mask = 1.0;
    }
    col *= 1.0 - phash(s * 640.0) * 0.05; // print grain
    // The facet's light applied over the treatment inks too.
    col = uShade < 0.5
      ? mix(col, vec3(0.03, 0.03, 0.06), (0.5 - uShade) * 0.9 * uShadeK)
      : mix(col, vec3(1.0, 1.0, 0.97), (uShade - 0.5) * 0.45 * uShadeK);
    float alpha = uAlpha * clamp(uPaperBack + mask * (1.0 - uPaperBack), 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

interface FacetSlot {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
}

interface FacetFrame {
  tri: { x: number; y: number; z: number }[];
  shade: number;
  alpha: number;
  energy: number;
  handFacet: number; // 0..3 within the hand, keys the recipe slot
}

/**
 * The finger quad (4 playing fingertips, angle-sorted) rendered as a folded
 * screen-printed sheet: fold-2 splits along a diagonal (paper peel), or
 * pyramid-4 lifts the centroid into an apex. Each facet gets its own
 * "printing plate" — treatment, ink, density, halftone screen angle — and is
 * shaded by one virtual key light so the flat triangles read as 3D relief.
 * Hand spread drives the apex height: pinch to flatten, spread to raise.
 */
export class FacetFoldEffect extends EffectBase {
  readonly id = 'facets';
  readonly label = 'Facet Pyramid';

  private scene = new THREE.Scene();
  private slots: FacetSlot[] = [];
  private edgeDark!: THREE.LineSegments;
  private edgeDarkGeom!: THREE.BufferGeometry;
  private edgeDarkMat!: THREE.LineBasicMaterial;
  private edgeLight!: THREE.LineSegments;
  private edgeLightGeom!: THREE.BufferGeometry;
  private edgeLightMat!: THREE.LineBasicMaterial;

  private frame: FacetFrame[] = [];
  private apexSmooth = [0, 0];
  private aspect = 16 / 9;

  constructor() {
    super();
    this.paramDefs = [
      { key: 'mode', label: 'Mode (0=fold 1=pyramid)', min: 0, max: 1, step: 1, default: 1 },
      { key: 'apex', label: 'Apex height', min: 0, max: 0.6, step: 0.01, default: 0.24 },
      { key: 'spreadDrive', label: 'Spread drives apex', min: 0, max: 1, step: 1, default: 1 },
      { key: 'shade', label: 'Shading strength', min: 0, max: 1.5, step: 0.01, default: 1 },
      { key: 'pattern', label: 'Recipe (0ref 1duo 2win 3min)', min: 0, max: 3, step: 1, default: 0 },
      { key: 'rotate', label: 'Rotate plates', min: 0, max: 3, step: 1, default: 0 },
      { key: 'density', label: 'Screen density', min: 10, max: 200, step: 1, default: 90 },
      { key: 'angle', label: 'Screen angle step °', min: 0, max: 90, step: 1, default: 30 },
      { key: 'misreg', label: 'Misregistration', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'edge', label: 'Fold edges', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'paperBack', label: 'Paper backing', min: 0, max: 1, step: 0.01, default: 0.9 },
      { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, default: 0.95 },
    ];
    this.initDefaults();
  }

  init(ctx: EngineContext): void {
    for (let i = 0; i < MAX_FACETS; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      const material = new THREE.ShaderMaterial({
        vertexShader: FACET_VERT,
        fragmentShader: FACET_FRAG,
        uniforms: {
          uVideo: { value: ctx.videoTexture },
          uOff: { value: ctx.videoOff },
          uScl: { value: ctx.videoScl },
          uMirror: { value: 1 },
          uAspect: { value: this.aspect },
          uPaper: { value: ctx.paper },
          uInk0: { value: ctx.inks[0] },
          uInk1: { value: ctx.inks[1] },
          uInk2: { value: ctx.inks[2] },
          uInk: { value: ctx.inks[2] },
          uStyle: { value: 0 },
          uDensity: { value: 90 },
          uAngle: { value: 0 },
          uShade: { value: 0.5 },
          uShadeK: { value: 1 },
          uPaperBack: { value: 0.9 },
          uAlpha: { value: 0 },
          uEnergy: { value: 0 },
          uMisreg: { value: new THREE.Vector2() },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.slots.push({ mesh, geometry, material });
    }

    // Fold edges: dark crease on every boundary, paper highlight on lifted
    // edges — the Gestalt cue that separates facets from the video ground.
    const makeEdges = (mat: THREE.LineBasicMaterial) => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(MAX_EDGE_SEGMENTS * 2 * 3), 3),
      );
      const lines = new THREE.LineSegments(geom, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 1;
      this.scene.add(lines);
      return { geom, lines };
    };
    this.edgeDarkMat = new THREE.LineBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    ({ geom: this.edgeDarkGeom, lines: this.edgeDark } = makeEdges(this.edgeDarkMat));
    this.edgeLightMat = new THREE.LineBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    ({ geom: this.edgeLightGeom, lines: this.edgeLight } = makeEdges(this.edgeLightMat));
  }

  resize(ctx: EngineContext): void {
    this.aspect = ctx.width / Math.max(1, ctx.height);
  }

  update(features: FrameFeatures, dt: number): void {
    this.frame.length = 0;
    const hands: HandFeatures[] = [features.left, features.right];
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      if (hand.presence < 0.05) {
        this.apexSmooth[h] = 0;
        continue;
      }
      this.buildHand(hand, h, dt);
    }
  }

  private buildHand(hand: HandFeatures, h: number, dt: number): void {
    // The 4 playing fingertips (index..pinky) — the thumb-free quad.
    const pts = [hand.tips[1], hand.tips[2], hand.tips[3], hand.tips[4]];
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x / 4;
      cy += p.y / 4;
    }
    const ord = [...pts]
      .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
      .map((p) => ({ x: p.x, y: p.y, z: 0 }));

    // Spread of the quad drives the relief: pinch flattens, spread raises.
    let spread = 0;
    for (const p of ord) spread = Math.max(spread, Math.hypot(p.x - cx, p.y - cy));
    const drive = this.p('spreadDrive') > 0.5 ? Math.min(2, spread / 0.22) : 1;
    const target = this.p('apex') * drive;
    this.apexSmooth[h] += (target - this.apexSmooth[h]) * Math.min(1, dt * 8);
    const apex = this.apexSmooth[h];

    const energy = hand.speed / (hand.speed + 0.35);
    const alpha = hand.presence;

    if (this.p('mode') < 0.5) {
      // Fold-2: split along the shorter diagonal, lift the ridge.
      const d0 = Math.hypot(ord[0].x - ord[2].x, ord[0].y - ord[2].y);
      const d1 = Math.hypot(ord[1].x - ord[3].x, ord[1].y - ord[3].y);
      const [a, b, c, d] =
        d0 <= d1 ? [ord[0], ord[1], ord[2], ord[3]] : [ord[1], ord[2], ord[3], ord[0]];
      a.z = apex;
      c.z = apex;
      this.pushFacet([a, b, c], 0, alpha, energy);
      this.pushFacet([a, c, d], 1, alpha, energy);
    } else {
      // Pyramid-4: centroid apex, four side facets.
      const top = { x: cx, y: cy, z: apex };
      for (let i = 0; i < 4; i++) {
        this.pushFacet([top, ord[i], ord[(i + 1) % 4]], i, alpha, energy);
      }
    }
  }

  private pushFacet(
    tri: { x: number; y: number; z: number }[],
    handFacet: number,
    alpha: number,
    energy: number,
  ): void {
    // Fake normal in aspect-corrected space; one key light from upper-left.
    const ax = tri[0].x * this.aspect;
    const bx = tri[1].x * this.aspect;
    const cx = tri[2].x * this.aspect;
    const ux = bx - ax;
    const uy = tri[1].y - tri[0].y;
    const uz = tri[1].z - tri[0].z;
    const vx = cx - ax;
    const vy = tri[2].y - tri[0].y;
    const vz = tri[2].z - tri[0].z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    if (nz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    const d = (nx * -0.45 + ny * -0.55 + nz * 0.7) / nl;
    const shade = Math.max(0, Math.min(1, (d + 1) / 2));
    this.frame.push({ tri, shade, alpha, energy, handFacet });
  }

  render(ctx: EngineContext, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget): void {
    ctx.blit(input, output);
    if (this.frame.length === 0) {
      for (const slot of this.slots) slot.mesh.visible = false;
      this.edgeDark.visible = false;
      this.edgeLight.visible = false;
      return;
    }

    const recipe = RECIPES[Math.round(this.p('pattern')) % RECIPES.length];
    const rotate = Math.round(this.p('rotate'));
    const density = this.p('density');
    const angleStep = (this.p('angle') * Math.PI) / 180;
    const misreg = this.p('misreg') * 0.02;
    const shadeK = this.p('shade');
    const paperBack = this.p('paperBack');
    const opacity = this.p('opacity');
    const edge = this.p('edge');

    const darkPos = this.edgeDarkGeom.getAttribute('position') as THREE.BufferAttribute;
    const lightPos = this.edgeLightGeom.getAttribute('position') as THREE.BufferAttribute;
    let darkSeg = 0;
    let lightSeg = 0;
    let maxAlpha = 0;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const f = this.frame[i];
      if (!f) {
        slot.mesh.visible = false;
        continue;
      }
      slot.mesh.visible = true;
      maxAlpha = Math.max(maxAlpha, f.alpha);

      const pos = slot.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < 3; v++) pos.setXYZ(v, f.tri[v].x, f.tri[v].y, 0);
      pos.needsUpdate = true;

      const spec = recipe.facets[(f.handFacet + rotate) % recipe.facets.length];
      const u = slot.material.uniforms;
      u.uStyle.value = spec.style;
      u.uInk.value = ctx.inks[spec.ink];
      u.uDensity.value = density * spec.den;
      u.uAngle.value = 0.26 + f.handFacet * angleStep; // 15° base, print-shop steps
      u.uShade.value = f.shade;
      u.uShadeK.value = shadeK;
      u.uPaperBack.value = paperBack;
      u.uAlpha.value = opacity * f.alpha;
      u.uEnergy.value = f.energy;
      u.uMirror.value = ctx.mirror;
      u.uAspect.value = this.aspect;
      const dir = f.handFacet * 2.4 + (i >= FACETS_PER_HAND ? 1.2 : 0);
      (u.uMisreg.value as THREE.Vector2).set(Math.cos(dir) * misreg, Math.sin(dir) * misreg);

      // Edge segments: every boundary gets a crease; lifted edges a highlight.
      for (let e = 0; e < 3; e++) {
        const a = f.tri[e];
        const b = f.tri[(e + 1) % 3];
        if (darkSeg < MAX_EDGE_SEGMENTS) {
          darkPos.setXYZ(darkSeg * 2, a.x, a.y, 0);
          darkPos.setXYZ(darkSeg * 2 + 1, b.x, b.y, 0);
          darkSeg++;
        }
        if ((a.z > 0 || b.z > 0) && lightSeg < MAX_EDGE_SEGMENTS) {
          lightPos.setXYZ(lightSeg * 2, a.x, a.y, 0);
          lightPos.setXYZ(lightSeg * 2 + 1, b.x, b.y, 0);
          lightSeg++;
        }
      }
    }

    darkPos.needsUpdate = true;
    lightPos.needsUpdate = true;
    this.edgeDarkGeom.setDrawRange(0, darkSeg * 2);
    this.edgeLightGeom.setDrawRange(0, lightSeg * 2);
    this.edgeDark.visible = edge > 0.01 && darkSeg > 0;
    this.edgeLight.visible = edge > 0.01 && lightSeg > 0;
    this.edgeDarkMat.color.copy(ctx.inks[2]);
    this.edgeDarkMat.opacity = edge * 0.45 * maxAlpha;
    this.edgeLightMat.color.copy(ctx.paper);
    this.edgeLightMat.opacity = edge * 0.7 * maxAlpha;

    ctx.drawScene(this.scene, output);
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.geometry.dispose();
      slot.material.dispose();
    }
    this.edgeDarkGeom.dispose();
    this.edgeDarkMat.dispose();
    this.edgeLightGeom.dispose();
    this.edgeLightMat.dispose();
  }
}
