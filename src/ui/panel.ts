import { Pane } from 'tweakpane';
import type { FolderApi } from 'tweakpane';
import { PALETTE_OPTIONS } from '../core/types';
import type { Engine } from '../core/engine';
import { FEATURE_SOURCES, FeatureExtractor, getFeatureValue } from '../tracking/features';
import type { FrameFeatures } from '../core/types';
import { ModMatrix } from '../mapping/modMatrix';
import { AudioEngine } from '../audio/audioEngine';
import type { Recorder } from '../recording/recorder';
import type { DebugOverlay } from './debugOverlay';
import { PresetStore } from './presets';

export interface PanelDeps {
  engine: Engine;
  extractor: FeatureExtractor;
  matrix: ModMatrix;
  audio: AudioEngine;
  recorder: Recorder;
  overlay: DebugOverlay;
  presets: PresetStore;
  /** Where the Tweakpane mounts — the studio drawer's scroll area. */
  container: HTMLElement;
  /** Fired after save/delete so the performance bar can re-shelve. */
  onPresetsChanged(): void;
}

const FOLDER_STATE_KEY = 'fretart.panel.v1';

/**
 * The studio drawer: deep sound-design controls, one Tweakpane in the right
 * dock. Stage-time actions (preset load, record, devices, fullscreen) live in
 * the performance bar — this panel is for shaping a look. Folders remember
 * their open/closed state; double-click any effect slider to reset it.
 */
export class Panel {
  private pane: Pane;
  private paletteBinding = { palette: 0 };
  private presetBinding = { name: 'my preset' };
  private trackingBinding = { response: 0.5, anticipate: 30 };
  private audioBinding = { listen: false, device: '', sensitivity: 1 };
  private recBinding: { fps: number; quality: 'share' | 'master'; audio: boolean } = {
    fps: 60,
    quality: 'share',
    audio: true,
  };
  private recTimer = 0;
  private folderState: Record<string, boolean> = {};
  /** Live source values shown next to each routing (updated by tick()). */
  private liveVals: { value: number }[] = [];

  constructor(private deps: PanelDeps) {
    try {
      this.folderState = JSON.parse(localStorage.getItem(FOLDER_STATE_KEY) ?? '{}');
    } catch {
      this.folderState = {};
    }
    this.pane = new Pane({ title: 'Studio', container: deps.container });
    this.buildGlobal();
    this.buildTracking();
    this.buildAudio();
    this.buildRecording();
    this.buildEffects();
    this.buildModulation();
    this.buildPresets();
  }

  /** addFolder that remembers its open/closed state across sessions. */
  private folder(title: string, defaultExpanded: boolean, parent?: FolderApi): FolderApi {
    const host = parent ?? this.pane;
    const f = host.addFolder({ title, expanded: this.folderState[title] ?? defaultExpanded });
    f.on('fold', (ev) => {
      this.folderState[title] = ev.expanded;
      localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(this.folderState));
    });
    return f;
  }

  private buildGlobal(): void {
    const { engine, overlay } = this.deps;
    const f = this.folder('Global', true);
    f.addBinding(engine, 'mirror', { label: 'mirror view' });
    f.addBinding(engine, 'videoOpacity', { label: 'video opacity', min: 0, max: 1, step: 0.01 });
    this.paletteBinding.palette = engine.paletteIndex;
    f.addBinding(this.paletteBinding, 'palette', { label: 'ink palette', options: PALETTE_OPTIONS })
      .on('change', (ev) => engine.setPalette(ev.value));
    f.addBinding(overlay, 'visible', { label: 'debug overlay (D)' });
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

    const f = this.folder('Tracking feel', false);
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

    const f = this.folder('Audio (mic)', false);
    this.audioFolder = f;

    f.addBinding(this.audioBinding, 'listen', { label: 'listen (guitar → visuals)' })
      .on('change', (ev) => void this.setListening(ev.value));
    f.addBinding(this.audioBinding, 'sensitivity', {
      label: 'sensitivity',
      min: 0.25,
      max: 4,
      step: 0.05,
    }).on('change', (ev) => {
      audio.sensitivity = ev.value;
      this.persistAudio();
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
    if (this.audioBinding.listen) void this.setListening(true);
  }

  private audioFolder!: FolderApi;

  private persistAudio(): void {
    localStorage.setItem('fretart.audio.v1', JSON.stringify(this.audioBinding));
  }

  private async setListening(on: boolean): Promise<void> {
    const { audio } = this.deps;
    if (!on) {
      audio.stop();
      this.audioBinding.listen = false;
      this.persistAudio();
      return;
    }
    try {
      await audio.start(this.audioBinding.device || undefined);
      this.audioBinding.listen = true;
      this.persistAudio();
      void this.populateMics(this.audioFolder);
    } catch (err) {
      console.error('Mic access failed', err);
      this.audioBinding.listen = false;
    }
    this.pane.refresh();
  }

  /** One code path for the drawer toggle and the bar's Mic button. */
  async toggleMic(): Promise<boolean> {
    await this.setListening(!this.audioBinding.listen);
    return this.audioBinding.listen;
  }

  get micOn(): boolean {
    return this.audioBinding.listen;
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
        this.persistAudio();
      });
  }

  /**
   * A recording is the performance — image and sound. Options are device/
   * delivery choices, so they persist like tracking feel, outside presets.
   * The start/stop button itself lives in the performance bar.
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

    const f = this.folder('Recording', false);
    f.addBinding(this.recBinding, 'fps', { label: 'fps', options: { '30': 30, '60': 60 } })
      .on('change', persist);
    f.addBinding(this.recBinding, 'quality', {
      label: 'quality',
      options: { 'share (8 Mbps)': 'share', 'master (24 Mbps)': 'master' },
    }).on('change', persist);
    f.addBinding(this.recBinding, 'audio', { label: 'record sound (mic)' }).on('change', persist);
  }

  /** One code path for the bar button and the R hotkey, so they never disagree. */
  toggleRecording(): void {
    const { recorder, engine, audio, presets } = this.deps;
    const indicator = document.getElementById('rec-indicator')!;
    const time = document.getElementById('rec-time');
    if (recorder.recording) {
      recorder.stop();
      indicator.classList.remove('on');
      clearInterval(this.recTimer);
    } else {
      recorder.start(engine.canvas, audio.audioTrack, presets.currentName);
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
      const f = this.folder(effect.label, false);
      f.addBinding(effect, 'enabled', { label: 'enabled' });
      for (const def of effect.paramDefs) {
        const b = f.addBinding(effect.values, def.key, {
          label: def.label,
          min: def.min,
          max: def.max,
          step: def.step ?? (def.max - def.min) / 100,
        });
        // Double-click a slider row = back to the effect's default.
        b.element.addEventListener('dblclick', () => {
          effect.values[def.key] = def.default;
          b.refresh();
        });
      }
    }
  }

  private buildModulation(): void {
    const { matrix, engine } = this.deps;
    const f = this.folder('Finger → Param routing', false);
    const sourceOptions: Record<string, string> = { '— none —': '' };
    for (const s of FEATURE_SOURCES) sourceOptions[s.label] = s.id;
    const targetOptions = ModMatrix.targetOptions(engine.effects);

    matrix.routings.forEach((routing, i) => {
      const slot = this.folder(`Route ${i + 1}`, i === 0, f);
      slot.addBinding(routing, 'enabled', { label: 'active' });
      slot.addBinding(routing, 'source', { label: 'from', options: sourceOptions });
      slot.addBinding(routing, 'target', { label: 'to', options: targetOptions });
      const amount = slot.addBinding(routing, 'amount', {
        label: 'amount',
        min: -1,
        max: 1,
        step: 0.01,
      });
      amount.element.addEventListener('dblclick', () => {
        routing.amount = 0;
        amount.refresh();
      });
      // Live value of the routed source — sound design with eyes open.
      const live = { value: 0 };
      this.liveVals.push(live);
      slot.addBinding(live, 'value', {
        label: 'live',
        readonly: true,
        format: (v: number) => v.toFixed(2),
        interval: 100,
      });
    });
  }

  /** Feed per-frame features so the routing rows can show live source values. */
  tick(features: FrameFeatures): void {
    this.deps.matrix.routings.forEach((routing, i) => {
      const live = this.liveVals[i];
      if (live) live.value = routing.source ? getFeatureValue(features, routing.source) : 0;
    });
  }

  private buildPresets(): void {
    const { presets, onPresetsChanged } = this.deps;
    const f = this.folder('Presets', false);

    f.addBinding(this.presetBinding, 'name', { label: 'save as' });
    f.addButton({ title: 'Save preset' }).on('click', () => {
      const name = this.presetBinding.name.trim();
      if (!name) return;
      presets.save(name);
      onPresetsChanged();
    });
    f.addButton({ title: 'Delete current (user saves only)' }).on('click', () => {
      if (!presets.isUserSave(presets.currentName)) return;
      presets.delete(presets.currentName);
      presets.currentName = '';
      onPresetsChanged();
    });
    f.addButton({ title: 'Export JSON' }).on('click', () => presets.exportCurrent());
    f.addButton({ title: 'Import JSON' }).on('click', () =>
      presets.importFromFile(() => this.refresh()),
    );
  }

  /** Sync all widgets after presets change values behind the UI's back. */
  refresh(): void {
    this.paletteBinding.palette = this.deps.engine.paletteIndex;
    this.pane.refresh();
  }
}
