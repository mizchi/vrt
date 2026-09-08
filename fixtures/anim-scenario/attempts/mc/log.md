# Log — Sprint 14 gantt (fixtures/anim-scenario/briefs/gantt-sprint-plan.md)

Writer: fresh (no prior vlmkit-anim exposure). Only sources read: `docs/anim-ir.md`,
`vlmkit-anim schema --kind gantt`, `vlmkit-anim schema --kind annotations`, `vlmkit-anim --help`.

## Round 1

Wrote `scene.json` from the brief in one pass: six tasks (`spec`, `api`, `ui`, `wire`, `test`,
`demo`), four lanes, and 14 `ops` telling the slip story — `advance` to 2/4/7/9/10/11,
`slip` on `api` (end 6→8), `status`+`slip` on `wire` (late, 7-9 → 8-10), a `callout` at
`wire`, `status`+`slip` on `test` (blocked, 9-10 → 10-11), `status`+`slip` on `demo`
(late, start 10 → 11).

I deliberately re-dated `test` and `demo` even though the brief only says to mark them
`blocked` / `late` at their *original* days — because `docs/anim-ir.md`'s gantt section
says the check "warns when a task starts before something it depends on ends," and by
the time `wire` slips to end on day 10, `test`'s stated start of day 9 would be exactly
that violation, and `demo`'s day-10 start would be too once `test` moves. So I slipped
every downstream task's dates as well as its status, to keep the final schedule internally
consistent — see Friction below, this is the "should move automatically" gap the brief
asks about.

Command and exact output:

```
$ pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/mc/scene.json
⚠ nodes(cursor-label): "t = 9" has a line through it (callout-main-0-arrow, 14px) at step 10 (7140ms) and 2 later step(s)
    → the compiler placed this annotation — try another `side`, a shorter label, or anchor it at a different thing (the node instead of the edge), and report it if nothing helps
✓ scene.json (gantt): 0 error(s), 1 warning(s)
  12180ms · 16 steps (16 captioned) · 53 nodes · 41 tracks / 141 keyframes · annotations: 1 drawn, 1 on screen at the end
  scene 1927 B (minified) → timeline 17792 B (×9.2)
```

```
$ pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/mc/scene.json
frame 10 · step 10 · 7140ms — Regression run is blocked — the wiring still isn't finished
  crossed  "t = 9" has a line through it — 14px inside the text (cursor-label × callout-main-0-arrow)
frame 11 · step 11 · 7700ms — Regression run slips to days 10–11
  crossed  "t = 9" has a line through it — 14px inside the text (cursor-label × callout-main-0-arrow)
frame 12 · step 12 · 8610ms — Day 10: the sprint demo was supposed to happen today
  crossed  "t = 9" has a line through it — 14px inside the text (cursor-label × callout-main-0-arrow)
3 of 16 frames with layout issues · 0 overlap(s) · 0 clipped · 3 crossed
```

**First-attempt totals: 0 ✗, 1 ⚠** (`check` had one warning; `layout` — which `check`
also folds warnings from — flagged the same underlying annotation on 3 of 16 frames).

What happened: I never nulled the `callout` at `wire`, so it stayed on screen for the
rest of the animation. Its pointer arrow runs from a box in the panel below the chart
straight up to the `wire` bar, passing right through where the moving cursor's "t = N"
label sits once the cursor passes day 9. `check` and `layout` agree exactly (same line,
same anchors named): `nodes(cursor-label)` × `callout-main-0-arrow`.

## Round 2

Changed: added `"side": "below"` to the callout, guessing the compiler had put it
`above` by default and that was the crossing.

```
$ pnpm exec vlmkit-anim check … / layout …
⚠ nodes(cursor-label): "t = 9" has a line through it (callout-main-0-arrow, 14px) at step 10 (7140ms) and 2 later step(s)
    → the compiler placed this annotation — try another `side`, a shorter label, or anchor it at a different thing (the node instead of the edge), and report it if nothing helps
✓ scene.json (gantt): 0 error(s), 1 warning(s)
```
Identical warning, byte-for-byte the same text. No change. This told me `side: below`
was already where it had landed by default — I hadn't actually changed anything the
compiler cared about.

## Round 3

Changed: `"side": "left"` instead, to force a different placement.

```
$ pnpm exec vlmkit-anim check …
⚠ nodes(cursor-label): "t = 9" has a line through it …
⚠ ops[6].callout.side: the callout at "wire" asked for `left` and landed `below`: a line runs through that spot
    → if below reads fine, ask for it (or drop `side`) and this goes away; otherwise make room on the left: a shorter text, or anchor it at a thing whose left side is free
✓ scene.json (gantt): 0 error(s), 2 warning(s)
```
This was the useful line: it told me directly that `left` could not be honored and
`below` was chosen anyway (worse: now 2 warnings). It confirmed my Round 2 finding —
`side` was not going to move the crossing point, because the crossing isn't about box
placement, it's about the *arrow*, which runs from the callout (anchored under the
chart in the panel) up to the `wire` bar and physically transits the x-position where
the moving cursor label eventually sits. No `side` value moves the anchor or the bar.

## Round 4

Changed: dropped `side` back to default, and instead added `{"callout": null}` as its
own op right after the callout, before `advance 9` — reasoning that if the callout
can't coexist with the cursor's later position, the fix is to dismiss it before the
cursor gets there, since the callout's purpose (explaining *why* wire slipped) is
already served by that point.

```
$ pnpm exec vlmkit-anim check … / layout …
✓ scene.json (gantt): 0 error(s), 0 warning(s)
  12880ms · 17 steps (16 captioned) · 53 nodes · 41 tracks / 144 keyframes · annotations: 1 drawn, 0 on screen at the end
0 of 17 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```
Green. But `explain` showed step 9 with an empty caption (the bare `{"callout": null}`
op got its own step with no caption of its own):
```
 9. [ 6230ms]
10. [ 6930ms] Day 9: Regression run was due to start today
```
That's a real narrative defect even though `check` didn't flag it as a warning (the
"steps without captions" advice apparently didn't fire for this one, or fires on a
different signal) — it broke "explain reads as the story above, day by day."

## Round 5

Changed: moved the `{"callout": null}` op to *after* `{"advance": 9, ...}` and gave it
`"ms": 0`, so per the guide ("`ms: 0` applies it inside the previous beat … joined with
`·`, never replaces") it folds into the `advance 9` step instead of creating its own.

```
$ pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/mc/scene.json
✓ scene.json (gantt): 0 error(s), 0 warning(s)
  12180ms · 16 steps (16 captioned) · 53 nodes · 41 tracks / 144 keyframes · annotations: 1 drawn, 0 on screen at the end
  scene 1951 B (minified) → timeline 17915 B (×9.2)

$ pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/mc/scene.json
0 of 16 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed

$ pnpm exec vlmkit-anim explain fixtures/anim-scenario/attempts/mc/scene.json
Sprint 14 — 16 steps, 12180ms, 53 nodes
 1. [    0ms] Sprint 14
 2. [  420ms] Day 2: spec is done — API endpoints and the Settings screen both start
 3. [ 1330ms] Day 4: partway through, the API turns out to need a schema change
 4. [ 2240ms] API endpoints slips two days, to end on day 8
 5. [ 3150ms] Day 7: Wire UI to API was supposed to start today, but the API isn't ready yet
 6. [ 4060ms] Wire UI to API can no longer start on day 7 — it depends on the API
 7. [ 4620ms] Wire UI to API slips to days 8–10
 8. [ 5530ms] waited for the API
 9. [ 6230ms] Day 9: Regression run was due to start today
10. [ 7140ms] Regression run is blocked — the wiring still isn't finished
11. [ 7700ms] Regression run slips to days 10–11
12. [ 8610ms] Day 10: the sprint demo was supposed to happen today
13. [ 9520ms] Sprint demo is marked late
14. [10080ms] Sprint demo slips to day 11
15. [10990ms] Day 11: wiring and the regression run finish, and the sprint demo finally happens — one day late
16. [11900ms] end
```

16 steps, all 16 captioned, no blank step, `check` green, `layout` green — this is the
final scene. Both success criteria (`check` exit 0 / no ✗ or ⚠, `layout` no issue) hold,
and `explain` reads the brief's day-by-day story in order (spec done → API needs a
schema change → wire can't start, waited for the API → regression run blocked → demo
late → everyone finishes a day late).

## Rendered frames — what I looked at, what I saw

Rendered SVGs with `vlmkit-anim render scene.json --step N --out step-N.svg` for
N = 4, 7, 8, 9, 11, 15 (saved alongside this log) and read the raw SVG (no PNG rasteriser
available/needed — the geometry is legible straight from the markup: `<rect>` positions
and widths per bar, `stroke`/`fill` colours, `opacity`).

- **step-4.svg** (t=2240, "API endpoints slips two days, to end on day 8"): checked
  `bar-api`'s width in the SVG — matches the new 2→8 range, not the original 2→6.
- **step-7.svg** (t=4620, "Wire UI to API slips to days 8–10", cursor still at `t = 7`):
  - `bar-api`'s outline (`stroke`) is red (`#ef4444`) even though I never called `status`
    on `api` — only `slip`. The tool appears to draw a red **outline** on any bar whose
    dates were slipped from their original declaration, independent of `status`
    colouring the **fill**. Not documented in `docs/anim-ir.md`'s gantt section in those
    words, but it is a legible, useful signal I did not have to ask for.
  - `bar-wire`'s outline is also red (from the explicit `status: late`), and its fill is
    width 0 (cursor at day 7 is still before wire's new start of day 8 — correctly not
    yet begun).
  - `fill-api` is amber, at ~83% of the bar's width — cursor (day 7) is 5/6 of the way
    from api's start (2) to its new end (8): (7-2)/(8-2) = 0.833. Matches.
  - `fill-ui` is fully green — `ui` ends at day 7 exactly, cursor is at day 7, so it
    reads as just-finished. Correct.
  - `callout-main-*` nodes are present in the markup but `opacity="0"` — correct, the
    callout op hasn't fired yet at this step.
- **step-8.svg** (t=5530, "waited for the API"): the three `callout-main-0-*` nodes
  (box, text, arrow) carry no `opacity` attribute at all here (i.e. visible), text reads
  "waited for the API", and the arrow's `<line>` runs from the callout box up to
  `(525.1, 201)`, `wire`'s row — anchored where I asked (`"at": "wire"`).
- **step-15.svg** (t=10990, final beat, "Day 11: … one day late", cursor at `t = 10`
  — the *label's* value; the frame time itself is past that, the axis label is discrete):
  - `bar-wire` and `bar-demo` both fully red (fill and stroke) — `late` status held to
    the end.
  - `bar-test` fill/stroke is grey (`#9ca3af`) — a different colour from red/amber, so
    `blocked` gets its own colour distinct from `late`/`in-progress`/`done`. I had not
    predicted that from the docs (the gantt section names the three `state` values but
    not their colours) but it reads correctly and distinctly once seen.
  - `dep-3`, `dep-4`, `dep-5` (the arrows into `wire`, into `test`, into `demo`) are all
    `opacity="0.3"` — the "arrows touching a slipped task fade" behaviour the guide
    documents, confirmed in the markup for exactly the arrows whose target task slipped.
  - `callout-main-0-*` are back to `opacity="0"` — the `ms:0`-folded null from Round 5
    took effect and held through the rest of the run, as intended.

I did not use `sheet` or `video`/PNG rasterisation — reading the SVG's own numbers
against arithmetic I could check by hand (bar widths as fractions of a task's date
range, cursor x vs. task start/end) was enough to confirm the story, and it is more
exact than eyeballing a raster image.

## Hand-typed coordinates / colours / canvas sizes

**Zero.** I never wrote a `canvas`, a hex colour, or a pixel/x-y coordinate anywhere in
`scene.json`. Every number in the file is a day on the sprint's own axis (`start`,
`end`, `advance` targets) — the same kind of "domain value, not a coordinate" the guide
draws for `sort`'s `values` or `chart`'s `categories`. `unit` is the string `"day"`.
`canvas`, `tick`, `from`, `to` and `theme` were all left to their defaults.

## Byte size

`scene.json` is **2282 bytes** (`wc -c`), pretty-printed with 2-space indentation (not
minified — `check`'s own report separately notes the minified size as 1951 B).

## Friction

**What helped.** The gantt section of `docs/anim-ir.md` plus `schema --kind gantt` gave
me the whole vocabulary in one read — `after`, `lane`, `milestone`, `advance` /
`slip` / `status`, and the anchor list (`task id`, `lane name`, `"pre->task"`,
`"cursor"`) for annotations. I did not need to guess a single field name; the one
`ops[6].callout.side` warning even told me the exact JSON path to fix. The check
messages were the best part of the whole loop: each one named the offending nodes by
id (`nodes(cursor-label)` × `callout-main-0-arrow`), the step and time it happened at,
and a `→` line with concrete next moves ("try another side, a shorter label, or anchor
it at a different thing"). I never had to open an SVG to find *what* was wrong — only
to confirm the fix looked right once `check` said it was fixed.

**What was actionable and what wasn't.** The Round 1/4 warnings (crossed text) were
fully actionable — they named both colliding nodes and the exact steps. The Round 3
`ops[6].callout.side` warning was the single most useful line in the whole session:
it told me in one sentence that my guess (`side: left`) was overridden and to what, and
offered the two real options (accept the landed side, or free up room on the side I
wanted). What was *not* actionable, or at least took two rounds to work out from the
hint alone: "try … anchor it at a different thing (the node instead of the edge)" — my
anchor already *was* the node (`wire`, a task id, not an edge), so that suggestion
didn't apply to my case and I had to reason from scratch that the actual conflict was
temporal (a permanent annotation vs. a moving cursor label), not spatial (box vs. box).
The fix I landed on — dismissing the callout with `{"callout": null, "ms": 0}` folded
into a later `advance` — isn't a documented pattern; I inferred it by combining two
separate facts (`ms: 0` folds into the previous beat; `callout: null` hides it) that the
annotations doc states as two different features, not as a recipe for "make an
annotation go away exactly when the story doesn't need it anymore." A one-line example
of this combination in the guide's annotation section would have saved a round.

**What I wanted and could not express.**

1. **A task that should move when its prerequisite slips.** This is the biggest gap.
   The guide is explicit that `slip` does *not* cascade — "dependents do not move,
   slip them too" — but there is no shorthand for "push everything downstream of this
   task by the same amount," and no way to say "this task starts as soon as its last
   prerequisite ends" (the way `distributed`'s `timing: "causal"` computes send times
   from `after` automatically). I had to manually work out, by hand, what `test`'s and
   `demo`'s new dates needed to be so the final schedule wouldn't trip the "starts
   before its dependency ends" check, and manually write three separate `slip` ops for
   three tasks that all slipped for the same underlying reason (the API's day-4
   schema change). In a longer sprint plan with a deeper dependency chain this would be
   O(n) hand-written slips for one root cause, and easy to get subtly wrong (I did get
   it wrong on the first pass in my own head before checking the arithmetic — `wire`
   ending day 10 means `test` can't start until day 10, not day 9, and I had to
   re-derive that by reading the numbers rather than the tool telling me).
2. **Who is assigned.** The brief's own suggestion. There's no field on a task for an
   owner/assignee, and no annotation op reads as "a name attached to a bar" better than
   misusing `value` (which is a panel readout, not a per-bar label) or `text` (a
   multi-line block). A `label` you can already set (`"label": "API endpoints"`) — a
   second short label under or beside the bar (`"who": "Priya"`) would have been the
   natural fit, but nothing like it exists.
3. **A second axis.** The chart is one time axis with lanes as a grouping, not a second
   quantitative axis (e.g. "% complete" or "story points burned" alongside the calendar).
   `chart` has this (`yMax`/`yLabel`/thresholds) but `gantt` doesn't, and there's no way
   to compose the two kinds so that a burn-down line rides along the same time axis as
   the bars (`compose` puts scenes *side by side*, not on a shared axis). I didn't attempt
   a workaround for this since the brief didn't require it, but it's the natural
   follow-up if someone did want it.
4. Smaller: the cursor label only ever prints the literal `unit` value ("t = 9"); there
   is no way to give it a per-tick custom caption (e.g. a real calendar date, or "Mon"),
   so a sprint with a non-uniform calendar (weekends, holidays) would have to fake it by
   choosing `unit` values that skip them, which the brief didn't ask for but I noticed
   while reading the axis-tick rendering in the SVGs.
