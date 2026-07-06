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

  stop(): void {
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
