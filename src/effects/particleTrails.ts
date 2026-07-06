import * as THREE from 'three';
import type { FrameFeatures, HandFeatures } from '../core/types';
import { EffectBase, type EngineContext } from './Effect';

const MAX_PARTICLES = 4096;

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uPixelScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelScale;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float mask = smoothstep(0.5, 0.12, d);
    gl_FragColor = vec4(vColor, vAlpha * mask);
  }
`;

/**
 * Fingertips emit paint-like particles — gestural abstraction in the spirit
 * of action painting: emission rate and throw velocity follow finger speed,
 * so picking flurries literally paint dense gestures across the frame.
 */
export class ParticleTrailsEffect extends EffectBase {
  readonly id = 'particles';
  readonly label = 'Particle Trails';

  private scene = new THREE.Scene();
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  // CPU simulation state (structure-of-arrays for cache-friendly updates).
  private px = new Float32Array(MAX_PARTICLES);
  private py = new Float32Array(MAX_PARTICLES);
  private vx = new Float32Array(MAX_PARTICLES);
  private vy = new Float32Array(MAX_PARTICLES);
  private age = new Float32Array(MAX_PARTICLES);
  private life = new Float32Array(MAX_PARTICLES);
  private baseSize = new Float32Array(MAX_PARTICLES);
  private inkIndex = new Uint8Array(MAX_PARTICLES);
  private cursor = 0;
  /** Fractional emission accumulator per hand per fingertip. */
  private emitAcc = new Float32Array(10);

  constructor() {
    super();
    this.paramDefs = [
      { key: 'rate', label: 'Emission rate', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'thumb', label: 'Use thumb (0=tips only)', min: 0, max: 1, step: 1, default: 0 },
      { key: 'life', label: 'Lifetime s', min: 0.2, max: 4, step: 0.05, default: 1.4 },
      { key: 'size', label: 'Size', min: 1, max: 24, step: 0.5, default: 7 },
      { key: 'inherit', label: 'Velocity inherit', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'scatter', label: 'Scatter', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'rise', label: 'Rise/fall', min: -1, max: 1, step: 0.01, default: 0.25 },
      { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, default: 0.75 },
    ];
    this.initDefaults();
  }

  init(_ctx: EngineContext): void {
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const alphas = new Float32Array(MAX_PARTICLES);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPixelScale: { value: 1 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  resize(ctx: EngineContext): void {
    // Keep particle pixel sizes proportional on different window sizes.
    this.material.uniforms.uPixelScale.value = ctx.height / 720;
  }

  update(features: FrameFeatures, dt: number): void {
    const step = Math.min(dt, 1 / 20);

    // Simulate existing particles.
    const drag = Math.pow(0.92, step * 60);
    const rise = -this.p('rise') * 0.12; // negative y is up on screen
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += step;
      this.vx[i] *= drag;
      this.vy[i] = this.vy[i] * drag + rise * step;
      this.px[i] += this.vx[i] * step;
      this.py[i] += this.vy[i] * step;
    }

    this.emitFromHand(features.left, 0, step);
    this.emitFromHand(features.right, 5, step);
  }

  private emitFromHand(hand: HandFeatures, accOffset: number, dt: number): void {
    if (hand.presence < 0.05) return;
    const rate = this.p('rate');
    const inherit = this.p('inherit');
    const scatter = this.p('scatter');
    const life = this.p('life');
    const size = this.p('size');
    const first = this.p('thumb') > 0.5 ? 0 : 1;

    for (let t = first; t < 5; t++) {
      const speed = hand.tipSpeeds[t];
      // Faster fingertips emit much more — motion paints, stillness rests.
      const speedFactor = speed / (speed + 0.25);
      const perSecond = rate * hand.presence * (4 + 220 * speedFactor);
      this.emitAcc[accOffset + t] += perSecond * dt;

      while (this.emitAcc[accOffset + t] >= 1) {
        this.emitAcc[accOffset + t] -= 1;
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % MAX_PARTICLES;
        const angle = Math.random() * Math.PI * 2;
        const burst = scatter * (0.05 + Math.random() * 0.25);
        this.px[i] = hand.tips[t].x + (Math.random() - 0.5) * 0.006;
        this.py[i] = hand.tips[t].y + (Math.random() - 0.5) * 0.006;
        this.vx[i] = hand.tipVelocities[t].x * inherit + Math.cos(angle) * burst;
        this.vy[i] = hand.tipVelocities[t].y * inherit + Math.sin(angle) * burst;
        this.age[i] = 0;
        this.life[i] = life * (0.5 + Math.random() * 0.5);
        this.baseSize[i] = size * (0.4 + Math.random() * 0.6);
        this.inkIndex[i] = t % 3;
      }
    }
  }

  render(ctx: EngineContext, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget): void {
    ctx.blit(input, output);

    const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const sizes = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alphas = this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    const opacity = this.p('opacity');

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const alive = this.age[i] < this.life[i];
      if (!alive) {
        alphas.setX(i, 0);
        continue;
      }
      const lifeT = this.age[i] / this.life[i];
      const fade = Math.pow(1 - lifeT, 1.4);
      positions.setXYZ(i, this.px[i], this.py[i], 0);
      const ink = ctx.inks[this.inkIndex[i]];
      colors.setXYZ(i, ink.r, ink.g, ink.b);
      sizes.setX(i, this.baseSize[i] * (0.4 + 0.6 * fade));
      alphas.setX(i, fade * opacity);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;

    ctx.drawScene(this.scene, output);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
