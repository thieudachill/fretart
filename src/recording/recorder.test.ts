import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Recorder } from './recorder';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static supported = ['video/webm;codecs=vp9', 'video/webm'];
  static isTypeSupported(t: string): boolean {
    return MockMediaRecorder.supported.includes(t);
  }

  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;

  constructor(
    public stream: unknown,
    public options: { mimeType?: string; videoBitsPerSecond?: number } = {},
  ) {
    this.mimeType = options.mimeType ?? '';
    MockMediaRecorder.instances.push(this);
  }

  start(_timesliceMs?: number): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.onstop?.();
  }
}

const fakeCanvas = { captureStream: () => ({}) } as unknown as HTMLCanvasElement;

describe('Recorder', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;
  let downloads: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    MockMediaRecorder.instances = [];
    MockMediaRecorder.supported = ['video/webm;codecs=vp9', 'video/webm'];
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    createObjectURL = vi.fn(() => 'blob:mock');
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    downloads = [];
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
  });

  afterEach(() => {
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts recording with the best supported WebM codec', () => {
    const rec = new Recorder();
    rec.start(fakeCanvas);
    expect(rec.recording).toBe(true);
    const mr = MockMediaRecorder.instances[0];
    expect(mr.options.mimeType).toBe('video/webm;codecs=vp9');
    expect(mr.state).toBe('recording');
  });

  it('falls back to browser defaults when nothing matches', () => {
    MockMediaRecorder.supported = [];
    const rec = new Recorder();
    rec.start(fakeCanvas);
    expect(MockMediaRecorder.instances[0].options.mimeType).toBeUndefined();
  });

  it('ignores start() while already recording', () => {
    const rec = new Recorder();
    rec.start(fakeCanvas);
    rec.start(fakeCanvas);
    expect(MockMediaRecorder.instances).toHaveLength(1);
  });

  it('stop() downloads the collected chunks and ends the session', () => {
    const rec = new Recorder();
    rec.start(fakeCanvas);
    const mr = MockMediaRecorder.instances[0];
    mr.ondataavailable?.({ data: new Blob(['abc']) });
    mr.ondataavailable?.({ data: new Blob([]) }); // empty chunks are dropped

    rec.stop();
    expect(rec.recording).toBe(false);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^fretart-.+\.webm$/);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.size).toBe(3); // only the non-empty chunk

    // The object URL is released after the download grace period.
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('stop() before start() is a harmless no-op', () => {
    const rec = new Recorder();
    expect(() => rec.stop()).not.toThrow();
    expect(downloads).toHaveLength(0);
  });

  it('double stop() downloads only once', () => {
    const rec = new Recorder();
    rec.start(fakeCanvas);
    MockMediaRecorder.instances[0].ondataavailable?.({ data: new Blob(['x']) });
    rec.stop();
    rec.stop();
    expect(downloads).toHaveLength(1);
  });

  it('can record again after stopping', () => {
    const rec = new Recorder();
    rec.start(fakeCanvas);
    rec.stop();
    rec.start(fakeCanvas);
    expect(rec.recording).toBe(true);
    expect(MockMediaRecorder.instances).toHaveLength(2);
  });
});
