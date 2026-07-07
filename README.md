# FretArt

[![CI](https://github.com/thieudachill/fretart/actions/workflows/ci.yml/badge.svg)](https://github.com/thieudachill/fretart/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-4c505a)](LICENSE)

<!-- hero media: brand mark + a real playing capture (gif/mp4 from the in-app
     recorder) land here once curated — see docs/media notes in CONTRIBUTING. -->

Real-time generative visuals driven by a guitarist's hands. A webcam tracks your
fingers while you play; the motion is rendered as ink lines, screen-print halftones,
folded-paper facets, and vibrating strings. Switch on the mic and the visuals also
hear you — plucks bloom, bass folds paper, melody ripples a ribbon.

FretArt exists to make visible not only the art of the sound, but the art of the
flow of a guitarist's fingers.

Everything runs locally in your browser. No uploads, no accounts, no keys.

## Quickstart

```
git clone https://github.com/thieudachill/fretart.git
cd fretart
npm install        # also fetches the MediaPipe wasm + hand model (~7 MB)
npm run dev        # open http://localhost:5173 and allow webcam access
```

Requirements: Node 20+, a webcam, and a reasonably recent GPU. Chrome/Edge recommended
(best codec support for recording); Firefox and Safari work for playing.

## Playing

Sit like you would on camera: hands visible, decent light. The bottom bar has
everything you need on stage; the **Studio** drawer (right side) has every parameter
when you're designing a look.

| Key | Action |
| --- | ------ |
| `H` | Hide all UI — filming mode |
| `F` | Fullscreen |
| `P` | Preset browser — type to search, `↑` `↓` + `Enter` to load |
| `[` `]` | Previous / next preset category |
| `1`–`9` | Load preset *n* in the current category |
| `R` | Start / stop recording |
| `S` | Save a PNG snapshot |
| `D` | Tracking debug overlay |
| `?` | Key help |

In the Studio drawer: double-click any slider to reset it, and watch the live
value next to each modulation routing to see what your hands are sending.

## Presets

22 built-in looks, browsable by category (`P`), each a full snapshot of effects,
parameters, palette, and hand/sound routings. Save your own from the drawer's
Presets folder; user saves appear in the browser alongside the built-ins and
export/import as JSON.

| Category | Presets |
| --- | --- |
| **Line & Shape** | Line Drawing · Cut-Out Studio · Wavy Ink · Gesture Study · Gabo Threads · Pastel Ribbon |
| **Print & Paper** | Print Window · Negative Space · Mosaic Lens · Print Pyramid · Blueprint Pyramid · Print Shop |
| **Motion & Light** | Blueprint · Data Field · Neon Strings |
| **Audio Reactive** | Pluck Bloom · Attack Lines · Bass Fold · Resonance · Register Ribbon |
| **Collage & Mixed** | Full Collage · Soft Collage |

A few starting points: **Line Drawing** (the default — one ink line wrapping the
fingertips, pen-drawn strings between the hands), **Print Window** (your finger
shape becomes a halftone print of whatever is behind it), **Pluck Bloom** (each
pluck blooms the shape — needs the mic), **Neon Strings** (the stage look:
glowing strings over a long feedback trail).

Audio Reactive presets degrade gracefully without a mic — sound sources read 0,
so they stay quiet, still-looking scenes until you switch listening on.

## Sound

Click the mic button in the bar (or the drawer's "Audio (mic)" folder). FretArt
extracts level, pluck onsets, register (how high you're playing), and bass/air
balance — all routable to any visual parameter through the modulation matrix.
Audio is analyzed in real time and never recorded unless you ask (below).

## Recording

`R` records the artwork canvas — and your guitar, when the mic is listening and
"record sound" is on. Where the browser supports it you get mp4 (H.264+AAC)
directly; otherwise WebM — convert with
`ffmpeg -i clip.webm -c:v libx264 -crf 18 clip.mp4`. Options (30/60 fps,
share/master quality) live in the drawer's Recording folder and persist.
Files are named after the current preset. `S` saves a full-resolution PNG.

## Tips & troubleshooting

- **Laggy tracking?** More light on your hands. Webcams lengthen exposure in dim
  rooms, which adds motion blur and latency — this dominates perceived lag far
  more than the hand-tracking model does.
- The drawer's **Tracking feel** folder has a `response` slider (calm ↔ snap) and
  `anticipate ms` (extrapolates fingertips to hide pipeline delay). These persist
  per device, outside presets.
- Black screen / very low fps: check the browser is using your GPU
  (`chrome://gpu`), not software rendering.
- Camera won't start: another app may be holding it; close video-call software
  and reload.

## Developing

```
npm test           # unit tests (Vitest)
npm run typecheck
npm run build
```

No webcam handy? Open `http://localhost:5173/?sim` — a synthetic player drives
the visuals so you can develop effects anywhere. In dev builds, press `J` while
tracking live to record your own landmark session; drop the downloaded JSON into
`public/fixtures/` and replay it with `?sim=<name>`.

Docs for contributors:

- [Architecture](docs/architecture.md) — the one-way data flow, module by module.
- [Creating an effect](docs/creating-effects.md) — a new visual layer is one file
  plus one registration line.
- [Creating presets](docs/creating-presets.md) — schema, taste rules, and the
  lint test that keeps built-ins honest.
- [Audio](docs/audio.md) — what the mic hears and how to route it.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## Credits

Created by **[Matthew (Thieu) Nguyen](https://thieun.com)** — guitarist and builder
from Da Nang, Vietnam ([YouTube](https://www.youtube.com/@thieu.dachill) ·
[LinkedIn](https://www.linkedin.com/in/matthewnt) ·
[Instagram](https://www.instagram.com/thieu.theguy)).

## License

[MIT](LICENSE) © Matthew (Thieu) Nguyen and FretArt contributors. The MediaPipe wasm
runtime and hand landmark model are fetched at install time from Google and are
licensed Apache-2.0 by Google/MediaPipe.
