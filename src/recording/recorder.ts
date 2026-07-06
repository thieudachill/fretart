/**
 * In-app capture of the performance — the effect canvas muxed with the mic
 * track when one is listening. Container/codec is detected at runtime:
 * mp4 (H.264 + AAC) where MediaRecorder supports it, WebM otherwise
 * (convert with `ffmpeg -i clip.webm -c:v libx264 -crf 18 clip.mp4`).
 * Files auto-download as `fretart-<preset>-<timestamp>.<ext>`.
 */
export interface RecordingOptions {
  fps: number;
  quality: 'share' | 'master';
  /** Include the mic track (only takes effect while the mic is listening). */
  audio: boolean;
}

const VIDEO_BITRATE: Record<RecordingOptions['quality'], number> = {
  share: 8_000_000,
  master: 24_000_000,
};
const AUDIO_BITRATE = 192_000;

// Ordered by preference; the audio lists carry AAC/Opus so the muxer picks a
// container that can actually hold the mic track.
const MIME_WITH_AUDIO = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];
const MIME_VIDEO_ONLY = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pickMimeType(withAudio: boolean): { mimeType: string; ext: string } {
  const candidates = withAudio ? MIME_WITH_AUDIO : MIME_VIDEO_ONLY;
  const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  return { mimeType, ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

export function makeFilename(label: string, ext: string, when = new Date()): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stamp = when.toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return `fretart-${slug ? `${slug}-` : ''}${stamp}.${ext}`;
}

function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export class Recorder {
  /** Mutated by the panel and persisted there (`fretart.recording.v1`). */
  readonly options: RecordingOptions = { fps: 60, quality: 'share', audio: true };

  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ext = 'webm';
  private label = '';
  private startedAt = 0;

  get recording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /** Seconds since start; 0 when idle (drives the REC timer). */
  get elapsed(): number {
    return this.recording ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  start(canvas: HTMLCanvasElement, audioTrack: MediaStreamTrack | null = null, label = ''): void {
    if (this.recording) return;
    const withAudio = this.options.audio && audioTrack !== null;
    const video = canvas.captureStream(this.options.fps);
    const stream = withAudio
      ? new MediaStream([...video.getVideoTracks(), audioTrack])
      : video;
    const { mimeType, ext } = pickMimeType(withAudio);
    this.ext = ext;
    this.label = label;
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: VIDEO_BITRATE[this.options.quality],
      ...(withAudio ? { audioBitsPerSecond: AUDIO_BITRATE } : {}),
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(250);
    this.startedAt = Date.now();
  }

  stop(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
      download(blob, makeFilename(this.label, this.ext));
      this.chunks = [];
    };
    this.mediaRecorder.stop();
  }

  /** Full-resolution still of the canvas (the engine keeps its buffer alive). */
  snapshot(canvas: HTMLCanvasElement, label = ''): void {
    canvas.toBlob((blob) => {
      if (blob) download(blob, makeFilename(label, 'png'));
    }, 'image/png');
  }
}
