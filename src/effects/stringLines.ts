import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { FrameFeatures, HandFeatures, Vec2 } from '../core/types';
import { EffectBase, type EngineContext } from './Effect';

const SEGMENTS = 24; // points per polyline — enough for smooth vibration curves
const MAX_LINES = 25; // 10 per-hand pairs x 2 hands + 5 cross-hand

interface LineSlot {
  line: Line2;
  geometry: LineGeometry;
  material: LineMaterial;
  positions: Float32Array;
}

interface Connection {
  a: Vec2;
  b: Vec2;
  energy: number; // avg endpoint tip speed, drives vibration + brightness
  alpha: number;
  inkIndex: number;
}

/**
 * Glowing lines stretched between fingertips — constructivist line-work /
 * Naum Gabo string sculptures. Fast finger motion makes the strings "ring"
 * with a sinusoidal vibration, so plucking gestures visibly excite them.
 */
export class StringLinesEffect extends EffectBase {
  readonly id = 'strings';
  readonly label = 'String Lines';

  private scene = new THREE.Scene();
  private slots: LineSlot[] = [];
  private time = 0;
  private connections: Connection[] = [];

  constructor() {
    super();
    this.paramDefs = [
      { key: 'ink', label: 'Render (0=glow 1=ink)', min: 0, max: 1, step: 1, default: 0 },
      { key: 'web', label: 'Hand web (0=fan 1=full)', min: 0, max: 1, step: 1, default: 0 },
      // When fretting, the thumb tip sits at the palm (behind the neck), so
      // by default strings anchor to the four playing fingertips only.
      { key: 'thumb', label: 'Use thumb (0=tips only)', min: 0, max: 1, step: 1, default: 0 },
      { key: 'cross', label: 'Cross-hand strings', min: 0, max: 1, step: 1, default: 1 },
      { key: 'thickness', label: 'Thickness px', min: 0.5, max: 8, step: 0.1, default: 2 },
      { key: 'glow', label: 'Brightness', min: 0, max: 1, step: 0.01, default: 0.8 },
      { key: 'waviness', label: 'Waviness', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'vibration', label: 'Vibration (motion)', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'frequency', label: 'Wave count', min: 1, max: 8, step: 1, default: 3 },
    ];
    this.initDefaults();
  }

  init(_ctx: EngineContext): void {
    for (let i = 0; i < MAX_LINES; i++) {
      const geometry = new LineGeometry();
      const positions = new Float32Array(SEGMENTS * 3);
      geometry.setPositions(Array.from(positions));
      const material = new LineMaterial({
        color: 0xffffff,
        linewidth: 2,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      });
      const line = new Line2(geometry, material);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.slots.push({ line, geometry, material, positions });
    }
  }

  resize(ctx: EngineContext): void {
    for (const slot of this.slots) slot.material.resolution.set(ctx.width, ctx.height);
  }

  update(features: FrameFeatures, dt: number): void {
    this.time += dt;
    this.connections.length = 0;

    const fullWeb = this.p('web') > 0.5;
    const useThumb = this.p('thumb') > 0.5;
    const first = useThumb ? 0 : 1;
    for (const hand of [features.left, features.right]) {
      if (hand.presence <= 0.01) continue;
      if (fullWeb) {
        for (let a = first; a < 5; a++) {
          for (let b = a + 1; b < 5; b++) this.addConnection(hand, a, b);
        }
      } else if (useThumb) {
        // Fan: thumb to every finger + adjacent fingertips — reads as a hand
        // of extra strings without clutter.
        for (let b = 1; b < 5; b++) this.addConnection(hand, 0, b);
        for (let a = 1; a < 4; a++) this.addConnection(hand, a, a + 1);
      } else {
        // Tips only: adjacent chain + index↔pinky closing string, so the
        // four playing fingers still read as one instrument-like figure.
        for (let a = 1; a < 4; a++) this.addConnection(hand, a, a + 1);
        this.addConnection(hand, 1, 4);
      }
    }

    if (this.p('cross') > 0.5 && features.left.presence > 0.01 && features.right.presence > 0.01) {
      const alpha = Math.min(features.left.presence, features.right.presence);
      for (let t = first; t < 5; t++) {
        this.connections.push({
          a: features.left.tips[t],
          b: features.right.tips[t],
          energy: (features.left.tipSpeeds[t] + features.right.tipSpeeds[t]) / 2,
          alpha,
          inkIndex: t % 3,
        });
      }
    }
  }

  private addConnection(hand: HandFeatures, a: number, b: number): void {
    this.connections.push({
      a: hand.tips[a],
      b: hand.tips[b],
      energy: (hand.tipSpeeds[a] + hand.tipSpeeds[b]) / 2,
      alpha: hand.presence,
      inkIndex: (a + b) % 3,
    });
  }

  render(ctx: EngineContext, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget): void {
    ctx.blit(input, output);

    const aspect = ctx.width / Math.max(1, ctx.height);
    const vib = this.p('vibration');
    const waves = this.p('frequency');
    const glow = this.p('glow');
    const thickness = this.p('thickness');
    // Ink mode: normal blending, like pen lines drawn on the frame — the
    // plotter/one-line-drawing look. Glow mode: additive light strings.
    const inkMode = this.p('ink') > 0.5;
    const blending = inkMode ? THREE.NormalBlending : THREE.AdditiveBlending;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const conn = this.connections[i];
      if (!conn) {
        slot.line.visible = false;
        continue;
      }
      slot.line.visible = true;

      const dx = conn.b.x - conn.a.x;
      const dy = conn.b.y - conn.a.y;
      const len = Math.hypot(dx, dy) + 1e-6;
      // Perpendicular, aspect-corrected so displacement looks uniform on screen.
      const nx = -dy / len / aspect;
      const ny = (dx / len) * aspect;
      // Waviness is a constant wave the line always carries (0 = straight);
      // vibration adds on top only when the fingertips are moving.
      const baseAmp = this.p('waviness') * 0.028;
      const motionAmp = vib * 0.035 * Math.min(1, (conn.energy / (conn.energy + 0.4)) * 2.5);
      const amp = baseAmp + motionAmp;
      const phase = this.time * (baseAmp > 0 && motionAmp < 0.002 ? 3.5 : 14) + i * 1.7;

      for (let s = 0; s < SEGMENTS; s++) {
        const t = s / (SEGMENTS - 1);
        const envelope = Math.sin(t * Math.PI); // pin endpoints like a real string
        const wobble = Math.sin(t * Math.PI * waves + phase) * amp * envelope;
        slot.positions[s * 3] = conn.a.x + dx * t + nx * wobble;
        slot.positions[s * 3 + 1] = conn.a.y + dy * t + ny * wobble;
        slot.positions[s * 3 + 2] = 0;
      }
      slot.geometry.setPositions(Array.from(slot.positions));

      if (slot.material.blending !== blending) {
        slot.material.blending = blending;
        slot.material.needsUpdate = true;
      }
      const energyBoost = 0.35 + 0.65 * Math.min(1, conn.energy / (conn.energy + 0.3) * 2.5);
      slot.material.color.copy(ctx.inks[conn.inkIndex]);
      // Ink lines keep steadier presence; energy nudges rather than flashes.
      slot.material.opacity = inkMode
        ? glow * conn.alpha * (0.65 + 0.35 * energyBoost)
        : glow * conn.alpha * energyBoost;
      slot.material.linewidth = thickness;
    }

    ctx.drawScene(this.scene, output);
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.geometry.dispose();
      slot.material.dispose();
    }
  }
}
