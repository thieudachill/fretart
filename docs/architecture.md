# Architecture

FretArt is a single-page Vite + TypeScript app. Data flows one way, every frame:

```
camera.ts → handTracker.ts → features.ts → modMatrix.ts → engine.ts (effect chain) → screen
audio/audioEngine.ts ────────────↗ (FrameFeatures.audio)       ↑ ui/ (panel, perf bar)
```

Nothing downstream writes back upstream. The UI reads and writes effect
parameters and routings, but the tracking → features → render path never
depends on UI state.

## The stages

**`src/input/camera.ts`** — webcam capture (requests 60 fps, graceful
fallback) or, in sim mode, a canvas stand-in stream. The video element feeds
both MediaPipe and the base video render pass.

**`src/tracking/handTracker.ts`** — MediaPipe hand landmarker (wasm + model
fetched at install time into `public/`). Outputs raw 21-point landmarks per
hand per frame. Handedness labels are corrected here (MediaPipe flips them for
unmirrored video).

**`src/tracking/features.ts`** — *the reusable foundation.* Converts raw
landmarks into smoothed, screen-space `FrameFeatures`: fingertip
positions/velocities (One Euro filtered, optionally velocity-extrapolated to
hide pipeline latency), pinch distances, finger spread, a presence envelope
per hand, and the audio features. Renderer-agnostic — future chord/note
detection or MIDI/OSC output consumes this same object.
`FEATURE_SOURCES` is the registry of named 0..1 signals (hand speed, spread,
pinch, height, hands distance, `audio.*`) that the mod matrix can route.
Adding a source here makes it appear in the routing UI automatically.

**`src/audio/`** — mic → `AudioFeatures`, all 0..1: `level` (RMS +
fast-attack/slow-release envelope), `onset` (spectral flux + adaptive
threshold; snaps to 1 on a pluck, then decays), `pitch` (autocorrelation →
register, E2→0 .. E6→1, holds between notes), `bass`/`air` band energies.
`detectors.ts` is pure and unit-tested against synthesized buffers;
`audioEngine.ts` is the Web Audio shell. With no mic, every source reads 0
and the app behaves exactly as without the audio module.

**`src/mapping/modMatrix.ts`** — four routing slots, each
`source → effect.param × amount`. Routings are *additive offsets* on top of
slider base values, scaled by the target parameter's full range and clamped —
sliders are never overwritten by modulation.

**`src/core/engine.ts`** — three.js orthographic pipeline. The base video
pass draws the (cover-cropped, optionally mirrored) camera feed, then effects
render in chain order over a ping-pong render-target pair: each effect reads
the previous composite and writes its own. `THREE.ColorManagement` is
disabled — the whole pipeline is raw pass-through, and all palette/shader
values assume that.

**`src/core/geometry.ts`** — pure, unit-tested math shared by effects:
centroid, angle-sort-around-centroid, spread, quad fold split, key-light
shading, and a closed Catmull-Rom sampler proven identical to three.js's
`CatmullRomCurve3` by a direct comparison test. Effects stay thin rendering
shells; geometry lives here, with tests.

**`src/effects/`** — each visual layer is an `EffectBase` subclass declaring
`paramDefs` (which drives the UI and the mod-matrix targets automatically).
See [creating-effects.md](creating-effects.md).

**`src/ui/`** — two surfaces: `perfBar.ts` (bottom stage bar — presets,
record, snapshot, mic, fullscreen) and `panel.ts` (Tweakpane in the right
"studio drawer" — every parameter). `presets.ts` is the preset store
(built-ins + localStorage + JSON import/export); `presetNav.ts` is the pure,
unit-tested keyboard model behind `[` `]` / `1–9` / the browser popover.

## Coordinate conventions

- Screen space is normalized 0..1, x right, **y down**, everywhere outside
  shaders' UV space.
- Landmarks are mapped through the same cover-crop transform (`Engine.view`)
  the base video pass uses, so fingertips land exactly on their video pixels.
- Mirroring is applied to landmark x in `features.ts` and to UVs in shaders —
  the two must stay in sync.
- `tips` in `FrameFeatures` are prediction-extrapolated for feel; `landmarks`
  are not (kept honest for future analysis code).

## Persistence map

Presets capture artistic state; device state deliberately lives outside them:

| localStorage key | What | Why outside presets |
| --- | --- | --- |
| `fretart.presets.v2` | user-saved presets | the art itself |
| `fretart.tracking.v1` | tracking feel (response, anticipate) | your camera, not the look |
| `fretart.audio.v1` | mic device + listening state | your hardware |
| `fretart.recording.v1` | fps / bitrate / record-sound | your export needs |
| `fretart.panel.v1`, `fretart.ui.v1` | drawer + folder open state | desk ergonomics |
| `fretart.welcomed.v1` | first-visit splash consent | one-time gate |

## Testing philosophy

Pure logic (geometry, detectors, filters, feature extraction, preset store,
keyboard nav) is unit-tested, written test-first. GPU/visual code is verified
manually plus in **sim mode**: `?sim` runs the whole app on a deterministic
synthetic player with no webcam, and `?sim=<name>` replays a recorded landmark
fixture from `public/fixtures/`. Shared test doubles live in `src/test/fakes.ts`.
