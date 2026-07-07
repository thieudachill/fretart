# Changelog

All notable changes to FretArt are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

Everything below ships together as **v1.0.0** — the first public release.

### Added

- **Hand tracking → visuals pipeline**: MediaPipe hand landmarking, One Euro
  smoothing with velocity anticipation, screen-space feature extraction
  (fingertips, spread, pinches, presence), one-way data flow into a three.js
  effect chain.
- **Six effects**: finger shapes (contour / cut-out / constellation, six
  in-shape area treatments), facet fold (screen-printed folded paper),
  string lines, riso collage, particle trails, motion echo.
- **Audio engine**: mic → level / onset / pitch-register / bass / air, all
  routable like hand features; speech processing disabled to preserve guitar
  transients; everything reads 0 without a mic.
- **Mod matrix**: four routing slots, additive on top of slider values,
  every effect parameter a target.
- **Preset system**: 22 built-ins across five categories, localStorage saves,
  JSON export/import, category-aware browser, lint test guarding built-in
  integrity.
- **Recording**: canvas + mic muxing, mp4 where supported (WebM fallback),
  30/60 fps and share/master quality options, PNG snapshots, preset-named
  files.
- **Performance UI**: bottom stage bar (preset browser with search and
  armed-category hotkeys `[` `]` `1–9`, REC + timer, snapshot, camera/mic,
  fullscreen), Tweakpane "studio drawer" with folder memory, double-click
  reset, live routing values; `H` filming mode; first-visit privacy gate.
- **Sim mode**: `?sim` synthetic player and `?sim=<name>` fixture replay —
  full development without a webcam; dev hotkey `J` records fixtures.
- **Docs**: architecture, creating effects, creating presets, audio; full
  README; contributor scaffolding.

[Unreleased]: https://github.com/thieudachill/fretart/commits/main
