# Audio

FretArt can hear the guitar and route what it hears into any visual
parameter. Everything is analyzed live in the browser; nothing is uploaded,
and the mic track is only saved when you record with "record sound" on.

## Turning it on

Click the mic button in the bottom bar, or use the drawer's **Audio (mic)**
folder (device picker, sensitivity, live level graph). The listening state
and chosen device persist per browser (`fretart.audio.v1`), outside presets —
they're hardware setup, not artistic state.

The mic is opened with `echoCancellation`, `noiseSuppression`, and
`autoGainControl` **all off**. Those are speech processors; they eat guitar
transients and dynamics. If your input sounds mangled anyway, check the OS
sound settings for a vendor "voice enhancement" doing the same thing.

## The five sources

All 0..1, updated every frame, available in the mod matrix as `audio.*`
(and to any future consumer via `FrameFeatures.audio`):

| Source | What it is | Feels like |
| --- | --- | --- |
| `audio.level` | RMS with fast-attack / slow-release envelope | how loud, with natural decay |
| `audio.onset` | positive spectral flux against an adaptive threshold | snaps to 1 on each pluck, then decays |
| `audio.pitch` | autocorrelation pitch → register, E2 → 0 .. E6 → 1, holds between notes | where you are on the neck |
| `audio.bass` | low-band energy | thumb, low strings |
| `audio.air` | high-band energy | sparkle, attack brightness |

With no mic listening, all five read 0 — routings become no-ops, and Audio
Reactive presets degrade to quiet, still-looking scenes.

The detectors live in `src/audio/detectors.ts` — pure functions, unit-tested
against synthesized buffers (sine plucks, noise bursts, silence). The Web
Audio shell is `src/audio/audioEngine.ts` (AnalyserNode, fft 2048).

## Routing sound to visuals

In the drawer's **Modulation** folder pick a source, a target, and an amount
(−1..1; negative inverts). Amounts add to the slider's base value, scaled by
the target's full range — your slider positions are never overwritten. Each
routing row shows the source's live value, so you can watch a pluck spike
`audio.onset` while you play.

Recipes worth trying:

- `audio.onset → shapes.breathe` — every pluck makes the shape bloom
  (the *Pluck Bloom* preset).
- `audio.onset → strings.vibration` — strings ring only when a note is
  struck (*Attack Lines*).
- `audio.bass → facets.apex` — low notes push the paper pyramid up
  (*Bass Fold*).
- `audio.level → echo.persist` — the louder the room rings, the longer the
  trails last (*Resonance*).
- `audio.pitch → strings.waviness` — melody as a ribbon; climb the neck and
  the ripple quickens (*Register Ribbon*).

## Latency

The audio path adds no perceptible lag (one analyser read per frame). If
sound-driven visuals feel late, the usual culprit is the *tracking* path —
see the lighting note in the README — or a Bluetooth mic buffering input.
Wired mics or the laptop's built-in mic respond fastest.
