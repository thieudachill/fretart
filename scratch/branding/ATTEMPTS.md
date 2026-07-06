# Asset attempt log (rubric in NOTES.md §4, max 7 per asset)

## mark (logo)
1. mark-1 — PASS. Clean hand-over-strings, one dot. Nits: ~8 strings, exits one side.
2. mark-2 — FAIL. Tangled fingers, two accent dots.
3. mark-3 — PASS (front-runner). Fingers dissolve into the strings — literally the
   app's thesis. On sheet with mark-1.

## wordmark
1. wordmark-1 — FAIL spelling ("FRF…", stray stroke). Style direction confirmed good.
2. wordmark-2 — PASS. Reads FRETART, baseline flows in/out of frame. Letter-by-letter
   prompt fixed the spelling.

## grain (paper tile)
1–3. BLOCKED (copyright/recitation) under three different phrasings: "scan of paper",
   "photographed sheet", "abstract speckled texture". Pattern clear → **pivoted to
   code**: `grain.svg` (feTurbulence, seamless via stitchTiles). Better outcome anyway:
   exact hex, tileable, 1 KB, no JPEG noise.

## splash
1. splash-1 — PASS. Hand on neck, vermilion halftone bloom, echo lines. Keeper.

## spot-a (fretting study)
1. spot-a-1 — PASS. Arched fingers on strings, one dot.

## spot-b (strum release)
1. spot-b-1 — borderline: muddled palm/thumb.
2. spot-b-2 — borderline the other way: beautiful line, but three vermilion nails
   (rubric wants ONE accent). Both on sheet — user's taste call.

## hero-still (video seed, 16:9)
1. hero-still-1 — PASS. Full-width strings, hand at left third, one dot.

## hero-loop (Veo, first=last frame)
1. attempt 1 — FAIL (API): `inlineData` rejected → fixed to `bytesBase64Encoded`.
2. attempt 2 — FAIL (API): `negativePrompt` unsupported on lite → folded into prompt.
3. attempt 3 — FAIL (API): `durationSeconds` must be a number, not string.
4. attempt 4 — PASS. 1080p/8s/24fps. Frame QC: n=0 ≡ seed, mid-frames show real
   string ripple with hand + background locked, last frame ≡ first → seamless.
   Audio stripped (`-an`) → out/hero-loop-1.mp4. Alpha-matte decision deferred to
   Phase 8 (paper background may be kept and multiply-blended instead).
