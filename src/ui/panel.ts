import { Pane } from 'tweakpane';
import type { ButtonApi, FolderApi } from 'tweakpane';
import { PALETTE_OPTIONS } from '../core/types';
import type { Engine } from '../core/engine';
import { Camera } from '../input/camera';
import { FEATURE_SOURCES, FeatureExtractor } from '../tracking/features';
import { ModMatrix } from '../mapping/modMatrix';
import { AudioEngine } from '../audio/audioEngine';
import type { Recorder } from '../recording/recorder';
import type { DebugOverlay } from './debugOverlay';
import { PresetStore } from './presets';

export interface PanelDeps {
  engine: Engine;
  camera: Camera;
  extractor: FeatureExtractor;
  matrix: ModMatrix;
  audio: AudioEngine;
  recorder: Recorder;
  overlay: DebugOverlay;
  presets: PresetStore;
  onCameraChange(deviceId: string): void;
}

/**
 * The whole control surface: global settings, one folder per effect
 * (auto-generated from its param schema), modulation routings, presets,
 * and recording. Hotkeys: H hide UI, F fullscreen, D debug overlay.
 */
export class Panel {
  private pane: Pane;
  private paletteBinding = { palette: 0 };
  private cameraBinding = { device: '' };
  private presetBinding = { preset: '', name: 'my preset' };
  private trackingBinding = { response: 0.5, anticipate: 30 };
  private audioBinding = { listen: false, device: '', sensitivity: 1 };
  private recBinding: { fps: number; quality: 'share' | 'master'; audio: boolean } = {
    fps: 60,
    quality: 'share',
    audio: true,
  };
  private recButton!: ButtonApi;
  private recTimer = 0;

  constructor(private deps: PanelDeps) {
    this.pane = new Pane({ title: 'FRETART' });
    this.buildGlobal();
    this.buildTracking();
    this.buildAudio();
    this.buildRecording();
    this.buildEffects();
    this.buildModulation();
    this.buildPresets();
  }

  private buildGlobal(): void {
    const { engine, overlay } = this.deps;
    const f = this.pane.addFolder({ title: 'Global' });
    f.addBinding(engine, 'mirror', { label: 'mirror view' });
    f.addBinding(engine, 'videoOpacity', { label: 'video opacity', min: 0, max: 1, step: 0.01 });
    this.paletteBinding.palette = engine.paletteIndex;
    f.addBinding(this.paletteBinding, 'palette', { label: 'ink palette', options: PALETTE_OPTIONS })
      .on('change', (ev) => engine.setPalette(ev.value));
    f.addBinding(overlay, 'visible', { label: 'debug overlay (D)' });
    f.addButton({ title: 'Fullscreen (F)' }).on('click', () => this.toggleFullscreen());

    // Camera picker populates once permission is granted (labels need it).
    Camera.listDevices().then((devices) => {
      if (devices.length < 2) return;
      const options = Object.fromEntries(devices.map((d) => [d.label, d.deviceId]));
      this.cameraBinding.device = devices[0].deviceId;
      f.addBinding(this.cameraBinding, 'device', { label: 'camera', options })
        .on('change', (ev) => this.deps.onCameraChange(ev.value));
    });
  }

  /**
   * Latency controls. Device/user tuning, not part of the artistic state —
   * persisted separately from presets so switching looks never changes feel.
   */
  private buildTracking(): void {
    const stored = localStorage.getItem('fretart.tracking.v1');
    if (stored) {
      try {
        Object.assign(this.trackingBinding, JSON.parse(stored));
      } catch {
        // Corrupt entry — fall back to defaults.
      }
    }
    this.applyTracking();

    const f = this.pane.addFolder({ title: 'Tracking feel', expanded: false });
    f.addBinding(this.trackingBinding, 'response', {
      label: 'response (calm↔snap)',
      min: 0,
      max: 1,
      step: 0.01,
    }).on('change', () => this.applyTracking());
    f.addBinding(this.trackingBinding, 'anticipate', {
      label: 'anticipate ms',
      min: 0,
      max: 100,
      step: 5,
    }).on('change', () => this.applyTracking());
  }

  private applyTracking(): void {
    this.deps.extractor.setResponsiveness(this.trackingBinding.response);
    this.deps.extractor.lookaheadMs = this.trackingBinding.anticipate;
    localStorage.setItem('fretart.tracking.v1', JSON.stringify(this.trackingBinding));
  }

  /**
   * Mic input. Like tracking feel, this is device state, not artistic state —
   * persisted in fretart.audio.v1, outside presets, so a saved look never
   * hijacks the mic.
   */
  private buildAudio(): void {
    const { audio } = this.deps;
    const stored = localStorage.getItem('fretart.audio.v1');
    if (stored) {
      try {
        Object.assign(this.audioBinding, JSON.parse(stored));
      } catch {
        // Corrupt entry — fall back to defaults.
      }
    }
    audio.sensitivity = this.audioBinding.sensitivity;

    const f = this.pane.addFolder({ title: 'Audio (mic)', expanded: false });
    const persist = () =>
      localStorage.setItem('fretart.audio.v1', JSON.stringify(this.audioBinding));

    const setListening = (on: boolean) => {
      if (!on) {
        audio.stop();
        persist();
        return;
      }
      audio
        .start(this.audioBinding.device || undefined)
        .then(() => {
          persist();
          void this.populateMics(f);
        })
        .catch((err) => {
          console.error('Mic access failed', err);
          this.audioBinding.listen = false;
          this.pane.refresh();
        });
    };

    f.addBinding(this.audioBinding, 'listen', { label: 'listen (guitar → visuals)' })
      .on('change', (ev) => setListening(ev.value));
    f.addBinding(this.audioBinding, 'sensitivity', {
      label: 'sensitivity',
      min: 0.25,
      max: 4,
      step: 0.05,
    }).on('change', (ev) => {
      audio.sensitivity = ev.value;
      persist();
    });
    f.addBinding(audio.features, 'level', {
      label: 'input level',
      readonly: true,
      view: 'graph',
      min: 0,
      max: 1,
      interval: 50,
    });

    // Honor a persisted "listen" from the last session. The AudioContext may
    // start suspended without a gesture; main.ts resumes it on first input.
    if (this.audioBinding.listen) setListening(true);
  }

  private micRow: { dispose(): void } | null = null;

  /** Mic labels exist only after permission — (re)build the picker then. */
  private async populateMics(f: FolderApi): Promise<void> {
    const devices = await AudioEngine.listDevices();
    if (devices.length < 2) return;
    this.micRow?.dispose();
    const options = Object.fromEntries(devices.map((d) => [d.label, d.deviceId]));
    this.micRow = f
      .addBinding(this.audioBinding, 'device', { label: 'microphone', options })
      .on('change', (ev) => {
        if (this.audioBinding.listen) {
          void this.deps.audio.start(ev.value).catch((err) => console.error(err));
        }
        localStorage.setItem('fretart.audio.v1', JSON.stringify(this.audioBinding));
      });
  }

  /**
   * A recording is the performance — image and sound. Options are device/
   * delivery choices, so they persist like tracking feel, outside presets.
   */
  private buildRecording(): void {
    const { recorder } = this.deps;
    const stored = localStorage.getItem('fretart.recording.v1');
    if (stored) {
      try {
        Object.assign(this.recBinding, JSON.parse(stored));
      } catch {
        // Corrupt entry — fall back to defaults.
      }
    }
    const persist = () => {
      Object.assign(recorder.options, this.recBinding);
      localStorage.setItem('fretart.recording.v1', JSON.stringify(this.recBinding));
    };
    persist();

    const f = this.pane.addFolder({ title: 'Recording', expanded: false });
    f.addBinding(this.recBinding, 'fps', { label: 'fps', options: { '30': 30, '60': 60 } })
      .on('change', persist);
    f.addBinding(this.recBinding, 'quality', {
      label: 'quality',
      options: { 'share (8 Mbps)': 'share', 'master (24 Mbps)': 'master' },
    }).on('change', persist);
    f.addBinding(this.recBinding, 'audio', { label: 'record sound (mic)' }).on('change', persist);
    this.recButton = f.addButton({ title: '● Start recording (R)' });
    this.recButton.on('click', () => this.toggleRecording());
    f.addButton({ title: 'Snapshot PNG (S)' }).on('click', () => this.snapshot());
  }

  /** One code path for the button and the R hotkey, so they never disagree. */
  toggleRecording(): void {
    const { recorder, engine, audio, presets } = this.deps;
    const indicator = document.getElementById('rec-indicator')!;
    const time = document.getElementById('rec-time');
    if (recorder.recording) {
      recorder.stop();
      this.recButton.title = '● Start recording (R)';
      indicator.classList.remove('on');
      clearInterval(this.recTimer);
    } else {
      recorder.start(engine.canvas, audio.audioTrack, presets.currentName);
      this.recButton.title = '■ Stop & save (R)';
      indicator.classList.add('on');
      if (time) time.textContent = '0:00';
      this.recTimer = window.setInterval(() => {
        const s = Math.floor(recorder.elapsed);
        if (time) time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 250);
    }
  }

  snapshot(): void {
    this.deps.recorder.snapshot(this.deps.engine.canvas, this.deps.presets.currentName);
  }

  private buildEffects(): void {
    for (const effect of this.deps.engine.effects) {
      const f = this.pane.addFolder({ title: effect.label, expanded: false });
      f.addBinding(effect, 'enabled', { label: 'enabled' });
      for (const def of effect.paramDefs) {
        f.addBinding(effect.values, def.key, {
          label: def.label,
          min: def.min,
          max: def.max,
          step: def.step ?? (def.max - def.min) / 100,
        });
      }
    }
  }

  private buildModulation(): void {
    const { matrix, engine } = this.deps;
    const f = this.pane.addFolder({ title: 'Finger → Param routing', expanded: false });
    const sourceOptions: Record<string, string> = { '— none —': '' };
    for (const s of FEATURE_SOURCES) sourceOptions[s.label] = s.id;
    const targetOptions = ModMatrix.targetOptions(engine.effects);

    matrix.routings.forEach((routing, i) => {
      const slot = f.addFolder({ title: `Route ${i + 1}`, expanded: i === 0 });
      slot.addBinding(routing, 'enabled', { label: 'active' });
      slot.addBinding(routing, 'source', { label: 'from', options: sourceOptions });
      slot.addBinding(routing, 'target', { label: 'to', options: targetOptions });
      slot.addBinding(routing, 'amount', { label: 'amount', min: -1, max: 1, step: 0.01 });
    });
  }

  private buildPresets(): void {
    const { presets } = this.deps;
    const f = this.pane.addFolder({ title: 'Presets', expanded: false });

    let dropdown = this.addPresetDropdown(f);
    const rebuildDropdown = () => {
      dropdown.dispose();
      dropdown = this.addPresetDropdown(f);
    };

    f.addBinding(this.presetBinding, 'name', { label: 'save as' });
    f.addButton({ title: 'Save preset' }).on('click', () => {
      const name = this.presetBinding.name.trim();
      if (!name) return;
      presets.save(name);
      rebuildDropdown();
    });
    f.addButton({ title: 'Delete selected' }).on('click', () => {
      if (this.presetBinding.preset) {
        presets.delete(this.presetBinding.preset);
        rebuildDropdown();
      }
    });
    f.addButton({ title: 'Export JSON' }).on('click', () => presets.exportCurrent());
    f.addButton({ title: 'Import JSON' }).on('click', () =>
      presets.importFromFile(() => this.refresh()),
    );
  }

  private addPresetDropdown(f: FolderApi) {
    // Interim category UI until the Phase-6 preset browser: shelf the
    // dropdown by category with short prefixes ('Audio · Pluck Bloom').
    const SHORT: Record<string, string> = {
      'Line & Shape': 'Line',
      'Print & Paper': 'Print',
      'Motion & Light': 'Motion',
      'Audio Reactive': 'Audio',
      'Collage & Mixed': 'Collage',
    };
    const options: Record<string, string> = {};
    for (const [cat, names] of Object.entries(this.deps.presets.byCategory())) {
      for (const name of names) options[`${SHORT[cat] ?? cat} · ${name}`] = name;
    }
    return f
      .addBinding(this.presetBinding, 'preset', { label: 'load', options, index: 0 })
      .on('change', (ev) => {
        if (this.deps.presets.load(ev.value)) this.refresh();
      });
  }

  /** Sync all widgets after presets change values behind the UI's back. */
  refresh(): void {
    this.paletteBinding.palette = this.deps.engine.paletteIndex;
    this.pane.refresh();
  }

  get hidden(): boolean {
    return this.pane.element.style.display === 'none';
  }

  setHidden(hidden: boolean): void {
    this.pane.element.style.display = hidden ? 'none' : '';
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
}
