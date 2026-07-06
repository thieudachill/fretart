import * as THREE from 'three';
import type { Camera } from '../input/camera';
import type { ViewTransform } from '../tracking/features';
import type { FrameFeatures } from './types';
import { PALETTES } from './types';
import type { EffectBase, EngineContext } from '../effects/Effect';

// Raw pass-through pipeline: video pixels and palette hex values go through
// the shader chain untouched (no linear-light conversion), so what you pick
// is what you see.
THREE.ColorManagement.enabled = false;

const COPY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COPY_FRAG = /* glsl */ `
  uniform sampler2D tInput;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tInput, vUv);
  }
`;

const BASE_FRAG = /* glsl */ `
  uniform sampler2D uVideo;
  uniform vec2 uOff;
  uniform vec2 uScl;
  uniform float uMirror;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (uMirror > 0.5) uv.x = 1.0 - uv.x;
    vec3 c = texture2D(uVideo, uOff + uv * uScl).rgb;
    gl_FragColor = vec4(c * uOpacity, 1.0);
  }
`;

/** Full-screen triangle-strip quad in clip space (camera-independent). */
class FSQuad {
  private scene = new THREE.Scene();
  private mesh: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.mesh);
  }

  render(renderer: THREE.WebGLRenderer, material: THREE.Material): void {
    this.mesh.material = material;
    renderer.render(this.scene, this.cam);
  }
}

/**
 * Owns the WebGL renderer, the ping-pong render targets, and the ordered
 * effect chain. Pipeline per frame:
 *   video base pass -> [each enabled effect] -> screen.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: EngineContext;
  readonly effects: EffectBase[] = [];

  /** Global controls (bound to the UI panel). */
  mirror = true;
  videoOpacity = 1.0;
  paletteIndex = 0;

  view: ViewTransform = { offU: 0, offV: 0, sclU: 1, sclV: 1 };

  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private quad = new FSQuad();
  private copyMat: THREE.ShaderMaterial;
  private baseMat: THREE.ShaderMaterial;
  private videoTexture: THREE.VideoTexture;

  constructor(
    container: HTMLElement,
    private camera: Camera,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // needed for clean canvas captureStream frames
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1); // full DPR is wasted on stylized output; keep fill-rate for effects
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('render');
    container.appendChild(this.canvas);

    this.videoTexture = new THREE.VideoTexture(camera.video);
    this.videoTexture.colorSpace = THREE.NoColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;

    const makeRT = () =>
      new THREE.WebGLRenderTarget(2, 2, {
        type: THREE.HalfFloatType, // avoids banding in the feedback/echo chain
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
      });
    this.rtA = makeRT();
    this.rtB = makeRT();

    this.copyMat = new THREE.ShaderMaterial({
      vertexShader: COPY_VERT,
      fragmentShader: COPY_FRAG,
      uniforms: { tInput: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.baseMat = new THREE.ShaderMaterial({
      vertexShader: COPY_VERT,
      fragmentShader: BASE_FRAG,
      uniforms: {
        uVideo: { value: this.videoTexture },
        uOff: { value: new THREE.Vector2(0, 0) },
        uScl: { value: new THREE.Vector2(1, 1) },
        uMirror: { value: 1 },
        uOpacity: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const sceneCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);

    const engine = this;
    this.ctx = {
      renderer: this.renderer,
      videoTexture: this.videoTexture,
      videoOff: this.baseMat.uniforms.uOff.value,
      videoScl: this.baseMat.uniforms.uScl.value,
      mirror: 1,
      width: 2,
      height: 2,
      palette: PALETTES[0],
      paper: new THREE.Color(PALETTES[0].paper),
      inks: [
        new THREE.Color(PALETTES[0].inks[0]),
        new THREE.Color(PALETTES[0].inks[1]),
        new THREE.Color(PALETTES[0].inks[2]),
      ],
      camera: sceneCamera,
      blit(input, output) {
        engine.copyMat.uniforms.tInput.value = input.texture;
        engine.renderer.setRenderTarget(output);
        engine.quad.render(engine.renderer, engine.copyMat);
      },
      fsPass(material, output) {
        engine.renderer.setRenderTarget(output);
        engine.quad.render(engine.renderer, material);
      },
      drawScene(scene, output) {
        engine.renderer.setRenderTarget(output);
        engine.renderer.render(scene, sceneCamera);
      },
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  addEffect(effect: EffectBase): void {
    effect.init(this.ctx);
    effect.resize(this.ctx);
    this.effects.push(effect);
  }

  resize(): void {
    const w = Math.max(2, window.innerWidth);
    const h = Math.max(2, window.innerHeight);
    this.renderer.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.ctx.width = w;
    this.ctx.height = h;
    this.updateViewTransform();
    for (const e of this.effects) e.resize(this.ctx);
  }

  /** Cover-crop the video into the canvas; also used to map landmarks. */
  updateViewTransform(): void {
    const va = this.camera.aspect || 16 / 9;
    const ca = this.ctx.width / this.ctx.height;
    let sclU = 1;
    let sclV = 1;
    if (va > ca) sclU = ca / va;
    else sclV = va / ca;
    this.view = { offU: (1 - sclU) / 2, offV: (1 - sclV) / 2, sclU, sclV };
    this.baseMat.uniforms.uOff.value.set(this.view.offU, this.view.offV);
    this.baseMat.uniforms.uScl.value.set(sclU, sclV);
  }

  setPalette(index: number): void {
    this.paletteIndex = index;
    const p = PALETTES[index] ?? PALETTES[0];
    this.ctx.palette = p;
    this.ctx.paper.set(p.paper);
    this.ctx.inks[0].set(p.inks[0]);
    this.ctx.inks[1].set(p.inks[1]);
    this.ctx.inks[2].set(p.inks[2]);
  }

  render(features: FrameFeatures, dt: number): void {
    this.updateViewTransform();
    this.ctx.mirror = this.mirror ? 1 : 0;
    this.baseMat.uniforms.uMirror.value = this.ctx.mirror;
    this.baseMat.uniforms.uOpacity.value = this.videoOpacity;

    // 1. Base video into rtA.
    this.ctx.fsPass(this.baseMat, this.rtA);

    // 2. Effect chain, ping-ponging between A and B.
    for (const effect of this.effects) {
      if (!effect.enabled) continue;
      effect.update(features, dt);
      effect.render(this.ctx, this.rtA, this.rtB);
      [this.rtA, this.rtB] = [this.rtB, this.rtA];
    }

    // 3. Composite to screen.
    this.copyMat.uniforms.tInput.value = this.rtA.texture;
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer, this.copyMat);
  }
}
