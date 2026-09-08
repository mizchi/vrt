# Log — `matrix-lcs-readouts`

Writer: kc. Only sources read: `docs/anim-ir.md`, `vlmkit-anim schema --kind matrix`,
`vlmkit-anim schema --kind annotations`, and the CLI's own output.

## The table (worked by hand before writing JSON)

Rows = prefixes of `AB` (`∅, A, B`), cols = prefixes of `BA` (`∅, B, A`).

```
      ∅  B  A
  ∅ [ 0, 0, 0 ]
  A [ 0, 0, 1 ]   A≠B→max(0,0)=0 ; A=A→diag+1=1
  B [ 0, 1, 1 ]   B=B→diag+1=1   ; B≠A→max(1,1)=1
```
LCS = `L[2][2] = 1`. Matches the title.

## Round 1

Wrote `scene.json`: `cells` carries the given zero row/col already filled in
(same shape as the `docs/anim-ir.md` matrix example, which pre-fills row/col 0
rather than animating them); `ops` fills `(1,1) (1,2) (2,1) (2,2)` in row
order, each `set` with `from`; a `value` readout at `row:A`/`row:B` `side:
right` folds (`ms:0`) into the last `set` of that row; the opening callout at
`0,0` (default `side: above`, i.e. not stated) gets its own beat, then a
second beat hides it (`callout: null`) before the fills start; the closing
callout at `2,2` `side: left` folds into the last `set`.

```
$ pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/kc/scene.json
✓ scene.json (matrix): 0 error(s), 0 warning(s)
  4200ms · 8 steps (7 captioned) · 31 nodes · 24 tracks / 83 keyframes · annotations: 4 drawn, 3 on screen at the end
  scene 1012 B → timeline 9491 B (×9.4)
  next: vlmkit-anim explain fixtures/anim-scenario/attempts/kc/scene.json · vlmkit-anim render fixtures/anim-scenario/attempts/kc/scene.json --step N · vlmkit-anim html fixtures/anim-scenario/attempts/kc/scene.json --out page.html

$ pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/kc/scene.json
0 of 8 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

**First-attempt ✗: 0. First-attempt ⚠: 0.** Green on the first write — no
edits were needed for `check` or `layout` to pass. (`scene 1012 B` is the
report's own count of the *input* JSON; my saved file is 1237 B — see byte
count below; the difference is the tool's pretty-printed vs. my formatting.)

```
$ pnpm exec vlmkit-anim explain fixtures/anim-scenario/attempts/kc/scene.json
LCS(AB, BA) = 1 — 8 steps, 4200ms, 31 nodes
 1. [    0ms] LCS(AB, BA) = 1
 2. [  360ms] Every empty-prefix cell starts at 0
 3. [  960ms] Now fill the rest of the table
 4. [ 1560ms] A ≠ B: max(above, left) = max(0, 0)
 5. [ 2160ms] A = A: copy the diagonal + 1 · A = [0, 0, 1]
 6. [ 2760ms] B = B: copy the diagonal + 1
 7. [ 3360ms] B ≠ A: max(above, left) = max(1, 1) · B = [0, 1, 1] · the answer: one letter in common
 8. [ 3960ms] (end)
```

This reads as the algorithm: zero row/col given, four fills each naming what
it came from, the two row summaries appearing exactly as their rows finish,
the closing note landing on the beat that fills the last cell. Success
criteria (`check` 0/0, `layout` clean, `explain` reads as the algorithm) were
all met in round 1, so no round 2 was needed to reach green.

I still spent extra rounds of *investigation* (not scene edits) to answer the
brief's per-annotation question below — rendering frames and one throwaway
comparison scene, none of which touched `scene.json` itself.

## Per-annotation: asked vs. landed

Rendered with `vlmkit-anim render scene.json --step N --out f.svg` (frame at
the *start* of step N) and, for the two `ms:0` annotations, also
`--at <ms>` deeper into the beat — see the "settled" finding below, this
mattered. Frames kept in this directory: `step1.svg` (t=0, title),
`step2.svg` (opening callout shown), `step4.svg` (opening callout hidden,
first fill), `step5.svg` (row A's own beat — value not yet visible, see
below), `step7-settled.svg` (t=3700, deep into the closing beat — still not
visible), `step8.svg` (t=3960, the final "(end)" step — everything settled).

| # | annotation | asked | landed | pointer through another cell/label? | canvas grew? |
|---|---|---|---|---|---|
| 1 | callout above `0,0` | `side: above` (default, unstated) | **below** the whole table, still centred on column 0 (`x=137`, `y=192` vs. the table's own rows at `y=85..168`) | No — the arrow bends left of the row-label column (`x=77`, row labels end at `x=105`) then back right into the cell's bottom edge; it never crosses `row-1`/`row-2`'s column-0 cells or the row labels | Yes, downward: canvas height 230→299 (+69px), because both callouts (#1 and #4) fell to "below" |
| 2 | value readout, row A, `side: right` | `right` | **right**, exactly as asked (`x=255`, `y=119`, level with row A's cells which end at `x=245`) | n/a — a `value` readout is text only, no pointer | Yes, rightward: canvas width 320→375 (+55px), for the two row-value panels |
| 3 | value readout, row B, `side: right` | `right` | **right**, exactly as asked (`x=255`, `y=153`, level with row B) | n/a — no pointer | Same rightward growth as #2, shared |
| 4 | callout left of `2,2` | `side: left` | **below** the table, centred on column 2 (`x=225`, `y=214`) | No — the arrow is a straight vertical line inside column 2 only, from the callout box up to just under the cell; nothing else sits in that column below row 2 | Same downward growth as #1, shared |

**2 of 4 landed on the side asked; 2 of 4 (both `callout`s) did not.**

Why: `0,0` is the top-left cell, and the scene `title` sits centred above the
whole table — there is no free space above *any* top-row cell, so "above"
is unavailable there regardless of the callout's text length (confirmed with
a one-character throwaway callout: same result, landed below). `2,2`'s
"left" is blocked by the real, filled neighbour cell `(2,1)` sitting right
there — and its usual fallback, "right" (which succeeded when I tried the
callout alone, in a scene with no other annotations, landing level with the
row: `y=153`, right of the table), was in *this* scene already occupied by
the row-B `value` readout at that same `y`. So the two failures compound:
losing "left" and then losing the natural next choice "right" because a
sibling annotation is already there is what pushes it all the way to
"below". This is a real, reproducible finding from the layout engine's
actual placement search, not a guess — I isolated it with a second scene
file containing only that one callout, no `value` readouts, and it landed
right, not below.

### A separate, real gotcha: `ms: 0` annotations are invisible for the *entire* folded beat

I expected "as each row completes" to mean the readout is on screen from the
moment that beat's frame is rendered. It is not: sampling
`vlmkit-anim render --at <ms>` across the whole 600 ms window of the folded
beat (row A's readout folds into the `set (1,2)` beat, `2160`–`2760` ms)
shows `opacity="0"` at every sampled instant — `2200, 2400, 2600, 2650, 2700,
2720, 2740, 2750, 2755, 2758` ms all read `opacity="0"` — and it flips to
fully visible only at `2760` ms, the *next* step's start. Same for the
closing beat: `step7-settled.svg` at `t=3700` (340 ms into a 600 ms beat)
still shows `value-rowB` and `callout-main-1` at `opacity="0"`; only
`step8.svg` (`t=3960`, the boundary into the closing "(end)" step) shows them
settled. So `render --step N` on the beat an `ms:0` annotation is folded into
shows the *caption* joined correctly but not the annotation itself — you have
to render step `N+1` (or `--at` a time at/after the next step marker) to see
what that beat's caption is describing. The guide's own framing ("so a value
… appears at the moment the reveal it belongs to happens") reads as
true for the narration but not for the pixels.

## Hand-typed coordinates / colours / canvas sizes

**Zero.** I never wrote a coordinate, a colour, or a canvas dimension. Every
anchor is a name the kind already has: `"0,0"`, `"2,2"`, `"row:A"`,
`"row:B"`. `cells`, `rowLabels`, `colLabels` are the DP table's own values —
not layout. No `canvas` field appears in `scene.json` at all; both dimensions
(320×230 bare, 375×299 with all four annotations, confirmed by diffing a
throwaway copy of the scene with the four annotation ops deleted) were the
compiler's own sizing decision, not mine.

## `scene.json` size

**1237 bytes.**

## Friction

**What helped.** The anchor table in `schema --kind annotations` (also in the
guide) was exactly what I needed and nothing more — `"row:A"` and `"col:B"`
for the matrix kind meant I never had to compute a pixel position for "next
to row A," and the two-op idiom (real op, then annotation with `ms: 0`) for
tying a readout to a specific beat was unambiguous from the one example in
the guide (`{"value": …}, "ms": 0` right after `{"pointers": …}`). The
`from` field on `set` was also well specified — I could write down
`from: [[0,1],[1,0]]` straight from my by-hand DP derivation with no
translation step. `check`'s stats line (`annotations: 4 drawn, 3 on screen at
the end`) was a nice sanity check that matched my mental model exactly (the
opening callout is the one that goes dark).

**What was missing or misleading.**

- The guide states annotation appearance as tied to "the moment the reveal it
  belongs to happens." In practice an `ms: 0` annotation is invisible for the
  *entire* folded beat and only appears at that beat's end (the next step's
  start) — see the sampling above. If the intent is genuinely "pop in with
  the event," I would have expected it visible from the start of that beat's
  window, not the end. As written, if a viewer pauses on that step (or a
  contact-sheet tool grabs the frame at the step's start time, which is what
  `render --step N` does), the thing the caption just said happened is not
  actually drawn yet. I only found this by sampling `--at` across the beat's
  full range — nothing in `check` or `layout` flagged it, and the caption
  text made it look correct at a glance.
- `side` reads as a request in the doc's prose ("`side` = `above` | `below` |
  `left` | `right`") but is closer to an initial preference the engine is
  free to override with no signal back to the writer *that* it did — `check`
  and `layout` were both fully green on a scene where 2 of my 4 explicit
  side choices were silently overridden. I only found out by opening the
  rendered SVG and comparing coordinates by hand against the cells' own
  positions. A warning — "callout `0,0` asked for `side: above`, placed
  `below`" — would have told me this in the terminal instead of a text
  editor.
- I wanted to put the opening callout literally above the top-left cell
  (as the brief describes it), and the title made that structurally
  impossible for *any* top-row cell, no matter what I did to the text. There
  is no field to say "shrink the title" or "don't reserve space for the
  title here" — the closest workaround I can imagine (not tried, since it
  changes the brief's asked-for content) would be dropping the scene
  `title` and using a `note` beat instead, trading a real feature for
  layout room.
- Relatedly: I wanted the *second* callout to land beside the table on the
  right the way it does in isolation (confirmed: alone, with no `value`
  readouts competing for that space, "left" on `2,2` falls back to "right,"
  level with the row — a sensible fallback). In the full scene that same
  fallback slot was already taken by the row-B `value` readout, so the
  callout instead fell all the way to "below." I could not find a way to ask
  "prefer right, but stack under the value readout instead of jumping to the
  opposite edge of the canvas" — the side vocabulary is four cardinal
  choices with an opaque search behind them, not a way to say "near here, in
  whichever free direction is closest."
- Minor: `check`'s own byte count for the scene ("scene 1012 B") does not
  match `wc -c scene.json` (1237 B) for the file I actually saved — presumably
  the report measures its own canonicalized/minified form, not my
  pretty-printed file, but the report doesn't say so, and this cost me a
  moment of thinking my saved file was corrupted.
