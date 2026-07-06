export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Webcam wrapper. Owns the <video> element that both the tracker and the
 * renderer read from.
 */
export class Camera {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  async start(deviceId?: string): Promise<void> {
    this.stop();
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // 60fps halves capture latency and feeds the tracker fresher frames;
        // cameras that can't do it fall back gracefully (ideal, not exact).
        frameRate: { ideal: 60 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    await this.video.play();
    // Wait until dimensions are known.
    if (this.video.videoWidth === 0) {
      await new Promise<void>((resolve) => {
        this.video.onloadedmetadata = () => resolve();
      });
    }
  }

  /**
   * Sim mode: a canvas-generated stream stands in for the webcam, so the
   * whole video-texture pipeline runs identically with no camera permission.
   * The image is a quiet studio-wall gradient with a slow breathing glow —
   * enough content for the print/lens effects to have something to sample.
   */
  async startSim(): Promise<void> {
    this.stop();
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const g = canvas.getContext('2d')!;
    const draw = () => {
      const t = performance.now() / 1000;
      const grad = g.createLinearGradient(0, 0, 0, 720);
      grad.addColorStop(0, '#3b372f');
      grad.addColorStop(1, '#241f1c');
      g.fillStyle = grad;
      g.fillRect(0, 0, 1280, 720);
      const glow = g.createRadialGradient(640, 400, 60, 640, 400, 620);
      const breathe = 0.10 + 0.04 * Math.sin(t * 0.4);
      glow.addColorStop(0, `rgba(214, 197, 165, ${breathe})`);
      glow.addColorStop(1, 'rgba(214, 197, 165, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 1280, 720);
    };
    this.stream = canvas.captureStream(30);
    draw();
    this.simTimer = setInterval(draw, 100);
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop(): void {
    if (this.simTimer !== null) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  get aspect(): number {
    return this.video.videoWidth / Math.max(1, this.video.videoHeight);
  }

  /** Camera labels are only populated after permission has been granted. */
  static async listDevices(): Promise<CameraDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  }
}
