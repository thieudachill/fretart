/**
 * In-app capture of the effect canvas via MediaRecorder. Produces WebM
 * (VP9 when available) and auto-downloads on stop. For mp4 delivery, convert
 * afterwards: `ffmpeg -i clip.webm -c:v libx264 -crf 18 clip.mp4`.
 */
export class Recorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  get recording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  start(canvas: HTMLCanvasElement): void {
    if (this.recording) return;
    const stream = canvas.captureStream(30);
    const mimeType =
      ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      ) ?? '';
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 12_000_000,
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(250);
  }

  stop(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'video/webm' });
      const stamp = new Date()
        .toISOString()
        .replace(/[:T]/g, '-')
        .slice(0, 19);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fretart-${stamp}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      this.chunks = [];
    };
    this.mediaRecorder.stop();
  }
}
