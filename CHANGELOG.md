# Changelog

All notable changes to this project will be documented in this file.
Dates are YYYY-MM-DD.

## 0.19.0 — 2026-09-09

**`vlmkit-anim`: `sequence` diagrams, and containers inside containers.**

- **`kind: sequence`**: participants across the top (`actor` pills, `system` boxes), messages in order
  down the page — `call` (solid, filled head; activates the receiver until it returns), `return`
  (dashed, open head), `async` (solid, open head), a hook to oneself — with activation bars, `loop`
  and `alt` frames (each `alt` branch starts from the activations at the frame), and any annotation
  op. Nothing is timed: order is the meaning; each message is one beat. The check warns about a
  return nothing activated, a participant still activated at the end, one never messaged, an `alt`
  with one branch. `check --expect` reads `nodes` and `messages` in order.
- **Nested groups** on `modules` and `diagram`: `"parent"` on a group draws it inside another — the
  outer box wraps the inner ones with room for their labels, the layout keeps an inner group's
  members together, and a module belongs to the innermost. The validator names a missing parent,
  a self-parent and a circle.
- Report: `docs/reports/2026-09-09-anim-ir-v20.md`.

## 0.18.0 — 2026-09-08

**`vlmkit-anim`: two kinds for the shapes people actually draw — `flowchart` and `gantt`.**

- **`kind: flowchart`**: `process` boxes, `decision` diamonds with labelled ways out (`yes` / `no`, or
  the condition), `terminal` pills and `io` slanted boxes; `edges` between them; a `walk` — the nodes
  visited in order, every hop an edge — that a token follows, captioned `2xx?: no → tries < 3?` out
  of a decision. Nodes are layered by distance from `start`; a loop back to an earlier node runs
  round the outside of the chart. The check warns about a decision with one way out, an unlabelled
  way out, a node the walk never reaches and a walk that stops mid-flow. `check --expect` reads a
  flowchart sheet: `nodes`, `edges` (`"a->b:yes"`), `visited`, `end`.
- **`kind: gantt`**: tasks as bars on a unit axis (`start` / `end` in days, weeks, sprints), `lane`
  bands, `after` dependency arrows, `milestone` diamonds; `ops` move a time cursor (`advance` — bars
  fill as it passes and the step says who starts and who finishes), `slip` a task's dates, or set a
  `status` (`late` / `blocked` / `done`). The check warns when a task starts before something it
  depends on ends and when the cursor never reaches a task's end; it errors when time runs backwards.
- From the writers: `slip` takes `cascade: true` (dependents that would now start too early move with the
  task, and the step names them — one writer had hand-derived three slips for one cause); tasks take an
  `owner`; the cursor's label rides the cursor under the axis instead of the band annotations land in.
- Report: `docs/reports/2026-09-08-anim-ir-v19.md`.

## 0.17.0 — 2026-09-08

**`vlmkit-anim`: fact sheets for the walked kinds, and one written from the code.**

- **`check --expect` reads `graph`, `state-machine` and `distributed` scenes.** A graph sheet has
  `nodes`, `edges` (`"a->b"`, either way on an undirected graph, `"a<->b"` says so), `visited` (the
  order of visits), `path` (the nodes lit at the end) and `labels`; a state-machine sheet has
  `states`, `transitions` (`"a->b:event"`), `initial`, `final`, `visited` and `end`; a distributed
  sheet has `nodes`, `messages` in order (`"a->b:label"`), `lost` and each node's final `status`.
  Each fact is read from where its truth is — the scene, the compiled walk, the final frame — and
  a sheet field the kind does not have is one error, not silence.
- **`vlmkit-anim facts <dir> [--depth 1] [--tests] [--out f.json]`** writes a fact sheet from a
  directory's import graph: the entries at that depth are the modules, every relative import
  crossing between two of them a dependency. A module map drawn by hand from reading the code is
  then checked against the code, not against the writer's memory of it.
- **What the writers' scenes found in the compilers, fixed:** a state machine's token rests on the top of the
  state's rim (at the centre it covered a short label); a `circle` of states is a ring they fit on and the
  canvas grows with it (four states had been laid within 35px of each other); a straight transition's label
  that would sit on a state takes a free spot; a graph's distance labels pick the side of the node clear of
  edges (fixed below, one crossed an edge in 17 of 18 frames). Five scenes in the corpus lost their last
  layout issues.
- **`after` accepts `"from->to:label"`** (or `"from->to"`) for a message whose label is sent twice — every
  label of a two-participant protocol — and the ambiguous-label error names the choices.
- The `crossed` hint speaks each kind's vocabulary; the canvas-size warning names the side that is over, the
  pixel target and the layouts the kind has.
- Report: `docs/reports/2026-09-08-anim-ir-v18.md`.

## 0.16.0 — 2026-09-08

**`vlmkit-anim`: the asked side is where the annotation goes.**

- **The canvas grows on any side.** A `callout` or `value` asked `left` of the leftmost module, or
  `above` the top one, used to land wherever the canvas already had room — the canvas could only
  grow at the bottom, so "left" of the entry point became "above" or "right". Now the asked side is
  honoured when it is clear, and the canvas grows there to make the room; the Builder shifts every
  root node and position keyframe (and a matrix's slot table) by the growth. Growth on a side other
  than the asked one is still the last resort, after every side on the canvas as it stands.
- **A callout's pointer goes round labelled boxes** — and free-standing labels — in its way, on the
  shared edge router, and only when the detour crosses less than the straight line did (a bend that
  clears the cells but cuts a row letter stays straight). A callout on a bent edge points at the
  middle of the edge's line rather than at its first end, which is what routed the pointer round
  the very module the edge left.
- **`check` reports a stated `side` that was not honoured** — `the callout at "diagnostics" asked for
  \`above\` and landed \`below\`: a line runs through that spot` — with the hint to ask for the landed
  side or make room. Two of three writers had found the substitution only by measuring their SVG by
  hand; the third read it wrong. The default side is a preference and moves silently.
- `check`'s stats line says `scene N B (minified)`; the guide says an `ms: 0` annotation becomes
  visible at its beat's end, so a frame at the step's start does not show it yet.
- Report: `docs/reports/2026-09-08-anim-ir-v17.md`.

## 0.15.0 — 2026-09-08

**`vlmkit-anim`: a still figure's own vocabulary for colour and kinship.**

- **`tone` on modules, nodes, dependencies and edges** — `accent` (a module is filled, an arrow and its
  label take the highlight colour), `bad`, `muted` — a colour role for a still figure with no
  `sequence`. Two v13 writers had reached into the beat / `highlight` machinery to colour one edge on a
  motion-free picture. A thing with `"tone": "accent"` counts as lit for `check --expect`.
- **`"style": "implements"`** on a dependency or edge: dashed with a hollow head, the UML realisation,
  laid out like a real dependency — an adapter realises its port rather than calling it. The SVG
  renderer and the runtime draw the hollow marker.
- **`"style": "equals"`** on `relate`: a double line, no head — the two anchors are equivalent /
  substitutable / satisfy the same interface (a v13 writer: "nothing for 'satisfies the same
  interface as its sibling'").
- Fixture `modules-ports-adapters` shows all three in one still. Report:
  `docs/reports/2026-09-08-anim-ir-v16.md`.

## 0.14.0 — 2026-09-07

**`vlmkit-anim`: labels in any script, and edges that go round what is in their way.**

- **Text width by script.** Every width estimate counted characters at 0.6 em (0.55 in the layout
  geometry). Measured in headless Chromium at 14px with the renderer's font stack, a CJK glyph is
  exactly 1.00 em, fullwidth forms 1.00, Hangul 0.89, arrows and ✗ 0.84, emoji 1.00, capitals and
  digits 0.64–0.70. A Japanese label was placed at 60% of its width and `layout` called the picture
  clean while six of eight boxed labels in a module map overflowed by up to 22px. `text-width.ts`
  decides the width once, by Unicode class; `labelWidth`, the geometry's text box, `wrapText`,
  `wrapCaption` and the chart legend read it, and Japanese text wraps between glyphs where there
  are no spaces. `text-width.test.ts` pins the estimate to the browser measurements. Labels may be
  in any script; ids stay ASCII.
- **Transitions bend around states.** The diagram compiler's edge router (v13) is shared
  (`compile/route.ts`) and the state-machine compiler uses it: a transition that would run through
  a bystander state bends around it, its label picks a spot no state or earlier label holds, and
  the token follows the bend. A writer had fixed this by reordering `states` until it happened not
  to collide; the guide now says list order breaks ties in `lr` / `tb`, and the overlap hint says
  so too. The router prefers the shorter detour, and near a tie the side the destination lies on.
- **Geometry.** A stroke hidden under a filled shape drawn between it and a text (a heap's edge
  under the value on a slot) is no longer a crossing. A relation's label tries the near side and
  both ends of its line when the far side is off the canvas (a Japanese label beside the leftmost
  lane was 40px past the edge).
- Report: `docs/reports/2026-09-07-anim-ir-v15.md`.

## 0.13.0 — 2026-09-07

**`vlmkit-anim`: the layer for explaining a concept, not only a structure.** v9 changed the
evaluation question from "animate this structure" to "explain this idea" (vector clocks, HTTP/2
multiplexing, a paper submitted that week) and found 3 of 8 scenes falling back to hand-placed
`vector` shapes for two reasons: a value that should stay readable beside its owner, and two
pictures at once. Two generic layers answer that, and a third op followed from the next round.

- **Annotations every kind accepts** in its own op list, over the kind's own **anchors** (an index,
  a cell `"r,c"`, a node id, a state, a value) rather than coordinates: `value` (a named readout,
  in a panel or beside its anchor, updated in place by id), `callout`, `snapshot` (a frozen copy of
  what an anchor shows now), `group` (an outline around several), `text` (a block with one line
  highlighted) and `relate` (a labelled arrow or line between two anchors — where a group would
  enclose a bystander, `relate` names the pair; it runs beside the pair when the straight line
  would cross something else). A misspelt anchor is a compile-time diagnostic that lists the
  anchors that exist. `vlmkit-anim schema --kind annotations` is the sheet.
- **`kind: compose`**: several scenes in panes (row / column / grid), in sequence or in parallel,
  with each pane's checks reported under its own path.
- **Scenes generated from a repository**: `vlmkit-anim repo` draws the workspace's packages layer by
  layer; `vlmkit-anim pr --base origin/main` draws the change map of a branch, one beat per commit
  (areas touched, import edges, line counts), and writes a paste-ready markdown with the GIF and the
  contact sheet. The `pr-visual` workflow posts that on every same-repo pull request.
- Typed authoring (`scene.<kind>({…})`, scene modules in `.ts` / `.mjs` accepted by every verb),
  committed sample outputs for every fixture, and `docs/diagrams/` with the tool's own architecture.
- **Layout read back from the frames.** `vlmkit-anim layout` lists, at every step, texts on other
  texts, texts under a filled box that is not their own, and texts past the canvas edge; `check`
  warns about the same. `vlmkit-anim review` writes the contact sheet with a review brief for a
  vision model or an agent and scores its JSON against that geometry frame by frame (`--answers`,
  or `--model` through the optional `@mizchi/vlmkit-ai` peer). Annotations now place themselves off
  other text — the asked side first, then the other sides, one box further out, the panel, or a
  taller canvas — and relations arc over a bystander only when no level line fits nearby.
- **Still figures.** `kind: modules` — a module map (modules, `deps` read "a depends on b", `groups`
  as containers) laid out in dependency layers with one band per container, cycle-checked, a still
  unless it has a `sequence`; `diagram` takes `groups` too. `vlmkit-anim still` renders any scene's
  frame without the caption band, cropped to what is drawn, as SVG or PNG; `repo` and `pr` write
  the figure next to the GIF.
- **v13, the first writer round on still figures, and what it changed.** Five fresh writers drew
  module maps and a dependency graph from the guide alone; every one was green, and every figure
  had lines through labels the geometry could not see. `vlmkit-anim layout` now reports a fourth
  defect, **crossed** — a line through a text, or through a box that is not one of its ends — and
  `check` warns about it. The compiler then earns that check: module maps layer from their leaves
  (two modules with the same dependencies share a layer, whatever depends on them), order each
  layer to straighten edges, bend an edge around a module in its way, draw a group that owns its
  layers as a full-width row instead of a band, keep container labels out of edges, place callouts
  and relation labels off strokes as well as off text (an unchecked fallback once put a callout on
  the module next to its edge), pick the arc side that clears everything, and halo edge, message
  and relation labels so a line under them breaks around the glyphs. Edges take `"style":
  "dashed"` (optional) and `"forbidden"` (dashed red, ignored by the layout — the import that must
  not exist); `highlight` takes an edge `"a->b"`; `relate` takes `"tone": "bad" | "muted"`. Across
  the five scenes: 91 crossings before, 2 after. Report: `docs/reports/2026-09-06-anim-ir-v13.md`.
- **The figure against its facts (`check --expect facts.json`).** v13 also had two pictures that
  were green and wrong — a map that drew the forbidden dependency as a real one and then deleted a
  true one to quiet the cycle warning, and a walk that highlighted the wrong edge — and neither
  `check` nor `layout` could know, because neither reads what the figure is about. An expectation
  file (`vlmkit-anim/expect@1`: `modules`, `deps` `"a->b"`, `forbidden`, `highlighted`, `groups`) is
  the brief's fact sheet in a shape `check` reads: every fact must be drawn (in that direction, in
  that style, lit in the final frame, with exactly those members) and nothing drawn may be missing
  from it. Ids the picture spells differently are reported once each and the dependencies naming
  them wait in one line. `vlmkit-anim repo` writes the workspace's own sheet as `repo.expect.json`;
  `schema --kind expect` has the fields. Four fresh writers on the four briefs with their sheets:
  four green, four clean, and the sheet caught one wrong final highlight on the first run. Their
  friction: a callout wider than the canvas now wraps (it was laid across six edges and past the
  edge), a group label hemmed in by edges on every side takes the least-crossed spot with a halo,
  and the guide says "one action per step" where it did not. Report:
  `docs/reports/2026-09-06-anim-ir-v14.md`.

Measured, not asserted: the coordinate-fallback count went from 3 of 8 scenes (52 positions, 30
colours typed by hand) to 1 of 7 (one writer who never opened the annotation sheet). Reports:
`docs/reports/2026-09-05-anim-ir-v9.md`, `v10.md`, `v11.md`.

## 0.12.0 — 2026-09-05

A release about the other direction: not measuring a page someone else built, but producing
something — an explanatory animation — and measuring that. Two new packages, one of them carved out
of an existing one.

**`vlmkit-anim`, a standalone tool for explanatory animations** (`@mizchi/vlmkit-anim`). An agent
explaining a sorting run, a BST delete, a Dijkstra traversal or a message exchange writes a
`kind`-tagged Scene — `{"kind": "sort", "algorithm": "bubble", "values": [5, 3, 8, 1]}` — and the
compiler *runs the domain* to produce a Timeline of keyframe tracks and captioned steps, played by a
7 KB `<vlm-anim>` web component (SVG + Web Animations) or sampled headlessly to SVG frames. Fourteen
kinds: sort, array, stack, queue, list, tree, heap, state-machine, distributed, matrix, graph, chart,
diagram, vector. `check` validates, compiles and reads the semantics back from the frames (final bar
order by x, heap property by slot, list order plus arrow count); `explain` prints the narration;
`sheet` puts every step on one image for a vision model; `video` writes a GIF in-process or an MP4 /
WebM through ffmpeg; `html` emits the page. It is its own binary rather than a `vlmkit` subcommand
because writing an animation needs none of vlmkit's capture, diff or gate plumbing.

The format was designed by measurement rather than by taste: eight rounds of fresh subagents (35
agents, Sonnet and Haiku) given only a brief and the one-page guide, with their friction recorded
verbatim and every fix traced to a quote (`docs/reports/2026-09-04-anim-ir-v1.md` … `v8.md`). Two
rules came out of it and now hold for the package: every diagnostic hint must name a remedy the
format has (a v1 hint that did not led an agent to delete the branch its brief required), and every
warning must be about the scene (a warning the writer cannot act on is a compiler bug — v8 found one
that way). Guide: `docs/anim-ir.md`; design: `docs/design/anim-ir.md`.

**`@mizchi/vlmkit-animation-eval`, the evaluator split out of `vlmkit-markup`.** The frame-sampled
measurement behind `check animation` — pause every Web Animation, seek deterministic sample points,
screenshot, derive issues — is now a package that depends on core and Playwright only. The gate
imports it; `vlmkit-anim eval page.html` runs the same report on the pages the animation tool emits,
through an optional peer, so the tool and the gate share one evaluator and neither drags in the
other. Two helpers it needed moved into core with it: `stable-selector.ts` (the in-page selector
generator) and `plugin/rule-prose.ts` (the `issues[]` projection of rule tiers).

**A typed authoring surface that adds nothing to the format.** `scene.sort({ … })` and its thirteen
siblings fill in `format` and `kind` over the existing type declarations, so a misspelt algorithm is
an editor error before it is a `check` error; every `vlmkit-anim` verb accepts a `.ts` / `.mjs`
module whose default export is a scene. JSON stays the IR — `sceneJson` writes it back out.

**Sample outputs are committed.** `packages/vlmkit-anim/samples/` holds a GIF and a contact sheet
for every fixture with its narration, so a compiler change can be judged by eye in a review;
`pnpm anim:samples` regenerates them.

### Behaviour changes

None for `vlmkit` commands; `check animation` reports exactly what it did. Three deep imports moved,
which a consumer of the workspace packages can see:

- `@mizchi/vlmkit-markup/style/animation-eval.ts` → `@mizchi/vlmkit-animation-eval` (or its
  `/animation-eval.ts` deep path). `deriveAnimationIssues` is still re-exported from
  `@mizchi/vlmkit-markup/rules`.
- `@mizchi/vlmkit-markup/stable-selector.ts` → `@mizchi/vlmkit-core/stable-selector.ts`.
- `@mizchi/vlmkit-markup/rule-prose.ts` → `@mizchi/vlmkit-core/plugin/rule-prose.ts`.

`vlmkit-markup` now depends on `@mizchi/vlmkit-animation-eval`; `vlmkit-anim` declares it and
`playwright` as optional peers (writing needs neither; `eval`, `sheet` to PNG, `frames --png` and
`video` need a browser).

## 0.11.1 — 2026-08-18

A dogfood round on what 0.11 published, and two defects it shipped in the feature it led with.

The Pages site stopped being one page: `scripts/build-pages.mjs` owns a manifest, the Klondike
solitaire board is deployed at `/solitaire/`, and it exists to exercise what a pixel diff cannot see
— so it is now proved to be winnable, played to 52/52 through the real UI with the DOM audited after
every ply. Pointing the drag probes at it is what found the rest.

**`--probe-drag` called every delegated drag board inert.** It pressed the element holding the
`dragstart` handler and asked whether that element got picked up; under delegation — one handler on
the container, which is how a board that rebuilds its children has to be written — the answer is
always no. The row read `no dragstart … started no drag` directly above a route that opens with a
dragstart, and everything gated on that verdict (the drop, the remaining destinations, the
Escape-cancel gesture) was skipped without saying so. Fixed, and measured across six deals rather
than the one that prompted it.

**`dragover-not-prevented` reported a truncated search as an exhausted one**, which is how a
container that cancels for every legal move was called a container that never cancels.

And the first instructions for an agent that is not Claude Code: there was no `AGENTS.md`, so an
OpenAI-based agent guessed `VLMKIT_LLM_PROVIDER=openai`, got a list of three names that did not
include it, and stopped.

### Behaviour changes

Neither is a rule rename or a flag change, but both move a verdict, and a CI pinned to `--probe-drag`
can see it:

- **Two findings can now fire on a delegated board where they were structurally impossible.**
  `drag-source-detached-mid-drag` and the Escape-cancel finding are both gated on `dragstartFired`,
  which was never true for a delegated source — so a board that loses its `dragend` mid-drag, or
  fails to revert on Escape, went unreported. A run that passed may newly report.
- **`dragover-not-prevented` no longer reports when the pair search hit its cap.** A run that failed
  on a board may newly pass. The cap is also 96 rather than 40 now (8 sources × 12 targets, the
  product of the per-side caps), so within them the search is exhaustive.

### Solitaire dogfood, round two — three defects a person found by playing

In this section rather than in one of its own because 0.11.1 had not reached npm when it landed, so
whatever ships as 0.11.1 contains it. The interesting part of every one of these is why no gate had
said anything.

- **The probes were suppressing the defect they should have reported.** Every interaction probe
  clears the text selection before its gesture — it has to, because selected text is itself draggable
  and a leftover range changes the next measurement — and clearing was all any of them did. A round
  of play on solitaire turned into a range selection over the board, and the harness had been wiping
  that condition away once per gesture for as long as it existed. It reads it now, before clearing.

  Two rules came out of it. `drag-selects-text`: a press-and-drag over a surface left a range behind,
  named on the element the range anchors in, which is where the `user-select: none` belongs and is
  usually a hint line or a status readout rather than the surface itself. `dblclick-selects-text`: a
  new `--probe dblclick` family double-clicks each `dblclick` handler at a point its own handler does
  NOT apply to — the miss — and reports what got selected. That is the gesture that produced the
  reported defect: double-click sends a card to a foundation, the handler is on the board, and a
  double-click on the bare table selects a word out of the hint line under it.

  The drag half also drives one **stray press** per delegated surface: a press that starts on the
  surface's own prose rather than on an item. Without it the rule cannot see the gesture a player
  makes, because every other gesture presses a card and any real board sets `user-select: none` on
  the cards. Delegated surfaces only — running it on direct sources spent a gesture that changed two
  measurements with nothing to do with selection.

  Fixed on solitaire with `user-select: none` on the shell. `.card` already had it and it was never
  enough: none of the ranges started on a card. Verified in both directions — the rule fires before
  the fix and is silent after, and all five gestures found by hand now select 0 characters.

- **`drag-ghost-illegible`: what the drag does to the readability of the thing being dragged.** "The
  drag source goes translucent and combined with what is behind it you cannot tell which card it is."
  The element is now shot at rest and again mid-flight, and the WCAG ratio between its darkest 2% and
  lightest 10% of pixels is reported for both, with the computed `opacity` read rather than inferred.
  Solitaire measured 7.59:1 → 5.01:1 at `opacity: 0.55`, a 34% loss.

  Graded on the fall AND the floor, never either alone: a page that dims 15:1 to 9:1 loses the same
  proportion and is still perfectly readable, and an element with low contrast at rest is
  `check a11y contrast`'s business. Which means solitaire's own case — a 34% fall that lands at
  5.01:1 — is **printed and not graded**, because a human called it a defect by looking at it and a
  rule may not claim to have proved that. The report line carries the pair either way.

  The ink quantile is 2% rather than a decile because it was measured: a card face is >90% paper, so
  the darkest decile is mostly antialiasing and read 4.06:1 where the 2% quantile read 6.17:1 on the
  same card. Fixed on solitaire by marking the PLACE instead of dimming the card — the face stays
  opaque at 0.92 with a dashed outline, which measures 7.59:1 → 7.54:1.

- **An empty stock said it could be turned over only to a screen reader.** Its `aria-label` read
  "Stock empty — turn the waste over" while the pixels showed an outline identical to a pile with
  nothing left to do. No gate could have caught it: the accessible name was correct. `render()` now
  derives one `stockState` and writes both the label and a `[data-state]` the stylesheet draws a `↻`
  from, so the two cannot drift apart again.

  Recorded rather than solved: the general rule here would be "an element that is operable and shows
  nothing", and a static gate cannot see it, because the stock is only empty after two dozen clicks.
  Reaching that state is `verify flow`'s job, not a gate's.

- **The skills say which vlmkit they were written against, and what to do when it differs.** A
  workflow that names a verb the installed CLI does not have fails with "unknown option", which
  reads as the user's mistake rather than as version skew — `check story` and `--probe <families>`
  are both younger than two releases. The router's bootstrap section now records the version,
  tells the agent to read `vlmkit --version` before its first gate, and says what to do in each
  case.

  The recorded version is a **floor**, not an equality: older or absent installs that version,
  newer proceeds with what is there and says so in the result. Downgrading a project to match a
  skill is the larger harm, and the failure being prevented is one-directional — a newer CLI has
  every verb these workflows use. There is also a branch for "the registry does not have it yet",
  which is the state 0.11.1 is in right now.

  Written in the router only. Thirteen copies of a version number is thirteen chances to ship a
  stale one, and every workflow is reached through the router by contract;
  `tests/skill-package.test.mjs` pins the heading, the install line and the sample `--version`
  output to the package's own version, so a bump that fixes one of the three still fails.

- **A test with a hard-coded future date went off.** `manifest check` warns about anything expiring
  within 14 days, and `src/manifest-cli.test.ts` seeded a rule expiring `2026-09-01`, so on
  2026-08-18 the "nothing is expired" case started reading `expiring` and failing. Nothing had
  changed; the date arrived. The expiry is computed relative to the run now, which is what a test
  asking a question about the future needs, and the assertion prints the output it got.

- **A mid-gesture screenshot was racing the compositor, so the pixel probes under-reported.**
  `page.mouse.move` resolves when the input has been DISPATCHED, not when the result has been
  painted, and both drag probes screenshot straight after it. Idle machines win that race and hide
  it. Found by the diagnostics added below: the canvas assertion printed
  `feedback=0.250% committed=0.500% handlerCalls=11` — the page had received the whole gesture and
  the shot showed one stroke segment of nine, on a fixture that measured 2.181% on every quiet run.

  A wrong number, not only a flaky test: `feedbackRatio` and the `drag-ghost-illegible` pair are
  evidence a reader acts on, and a stale frame under-reports both — in the legibility rule's case
  toward a false negative, since the ghost has not been painted yet. Both probes await a painted
  frame (double `requestAnimationFrame`) before every mid-flight shot. Idle values are unchanged to
  three decimals; four consecutive full runs green.

- **The canvas pointer-drag assertion had a 1.4x margin and no diagnostics.** The probe drags across
  ~40% of the pad, and a 3px stroke changed 0.709% of the element's pixels against a 0.5% floor —
  which passed every run in isolation and failed twice in six full runs, where browsers run in
  parallel. The fixture strokes at 12px now (2.181%, a 4.4x margin) and the assertion prints the two
  ratios and the handler-call count when it trips, because the failures are **still unexplained**:
  six concurrent probes reproduced nothing, so the thicker line removes the thin margin without
  claiming to have found the cause. Three full runs green since.

- **The Pages site publishes more than one page.** `scripts/build-pages.mjs` owns a
  `siteSections` manifest — the intro page at `/`, the Klondike solitaire DnD/animation
  dogfood target at `/solitaire/` — replacing the intro-page-only builder. Assets stay an
  explicit allowlist per section rather than a directory walk, so a test file or a
  Playwright baseline is never published by default, and a missing file fails the build
  instead of deploying a page with a 404 stylesheet. `tests/pages-site.test.mjs` owns the
  layout, including that no published page links an asset host-absolutely and that the two
  pages link to each other.

- The intro page's dev server derives its routes from that same manifest, so `/solitaire/`
  opens locally. It previously 302'd every unlisted path back to `/`, which would have made
  the new nav link silently return you to the page you were already on — worse than a 404,
  because nothing reports it. Its test now boots the server and reads the content types
  instead of matching the source text for `["/app.js"`, which stopped meaning anything once
  the routes were derived.

- `deploy-pages.yml` runs solitaire's own 55 tests (31 rules cases with no browser, 24 in
  Chromium) plus `check integrity`, `check a11y focus` and `check a11y touch --level AAA`
  against it, ordered before the artifact build so a red gate blocks the deploy.

- **The solitaire example can now be proved to work, which no test did before.** Its win test
  says of itself "Rigged rather than played" — it assigns a finished `state` and clicks
  Auto-finish, so it covers the cascade and says nothing about whether the game can be finished.
  A solitaire that was unwinnable, or that lost a card on move 40, or whose DOM drifted from its
  state, passed all 55 tests.

  Three new files close it. `solve.mjs` searches for a winning line (DFS memoised on the position
  signature, against the same `rules.js` the page loads; seeds 1-6 solve in 145–24k nodes, under
  300ms each). `playthrough.mjs` replays that line through the real UI — `commit`, or actual
  `page.dragAndDrop` with `--gestures` — and runs the audit after every ply. `audit.mjs` holds the
  audit once, shared by the harness and by two new cases in `game.test.mjs`, which play seeds 1
  and 4 to 52/52 in CI. Seed 1: 144 plies, 8s through `commit`, 14s through real drags, ending
  with the banner visible, the win announced and 52 cards bouncing. The workflow wins a third seed
  by dragging before it builds the artifact.

  The audit reads the **DOM against the state** — 52 distinct cards exactly once, foundations
  ascending from the Ace in one suit, every face-up tableau pair a legal descending alternating
  run, no face-down card above a face-up one, one DOM node per card per pile, both counters
  agreeing. Validated by injecting four bugs and checking it names each: skipping `render()` on
  every 7th move → "ply 14 — tableau 4 holds 9 cards and renders 8"; dropping a card in one
  `applyMove` → "move 13 — the table holds 51 distinct cards, not 52"; letting
  `canStackOnTableau` ignore colour → "move 1 — tableau 0 stacks hearts-11 on hearts-12, which is
  not a descending alternating run"; never calling `celebrate()` → "the game is won and the win
  banner is still hidden".

- **The solitaire debug surface exposed `deal`, which starts a NEW GAME.** In solitaire "deal" is
  overwhelmingly the stock deal — the page's own select is labelled "Deal" for the draw count and
  the stock's aria-label says "deal 1" — so a harness calling `solitaire.deal()` to turn the stock
  over silently reset the table on every pass and reported eight seeds stuck at "0/52 in 0 moves".
  It is `solitaire.newGame` now. There is deliberately still no draw on the surface: clicking
  `#stock` is the only route and exercises the real handler.

- **Four defects that every gate passed, found by looking at screenshots.** Recorded because
  they mark where a deterministic gate stops: each was valid, labelled, reachable and
  contrast-clean markup that *meant* the wrong thing.
  - The four foundations advertised a suit each (`data-hint="♠"`,
    `aria-label="Foundation, spades"`) and the rules honour none of it — any Ace goes on any
    empty foundation, as in Windows. A progressed board showed `A♠ A♦ A♥ A♣` under hints
    reading `♠ ♥ ♦ ♣`. The slots are generic now and `game.js` names the suit that landed.
  - The `← vlmkit` back link wrapped to a second toolbar row and landed at the far left under
    the title, reading as stray content.
  - `Deal` ended one toolbar row while its `<select>` began the next. The `for`/`id`
    association was correct, so no a11y gate had anything to say.
  - `Left 52` sat beside a stock pile that visibly held cards and read as the stock count. It
    counted cards *not yet* on a foundation; it is `Foundations 0/52` and counts up.

  All four are pinned by new cases in `game.test.mjs`, each verified to fail on the old markup.

- **`check tokens` reported resolved `auto` margins as spacing violations.** `getComputedStyle`
  resolves `margin: auto` to pixels, so `margin: 0 auto` on a centred block reported 144px and a
  flex item with `margin-left: auto` reported **1048.12px** against a scale topping out at 96 —
  the gate was noisiest on the most conventional CSS there is. Typed OM's `computedStyleMap()`
  keeps `auto` as a keyword where `getComputedStyle` has already thrown it away, so the
  exclusion is exact rather than a magnitude heuristic; absent Typed OM every margin is kept.
  The sr-only idiom's `margin: -1px` is skipped too, at the same ≤2px-on-both-axes threshold
  `integrity-check` already uses. On the solitaire page 19 findings → 10, all ten genuinely
  off-scale.

- **`check palette` printed a `pngjs` stack trace** when handed anything that is not a PNG —
  `node_modules` paths and all, at a caller who passed an HTML file to a gate that reads images.
  It checks the PNG signature first and raises a `UsageError`, which prints as one line.

- The intro page's demo link was `display: none` on a phone, because `.site-nav { display: none }`
  at 900px took it with the scroll-spy anchors — the playable demo had no route from the device
  most likely to want it. It keeps a full-width row of its own there (measured: brand + link +
  controls need 400px in a 375px viewport, so the three cannot share a row). Its `→` marker is
  nested beside the translated span rather than next to it, because `data-i18n` is applied with
  `textContent` and destroyed the arrow on the first locale switch.

- **An OpenAI-based agent had no project instructions in this repo, and dead-ended on the provider
  name.** `.claude/CLAUDE.md` names benchmarked Claude models, so Claude Code reaches for
  `claude:claude-haiku-4-5-20251001` and works; there was no `AGENTS.md`, so Codex read nothing,
  guessed `VLMKIT_LLM_PROVIDER=openai`, got `Expected: gemini | anthropic | openrouter`, and stopped.
  Nothing in the message said where OpenAI models live, and a missing file has no test to fail.

  `AGENTS.md` now exists — a pointer to `.claude/CLAUDE.md` plus the one thing it cannot answer,
  which model to use when the agent is not Claude. **OpenAI defaults to `openai/gpt-5.6-luna`**,
  reached through OpenRouter, since there is no `api.openai.com` client and no `OPENAI_API_KEY` in
  the codebase — the `openai/` in the id is an OpenRouter catalogue prefix, not a provider. The id
  is written once, as `OPENAI_DEFAULT_MODEL` in `packages/vlmkit-ai/src/llm-client.ts`, and
  `tests/agent-model-defaults.test.mjs` pins `AGENTS.md`, `.claude/CLAUDE.md`,
  `docs/configuration.md` and `docs/ja/README.md` to it — plus that none of them tells an agent to
  set a provider or a key that does not exist.

  `INVALID_PROVIDER` now carries the route when the name asked for reads as OpenAI (`openai`, `gpt`,
  `codex`, `o3`, `o4`…): the exact `VLMKIT_LLM_PROVIDER=openrouter VLMKIT_LLM_MODEL=…` pair and the
  key it needs. A misspelling of a real provider does not get the OpenAI hint — "did you mean
  OpenRouter" is the wrong answer to someone who meant Gemini.

  Both paths were verified with real calls rather than by construction: the VLM read a screenshot
  through `openai/gpt-5.6-luna` and the LLM completed through `openrouter` + the same id. Also fixed
  while in the tables: `VLMKIT_VLM_MODEL`'s default was documented as `qwen/qwen3-vl-8b-instruct` in
  `docs/configuration.md` and `docs/ja/README.md` — that is the `openrouter` **LLM** default; the VLM
  default is `bytedance/ui-tars-1.5-7b`, and a test has been asserting it as "the documented default"
  while the documents said otherwise.

- **`--probe-drag`'s real gesture called every delegated drag board inert, and 0.11 shipped that
  way.** The probe pressed the element HOLDING the `dragstart` handler and credited the drag only
  when the recorded dragstart's path equalled that element's. Under delegation — one handler on the
  container, `closest(".card")` inside it, which is how a board that rebuilds its children has to be
  written — the container is never draggable, so the browser starts the drag on a descendant and the
  paths never match. `examples/solitaire` reported `no dragstart … started no drag` on a line
  directly above a route that opens with a dragstart, while its own harness wins the game through
  real `dragAndDrop` calls.

  The silent half was worse: everything gated on `dragstartFired` — the drop, the remaining
  destinations, the Escape-cancel gesture — was skipped for every delegated page, so
  `drag-source-detached-mid-drag` and the cancel-restore finding could not fire on a board at all.

  `DRAG_PLAN_SCRIPT` now resolves where to press (the container's draggable descendants, three of
  them, because which card has a legal destination is state the probe cannot read) and where to aim
  (the sibling piles and the empty ones — never the container, which is the self-drop every board is
  right to refuse). `dragstartFired` is decided by element identity in the page rather than by a path
  string, because `describe()` carries no positional index and a card that has just been dropped
  comes back under a different path. Solitaire goes from `started no drag` to a real drop with the
  page's own payload, `pressedOn` naming the card, and Escape measured. New fixture
  `fixtures/handlers/drag-delegated.html`, whose two boards separate the two faces of the defect.

  Measured on solitaire seeds 1-6 rather than on the one deal that prompted it: the drag starts on
  **all six** (it started on none before), and the drop lands on three, up from zero. Two of the
  three misses are the honest answer — those deals have no legal move from any card the probe
  presses — and one is a real miss whose destination sits past the aim cap. Blind search with a
  gesture budget cannot be made complete on a board; the way past it is a dispatch-only dragover
  sweep to pick the pair before driving one real gesture at it, which is not built.

  **A face-down card is not an empty pile.** Empty destinations were recognised as "childless,
  textless, at least 16px" and a card back satisfies every clause — on solitaire the stock's backs
  are first in document order, so they took the reserved destination slots and the foundations, where
  that deal's only legal move goes, were never aimed at. They are recognised by looking like the
  occupied piles now (same tag + first class), learned from every holder including the source's own,
  because a board with one card has no other holder to learn from.

- **`dragover-not-prevented` reported a capped pair search as an exhausted one.** "No listener
  cancelled it" is a claim about every source/target pair, and the search stopped at 40 — a fraction
  of what a board offers, and a handler that cancels only for a legal move is exactly what hides in
  the remainder. The cap is 96 now (8 sources × 12 targets, the product of the per-side caps, so the
  search is exhaustive within them) and the rule stands down when `dragoverCapped` is set. Found by
  the fix above: once the driven probe started landing drops for real, the dispatched probe that runs
  after it measured a mid-game board and the rule fired on a container that cancels for every legal
  move. Full write-up: `docs/reports/2026-08-17-real-drag-probe-delegation.md`.

- **The landing page explains the release it advertises, and routes to the demo from the page
  body rather than only from the nav.** A new "02 / PLAYABLE PROOF" section states what 0.11
  changed (the interaction gates perform the gesture now), shows a still of the game, and lists
  the three gates the deploy actually runs against `/solitaire/` — `page.test.mjs` reads those
  three back out of `deploy-pages.yml`, scoped to its solitaire step, so a gate the page claims
  and the workflow drops fails a test. Every section number below 02 moved up by one and the
  sequence is asserted, because they are copy and a missed renumber ships two "04"s.

  The still is generated, not photographed: `examples/vlmkit-intro-page/capture-demo-still.mjs`
  searches the same winning line `playthrough.mjs` uses, replays its first 60 plies through the
  page's own `commit`, and shoots with `animate=0` — so the image is a function of (seed, plies)
  and a solitaire restyle can be re-shot to the identical position. Its dimensions are read from
  the PNG header and matched against the `<img>` box, which is the drift a re-shoot at another
  size would otherwise cause.

  Two things the gates found while writing it, both fixed: a 26px margin `check design` called a
  scale outlier next to the 28px the page uses 17 times, and the skill note claiming "11
  workflows" when the router has bundled 13 since 0.10.

## 0.11.0 — 2026-08-16

The interaction gates stopped reading markup and started performing the
interaction. `scan handlers --probe <families>` now drives real gestures — HTML5
drag and drop, pointer-drag, wheel, hover, touch, context menu, text input — and
grades what the page actually did with them, including the states that exist only
while a gesture is in flight and the ones a browser refuses to start at all. Six
families, each with its own fixture page, its own rules, and an ablation that has
to fail when the rule is removed.

Two dogfood rounds against real applications (vite.dev's docs site, Bootstrap's
dashboard example) drove the second theme. Both rounds found the same shape of
defect three times over — **a geometric heuristic missing one dimension**: text
collision that ignored ancestor clipping, focus order that ignored column
boundaries, focus order that ignored `position: fixed`. One of them was hiding 11
WCAG AA failures behind a lossy dedup key, and the CLI and the CI path disagreed
about the answer because the same analysis existed in two copies.

0.10.0's plugin architecture finished: all 27 gates now render their own rule
settings in their own prose, so `--rule x=warn` reads back on every gate rather
than on eleven of them. The Playwright-spec capture path is retired in favour of
an in-process one, coverage moved 63.1% → 70.0% statements (five defects found in
the writing of it), and the long `### Fixed` list below is mostly CLI-contract
work: `--help` exiting 1, exit 2 surviving its own removal, flags read from
nowhere, and green verdicts printed over work that never happened.

### Breaking

Two of these can newly **fail a CI run that passed on 0.10.0**, and they are
listed first for that reason. One goes the other way and is listed third:
`check a11y touch` now defaults to AA and applies WCAG's own exceptions, so it
reports far fewer targets.

- **`check a11y contrast` reports findings it used to drop.** The dedup key was
  `path` alone, and `shortPath` collapses siblings, so N elements sharing a
  selector became one finding — the first one measured, whatever its colours. The
  key is now the finding's identity (path + foreground + background + font size +
  weight), which is why the Bootstrap dashboard went from `0 failures` to `1
  failure, 11 element(s)`. A page whose contrast defects were being deduplicated
  away will start failing. `ContrastFinding` gained `elements: number`, and the
  `inspected N text-bearing element(s)` count is now the sample count rather than
  the dedup map's size (10 → 105 on that page).
- **`check integrity`'s `text-collision` exempts clipped text.** Text scrolled out
  of an `overflow: hidden` ancestor is not overlapping anything a user can see. A
  run that was failing on such a pair now passes — the exemption is stated in the
  output rather than applied silently.
- **`check a11y touch` defaults to `--level AA` and applies the criteria's own
  exceptions**, so it reports far fewer targets. Three separate changes, all in the
  same direction:
  - **The default is AA (24px), not AAA (44px).** AA is the level conformance is
    defined against, W3C advises against requiring AAA as a general policy, and
    `vlmkit diff-pr` was *already* running this check at AA — so one page could pass
    CI and fail the CLI. `--level AAA` is unchanged and still available.
  - **The Inline exception** (2.5.5 and 2.5.8, so both levels): a target with computed
    `display: inline` and non-target text beside it in the same block is sized by the
    line-height, and is no longer reported.
  - **The Spacing exception** (2.5.8, AA only): an undersized target whose 24px circle
    intersects neither another target's box nor another undersized target's circle is
    no longer reported. A row of adjacent tiny buttons still is — that is the case the
    criterion is aimed at.

  Measured on the two dogfood targets: vite.dev went from **37 of 38 targets failing**
  to **0 failing with 14 excused**, and Bootstrap's dashboard example from 17 of 18.
  Both are unmodified vendor defaults, i.e. a floor no project using either framework
  could reach — and a gate that cannot be passed gets turned off whole, which is worse
  than a correct answer. Excused targets are LISTED, in the console summary, in a
  markdown section of their own, and as `wcagExempt` on the report and the run ledger;
  the criterion's other three exceptions (Equivalent, User-agent control, Essential)
  need intent rather than measurement and stay with `--allow "<selector>;<reason>"`.

  Two library changes come with it. `TouchTargetFinding` gained an optional
  `exception`; `A11yTouchRawSample` gained optional `display` and `inSentence`, and a
  sample without them gets no Inline exemption rather than a wrong one. New
  `analyzeA11yTouch` returns `{required, failures, wcagExempt, inspectedCount}`;
  `analyzeA11yTouchSamples` still returns failures only, so a caller counting
  `.length` does not silently start counting excused targets. `runA11yTouch` no longer
  re-implements the dedupe and cluster arithmetic inline — that copy is why the CLI and
  the diff-pr path could have disagreed, the same defect `check a11y contrast` actually
  shipped. The policy moved into `markup-core/a11y_touch.mbt` next to the thresholds it
  belongs with, as one `touch-policy` JSON call for the whole page instead of an O(n²)
  `touch-in-cluster` call per pair.

- **`check a11y focus` reports fewer findings.** A `reverse` or `skip-row` into or
  out of a viewport-pinned (`fixed` / `sticky`) element is no longer an order
  defect: one of the two `y` values in that comparison is a position on screen and
  the other a position in the document. `trap` still reports wherever the element
  is painted. `FocusStep` gained an optional `pinned?: boolean`, so hand-built or
  recorded steps keep every finding rather than losing all reverses.
- **`check theme` applies the theme strategy it detects** — class, attribute or
  media — instead of only flipping `prefers-color-scheme`, and takes
  `--dark-selector` to override the detection. The detected strategy prints next
  to the delta. Class- and attribute-themed apps that reported `0.0% delta` will
  now report a real one.
- **All 27 gates render rule settings in their own prose.** Output text changed on
  the 16 that did not before; anything grepping gate stdout should be re-checked.
- **`e2e/vlmkit-capture.spec.ts`, the root `playwright.config.ts` and the `vrt` /
  `vrt-update` tasks are gone.** `workflow init` and `workflow capture` run in
  process (`captureRoutes`) rather than spawning a Playwright runner against a
  packaged spec, which is what makes them work from an npm install at all. A
  project driving that spec directly must call `workflow capture`.
- **`workflow init --config <absolute-path>` writes the harness beside the config**
  rather than into the process's cwd. A relative `--config` keeps the existing
  `.vlmkit/markup-loop.json` layout.
- **`workflow capture` exits 1 on a non-2xx route.** A route that 404s used to be
  captured and reported as a success; each route now records `status`, `notOk`,
  `blank` and `waitForTimedOut`.
- **A subcommand name in any position but first is a usage error.** `snapshot
  <url> stability` used to be read as a URL plus a stray argument and silently ran
  the wrong mode.
- **`resolveModel` throws `MULTIPLE_MATCHES` instead of guessing.** An ambiguous
  short name (`flash`, matching several ids) used to resolve by id length. Pass the
  full id.
- **OpenRouter `totalTokens` falls back to `prompt + completion`** when the
  provider omits `total_tokens`, where it was previously `undefined` — cost
  arithmetic over recorded runs changes for those providers.
- **`composeFilmstrip({ maxWidth: 0 })` no longer thumbnails.** Zero and negative
  now mean "no cap"; it used to scale an 1832px strip to 132px.
- **The `pkf` tasks `vrt-test`, `vrt-demo`, `vrt-demo-fix`, `vrt-demo-multi`,
  `vrt-demo-multistep` and `vrt-help` are now `vlmkit-*`.** They are invocable names, so
  `pkf run vrt-test` stops working. `flaker-vrt-adapt` deliberately keeps its name: it is
  named after `flaker-vrt-report-adapter.ts`, and the file would have to move first.

### Added

- **Two false positives found by attacking the new rules on purpose, both fixed.**
  - **A field that rewrites text is not a field that drops it.** A furigana input transliterating
    kana to romaji returned `NIHONGO` for `日本語`, and `text-input-rejects-non-ascii` reported
    `lost "日本語" — typing it left "NIHONGO"`, contradicting itself in its own message. A drop returns
    *less* than went in; the rule now requires that. Fields that romanise as you type are ordinary on
    Japanese sites.
  - **A delayed reveal is not a missing reveal.** A tooltip appearing instantly on hover and 400ms
    after focus read as `hover-only-reveal` — and that delay exists so the tip does not flash as the
    pointer crosses. The hover probe now takes a second look 450ms later, and only when the first
    found nothing, so the cost falls on the path that would otherwise report. The same change fixed a
    false negative: a tooltip delayed on both had been invisible to both looks.

  Both are fixture cases that must stay silent now, both ablations fail on them, and the true
  positives are unchanged.

- **The input probe claimed a measurement it never took.** A field inside a closed `<details>` passes
  the size and display filter and then accepts no text: on a real page a textarea there reported
  `"vlmkit7" became ""` for a drive that never happened. Only the ASCII control kept that from being a
  false positive — and by the same token a genuine non-ASCII defect in that position would have been
  excluded, so it was a false-negative source as well. The probe now verifies the field took focus and
  reports `not driven — could not focus the field` instead. Found by sweeping all 60 pages in this
  repo that have a target for the new families.

- **`check interactions --handlers` could not emit five of the rules it declares.** It enabled the
  `drag` family alone, so `hover-only-reveal`, both `contextmenu-*` rules,
  `touch-handlers-not-invoked` and `text-input-rejects-non-ascii` were tunable through that gate and
  unreachable through it — the mirror image of the undeclared-rule error the runner already catches,
  and invisible to that check because declaring more than you emit is not an error. It now drives
  every family, which is what a gate that already fires keys at every control should do. Found by
  dogfooding the families against a real app; see
  [`docs/reports/2026-08-15-dogfood-probe-families.md`](docs/reports/2026-08-15-dogfood-probe-families.md).

- **`hover-only-reveal` named one element where seventeen shared the blame.** `describe()` derives
  the same path for every icon-only button in a toolbar (no `id`, no `class`), so the probe visits the
  first and the message read as though that button alone were at fault. It now says how many elements
  derive the same path, turning "this button" into "this pattern". On the editor above that count is
  17, matching the 17 tooltips in its DOM.

- **`--probe input`: text typed in three ways, and the control that makes the finding
  attributable.** Every visible text field gets an ASCII sample, the same text in Japanese, and the
  Japanese one through a real IME composition (kana composed, kanji committed via CDP):

    | field | ASCII in → out | CJK in → out | |
    |---|---|---|---|
    | no handler | `vlmkit7` → `vlmkit7` | `日本語` → `日本語` | |
    | strips non-ASCII on `input` | `vlmkit7` → `vlmkit7` | `日本語` → `""` | `text-input-rejects-non-ascii` (warn) |
    | digits only, by design | `vlmkit7` → `"7"` | `日本語` → `""` | excluded |
    | `maxlength=4` | `vlmkit7` → `"vlmk"` | `日本語` → `日本語` | excluded |

  - **The ASCII drive is the control.** A field that mangles it too is filtering by its own rules — a
    phone number, an amount — and losing the Japanese there says nothing about the script. Only a
    field that keeps the ASCII and drops the Japanese is reported, which is a name or address field
    that silently eats kanji.
  - **Targets are enumerated in the page, not read off the handler surface.** A filter is not always
    on the field: `maxlength` and `pattern` are attributes and a form-level submit handler is
    elsewhere. Reading the surface left three of the fixture's six fields unprobed, including two
    controls a reader needs to interpret the finding.
  - **The composition is driven for coverage, and nothing is graded from it.** Three IME-specific
    hypotheses were measured and none survived: a field that destroys the committed text destroys it
    identically with no composition (so it is not IME-specific); the confirming Enter cannot be
    judged, because a CDP composition does not consume it the way a real IME does and the native form
    submission fires either way; and a handler rewriting `value` on every `input` — the shape most
    likely to corrupt composing text — gave the same result composed or not, across identity, trim,
    slice and space-stripping rewrites. The composition types stop being listed as never exercised,
    and `keydown` keeps saying so, because `insertText` sends no key events.

- **`--probe menu`: what a real right-click did.** `defaultPrevented` is read after the page's own
  handlers have run — before them it is false for every target and separates nothing:

    | element | handler ran | cancelled | revealed | |
    |---|---|---|---|---|
    | `#ctxOk` | yes | yes | `#menu` | the contract |
    | `#ctxNoPrevent` | yes | **no** | — | `contextmenu-not-prevented` (suspect) |
    | `#ctxNothing` | yes | yes | **—** | `contextmenu-replaces-nothing` (warn) |

  The second is unambiguous: the browser's own menu opens too, so the page's menu is at best beside
  it. The third is a warn, because the replacement may be drawn where this cannot see it — a canvas,
  a portal positioned offscreen until placed — and suppressing the menu deliberately is a choice a
  page may make. Both require the handler to have actually run: a right-click that never reached it
  measured nothing about the contract.

- **`--probe touch`: a tap and a swipe, in a page of their own.** The separate page is measured, not
  stylistic — turning touch emulation on takes `navigator.maxTouchPoints` from 0 to 1 and makes
  `"ontouchstart" in window` true, which is exactly what a page branches on to decide it is on a
  phone. Sharing the page would have every other family measuring a different page.
  - `touch-handlers-not-invoked` (suspect) is the touch twin of `pointer-drag-intercepted`:
    registered, the tap landed on the element's own box, and nothing ran. On the fixture the covered
    pad invokes 0 listeners while its identically-wired neighbour invokes 1.
  - The swipe is driven through CDP (Playwright's touchscreen only taps) and its pixel delta is
    reported, not graded — 0% has several explanations and 0 invocations has one.

- **`--probe hover`: content that appears on hover and not on focus.** WCAG 1.4.13 and 2.1.1 — the
  tooltip, the menu, the row of actions that only a mouse ever sees. The probe hovers each trigger,
  then focuses the same trigger, and diffs what became visible:

    | trigger | hover reveals | focus reveals | |
    |---|---|---|---|
    | CSS `:hover` only | `#t1` | — | `hover-only-reveal` |
    | CSS `:hover, :focus` | `#t2` | `#t2` | |
    | JS `mouseenter` only | `#t3` | — | `hover-only-reveal` |
    | JS `mouseenter` + `focus` | `#t4` | `#t4` | |
    | hover handler that reveals nothing | — | — | the null control |

  - **What appears is outside the trigger's box** — a tooltip is a sibling positioned below — so the
    measurement is a diff of what is visible on the whole page, not a screenshot of the trigger. An
    element-local shot sees nothing change.
  - **Triggers come from the stylesheets as well as the listeners.** The CSS-only trigger has no
    listener to find and is the common form of this defect, so every selector containing `:hover`
    contributes one. Reading them turned up a live gap in the walk: since CSS Nesting shipped, a
    plain `CSSStyleRule` also has a `cssRules` property — an empty list, which is truthy — so
    `if (rule.cssRules) { recurse; continue; }` stepped into every style rule's empty child list and
    never looked at a selector. The fixture reporting only its JS triggers is what exposed it.
  - **The finding is emitted from the probe rows, not the per-element loop.** A CSS-only trigger has
    no entry in the handler surface at all, so the rule sitting inside that loop reported the JS
    trigger and silently skipped the CSS one the probe had measured correctly.
  - An unfocusable trigger gets the other half of the fix: `tabindex="0"` first, then the focus
    reveal. Unreadable stylesheets (another origin) and triggers beyond the cap of 12 are both
    disclosed rather than passed over.

- **`--probe <families>` and the first family beyond drag: the wheel.** Six interaction families
  were asked for; this is the plumbing plus the one that measured cleanest. `--probe drag,wheel` or
  `--probe all`; `--probe-drag` still means `--probe drag`. An unknown family is a usage error, not
  a silent no-op — a typo that quietly probes nothing is the failure mode every "absent means not
  measured" rule in this gate exists to avoid.
  - The wheel is rolled 200px over every element with a `wheel`, `mousewheel` or `scroll` handler,
    and how far anything scrolled is **reported, not graded**. Consuming the wheel is what a map
    that zooms, a carousel that steps and a chart that pans are all supposed to do, and this cannot
    tell them from a panel that swallowed the gesture by accident. `scroll` handlers are targets
    too, because rolling the wheel over a scrollable panel is how one runs.
  - `passive-listener-cannot-cancel` (suspect) is the graded half, and it needs no judgement: a
    handler called `preventDefault()` and the call did nothing. Measured per element from the
    listener patch, which now records how each listener was registered and whether the cancel it
    attempted ever took effect. The same wheel handler reads ineffective under `{ passive: true }`
    and effective under `{ passive: false }` — and under no option at all, which is the control,
    since a wheel listener on a normal element is not passive by default.
  - It keys on "the call did nothing", not on the listener being passive: `preventDefault()` on a
    non-cancelable event (`scroll`) fails the same way, and keying on `passive` printed the wrong
    explanation for it. Both cases are in `fixtures/handlers/wheel-and-passive.html`, with two
    controls that must stay silent.
  - The attribution needs no mutation of the event: `Event.prototype.preventDefault` is patched once
    and attributes the call to whichever wrapped listener is on top of a small stack, so a listener
    that dispatches its own events cannot confuse it.

- **Two defects that exist only while the drag is in flight.** Both leave the outcome correct —
  the drop lands, the data arrives — so nothing about the result reveals them.
  - `drag-source-detached-mid-drag` (suspect): the source removed itself from the document during
    the drag, so `dragend` never ran on it. That is the one place a drag is guaranteed to end up,
    success or not, and every cleanup wired there is silently skipped. Measured on a source that
    calls `remove()` in `dragstart` (the optimistic update done with the DOM instead of a class):
    `dragstart, dragover, drop` and no `dragend`, against a control whose node stays put.
  - `dragover-handler-slow` (warn): `dragover` fires every frame while the pointer is over a
    target, so a handler that takes 80ms stutters the drag for as long as it stays there.
  - **The timing is measured inside the listener, and the first version was wrong.** Deriving it
    from the interval between consecutive `dragover` events reported **68ms for a handler that
    returns immediately** — `dragover` keeps firing while the probe takes its 60-80ms hover
    screenshot, and that landed inside the interval. The fixture's fast zone is what caught it. The
    listener wrapper now times each invocation directly: 80ms for the slow zone, under 2ms for the
    fast one, immune to whatever the probe is doing. Only listeners added with `addEventListener`
    are wrapped, so an `ondragover=` property reads as unmeasured rather than as fast.
  - **A guard that turned out to be unreachable was removed rather than kept.** A missing `dragend`
    was re-read after 120ms in case the first read was too early. It cannot be: the evaluate that
    reads the log is queued behind the page's own main-thread work, so anything able to delay
    `dragend` delays the read with it — checked against a `dragover` handler busy-waiting 300ms,
    where `dragend` was already there on the first read.

- **A drag the user cancels has to leave the page as it was, and now that is measured.** The
  probe presses Escape mid-flight — which does cancel a driven drag: `dragend` arrives carrying
  `dropEffect: "none"` and no `drop` runs — and compares the source's own box either side of the
  gesture.
  - `drag-cancel-not-reverted` (suspect) needs both halves: the browser's statement that the drag
    was cancelled, and pixels that still differ. Either alone is not the defect — a completed drop
    is *supposed* to change the page, and a cancelled drag that reverted cleanly is the correct
    behaviour.
  - The shape it catches is the optimistic update every sortable makes: hide the item on
    `dragstart` because it is "leaving", and undo it in `drop`. A cancelled drag never reaches
    `drop`, so the item is gone for good. `dragend` fires either way, which is where the undo
    belongs. Measured on `fixtures/handlers/drag-cancel.html`: the card that undoes it in `dragend`
    leaves 0.00% of its box changed, the one that undoes it in `drop` leaves 99.03%.
  - The region is clipped from a page screenshot rather than taken from the element, and that is
    not a style preference: in exactly the failing case the element is `visibility: hidden`, and
    `elementHandle.screenshot()` waits for it to become visible and then times out after 30
    seconds. Measured the hard way.
  - `dropEffect` is recorded on `dragend` only. On `dragover` it read `copy` for a zone that
    accepts the drop and for one that refuses it, so it discriminates nothing there; on `dragend`
    it is the browser's verdict on the whole drag.
  - Its own budget (4 sources) rather than a share of the total, so a page with many sources
    cannot spend the drop exploration on cancels or the other way round.

- **A drop target nothing can drop on now reports.** `drag-source-inert` covers the source side;
  this is the other end. Measured on a zone with the complete correct contract — a `dragover`
  handler calling `preventDefault()` and a wired `drop` — sitting under a transparent sibling:
  every drag event went to the veil, the zone saw nothing, and the whole run reported nothing
  about it. Nothing else can: the static check sees both handlers, and the synthetic probe
  dispatches straight at the element, where they run as written.
  - `drop-target-unreachable` (suspect) is a **hit test**, so it needs no probe flag and appears
    on a plain `scan handlers`: three points inside the target (centre, 25%, 75%) go to
    `elementFromPoint`, which honours `pointer-events`, and the finding names what is on top.
  - Two things it gets right that the first version did not, each with a control in the fixture.
    A hit *inside* the target counts, because the event bubbles — deriving this from the gesture
    log instead reported the fixture's delegated `<ul>` as unreachable, since the aim lands on its
    `<li>`; `#filled-list` is now that shape and must stay silent. And three points rather than
    one, because a 40px badge over the centre does not make a zone undroppable — `#badged` is that
    shape. Both ablations (drop the containment check, sample one point) fail on those controls.
  - The gesture-log version also had to guess the interceptor from whichever element took the most
    `dragover`s, and named a zone the drag had merely crossed. The hit test needs no guess.
  - `fixtures/handlers/drop-target-covered.html` carries the pair plus the two controls: the
    covered zone, and an identical uncovered one that takes the drop, which shows the finding is
    about the covering and not about the contract.

- **The probe measures what a drop zone shows while the drag is held over it.** Two screenshots
  of the target with the mouse still down — workable at ~60-80ms each, measured — separate a zone
  that highlights on `dragenter` (99% of its own box changed) from one that does not (0.00%, and
  the frames are byte-identical). Taken only once a drag has actually started, which is read from
  the log mid-gesture rather than assumed, so a source the browser refuses to pick up costs one
  cheap `evaluate` instead of two screenshots.
  - **No new rule.** A zone that highlights and then refuses the drop is already
    `dragover-not-prevented`, so the measurement goes into that finding's message — "A real drag
    over it changed 99% of its own pixels, so it advertises itself as a drop zone and then rejects
    the drop — the user is told it will work" — rather than being reported twice.
  - A drop that works and shows nothing reads `(no visible change while hovering)` beside it:
    evidence, not a finding, because the feedback may be painted outside the zone's own box (a
    placeholder opening in a sibling list is the common shape).
  - To make those numbers exist for zones a lucky first drop would otherwise hide, a source that
    has already dropped now visits up to `EXTRA_TARGET_VISITS` (3) more targets. The old loop
    stopped at the first success, which left every zone after it unmeasured — and the questions
    this probe answers are about the targets. The gesture budget went 16 → 24, measured at ~0.2s
    per gesture; whatever is still unvisited is reported as `capped`.

- **The drag probe reports the route, not just the outcome.** The aggregates said whether a drop
  landed; debugging a drag needs what happened in between. Each source now carries an ordered
  timeline of every drag event, and the report prints it for a source whose drop never landed —
  which is when the question is "where did it go instead":

      - div#card: dragstart fired, tried 1 target(s) — no target accepted it
          route: dragstart@div#card → dragenter@div#card → dragover@div#card (NOT prevented …)
                 dragenter@body → dragleave@div#card → dragenter@div#bin
                 dragleave@body → dragover@div#bin x4 (NOT prevented — the drop is refused here)
                 dragleave@div#bin → dragend@div#card

  - **`prevented` is read after the page's handlers ran**, which is the only place it means "the
    page decided". Measured on the real gesture: a target that calls `preventDefault` reports
    `true` and a `drop` follows; one that forgets reports `false` and **no drop event is produced
    at all**. That is the same defect `dragover-not-prevented` infers from a synthetic dispatch,
    now confirmed by the browser.
  - **`stopPropagation` reads as `null`, not `false`.** A zone that cancels the event and then
    stops it never reaches the listener that reads `defaultPrevented` — and its drop still lands,
    measured. Reporting "refused" there would accuse a target that did the right thing.
  - **What the target received, at the one moment it is readable.** Under the drag-and-drop
    protected mode `getData()` returns `""` during dragstart/dragenter/dragover and the real
    payload during `drop`. Three sources on the fixture, three different stories:
    `#ok` → `text/plain="ok"` (the page set it), `#native-source` → `text/plain`, `text/uri-list`
    and `text/html` all supplied by the **browser** for an `<a href>`, `#attr-source` → nothing.
  - `dropEffect` is deliberately not recorded: it read `copy` on a target that accepts the drop
    and on one that refuses it, so it would be a column that discriminates nothing.
  - `drag` is kept in the JSON and dropped from the print. It fires on the source between every
    `dragover` on the target, so it defeats repeat-coalescing and turned one gesture into seven
    lines of alternating noise; it carries no routing information either.

- **`dragstart-transfers-nothing` over-reported for natively draggable elements.** The synthetic
  probe dispatches `dragstart` with a `DataTransfer` this code constructed, so all it can see is
  "the handler set nothing" — and for an `<a href>` or an `<img>` the *browser* fills the payload
  in. Measured on the fixture's anchor: synthetic transfer empty, real drop received
  `text/plain="file:///…#x"`, the link's own URL. A target calling `getData()` there reads the URL,
  not `""`, so the warn's premise did not hold. A payload actually observed at a drop now refutes
  it; no drop means no evidence and the warn stands.

- **`--probe-drag` now drives a REAL HTML5 drag, and grades the source a browser refuses to
  pick up.** The note in this file saying CDP cannot drive an HTML5 drag was wrong — measured
  with a capture recorder on `document`, `mouse.down` / `mouse.move` / `mouse.up` produces the
  genuine sequence, `DataTransfer` and all:

      dragstart@native-source, drag@native-source, dragenter@zone, dragover@zone,
      drop@zone, dragend@native-source

  That matters because dispatching a `dragstart` runs the handler *whatever the element's
  state*, so the synthetic probe reports a source no user can pick up as working. Three cases
  on the fixture, all with `draggable === true` and a registered `dragstart`:

  | source | real gesture | static read | synthetic dispatch |
  |---|---|---|---|
  | plain `draggable="true"` | dragstart, drop lands | fine | fine |
  | `-webkit-user-drag: none` | **nothing** | fine | fine |
  | covered by a transparent sibling | **nothing** | fine | fine |

  - `drag-source-inert` (suspect) — the gesture was performed twice, from the centre and from
    25% in, and the browser fired no `dragstart`. One explanation class: something stops the
    drag from beginning. `draggable === false` is excluded, because
    `drag-source-not-draggable` already names that case with its one-line fix.
  - Reported and **not** graded: which targets accepted the drag. A page may legitimately pair
    a source with only some of its drop targets, and this cannot tell that apart from a broken
    one, so the row says `dropped on <target>` or `no target accepted it` and stops there.
  - `unprobed-handler-types` shrinks to what the recorder actually observed, per source —
    observed, not inferred. On the drag fixture that warn disappears entirely: all seven types
    were seen. The first version inferred the list from the outcome ("a drop landed, so
    `dragleave` must have fired"), which is unsound — a gesture can enter a target and drop
    there without ever leaving it.
  - Two gestures per inert source, one per working source, capped at 16 per page, and a source
    that received none is reported as `not driven` rather than graded. The first loop had
    neither short-circuit: `#not-draggable` spent the whole budget retrying every target, and
    the two perfectly good sources behind it in document order were both reported inert.
  - Every gesture clears the selection first. A press-and-move on an undraggable element
    selects text, selected text is itself draggable, and the debris carries into the next
    source's gesture. The measured symptom is not the obvious one: it does not make a broken
    source look fine, it stops a *working* source from dragging.

- **`scan handlers` inspects HTML5 drag and drop, and reports the two handlers that cannot
  fire.** The `addEventListener` route always recorded drag types — it is type-agnostic —
  but a plain inventory cannot tell a working pair from a broken one, and DnD has two
  failure modes where a wired handler *never runs*:
  - `drag-source-not-draggable` (suspect) — a `dragstart` handler on an element whose
    `draggable` is false. The browser starts no drag, so the handler is dead. Read off the
    DOM property, so `<a href>` and `<img>` — draggable by default — are not flagged.
  - `drop-without-dragover` (suspect) — a `drop` handler with no `dragover`/`dragenter` on
    the element or any ancestor. `dragover`'s default action rejects the drop, so `drop`
    never fires. Ancestors count, because the event bubbles: a delegated target that
    registers `dragover` once on its container is correct and is not flagged.
  - `drag-without-keyboard-alternative` (warn) — drag has no keyboard equivalent in any
    browser, so a drag-only affordance is mouse-only (WCAG 2.1.1, 2.5.7). Warn rather than
    suspect because the alternative route is often elsewhere on the page. Kept out of
    `pointer-only-control` deliberately: its remedy is `tabindex` + a key handler, and that
    cannot start a drag — the fix here is another path to the same result.

  The `on*` sweep gained the drag family too. It had none, so `el.ondragover = fn` and
  `<div ondragstart="…">` were invisible: measured on a fixture assigning `ondragover` as a
  property, the element did not appear in the surface at all. `fixtures/handlers/drag-and-drop.html`
  is the committed contract — correct and broken pairs side by side, with the expectation
  per element in its own comment — and the E2E test drives that file rather than a copy.

  There is no `dragmove` event; the continuous ones are `drag` (on the source) and
  `dragover` (on the target), and both are collected.

- **Pointer-driven drag is recognised as a drag.** Found by dogfooding a real SVG editor
  (report: `docs/reports/2026-08-15-dogfood-moonlight-svg-editor.md`), which registers no
  `dragstart` at all — its canvas drags with `pointerdown`/`pointermove`/`pointerup`, like
  every canvas editor, sortable list, slider, map and split pane. The gate called it a
  `pointer-only-control` and advised "give it a role + tabindex + key handling": a true
  finding with the wrong remedy, since tabindex and a key handler no more drag a canvas than
  they start an HTML5 drag. `down + move` on the same element now classifies a pointer-drag
  surface, `drag-without-keyboard-alternative` covers both drag families with wording per
  family, and `pointer-only-control` steps aside for a drag surface so two contradictory
  remedies never appear together. A click-only role-less `<div>` is unaffected and pinned.

  Deliberately conservative, both limits measured: the signature needs `move` on the *same*
  element, so the common `pointerdown`-here-`pointermove`-on-`window` split is a known miss —
  pairing an element's `down` with a global `move` would call every `pointerdown` on a page
  with a cursor-follow effect a drag. And `setPointerCapture` would be the unambiguous marker
  but is not reliably visible: samples cap at 80 characters and real apps ship minified.
  **Severity change:** a drag surface that was a `suspect` under `pointer-only-control` is now
  a `warn`, for the same reason the HTML5 rule warns — the alternative route is often
  elsewhere on the page, which an element-local view cannot see.

- **`--probe-drag` drives a real pointer-drag gesture and reports what moved.**
  `mouse.down` / `mouse.move` / `mouse.up` is the input a user produces.
  (This entry originally said HTML5 drag is undrivable by CDP and that the synthetic
  `DragEvent` probe exists to work around it. That was wrong — see `drag-source-inert` above,
  which drives a real HTML5 drag the same way.) So the probe performs it on each pointer-drag surface and measures the
  element's own pixels while held and after release. On the SVG editor above, its canvas
  reported `feedback while held 8.14%, changed after release 8.53%`, and
  `unprobed-handler-types` dropped from 8 types to 5 — that warn says the types are "NOT
  covered by the interaction probes", which stopped being true for the three the gesture
  drove.

  Pixels rather than the DOM, because `fixtures/handlers/pointer-drag.html`'s `#canvas-works`
  draws on a `<canvas>` and its DOM never changes at all: a DOM comparison would call every
  canvas editor dead. Measured separation across the four pads — `works` ~3%/~3%,
  `feedback-only` ~3%/0.00%, `dead` 0.00%/0.00%, `canvas-works` ~1%/~2%.

  **Reported, not graded, on purpose.** A 0% row is ambiguous on a real page: dead handlers, a
  gesture that began somewhere ungrabbable, and feedback painted outside the element's box are
  indistinguishable from here, so turning it into a finding would report a state this has not
  established. One unambiguous variant was measured and deliberately left out — wrapping the
  page's own listeners shows whether they ran at all, which separates an overlay swallowing
  the gesture (`{}` invocations) from a merely inert handler (the full trio) — because doing
  it safely means patching `removeEventListener` too, or the tool alters the page it measures.

- **`pointer-drag-intercepted`: drag handlers that a real gesture never invoked.** The one
  outcome of the pointer-drag probe with a single explanation, and the only one graded. Two
  pads with identical registrations are indistinguishable in pixels — both 0.00%/0.00% — and
  are different defects: one's handlers run the full trio and do nothing, the other's never
  run at all because a transparent sibling takes every event. Counting invocations of the
  element's *own* listeners separates them, so an overlay swallowing a drag surface is now a
  suspect while an inert one stays evidence.

  Making that safe was the work. A wrapper is a different function object, so
  `removeEventListener(type, fn)` stops matching and every add-then-remove leaks a live
  listener — the tool would alter the page it measures. A WeakMap from the page's listener to
  its wrapper, with the same lookup on `removeEventListener`, prevents it, and a test runs a
  fixture with and without the patch and asserts the page's own log is identical: a listener
  removed by reference, `{ once: true }` firing exactly once across two clicks, an object
  listener with `handleEvent` (`this` is the object), a function listener (`this` is the
  element), the same function in both phases with only the capture one removed, and a
  throwing listener that must not stop the rest. Breaking the `removeEventListener` half makes
  that test report `+ "REMOVED-FIRED"`.

  Install order is load-bearing and was measured, not reasoned: the counting patch goes on
  *before* `HANDLER_PATCH_SCRIPT`, or the registration recorder captures
  `"function () { bump(this); return invoke.apply(…"` instead of the page's own listener and
  every handler snippet in the report is silently the wrapper's source. Only installed for
  probe runs — the inventory has no use for it, and every patch is a chance to alter the page.

- **An icon-only control now identifies itself in the handler surface.** On that same editor,
  eight rows read `div>div>div>button ""` — one per toolbar icon — with *both* identity
  signals blank at once: no text (icons), and no `id` or `class`, so `describe()` produced the
  same path for all eight. Their `aria-label`s said `Zoom Out`, `Fit to Canvas`,
  `Import SVG (Ctrl+Shift+V)`. `text` falls back to the accessible name (`aria-label`,
  `title`, a child `img[alt]`, then `placeholder`/`value`), which also travels into findings,
  since those quote it. The page had no unnamed buttons at all — vlmkit was reading the wrong
  attribute.

- **`scan handlers --probe-drag` fires the drag sequence and catches the two defects no
  static read can reach.** Both were measured to be observable before any of this was
  built: a synthetic `DragEvent` carrying a real `DataTransfer` runs the page's own
  handlers, `dispatchEvent` returns `false` exactly when a listener called
  `preventDefault()`, and `dataTransfer.types` afterwards shows what the source put there.
  So this needs no VLM. (It also said an OS-level drag is undrivable by CDP; it is not —
  `drag-source-inert` above drives one, and the dispatch route is kept for what it can reach
  that a gesture cannot, not for lack of an alternative.)
  - `dragover-not-prevented` (suspect) — a `dragover` handler that never cancels. The
    static `drop-without-dragover` check *passes* this, because a handler is registered;
    the browser rejects the drop regardless, so the wired `drop` never runs. This is the
    common form of the bug — remembering the listener, forgetting the `preventDefault`.
  - `dragstart-transfers-nothing` (warn) — the handler ran and left the `DataTransfer`
    empty, so a target calling `getData()` reads `""`. Warn because a page may deliberately
    keep its payload in its own state, which works in Chromium; Firefox and Safari will not
    start the drag at all. Any transferred type clears it, not just `text/plain` — asking
    for one format would call an `application/json` transfer "nothing".

  Off by default on `scan handlers`, which is an inventory: dispatching runs the page's own
  logic, and a drop handler that POSTs will POST. `check interactions --handlers` turns it
  on unconditionally, because that gate already presses keys at every control — a drag
  surface it would not exercise would be the odd one out.

- **`pnpm typecheck` exists.** It did not, and `pnpm -s typecheck` for a missing script
  prints nothing and exits 254 — so anyone (or any agent) reading "no output" as "types are
  fine" was reading a no-op, and a `| tail -n` pipeline hides the exit code that would have
  said otherwise. Running the real thing found one live error: a test whose two object
  literals unified to `keydown?: undefined`, not assignable to `Record<string, number>`.
  vitest does not typecheck, so it had been passing. `tsc -p tsconfig.json` takes ~9s over
  `src/**`, `packages/*/src/**` and `examples/gate-plugin/*.ts`.

- **The 22 browser-script constants are syntax-checked.** They are template literals
  TypeScript never looks inside, so a typo in one fails at `page.evaluate` — where the gate
  either throws something opaque or returns nothing and reads as a clean page. `new
  Function` compiles without executing, which names the constant and shows the error in
  under a millisecond. Deliberately *not* checked: a stray backtick, which is what prompted
  this (twice in two commits). It cannot be caught from the value — the correct form is an
  escaped `` \` ``, and after evaluation that is an ordinary backtick, indistinguishable
  from a stray one. `COLLECT_DESIGN_SAMPLES` has ten, all correct. An unescaped backtick is
  a compile error, so the compiler owns that case; what it does not own is the inside of the
  string.

### Fixed

- **The Pages deploy could not run its own verification step.** The workflow ran
  `node --test examples/vlmkit-intro-page/page.test.mjs`, and that file imports `test` from
  vitest, which throws on import outside the vitest runner. The suite migrated on 2026-08-13,
  the workflow last ran on 2026-08-07, and `page.test.mjs`'s own assertion pinned the broken
  command in place. It now asserts the runner and not just the path — a step that cannot run
  is worse than a missing step, because the workflow claims the contract is verified.

  **Three workflows carried that invocation, not one.** `heal-test.yml` and `skill-package.yml`
  had it too, and both failed on the first PR that touched their paths — after the deploy-pages
  occurrence had already been "fixed" in isolation. Fixing the one you found without sweeping for
  siblings is the mistake, so `tests/workflow-commands.test.mjs` now fails on any `run:` line
  invoking `node --test`, with its extractor proven against a sample rather than trusted.

  `skill-package.yml` needed pnpm and dependencies to run vitest at all, and it runs
  `page.test.mjs` on purpose — the intro page lists all 13 specialised skills, so a skills change
  can break it. That job has no Playwright, so the live-browser half of the intro page's contract
  moved to `examples/vlmkit-intro-page/site-links.test.mjs` and `page.test.mjs` went back to being
  browser-free. `deploy-pages.yml` runs the whole example directory so both halves are covered.

- **21 real WCAG AA contrast failures on the intro page**, unmasked by the dedup fix above:
  the gates config was authored while the gate reported 0 on a page with 21. Sixteen came
  from one token (`--surface-muted`, 3.83:1 on `--surface-2`); the rest were hard-coded
  alphas on the command-tab index, the footer and the hero install cards, one of which fails
  in both themes because it sits on the accent colour. Each new alpha is the computed floor
  across every background the rule lands on, plus headroom. This changes rendered colours, so
  the example's committed macOS VRT baselines need `just vrt-update` on a Mac; CI does not run
  that VRT.

- **The solitaire page scrolled horizontally by 14px at 375px** — found by `check integrity`,
  whose sweep includes a mobile width nobody had pointed at the page. The narrow-screen card
  width was a hand-picked `3.3rem` under a comment claiming no overflow; it is now derived
  from the constraint (seven columns, six gaps and the table's padding have to fit) and
  measures 0px from 320px to 1280px. Shrinking the card exposed a second finding: the centre
  pip was a fixed `1.5rem` and collided with the corner index, ten `text-collision` pairs
  exempted only because the pip is `aria-hidden`. Card typography is now a fraction of
  `--card-w`, which is what that file's own "one card size, everything else derived" already
  claimed.

- The intro page advertised `v0.9.0` while the repo shipped 0.11.0 — a public page two
  releases stale because three words in the middle of a hero go unread. Now pinned to root
  `package.json` by a test.

- **Every gate measured whatever animation frame it happened to catch.** `settlePage` waited for
  network idle, `fonts.ready` and a frame — and a page that animates itself in outlives all
  three. Dogfooding `examples/solitaire/`: `check integrity` reported
  `low-contrast-text … 4.12:1` on a card whose colour is **5.8:1**, having measured it at
  `opacity: 0.2` in mid-flight through a 960ms deal animation. The finding came with a selector,
  so a reader goes looking for a colour bug that does not exist; with the animation finished the
  same gate says CLEAN. Same shape as the three failures already recorded on that function —
  reported as a defect in the page rather than as looking too early.

  `settlePage` now has a fourth part: it awaits `Animation.finished` over
  `document.getAnimations()`, which covers CSS animations, transitions and Web Animations
  without sampling and without any cooperation from the page. Two properties make that safe to
  put in the shared settle — **infinite animations are excluded** (a spinner never finishes, and
  awaiting one would hang every gate on every page that has one), and the wait is **capped**
  (2s default, `animationCapMs` on `openSource` for a gate that knows better; 0 skips it).
  Measured: `check integrity` on the animating page 2329ms → 2850ms, **unchanged on static
  pages** (2297ms), full suite 321s → 328s. `tests/settle-page-single-definition.test.mjs` pins
  all four parts and both safety properties.

- **`check a11y contrast` reported the INVERSE of the truth behind a gradient.** Found by
  dogfooding `examples/solitaire/`, whose toolbar is `rgba(0,0,0,0.28)` over a green gradient:
  the gate reported **9 failures at 1.08:1** for `#f2f7f2` on `#ffffff`. The text is near-white
  on near-black. Its `effectiveBg` had no notion of `background-image` at all, treated any
  colour with alpha ≥ 0.5 as opaque, never blended a chain, and fell back to white for a
  background it could not see.

  `check integrity` gets the same page right and says why — "background-image/gradient in the
  stack — composite-background contrast is not deterministically measurable". So the judgement
  existed in the toolkit and the gate whose whole subject is contrast did not have it. Third
  instance of that shape in this release, after the dedup defect and the `js-error` split.

  The resolution is now one shared browser-script fragment, `CONTRAST_BACKGROUND_JS`
  (`packages/vlmkit-markup/src/contrast-background.ts`), interpolated into **both** gates — the
  pattern `animation-eval.ts` already uses for `ANIMATION_HELPERS_JS`. It walks the ancestor
  chain blending translucent layers over white, and on a `background-image` it **refuses** rather
  than guessing: what is behind the text becomes a pixel question that computed style cannot
  answer. `check integrity`'s behaviour is unchanged (same 17 skipped, same verdicts); the
  contrast gate went from 9 false failures to 0, and its coverage line now reads `inspected 59
  text-bearing element(s), 24 not measurable`. Real failures are unaffected — the low-contrast
  fixture still reports 4, `css-challenge/page.html` 2, `dashboard.html` 7.

  A refusal is stated, never silent: `A11yContrastReport` gained `unmeasuredComposite`, and the
  console and markdown reports both name the count, because "0 failures over 59" and "0 over 59
  with 24 unmeasurable" are different claims and only the second is honest. Foreground alpha and
  the ancestor `opacity` chain are now composited too, so `rgba(0,0,0,0.4)` on a faded parent
  reads as the colour a person sees. `A11yContrastRawSample.composite` is optional, so recorded
  runs and hand-built samples keep being measured.

- **Two smoke harnesses had been failing every command since the 0.6 rename.** Chasing the
  leftover `vrt` spellings turned up dead invocations rather than cosmetics:
  - **`scripts/smoke-all-clis.sh` was 0 of 22.** Every command used the flat pre-0.6
    spelling — `a11y-contrast`, `component-from-image`, `png-diff` — which the group rename
    replaced and which now exit "Unknown command". `Taskfile.pkl` advertised it as the
    `smoke-all` gate throughout. It is 22 of 22 now, and its pass condition changed with it:
    it required exit 0, but most of these fixtures are *deliberately broken*, so six working
    gates were being counted as failures. The condition is now "the report file was written",
    which separates "found defects" from "broken invocation" — a usage error dies before
    measuring and cannot write one. That also retired the one-off `|| true` the previous
    version had papered a single case over with.
  - **`Test.pkl`'s 22 tests all spawned `src/cli/vrt.ts`**, a file that has not existed since
    the rename, and asserted on stdout (`"vrt a11y-touch"`) no gate can print. `pkspec check`
    verifies a test *exists* per Scenario, not that it runs, so it reported full coverage the
    whole time. All 22 commands and every stdout assertion are now verified against the real
    CLI.
  - **`Spec.pkl` pointed 20 implementation links at `packages/vrt-*`** and two at
    `src/cli/router.ts` (folded into `cli.ts`), one of those naming a symbol that exists
    nowhere. `Taskfile.pkl` carried the same dead `router.ts` as a pkfire input, where a
    missing path quietly weakens change detection instead of erroring.

  Three guards close the gap, each verified by injecting the regression it is for:
  `src/cli/smoke-commands.test.ts` asks the CLI whether every command in both harnesses
  routes, `src/cli/spec-implementation-paths.test.ts` resolves every declared path (including
  the `path:SYMBOL` form), and `src/cli/binary-name.test.ts` — which greps *help output* and
  so could never have seen any of this — now records what it does and does not cover.

  Also renamed: the `pkf` tasks `vrt-test` / `vrt-demo*` / `vrt-help` to `vlmkit-*` (with
  their references in `docs/`, `skills/vlmkit/SKILL.md` and `.apm/`), and `docs/api-design.md`
  lost a `vrt demo` section documenting a verb that does not route under either name.

  **`Spec.pkl` and `docs/SPEC.md`, done in a second pass.** 17 classified command references
  plus every bare `` `interact` `` (14), `` `explore` `` (2) and `` `compare` `` (5) now name
  their grouped form. Reconciling them turned up that the generated doc had **drifted from its
  source in both directions**, independently of any rename: it kept 12 `- code:` links to
  `src/compare.ts` and one to the deprecated `vlm-region-diff.ts` that `Spec.pkl` had dropped,
  lacked the `reasoning-pipeline.ts` link it had gained, spelled the same live entry four ways
  (`diff html` vs `migration compare` — the same command, verified: `migration compare --help`
  prints `Usage: vlmkit diff html`), and for M3 asserted the *opposite* of its source, claiming
  typography hints work and linking `src/typography-hints.ts`, a file that does not exist. All
  reconciled per scenario id rather than by filename guess, information-preserving direction
  first: a `check motion` sentence the artifact had and the source lacked moved into the
  source. `spec-implementation-paths.test.ts` now checks both link directions and that every
  scenario description matches, so the artifact cannot drift again silently.

  Left in place after classification, because they name something other than a verb:
  `Implementation.at` file paths, `a11y-semantic` / `render-sanity` / `component-geometry`
  (modules and heuristics, not commands), the Test.pkl test names `` `compare` `` and
  `` `png-diff` `` referenced by id, "cross-browser parity" and "the H1 cross-browser diff" as
  prose adjectives, and the `MS-MARKUP-ASSISTANCE` milestone, which records what PR #5 shipped
  on 2026-05-13 under the names it shipped with.

  **Deliberately left**, because each names something real rather than the tool:
  `window.__vrtActions` and `data-vrt-action` (the `inspect explore` page contract — user
  markup sets these), `.vrt-skills/`, `src/vrt/`, the `vrt-*` skill directories,
  `flaker.vrt.json` and metric-ci's `vrt-bench` / `vrt-migration` adapter names, and recorded
  data — `fixtures/google-search/*.a11y.json` captured a page titled "vrt testing - Google
  Search" and a11y baselines captured `just vrt-test` rendered inside a fixture's `<code>`
  block. `docs/SPEC.md` is generated by `pkspec`, which is unavailable
  here (it runs via `nix run`), so it was updated in lockstep with `Spec.pkl` by hand.

- **`markup-loop` resolved config paths from four places, and three were wrong.** `init` was
  fixed earlier to write the harness beside an absolute `--config`; `doctor`, `run` and
  `observe` kept resolving against `process.cwd()`. So `doctor --config /elsewhere/x.json`
  reported *this* directory's missing files for a harness `init` had just written correctly,
  `run` refused to start for the same reason, and `observe` — the worst of the three, because
  it writes — dropped its observations here and left the config's own harness untouched.
  `markupLoopRoot()` is now the single definition (absolute config → its directory; relative,
  including the `.vlmkit/markup-loop.json` default → the cwd) and all four use it.
  `buildMarkupLoopCommands` takes the root too, absolutizing the plan/generate argv only when
  it differs from the cwd — those arrays are handed to `runPlanCli` / `runGenerateCli`
  in-process, where a relative path would have read and written in the wrong project, while
  the default case keeps its short copy-pasteable display. `--helper-import` is deliberately
  left alone: it is a module specifier inside the generated test, relative to that file.
  The test that had pinned this as a known limitation is replaced by one that shows `doctor`
  reaching exit 0 once the project's own `playwright.config.ts` exists. Still open, one level
  narrower: a relative config that escapes the cwd (`../other/markup-loop.json`) resolves to
  the cwd, which needs the project root discovered rather than derived.

- **`js-error` said nothing about whose script threw.** From the vite.dev dogfood: a
  blocked CDN wasm produced **seven warns for one cause**, and a reader could not tell
  "your app throws" from "your sandbox blocked a CDN" — while a *cross-origin script
  that 404s* was already correctly downgraded to a warn two functions away, so the
  gate knew the distinction and only applied it on one of the two paths. Both halves
  of the recorded fix landed:
  - **Attribution.** A `pageerror`'s first stack frame and a `console` message's own
    location give the URL the browser blamed; its origin against the page's decides
    first- or third-party. A third-party throw during construction is now a `warn`,
    not a `fail`, and the message names the host — the page's own build is what this
    gate is for. `unknown` is deliberately not `first`: a console notice with no
    location must not land on the page's record because nothing contradicted it, and
    an event with no `party` at all keeps its old severity.
  - **Correlation with the wire.** Chromium logs `Failed to load resource: …` with the
    failed URL as the message's own location, and `judgeNetworkFailures` already
    reports that URL with the resource type, reason and severity — so the console copy
    is an echo. Those are dropped, matched on the URL rather than on the text, so a
    real broken resource the wire never saw still reports. This is done after the page
    settles, not in the console handler, because Playwright does not guarantee
    `requestfailed` arrives before the line describing it.

  `RuntimeEvent` gained `sourceUrl` and `party`; `firstStackUrl`,
  `classifyRuntimeParty` and `correlateRuntimeEvents` are exported and pure, so the
  attribution is testable without a browser.

- **The version number is stated once instead of three times.** `vlmkit --version` and the MCP
  server's `{ name: "vlmkit", version }` handshake each hardcoded their own copy of the root
  `package.json` version. `src/cli/version.test.ts` did catch the drift — it failed twice while
  stamping this release — but catching it is not the same as not having it: the number a bug report
  quotes and the number an MCP client logs both depended on remembering a third file. Both now read
  `VLMKIT_VERSION` from `@mizchi/vlmkit-core/version.ts`, and the test changed from comparing three
  literals to asserting the two consumers carry no literal of their own, which is what catches a
  *fourth* copy.

- **`check a11y contrast` was reporting 0 failures on a page with 11.** Found by dogfooding
  Bootstrap's dashboard example, where `check integrity` reported the same defect correctly at the
  same moment — two gates in one toolkit disagreeing about WCAG on one page, and the wrong one was
  the gate whose whole subject is contrast. Two causes: the dedup keyed on a truncated selector
  path, so all twelve sidebar links collapsed into the one `.active` link that passes at exactly
  4.50 and eleven `#0d6efd` failures at 4.27 were dropped; and the same dedup-and-analyse logic
  existed twice, so fixing the exported `analyzeA11yContrastSamples` (what `vlmkit diff-pr` calls)
  left `runA11yContrast` (what the CLI calls) reporting the old answer. The key is now the finding's
  identity — path plus colours, size and weight, the inputs the verdict uses — findings carry how
  many elements share the case (`11 element(s)`, matching what `check integrity` says), and the CLI
  delegates to the shared function. The coverage line also moved from 10 to 105: it had been
  printing the size of the dedup map under a label reading "text-bearing element(s)".

- **`check a11y focus` no longer calls a `position: fixed` control a focus-order defect.** Bootstrap's
  theme switcher is `fixed bottom-0 end-0` and eleventh in `<body>`, so Tab reaches it first and the
  next step goes to the navbar: `[reverse] Focus moved up by 662px`, exit 1, on the idiom skip links
  are built from. One of those two coordinates is a screen position and the other a document
  position. The sampler now records whether an element (or an ancestor) is fixed or sticky, and a
  `reverse` or `skip-row` across one is not reported — `trap` still is, because focus stuck on one
  element is a trap wherever it is painted. The gate says the policy applied rather than silently
  reporting nothing, and `pinned` is optional so hand-built or previously-recorded steps keep every
  finding. vite.dev's four findings, both genuine reverses included, are unaffected.

  Third gate in two dogfood rounds whose defect was a geometric heuristic missing one dimension:
  collision missing clips, focus missing column boundaries, focus missing the positioning context.

  Also recorded from this round: the theme-strategy fix is **still unproven on a real app**. Bootstrap
  bridges `prefers-color-scheme` to `data-bs-theme` in `color-modes.js`, exactly as VitePress bridges
  it to a class, so the pre-fix build scores 94.2% against 94.3% here. Two real apps in a row, which
  says something about the ecosystem — the fixture remains the only evidence the fix matters. And
  `check a11y touch` is filed after a second sighting: 17 of 18 Bootstrap defaults fail its AAA
  target, as 37 of 38 did on vite.dev, so what it needs is WCAG 2.5.8's AA level and inline
  exception rather than a quieter default. Full write-up:
  `docs/reports/2026-08-16-dogfood-bootstrap-dashboard.md`.

- **A strip that actually plays**: `snapshot strip --animated` and
  `check animation --strip out.png --strip-animated` write an animated PNG. The recorded item asked
  for animated WebP; that is not encodable with what this repo ships. The optional peer
  `@jsquash/webp` wraps libwebp's single-image encoder and does not expose `WebPAnimEncoder`, and
  `sharp` — which can — was already measured and rejected in `webp.ts` at 29 MB against 1.1 MB for
  identical static output. APNG needs **no dependency at all** (zlib plus chunk assembly in
  `packages/vlmkit-core/src/apng.ts`), is lossless and full-colour, plays in browsers and in GitHub
  comments, and degrades to frame 0 in a viewer that does not know it — so the file stays usable as
  a still. The honest cost against animated WebP is size: no inter-frame compression, so six frames
  are roughly six PNGs (265 KB against a 123 KB still sheet on the dashboard fixture).

  `check animation --strip-animated` animates the WHOLE PAGE over the sampled timeline, with
  per-frame delays taken from the actual sample instants rather than spread evenly. That also
  answers half of the recorded "the strip loses spatial arrangement" item: nothing is cropped, so
  three cards side by side stay side by side.

- **The filmstrip's uniform cell stays uniform — the recorded fix was measured and rejected.** A
  real sheet is 49.0% background (1532x781, `check animation --strip` on the dashboard fixture), and
  the recorded diagnosis blamed per-row cell sizing. Implemented, it recovers almost nothing: the
  four rows are all 393px tall and 916/664/412/244px wide, so per-row height produces byte-identical
  output, and per-row width cannot help because the sheet must be as wide as its widest row —
  37.1% against 36.2% on a synthetic three-width sheet. It also breaks a correctness property:
  a column label names one instant across every row, and ragged widths print it over a cell from a
  different sample. The padding is a property of the composition, not of the cell rule, and
  `composeFilmstrip`'s header now carries the measurement so the item is not re-opened on the same
  wrong model.

  One real bug fell out of measuring it: `composeFilmstrip({ maxWidth: 0 })` — documented as "do not
  cap" by `snapshot strip --max-width 0` — solved for a scale that fits a zero-width sheet, hit its
  64-step guard, and returned a 132px thumbnail of an 1832px strip. The CLI dodged it by omitting
  the option; every other caller got the thumbnail.

- **One definition of "the page has settled".** Three call sites — `check integrity`,
  `check design` and the font-determinism probe — hand-rolled the pair `fonts.ready` +
  `waitForTimeout`, each with its own delay (250 / 250 / 150ms), and now call `settlePage`. Not
  cosmetic: the next improvement to settling reaches `settlePage` and silently misses a hand-rolled
  copy, and two thirds of a settle is what made `verify flow` report `count .card expected 2,
  measured 0` on a page `check layout` measured 2 on at the same instant.

  `tests/settle-page-single-definition.test.mjs` fails the fifth copy. It forbids WAITING on fonts
  rather than the string `document.fonts`: `integrity-check.ts` reads that collection to report
  broken faces (`status === "error"`), which is a measurement, and a string ban would have pushed
  that probe out of the file it belongs in. `waitUntil` stays unpoliced on purpose — `goto(load)`
  followed by a settle waits for idle anyway, so the load state was never the axis.

- **The two-stage reasoning pipeline is tested against recorded responses** — `reasoning-pipeline.ts`
  10.7% → 90.2%, which with `vlm-client.ts` at 89.5% closes the recorded-fixture item. The
  recordings live in `fixtures/vlm-recordings/` and are **hand-written to each provider's shape
  rather than captured** (no credentials in this environment); the README traces every field to the
  code or dated report it came from, and states what the fixtures cannot prove — that the providers
  still return this shape. A green run here is not evidence a live run works; the benches in
  `docs/reports/` remain the only thing that shows that.

  What is now pinned: the CHANGE-line parse and its dedup rule, SUMMARY / REGRESSION, the image
  priority (selector crop > heatmap > current), shift detection reaching the prompt, the FIX-line
  parse, an empty result for a model that answers in prose (common enough that `docs/knowledge.md`
  names the models), and the escalation ladder — it fires only on a low-confidence fix over at most
  one change, stops at `maxResolution`, respects `adaptiveResolution: false`, and does not fire
  without a higher-resolution image to re-send.

  One premise of the recorded item was wrong: `component-from-image.ts` (404 uncovered) uses no VLM
  at all — it is `withBrowser` plus pixel math — so its gap is a browser orchestrator gap and stays
  open under that heading rather than this one.

- **Coverage 63.1% → 70.0% statements (64.7% → 71.8% lines), and five defects found by writing the
  tests.** The number moved two ways, both stated:

  - **Real tests**, 62 of them, over five shipped modules that had little or none: the VLM client
    (7% → covered request shaping and response parsing for all three providers, with a stubbed
    `fetch` and a mocked Gemini SDK), `diff-for-agent`'s optional signal sections (forced-state,
    palette, shift-origin, region-diff — the whole back half of the file an agent reads),
    `snapshot`'s subcommands through the real dispatch, `scaffoldStoryGallery`, `runSmokeTest`'s
    reproducibility contract, and `markup-loop`'s CLI.
  - **A smaller denominator**, for 15 files: research and demo RUNNERS that nothing imports, need
    an API key or a 30-trial loop, and are invoked as `node src/...` from `Taskfile.pkl` rather
    than shipped. The criterion is mechanical — no non-test file may import an excluded path —
    and `tests/coverage-exclusions.test.mjs` enforces it, so `migration-compare.ts` stays in the
    denominator at 40% despite having its own CLI entry, because six modules import it.

  What the tests found: OpenRouter's `total_tokens` is optional and reading it directly put
  `undefined` into the token counts that `docs/reports/` benches quote (the Anthropic and Gemini
  paths always summed); `resolveModel("vision-")` silently picked between two vendors' models by
  id LENGTH, and now requires a whole-segment match or reports the candidates; the OpenRouter
  model catalogue was cached process-wide with no way out, which also means a long-lived API
  server never sees a repriced model (`resetVisionModelCache` exists now); `snapshot <url>
  stability` treated the subcommand as a URL and failed with `Cannot navigate to invalid URL`;
  and `markup-loop init --config /elsewhere/markup-loop.json` wrote the config there and six
  starter files into the current directory — found by a test that scattered them into this repo.

  Coverage thresholds are now a floor (`statements: 69`, `lines: 70`), set ~1pp below the
  measurement because consecutive full runs differ by up to 0.05pp on browser-timing paths. The
  config states why statements sit ~2pp below lines and will stay there: `page.evaluate` bodies
  run in the browser, where node's v8 coverage cannot see them.

- **`workflow init` / `workflow capture` work from an installed package**, and the `dist/e2e`
  packaging question is retired with the thing that caused it. Capture used to spawn
  `npx playwright test e2e/vlmkit-capture.spec.ts`; the published package excludes the spec
  (`"!dist/e2e/**"`) and never shipped the sources, so those two commands were
  source-checkout-only. The spec was 135 lines of `goto` / `screenshot` /
  `Accessibility.getFullAXTree` / write with no fixtures and no snapshot assertions, so it is a
  function now — `captureRoutes` in `@mizchi/vlmkit-capture/route-capture.ts`, on the same
  `withBrowser` all 27 gates use. Deleted with it: the spec file, the root `playwright.config.ts`
  and the empty `e2e/`, the `vrt` / `vrt-update` tasks, the `!dist/e2e/**` exclusion and the build
  entry that fed it, plus `resolveCaptureSpecPath` and `captureSpecMissingMessage` — a careful
  message about a file that no longer needs to exist.

  Deleting the two commands instead would have cost more than it looked: `verify`, `approve`,
  `report`, `introspect`, `spec-verify` and `expect` all read the `.a11y.json` sidecars capture
  produces, and nothing else produces them (`vlmkit snapshot` writes multi-viewport PNGs, no a11y
  trees), so two commands would have orphaned six.

  Three defects fell out of the port. Running one spec under two Playwright projects
  (`vrt-desktop` 1280x720, `vrt-mobile` 375x812) had both writing the same `<name>.png`, so a
  baseline was **nondeterministically desktop or mobile**; capture now takes one viewport and
  names it in the output. A subprocess exit code cannot say which route failed, so the callers
  guessed from file counts and printed "(some tests had warnings, but captures completed)" for a
  404, a broken selector and an empty page alike; each route now reports its own status, an
  unmatched `waitFor`, an empty body, and whether the a11y tree came from CDP or the degraded
  `ariaSnapshot` fallback. And `page.goto` does not throw on 4xx, so a mistyped route captured the
  server's error page, wrote an a11y tree of it and exited 0 — a baseline that then passes
  forever; a non-2xx capture is now reported and exits 1.

- **Three gates stopped failing correct markup**, found by dogfooding vite.dev — a real
  VitePress docs + marketing site, mirrored locally because Chromium has no outbound network in
  this sandbox. Each was a geometric heuristic missing one dimension:

  - `check integrity`'s `text-collision` compared layout boxes without asking whether the text is
    painted where the box says. A "wall" of cards with `height` + `overflow: clip` + a
    `mask-image` fade keeps boxes 57px into the next section, so three `fail`s landed on a page
    with nothing wrong with it. The occlusion probe in the same file had clamped to the ancestor
    clip since it was written, for exactly this reason. Now both do; a run clipped only partly
    still collides on its visible half, and a run clipped away entirely is exempted with the
    clipping ancestor named. 3 fails → 0.
  - `check theme` only ever emulated `prefers-color-scheme`, which appears **zero** times in
    vite.dev's CSS against 47 `.dark` selectors — the majority strategy (Tailwind
    `darkMode: "class"`, VitePress, next-themes, `data-theme`). It now reads the stylesheets,
    applies whichever strategy is there, prints which one it turned, and takes
    `--dark-selector` to override. On a class-only fixture: `0.0% delta, 8 of 8 unthemed` →
    `89.0%, 1 of 8` — and the 1 is the actual hard-coded component.
  - `check a11y focus` called every multi-column footer a `reverse`. Tabbing down one column and
    on to the top of the next is forward reading order; the missing fact was the width of the
    element focus came from. MoonBit's classifier now takes it (optional — absent keeps the old
    verdict) and reports `column-advance`. 8 findings → 4, with both genuine reverses surviving.

  Documented and not fixed: one blocked third-party asset produces seven indistinguishable
  `js-error` warns with no first-party/third-party attribution, which will hit any
  network-restricted CI. Full write-up, including where this app could NOT settle a question and
  what did: `docs/reports/2026-08-16-dogfood-vite-dev-docs-site.md`.

- **All 27 gates now render their own rule settings** — the remaining 16 landed together, so
  `--rule x=off` no longer produces a screen whose two halves disagree on any built-in. The
  loudest cases were the two verdict gates: `check layout` printed `VIOLATED` and `verify markup`
  printed `NOT DONE` over the runner's `exits 0`, for rules the project had deliberately turned
  off. Both now recompute the word from what still reports and say why it differs from the raw
  report. One rule held across all of them: **a measurement does not stop existing because a rule
  was turned off** — `check breakpoints` still prints `768px: 1 spike(s)`, `check perf` still
  prints the CLS number, `check story` still prints `4.00% diff`, `check layout` still prints
  every failing check's measured value — what changes is the marker, the failure claim and the
  verdict, plus a line naming what was dropped. Smaller fixes fell out of doing it: `check
  animation` stopped tagging `settle: 4500ms` with `[long-settle]` when that rule is off (a
  dogfood agent had called those status lines unreadable for pointing at rules with no visible
  finding), `check equivalence` stopped demanding a human reader for `pending-review` regions the
  project accepts, and `check story --update-baseline` stopped printing a yellow warning per story
  for the thing the operator asked for. Seven gates share an `issues[]` shape and now go through
  one projection (`packages/vlmkit-markup/src/rule-prose.ts`) rather than fifteen hand-copied
  lines each; `check layout`'s rule-id map moved next to its formatter so the gate and the prose
  cannot disagree about which rule a failing check belongs to. `docs/authoring-gates.md` teaches
  the two-parameter form as the default shape, and the runner's disclaimer stays live for gates
  outside this repo.

- **The reference docs are checked against the CLI** (`tests/docs-cli-parity.test.mjs`): every
  flag and every command verb they tell a reader to type must exist in the code. Written after
  `--capture-spec` — documented for a command that never had it — and after the same sweep found
  that a naive grep reports 21 flags as missing while exactly one of them really was: the other 20
  are `hasFlag(args, "no-baseline-sanity")` (the source never writes the dashes), `Taskfile.pkl`
  task parameters, gate inputs declared as `{ name: "level" }`, and prose about CSS variables. All
  four patterns are folded into the check, design/plan docs are excluded (their flags are
  proposals), and the two places where the docs deliberately name something absent — the
  `--capture-spec` denial and the `vlmkit serve` → `vlmkit api serve` rename table — are an
  allowlist with reasons rather than a cleverer regex. The check asserts a flag EXISTS, not that
  the command shown accepts it; the scope is stated in the file. No further defect was found: the
  command-verb half is clean today, and it exists because the same rot in `.github/workflows/` once
  left a job green while running nothing.

- **`check integrity` printed `DEFECTS (1 fail, 0 warn)` directly above the runner's
  `exits 0 — 1 warn(s)`.** Found while giving eight more gates rule-aware prose, in the one gate
  that already had it. Its formatter asked the rule view for a rule's *effective* severity, which
  falls back to the severity the gate DECLARED — but `applyRuleSettings` re-tunes a finding only
  when there is an explicit setting, precisely so a gate can grade on evidence. This gate does:
  `js-error` is a fail during construction and a warn after load, and `text-clipped` and
  `degenerate-render` grade the same way, so three rules rendered one severity and exited on
  another. Reproduced on a page whose script throws inside a post-load `setTimeout`.
  - `RuleView` gained `setting(ruleId)` — the explicit setting, or `undefined` when nobody set
    one. That is the question a formatter has to ask; `effective` cannot express "unset" at all.
  - New `@mizchi/vlmkit-core/plugin/rule-tier.ts`: `ruleTier(rules, id, emitted)`,
    `applyRuleTiers` for row lists, `hiddenByRuleNote` for the disclosure line, and
    `ruleViewFrom` so a test stub cannot re-introduce the lossy half.

- **Eight more gates render their rule settings in their own prose** — `check a11y touch`,
  `check a11y contrast`, `check a11y focus`, `check tokens`, `check theme`, `check design`,
  `stress i18n`, `stress media` — taking the total from 3 of 27 to 11. `--rule x=off` used to
  change the exit code and nothing on the screen: `check a11y touch` printed all 45 findings with
  a red ✗ over a green verdict. Now the measured count survives (45 targets do not stop existing
  because nobody wants to be told about them) while the rows and the failure marker do not, and a
  re-tune to `warn`/`info` re-labels rather than silences. `src/cli/gate-registry.test.ts` asserts
  the migrated and un-migrated lists by name.
  - Two related corrections fell out of it: `check tokens` and `check theme` printed a red ✗ for
    findings that are warns by default, under the runner's own `exits 0 — N warn(s)`; and
    `check tokens --strict` (which emits its findings as suspects, a severity its rule table does
    not carry) now marks them as failures again, via a `strict` echo in its report.
  - `check design` no longer prints "No design drift detected." when the drift was found and
    silenced — that sentence would be false, and it is the one line a reader quotes back.

- **Every workspace package's `test` script failed every test it selected.** The suite moved
  from `node:test` to vitest, but only the root script was migrated: all eight packages kept
  `node --test 'src/**/*.test.ts'`, and all 148 test files under `packages/` import from
  `"vitest"`, so `pnpm --filter @mizchi/vlmkit-core test` — the command `CLAUDE.md` documents —
  reported 38 files, 0 pass, 38 fail with "Vitest failed to find the current suite". The root
  `pnpm test` was green throughout, which is how it lasted. Each package now runs
  `pnpm --dir ../.. exec vitest run packages/<pkg>/src` (the idiom its build script already
  uses, so the root `vitest.config.ts` applies), verified across all eight: ai 5, capture 10,
  core 38, generate 3, heal 9, markup 79, mcp 2, plan 2 files, all passing.
  `tests/package-test-scripts.test.mjs` pins the shape.

- **`capture.baseUrl` in `vlmkit.config.json` was read from nowhere.** `routes` is accepted both
  at the top level and inside the `capture` block; `baseUrl` was only ever read at the top level.
  So the config anyone writes — both keys together, under `capture` — took the routes and fell
  back to the default `http://127.0.0.1:4174`, with nothing in the output to say a key had been
  dropped. Measured: with `capture.baseUrl` pointing at `:9999`, every `page.goto` went to
  `:4174`. Both keys resolve through one lookup now, inner-first, and the key lookup is wrapped
  rather than `??`-chained so a present-but-`null` `"routes": null` still fails loudly instead of
  falling through to the top level and being ignored — the same silent drop one level down.

- **The missing-capture-spec error gave an npm-installed user advice that cannot be followed.**
  "Run `pnpm build` (source checkout), or restore `e2e/vlmkit-capture.spec.ts`" — from
  `node_modules` there is no build to run and nothing was lost: the published `files` excludes
  `dist/e2e/**` on purpose, and the `e2e/` sources are not published either. The message now
  tells the two locations apart: an installed copy is told it needs a checkout and told that
  every other command (`check *`, `scan *`, `diff *`, `snapshot`) works without one; a checkout
  is told to `git checkout --` the file. Whether to publish the spec or retire
  `workflow init` / `workflow capture` is still an open packaging decision — what changed is that
  the failure no longer misdescribes it.
  - The candidate list lost `dist/e2e/vlmkit-capture.spec.mjs`. `playwright.config.ts` sets
    `testDir: "./e2e"`, so the built copy is outside collection and selecting it reports
    "No tests found" — the obscure failure this lookup exists to replace. It was reachable only
    when the source spec is absent, which is exactly the state that needs the clear message.
  - `docs/cli-reference.md` documented a `"workflow": { "captureSpec": … }` config key and a
    `--capture-spec <path>` flag. **Neither has ever existed in any version of the code**, and the
    example named `vrt-capture.spec.ts`, a filename nothing has had since the rename. Removed,
    with the absence stated.

- **Five copies of the same rectangle-overlap arithmetic became one.** `overlapArea`
  (`semantic-drilldown`), `intersectionArea` (`region-selector-match`), `rectIntersectionArea`
  (`diff-for-agent`) and `iouOf` twice (`component-bbox`, `page-compose-diff` — byte-identical
  apart from their local variable names), none of them tested. `@mizchi/vlmkit-core/rect-overlap.ts`
  now exports `overlapArea` / `iou`, with the two properties every copy left implicit pinned by
  tests: each axis clamped to 0 *before* the multiply (two negatives multiply to a positive, so a
  box diagonally away from another would otherwise report an overlap), and an empty union
  yielding 0 rather than `NaN` (`NaN > threshold` is false, so such a pair reads as "not similar"
  in some callers and is silently dropped in others). Three sites deliberately keep their own
  copy and are named in the helper's docstring: `copy-check.ts` computes it inside a browser
  script, and `integrity-check.ts` / `font-determinism-probe.ts` need the per-axis overlap
  because they report which axis collided.

- **`scan handlers` printed `status: ok` for six handlers it had never run, and
  `check interactions` claimed to have tested clicks it never fired.** One static set —
  `PROBED_TYPES` = click, keydown, keyup, keypress, focus, blur — decided coverage on every run
  of both gates, so any registered type in it was left out of `unprobed-handler-types`. Two
  measurements say that was false in both directions:
  - `scan handlers` **probes nothing**. It is an inventory; nothing in it presses, focuses or
    clicks. A page whose six handlers were exactly that set reported
    `registrations: 6 across 1 element(s)` and `status: ok`, with no disclosure that none of
    them had been exercised.
  - `check interactions` **never clicks**. Its probe focuses a control and presses the key its
    role activates with — there is no `.click()` in `interaction-map.ts`. The browser turns
    that keypress into a click for a native control and not for a role-only element, which is
    precisely the class `pointer-only-control` exists to find:

    | element | activation key | click fires |
    |---|---|---|
    | `<button>`, `<a href>`, `input[type=submit\|button\|reset]` | Enter | yes |
    | `input[type=checkbox\|radio]`, `<summary>` | Space / Enter | yes |
    | `div[role=button][tabindex=0]` | Enter | **no** |
    | `div[role=checkbox][tabindex=0]` | Space | **no** |
    | `<a>` without href, `input[type=text]`, `<select>`, `<textarea>` | — | no |

  Coverage is now decided per element from what the run actually did. `check interactions`
  passes the evidence from its own interaction map (which elements the tab walk stopped at,
  which ones a key was pressed at); `scan handlers` passes none, and its warn says so in its own
  words — "N handler type(s) registered and NONE exercised … this gate is an inventory and
  presses nothing" — instead of borrowing a sentence written for a run that did probe. The list
  of types also travels as data (`HandlerIssue.types`) rather than only inside the prose, so a
  JSON consumer stops parsing English and a test stops matching the advice instead of the list.

- **`--rule x=off` printed a report that contradicted the verdict.** Suppression happens on
  the normalized finding list, while a gate's prose is rendered from its raw report, so
  `check a11y contrast --rule contrast-below-aa=off` printed `✗ 2 contrast failure(s)` in red,
  exited 0, and noted underneath that both had been suppressed. `scan handlers` with four rules
  off was worse: `status: 5 suspect issue(s)` on the same screen as `exit=0`. The contract has
  had `format(report, rules)` for this, and exactly one of the 27 gates used it. Two fixes,
  because they cover different ground:
  - `scan handlers` and `check interactions` now consult the rule view: a rule set to `off`
    stops being printed and stops being counted, and one re-tuned to another severity prints at
    the severity the project chose rather than in red.
  - For the 25 gates that are still rule-blind, the runner says so — the suppression note now
    adds "The report above was rendered before those settings were applied, so it still lists
    them and its own status line still counts them. The verdict and exit code do not."
    Keyed on `gate.format.length`, the formatter's declared arity, so no gate has to be listed
    anywhere and a gate that migrates loses the disclaimer automatically.

- **A template literal ate `\s`, and every probed drag finding on a normal page vanished.**
  `PROBE_DRAG_SCRIPT` re-derived each element's path to join its rows back to the surface
  entries, with `className.trim().split(/\s+/)[0]`. In a plain template literal `\s` loses its
  backslash, so the browser received `split(/s+/)` — splitting the class list on the letter
  **s**. Any element whose first class, or an ancestor's, contained an `s` got a different path
  from the collector's, the join never matched, and the findings only the probe can produce were
  silently absent. Measured on the drag fixture, whose classes happened to contain no `s`:
  renaming one container class `row` → `rows`, which changes nothing about the page, took the
  run from 1 `dragover-not-prevented` + 3 `dragstart-transfers-nothing` to no findings at all.
  `sortable`, `list`, `cards`, `items` are ordinary class names, so the broken path was the
  normal one. The escape was the symptom and three copies of the same walk was the cause; there
  is now one `DESCRIBE_PATH_FN`, declared `String.raw`, shared by the collector, the probe and
  the TypeScript-side element lookup. `src/util/browser-script-escapes.test.ts` sweeps all 28
  script-shaped template constants for the same mistake.

- **`vlmkit diff-pr` reported PASS on viewports it never compared.** A declared viewport
  with no pinned baseline was skipped with a bare `continue`, and `perVp.some(v => !v.pass)`
  is `false` for an empty array — so the route passed having measured nothing. Measured on
  a two-viewport config with one baseline deleted and that viewport's current render 100%
  different: `home pass a=0.00%` / `PASS` / exit 0, with the second viewport named nowhere.
  With a stray PNG under a renamed label (so the existing empty-directory check is
  satisfied), zero pixels were compared and it still said pass. Unpinned viewports now fail
  the route, get a row each in the markdown so the table accounts for every declared
  viewport, and are reported as "not compared" rather than as a pixel breach — nothing was
  measured, which is a different and worse thing than differing.

- **`file://` was not counted as a URL, so eight commands mangled it.** `isUrlSource`
  tested `/^https?:\/\//`, so a `file://` source took the *path* branch and `resolve()`
  destroyed it — exactly the mangling `resolveSource`'s own comment warns about for
  `http`: `check a11y contrast "file:///repo/fixtures/page.html"` printed `error: file
  not found: /repo/file:/repo/fixtures/page.html`, where the same fixture as a plain path
  inspected 31 elements and found 2 contrast failures. Everything reaching a page through
  `openSource` / `sourceToUrl` carried it (`check a11y contrast` / `touch` / `focus`,
  `check theme`, `stress i18n`, `stress media`, `check tokens`, `check consistency`).
  Eight modules had already hand-rolled `/^(https?|file):\/\//` for themselves and were
  right, which is why the commands that did *not* use the shared helper kept working —
  `check story --gallery "file://$PWD/index.html"`, the recipe in CLAUDE.md, was fine.
  Fixed at the choke point and all eight copies collapsed into it: each call site was
  verbatim `sourceToUrl`, so the collapse is behaviour-preserving and there is now one
  definition to be wrong in.

- **`check interactions --handlers` emitted rules it never declared.** It pushes
  `deriveHandlerIssues`' kinds as findings, and the four handler-surface rules were declared
  only on `scan handlers` — so `--rule pointer-only-control=off` had nothing to bind to on
  that gate, and every `--handlers` run printed
  `check.interactions emitted undeclared rule id(s): unprobed-handler-types`. Found by the
  runner's own check while adding the drag rules, which would have made it worse. Both gates
  now spread one `HANDLER_SURFACE_RULES`, declared beside the `HandlerIssue` kinds it
  describes, so a rule added to the deriver reaches both consumers or neither.

- **Exit 2 was removed from the contract and three leaves kept emitting it, with
  incompatible meanings.** `gate-exit.ts` and `docs/design/gate-plugin-architecture.md`
  settled on two outcomes — "a script branching on exit code 2 must read `counts.warn` from
  `--json` instead" — and `check perf` was migrated off it. The non-gate leaves were missed,
  so exit 2 came to mean "fewer engines than intended" in `diff browsers` and "malformed
  flag value" in `png-diff`, while `skill run` read *any* 2 as "warned". Measured on a skill
  declaring `{"tool": "diff png", "ignore-region": "0,300,640"}`: the terminal printed
  `! diff png exit 2`, the report row read `⚠ 2`, and `skill run` exited 2 — a bad value in
  the skill file, reported as a warning. `skill run` now classifies through one
  `checkStatus`: non-zero from a check that ran is a failure, "did not run" stays its own
  state, and the run answers with the same two outcomes every gate does. `diff browsers`
  exits 1. `png-diff`'s 2 for a usage error is left alone and noted — it is a coherent
  convention on its own, just not this one.

- **`diff browsers --engines chromium` failed the run for doing what it was told.** The
  "no cross-engine comparison performed" branch asked how many engines *worked* and never
  how many were *wanted*, in two places. Measured: `✓ chromium`, no `✗` anywhere, then "Only
  1 engine(s) usable — Install missing engines with playwright install firefox webkit", and
  a non-zero exit. A caller who narrows `--engines` now gets neither the install hint nor a
  failing exit; an under-configured runner missing engines it *did* request still fails,
  which is what `--allow-skipped` opts out of. One `parityShortfall` serves the terminal
  summary and the markdown report, since drifting between those two is how they got here,
  and both wordings still say plainly that no parity comparison happened.

- **`diff elements` printed nine stack frames for a missing flag.** The right sentence
  ("--selectors is required") followed by eight frames through `parseArgs` / `main` /
  `delegate` / `runGroupLeaf` / `runCli` — the one part of the output that cannot help the
  reader. Now a `UsageError` through `handleCliError`, one line, the way `diff-pr` and
  `baseline` were fixed earlier in this release.

- **`<command> --help` exited 1 on seven commands.** `diff html`, `diff browsers`,
  `inspect smoke`, `scan component`, `scan breakpoints`, `watch` and `skill` all printed
  their usage and then exited non-zero, while every gate command exits 0 through the plugin
  runner — `GATE_EXIT_HELP` documents that contract. One CLI, two answers to "did this
  invocation succeed", so a `set -e` script or a CI smoke step running `vlmkit <cmd> --help`
  failed on half the commands. Three mechanisms, and two were *trying* to get it right:
  `if (argv[0] === "--help") argv = []` destroys the evidence that help was asked for one
  line before it is needed (so `skill.ts`'s `process.exit(sub ? 0 : 1)` could never fire —
  `sub` had already been erased); three leaves had no help branch at all, so `--help` fell
  into "no input"; and `runDiscover`'s `if (!file) process.exit(1)` split on whether a file
  came *with* the help rather than on whether help was asked for. All 45 leaves now exit 0.

  The sweep test that should have caught this existed and deliberately excluded the exit
  code, with a docstring explaining that "several leaves print usage and exit 1 when
  `--help` arrives without their positionals, which is fine" — a description of the defect,
  written down as a fact of life. It asserts the exit code now, and covers two populations
  it had been missing: the top-level commands (`watch` and `skill` among them, invisible to
  it entirely) and the one `run:`-based group leaf, which `legacySpecLeaves()` filtered out
  — `scan breakpoints`, one of the seven.

- **`vlmkit workflow init` and `workflow capture` never worked, and the catch hid why.**
  Both failed on every invocation. `catch (e)` discarded `e` and printed a fixed
  "Playwright capture failed. Is the server running?" plus a hardcoded
  `http://127.0.0.1:4174`; measured with four unrelated causes (a `--config` path that does
  not exist, invalid JSON in the config, malformed `VLMKIT_CAPTURE_ROUTES`, and a correct
  config with no server) all four printed those two lines verbatim and none of them was the
  real cause. Behind it, three reasons success was impossible: the spec filename was still
  `vrt-capture.spec.*`, a name nothing has had since the rename (`e2e/vlmkit-capture.spec.ts`
  is the file, and the throw's own message had the right name); `dist/e2e/**` was preferred
  over it while `playwright.config.ts` sets `testDir: "./e2e"`, so the built copy is outside
  collection ("No tests found"); and the spawn inherited the user's project as cwd, where
  `npx` resolves a different `@playwright/test` than the spec imports ("two different
  versions of @playwright/test"). Now runs in `HARNESS_ROOT` — verified end to end from an
  external project against a local server: `init` → `capture` → `verify`, 2 tests collected,
  baselines and snapshots written, exit 0. Config resolution moved ahead of the try so a bad
  config reports as a bad config, and the failure message leads with the real error.

- **`VLMKIT_CAPTURE_ROUTES` was read by nobody.** `buildCaptureEnv` never passed `envRoutes`
  to `resolveCaptureRoutes`, so the variable documented as the highest-precedence route
  source in `vlmkit workflow --help` and in docs/cli-reference.md was silently ignored.
  `capture-config.test.ts` proved the function honoured it by passing it straight in — the
  unit test tested the function, not the feature. Now wired, and when it outranks a typed
  `--config` the run says so instead of quietly not honouring the flag.

- **An unrequested LLM provider ignored the keys you actually had.** `resolveProviderConfig`
  resolved `?? "gemini"` without looking at which keys existed, so a caller that expressed
  no preference got gemini and then a `MISSING_KEY` naming a key it did not need — measured,
  `ANTHROPIC_API_KEY` alone and `OPENROUTER_API_KEY` alone both produced "GEMINI_API_KEY (or
  GOOGLE_AI_API_KEY) is required", while `createLLMProvider` twenty lines down the same file
  returned a working client for both. No user-facing path produced it, because all six
  callers already work around it in four different ways — two byte-identical retry loops
  (`createLLMProvider`, `reasoning-pipeline.ts`) and two byte-identical `resolveDefaultProvider`
  copies (`vlmkit-plan`, `vlmkit-generate`) — which is what made it worth fixing rather than
  leaving: the fifth caller pays. An unrequested provider is now chosen from the keys present,
  gemini first so the documented default still wins whenever a Gemini key exists, and the
  no-key message names all three. An explicit request is still honoured exactly, which is why
  `createLLMProvider`'s deliberate substitution survives unchanged.

- **One malformed `--mask` selector silently disabled every mask after it.** The masks
  went in as a single stylesheet, one `sel { visibility: hidden !important; }` line each,
  and CSS error recovery on a bad selector consumes until it can resynchronize — which
  eats the following rules. Measured in a real browser with `[".a", ".b:not(", ".c"]`: the
  browser kept exactly one rule, `.a`, and both `.b` **and** `.c` were left visible, while
  the CLI printed all three under `Mask: …` as applied. A stray paren of the kind a shell
  quote produces was enough. Now one style tag per selector, and each is validated with
  `querySelectorAll` in the page. Invalid CSS is reported once (page-independent, and a
  user error to fix); "valid but matched nothing" is reported only for a selector that
  matched nothing on *any* page, since a mask may legitimately target a region that exists
  on one route only. Warned rather than failed: unlike the false greens above, an unmasked
  dynamic region makes the diff *fail*, and the verdict stays truthful — it turns quiet
  only if the operator answers by raising the threshold, which is what the warning exists
  to prevent.

- **`diff-pr` reported a clean route when a declared policy crashed.** The media-variants
  and cross-browser blocks each caught their error, logged a warning, and left their
  result `undefined` — and `undefined` reads as "not declared in config", which gates
  nothing: `mvFailed = mediaVariantsResult ? !mediaVariantsResult.pass : false`. Measured
  with `mediaVariants` declared and its output directory blocked by a regular file: the
  route printed `home pass desktop=0.00%`, the run printed `PASS`, exit 0, and
  `summary.md` was byte-identical to a run where the policy had passed. The declared
  policy vanished from the PR comment entirely. Policy errors are now recorded on the
  route, counted in the verdict, named in the terminal line, and given their own markdown
  section. `allowSkipped` already covered a per-engine launch failure; it never covered
  the whole run throwing.

- **`diff-pr`'s `waitFor` timeout was swallowed.** `waitFor` is the route's readiness
  contract, and `.catch(() => {})` made a selector that never matched indistinguishable
  from one that did. Measured on a client-rendered fixture with the selector misspelled:
  `pin` took 12.3s where the correct selector takes 2.1s — ten of those spent silently
  waiting — and wrote a baseline anyway, after which the gate reported `app pass
  desktop=0.00%` / `PASS` / exit 0. It throws now, before the screenshot, so no baseline
  is pinned from a page that never reached its ready state: a poisoned baseline is worse
  than a missing one, because every later run agrees with it.

- **`diff-pr pin` printed a green `ok` and exited 0 having written nothing.** Measured
  with an unreachable URL: `app ok (0/1 viewport(s))`, then "Baselines pinned.", exit 0,
  zero PNGs on disk — the count was right there and the color contradicted it. `cmdPin`
  also returned `void`, so no failure could reach the exit code. It now reports `ok` /
  `partial` / `nothing pinned` by count, names every unwritten baseline, and returns a
  code that `main` carries.

- **A `diff-pr` viewport that never rendered was reported as a 100% pixel breach.** The
  per-viewport catch sets `diffRatio: 1` to force the failure, and with no other marker
  the markdown printed `100.00%` and ranked it under **Worst offenders** at `99.00pp over
  threshold` — on a viewport where `totalPixels` was 0. The run failed either way; the
  reason it gave was false, and it sends a reviewer to look at screenshots for what is a
  config typo. The viewport carries its error now, the table cell says what happened, and
  it is excluded from the offender ranking.

- **`diff-pr post` exited 0 without posting.** With `gh` absent it printed the markdown
  and returned 0 — right at a terminal, where printing for a human to paste is the job
  done, and a false green in CI, where nobody reads stdout and the step going green tells
  the reviewer the summary reached the PR. `CI` now decides: unchanged locally, and under
  `CI` the markdown is still printed but it exits 1 with what it did not do and how to fix
  it. The four existing tests spawned with a plain `{...process.env}`, which carries
  `CI=1` on a GitHub runner — they would have asserted the local behaviour while running
  under the CI one; they now pin `CI` explicitly in both directions.

- **`diff-pr` and `baseline` treated a valueless flag as an omitted one.** Both carried
  their own `getArg`, which returned `undefined` for "flag absent" and "flag present but
  valueless" alike, so `--output` with no value silently fell back to the default
  directory and exited 0 — in CI, `--output "$UNSET_VAR"` writing the artifact where
  nobody looks. Core's `readFlag` already distinguished them; both now use it, and a
  usage error prints as one line instead of a stack trace.

- **A published CLI installed by npm would not have started.** `isCliEntry` compared
  resolved-but-not-realpathed paths, and npm installs every `bin` in this workspace as a
  symlink — so `argv[1]` is `node_modules/.bin/x` while `import.meta.url` is the real
  `dist/cli.mjs`, and the guard returned false. Measured through a symlink: resolve-only
  false, realpath both sides true. `vlmkit-generate` and `vlmkit-plan` had already found
  this and carry their own `realpathSync` guard; they keep it, since they do not depend
  on core.

- **A fourth entry-guard spelling silently disabled four commands on any path with a
  space in it.** `new URL(import.meta.url).pathname === process.argv[1]` compares a
  percent-encoded pathname against a raw path: `/tmp/has%20space/x.mjs` never equals
  `/tmp/has space/x.mjs`. `diff-pr`, `baseline`, `manifest` and `watch` carried it, and
  it is broken on Windows too. All now use `isCliEntry`, and the regression test matches
  this spelling as well.

## 0.10.0 — 2026-08-14

The gates became a plugin architecture. A gate is now a declaration — id,
command, rule table, inputs, and four functions — handed to one core runner
that owns `--help`, `--json`, `--advisory`, the run ledger, the verdict and
the exit code. Every one of the 27 gates goes through it, including the two
that live outside `vlmkit-markup`, and a project can add its own gate with the
same standing as a bundled one. See
[`docs/design/gate-plugin-architecture.md`](docs/design/gate-plugin-architecture.md).

The visible payoff is that the exit-code contract `gate-exit.ts` has documented
all along is now true of every gate rather than of six of them, and that
suppression works per *rule* instead of per whole gate.

### Breaking

- **Eleven command modules no longer run when imported.** `snapshot.ts`,
  `detection-report.ts`, the four `demo/*` scripts and five experiment harnesses
  were bare `main()` functions that called themselves at the bottom of the file,
  so importing one for a type or a helper executed the command. Each now exports a
  named runner (`runSnapshotCli`, `runDetectionReport`, …) and guards its own
  invocation through the new `isCliEntry(import.meta.url, name?)`. Both dispatch
  paths are unchanged — the `vlmkit` dispatcher's env var and direct
  `node src/x.ts` — but a caller that relied on the import side effect must now
  call the exported function.
- **`runSnapshotCli` returns an exit code instead of assigning `process.exitCode`,
  and takes argv and cwd as arguments.** The same shape every gate has. A relative
  `--output` now resolves against the cwd it was given rather than the process's,
  which also fixes an inconsistency: the parser already resolved its *default*
  against that cwd, so an explicit `--output` and the default landed relative to
  different directories.

- **`formatGateVerdict` and `computeLandscapeClampByte` are removed.** The first named
  three consumers in its docstring — `verify markup`, `batch`, MCP — and all three
  build their own verdict instead; a helper whose every named consumer declined it is
  speculative, not shared. The second was a TS wrapper over a markup-core command with
  no caller and no entry in the migration parity harness, so the command and both its
  positional dispatch arms go with it (61 → 60 commands). The MoonBit function stays:
  `landscape_cell_hex` calls it and `core_test.mbt` covers it.

- **`runWorkflowCli` and the three `workflow/spec.ts` commands return an exit code
  instead of calling `process.exit`.** Sixteen `process.exit()` calls lived inside
  those command bodies. `runWorkflowCli` was typed `Promise<void>` while actually
  deciding whether `vlmkit workflow verify` failed, and `runSpecVerify`'s
  exit-1-on-failed-invariant — the whole point of the command — was observable only
  by dying. `runIntrospect`, `runSpecVerify` and `runExpect` now return `number`.
  Exit statuses through the CLI are unchanged.

- **`ExploreOptions.strict` is gone.** It never affected the measurement, only the
  verdict, so the decision moved to `runExploreCli`, which reads the counts the
  report now carries. `--strict` on the command line is unchanged.

- **The gate-authoring argv helpers moved from `@mizchi/vlmkit-markup` to
  `@mizchi/vlmkit-core`.** `firstPositional`, `runOutputDir`, `viewportFlag`,
  `numberList` and five others lived in `vlmkit-markup/src/gates/arg-helpers.ts`;
  they are now `@mizchi/vlmkit-core/plugin`. Every one is pure and imports only
  core, so the old location meant a plugin author took a dependency on the markup
  package to read argv. Import them from the plugin entry; the markup path no
  longer resolves.

- **A gate's prose honours the project's rule settings.** `format` takes an optional
  `RuleView` — one question, `effective(ruleId)` — so a gate that lists findings can
  render what the settings made of them. Before, `--rule low-contrast-text=off` printed
  `3 finding(s) suppressed by rule settings` **and then printed all three anyway**, and
  counted them on the verdict line, because the prose renders from the gate's own report
  while suppression happens on the runner's normalized list. `check integrity` honours it
  now: `off` disappears from both the list and the counts (the suppression count still
  prints, so it is silenced rather than hidden), `info` gets its own tier with its own
  icon instead of reading as a warning, and `suspect` promotes. Optional by design — a
  gate that ignores the argument renders exactly as before, so this is not a migration all
  27 must do at once.
- **`low-contrast-text` reports one finding per colour pair, not per element.** A
  three-row table used to produce three warnings differing only in the row index; three
  CSS colours produced eight lines across two gates. Identity is the colour pair plus
  the applicable floor, because that is the shape of the fix — one CSS declaration. The
  selectors still travel (`evidence.selectors`, and the first few named in the message),
  and the finding's canonical `selector` stays the first element so per-selector tooling
  and `--allow` are unaffected. `invisible-text` stays per element: it is a `fail` at
  that element, not a colour choice to revisit.
- **`check integrity`'s contrast floor now follows the text's size.**
  `low-contrast-text` cut at a flat 3:1, which is WCAG's *large-text* floor
  applied to every piece of text; it is now 4.5:1, or 3:1 for large text
  (>=24px, or >=18.66px at weight 700+). **A page that was `CLEAN` can now
  carry warnings.** The rule stays `warn`, so no gate newly *fails*, and the
  notice added below says a warn was let through. Found because `check
  integrity` and `check a11y contrast` disagreed about the same three elements
  at 3.03:1, with the reference-free gate giving the green. On this repo's own
  `fixtures/css-challenge/page.html` it surfaces three real AA failures.
- **Relative paths in `vlmkit.gates.json` resolve against the config file, not
  the process cwd.** Gate processes run in the config's directory and `source`
  globs expand from the same base, so a `--har`, a `--manifest` or a glob means
  the same thing wherever the command is typed. A config at the repo root is
  unaffected (base and cwd are the same directory); a config in a subdirectory
  changes behaviour, and previously only worked from its own directory.
- **`check a11y *` and `check drift component` default output directories gained
  a per-source subdirectory** (`test-results/a11y-contrast/page-e5562293/`).
  Two pages checked in a row used to share `report.md` *and* `page.png`, so the
  second silently replaced the first. Scripts reading the old fixed path need
  updating, or `--output-dir` pinned.

- **Nine gates now fail on a suspect.** `check motion` and `check animation`
  previously required `--fail-on-suspect`; `check a11y touch`, `check a11y
  focus`, `check drift component`, `check drift pages`, `stress i18n`,
  `stress media` and `scan scroll` had no exit logic at all. They follow the
  documented contract now — a suspect exits 1, `--advisory` prints and exits 0,
  `--fail-on-suspect` is an accepted no-op. `check theme` and `check tokens`
  were migrated the same way but keep exiting 0, because their findings are
  `warn` by default (the design doc explains that split).
- **`check perf` no longer exits 2.** It used exit 2 for a
  `needs-improvement` verdict and 1 for `poor`, under `--strict`. The shared
  contract has two outcomes, so the third state moved into the findings:
  `poor` is a suspect (exit 1) and `needs-improvement` is a warn (exit 0). A
  script branching on exit code 2 should read `counts.warn` from `--json`.
  `--strict` is an accepted no-op, since `poor` now fails by default.
- **`--json` returns one envelope for every gate**:
  `{ gate, command, verdict, counts, findings, suppressed, retuned, report }`.
  A gate's previous JSON is `report`, verbatim — clients reading it need one
  `.report` hop, and in exchange can gate on `verdict` / `counts` without
  knowing which gate produced them. MCP tool results are unchanged.
- **Gate measurement modules are no longer executable.** `node
  path/to/a11y-contrast.ts` did something before and does nothing now; the
  module is measurement code, and `vlmkit check a11y contrast` is the command.
  Library imports (`runA11yContrast` and friends) are unaffected.
- `vlmkit gates` now **fails** on a gate command that does not resolve inside
  `check` / `scan` / `stress` / `verify`, with a did-you-mean. It previously
  ran the command anyway and reported the child process exiting non-zero,
  which read like a page defect rather than a typo.
- `parseCraterSmokeArgs` no longer handles `--help` or returns `json`; the core
  runner owns both.

### Added

- **The test suite runs on vitest, with coverage.** `pnpm test` is `vitest run`;
  `pnpm test:coverage` reports v8 coverage into `test-results/coverage`. The
  migration changed no test's meaning — node:test and vitest agree on
  `describe`/`it`/`test`/`beforeEach`/`afterEach` and the assertions are
  `node:assert/strict` either way — so the same 2662 tests pass in the same
  ~222s. Three mechanical differences: `before`/`after` are `beforeAll`/`afterAll`,
  node:test's default export is `test` and vitest has none, and a per-test
  `context.after` is `onTestFinished`.
- **New tests for the plugin argv toolkit, image resize, the semantic drilldown's
  pure half, `check theme` and `stress media`** — the last two had no test at all,
  and neither is reachable from a pure function: both render the page repeatedly
  under different emulation and compare, so a fixture and a real page load are the
  only instruments. Statements 56.1% → 57.3%.

- **A declared plugin API: `@mizchi/vlmkit-core/plugin` and
  `@mizchi/vlmkit-core/plugin/browser`.** A third-party gate could always exist,
  but the entry point could not be found: an author deep-imported five internal
  files and guessed which counted as public. The first subpath carries exactly
  what the 27 bundled gates import — counted, not chosen — plus
  `PLUGIN_API_VERSION` so a published plugin can refuse a version it was not
  built for. The browser helpers are a second subpath because that is 17x the
  import cost (~25ms vs ~441ms more, before Playwright itself loads), and a gate
  that only reads a file should not pay it. `examples/gate-plugin/` uses those
  two and nothing else, with a test that fails if it ever reaches past them.
- **A declared deterministic layer: `@mizchi/vlmkit-markup/rules`.** Every gate
  is two halves — a `COLLECT_*` string evaluated in a page, and a pure judge over
  the plain-JSON samples it returns — which was the architecture from the start
  and was reachable only by deep-importing whichever file a gate happened to live
  in. 33 judges and 14 collector scripts now have one entry, so a project can run
  a rule from its own driver (Playwright, Puppeteer, CDP, jsdom), test a rule
  against its own fixtures without starting a browser, or reuse one inside a house
  gate. Purity is enforced by a test that inspects `process.moduleLoadList` after
  importing the barrel — verified to fail by injecting a browser import into a
  judge — and no `run*`/`format*` export is allowed in, since either would make
  that check depend on import order.

- **`gates run --json` returns the gates' own structured findings**, as
  `jobs[].gateReport` — verdict, counts and findings per gate — instead of one
  ANSI-escaped string of the child's terminal output. On the adoption scenario
  that is 24 addressable findings across three gates where there was one opaque
  blob. A child that printed prose rather than an envelope (a gate that died in
  navigation) falls back to `unparsedOutput`, so one early failure cannot cost the
  run its JSON.
- **`check a11y touch` and `check a11y contrast` take `--allow
  "<selector>;<reason>"`.** `check integrity` reports the same colours as a *warn*
  and has had a per-selector exemption for a while; `check a11y contrast` reports
  them as a *fail* and had none, so one approved brand grey forced the whole rule
  off — "red CI or contrast off, nothing between". Same three properties as every
  other exemption here: a reason is required, an exempted finding is still listed
  rather than subtracted, and a rule that matched nothing is reported. Three
  exemption parsers already existed, so the `<selector>;<reason>` form now lives in
  one place and `check design` uses it too.
- **`vlmkit gates` refuses a plan whose gates cannot start.** Seven gates declare a
  required flag (`check layout --contract`, `check story --gallery`, `check
  equivalence` declares two); `gates list` validated rule names and not those, so a
  job read as runnable and surfaced as `did not run` only after the browser work.
  Checked against the resolved command line, so a suppression that supplies the
  flag counts.
- **`gates init` scaffolds a `webServer` for a localhost source**, the same
  reasoning that already scaffolds the page-load flags for a URL. The command is a
  placeholder and the output says to replace it: a wrong command that looks
  configured would start something unrelated and gate whatever answered.
- **`scan handlers` reports a page that presents controls and registers no
  handlers at all.** It only ever inventoried elements that already had one, so a
  static document and a page of dead buttons both printed `registrations: 0 across
  0 element(s)` and `status: ok`. The control count is the denominator that was
  missing. The finding names all three explanations — inert controls, handlers it
  cannot attribute, or a page that needs none — because only one is a defect and
  this gate cannot tell which. `warn` by default.
- **`check design` says `NOT JUDGED` instead of `COHERENT` when no role had enough
  instances to judge**, and a role under `--min-instances` renders `not judged`
  rather than `ok`. Found by re-running the dogfood scenarios against the
  `--allow` flag added the day before: allowing 1 of 3 buttons leaves 2, under the
  default floor, so the role stopped being judged — and a skipped role printed
  identically to a coherent one, under a green verdict, with the row itself
  reading `reuse 1x, 2 one-off`. A fix for a false positive had introduced a false
  negative. The arithmetic is unchanged (two instances genuinely cannot clear a 3x
  floor); the silence is what is fixed. When `--allow` is what pushed a role under
  the floor the run says so and names the remedy — **both** `--min-instances 2
  --min-reuse 2`, since lowering the instance floor alone leaves a 2-instance role
  unable to reach 3x. New `nothing-judged` rule (info, so a small page is not a
  defect) makes it enforceable: `--rule nothing-judged=suspect` requires that this
  gate actually measured something. 124 rules across 27 gates.
- **A batch/`gates run` summary names the warns its passing gates found**
  (`24 warn(s) in 3 passing gate(s) — not shown above`) and the untracked paths
  the run created. `gates run` is the path a project adopts, and it reported only
  pass/fail: ten measured findings existed in child-process output nobody kept,
  and the per-gate first-write notice for `.vlmkit/` was invisible there for the
  same reason.
- **`vlmkit.gates.json` takes a `webServer` block** — start a dev server before
  `gates run`, stop it after, including on a thrown error or Ctrl-C. Playwright
  has had this for years and this config did not, so a config declaring URL
  sources still needed a wrapper script doing start / trap kill /
  poll-for-ready, once per CI job. v6's adopting agent got around it with a HAR
  recording and said the HAR was what made it moot. Shaped and named after
  Playwright's on purpose: `command`, `url`, `timeout`, `reuseExistingServer`,
  `cwd`, `env`. Two departures, both deliberate — `url` is **required** (there is
  no `port` alternative) because "started" has to mean "serving" or the first
  gate races the bundler and produces a flake indistinguishable from a finding;
  and a command that exits before the URL answers is reported with its exit code
  rather than after the full timeout, since a timeout is the wrong diagnosis for
  a command that never ran. `reuseExistingServer` defaults to true locally and
  false under CI, as Playwright's does. The server is spawned in its own process
  group and torn down as a group, so `npm run dev` → bundler → watcher does not
  survive as a held port. `vlmkit gates list` names the server without starting
  it, and `vlmkit gates run` never leaves one behind — a leaked server would be
  adopted by the next run via `reuseExistingServer`, silently gating a stale
  build, which is worse than the missing feature was.
- **A `rules` entry can carry `reason`, `owner` and `expires`, and an expired one
  is dropped.** `suppressions` had all three from the start; `rules` — the
  narrow, gate-agnostic instrument, and the one a false positive actually calls
  for — had none. v6's adopting agent: *"`suppressions` have `reason` / `owner` /
  `expires` and an expired one re-fails the build. `rules` has none of that. […]
  So the only mechanism for 'the tool is wrong about this rule' is the one
  mechanism with no audit trail and no expiry."* The long form is
  `{"setting": "warn", "reason": "...", "owner": "...", "expires": "2027-03-31"}`;
  a reason is required in it, and it resolves onto the same shape as a
  suppression, so `vlmkit gates suppressions` enumerates it (tagged `[rule]`),
  `--require-expiry` / `--require-owner` cover it, and past its expiry the
  setting stops being applied and the rule fails again. The short form
  (`"rule": "off"`) stays valid: `--rule` on the command line cannot carry a
  reason, so requiring one everywhere would leave the config unable to express
  what the CLI does. The `//`-prefixed comment key still parses, but a comment
  cannot expire and nothing enumerates it — prefer the long form.
- **`examples/vlmkit.gates.json` no longer recommends a threshold that cannot
  reach the case.** The payment-tiles entry used `--min-reuse 2` to approve
  deliberately per-provider button styling, which — reuse being an average —
  changes nothing on a small role; it is now `check design --allow`. The example
  also demonstrates the long-form `rules` entry at both scopes.
- **The run ledger is a declared output rather than a side effect:
  `--ledger <path>` and `--no-ledger` on every gate.** It has always been
  written to `.vlmkit/run-ledger.jsonl` with no flag, no mention in any output,
  and an env-var-only opt-out, so the only ways to find it were `ls` and reading
  the source. v6's adopting agent found it the first way and wrote the
  `.gitignore` by hand: "adopting the tool dirtied the repo silently." The
  **first** append — the moment the repo changes shape — now says what was
  created, that it is not ignored, what to ignore, and both flags. Subsequent
  appends say nothing, and nothing is printed when the path is already ignored
  or the directory is not a git repo. Implemented at the ledger module rather
  than in the runner, because 14 of the 16 call sites append from inside
  measurement functions and runner-only flags would have missed them.
- **`vlmkit gates init` writes the `.gitignore` entries** (`.vlmkit/`,
  `test-results/`) — the step the adopting agent had to do by hand. It appends
  and only adds what is missing; a `.gitignore` is someone else's file.
- **`check design` says how much of the page its verdict covers.** The old line
  was `skipped: 123 (no inferable role)` and nothing more, which cannot
  distinguish "this page is links and table cells" from "the measurement broke"
  — the reader's actual question. It now prints the fraction
  (`coverage: 18 of 141 visible element(s) carried an inferable role`), the
  skipped elements tallied **by tag** (`no role: a x37, td x21, div x19,
  span x18, ...`), and, only when something was skipped, where a role comes
  from at all: `role="..."` or `button`/`input`/`select`/`textarea`/`h1`-`h6`.
  `div`/`span`/`p`/`a` have none, so a large skip count is normal — the gate
  judges components, not every box, and the way to widen coverage is to add
  `role="..."` where an element *is* a component.
- **`check design --allow "<selector>;<reason>"`** declares one instance's
  deviation deliberate. `--min-reuse` was documented as the lever for this
  (`examples/vlmkit.gates.json` recommends `--min-reuse 2` for approved button
  variants) and cannot reach it: the metric is `instances / distinct styles`, an
  **average**, so a three-element role with one intentional variant sits at 1.5x
  and no threshold clears it short of `--min-reuse 1`, which disables the check.
  An allowed instance leaves the arithmetic before the average is taken, so the
  role's figure reflects the elements still under judgement, and it is still
  reported (`allowed: 1 button instance(s) declared deliberate and left out of
  the reuse figure`) — an exemption a reader cannot see is a blind spot, not a
  decision. Same syntax and same two properties as `check integrity --allow`: a
  reason is required, and a rule that matched nothing is named back
  (`1 --allow rule(s) matched nothing: ...`) rather than widening the blind spot
  in silence. A bare `*` is refused, because that is `--rule component-drift=off`
  without the runner's `re-tuned:` line to show it.
- **`snapshot strip` and `check animation --strip`** composite a numbered
  sequence into ONE still image. A flipbook animates; a strip has to be readable
  pasted into an issue or handed to a model, which sees one image and cannot
  press play. Frames sit top-left in a uniform cell, never centred — a
  `translateX` strip is read by comparing where the element sits, and centring
  would subtract exactly that offset. **Columns are shared instants on the page
  timeline**, not each animation's own 0->1 progress, which is what makes a
  stagger visible instead of reading as "all at once".
- **WebP output for strips**, chosen by the file extension alone
  (`--strip x.webp`). `@jsquash/webp` is an optional peer; lossless beats lossy
  on UI screenshots (24.0 KB vs 55.9 KB at q90), and `sharp` was measured and
  rejected at 29 MB for a still encoder already available.
- **The strip labels itself** — sample times across the top, `selector
  animation-name` above each row — from a 5x7 bitmap font drawn in-repo
  (`bitmap-font.ts`). Identical bytes on every platform, no fontconfig, no web
  font to race a screenshot. A sheet whose rows are identified only in the
  terminal is unreadable the moment it is pasted anywhere else.
- **`snapshot record-har <url>`** produces the recording `--har` replays.
  Defaults to `--wait-until load` rather than `networkidle` (the reason `--har`
  exists is a page with a held-open stream) and settles 1000ms for the late XHR
  a dashboard fires after the milestone. Prints the origins the file covers,
  because a HAR is keyed on the full URL.
- **`check drift component --allow "<property>[@<selector>];<reason>"`** declares
  a style difference deliberate, so a design system's variant stops making the
  gate permanently red. Modelled on `check integrity --allow` down to the two
  properties that keep it reviewable: an exempted delta is still listed, and a
  rule that matched nothing is reported. The unit is a *property*, not a finding
  kind, so a whole-instance exemption cannot hide the geometry mistake sitting
  next to the intentional colour.
- **`--timeout` / `--wait-until` / `--har` on every gate that navigates** — 0.9.1
  gave them to `check integrity` and `check design`; the other 19 URL-accepting
  gates could not be told otherwise, so the only way to gate a page that never
  reaches network idle was a hand-rolled Playwright harness. Declared once in
  `page-load.ts` and spread, with a test asserting **identity** with that
  fragment rather than equal text — a copy that starts out identical is still a
  copy, and that is how two gates came to be missing a hint the fragment gained.
- **`diff png --ignore-region`**: areas that are never measured, as distinct from
  areas whose differences are forgiven.
- **`stale-har-fixture` rule on `check integrity`** (rules 122 -> 123). A request
  a `--har` recording does not hold is aborted, so the page is measured without
  it; that is now reported against the fixture ("this is a stale fixture, not a
  broken page") instead of as the page's broken resources.

- **`vlmkit rules`** lists every gate with its rule count and plugin;
  **`vlmkit rules <gate>`** prints that gate's rules, default severities and
  docs. 125 rules across 27 gates.
- **`component-vrt` skill**, with copyable gallery reference implementations.
  Playwright's docs are explicit that the gallery is framework-specific and yours
  to own with **no template to copy**, which makes it the one part of the setup an
  agent cannot just be told to do. `.claude/skills/component-vrt/assets/` now ships
  it: a zero-dependency vanilla gallery that runs over `file://`, React and Vue
  galleries with `import.meta.glob` story discovery, the host page, a story file
  showing the hidden-form state pattern, the contract as a reference doc, and the
  1.62 CT config preset for projects that also want behavioural specs. Every
  template awaits layout (not just render) and freezes animation, because those are
  the two things that make a component screenshot flake. The vanilla gallery is
  byte-identical to `examples/story-gallery/index.html` and a test enforces that,
  so the installable copy cannot rot while the runnable example stays green.
- **`vlmkit check story`** — VRT scoped to one mounted component, for the repair
  loop where a full-page diff is the wrong instrument. Mounts a story in your
  Playwright component-testing gallery and screenshots only that component:
  measured on `examples/story-gallery/`, 30,448px across three stories against
  1,440,000px for the same count of full-viewport shots (**47x smaller**), and an
  unrelated story stays clean when a shared stylesheet changes. Reports region
  geometry and shift estimates so a ratio becomes an edit.

  It drives the gallery's **page-side contract** (`window.mount({ story, props })`
  / `window.unmount()` into `#root`) through `page.evaluate`, the same way
  Playwright's own `mount` fixture does — so it needs no spec files, no config
  dialect, and no Playwright version bump. The fixture itself is 1.62+; this is
  not, and Playwright stays a peer dependency vlmkit does not force forward.
  Several stories share one browser. `--props`, `--viewport`, `--threshold`,
  `--root`, `--settle`, `--update-baseline`. Runnable example and a React + Vite
  gallery to copy: `examples/story-gallery/`.

  It also reports a `sub-perceptual-drift` warn, which exists because the A/B
  measurement found the gate's one blind spot. A story diff is pixels only, and a
  comparator with a perceptual threshold scores a uniform low-amplitude recolour
  at 0.0%: measured on a hero whose gradient went from a blue tint to a purple
  one, **246,914 of 256,632 pixels differed, by at most 8/255 per channel**, and
  the ratio was zero. `diff html` catches that from its computed-style diff; a
  story diff has no equivalent, so the honest fix is to say what the pixels did.
  The rule keys on **coverage** (≥50% of pixels moved, max delta ≥2), because
  antialiasing moves edges while a recolour moves everything. It is a warn, so the
  comparator still owns the verdict — promote it in `vlmkit.gates.json` if tint
  drift is a regression for your project. This does not make `check story` a
  replacement for a page diff; see
  `docs/reports/2026-08-06-component-vs-page-vrt-signal.md`.
- **`vlmkit build gallery`** — the construction → maintenance handoff, which had
  been a manual checklist. `build component` converges markup toward a target it
  does not yet match; `check story` asks whether an edit broke a component that
  was already correct. Nothing converted one into the other, so a component that
  converged had no protection against the next edit unless someone remembered to
  hand-write a gallery, a story per component and per state, and a threshold.

  Point it at the page that just converged and it derives all of that:
  per-component rendered markup plus the page's CSS captured into a gallery
  implementing `window.mount` / `window.unmount`, `stories.json`, the
  `vlmkit.gates.json` fragment, and the `check story` commands to run.
  Deterministic — no VLM. BEM modifiers become variants of one component rather
  than separate components, and DOM state attributes (`disabled`,
  `aria-expanded`) become their own stories, so "a story per named state" comes
  from the page instead of from memory.

  **Each story gets its own `--threshold`, derived from a pixel budget rather
  than a shared ratio.** A ratio coarsens as area grows: 0.5% of an 88x36 button
  is 16 pixels, 0.5% of a 1216x203 hero is 1,234, so the default that catches a
  button regression misses a corner-radius change on a hero. `--noise-pixels`
  (default 24) is converted per story, clamped between a renderer-noise floor and
  the gate's own default — it will not loosen a gate, only tighten one.

  Discovery **proposes**: it groups by class, which is not the same as finding the
  boundaries a codebase wants, so every candidate carries its evidence (instance
  count, size, what it contains) and rejected ones say why. `--selector`
  (repeatable) overrides it; `--include-all` keeps the rejects. A stylesheet the
  browser will not expose is re-fetched by URL, and one that still cannot be read
  is reported loudly rather than skipped — a gallery missing its CSS produces a
  baseline that looks fine and is wrong.

  Captured markup is frozen, and the generated gallery says so: `props` are
  accepted and ignored, behaviour is not exercised. It answers "did this CSS or
  token edit change how the component looks". Prop- or runtime-state-varying
  stories still want a hand-written gallery — `component-vrt`'s `assets/`.
- **`check_story` and `build_gallery` MCP tools**, so component-scoped VRT is
  reachable from an MCP client and not only from the CLI. `check_story` is a
  `gateTool()` call (`--out` omitted: a per-call baseline directory would silently
  write a fresh baseline instead of comparing against the committed one).
  `build_gallery` is hand-written like `build_page`, because it returns an
  artifact rather than findings — but it still decides `failed`, on the two
  outcomes that leave the caller worse off than before: no stories written, or a
  stylesheet that could not be read. The gates-config fragment travels in the
  structured result so a client does not re-derive per-story thresholds and reach
  for one number for every component.
- **A `Component VRT` CI job** that runs the loop for real: generate a gallery
  from a committed page, write baselines, prove a clean re-run, then break one
  component and require a non-zero exit with no cascade to its neighbours. Both
  assertions are properties of a *different machine* than the one that wrote the
  baselines, which is the only way to know the render is reproducible in CI — and
  a suite that only ever sees passes cannot tell a working gate from one that
  always passes. Keyless and deterministic.
- **`vlmkit bench gates`** — where a ruleset spends its time. Runs every gate that
  works from a bare page (18 of the 26; the set is derived from each gate's
  declared `inputs`, not from a list) and reports cost beside yield: median /
  min / max, the measurement's share of the total, findings, rules fired out of
  rules declared, and ms per finding. Plus an attributed per-rule table and the
  list of rules that never fired. `--category`, `--repeat`, `--gate "<command>"`,
  `--md` / `--json`, `--out`.

  Per-rule cost is **attributed, not isolated**: a gate performs one measurement
  and every rule reads that same report, so rules cannot be timed separately —
  `run` is ~100% of a gate's wall clock and the projection across all 18 gates
  totals under a millisecond. `--probe-suppression` measures the consequence
  rather than asserting it: turning every rule off changes the runtime by 0.4%,
  i.e. nothing, because settings apply to the findings after the measurement.
  Baseline report: `docs/reports/2026-08-06-gate-rule-cost-bench.md`.
- **`--timing`** on every gate splits a run into `parse` / `run` / `findings` /
  `rules` / `format` / `ledger`. Opt-in even under `--json`, so the envelope stays
  byte-stable for equal inputs; `GateOutcome.timing` is always populated for
  in-process callers.
- **Gate categories.** Every gate declares what *kind* of question it answers —
  `correctness`, `behavior`, `design-system`, `verdict`, `infrastructure` — and
  `vlmkit rules` groups by that rather than by CLI verb, because
  `check`/`scan`/`stress` says how a command is spelled while a category says
  what a failure means. Deliberately independent of which plugin a gate ships
  in: a plugin is a unit of distribution, a category a unit of meaning.
- **`vlmkit rules --json`** emits the whole catalog —
  `{ categories, gates: [{ id, command, title, summary, category, plugin, rules }] }`
  — so a job that wants "fail the build if a gate appears un-triaged" reads
  structure instead of scraping the listing. `vlmkit rules <gate> --json` is the
  same shape for one gate.
- **[`docs/authoring-gates.md`](docs/authoring-gates.md)** — the user-facing
  guide to adding your own metric: the contract field by field, choosing
  severities and a category, reading budgets out of `vlmkit.config.json`,
  measuring in a browser, testing, and publishing a plugin.
- **`examples/gate-plugin/` is now a runnable project** with its own
  `vlmkit.config.json`, two fixtures and two gates: `house-gates.ts` (the
  smallest useful gate) and `dom-budget.gate.ts` (the shape a real house metric
  takes — render, measure, compare against budgets that resolve flag > config >
  default, with the source of each number reported). Both are covered by
  `src/cli/plugin-e2e.test.ts` against the real CLI, so a broken example fails a
  test rather than a reader's first attempt.
- **Rule settings.** `--rule <gateId>/<ruleId>=off|suspect|warn|info` re-tunes
  or disables one rule for a run; a `"rules"` block in `vlmkit.gates.json`
  (at `defaults` scope or per page) persists it. References are validated
  against the gate's declared rule table, so a misspelled rule is a config
  error rather than a line that silences nothing — and suppressed findings are
  reported *as suppressed* next to the verdict, so a gate that passes because
  three rules were turned off says so.
- **Custom gates.** `"plugins": ["./tools/house-gates.ts"]` in
  `vlmkit.config.json` loads a module whose default export is
  `definePlugin({ name, gates })`. A plugin gate is indistinguishable from a
  bundled one: same help, same `--json`, same exit contract, same ledger entry,
  same config validation. Worked example in `examples/gate-plugin/`.
- Every gate accepts `--rule`, `--rules`, `--advisory` and `--json`, and writes
  a `.vlmkit/run-ledger.jsonl` entry. Several had one or more of these missing.
- `check integrity` accepts `--advisory`. `check integrity` and `check layout`
  accept `--storage-state` uniformly. The MCP `check_integrity` tool exposes
  `timeout` and `waitUntil`, which the gate always supported.
- Terminal summaries for `check tokens`, `check theme`, `check perf`,
  `check a11y *`, `check drift *`, `stress *` are now exported functions
  (`formatDesignTokensReport` and siblings) instead of `console.log` blocks
  inside the measurement. `TouchReport.required` and `PerfReport.observeMs`
  are on their reports for the same reason.

### Changed

- **A navigation timeout says what it was waiting for.** The whole failure used
  to be `error: page load timed out (Timeout 30000ms exceeded)`. It now names the
  milestone, the still-open requests and how long each has been open, the flags
  that end the wait, and the one that will not help. Instrumented at the launch
  choke point rather than in a navigation helper: there are 42 `.goto(` call
  sites across 20 files and three hand-roll the same options object, so a fix in
  one helper reached a fraction of them.
- **A `--har` origin mismatch is named instead of crashing.** Replaying a
  recording made against one host or port at another aborts even the document
  request, which surfaced as a raw `net::ERR_FAILED` stack. It now reports the
  mismatch, the file, and the origins the file actually contains.
- **`gates run` tells a broken page apart from a broken run**, keyed on the gate's own
  banner rather than on a `verdict:` line — 4 of 12 gates (`check a11y contrast`,
  `check a11y touch`, `check a11y focus`, `check tokens`) print no such line, so the
  first version of this reported a gate that had measured the page and failed as
  `DID NOT RUN`. Four gates that
  all died in navigation used to print `4 FAILED (0 passed)` with no reasons and
  no distinction between "found defects" and "never ran". Now `0 FAILED, 2 DID
  NOT RUN` with the reason inline. The hint under the failure list no longer
  offers `--output <dir>` when `--output` was just passed.
- **`gates init` scaffolds a config that can run against a URL.** A `http(s)`
  source gets `--wait-until load --timeout 15000` on every gate, since a URL
  source implies the class of page that may never reach the default
  `networkidle` milestone — the old scaffold timed out on every gate.
- **`check integrity` no longer prints `CLEAN` over a run with warnings.**
  `verdict: NO DEFECTS, 3 WARN (...) — exits 0; --rule <id>=suspect to gate on
  one`. `report.verdict` keeps its two values; only the printed word gains the
  middle case.
- **Every gate's `--help` says how to persist a flag**: a `"gates"` entry in
  `vlmkit.gates.json` is the whole command, tokenized quote-aware, so any flag
  belongs there and is committed with the page. Only rule settings were
  documented as persistable before.
- **A `//`-prefixed key inside `rules` is a comment**, matching the convention this
  config already uses at the top level (`"//rules"`, `"//suppressions"`). It was
  rejected one level down, which is where a reason matters most: `suppressions` carry
  `reason` / `owner` / `expires`, and `rules` — the mechanism for "the tool is wrong
  about this finding" — carried none, so the justification could not sit next to the
  decision.
- **A live URL says it is unpinned.** A run whose source is `http(s)`, on a gate that
  accepts `--har`, with no `--har` passed, ends with one dim line naming the URL and
  the `record-har` command that pins it. Decidable without running anything twice,
  which is why it states the risk rather than measuring it.
- **A passing run with warnings says so, directly under the verdict**:
  `exits 0 — N warn(s) did not fail this command. To gate on one: --rule
  <id>=suspect`. Silent under `--json`. The runner inserts it after the gate's
  `verdict:` / `status:` line for all 27 gates rather than each gate appending its
  own, and falls back to appending for a gate with no such line. Appending alone
  had proved insufficient: `verdict: DRIFT` with exit 0 was resolved only by the
  last line of the output, below the findings.
- `verify markup` runs the gates it folds into its verdict through the core
  runner, so **a project's rule settings now affect that verdict** — they did
  not before. Its `GateVerdict.gate` is the gate's command (`scan scroll`)
  rather than a bare leaf name, plus a `gateId`, and the kickback names a
  command that can be pasted. The folded-in set is overridable.
- `vlmkit check --help` (and every group's help) is generated from the
  registry, so a gate appears in it by existing.
- `numeric flags reject a flag-shaped value` across all gates:
  `--max-findings --json` was `NaN` before, which failed silently.
- Configuration errors — bad `vlmkit.gates.json`, bad rule reference, a
  `check drift` selector matching too few elements — print one line instead of
  a stack trace.

### Fixed

- **`check animation`, `check motion` and `check scroll` named findings with a selector
  that matched several elements.** Six gates carried a copy of `stableSelector` and
  three had lost its recursive call, so it returned `p:nth-of-type(1)` — the first `<p>`
  of every parent on the page. `check animation` on a page with two animated
  first-children reported three findings on two different elements, all three carrying
  `div:nth-of-type(1)`, which matched both. There is now one `STABLE_SELECTOR_JS`;
  `motion-detect.ts` keeps a copy because it passes a typed arrow to `page.evaluate`,
  and a test holds it in agreement by asserting on gate output. `check breakpoints`
  selectors may now read `div.card` where they read `body > div:nth-of-type(2)` — its
  copy was recursive but had no class branch.

- **`check layout` reported SATISFIED on a contract with an invalid selector.**
  `querySelectorAll` throws on exactly one thing, a selector that is not valid CSS, and
  that throw was swallowed into "matched nothing" — which *satisfies* a `visible: false`
  rule. A three-rule contract whose middle selector was `.modal:not(` reported
  `SATISFIED (3/3)` and exited 0. Invalid selectors are now collected, deduped across
  viewports, reported through a new `invalid-selector` rule, and clear `done` the way
  `redirected` does. A valid selector that matches nothing still satisfies
  `visible: false`, which is the assertion working.

- **`node dist/png-diff.mjs` printed nothing.** Fifteen modules still guarded their
  entry with `process.argv[1]?.endsWith("thing.ts")`, and nine of those tested for a
  `.ts` suffix only — so in the published `dist/` the direct-invocation branch was
  dead. The dispatched path (`vlmkit diff png`) always worked, which is why it went
  unnoticed. The same spelling also cannot tell suffix-sharing files apart:
  `src/vrt/snapshot/snapshot.ts`'s guard matched `src/cli/commands/snapshot.ts` too.
  All fifteen use `isCliEntry(import.meta.url, name)` now, and a test fails on any
  reintroduction.

- **The two CSS-corruption fixes had missed two more copies.** `css-challenge.ts` was
  a fork of `css-challenge-core.ts` carrying five local copies, and `fix-loop.ts`
  hand-rolled its own patcher — where it mattered most, since that is the
  fix-*application* path: a proposed fix for `color` on
  `.card { border-color: red; color: blue; }` rewrote `border-color` and left `color`
  untouched, and the apply-and-rollback gate then blamed the model. Four copies of the
  same two defects across three files; a rename (`removeCssProperty` →
  `removeCssLine`) was enough to hide one from every search.

- **`vlmkit workflow affected` said "(no git changes)" when it could not tell.** git
  failing means the change set is unknown, and reporting an unknown as an empty one
  says nothing is affected — the answer a caller acts on — about a project the command
  never inspected. It now distinguishes "git answered: nothing changed" from "git could
  not answer", returns 1 for the latter, and no longer lets `execSync` dump git's usage
  block to stderr.

- **Two constants that existed to prevent divergence were never used.**
  `GATE_EXIT_HELP` is documented as the shared `--advisory` help line "so every gate
  documents the contract identically", and the runner — its only call site — held a
  byte-identical copy of the string instead. `authStateNotice` was never called, so a
  gate could measure a page behind a login and say nothing about it;
  `VLMKIT_STORAGE_STATE` makes that the easy case, since no flag reaches the command
  line. Gates now print `auth: storage state from …` when a session was actually
  applied — read from `withAuthState` rather than from what was configured, so a gate
  that ignores auth never claims to have used one.

- **`vlmkit skill run` had been failing every check since 0.9.0.** It spawned
  `node --experimental-strip-types src/vrt.ts <tool>`, a path that stopped existing
  when the entry was renamed to `src/cli/vlmkit.ts` — so every check died in Node's
  module resolution, and even before the rename it could only work when the cwd
  happened to be a checkout of this repository. The entry now comes from
  `__VLMKIT_CLI_ENTRY__`, which the dispatcher already records. `KNOWN_TOOLS`, a
  hand-maintained copy of the command table used to *validate*, is gone: it still
  listed the pre-0.9 single-token names, so a skill naming a removed command passed
  validation and then failed at spawn. Those names survive as *aliases* (a skill file
  saying `a11y-contrast` still runs `check a11y contrast`), validation is the CLI's
  own "Unknown command", and multi-token commands spawn correctly. A launch failure
  is no longer rendered as a failing check — the report segregates checks that never
  ran, gives them no exit code, and the run exits 1 rather than 0.

- **Two CSS mutators in the css-challenge experiment could corrupt the sheet.**
  `removeCssProperty` matched a property name mid-token, so
  `.card { border-color: red; color: red; }` became `.card { border- color: red; }` —
  mangling a property the caller never named and leaving the named one in place, which
  puts the corruption in the experiment's ground truth rather than in a crash.
  `applyCssFix` concatenated onto a body with no trailing semicolon (legal CSS),
  producing `.card { color: red padding: 4px; }`. Neither was reachable from the
  current corpus — verified byte-identical output across all 2,391 declarations in the
  ten fixtures — so no recorded bench number changes. `css-challenge.ts`'s
  byte-identical copy of `applyCssFix` is deleted in favour of core's; the semicolon
  bug was in both.

- **`vlmkit inspect interact --help` exited 1.** Help and missing arguments printed
  the same usage and shared an exit code, so asking for help failed in any `&&` chain.

- **`check drift pages` stayed quiet about the worst drift there is.** A route the
  selector is absent from carries `diffRatio: NaN`, and the finding filter read
  `diffRatio > threshold` — false for NaN — so the gate exited 0 while its own
  markdown row said `_(selector missing)_` and its terminal summary printed `n/a`. A
  shared header or footer that vanished from one route was the only case it did not
  report. Now a second rule, `selector-missing` (warn), checked before the pass-line
  comparison; no threshold can express "absent". The ledger headline counts missing
  pages separately from drifting ones.

- **`inspect explore` measured the mouse instead of the handler.** The virtual
  pointer belongs to the page, not the document, so it survived the `setContent`
  that resets state between actions: each action's baseline still carried the hover
  highlight left on whatever element the *previous* action clicked, and the
  un-hover was measured as this action's delta. An inert `<span>` reported 0.28%
  with its changed region sitting on a different element; an inert `<button>`
  reported 0.42% from the pointer merely arriving, so a dead action — the thing the
  gate exists to find — read as alive. The pointer is now placed where it will be
  for the after-shot before the baseline is taken. Both inert elements measure
  exactly 0, and an action that does paint is credited only with what it painted.

- **`inspect explore` and `inspect interact` no longer set the host process's exit
  code from inside the measurement**, and no longer print from it. `runExplore`
  returns `deadActions` / `silentHandlers` / `failedActions`; `runInteract` returns
  `stepFailures`; `formatExploreReport` / `formatInteractReport` own the prose, and
  `runExploreCli` / `runInteractCli` return the code. Terminal output and exit
  status are unchanged.

- **`inspect interact` discarded every failed step.** A step that threw was printed
  once, the healer's suggestions with it, and then dropped — so all a consumer saw
  was a transition with a near-zero delta, which the report's own prose explains as
  "usually a sign the selector didn't match". It had the reason and threw it away.
  `InteractReport.stepFailures` now carries the step index, action, message and
  healer suggestions, and the markdown gains a "Steps that failed" section *above*
  the transitions, since a failed step is the reason a transition is dead.

- **`vlmkit workflow spec-verify` printed git's usage block in a non-git project.**
  `execSync` inherits stderr, so `git diff --name-only HEAD` outside a repository
  dumped forty lines of unrelated help above the verification. The failure was
  already handled; it just could not un-print what git wrote to the terminal.

- **An expected-scrollport contract with an empty `id` produced a blank label.**
  `??` treats `""` as present, so the positional fallback (`expected-1`) was
  unreachable and the report read `1 expected missing` while naming nothing.

- **`check a11y touch` measures identical siblings as separate targets.** Dedupe
  keyed on the generated CSS path, which three `<button>`s in one `<div>` share, so
  a whole toolbar collapsed into one element — and cluster detection, which compares
  each target against the *others*, had nothing left to compare against. Same
  pixels, and the verdict moved with the markup: distinct classes gave
  `inspected 3 | failures 3 | clustered 3`, identical markup gave
  `inspected 1 | failures 1 | clustered 0`. So the most common clustered case, a row
  of identical icon buttons, could never report a cluster. Its `usage` is corrected
  too: clustering annotates a finding and never causes one, the shorter side is what
  is measured, and WCAG's spacing exception is deliberately not applied.
- **One run writes one ledger.** The gate children run with the config's directory
  as their cwd, while the batch process appended to `process.cwd()`, so
  `gates run --config ../proj/...` from a sibling directory produced two ledgers in
  two places, each holding half the run.
- **A rule setting only reaches the gates it names.** Every setting was appended to
  every gate's command line, so `check copy` carried
  `--rule check.a11y.touch/target-undersized=off`, and one typo'd key printed the
  same config error once per gate. An unresolvable key is still passed through
  rather than dropped, because dropping it would turn a config error into a setting
  that quietly does nothing.

- **`page-overflow-x` carries the element it blames**, so
  `--allow "page-overflow-x@table.orders;…"` matches. It printed `caused by:
  table.orders` while leaving `selector` unset, so the only exemption that worked
  was page-wide — which silenced the whole rule, meaning accepting one known
  overflow accepted every future one. Set only where a single element was actually
  blamed; where rigid siblings mean no one element relieves the overflow there is
  nothing honest to put in the field.
- **A `webServer`'s output goes to stderr, not stdout**, so `gates run --json`
  parses. The spawn inherited stdout so a boot failure would reach the terminal —
  it still does, stderr being a terminal too — but stdout is the command's result
  and `--json` is a contract other tools parse.

- **`check animation` was blind to short animations and to finished ones
  entirely.** A `fill: none` animation is deleted from `getAnimations()` when it
  ends, so the gate saw 1 of 5 on a three-card entrance and drew a filmstrip of
  the wrong element. Animations are recorded and held at `animationstart`, with
  the author's own play state captured before the pause so "the page paused this"
  stays distinguishable from "we paused it". The strip's window is derived from
  the rows it actually shows, so neither an infinite spinner nor a *dead*
  animation sets the timebase.
- **`check motion` asserted a rule was absent from CSS it had never read.** A
  linked stylesheet on a `file://` document throws `SecurityError` on `cssRules`;
  that was swallowed and reported as "no `prefers-reduced-motion` found". It now
  re-reads the sheet (disk for `file:`, `page.request` for http(s)) and raises
  `unreadable-stylesheet` when absence is unproven.
- **`check drift component` judged text as drift.** Two instances of one
  component holding different copy differ in pixels and in height, and that is
  not drift; the verdict follows tracked computed style, with the pixel ratio
  kept as context and each row stating its own reason. `--threshold` was also
  doubling as the comparator's per-pixel tolerance, so raising the pass line
  moved the measurement — split into `--threshold` and `--pixel-tolerance`.
- **`check integrity` named the wrong cause for an overflow**, then looked
  exhaustive when it was not. First `130px wide; constraining it removes 46px`
  where the cause was `left: 660px`; now both terms, and no prescription of the
  one that is usually not the fix. It also states what the named cause does
  *not* account for — rigid siblings each measure 0 when probed alone, so a
  439px overflow could be reported with a 77px cause and read as the whole
  story.
- **`check design` said three things it did not mean.** The reuse figure was an
  average printed as a per-style claim, contradicting its own next sentence
  (`each style reused only 1.5x` ... `Dominant style, used 2x`); the style
  fingerprints hid which property actually differed; and `--exclude` appeared
  nowhere in the output that needs it. All three fixed, the last by noticing that
  a dominant style painting no text in a zero-padding, zero-radius, transparent
  box is vendor chrome and can be named as such.
- **`check a11y focus` could only run at one width.** It takes `--viewport WxH`;
  focus order is judged from each stop's x/y, so the width was always part of the
  question.
- **Ten gates measured unstyled markup.** `page.setContent(await readFile(f))`
  leaves the document at `about:blank`, so a `<link rel=stylesheet>` never
  resolves. All ten navigate to the source now.
- **The launch-failure advice pointed at the wrong Playwright** — a generic
  `playwright install` resolves to the consumer's copy, not the one that failed.

- **`check integrity` and `check scroll` wrote two ledger rows per run.** Their
  measurement functions still called `appendRunLedger` themselves after the
  migration gave their gates a `ledger`, so every run double-counted — and for
  `check scroll` both rows carried the same `tool` name, so no summary could tell
  them apart. It also bypassed `VLMKIT_NO_LEDGER` and the runner's
  `ledger: false`, which is how `verify markup` keeps its folded-in gates out of
  the ledger. The runner is the only owner now; `check-integrity`'s entry keeps
  the `fails` / `warns` split the removed row carried.
- **Value-taking flags placed before the positional could steal the source.**
  `vlmkit check equivalence --target t.png --region 0,0,10x10 attempt.html`
  parsed `t.png` as the attempt and compared the target with itself, and
  `vlmkit check copy --vlm <model> page.html` tried to open the model id as the
  page. `firstPositional` only skips the flags it is told about, and the migration
  from the hand-written parsers dropped `--target`, `--out` and `--vlm`. `--vlm`
  is optionally-valued so it needs `withoutOptionalValue`, which follows
  `vlmFlag`'s own rule — the two cannot disagree about which token is the model.
- **Two CI jobs were running commands that no longer exist.** The `compare` job
  invoked `vlmkit compare`, removed in 0.9.1 in favour of `vlmkit diff html`, so
  it failed with "Unknown command" and uploaded an empty artifact — which reads
  like a broken fixture rather than a stale workflow. The `smoke-test` job
  invoked `vlmkit smoke` (now `vlmkit inspect smoke`) and, because that step ends
  in `|| true`, reported success while running nothing. `tests/workflow-commands.test.mjs`
  now resolves every `vlmkit` command the workflows invoke against the real
  dispatcher, so a rename fails a five-second test instead of a fifteen-minute
  browser job — or instead of nothing.
- The `compare` job now installs the MoonBit toolchain. `diff html` classifies
  diff regions through `markup-core`, which is loaded at runtime and is not
  produced by the `:js` build, so the job would have died on
  `spawnSync moon ENOENT` immediately after the command name was fixed.
- The `vrt-compare` report artifact points at `diff-report.json`. 0.9.1 removed
  the `migration-report.json` duplicate but the workflow still asked for it.
- `vlmkit inspect smoke` with no target printed
  `Usage: node src/smoke-runner.ts …` — a module path that has not been runnable
  since the dispatcher took over. It prints the command now.
- `pnpm sync:skills` exposes the skill-package sync that already existed as a
  script, and the drift assertions in `tests/skill-package.test.mjs` name it.
  The failure was a 10 KB buffer diff with no hint that a generator owns those
  files, which invites hand-editing one of the three copies.
- `check breakpoints` no longer calls `process.exit(1)`, which could truncate
  its own buffered output.
- A stale legacy dispatch entry for `check tokens` shadowed the gate; combined
  with the module no longer being executable, the command silently did nothing.
  `src/cli/gate-registry.test.ts` now asserts the composed registry so a
  shadowed or dropped gate fails a test rather than a user's run.

## 0.9.1 — 2026-08-04

This release makes vlmkit easier to adopt in existing frontend repositories:
the installed skill selects the relevant workflow, browser-backed gates work
with long-lived and replayed network traffic, and Playwright is shared with
the consumer instead of duplicated. The project site now demonstrates the
same screenshot-to-implementation and verification loop that vlmkit provides.

### Breaking

- Removed the deprecated top-level CLI aliases and workflow aliases. Use the
  canonical grouped commands such as `vlmkit diff png`, `vlmkit check theme`,
  and `vlmkit workflow capture`.
- Removed `vlmkit diff region`; use deterministic `diff png --elements-html`,
  `check integrity`, and `check equivalence` signals instead.
- Removed deprecated public APIs (`checkA11yTree`,
  `evaluateDomEquivalence`, and `deriveComponentContractRuntime`) and the
  ignored `minOverlapRatio` option.
- Removed legacy `.vrt/`, `vrt.config.*`, and `VRT_*` discovery. Project state,
  configuration, and environment variables now use only `.vlmkit/`,
  `vlmkit.config.*`, and `VLMKIT_*`.
- Migration tooling now reads and writes only `diff-report.json`; the
  `migration-report.json` duplicate and fallback are gone.

### Changed

- `vlmkit -h` is now a compact command index. Detailed subcommands, options,
  and examples live under `vlmkit <command> --help`.
- The GitHub Pages introduction now leads with `apm install` and `npx skills`,
  shows real target, implementation, and diff artifacts, and presents the
  VLM-assisted implementation and deterministic browser checks as one loop.

### Added

- `check integrity` and `check design` accept `--timeout`, `--wait-until`, and
  `--har`. Long-polling pages can be measured after `domcontentloaded` or
  `load`, while HAR replay makes third-party data deterministic and aborts
  unrecorded requests.
- `check design --exclude <selector>` removes vendor-owned subtrees before
  component-reuse and spacing measurement. Repeatable exclusions report their
  root match counts, total omitted elements, and stale selectors that matched
  nothing.

### Fixed

- `check a11y contrast` now exits with status 1 when it reports WCAG contrast
  failures, so CI cannot silently pass an inaccessible page.
- The Pages dogfood workflow installs the MoonBit toolchain required by the
  contrast gate instead of failing before it can evaluate the page.
- The distributed `spec-to-playwright` seed template no longer has a filename
  collected by consumer Vitest/Jest defaults; it is copied from
  `seed.spec.template.ts` to `tests/seed.spec.ts` only when the workflow is
  adopted.
- Public vlmkit packages reuse the consumer's Playwright through a required
  `>=1.61 <2` peer instead of installing an independently resolved browser
  build; the root package also accepts `@playwright/test` as an optional peer.
  Missing-browser errors name the resolved version and invoke its exact CLI
  path.

## 0.9.0 — 2026-08-02

The theme of this release is gates that were confidently wrong. Nine of
them reported a defect in the page — or reported nothing at all — when
the real problem was that they had measured the wrong document: an
unstyled one, a login page, a pre-render placeholder. Each fix carries a
differential regression test, because none of these were visible in a
single run; every one needed two runs and a comparison.

### Breaking

- **A suspect finding now fails the command by default.** `check copy`,
  `check asset`, `scan scroll`, `check scroll`, and `check breakpoints`
  previously printed their suspects and exited 0 unless you passed
  `--fail-on-suspect`, while `check integrity`, `check layout`,
  `verify flow`, `verify markup`, `check interactions`, and
  `scan handlers` already exited non-zero — two commands in the same
  `scan` group disagreed. Every gate now shares one contract: a suspect
  exits 1, a warn never affects the exit code, and `--advisory` opts back
  into print-and-succeed for gates being piloted before they gate CI.
  `--fail-on-suspect` is still accepted as a no-op, so existing scripts
  keep working. **If you relied on a gate exiting 0 while reporting
  defects, add `--advisory`.**
- **A malformed `verify flow` file is now a usage error.** An unknown
  assert name used to be reported as an unmet post-condition
  (`FAIL (unknown assert)`), and an unknown action was worse: the step
  performed nothing, had no post-conditions to fail, and the run returned
  `done: true`. Both are now rejected before a browser opens, naming the
  offending step and listing the valid names. An empty `steps` array is
  rejected too. **A flow that was silently passing on a typo'd action
  will now error — that flow was never verifying anything.**

### Added

- `check design` — coherence of the design system a page implies, with no
  reference: spacing-scale and type-scale concentration, palette size,
  and component-signature reuse. The `scale-outlier` rule is `info`, not
  `warn`, because the study behind it showed spacing concentration
  overlaps between designed and generated pages.
- `vlmkit batch` — run gates over many pages with bounded concurrency,
  stride sharding for CI matrices, and exit-code-as-verdict. Per-job logs
  are named by a full-path slug plus a hash, so two pages with the same
  basename cannot overwrite each other's output.
- `vlmkit gates` + `vlmkit.gates.json` — one reviewed config for which
  gates run against which pages, with `gates list | run | suppressions`.
  A suppression must carry a reason, may carry an owner and an expiry,
  and stops applying once expired. An empty gate list is a parse error
  rather than a run that silently does nothing.
- `check integrity --allow "<kind>[@<selector>][@<viewport>];<reason>"` —
  accept an intentional pattern without editing the markup. A reason is
  required, an unknown kind is an error listing the valid ones, exempted
  findings stay in the report under `exempted`, and a rule that matched
  nothing is reported so dead config gets deleted. Four kinds
  (`js-error`, `degenerate-render`, `unstyled-page`, `redirected`) can
  never be exempted — they mean the page is broken or unmeasurable.
- `--json` on `check a11y contrast | touch | focus` and `stress i18n`.
  These were the gates without it, and their console output caps its list,
  so the full finding set had no machine-readable route out.
- URL support on `check a11y contrast | touch | focus` and `check design`
  — they previously accepted only local files.
- Authenticated pages: `--storage-state <file>` on URL-capable gates, or
  `VLMKIT_STORAGE_STATE=<file>` for all of them at once, accepting the
  Playwright storage-state file that `playwright codegen --save-storage`
  and `context.storageState()` produce. Validated eagerly — a missing,
  malformed, or empty state throws with a capture hint rather than
  silently measuring an unauthenticated page.

### Fixed

- **Six gates were measuring an unstyled document.** They loaded local
  HTML with `setContent(readFile(...))`, which gives the page an
  `about:blank` base URL, so every relative `<link rel=stylesheet>`,
  `<img>` and webfont silently failed to resolve. `check a11y contrast`
  reported 0 failures where the same CSS inlined reported 1; worse,
  `check a11y touch` *inverted* — an unstyled control keeps its intrinsic
  size, so a CSS-shrunk tap target measured as passing. All six now
  navigate to the file URL. (Injecting a `<base href>` was tried and does
  not work: an opaque origin blocks `file://` subresources.)
- **Five more gates reported success for a login page.** `check
  breakpoints`, `check scroll` and `scan scroll` returned `status: ok`
  for a route that 302s to `/login`, while `check layout` and
  `verify flow` failed against the sign-in page and blamed the markup.
  All five now report the redirect. The hint also stopped claiming
  "vlmkit cannot inject a session", which had been false since
  `--storage-state` landed.
- **Six gates were reading the pre-render DOM.** `verify flow` reported
  `count .card expected 2, measured 0` on a page where `check layout`
  measured 2 at the same instant; `build page` screenshotted a candidate
  at 5.3% of its settled ink, so every component came back missing; and
  `scan contract` returned zero landmarks for a built SPA opened as a
  file. Playwright actions auto-wait, but `page.evaluate`,
  `page.screenshot` and `getBoundingClientRect` do not — and that is how
  every gate measures.
- `check integrity` findings were attributed to whichever viewport the
  caller happened to list first, so `--allow "…@1280"` was silently
  order-dependent and a page-wide defect could read as mobile-only. The
  sweep is now sorted widest-first and records every width a finding was
  seen at, which also makes "breaks at 1280/768 but not 375" expressible
  for the first time.
- `check a11y contrast | touch | focus` printed a headline count and then
  five rows with no indication the list was cut — twelve findings looked
  like five. The cap is now disclosed and `--json` carries every row.
  `stress i18n` capped at six rows and is now disclosed too.
- `--json` on those four gates prints **only** JSON. It was added in this
  cycle and shipped emitting the human block first, so `JSON.parse` threw
  on line 1 — while the truncation notice pointed the reader at exactly
  that stream. Found by running the built CLI during release prep; the
  original check had read `report.failures.length` from the run function,
  which never touches stdout.
- The four gates above no longer print `vrt` in their headers, usage
  lines, or fix instructions. There is no `vrt` binary and the old
  subcommand names are deprecated, so a fix instruction reading
  "Re-run `vrt a11y-contrast`" was wrong twice over.
- `check integrity` text-collision false positives: collisions are
  compared on measured ink bands rather than line boxes, text inside a
  closed `<details>` is not a collision candidate, and character-level
  grazes are reported by ink-overlap fraction. An 8-page × 3-viewport A/B
  against the previous revision found **0 new collisions and 16
  disappeared** — every one a pre-existing false positive the old
  area-ratio gate had been masking (MDN 14, from closed-`<details>`
  content that keeps its layout boxes; APG 2, from an element paired with
  its own inline descendant).
- `check integrity` no longer treats an invisible overlay as an occluder —
  found while running the gate against a real authenticated app.
- `verify markup` scored low-contrast fills as clean instead of detecting
  them.
- Numeric CLI flags are validated in one place, which fixed five bugs
  that had each been hand-rolled independently — including a `NaN`
  concurrency that made the worker pool silently run nothing and return
  holes, and `--min-reuse 2` printing `drift` next to a `COHERENT`
  verdict. `--gate "check a11y contrast"` no longer splits on the space.
- Gates no longer report on a page they did not measure: a redirect away
  from the requested URL (typically a login wall) is reported instead of
  silently measured, which previously produced `verdict: CLEAN` for a
  protected page that never rendered.
- `check interactions` and `scan handlers` waited only for `load`, so on
  client-rendered apps they inventoried the pre-render DOM — reporting
  `interactive elements: 0` and `status: ok` on a page with real controls
  and a pointer-only `<div>`. Both now settle before measuring.
- Horizontal-overflow kickbacks name the element actually at fault. The
  culprit is measured (neutralize its width, re-read `scrollWidth`)
  rather than ranked by right edge, which in grid/flex shells promoted
  stretched ancestors over the rigid child causing the overflow.
- `check copy` sees text inside open shadow roots, so component-library
  copy is no longer reported missing; hidden shadow copy is still
  classified by reason (e.g. `zero-size`).
- `check integrity` waits for `document.fonts.ready`, and detects text
  occluded by `pointer-events: none` overlays.
- `snapshot` and `scan breakpoints` now append to the run ledger.
- `unprobed-handler-types` counts only element-specific handlers, so a
  framework delegation root no longer lists ~80 event types as findings.

### Known issues

- **Other commands still print `vrt` in their output.** The four gates
  above were fixed because they were already in the release diff; a full
  sweep found roughly 250 occurrences across ~80 distinct phrases in
  user-facing strings (`vrt snapshot`, `vrt workflow`, `vrt diff-pr`,
  `vrt baseline` …). Most need only the binary name changed, but some
  refer to commands that no longer exist at all (`vrt compare`,
  `vrt elements`, `vrt smoke`) and some are prose. Deliberately left for
  its own change rather than folded into a release commit — a fix
  instruction you cannot paste is a real defect, and it deserves a diff
  someone can review.
## 0.8.1 — 2026-08-01

### Packaging hotfix

- Publish compiled JavaScript and declarations for every public workspace
  package instead of exposing raw TypeScript to Node.js consumers.
- Preserve the existing deep-import contract, fix the `vlmkit-plan` and
  `vlmkit-generate` executable targets, and include the generated MoonBit
  runtime required by `@mizchi/vlmkit-markup`.
- Add a clean-install smoke test that packs and exercises all seven public
  workspace packages before release.

## 0.8.0 — 2026-08-01

### Verified markup workflow

- Add contract-driven page scaffolding and deterministic `build page` /
  `verify markup` loops, including breakpoint, scroll, animation, copy,
  integrity, layout, and visual-equivalence checks.
- Add mock-image mode, stronger region pairing and presence analysis,
  attributed kickback diagnostics, and guarded Stage-2 auto-fix support.
- Harden markup verification against hidden text, occlusion, clipping,
  overflow, interaction regressions, and intentional-pattern false positives.

### Interaction verification and MCP

- Add accessibility event-state maps, handler-surface checks, and verified
  browser flows whose actions must satisfy explicit DOM post-conditions.
- Expose the deterministic verification surface through the bundled
  `vlmkit mcp` server while keeping the workspace MCP package internal.

### Packaging and reliability

- Bundle internal runtime packages into the root CLI and add a packed,
  clean-install markup-loop smoke test.
- Improve cold-start behavior, selector-heal calibration, package license
  coverage, and OpenRouter model selection.

## 0.7.0 — 2026-07-01

### Markup loop

- Add `vlmkit markup-loop init|observe|doctor|run` for drop-in
  real markup work: scaffold loop files, observe a live page with
  Playwright, check readiness, then run planner + generator + VRT gates.
- Add a reproducible local example under `examples/markup-loop-project/`
  that runs `init`, `observe`, `doctor`, and `run --dry-run` without an
  LLM API key.
- Ship `@mizchi/vlmkit-plan`, `@mizchi/vlmkit-generate`, and
  `@mizchi/vlmkit-heal` as runtime dependencies of the root package so
  installed agents can run the loop from a consuming project.

### Playwright generation

- Add planner and generator contracts for turning UI observations into
  gated Playwright smoke tests.
- Add guardrail context and VRT handoff summaries so generated tests can
  be evaluated and repaired without weakening the original scenario.

### A/B validation series (control vs vlmkit, external repo)

First controlled evaluation of the product claim "vlmkit makes a
coding agent better at visual repair": three runs on
`startbootstrap-agency` with a bare-handed control arm. Result: cost
parity once v1's friction was fixed, and a repair-quality edge for
vlmkit in v3 (3/5 vs 2/5 mutations, screenshot-free localization) via
the deterministic signal layer. The VLM `diff region` path was
net-negative in every run. Reports:
`docs/reports/2026-06-06-ab-external-synthesis.md` (+ v1/v2/v3).
Each fix below cites the agent complaint it answers
(`docs/issues-drafts/01-12`, 7 still open).

### `diff png`

- Reports baseline/current image dimensions and Δheight (a reflow
  indicator) in text and `--json` output. (draft 03)
- Per-region translation estimates: `shift: {dx, dy, confidence}` via
  mean-subtracted NCC of luminance profiles; semantic classifier
  reports "Content translated by (+36, +0) px" instead of
  `element-added` with meaningless identical color samples. (draft 04)
- `--elements-html <url>` / `--elements-json <path>` /
  `--elements-viewport <WxH>`: deterministic DOM hit-test attaches a
  `selectorCandidate` (selector, confidence, coverage) to every diff
  region — no VLM, no API key. (draft 07)
- Identical-hex color samples are omitted from descriptions; a
  measured in-place recolor is no longer masked by the wide-band
  "layout shift" shape hint.

### `diff region`

- Auto-downscales images so no edge exceeds `--max-image-edge`
  (default 7500; Anthropic rejects >8000px) and maps VLM bboxes back
  to original pixel coordinates. Fixes the crash on full-page mobile
  captures. (draft 01)
- `--max-tokens` default 600 → 1500; truncated responses
  (finish_reason=length or mid-JSON cut) retry once with doubled
  tokens. (draft 02)

### Internal

- `estimateRegionShift` in `@mizchi/vlmkit-core/region-shift.ts`.
- Region-bbox → DOM-selector matcher extracted to
  `@mizchi/vlmkit-markup/region-selector-match.ts` (shared by
  `diff png` and `vlm-region-diff`).
- `readPngDimensions` exported from `@mizchi/vlmkit-core/image-resize.ts`.
- A/B harness under `fixtures/ab-external/harness/` (seeded block
  deletion + value mutation `--mutate N [--subtle]`, deterministic
  capture, fixed scorer).

## 0.6.0 — 2026-05-19 (rebrand: vrt → vlmkit)

The project scope had grown well beyond visual regression. Markup
synthesis from screenshots, design-token / theme / a11y / i18n
audits, and a 2-stage VLM + LLM CSS auto-repair loop now account for
the majority of the surface. Rebrand the umbrella to **vlmkit**;
visual regression becomes one of several offered features.

### Breaking — package + CLI rename

| Old | New |
|---|---|
| GitHub repo `mizchi/vrt` | `mizchi/vlmkit` (auto-redirect in place) |
| `@mizchi/vrt` (root) | `@mizchi/vlmkit` |
| `@mizchi/vrt-core` | `@mizchi/vlmkit-core` |
| `@mizchi/vrt-capture` | `@mizchi/vlmkit-capture` |
| `@mizchi/vrt-ai` | `@mizchi/vlmkit-ai` |
| `@mizchi/vrt-markup` | `@mizchi/vlmkit-markup` |
| CLI binary `vrt` | `vlmkit` |
| `dist/vrt.mjs` | `dist/vlmkit.mjs` |
| Deprecation prefix `[vrt deprecated]` | `[vlmkit deprecated]` |

The `vrt verb …` CLI form is no longer supported as a binary
shortcut — type `vlmkit verb …` instead. (Inside the `vlmkit` CLI
the deprecation shims from 0.5.0 still work, e.g. `vlmkit png-diff
--help` forwards to `vlmkit diff png`.)

### Repository structure

`@mizchi/vrt@0.5.0` on npm is now deprecated. The current package
under that name is `@mizchi/vlmkit`. A future minor version will
carve out `packages/vrt/` as a leaf package containing the VRT-
specific subset (`snapshot`, `diff html`, regression-watch,
`diff-pr`, `baseline`, `watch`); see Phase 2 plan in the repo.

### State files preserved

The `.vrt/` state directory name is unchanged — existing users'
`.vrt/last-diff-for-agent.json` continues to work.

### Verified

- 776 tests / 11 dist smoke probes pass on the new structure.
- `vlmkit diff html` against `fixtures/element-compare/` runs
  end-to-end.
- All cross-package imports resolve under the new `@mizchi/vlmkit-*`
  scope.

---

## 0.5.0 — 2026-05-19 (first public release)

The internal 0.4.x history is preserved in commits; npm publication
starts here. Two work streams since `0.4.0` rolled up under this
release: the **0.5.0 CLI restructure + dispatcher rewrite** (this
section) and the prior **design-md / markup-assistance** sections
below.

### CLI restructure — verb groups

Every command now lives under a verb group. Single-token names from
0.4.x remain as deprecation shims that print a one-line hint and
forward.

| Old | New |
|---|---|
| `vrt compare` | `vrt diff html` |
| `vrt png-diff` | `vrt diff png` |
| `vrt elements` | `vrt diff elements` |
| `vrt cross-browser` | `vrt diff browsers` |
| `vrt diff-for-agent` | `vrt diff agent` |
| `vrt compare-runs` | `vrt diff runs` |
| `vrt a11y-{contrast,touch,focus-order}` | `vrt check a11y {contrast,touch,focus}` |
| `vrt design-tokens` | `vrt check tokens` |
| `vrt theme-parity` | `vrt check theme` |
| `vrt perf` | `vrt check perf` |
| `vrt {component,multi-page}-consistency` | `vrt check drift {component,pages}` |
| `vrt interact` / `vrt explore` / `vrt smoke` | `vrt inspect {interact,explore,smoke}` |
| `vrt i18n-stress` / `vrt media-variants` | `vrt stress {i18n,media}` |
| `vrt component-extract` | `vrt scan component` |
| `vrt component-from-image` | `vrt build component` |
| `vrt flipbook` | `vrt snapshot flipbook` |
| `vrt migration {compare,blind,subagent}` | unchanged (already grouped) |
| `vrt snapshot`, `vrt workflow`, `vrt manifest`, `vrt watch`, `vrt diff-pr`, `vrt baseline` | unchanged |

### Dispatcher rewrite for bundled `dist/vrt.mjs`

`src/cli/cli.ts` previously routed leaves via
`import.meta.resolve(<source-relative-path>)`, which only worked from
the source tree. The bundled binary failed with
`ERR_MODULE_NOT_FOUND` on every leaf. Rewritten in this release:

- SPECS is a `{ name, loader }` map where `loader` is a
  `() => import("literal-path")` closure. tsdown statically discovers
  the import and code-splits each leaf into a chunk under `dist/`.
- A per-leaf signal (`__VRT_DISPATCHER_LEAF__=<name>`) replaces the
  earlier `process.argv` swap. Each leaf's CLI-entry guard checks the
  env var against its *own* name, so cross-leaf static imports
  (e.g. `diff-pr.ts` ↔ `media-variants.ts` for shared types) don't
  accidentally fire a sibling's `main()`.
- `scripts/smoke-dist.sh` runs strict by default and gates every
  documented subcommand.

### Workspace packages published

`@mizchi/vrt-core`, `@mizchi/vrt-capture`, `@mizchi/vrt-ai`, and
`@mizchi/vrt-markup` all 0.5.0. Each ships raw `.ts` via the `exports`
map — consumers need Node 24+ with `--experimental-strip-types`, or a
bundler that resolves `.ts` extensions. The packages expose both a
curated barrel and deep per-module exports (e.g.
`@mizchi/vrt-core/png-diff.ts`).

### Agent skills (APM-distributable)

Five skill packs at `.claude/skills/`:

- `vrt-visual-diff` — `vrt diff html` → `vrt diff agent` workflow.
- `vrt-migration-eval` — `vrt migration compare|blind|subagent`.
- `vrt-markup-synth` — five DOM/pixel-based signal tools (no VLM).
- `vrt-regression-watch` — stateful `--previous` / `--persist-summary`.
- `vrt-css-fix-loop` — VLM + LLM 2-stage repair loop.

Install via `apm install mizchi/vrt/.claude/skills/<name>` (or pin to
`@v0.5.0`).

### Diff-report filename

`vrt diff html` / `vrt migration compare` now write both
`diff-report.json` (canonical, prefer this) and
`migration-report.json` (legacy alias, byte-identical). Pinning the
canonical name lets the legacy alias be removed in a future major.

### Repo / task-runner

Migrated from `justfile` to `Taskfile.pkl` (pkfire). Doc snippets
across the repo and CLAUDE.md now read `pkf run <task>`. Tasks that
take positional flags carry `acceptsArgs = true`; tasks with named
params use the `--<param> <value>` syntax.

---

## 0.5.0 — design-md scenario branch (2026-05-15)

A single branch of work — `claude/design-md-scenario-2026-05-15` —
turning vrt from a single-shot diff tool into a complete UI-regression
workflow. Driven by 9 closed-loop subagent runs (a → i) against a
DESIGN.md → HTML/CSS reproduction scenario; each run surfaced
friction, each friction got closed in code.

### Headlines

- **18 GitHub issues filed and closed** (#22 – #36, plus 3 drafts
  shipped as `vrt manifest` / `vrt watch` / `vrt diff-pr`).
- **38 commits, 183 tests across 32 suites.**
- Closed-loop floor moved from **10.3% mobile** (agent-a, original
  vrt) to **0.2% mobile** (agent-d, post-fix) on a 5-round budget;
  3-round budget reached **3.45% mobile** (agent-f).
- 4 a11y gate layers + 2 quality-extension gates added to the CI
  surface, all with manifest suppression.

### New top-level CLIs

| Command | Purpose |
|---|---|
| `vrt manifest add/list/rm/check` | Author the approval manifest. Per-rule kinds: `visual` (default), `a11y-contrast`, `a11y-touch`, `a11y-focus-order`, `a11y-semantic`, `media-variant`, `cross-browser`. `--from-run <output-dir>` synthesizes rules from a recent compare's wireframe-fix candidates. |
| `vrt watch <baseline> <variant>` | File-watcher inner-loop with round-vs-round delta (newly-introduced / resolved / persisted suggestions + zero-crossing detection). |
| `vrt diff-pr {pin,verify,post}` | CI gate. Per-route diff against pinned baselines; per-viewport thresholds; optional a11y + media-variants + cross-browser gates. |
| `vrt baseline {pin,verify,post,list,rm}` | Canonical alias over `vrt diff-pr` with two extra utilities (`list` / `rm`) for inspecting baseline state. |

### Wireframe fix suggestions (new "what to edit" layer)

When DOM correspondence is missing, vrt's compare now emits actionable
fix candidates with a layered scope hierarchy:

```
STRUCTURAL  >  REFLOW  >  HIGH-IMPACT  >  DIVERGENT  >  MAG-DIVERGENT  >  SUBSET  >  (all)
```

- `[STRUCTURAL]` — 3+ child suggestions share a parent path with
  heterogeneous deltas; names the specific parent layout-strategy
  mismatch (e.g. `display: flex (now) → grid (target)`); flags
  conflicting child margins that will compound with the new gap.
- `[REFLOW]` — one viewport's magnitude is ≥ 3× others; suggestion
  steers toward typography upstream rather than spacing tokens.
- `[HIGH-IMPACT]` — one suggestion's magnitude dominates the set
  (≥ 12px AND ≥ 1.5× the next-largest).
- `[DIVERGENT]` — opposite-sign deltas across viewports; needs a
  media query.
- `[MAG-DIVERGENT]` — same sign but materially different magnitudes;
  suggestion includes predictive overshoot ("applying 40px globally
  would overshoot mobile by 16px").
- `[SUBSET]` — observation covers only some viewports.

Plus per-suggestion annotations:

- `current → target` notation on candidate CSS rules — agent reads
  arrow left-to-right matching the natural edit direction.
- `[cascades to siblings]` on box-size-mutating candidates.
- `⚠ component height differs intrinsically` when bbox heights
  themselves differ.
- `⚠ N suggestions converge on .selector` (same-selector cumulative
  overshoot).
- `⚠ cross-edit: A + B all cascade-affect` (multi-selector cascade).

### CI gate layers (`vrt diff-pr`)

- **Visual diff**: per-route per-viewport pixel ratio against pinned
  baseline; per-route threshold overrides.
- **a11y gate**: contrast (WCAG 2.1) / touch-target size / focus-
  order (Tab cycling) / semantic (heading hierarchy / form-label /
  image-alt). Findings demoted by manifest rules.
- **Media-variants gate**: forced-colors / reduced-motion / print /
  rtl / zoom-200. Suspect / warn verdict counts gate.
- **Cross-browser gate**: chromium / firefox / webkit. Auto-skip on
  CI runners that don't have all three.

All gates emit a unified markdown `summary.md` suitable for
`gh pr comment --body-file`.

### Cross-round signals

- `vrt compare --against-previous <output-dir>`: emits per-viewport
  diff% change, newly-introduced / resolved suggestions, and
  zero-crossing detection (a component flipped sign → damp ~50%).
- `vrt watch` emits the same delta on every save event.

### Render correctness

- `vrt compare` file-mode no longer produces a false 0% PASS when
  the same `<link>` href fails to resolve on both sides (#22 — the
  bug that bit the first two agents in round 1).
- Render-sanity warnings (font 404, stylesheet 404) promoted to a
  red banner at the top; variant side now probed alongside baseline.
- Symmetric failures downgrade to a single dimmed line so diff
  numbers stay readable.

### Triptych output

Every per-viewport compare now emits a `<route>-<viewport>-triptych.png`
with `BASELINE | VARIANT | HEATMAP` panels labeled in color.

### DESIGN.md token integration

Pass `--tokens <path>` to `vrt compare` and hex pairs in the palette
diff back-resolve to token names; bbox magnitudes snap to the
nearest declared spacing token.

### Issues closed

| # | Title | Severity |
|---|---|---|
| #22 | False 0% PASS in `vrt compare` file-mode (3 stacked bugs) | critical |
| #23 | Token-aware fix candidates in wireframe mode | major |
| #24 | `BASELINE / VARIANT / HEATMAP` triptych PNG per viewport | minor |
| #25 | Default-on computed-style + DOM-position diff | major |
| #26 | Reverse hex → DESIGN.md token lookup | major |
| #27 | Render-sanity banner + variant probe | major |
| #28 | `migration-report.json` state-leak (duplicate of #22) | minor |
| #29 | Viewport scope tags (DIVERGENT / SUBSET) | major |
| #30 | Wireframe suggestions name candidate CSS selector | major |
| #31 | MAG-DIVERGENT classification | minor |
| #32 | Symmetric sanity banner downgrade | minor |
| #33 | Text-reflow detection (REFLOW scope) | major |
| #34 | Cross-suggestion overshoot aggregation | major |
| #35 | STRUCTURAL parent layout-strategy detail | minor |
| #36 | Cross-edit interaction warning (multi-selector cascade) | minor |

Plus three drafts shipped as new CLIs (`vrt manifest` / `vrt watch` /
`vrt diff-pr`).

### Reports

Detailed analysis of each validation run is under
`docs/reports/2026-05-15-design-md-scenario-v{1..9}.md`. Each
report quotes the agent's friction verbatim and records what was
fixed in response.

## 0.5.0 — Markup-assistance toolkit (2026-05-13)

A new suite of commands focused on the LLM-agent markup-authoring loop:
build from screenshot, verify a11y / theme / i18n / cross-browser
regressions, enforce design-system scales. The full scenario coverage
matrix is at `docs/reports/2026-05-13-scenario-matrix.md`; the
capability survey at `docs/reports/2026-05-13-capability-survey.md`.

### New commands

- `vrt component-from-image <target.png> <current.html>` — build a
  component from a target screenshot, iterate until pixel diff is
  low. Surfaces structured signals: bbox matches with IoU, heatmap
  region clusters with dominant fill + content-kind classification,
  text-row Δy with per-gap spacing-fix table, typography hints
  (estimated font-size / weight bucket), palette diff with
  near-neighbor distance, dominant background colors, and a
  multi-state pass (`--states hover focus-visible …`) that surfaces
  `suspect` / `_subtle_` / `ua-likely` / `direction?` flags. Optional
  `--device-scale-factor` for retina target captures.

- `vrt theme-parity <html>` — render under
  `prefers-color-scheme: light` and `dark`, flag components whose
  fill is identical across themes (hard-coded colors that defeat
  the theme switch).

- `vrt media-variants <html>` — render under five user-preference
  variants in one pass: `forced-colors`, `reduced-motion`, `print`,
  `rtl`, `zoom-200`. Each gets a heuristic verdict combining pixel
  delta with stylesheet-text static analysis (catches missing
  `@media (prefers-reduced-motion: reduce)`, `forced-color-adjust:
  none` opt-outs, physical-property usage that breaks RTL).

- `vrt cross-browser <html|url>` — render in Chromium, Firefox,
  WebKit. Engines not installed in the local Playwright cache
  auto-skip with `npx playwright install` hints.

- `vrt i18n-stress <html>` — inflate every text node by a factor
  (default 1.4× ≈ German), detect horizontal overflow / wrap / parent
  bounds violations. Dedupes ancestor reports.

- `vrt design-tokens <html|url>` — scale-conformance for
  `border-radius`, `padding`, `margin`, `z-index`, `box-shadow`.
  Configurable scales via CLI flags or JSON config. Per-violation
  report with nearest in-scale replacement.

- `vrt a11y-contrast <html>` — walks every visible text node,
  computes WCAG AA contrast ratio (4.5:1 normal, 3:1 large text),
  surfaces failures with foreground/background hex pairs.

- `vrt a11y-touch <html|url>` — interactive elements below
  44×44 (`--level AAA`) or 24×24 (`--level AA`) flagged with
  cluster-spacing check.

- `vrt a11y-focus-order <html|url>` — drives Tab through the page,
  detects visual-order mismatches (reverse / trap / skip-row).

- `vrt multi-page-consistency --selector <sel> --urls ... | --files ...` —
  drift check: same component across N pages.

- `vrt component-consistency <html> --selector <sel>` — drift check:
  N instances of selector on one page (catches inline-vs-component
  leak after refactors).

- `vrt interact <html|url> --sequence <path.json>` — scripted
  Playwright action sequence (snapshot / click / hover / focus /
  blur / press / type / fill / select / scroll / wait /
  waitForSelector). Per-transition pixel diff + heatmap regions.
  Per-row "dead" flag for actions that produced no visible change
  (selector miss or no-op detection).

- `vrt perf <html|url>` — Web-Vitals visual-stability check via
  in-page PerformanceObserver. Captures CLS / LCP / FCP / TTFB in
  ~3s without a Lighthouse dependency. CLS-source attribution
  surfaces the specific element triggering layout shift; LCP-element
  identity points at the largest contentful node. For full Web
  Vitals (TBT, INP, bundle size) defer to Lighthouse / PageSpeed.

### Infrastructure

- All new CLIs registered under the unified `vrt` dispatcher
  (`src/cli/vrt.ts` + `src/cli/router.ts`). Fixed a long-standing
  dispatcher bug where `process.argv[1]` was a relative path,
  silently breaking each module's `isCliEntry` check in dev mode.
- Smoke test (`scripts/smoke-all-clis.sh`) — runs every
  markup-assistance CLI on its fixture, asserts exit 0 + expected
  output. 15/15 PASS at HEAD.
- New fixtures under `fixtures/` for every command, each engineered
  to exercise a specific bug class:
  - `wireframe/pricing-card/` (component-from-image)
  - `multi-state/hover-button/` (multi-state)
  - `multi-page/footer-drift/` (multi-page-consistency)
  - `component-consistency/inline-leak/` (component-consistency)
  - `theme-parity/card-with-bug/` (theme-parity)
  - `i18n-stress/button-overflow/` (i18n-stress)
  - `media-variants/card/` friendly + hostile (media-variants)
  - `design-tokens/off-scale/` (design-tokens)
  - `a11y-contrast/low-contrast/`, `a11y-touch/small-targets/`,
    `a11y-focus-order/reversed/`, `typography/wrong-size-weight/`,
    `interact/dropdown-form/`

### Reports for review

- `docs/reports/2026-05-13-capability-survey.md` — what the toolkit
  can and can't do, ROI-ranked next directions.
- `docs/reports/2026-05-13-scenario-matrix.md` — 97 markup-flow
  scenarios × coverage status (currently 44 ✅ / 32 🟡 / 10 ❌ / 11 ⚪
  = 89% useful coverage).
- `docs/reports/2026-05-13-comprehensive-dogfood.md` — subagent
  evaluation of the integrated toolkit; identified 3 follow-up
  improvements (all shipped).

## 0.4.0 — Prior releases

(See git history for changes before this entry was added.)
