# Asset attempt log (rubric in NOTES.md §4, max 7 per asset)

Three concepts (user request: generate B and C so ONE direction can be chosen
for the whole project). Concept A below; B and C at the end.

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

---

# Concept B — Print Shop (riso)

## riso-mark
1. riso-mark-1 — PASS. Charcoal hand silhouette, amber misreg halo, halftone palm.

## riso-wordmark
1. (transient HTTP 500, not an attempt)
2. riso-wordmark-1 — PASS. FRETART correct, heavy grotesque, red offset layer.

## riso-splash
1. riso-splash-1 — FAIL. Model invented gig-poster text ("MIDNIGHT SESSIONS…")
   and rendered a photo of a poster (gray backdrop, drop shadow) instead of flat
   art. Lesson: for poster-style prompts, always state "the artwork itself, not a
   photograph of a poster" + "absolutely no words or lettering anywhere".
2. riso-splash-2 — PASS. Full-bleed three-ink riso, both hands, no text.

# Concept C — Blueprint (cyanotype)

## cyano-mark
1. cyano-mark-1 — PASS. Patent-drawing hand over fret grid, dimension ticks.

## cyano-wordmark
1. cyano-wordmark-1 — PASS. FRETART correct, drafting caps, dimension line
   with arrowheads underneath.

## cyano-splash
1. cyano-splash-1 — PASS. Diagonal neck diagram, fingertip callout circles,
   authentic cyanotype coating edge. (Tiny illegible tick figures — acceptable
   as drafting texture, no real words.)

---

# Concept B v2 — "The Human Press" (deepened foundation, NOTES.md §2b)

## riso2-mark
1. riso2-mark-1 — PASS w/ note. Wave + nodes + Chladni halftone all correct;
   fingertip so abstract it reads as a pen nib.
2. riso2-mark-2 — partial. Iconic single-lobe fundamental wave, but fingertip
   came back as outline (Concept A line language leaking in).
3. riso2-mark-3 — PASS, FRONT-RUNNER. Solid charcoal fingertip with cream nail
   cutout pressing at the right node, filled amber fundamental lens, halftone
   dense at both nodes. Reducible to favicon size.

## riso2-wordmark
1. riso2-wordmark-1 — PASS. FRETART correct, amber ghost layer, string runs
   through the word and dips into ONE wave with ONE vermilion node dot
   (rhythm broken exactly once).

## riso2-splash
1. riso2-splash-1 — PASS. The thesis as a picture: fretting hand makes the
   node, pressed string erupts into a red standing wave between still strings,
   ripples spread from the pressed point, halftone gathers along still lines.

## riso2-spot-a (fretting study, 4:5)
1. riso2-spot-a-1 — 80% right; halftone blurred around the MOVING middle of
   the wave (inverted Chladni — discipline rule 5 fail).
2. riso2-spot-a-2 — PASS. Edit-in-place via `--prev` moved the dot density to
   the two nodes; lens shape converged toward mark-3's language.

## riso2-spot-b (strum release, 4:5)
1. riso2-spot-b-1 — PASS first try. Hand lifting, one wave between node dots,
   halftone correctly dense at nodes, amber ripple arcs read like a rosette
   (happy accident, stays inside the 3-ink law). Note: no misreg ghost on the
   hand — acceptable, the amber voice is spent on the arcs.

## riso2-hero-still (16:9, Veo loop seed)
1. riso2-hero-still-1 — FAIL. Amber "ghost" drifted into a SECOND hand from
   above (offset must be millimetres, not a hand-width); charcoal knuckles
   lumpy where the two fused.
2. riso2-hero-still-2 — close. One hand, tight amber ghost, perfect
   wave/nodes/halftone — but curled fingers read as a "rock horns" gesture
   and the fingertip didn't touch the left node.
3. riso2-hero-still-3 — PASS. Edit via `--prev`: calm four-finger arch,
   fingertip resting exactly ON the left node dot; the arch even produced a
   paper cutout inside the hand (figure-ground reversal, rule 4). The seed.

## riso2-hero-loop (Veo, first=last=hero-still-3)
1. attempt 1 — FAIL content. Seam perfect, camera locked, but mid-loop the
   lens morphs into spiky four-point STAR shapes (off-language) and Veo
   sprinkled animated dust specks over the paper.
2. attempt 2 — FAIL content. Same star failure mode + dust despite explicit
   "never spikes / no dust" language. Lesson: Veo lite insists on animating
   the lens's amplitude if the prompt lets the lens move at all.
3. attempt 3 — PASS. Strategy change: FREEZE the lens entirely, move the
   energy outward instead — a small ripple pulse travelling along the thin
   red line off the right edge (on-thesis: sound leaving the still point).
   Lens stays a smooth lens all 8s, no dust, frame 0 ≡ seed ≡ last frame.
   One brief ripple curl near the node at ~2s — acceptable, reads stylized.
   Audio stripped → out/riso2-hero-loop.mp4 (1080p 8s 24fps).
