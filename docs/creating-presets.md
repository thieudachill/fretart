# Creating presets

A preset is a full snapshot of the artwork: global state, per-effect
enabled/values, mod-matrix routings, plus a category and a one-line
description. Contributing a good preset is one of the best first PRs.

## Design one in the app

1. Start from the built-in closest to your idea (`P` to browse).
2. Sculpt in the Studio drawer — effects, palette, routings. Double-click any
   slider to get back to its default.
3. Save it (drawer → Presets → save as) and play with it for a while. The
   good ones survive a whole practice session.
4. Export JSON (drawer → Presets → Export) to see the exact data.

## Ship it as a built-in

Add an entry to `BUILT_IN_PRESETS` in `src/ui/presets.ts`:

```ts
'Quiet Ripple': {
  category: 'Line & Shape',
  description: 'Hairlines that ripple outward from each fretting press.',
  global: { mirror: true, videoOpacity: 1, paletteIndex: 6 },   // Morandi
  effects: {
    riso:      { enabled: false, values: {} },
    shapes:    { enabled: true,  values: { style: 0, line: 1.8 } },
    strings:   { enabled: true,  values: { ink: 1, vibration: 0.3 } },
    particles: { enabled: false, values: {} },
    echo:      { enabled: false, values: {} },
  },
  routings: [
    { enabled: true,  source: 'left.speed', target: 'strings.vibration', amount: 0.5 },
    { enabled: false, source: '', target: '', amount: 0 },
    { enabled: false, source: '', target: '', amount: 0 },
    { enabled: false, source: '', target: '', amount: 0 },
  ],
},
```

Notes on the shape of the data:

- **Presets are full snapshots.** `apply()` disables any effect a preset
  doesn't mention — so old presets correctly turn new effects off. List every
  effect you care about; omitted *values* fall back to the param defaults, so
  only write the values you actually changed.
- `paletteIndex` indexes `PALETTES` in `src/core/types.ts`. Palettes are
  **append-only** — presets reference them by index, so never reorder.
- Routings: exactly 4 slots; `amount` is −1..1, scaled by the target param's
  full range and added on top of the slider value.
- Categories (display order): Line & Shape · Print & Paper · Motion & Light ·
  Audio Reactive · Collage & Mixed. Audio Reactive presets must actually
  route an `audio.*` source, and should still look intentional with no mic
  (all audio sources read 0).

## The lint test keeps you honest

`src/ui/presets.lint.test.ts` runs in CI and fails if any built-in references
a nonexistent effect, parameter, feature source, palette, or category, or an
out-of-range value. Run `npm test` — if the lint passes, your preset's data
is structurally sound. (Whether it's *beautiful* is what PR review is for.)

## Taste rules

The house direction is muted, gallery-leaning: ink on paper, one accent,
normal "ink" blending. High-saturation additive RGB reads as un-aesthetic
here — the Neon Stage palette exists, but it's the exception (explicit stage
looks), not the default. When in doubt, pick Studio Ink, Morandi, Pastel
Play, or Cyanotype, and let motion — not color — carry the drama.
