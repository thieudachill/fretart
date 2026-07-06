import type { FrameFeatures, HandFeatures } from '../core/types';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/**
 * 2D-canvas skeleton overlay for verifying tracking quality. Not part of the
 * rendered art — excluded from recordings (separate canvas).
 */
export class DebugOverlay {
  visible = false;
  private ctx2d: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx2d = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  draw(features: FrameFeatures): void {
    const g = this.ctx2d;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.visible) return;
    this.drawHand(features.left, '#38e8ff');
    this.drawHand(features.right, '#ff5ea8');
  }

  private drawHand(hand: HandFeatures, color: string): void {
    if (hand.presence < 0.02) return;
    const g = this.ctx2d;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.globalAlpha = hand.presence * 0.9;
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 1.5;

    g.beginPath();
    for (const [a, b] of CONNECTIONS) {
      g.moveTo(hand.landmarks[a].x * w, hand.landmarks[a].y * h);
      g.lineTo(hand.landmarks[b].x * w, hand.landmarks[b].y * h);
    }
    g.stroke();

    // Fingertips scaled by their speed so velocity response is visible.
    for (let t = 0; t < 5; t++) {
      const r = 3 + Math.min(14, hand.tipSpeeds[t] * 18);
      g.beginPath();
      g.arc(hand.tips[t].x * w, hand.tips[t].y * h, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}
