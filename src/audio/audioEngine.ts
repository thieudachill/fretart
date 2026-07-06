/**
 * Mic capture → per-frame AudioFeatures. Thin browser shell around the pure
 * detectors in detectors.ts; nothing here is unit-tested beyond them.
 *
 * The mic constraints matter: echoCancellation / noiseSuppression /
 * autoGainControl are all OFF — those processors are tuned for speech and
 * eat exactly what a guitar needs kept (sharp transients, steady sustain,
 * real dynamics).
 */
import { zeroAudio, type AudioFeatures } from '../core/types';
import {
  bandEnergy,
  detectPitchHz,
  EnvelopeFollower,
  OnsetDetector,
  registerFromHz,
  rms,
} from './detectors';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

const FFT_SIZE = 2048;

export class AudioEngine {
  /** Live signals — the object is stable, fields update in place. */
  readonly features: AudioFeatures = zeroAudio();
  /** Input gain multiplier, tuned by the user (persisted by the panel). */
  sensitivity = 1;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private timeBuf = new Float32Array(FFT_SIZE);
  private freqBytes = new Uint8Array(FFT_SIZE / 2);
  private spectrum = new Float32Array(FFT_SIZE / 2);
  private levelEnv = new EnvelopeFollower(0.015, 0.25);
  private onsets = new OnsetDetector();
  private register = 0;

  get running(): boolean {
    return this.analyser !== null;
  }

  async start(deviceId?: string): Promise<void> {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    });
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    // No built-in smoothing — the envelope followers own all time behavior.
    this.analyser.smoothingTimeConstant = 0;
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
    this.resume();
  }

  /** Autoplay policy: a suspended context can only resume on a user gesture. */
  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    Object.assign(this.features, zeroAudio());
    this.levelEnv = new EnvelopeFollower(0.015, 0.25);
    this.onsets = new OnsetDetector();
    this.register = 0;
  }

  /** Call once per render frame. Without a mic all features stay 0. */
  update(dt: number): AudioFeatures {
    const analyser = this.analyser;
    const f = this.features;
    if (!analyser || !this.ctx) return f;

    analyser.getFloatTimeDomainData(this.timeBuf);
    analyser.getByteFrequencyData(this.freqBytes);
    for (let i = 0; i < this.spectrum.length; i++) this.spectrum[i] = this.freqBytes[i] / 255;

    const g = this.sensitivity;
    const sr = this.ctx.sampleRate;

    // A comfortably mic'd guitar sits around RMS 0.05–0.2; ×6 lands that in
    // the meat of 0..1 before the user's sensitivity trim.
    f.level = this.levelEnv.update(Math.min(1, rms(this.timeBuf) * 6 * g), dt);
    f.onset = this.onsets.update(this.spectrum, dt, g);

    // Register holds between notes (a melody reads as a line, not blinks),
    // eases toward each newly heard pitch, and settles to 0 in silence.
    const hz = detectPitchHz(this.timeBuf, sr);
    if (hz > 0) {
      this.register += (registerFromHz(hz) - this.register) * Math.min(1, dt * 12);
    } else if (f.level < 0.04) {
      this.register += (0 - this.register) * Math.min(1, dt * 1.5);
    }
    f.pitch = this.register;

    f.bass = Math.min(1, bandEnergy(this.spectrum, sr, FFT_SIZE, 60, 250) * 2.2 * g);
    f.air = Math.min(1, bandEnergy(this.spectrum, sr, FFT_SIZE, 4000, 12000) * 3.5 * g);
    return f;
  }

  /** Mic labels are only populated after permission has been granted. */
  static async listDevices(): Promise<AudioDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Mic ${i + 1}` }));
  }
}
