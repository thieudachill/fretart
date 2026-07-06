import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFilename, Recorder } from './recorder';

interface FakeTrack {
  kind: string;
}

class FakeMediaStream {
  constructor(public tracks: FakeTrack[] = []) {}
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static supported: string[] = [];
  static isTypeSupported(t: string): boolean {
    return MockMediaRecorder.supported.includes(t);
  }

  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;

  constructor(
    public stream: FakeMediaStream,
    public options: {
      mimeType?: string;
      videoBitsPerSecond?: number;
      audioBitsPerSecond?: number;
    } = {},
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

const videoTrack: FakeTrack = { kind: 'video' };
const micTrack = { kind: 'audio' } as unknown as MediaStreamTrack;

function makeCanvas(): HTMLCanvasElement & { captureStream: ReturnType<typeof vi.fn> } {
  return {
    captureStream: vi.fn(() => new FakeMediaStream([videoTrack])),
    toBlob: (cb: (b: Blob | null) => void, type?: string) => cb(new Blob(['png'], { type })),
  } as unknown as HTMLCanvasElement & { captureStream: ReturnType<typeof vi.fn> };
}

const WEBM_ONLY = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm'];
const WITH_MP4 = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.640028',
  ...WEBM_ONLY,
];

describe('makeFilename', () => {
  it('slugifies the preset label into the name', () => {
    const when = new Date('2026-07-07T14:30:05Z');
    expect(makeFilename('Line Drawing', 'mp4', when)).toBe(
      'fretart-line-drawing-2026-07-07-14-30-05.mp4',
    );
  });

  it('drops characters that do not belong in filenames', () => {
    const when = new Date('2026-07-07T14:30:05Z');
    expect(makeFilename('Neon Strings!!', 'webm', when)).toBe(
      'fretart-neon-strings-2026-07-07-14-30-05.webm',
    );
  });

  it('omits the slug when there is no label', () => {
    const when = new Date('2026-07-07T14:30:05Z');
    expect(makeFilename('', 'png', when)).toBe('fretart-2026-07-07-14-30-05.png');
  });
});

describe('Recorder', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;
  let downloads: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    MockMediaRecorder.instances = [];
    MockMediaRecorder.supported = [...WEBM_ONLY];
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('MediaStream', FakeMediaStream);
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

  it('prefers mp4 with AAC when recording sound and the browser supports it', () => {
    MockMediaRecorder.supported = [...WITH_MP4];
    const rec = new Recorder();
    rec.start(makeCanvas(), micTrack);
    const mr = MockMediaRecorder.instances[0];
    expect(mr.options.mimeType).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
    expect(mr.options.audioBitsPerSecond).toBeGreaterThan(0);

    mr.ondataavailable?.({ data: new Blob(['x']) });
    rec.stop();
    expect(downloads[0]).toMatch(/\.mp4$/);
  });

  it('falls back to WebM with Opus when mp4 is unsupported', () => {
    const rec = new Recorder();
    rec.start(makeCanvas(), micTrack);
    expect(MockMediaRecorder.instances[0].options.mimeType).toBe('video/webm;codecs=vp9,opus');

    MockMediaRecorder.instances[0].ondataavailable?.({ data: new Blob(['x']) });
    rec.stop();
    expect(downloads[0]).toMatch(/\.webm$/);
  });

  it('falls back to browser defaults when nothing matches', () => {
    MockMediaRecorder.supported = [];
    const rec = new Recorder();
    rec.start(makeCanvas());
    expect(MockMediaRecorder.instances[0].options.mimeType).toBeUndefined();
  });

  it('muxes the mic track into the recorded stream', () => {
    const rec = new Recorder();
    rec.start(makeCanvas(), micTrack);
    const stream = MockMediaRecorder.instances[0].stream;
    expect(stream.getTracks()).toContain(videoTrack);
    expect(stream.getTracks()).toContain(micTrack);
  });

  it('records video-only when "record sound" is off, even with a mic attached', () => {
    const rec = new Recorder();
    rec.options.audio = false;
    rec.start(makeCanvas(), micTrack);
    const mr = MockMediaRecorder.instances[0];
    expect(mr.stream.getTracks()).toEqual([videoTrack]);
    expect(mr.options.mimeType).toBe('video/webm;codecs=vp9'); // video-only codec string
    expect(mr.options.audioBitsPerSecond).toBeUndefined();
  });

  it('records video-only when no mic is listening', () => {
    const rec = new Recorder();
    rec.start(makeCanvas(), null);
    const mr = MockMediaRecorder.instances[0];
    expect(mr.stream.getTracks()).toEqual([videoTrack]);
    expect(mr.options.mimeType).toBe('video/webm;codecs=vp9');
  });

  it('captures the canvas at the configured fps', () => {
    const rec = new Recorder();
    rec.options.fps = 30;
    const canvas = makeCanvas();
    rec.start(canvas);
    expect(canvas.captureStream).toHaveBeenCalledWith(30);
  });

  it('maps quality presets to video bitrates', () => {
    const share = new Recorder();
    share.start(makeCanvas());
    expect(MockMediaRecorder.instances[0].options.videoBitsPerSecond).toBe(8_000_000);

    const master = new Recorder();
    master.options.quality = 'master';
    master.start(makeCanvas());
    expect(MockMediaRecorder.instances[1].options.videoBitsPerSecond).toBe(24_000_000);
  });

  it('names the file after the current preset', () => {
    const rec = new Recorder();
    rec.start(makeCanvas(), null, 'Line Drawing');
    MockMediaRecorder.instances[0].ondataavailable?.({ data: new Blob(['x']) });
    rec.stop();
    expect(downloads[0]).toMatch(/^fretart-line-drawing-.+\.webm$/);
  });

  it('reports elapsed seconds while recording, 0 otherwise', () => {
    const rec = new Recorder();
    expect(rec.elapsed).toBe(0);
    rec.start(makeCanvas());
    vi.advanceTimersByTime(5_000);
    expect(rec.elapsed).toBeCloseTo(5, 1);
    rec.stop();
    expect(rec.elapsed).toBe(0);
  });

  it('ignores start() while already recording', () => {
    const rec = new Recorder();
    rec.start(makeCanvas());
    rec.start(makeCanvas());
    expect(MockMediaRecorder.instances).toHaveLength(1);
  });

  it('stop() downloads the collected chunks and ends the session', () => {
    const rec = new Recorder();
    rec.start(makeCanvas());
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
    rec.start(makeCanvas());
    MockMediaRecorder.instances[0].ondataavailable?.({ data: new Blob(['x']) });
    rec.stop();
    rec.stop();
    expect(downloads).toHaveLength(1);
  });

  it('can record again after stopping', () => {
    const rec = new Recorder();
    rec.start(makeCanvas());
    rec.stop();
    rec.start(makeCanvas());
    expect(rec.recording).toBe(true);
    expect(MockMediaRecorder.instances).toHaveLength(2);
  });

  it('snapshot() downloads a PNG named after the preset', () => {
    const rec = new Recorder();
    rec.snapshot(makeCanvas(), 'Blueprint');
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/^fretart-blueprint-.+\.png$/);
  });
});
