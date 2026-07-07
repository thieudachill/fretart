# Creating an effect

A visual layer in FretArt is one file in `src/effects/` plus one registration
line in `src/main.ts`. Everything else — the Studio drawer UI, mod-matrix
targets, preset capture — appears automatically from your `paramDefs`.

## The contract

Subclass `EffectBase` (`src/effects/Effect.ts`):

```ts
export abstract class EffectBase {
  abstract readonly id: string;      // stable, lowercase — used in presets/routings
  abstract readonly label: string;   // shown in the drawer
  enabled = false;                   // effects start disabled; presets enable them

  paramDefs: ParamDef[] = [];        // drives UI + mod matrix
  init(ctx: EngineContext): void {}      // once, after GL setup
  resize(ctx: EngineContext): void {}    // drawing-buffer size changed
  update(features: FrameFeatures, dt: number): void {}  // per frame, before render
  abstract render(ctx, input, output): void;            // read input, write output
  dispose(): void {}
}
```

Effects render in chain order over a ping-pong render-target pair: `input`
holds the composite so far; draw your contribution into `output`. If your
effect only adds on top, start with `ctx.blit(input, output)` and then
`ctx.drawScene(yourScene, output)`.

`EngineContext` gives you the renderer, the live video texture with its
cover-crop uniforms (`videoUV = uOff + screenUV * uScl`, plus `mirror`), the
current palette (`paper`, `inks[0..2]`), an orthographic screen-space camera,
and the `blit` / `fsPass` / `drawScene` helpers.

## Parameters

Declare every user-facing number in `paramDefs`, then call `initDefaults()`
at the end of your constructor:

```ts
this.paramDefs = [
  { key: 'persist', label: 'Persistence', min: 0, max: 0.98, step: 0.01, default: 0.82 },
  { key: 'mix',     label: 'Intensity',   min: 0, max: 1,    step: 0.01, default: 0.65 },
];
this.initDefaults();
```

In `render`/`update`, **always read parameters through `this.p('key')`** —
that is base slider value + mod-matrix offset, clamped to the def's range.
Reading `this.values` directly bypasses modulation and is almost always a bug.

Each def automatically becomes a drawer slider (with double-click-to-reset)
and a routing target named `<id>.<key>` (e.g. `echo.persist`).

## Worked example

`src/effects/motionEcho.ts` is the smallest complete effect (~100 lines):
a full-screen feedback shader with four params. Read it top to bottom —
it shows the param/uniform split, `resize` for a private render target,
self-feedback via `ctx.blit`, and `dispose`.

For fingertip-driven geometry, see `stringLines.ts` (lines between tips) or
`fingerShapes.ts` (Catmull-Rom hull around all tips). Put any non-trivial
math in `src/core/geometry.ts` with a unit test first — effects themselves
stay thin rendering shells and are verified visually in sim mode.

## Registering

In `src/main.ts`, construct your effect and add it to the chain array. Order
matters: the chain is video base → riso → shapes → facets → particles →
strings → echo, with feedback last so trails smear the whole composite.
Slot yours where its layer belongs.

## House rules

- **Palettes, not free colors.** Draw with `ctx.paper` and `ctx.inks`. The
  convention: `inks[2]` is the strongest drawing/contour ink, `inks[0]` the
  lightest wash. Muted looks are the house taste — saturated additive RGB is
  reserved for explicitly "stage" presets.
- **Fingertips, not thumbs.** When fretting, the thumb sits at the palm. If
  your effect uses tips, give it a `thumb` param defaulting to 0 like the
  existing effects do.
- **Respect presence.** Scale contributions by each hand's presence envelope
  so visuals fade in/out rather than popping when a hand (dis)appears.
- **No color management.** `THREE.ColorManagement` is disabled; don't
  reintroduce sRGB/linear conversion.
- **Checklist before a PR:** typecheck + tests green, visually verified in
  `?sim` and live, params all have sensible ranges/defaults, added to at
  least one preset or documented why not.
