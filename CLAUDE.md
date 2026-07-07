# FretArt

Real-time web app that tracks a guitarist's hands via webcam and renders layered
generative visuals driven by finger motion. Inspired by the TouchDesigner clip in
`reference/` (fingertip-anchored polygon filled with riso/halftone screen-print
rendering of the live feed).

## Run

```
npm run dev        # http://localhost:5173 — grant webcam access
npm run typecheck
npm test           # Vitest; co-located *.test.ts, shared doubles in src/test/fakes.ts
npm run build
```

Hotkeys: `H` hide UI (filming mode) · `F` fullscreen · `D` tracking debug overlay
· `R` record · `S` PNG snapshot · `J` (dev builds only) record a landmark
fixture for sim mode.

**Sim mode:** `?sim` runs the app without a webcam — `src/tracking/sim.ts`
substitutes a deterministic synthetic player (canvas stream stands in for the
video). `?sim=<name>` replays `public/fixtures/<name>.json` recorded with `J`.
TDD rule: pure logic gets a failing test first; GPU/visual code gets manual
verification + sim mode instead.

## Architecture (data flows one way)

```
camera.ts → handTracker.ts → features.ts → modMatrix.ts → engine.ts (effect chain) → screen
audio/audioEngine.ts ─────────────↗ (FrameFeatures.audio)      ↑ panel.ts (Tweakpane UI)
```

- `src/tracking/features.ts` — **the reusable foundation.** Converts MediaPipe
  landmarks into smoothed screen-space features (fingertip positions/velocities,
  pinch distances, spread, presence envelope). Renderer-agnostic; future
  chord/note detection, MIDI/OSC, or audio-reactive modules consume this too.
  `FEATURE_SOURCES` is the registry of named 0..1 signals the mod matrix can route.
- `src/audio/` — mic → `AudioFeatures` (all 0..1): `level` (RMS + fast-attack/
  slow-release envelope), `onset` (positive spectral flux + adaptive threshold,
  snaps to 1 per pluck then decays), `pitch` (autocorrelation → register,
  E2→0..E6→1, holds between notes), `bass`/`air` band energies. Detectors in
  `detectors.ts` are pure and unit-tested against synthesized buffers;
  `audioEngine.ts` is the Web Audio shell. Mic constraints: echoCancellation/
  noiseSuppression/autoGainControl **all false** (speech processors destroy
  guitar transients). Routable as `audio.*` in `FEATURE_SOURCES`; everything
  reads 0 with no mic. Panel "Audio (mic)" folder persists to
  `fretart.audio.v1` — device state, outside presets like tracking feel.
- `src/core/geometry.ts` — pure, unit-tested math the effects share: centroid,
  angle-sort-around-centroid, max-radius (spread), fold-2 quad split, key-light
  shade, and a closed Catmull-Rom sampler that reproduces three.js's
  `CatmullRomCurve3` exactly (the test compares them directly). Effects should
  stay thin rendering shells; put new geometry here with tests.
- `src/effects/Effect.ts` — every visual is an `EffectBase` subclass with a
  `paramDefs` schema (drives Tweakpane UI + mod-matrix targets automatically).
  Effects render in chain order over ping-pong render targets; each is
  independently toggleable. **To add an effect:** new file in `src/effects/`,
  register it in `main.ts`. Nothing else changes.
- Chain order (set in `main.ts`): video base → riso → particles → strings →
  echo last, so feedback smears the whole composite.
- `src/mapping/modMatrix.ts` — routes features to params as *additive offsets*
  on top of slider base values (sliders are never overwritten).
- `src/ui/presets.ts` — 22 built-ins + localStorage saves (`fretart.presets.v2`;
  v1 saves migrate lazily on first read, one-way) + JSON export/import. Presets
  capture global state, per-effect enabled/values, routings, and (v2) `category`
  + `description`. Categories (`PRESET_CATEGORIES`, display order): Line & Shape
  · Print & Paper · Motion & Light · Audio Reactive · Collage & Mixed.
  `byCategory()` shelves names for browsers; `categoryOf()` resolves a missing/
  unknown category to the fallback (Collage & Mixed) so v1 files still import.
  User saves inherit the category of the preset they were tweaked from.
  `presets.lint.test.ts` fails if a built-in references a nonexistent
  effect/param/source/palette/category or an out-of-range value — contributor
  presets can't rot silently.
- Palettes live in `src/core/types.ts` (`PALETTES`) — shared ink/paper colors so
  all layers cohere. Presets reference palettes by index, so only append, never
  reorder.

## Palette notes (art references)

User feedback (2026-07): the strings/shapes genre works best; high-saturation
additive RGB reads as un-aesthetic. Muted palettes + normal "ink" blending are
the preferred direction.

- **Studio Ink** — one-line contour drawing tradition (Picasso/Cocteau) and
  pen-plotter generative art: warm paper, graphite, one vermilion accent.
- **Pastel Play** — Zach Lieberman's gesture sketches / Matisse cut-outs:
  paper tone with soft pink/blue/periwinkle.
- **Morandi** — Giorgio Morandi still-life tones; dusty low-chroma neutrals.
- **Cyanotype** — Anna Atkins blueprint prints: Prussian-blue paper, pale lines
  (inks ordered dark→light so `inks[2]`, the "drawing ink", is the palest).
- Ink ordering convention: `inks[2]` is the strongest drawing/contour ink;
  `inks[0]` the lightest wash/fill.

## Effects

- `fingerShapes.ts` ('shapes') — one shape from all visible fingertips (angle-
  sorted, closed Catmull-Rom): style 0 contour line, 1 filled cut-out, 2
  constellation (all-pair hairlines + dots). In style 1, `fillStyle` picks the
  area treatment rendered inside the shape (screen-space video sampling, so
  the shape is a lens): 0 flat ink, 1 halftone duotone, 2 posterized inks,
  3 negative, 4 pixel mosaic, 5 stipple dither; `density` scales dots/cells.
- `facetFold.ts` ('facets') — the 4-fingertip quad as a folded screen-printed
  sheet: `mode` 0 = fold-2 (diagonal ridge peel), 1 = pyramid-4 (centroid
  apex). Each facet gets its own "printing plate" (`pattern` recipes: 0
  reference dither/sparse/poster/halftone, 1 duotone, 2 window, 3 minimal) at
  its own halftone screen angle (`angle` step, print-shop style), Lambert-
  shaded by one virtual key light (`shade`) so flat triangles read as 3D
  relief. `spreadDrive` maps hand spread → apex (pinch flattens). Prototyped
  in `scratch/0*.html` (canvas-2D sims, keep for future look experiments).
- Shared print GLSL (videoUV/lumaAt/halftone/phash) lives in
  `src/effects/shaders/print.ts` — one source of truth for the print language,
  interpolated into both fingerShapes and facetFold fragments.
- `stringLines.ts` ('strings') — fingertip strings; `ink` param: 0 = additive
  glow, 1 = normal-blended pen lines.
- `risoCollage.ts`, `particleTrails.ts`, `motionEcho.ts` — see file headers.
- Built-in presets (22, by category) — Line & Shape: Line Drawing (default),
  Cut-Out Studio, Wavy Ink, Gesture Study, Gabo Threads, Pastel Ribbon ·
  Print & Paper: Print Window, Negative Space, Mosaic Lens (area treatments),
  Print Pyramid, Blueprint Pyramid (facets), Print Shop · Motion & Light:
  Blueprint, Data Field, Neon Strings · Audio Reactive: Pluck Bloom,
  Attack Lines, Bass Fold, Resonance, Register Ribbon (audio sources read 0
  without a mic, so they degrade to quiet, still looks) · Collage & Mixed:
  Full Collage, Soft Collage.
- Presets are full snapshots: `PresetStore.apply()` disables effects a preset
  doesn't mention (so old presets correctly turn new effects off).
- Waviness vs vibration (strings) / breathe (shapes): `waviness` is a constant
  wave the line always carries (0 = perfectly straight); `vibration` adds only
  while fingertips are moving; `breathe` is the slow low-frequency wobble of
  the whole shape.

## Tracking feel (latency)

- Perceived lag is dominated by filter smoothing + camera capture, **not**
  MediaPipe inference (HUD "tracking ms" is typically <10ms on a dGPU).
- One Euro filter works in normalized 0..1 units, so `beta` must be O(1-10)
  (defaults minCutoff 2.5 / beta 6). Panel "Tracking feel" folder exposes
  `response` (0 calm ↔ 1 snap → `FeatureExtractor.setResponsiveness`) and
  `anticipate ms` (velocity extrapolation of tips to hide remaining pipeline
  delay). Both persist in localStorage (`fretart.tracking.v1`), deliberately
  outside presets — device feel, not artistic state.
- Camera requests 60fps (`ideal`, graceful fallback). More light on the hands
  → shorter webcam exposure → less motion blur and lag.
- `tips` are prediction-extrapolated; `landmarks` are not (kept honest for
  future chord/note analysis).
- **Thumb = the perceived "palm point".** When fretting, the thumb tip sits at
  the palm, so shapes/strings/particles each have a `thumb` param, default 0
  (tips only). All 21 landmarks are still tracked; this only affects visuals.

## Brand (Phase 5)

- Brand = Concept B "The Human Press" (chosen 2026-07-07; manifesto in
  `scratch/branding/NOTES.md` §2b): paper=silence, each ink=a voice (≤3),
  overlap=harmony, misregistration=groove (one constant offset direction),
  halftone=resonance (dots gather at still points), standing wave + node dots
  = signature motif. Design tokens in `src/ui/theme.css` (`--fa-*`) mirror
  `PALETTES` 'Ink & Ember' — change both together; semantic tokens include
  `--fa-overlap` (harmony color) and `--fa-offset-x/y` (the groove). Imported
  in `main.ts`; consumed by the Phase-6 UI + landing.
- `scripts/genAsset.mjs` — CLI for brand illustration/video via Gemini
  (`GEMINI_API_KEY` + model ids in `.env`, never committed). Output goes to
  `scratch/branding/out/` (git-ignored); curated picks graduate to
  `public/brand/` by hand after the user taste gate. Research, art direction,
  prompt rules + QC rubric: `scratch/branding/NOTES.md`; per-asset attempt log:
  `scratch/branding/ATTEMPTS.md`; review page: `scratch/branding/contact-sheet.html`.
- Hard-won API constraints (verified live 2026-07-07): image model outputs
  JPEG only (no PNG/alpha) via the Interactions API; Veo lite wants
  `bytesBase64Encoded` (not `inlineData`), numeric `durationSeconds`, and has
  no `negativePrompt` — bake avoidances into the prompt. Texture-only prompts
  trip the recitation filter → paper grain is code-drawn (`grain.svg`).
- Asset rule: generate → view → rubric-QC → refine, max 7 attempts, then that
  asset pivots to a code-drawn fallback. Boundary: UI chrome and anything
  drawable by code stays code; gen models only illustration/texture/video.

## Gotchas

- `THREE.ColorManagement.enabled = false` in engine.ts — the whole pipeline is
  raw pass-through; don't reintroduce sRGB/linear conversion without redoing
  all palette/shader values.
- MediaPipe handedness labels are flipped for unmirrored video; `handTracker.ts`
  corrects them. Mirroring is applied to landmark x in `features.ts` and to UVs
  in shaders — keep them in sync.
- MediaPipe wasm is copied from `node_modules/@mediapipe/tasks-vision/wasm` to
  `public/wasm/` (done at setup; re-copy after upgrading the package). Model at
  `public/models/hand_landmarker.task` (float16, downloaded from Google storage).
- Landmarks are mapped through the same cover-crop transform (`Engine.view`)
  the base video pass uses; screen space is normalized 0..1, y down.
- Recording (`recorder.ts`) captures only the WebGL canvas — the debug overlay
  and UI live outside it on purpose — muxed with the mic track when the mic is
  listening and "record sound" is on. Codec is runtime-detected: mp4
  (H.264+AAC) where `MediaRecorder.isTypeSupported` allows it, WebM otherwise
  (convert: `ffmpeg -i clip.webm -c:v libx264 -crf 18 clip.mp4`). Files are
  named `fretart-<preset>-<timestamp>.<ext>` via `PresetStore.currentName`.
  Options (fps 30/60, share/master bitrate, record sound) persist in
  `fretart.recording.v1` — device state, outside presets. `R` toggles,
  `S` saves a PNG (`preserveDrawingBuffer` is already on for captureStream).
  `Panel.toggleRecording()` is the single code path for button + hotkey.

## Planned (not built)

- Chord/note inference from fretting-hand geometry.
- Reorderable effect chain.
