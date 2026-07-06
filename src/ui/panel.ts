import { Pane } from 'tweakpane';
import type { FolderApi } from 'tweakpane';
import { PALETTE_OPTIONS } from '../core/types';
import type { Engine } from '../core/engine';
import { Camera } from '../input/camera';
import { FEATURE_SOURCES, FeatureExtractor } from '../tracking/features';
import { ModMatrix } from '../mapping/modMatrix';
import type { Recorder } from '../recording/recorder';
import type { DebugOverlay } from './debugOverlay';
import { PresetStore } from './presets';

export interface PanelDeps {
  engine: Engine;
  camera: Camera;
  extractor: FeatureExtractor;
  matrix: ModMatrix;
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

  constructor(private deps: PanelDeps) {
    this.pane = new Pane({ title: 'FRETART' });
    this.buildGlobal();
    this.buildTracking();
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

  private buildRecording(): void {
    const { recorder, engine } = this.deps;
    const btn = this.pane.addButton({ title: '● Start recording' });
    const indicator = document.getElementById('rec-indicator')!;
    btn.on('click', () => {
      if (recorder.recording) {
        recorder.stop();
        btn.title = '● Start recording';
        indicator.classList.remove('on');
      } else {
        recorder.start(engine.canvas);
        btn.title = '■ Stop & save';
        indicator.classList.add('on');
      }
    });
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
    const options = Object.fromEntries(this.deps.presets.listNames().map((n) => [n, n]));
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
