# FretArt

Real-time generative visuals driven by a guitarist's hands. A webcam tracks your
fingers while you play; the motion is rendered as ink lines, screen-print halftones,
folded-paper facets, and vibrating strings — the art of the finger flow, made visible.

Everything runs locally in your browser. No uploads, no accounts, no keys.

> Full README with visuals, preset gallery, and contributor docs is coming with v1.0.

## Quickstart

```
git clone https://github.com/thieudachill/fretart.git
cd fretart
npm install        # also fetches the MediaPipe wasm + hand model (~7 MB)
npm run dev        # open http://localhost:5173 and allow webcam access
```

Requirements: Node 20+, a webcam, and a reasonably recent GPU. Chrome/Edge recommended.

## Hotkeys

| Key | Action |
| --- | ------ |
| `H` | Hide UI (filming mode) |
| `F` | Fullscreen |
| `D` | Tracking debug overlay |

## Tips

- More light on your hands = shorter webcam exposure = less motion blur and lower latency.
- The "Tracking feel" panel folder tunes responsiveness to your setup.
- Recording outputs WebM; convert with `ffmpeg -i clip.webm -c:v libx264 -crf 18 clip.mp4`.

## License

[MIT](LICENSE). The MediaPipe wasm runtime and hand landmark model are fetched at
install time from Google and are licensed Apache-2.0 by Google/MediaPipe.
