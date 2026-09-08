# Log — imports-capture-map (writer: ld)

## How I read the imports

By hand + grep, no `vlmkit-anim facts` (forbidden by the task). Steps:

1. `find packages/vlmkit-capture/src -maxdepth 1 | sort` — the 27 top-level
   entries (26 files + the `gates/` directory).
2. One grep across the whole subtree for relative imports:
   `grep -rnE "from ['"]\.\.?/" packages/vlmkit-capture/src --include="*.ts"`
   — this single command surfaced every `from "./x.ts"` / `from "../x.ts"`
   line in one pass, including the one file inside `gates/` (`crater.gate.ts`,
   which imports `../crater-smoke.ts` — a real cross-module edge from the
   `gates` directory-module to `crater-smoke`).
3. Read the one comment block at the top of each non-test file
   (`head -6 ... | grep '^\s*\*'`) to decide which side (Playwright / Crater /
   shared / public) each module belonged to, for grouping.

Total reading time: under 2 minutes (two commands, one skim of doc comments).
Getting the picture to green — almost entirely fighting one canvas-width
warning, not the facts — took roughly 20 minutes across 5 edit→check rounds.
The facts comparison itself was fast; the picture's legibility was the slow part.

## Round 1 (first attempt)

Drew all 27 top-level entries as modules, including the 12 `*.test.ts`
files, since the brief says literally "one module per top-level entry...a
file is one module, named without its extension" and a test file is a file.
Wired every relative import I found, including test→impl edges
(e.g. `route-capture.test -> route-capture`).

```
$ vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json
⚠ canvas: the canvas is 3986×428: on a 1280px-wide screen it shrinks to 32% and labels stop being legible
    → use "layout": "tb" or "circle", shorten labels, or split the scene
✗ modules(batch-prescan.test): module "batch-prescan.test" is drawn but the facts do not have it
    → remove it, or rename it to the id the facts use ("batch-prescan", "capture-config", "capturer",
      "cloudflare-quick-actions", "crater-client", "crater-smoke", "crater-wasm", "detection-types",
      "gates", "index", "playwright-analyzer", "playwright-launch-error", "prescanner",
      "route-capture", "viewport-discovery")
✗ modules(capture-config.test): ... (same shape)
✗ modules(capturer.test): ...
✗ modules(cloudflare-quick-actions.test): ...
✗ modules(crater-client.test): ...
✗ modules(crater-smoke-prose.test): ...
✗ modules(crater-smoke.test): ...
✗ modules(crater-wasm.test): ...
✗ modules(playwright-launch-error.test): ...
✗ modules(prescanner.test): ...
✗ modules(route-capture.test): ...
✗ modules(viewport-discovery.test): ...
✗ expect.deps: 14 dependencies name a module id the picture and the facts spell differently — not compared until the ids agree
    → fix the module ids above and run check again
✗ scene.json (modules): 13 error(s), 1 warning(s)
  facts imports-capture-map.expect.json: 15 module(s) · 16 dependencies — see above
```

**First-attempt count: 13 ✗, 1 ⚠.**

**What the sheet caught, and what I changed:**

- 12 of the 13 `✗` lines were "module X is drawn but the facts do not have
  it," one per `.test.ts` file, each with a hint listing the exact 15 valid
  ids — every one of them a non-test file. This told me the fact-generating
  tool's "import graph at depth 1" does **not** treat `*.test.ts` as its own
  module the way the brief's literal wording ("a file is one module") had led
  me to draw it. I removed all 12 test-file modules and the 14 dependency
  edges that touched them (test→impl and test→shared-type imports like
  `prescanner.test -> detection-types`), leaving the 15 source modules and 16
  real cross-module deps (`route-capture -> capture-config`,
  `crater-smoke -> crater-client`, `index -> {capture-config, viewport-
  discovery, playwright-launch-error, cloudflare-quick-actions, playwright-
  analyzer, prescanner, crater-client, crater-wasm, crater-smoke,
  detection-types, batch-prescan}`, `gates -> crater-smoke`,
  `prescanner -> detection-types`, `batch-prescan -> crater-client`).
- The 13th `✗` (`expect.deps: 14 dependencies name a module id...`) was a
  direct consequence of the same mistake — fixed by the same edit, no
  separate action needed.
- This was the one line in the whole log that was genuinely "an import I
  invented": not a wrong edge, but 12 module *nodes* the facts do not
  recognize, because the tool's notion of "top-level entry" turned out to
  mean "top-level source file," not "top-level file including tests."

I did **not** peek at `facts/imports-capture-map.expect.json` itself before
this run, per the task; everything above comes from the `check --expect`
output.

## Round 2

Removed the 12 test modules and their 14 edges; regrouped (`public`:
`index`; `playwright`: `capturer`, `playwright-analyzer`, `playwright-launch-
error`, `route-capture`, `viewport-discovery`, `cloudflare-quick-actions`,
`capture-config`; `crater`: `crater-client`, `crater-smoke`, `crater-wasm`,
`batch-prescan`, `prescanner`, `gates`; `shared`: `detection-types`).

```
$ vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json
⚠ canvas: the canvas is 2928×428: on a 1280px-wide screen it shrinks to 44% and labels stop being legible
    → use "layout": "tb" or "circle", shorten labels, or split the scene
✓ scene.json (modules): 0 error(s), 1 warning(s)
  facts imports-capture-map.expect.json: 15 module(s) · 16 dependencies — all as drawn

$ vlmkit-anim layout scene.json
0 of 2 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

All facts now match (0 ✗). Only the canvas-width ⚠ is left; `layout` is
already clean (no overlaps/crossings — the automatic layer/band placement
was fine from the start, it's just wide).

## Round 3

Tried `"layout": "lr"` (rows→columns) on the theory that swapping which axis
is long would dodge the 1280px-wide-screen warning.

```
$ vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json
⚠ canvas: the canvas is 737×2928: on a 1280px-wide screen it shrinks to 44% and labels stop being legible
    → use "layout": "tb" or "circle", shorten labels, or split the scene
✓ scene.json (modules): 0 error(s), 1 warning(s)
```

No improvement: width and height literally swapped (737×2928 vs 2928×428)
but the warning's percentage is unchanged (44%), which means the check
compares the **longer** of the two dimensions against 1280, not specifically
"width." Reverted to `"layout": "tb"` — `tb` is also what the warning's own
"→" hint suggests first, and it reads more naturally for an import graph
(dependencies point down) than a wide `lr` ribbon would.

## Round 4

Shortened the four longest labels via the `{"id", "label"}` form (ids
unchanged, so nothing in `deps`/`groups` needed touching):
`cloudflare-quick-actions` → "cloudflare-actions", `playwright-analyzer` →
"pw-analyzer", `playwright-launch-error` → "pw-launch-error",
`viewport-discovery` → "viewport-disc".

```
$ vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json
⚠ canvas: the canvas is 2384×428: on a 1280px-wide screen it shrinks to 54% and labels stop being legible
    → use "layout": "tb" or "circle", shorten labels, or split the scene
✓ scene.json (modules): 0 error(s), 1 warning(s)
```

Better (2928→2384) but still over 1280.

## Round 5

Before shortening further, I tried reordering the `modules` array so that
each group's members were listed contiguously (`index`, then all 7
`playwright` members, then all 6 `crater` members, then `detection-types`),
on the theory documented for `state-machine` ("ties follow the order of
`states`, so moving a state earlier or later in the list moves it in the
picture") — hoping the same tie-break applied to `modules` and would pull
each group's band tighter.

```
$ vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json
⚠ canvas: the canvas is 2384×428: on a 1280px-wide screen it shrinks to 54% and labels stop being legible
    → use "layout": "tb" or "circle", shorten labels, or split the scene
✓ scene.json (modules): 0 error(s), 1 warning(s)
```

Byte-identical warning — reordering `modules` had **no** effect on the
layout for this kind. (Noted under Friction: the guide documents this
list-order tie-break for `state-machine`'s `states`, not for `modules`, and
I had assumed it generalized. It doesn't, or at least not visibly here.)
Reverted the reordering's intent didn't matter — kept the clustered order
since it's harmless and arguably more readable in the JSON — and moved on to
shortening every remaining long label instead.

## Round 6 (green)

Shortened every module's display `label` to a short abbreviation (ids
untouched): `playwright-launch-error`→"pw-launch-err",
`route-capture`→"route-cap", `viewport-discovery`→"viewport",
`cloudflare-quick-actions`→"cf-actions", `capture-config`→"cap-config",
`crater-client`→"cr-client", `crater-smoke`→"cr-smoke",
`crater-wasm`→"cr-wasm", `batch-prescan`→"batch-pre";
`prescanner`, `gates`, `index`, `capturer` kept as-is (already short);
`detection-types`→"det-types".

```
$ vlmkit-anim check scene.json --expect facts/imports-capture-map.expect.json
✓ scene.json (modules): 0 error(s), 0 warning(s)
  560ms · 2 steps (1 captioned) · 41 nodes · 0 tracks / 0 keyframes
  scene 1656 B (minified) → timeline 7365 B (×4.4)
  facts imports-capture-map.expect.json: 15 module(s) · 16 dependencies — all as drawn
  next: vlmkit-anim explain scene.json · vlmkit-anim render scene.json --step N · vlmkit-anim html scene.json --out page.html

$ vlmkit-anim layout scene.json
0 of 2 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

**0 ✗, 0 ⚠. Both success criteria met.** `figure.svg` rendered with
`vlmkit-anim still scene.json --out figure.svg`.

Rounds to green: **5 edit→check cycles** after the first (failing) attempt
— removing tests (R2), the `lr` experiment (R3, reverted), partial label
shortening (R4), the reordering experiment (R5, no-op), full label
shortening (R6, success) — within the 5-round budget.

## Hand-typed values

- **Coordinates**: 0. Never used `pos`, never touched the Timeline layer.
- **Colours**: 0. No `tone`, no `theme` override — the default palette and
  the automatic `bad`/`accent`/`muted` roles were never invoked because this
  scene has no forbidden edges or highlights to mark.
- **Canvas size**: 0. Never wrote a `"canvas": {...}` override, even though
  the guide explicitly permits it ("the canvas is sized for the map; set
  canvas to override") and it would have been the fast way out of the R2–R5
  warning. I deliberately avoided it because the guide's own escalation path
  for this warning lists label-shortening before canvas-size, and shortening
  worked — it just took four rounds of trial and error to find *how much*
  shortening was enough, because the warning gives a percentage, not a
  target pixel count or a per-label budget.

`scene.json` final size: **2188 bytes** on disk (pretty-printed); the tool's
own `check` output reports **1656 B (minified)**.

## Friction

**What helped.** `docs/anim-ir.md`'s `modules` section was enough on its
own to write a syntactically correct scene on the first try — the
`["a","b"]` shorthand for "a depends on b", the `{"id","label",...}` long
form, and the `groups` field all worked exactly as documented. `check
--expect`'s error messages were excellent for the one class of mistake I
actually made: each `✗ modules(x)` line came with the exact list of valid
ids, so fixing the test-file mistake was mechanical, not guesswork — I never
had to open the facts file to know what to rename things to.

**What was missing or misleading.**

- The brief's own wording — "one module per top-level entry... a file is
  one module" — reads as literally including `*.test.ts` files, since they
  are files at that depth. The guide doesn't say the `facts`-generating
  import-graph tool excludes tests; I only learned this from the `check`
  error output, not from anything I was allowed to read beforehand. This
  is a real ambiguity between the brief's literal instruction and the fact
  sheet's actual convention, and it cost the entire first round. A single
  sentence in the brief ("test files don't count as top-level entries")
  would have saved it — though I recognize discovering it via `check` is
  arguably the intended lesson.
- The canvas-width warning message is confusing about *which* dimension it
  measures. It always prints `width×height` and says "on a 1280px-**wide**
  screen," but the percentage is computed from **whichever dimension is
  larger**, not literally the width — I proved this by swapping to `lr`
  layout and watching width and height trade places while the percentage
  stayed exactly the same (44% both times, on 2928×428 and 737×2928). The
  hint text ("use `layout: tb` or `circle`... or split the scene") is also
  partly moot for `modules`, which per the schema only accepts `tb` or `lr`
  — `circle` isn't a real option here, so half the suggested remedy doesn't
  apply to this kind. I'd have gotten to green one round sooner if the
  warning had said "the longer side is 2928px, over the 1280px budget" and
  named the actual constraining layer/row, instead of a fixed width×height
  pair with a percentage that turns out to be orientation-independent.
- The `state-machine` docs explicitly promise that `states` list order
  breaks layout ties ("moving the target state earlier or later in the list
  moves it in the picture" — cited by id, `v15`). I reasonably expected the
  analogous `modules` array to behave the same way for its own layer
  tie-breaking, and spent a whole round (R5) reordering `modules` to cluster
  each group's members together, expecting the group bands to tighten. It
  had **zero** visible effect — byte-identical warning before and after.
  Either `modules` doesn't use array order as a tie-break at all, or
  something else (the `deps` list order, or straight-edge minimization)
  dominates it so completely that reordering `modules` never mattered here.
  The guide doesn't say either way for this kind, and I had no way to tell
  which without reading the implementation (forbidden). This is the single
  biggest piece of friction: a documented lever for one kind that silently
  doesn't transfer to a sibling kind that looks like it should share the
  mechanism.
- I wanted to express "these 15 modules are the whole `src/` directory; the
  12 test files exist but are deliberately not shown" — some annotation like
  a `text` block or a `note` in the panel saying so, so a reader of the
  figure alone (without this log) would know the test layer was omitted on
  purpose rather than missed. `modules` has no `sequence`-free way to attach
  a panel-level `text` annotation without also writing a one-beat
  `sequence` (the guide's "Still figures" section does mention "a still may
  still carry a one-beat `sequence` for emphasis" — I could have added a
  single `{"text": {...}}` beat to do this) — I chose not to, to keep the
  deliverable a pure "still figure" with no sequence per the brief's own
  framing, but the impulse to annotate the omission was real and the
  `title` field was the only place I had left to hint at it (I did not use
  it for this, in the end, since the title's job is naming the map, not
  caveating it).
- Minor: shrinking a label to fit the canvas budget is a purely visual fix
  that has nothing to do with the module's real identity (`playwright-
  launch-error` → "pw-launch-err" reads worse to a human than the full name
  does) — a size budget that's satisfied by "make the words shorter" always
  trades legibility of the *label* for legibility of the *layout*, and nine
  of my fifteen labels ended up abbreviated for a reason that has nothing to
  do with what they mean. A per-label max-width knob independent of a global
  canvas resize (e.g., "wrap this label onto two lines" or "shrink this
  node's font 1px") would have let me keep full names on the ones that
  mattered (`index`, `gates`, `prescanner`, `capturer`) and only compress the
  ones purely for space, which is roughly what I did by hand but by trial
  and error against an opaque percentage rather than against a stated pixel
  budget.
