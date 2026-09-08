# log — compiler-pipeline-still (writer: ka)

Docs consulted: `docs/anim-ir.md` only, plus `pnpm exec vlmkit-anim --help`,
`schema --kind modules`, `schema --kind annotations`. No implementation code,
no other attempts, no reports.

## Round 1

`scene.json` (`kind: modules`, `layout: tb` default): 7 modules, 8 real deps +
1 `forbidden` dep, 4 groups, one dep (`typeck->symbols`) with `"tone":
"accent"`, and a 3-item `sequence` of `callout` ops (distinct ids so they
coexist) — no `show`/`hide`/`highlight`, so it stays a still figure per the
guide ("A still may still carry a one-beat sequence for emphasis").

```
$ pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/ka/scene.json \
    --expect fixtures/anim-scenario/briefs/facts/compiler-pipeline-still.expect.json
✓ scene.json (modules): 0 error(s), 0 warning(s)
  2660ms · 5 steps (4 captioned) · 36 nodes · 9 tracks / 18 keyframes · annotations: 3 drawn, 3 on screen at the end
  scene 1017 B → timeline 7214 B (×7.1)
  facts compiler-pipeline-still.expect.json: 7 module(s) · 8 dependencies · 1 forbidden · 1 highlighted · 4 group(s) — all as drawn
  next: vlmkit-anim explain fixtures/anim-scenario/attempts/ka/scene.json · vlmkit-anim render fixtures/anim-scenario/attempts/ka/scene.json --step N · vlmkit-anim html fixtures/anim-scenario/attempts/ka/scene.json --out page.html
```

```
$ pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/ka/scene.json
0 of 5 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

Both green on the first try: 0 ✗, 0 ⚠ from `check`, 0 ✗/⚠-equivalent (0
overlaps/clipped/crossed) from `layout`. `figure.svg` was rendered
(`vlmkit-anim still … --out figure.svg`) and all three callout texts are
present and legible in it.

**Nothing changed after round 1** — the success bar in the brief (`check
--expect` clean, `layout` clean, three notes visible) was met on the first
write. I still did the side-by-side geometry check the brief asks for (below),
found a real mismatch on note 3, and spent one extra *exploratory* pass (not
counted as a scene-editing round, scene.json never changed) trying to fix it
before concluding it can't be fixed from the scene format as given — see
"Friction" below.

### Per-note table

Read directly off `figure.svg`'s `transform="translate(x y)"` and box
half-extents (SVG y grows downward, so "landed above" means the callout
box's bottom edge has a smaller y than the module's top edge, and "landed
below" the reverse; "left"/"right" compare x edges the same way).

| # | note | asked side | landed side | pointer through another box? | canvas grew? |
|---|------|-----------|-------------|-------------------------------|---------------|
| 1 | "source text enters here" | left of `lexer` | **left** ✓ (callout box right edge x≈200.8 < lexer left edge x≈226.8) | no — straight ~23px stub between the two, nothing else at that y | yes, see below |
| 2 | "machine code leaves here" | right of `codegen` | **right** ✓ (callout box left edge x≈581.6 > codegen right edge x≈555.6) | no — straight ~23px stub, nothing else at that y | yes, see below |
| 3 | "every phase may report here; none may read it" | above `diagnostics` | **below** ✗ (callout box top edge y≈539.2 is *greater* than diagnostics' bottom edge y≈513.2 — i.e. physically lower on the page, not higher) | no — the pointer is a short vertical stub straight up into diagnostics' bottom edge, nothing else shares that column at that height | yes, see below |

Canvas size, `sequence` present vs removed (compiled via `vlmkit-anim
compile`, both otherwise identical):

| | width | height |
|---|---|---|
| without `sequence` | 844 | 612 |
| with `sequence` (3 callouts) | 937 | 644 |

So yes — the figure is both wider (+93px, the room for the left/right
callouts) and taller (+32px, room for the bottom callout) than the bare
module map needs.

## Friction

**What helped.** The `modules` schema block and the annotations table in
`docs/anim-ir.md` were enough to write the whole scene correctly on the first
try with zero hand-typed coordinates: ids as anchors (`"at": "lexer"`), the
short-form `["a","b"]` dep array plus one long-form entry for the tone and one
for `forbidden`, and groups as a flat list of `{id, label, modules}`. The
"never coordinates" framing is accurate — I did not need `canvas`, a colour
literal, or an `[x,y]` anywhere, and the tool still produced a page-worthy
figure. `check --expect` matching the fact sheet field-for-field (modules /
deps / forbidden / highlighted / groups) meant I could confirm the graph was
right without opening the SVG at all.

**What was missing or misleading.** The guide's own words ("side is honored…
the compiler moves it only when the asked spot would cover another text or
run through a line; then it tries the other sides") turned out to promise
more than the tool delivers for this exact case, and there is no visible
signal when it doesn't happen:

- I asked for the callout **above** `diagnostics`. `diagnostics` sits at the
  bottom of a column that has `typeck`, `lower`, and `codegen` stacked
  directly above it in the same x-slot (that's what "typeck → symbols" and
  the shared "diagnostics"/"symbols" dependents force the automatic `tb`
  layout to do). There is *no* clear vertical lane above `diagnostics` for a
  callout to sit in without crossing those three module boxes, so the
  compiler silently placed it **below** instead. Both `check` and `layout`
  reported zero problems — neither one checks "did the requested `side`
  survive," only structural facts (`check`) and collision-freedom
  (`layout`). The doc line "layout names what [was in the way]" is not quite
  true here: nothing in `layout`'s output names the substitution at all; I
  only found it by reading pixel coordinates out of the SVG myself, which is
  exactly the manual work the annotation ops are supposed to spare a writer.
- I tried to see if this was a choice I'd made (picking `layout: "tb"`)
  rather than a hard limit, by recompiling the identical scene with
  `layout: "lr"`. Same result: the callout still landed on the opposite side
  from the one I asked for (still below, not above), because the constraint
  is about what else occupies the same lane as `diagnostics`, not about
  which edge of the canvas is "up". There is nothing in the scene format
  that lets a writer break the tie a different way (no coordinate escape
  hatch for `modules`, by design) — so "above `diagnostics`" is, for this
  particular dependency shape, simply not an expressible request. I would
  have wanted either (a) a `⚠` from `check`/`layout` naming "asked side left,
  landed side right" the same way a misspelt anchor gets named, or (b) a
  scene-level option like "reserve a lane on this side even if it costs a
  layer" — something short of a raw coordinate, in keeping with the
  "anchors, not coordinates" philosophy, but strong enough to say "the note
  literally has to be on this side no matter what layout would prefer."
- Related smaller point: the brief's own success bar (`check --expect` clean
  + `layout` clean + notes visible) is fully satisfied by a scene that gets a
  requested side *wrong*. That's a real gap between "the file is
  structurally sound" and "the file says what I meant" — worth knowing before
  trusting a green `check`/`layout` run as proof the figure reads the way the
  brief intended.

**Hand-typed coordinates, colours, canvas sizes.** Zero. No `[x, y]`, no hex
colour, no `canvas` field appears anywhere in `scene.json` — every visual
decision came from an id, a `side` keyword, or a `tone`/`style` role name.

**scene.json size:** 1232 bytes.
