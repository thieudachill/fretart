import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface RawHand {
  /** 21 landmarks, normalized video coordinates (x right, y down). */
  landmarks: { x: number; y: number; z: number }[];
  /** 'Left' | 'Right' — corrected to the person's actual hand. */
  handedness: 'Left' | 'Right';
  score: number;
}

/**
 * Thin wrapper around MediaPipe's HandLandmarker (GPU delegate, video mode).
 * Model + wasm are served locally from /public so the app has no runtime CDN
 * dependency.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;
  private lastResult: RawHand[] = [];
  /** Detection cost of the most recent frame, ms. */
  inferenceMs = 0;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks('/wasm');
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: '/models/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  }

  /**
   * Detect hands on the current video frame. Returns the previous result when
   * the video has not advanced (rAF can outpace the camera's 30fps).
   */
  detect(video: HTMLVideoElement, nowMs: number): RawHand[] {
    if (!this.landmarker || video.readyState < 2) return this.lastResult;
    if (video.currentTime === this.lastVideoTime) return this.lastResult;
    this.lastVideoTime = video.currentTime;

    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(video, nowMs);
    this.inferenceMs = performance.now() - t0;

    const hands: RawHand[] = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      const category = result.handednesses[i]?.[0];
      if (!category) continue;
      // MediaPipe labels handedness as if the image were mirrored (selfie
      // view). Our video frames are unmirrored, so flip the label to get the
      // person's actual hand.
      const label = category.categoryName === 'Left' ? 'Right' : 'Left';
      hands.push({
        landmarks: result.landmarks[i],
        handedness: label,
        score: category.score,
      });
    }
    this.lastResult = hands;
    return hands;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
