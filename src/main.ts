import { Engine } from './core/engine';
import { Camera } from './input/camera';
import { HandTracker } from './tracking/handTracker';
import { FeatureExtractor } from './tracking/features';
import { ModMatrix } from './mapping/modMatrix';
import { FacetFoldEffect } from './effects/facetFold';
import { FingerShapesEffect } from './effects/fingerShapes';
import { MotionEchoEffect } from './effects/motionEcho';
import { StringLinesEffect } from './effects/stringLines';
import { ParticleTrailsEffect } from './effects/particleTrails';
import { RisoCollageEffect } from './effects/risoCollage';
import { Recorder } from './recording/recorder';
import { DebugOverlay } from './ui/debugOverlay';
import { Panel } from './ui/panel';
import { PresetStore } from './ui/presets';

const splash = document.getElementById('splash')!;
const splashStatus = document.getElementById('splash-status')!;
const hud = document.getElementById('hud')!;

function setStatus(text: string): void {
  splashStatus.textContent = text;
}

async function boot(): Promise<void> {
  setStatus('requesting webcam…');
  const camera = new Camera();
  try {
    await camera.start();
  } catch (err) {
    setStatus('webcam access denied — allow camera access and reload the page');
    console.error(err);
    return;
  }

  setStatus('loading hand tracker…');
  const tracker = new HandTracker();
  await tracker.init();

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
  const recorder = new Recorder();
  const overlay = new DebugOverlay(document.getElementById('overlay') as HTMLCanvasElement);
  const presets = new PresetStore(engine, matrix);
  presets.load('Line Drawing');

  const panel = new Panel({
    engine,
    camera,
    extractor,
    matrix,
    recorder,
    overlay,
    presets,
    onCameraChange: (deviceId) => void camera.start(deviceId),
  });
  panel.refresh();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (key === 'h') {
      const hide = !panel.hidden;
      panel.setHidden(hide);
      hud.style.display = hide ? 'none' : '';
    } else if (key === 'f') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } else if (key === 'd') {
      overlay.visible = !overlay.visible;
      panel.refresh();
    }
  });

  splash.classList.add('hidden');
  hud.textContent = 'H hide UI · F fullscreen · D tracking overlay';

  // Main loop.
  let lastTime = performance.now();
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsShown = 0;

  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    const raw = tracker.detect(camera.video, now);
    const features = extractor.update(raw, dt, engine.view, engine.mirror, now / 1000);
    matrix.apply(engine.effects, features);
    engine.render(features, dt);
    overlay.draw(features);

    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      fpsShown = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
      if (hud.style.display !== 'none') {
        hud.textContent = `${fpsShown} fps · tracking ${tracker.inferenceMs.toFixed(1)} ms · H hide UI · F fullscreen · D overlay`;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
