import './ui/theme.css';
import './ui/ui.css';
import { Engine } from './core/engine';
import { Camera } from './input/camera';
import { HandTracker } from './tracking/handTracker';
import { FeatureExtractor } from './tracking/features';
import { ModMatrix } from './mapping/modMatrix';
import { AudioEngine } from './audio/audioEngine';
import { FacetFoldEffect } from './effects/facetFold';
import { FingerShapesEffect } from './effects/fingerShapes';
import { MotionEchoEffect } from './effects/motionEcho';
import { StringLinesEffect } from './effects/stringLines';
import { ParticleTrailsEffect } from './effects/particleTrails';
import { RisoCollageEffect } from './effects/risoCollage';
import { FixtureRecorder, SimPlayer, type SimFixture } from './tracking/sim';
import { Recorder } from './recording/recorder';
import { DebugOverlay } from './ui/debugOverlay';
import { Panel } from './ui/panel';
import { PerfBar } from './ui/perfBar';
import { PresetNav } from './ui/presetNav';
import { PresetStore } from './ui/presets';

const splash = document.getElementById('splash')!;
const splashStatus = document.getElementById('splash-status')!;
const hud = document.getElementById('hud')!;

function setStatus(text: string): void {
  splashStatus.textContent = text;
}

/**
 * First visit: the splash explains webcam/mic use and waits for a click
 * before any permission prompt appears. After that first consent the app
 * boots straight into the camera request.
 */
async function welcomeGate(): Promise<void> {
  const WELCOMED = 'fretart.welcomed.v1';
  if (localStorage.getItem(WELCOMED)) return;
  const btn = document.getElementById('splash-start') as HTMLButtonElement;
  setStatus('');
  btn.style.display = 'block';
  await new Promise<void>((res) => btn.addEventListener('click', () => res(), { once: true }));
  localStorage.setItem(WELCOMED, '1');
  btn.style.display = 'none';
}

async function boot(): Promise<void> {
  // `?sim` replays synthetic hands (or `?sim=<name>` a recorded fixture from
  // public/fixtures/) — contributor dev and demos without a webcam.
  const simParam = new URLSearchParams(location.search).get('sim');
  const camera = new Camera();
  let tracker: HandTracker | null = null;
  let sim: SimPlayer | null = null;

  if (simParam !== null) {
    setStatus('sim mode — replaying hands, no camera needed');
    await camera.startSim();
    let fixture: SimFixture | null = null;
    if (simParam) {
      try {
        const res = await fetch(`/fixtures/${simParam}.json`);
        if (res.ok) fixture = (await res.json()) as SimFixture;
        else console.warn(`No fixture '${simParam}' — using the synthetic player`);
      } catch (err) {
        console.warn('Fixture load failed — using the synthetic player', err);
      }
    }
    sim = new SimPlayer(fixture);
  } else {
    await welcomeGate();
    setStatus('requesting webcam…');
    try {
      await camera.start();
    } catch (err) {
      setStatus('webcam access denied — allow camera access and reload the page');
      console.error(err);
      return;
    }

    setStatus('loading hand tracker…');
    tracker = new HandTracker();
    await tracker.init();
  }

  setStatus('starting renderer…');
  const stage = document.getElementById('stage')!;
  const engine = new Engine(stage, camera);

  // Chain order: video → riso panel → particles → strings → echo last, so
  // the feedback trails smear the *whole* composition (the classic look).
  const riso = new RisoCollageEffect();
  const shapes = new FingerShapesEffect();
  const facets = new FacetFoldEffect();
  const particles = new ParticleTrailsEffect();
  const strings = new StringLinesEffect();
  const echo = new MotionEchoEffect();
  for (const effect of [riso, shapes, facets, particles, strings, echo]) engine.addEffect(effect);

  const extractor = new FeatureExtractor();
  const matrix = new ModMatrix();
  const audio = new AudioEngine();
  const recorder = new Recorder();
  const fixtureRec = new FixtureRecorder();

  // Autoplay policy: if the mic auto-started from a persisted setting, its
  // AudioContext may be suspended until the first real user gesture.
  const resumeAudio = () => audio.resume();
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
  const overlay = new DebugOverlay(document.getElementById('overlay') as HTMLCanvasElement);
  const presets = new PresetStore(engine, matrix);
  presets.load('Line Drawing');
  const nav = new PresetNav(() => presets.byCategory());
  nav.syncTo('Line Drawing');

  // Studio drawer open/closed state persists like tracking feel — desk setup.
  const UI_KEY = 'fretart.ui.v1';
  const drawer = document.getElementById('drawer')!;
  let uiState: { drawer: boolean } = { drawer: true };
  try {
    Object.assign(uiState, JSON.parse(localStorage.getItem(UI_KEY) ?? '{}'));
  } catch {
    // Corrupt entry — keep defaults.
  }
  const setDrawer = (open: boolean): void => {
    drawer.classList.toggle('closed', !open);
    uiState.drawer = open;
    localStorage.setItem(UI_KEY, JSON.stringify(uiState));
  };
  setDrawer(uiState.drawer);

  const help = document.getElementById('help-overlay')!;
  const toggleHelp = (): void => {
    help.classList.toggle('open');
  };
  help.addEventListener('pointerdown', (e) => {
    if (e.target === help) help.classList.remove('open');
  });

  const panel = new Panel({
    engine,
    extractor,
    matrix,
    audio,
    recorder,
    overlay,
    presets,
    container: document.getElementById('drawer-scroll')!,
    onPresetsChanged: () => bar.updatePreset(),
  });

  const bar = new PerfBar({
    presets,
    recorder,
    nav,
    loadPreset: (name) => {
      if (presets.load(name)) panel.refresh();
    },
    toggleRecording: () => panel.toggleRecording(),
    snapshot: () => panel.snapshot(),
    toggleMic: () => panel.toggleMic(),
    onCameraChange: (deviceId) => void camera.start(deviceId),
    toggleDrawer: () => setDrawer(drawer.classList.contains('closed')),
    drawerOpen: () => !drawer.classList.contains('closed'),
    toggleHelp,
  });
  bar.setMic(panel.micOn);
  panel.refresh();

  const uiHidden = (): boolean => document.body.classList.contains('ui-hidden');

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (key === 'h') {
      document.body.classList.toggle('ui-hidden');
      bar.closePopover();
      help.classList.remove('open');
    } else if (key === 'f') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } else if (key === 'd') {
      overlay.visible = !overlay.visible;
      panel.refresh();
    } else if (key === 'r') {
      panel.toggleRecording();
    } else if (key === 's') {
      panel.snapshot();
    } else if (key === 'p') {
      e.preventDefault(); // or the "p" lands in the search box it just focused
      bar.togglePopover();
    } else if (key === '[' || key === ']') {
      const cat = nav.cycleCategory(key === ']' ? 1 : -1);
      if (cat) {
        bar.updatePreset();
        if (uiHidden()) hud.textContent = `category: ${cat}`;
      }
    } else if (/^[1-9]$/.test(e.key)) {
      const name = nav.pick(Number(e.key));
      if (name && presets.load(name)) {
        panel.refresh();
        bar.updatePreset();
        if (uiHidden()) hud.textContent = `preset: ${name}`;
      }
    } else if (e.key === '?') {
      toggleHelp();
    } else if (e.key === 'Escape') {
      help.classList.remove('open');
      bar.closePopover();
    } else if (key === 'j' && import.meta.env.DEV && tracker) {
      // Dev-only: capture the live landmark stream into a sim fixture
      // (drop the downloaded JSON into public/fixtures/, replay via ?sim=name).
      if (fixtureRec.recording) {
        const frames = fixtureRec.stop();
        hud.textContent = `fixture saved — ${frames} frames`;
      } else {
        fixtureRec.start();
        hud.textContent = 'recording fixture… press J to stop';
      }
    }
  });

  splash.classList.add('hidden');
  hud.textContent = 'H hide UI · P presets · ? keys';

  // Main loop.
  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsShown = 0;

  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    const raw = sim ? sim.at(now / 1000) : tracker!.detect(camera.video, now);
    if (fixtureRec.recording) fixtureRec.add(now / 1000, raw);
    audio.update(dt);
    const features = extractor.update(raw, dt, engine.view, engine.mirror, now / 1000, audio.features);
    matrix.apply(engine.effects, features);
    panel.tick(features);
    engine.render(features, dt);
    overlay.draw(features);

    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      fpsShown = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
      if (!uiHidden() && !fixtureRec.recording) {
        const source = sim ? 'sim replay' : `tracking ${tracker!.inferenceMs.toFixed(1)} ms`;
        hud.textContent = `${fpsShown} fps · ${source} · H hide UI · P presets · ? keys`;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
