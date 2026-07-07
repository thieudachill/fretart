import { Camera } from '../input/camera';
import type { Recorder } from '../recording/recorder';
import type { PresetStore } from './presets';
import { filterShelves, flatten, moveSelection, PresetNav, type PresetRef } from './presetNav';

export interface PerfBarDeps {
  presets: PresetStore;
  recorder: Recorder;
  nav: PresetNav;
  /** Load a preset and refresh the studio drawer widgets. */
  loadPreset(name: string): void;
  toggleRecording(): void;
  snapshot(): void;
  /** Toggle mic listening; resolves to the resulting on/off state. */
  toggleMic(): Promise<boolean>;
  onCameraChange(deviceId: string): void;
  toggleDrawer(): void;
  drawerOpen(): boolean;
  toggleHelp(): void;
}

/**
 * The stage strip: everything a player touches mid-performance, one thin bar
 * on the bottom edge. Deep editing lives in the studio drawer (Panel); this
 * bar only loads looks, records, and picks devices. Keyboard model:
 * `[`/`]` cycle the armed category, 1–9 load within it, P opens the browser.
 */
export class PerfBar {
  private root: HTMLElement;
  private popover!: HTMLElement;
  private search!: HTMLInputElement;
  private shelvesEl!: HTMLElement;
  private presetBtn!: HTMLButtonElement;
  private recBtn!: HTMLButtonElement;
  private recTime!: HTMLElement;
  private micBtn!: HTMLButtonElement;
  private drawerBtn!: HTMLButtonElement;

  /** Flat walk order of the currently rendered (filtered) list. */
  private items: PresetRef[] = [];
  private selected = -1;

  constructor(private deps: PerfBarDeps) {
    this.root = document.getElementById('perfbar')!;
    this.build();
    // Recording state is polled, not pushed — the recorder is the single
    // source of truth so the R hotkey and the button can never disagree.
    window.setInterval(() => this.syncRecording(), 250);
  }

  private button(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'fa-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', onClick);
    this.root.appendChild(b);
    return b;
  }

  private build(): void {
    const mark = document.createElement('span');
    mark.className = 'fa-wordmark';
    mark.textContent = 'FRETART';
    this.root.appendChild(mark);

    this.presetBtn = this.button('', 'Preset browser (P)', () => this.togglePopover());
    this.presetBtn.id = 'fa-preset-btn';

    const spacer = document.createElement('span');
    spacer.className = 'fa-spacer';
    this.root.appendChild(spacer);

    this.recBtn = this.button('', 'Record (R)', () => this.deps.toggleRecording());
    this.recBtn.classList.add('fa-rec');
    const dot = document.createElement('span');
    dot.className = 'fa-dot';
    this.recTime = document.createElement('span');
    this.recTime.className = 'fa-time';
    this.recTime.textContent = 'REC';
    this.recBtn.append(dot, this.recTime);

    this.button('Snapshot', 'Save PNG (S)', () => this.deps.snapshot());

    // Camera picker appears only when there is an actual choice to make.
    void Camera.listDevices().then((devices) => {
      if (devices.length < 2) return;
      const sel = document.createElement('select');
      sel.className = 'fa-select';
      sel.title = 'Camera';
      for (const d of devices) {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || 'camera';
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => this.deps.onCameraChange(sel.value));
      this.root.insertBefore(sel, this.micBtn);
    });

    this.micBtn = this.button('Mic', 'Listen to the guitar (mic → visuals)', () => {
      void this.deps.toggleMic().then((on) => this.setMic(on));
    });

    this.button('Fullscreen', 'Fullscreen (F)', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    });

    this.drawerBtn = this.button('Studio', 'Open/close the studio drawer', () => {
      this.deps.toggleDrawer();
      this.syncDrawer();
    });
    this.syncDrawer();

    this.button('?', 'Keyboard help (?)', () => this.deps.toggleHelp());

    this.buildPopover();
    this.updatePreset();
  }

  private buildPopover(): void {
    this.popover = document.createElement('div');
    this.popover.className = 'fa-popover';

    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.placeholder = 'search presets…';
    this.search.addEventListener('input', () => this.renderShelves());
    this.search.addEventListener('keydown', (e) => this.onPopoverKey(e));

    this.shelvesEl = document.createElement('div');
    this.shelvesEl.className = 'fa-shelves';

    const hint = document.createElement('div');
    hint.className = 'fa-hint';
    hint.textContent = '↑↓ move · Enter load · Esc close · [ ] category · 1–9 load in category';

    this.popover.append(this.search, this.shelvesEl, hint);
    document.body.appendChild(this.popover);

    // Click-away closes; clicks inside the popover/preset button don't.
    document.addEventListener('pointerdown', (e) => {
      if (!this.popoverOpen) return;
      const t = e.target as Node;
      if (!this.popover.contains(t) && !this.presetBtn.contains(t)) this.closePopover();
    });
  }

  get popoverOpen(): boolean {
    return this.popover.classList.contains('open');
  }

  togglePopover(): void {
    if (this.popoverOpen) this.closePopover();
    else {
      this.popover.classList.add('open');
      this.search.value = '';
      this.renderShelves();
      this.search.focus();
    }
  }

  closePopover(): void {
    this.popover.classList.remove('open');
    this.search.blur();
  }

  private onPopoverKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      this.selected = moveSelection(this.selected, e.key === 'ArrowDown' ? 1 : -1, this.items.length);
      this.renderShelves(true);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const item = this.items[this.selected] ?? this.items[0];
      if (item) this.load(item.name);
    } else if (e.key === 'Escape') {
      this.closePopover();
    }
  }

  private load(name: string): void {
    this.deps.loadPreset(name);
    this.deps.nav.syncTo(name);
    this.closePopover();
    this.updatePreset();
  }

  /** Rebuild the shelf list; keepSelection preserves the arrow-key cursor. */
  private renderShelves(keepSelection = false): void {
    const shelves = filterShelves(this.deps.presets.byCategory(), this.search.value);
    this.items = flatten(shelves);
    if (!keepSelection) {
      this.selected = this.items.findIndex((i) => i.name === this.deps.presets.currentName);
    }
    const armed = this.deps.nav.category;
    this.shelvesEl.replaceChildren();

    let flat = 0;
    for (const [category, names] of Object.entries(shelves)) {
      const title = document.createElement('div');
      title.className = 'fa-shelf-title' + (category === armed ? ' armed' : '');
      title.textContent = category;
      this.shelvesEl.appendChild(title);

      (names ?? []).forEach((name, i) => {
        const idx = flat++;
        const item = document.createElement('div');
        item.className = 'fa-item';
        if (idx === this.selected) item.classList.add('selected');
        if (name === this.deps.presets.currentName) item.classList.add('current');

        const slot = document.createElement('span');
        slot.className = 'fa-slot';
        // Digit hints only where the 1–9 keys actually point (armed shelf,
        // unfiltered view — a filtered list would lie about the mapping).
        slot.textContent =
          category === armed && !this.search.value.trim() && i < 9 ? String(i + 1) : '';

        const label = document.createElement('span');
        label.textContent = name;

        item.append(slot, label);
        const desc = this.deps.presets.describe(name);
        if (desc) {
          const d = document.createElement('span');
          d.className = 'fa-desc';
          d.textContent = desc;
          item.appendChild(d);
        }
        item.addEventListener('click', () => this.load(name));
        this.shelvesEl.appendChild(item);
      });
    }
    this.shelvesEl.querySelector('.fa-item.selected')?.scrollIntoView({ block: 'nearest' });
  }

  /** Reflect currentName + armed category on the bar button. */
  updatePreset(): void {
    const cat = document.createElement('span');
    cat.className = 'fa-cat';
    cat.textContent = this.deps.nav.category ?? '';
    const name = document.createElement('span');
    name.className = 'fa-name';
    name.textContent = this.deps.presets.currentName || 'no preset';
    this.presetBtn.replaceChildren(cat, document.createTextNode(' · '), name);
    if (this.popoverOpen) this.renderShelves();
  }

  setMic(on: boolean): void {
    this.micBtn.setAttribute('aria-pressed', String(on));
  }

  private syncDrawer(): void {
    this.drawerBtn.setAttribute('aria-pressed', String(this.deps.drawerOpen()));
  }

  private syncRecording(): void {
    const { recorder } = this.deps;
    this.recBtn.classList.toggle('on', recorder.recording);
    if (recorder.recording) {
      const s = Math.floor(recorder.elapsed);
      this.recTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    } else {
      this.recTime.textContent = 'REC';
    }
  }
}
