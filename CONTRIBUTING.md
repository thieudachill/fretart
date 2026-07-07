# Contributing to FretArt

Thanks for wanting to make finger flow more visible. This is a small,
taste-driven codebase — the rules below keep it fast to work in and coherent
to look at.

## Dev setup

```
git clone https://github.com/thieudachill/fretart.git
cd fretart
npm install        # postinstall fetches the MediaPipe wasm + hand model
npm run dev
```

No webcam? `http://localhost:5173/?sim` runs the whole app on a synthetic
player. `?sim=<name>` replays a fixture from `public/fixtures/` (record your
own with the dev-only `J` hotkey). Most effect work is perfectly doable in
sim mode.

Before pushing:

```
npm run typecheck && npm test && npm run build
```

CI runs exactly that; PRs need it green.

## How we write code

- **TDD for pure logic.** Geometry, detectors, filters, preset/nav logic:
  write the failing Vitest test first, co-located as `*.test.ts`. Shared test
  doubles live in `src/test/fakes.ts`.
- **GPU/visual code** gets manual verification instead — check it live and in
  `?sim`, and say in the PR what you looked at.
- **Small modules, one responsibility.** Comments explain *constraints* the
  code can't show, not what the next line does.
- Effects stay thin rendering shells — non-trivial math goes in
  `src/core/geometry.ts` with tests.

Read [docs/architecture.md](docs/architecture.md) first; it's short and the
one-way data flow explains where everything belongs.

## Taste rules (yes, they're rules)

- Muted, gallery-leaning palettes; ink-on-paper is the house look. Saturated
  additive RGB only in explicitly "stage" presets.
- `PALETTES` is **append-only** — presets reference palettes by index.
- `THREE.ColorManagement` stays disabled; don't reintroduce sRGB/linear
  conversion anywhere in the pipeline.
- UI chrome consumes `src/ui/theme.css` tokens only. One accent color. No
  gradients, no emoji in UI copy.
- New effect params: thumb excluded from visuals by default (`thumb: 0`);
  visuals must react instantly — don't add smoothing that trades feel for
  polish.

## Good first contributions

Check the [`good first issue`](https://github.com/thieudachill/fretart/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
label. The classics:

- **A new palette** — append to `PALETTES` with an art-historical reference.
- **A new preset** — see [docs/creating-presets.md](docs/creating-presets.md);
  the lint test validates the data, review validates the beauty.
- **A new area treatment or effect** — see
  [docs/creating-effects.md](docs/creating-effects.md).

## Pull requests

- One change per PR; explain what it looks/feels like, not just what it does.
  Screenshots or short clips (the built-in `R`/`S` capture!) help review
  enormously.
- New pure logic comes with tests; new visuals come with a preset or a note
  on how to see them.
- CI green, no drive-by reformatting.

## What not to commit

`.env` (API keys), `reference/` (copyrighted material), `scratch/`,
generated media, `node_modules`, `dist`. The `.gitignore` already covers
these — if you find yourself force-adding something, stop.

## Questions

Open a [discussion issue](https://github.com/thieudachill/fretart/issues) —
there are no stupid questions about coordinate spaces, everyone gets bitten
by y-down once.
