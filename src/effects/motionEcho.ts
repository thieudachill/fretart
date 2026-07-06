import * as THREE from 'three';
import { EffectBase, type EngineContext } from './Effect';

const FRAG = /* glsl */ `
  uniform sampler2D tInput;
  uniform sampler2D tHistory;
  uniform float uPersist;
  uniform float uZoom;
  uniform float uHueShift;
  uniform float uMix;
  varying vec2 vUv;

  vec3 hueRotate(vec3 c, float a) {
    const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYIQ * c;
    float h = atan(yiq.z, yiq.y) + a;
    float chroma = length(yiq.yz);
    return toRGB * vec3(yiq.x, chroma * cos(h), chroma * sin(h));
  }

  void main() {
    vec3 current = texture2D(tInput, vUv).rgb;
    // Sample history slightly zoomed so trails bloom outward from center.
    vec2 huv = (vUv - 0.5) * (1.0 - uZoom) + 0.5;
    vec3 hist = texture2D(tHistory, huv).rgb * uPersist;
    hist = clamp(hueRotate(hist, uHueShift), 0.0, 1.0);
    // Screen blend keeps light content from both without blowing out.
    vec3 screened = 1.0 - (1.0 - current) * (1.0 - hist);
    gl_FragColor = vec4(mix(current, screened, uMix), 1.0);
  }
`;

/**
 * Feedback trails — chronophotography (Marey) / long-exposure ghosts. Blends
 * the previous composite back into the frame with decay, outward zoom drift,
 * and a slow hue rotation, so motion leaves colored echoes.
 */
export class MotionEchoEffect extends EffectBase {
  readonly id = 'echo';
  readonly label = 'Motion Echo';

  private material: THREE.ShaderMaterial;
  private history: THREE.WebGLRenderTarget;

  constructor() {
    super();
    this.paramDefs = [
      { key: 'persist', label: 'Persistence', min: 0, max: 0.98, step: 0.01, default: 0.82 },
      { key: 'mix', label: 'Intensity', min: 0, max: 1, step: 0.01, default: 0.65 },
      { key: 'drift', label: 'Zoom drift', min: -1, max: 1, step: 0.01, default: 0.15 },
      { key: 'hue', label: 'Hue drift', min: -1, max: 1, step: 0.01, default: 0.12 },
    ];
    this.initDefaults();

    this.history = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: FRAG,
      uniforms: {
        tInput: { value: null },
        tHistory: { value: null },
        uPersist: { value: 0.8 },
        uZoom: { value: 0 },
        uHueShift: { value: 0 },
        uMix: { value: 0.6 },
      },
      depthTest: false,
      depthWrite: false,
    });
  }

  resize(ctx: EngineContext): void {
    this.history.setSize(ctx.width, ctx.height);
  }

  render(ctx: EngineContext, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tInput.value = input.texture;
    u.tHistory.value = this.history.texture;
    u.uPersist.value = this.p('persist');
    u.uMix.value = this.p('mix');
    u.uZoom.value = this.p('drift') * 0.008;
    u.uHueShift.value = this.p('hue') * 0.06;
    ctx.fsPass(this.material, output);
    // The blended result becomes next frame's history (self-feedback).
    ctx.blit(output, this.history);
  }

  dispose(): void {
    this.history.dispose();
    this.material.dispose();
  }
}
