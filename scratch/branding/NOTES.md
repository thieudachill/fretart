# FretArt brand assets — research + art direction (Phase 5)

Working notes. Nothing in this folder is committed except this file and the
curated picks that graduate to `public/brand/` after the taste gate.

## 1. Model research (verified 2026-07-07 against ai.google.dev)

### Image — `gemini-3.1-flash-lite-image` ("Nano Banana 2 Lite")

- **API surface:** the new **Interactions API** — `POST
  https://generativelanguage.googleapis.com/v1beta/interactions` with
  `x-goog-api-key` header. (Legacy `models/<id>:generateContent` still exists;
  the script falls back to it if interactions ever breaks.)
- Request: `{ model, input: [{type:'text', text}], response_format: { type:
  'image', mime_type:'image/jpeg', aspect_ratio, image_size:'1K' } }`.
  **JPEG output only** (verified live: `image/png` → 400). Cut-outs must
  tolerate JPEG noise — use colorkey with similarity tolerance, or skip
  cut-out entirely and composite with `mix-blend-mode: multiply` (ink on
  paper multiplies naturally).
  Image editing = add `{type:'image', mime_type, data:<base64>}` blocks to
  `input`. Multi-turn refinement via `previous_interaction_id`.
- Response (verified live): `steps[]` — the `type:'model_output'` step holds
  `content[]` blocks; image block = `{type:'image', mime_type, data:<base64>}`.
  Top-level `id` feeds `previous_interaction_id` for multi-turn edits.
  ~1.5k tokens/image billed.
- **Constraints:** 1K output only (≈1024px long side), aspect ratios
  1:1 · 3:2 · 2:3 · 3:4 · 4:3 · 4:5 · 5:4 · 9:16 · 16:9 · 21:9.
  **No alpha channel** — generate on a flat even background, cut out after.
  SynthID + C2PA watermark always on (invisible; disclosed in docs).
  ~$0.034 per image, ~4s latency → cheap and fast enough for the QC loop.

### Video — `veo-3.1-lite-generate-preview`

- **API:** `POST …/v1beta/models/<id>:predictLongRunning`, then poll
  `GET …/v1beta/<operation.name>` until `done`; file URI at
  `response.generateVideoResponse.generatedSamples[0].video.uri`
  (download with the same API-key header).
- **First+last-frame interpolation** (the loop trick): instance carries
  `image: {inlineData:{mimeType,data}}` **and** `lastFrame: {inlineData:…}`.
  Feed the *same* frame as both → the model animates a path that returns
  home → seamless loop.
- Parameters: `aspectRatio` 16:9 | 9:16, `resolution` 720p | 1080p (no 4k on
  lite), `durationSeconds` "4" | "6" | "8". Image fields are
  `{bytesBase64Encoded, mimeType}` — the `inlineData` wrapper is rejected
  (verified live). **`negativePrompt` is NOT supported on lite** (verified
  live) — bake avoidances into the prompt positively ("the camera never
  moves", "no new objects ever appear").
- **Always renders audio** → strip with `ffmpeg -an`.
- ~$0.06/second (≈$0.50 per 8s attempt) → budget ~7 attempts is fine.

### Post-processing (local, ffmpeg — verified installed)

- Cut-out: `colorkey`/`chromakey` against the flat paper color, or keep the
  paper and use CSS `mix-blend-mode: multiply` (ink art on paper *wants*
  multiply — often no cut-out needed at all; the paper IS the brand).
- Hero loop: `ffmpeg -i in.mp4 -an -c:v libvpx-vp9 -pix_fmt yuva420p` after
  `colorkey` → transparent WebM. Keep an .mp4 fallback with paper baked in.

## 2. Art direction (first principles)

**What the brand is:** the app makes a guitarist's finger flow visible as ink
on paper. The brand assets must look like they came off the same desk — a
print shop / drawing studio, not a tech landing page.

Three pillars, straight from the app's own aesthetic:

1. **Line** — one continuous contour line (Picasso/Cocteau one-line studies,
   pen-plotter art). Economical, confident, never sketchy or crosshatched.
2. **Paper** — everything lives on Studio Ink paper `#f5f1e6`. Never pure
   white, never a gradient. The paper is a material, not a background color.
3. **Print restraint** — at most three inks, exactly the Studio Ink palette:
   graphite `#2b2a2e` (the drawing line), vermilion `#c65b3f` (ONE small
   accent, used once per composition), warm gray `#a39c8a` (optional wash).

Anti-goals ("AI slop" tells to reject on sight): glossy gradients, neon glow,
extra fingers, ornamental flourishes, fake depth-of-field, watermark-ish text,
more than one accent color, busy backgrounds.

## 3. Prompt engineering rules (per current Gemini docs + model behavior)

- **Narrative scene description, not keyword soup.** Describe the drawing as
  if briefing an illustrator: subject, medium, line character, palette (with
  hex codes — Nano Banana 2 honors them), composition, background.
- **State what IS there, not what isn't.** Instead of "no shading", say "flat
  uniform paper background, evenly lit edge to edge, the only marks on the
  page are the single ink line and one vermilion accent."
- **Keyable background is part of the prompt**: "perfectly flat, even,
  uniform warm cream background, exact color #f5f1e6, no vignetting, no
  texture, no shadows" — this is what makes cut-out possible (no alpha out).
- **Text**: describe lettering style ("hand-lettered in one continuous
  confident ink line, geometric capitals"), never font names. Spelling is the
  #1 QC failure for lettering — check character by character.
- **Video**: describe motion + camera separately ("camera locked off,
  background perfectly still; only the ink line moves"). Use
  `negativePrompt` for the failure modes seen in attempts.
- **Iterate by editing**, not only re-rolling: the Interactions API supports
  image-input editing — when an attempt is 80% right, feed it back with a
  surgical instruction instead of a fresh roll.

## 4. QC loop (user rule, 2026-07-07)

Every asset: generate → **view the file** → score against the rubric →
refine prompt (or edit-in-place) → regenerate. **Max 7 attempts per asset.**
If attempt 7 still fails, change direction for that one asset — usually:
code draws it (SVG/canvas), or the asset is descoped/simplified.

Rubric (all must pass):
1. **Anatomy/spelling** — five fingers, plausible hand, every letter correct.
2. **Keyable ground** — background is flat, even `#f5f1e6`, edge to edge.
3. **Line quality** — reads as one continuous line; no hatching, no sketch
   fuzz, no double strokes.
4. **Palette** — only paper/graphite/vermilion(/warm gray). No stray hues.
5. **No slop tells** — see anti-goals list above.
6. **Composition** — generous margins, subject centered or deliberately
   placed; crops nothing important.
7. *(video)* loop is seamless (first ≡ last frame), background rock still.

## 5. Asset list & prompt recipes

| # | Asset | File slug | AR | Fallback if 7 attempts fail |
|---|-------|-----------|----|------------------------------|
| 1 | Logo mark (hand + strings, one line) | `mark` | 1:1 | hand-draw as SVG path |
| 2 | Wordmark "FRETART" lettering | `wordmark` | 21:9 | code type (theme font) + mark |
| 3 | Splash illustration | `splash` | 3:2 | mark scaled up + paper grain |
| 4 | Paper grain tile | `grain` | 1:1 | procedural canvas noise |
| 5 | Spot: fretting hand study ×2–3 | `spot-a`, `spot-b`, `spot-c` | 4:5 | crop from splash |
| 6 | Hero loop video (ink motion) | `hero-loop` | 16:9 | CSS-animated SVG line |

Attempt log lives next to the assets: `scratch/branding/<slug>-<n>.png` plus
`ATTEMPTS.md` (one line per attempt: prompt delta + rubric verdict).

## 6. Boundary (standing rule)

UI chrome, layout, buttons, typography systems = **code**. Generated assets =
only illustration/texture/video that code cannot draw. `GEMINI_API_KEY` never
leaves `.env`; nothing in `scratch/branding/` auto-commits.
