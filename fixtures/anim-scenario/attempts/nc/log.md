# Log — modules-nested-still

## 1. What I read

- `fixtures/anim-scenario/briefs/modules-nested-still.md` (the brief)
- `fixtures/anim-scenario/briefs/facts/modules-nested-still.expect.json` (the fact sheet)
- `docs/anim-ir.md` — the full writing guide, in particular: the "Common to
  every scene" section, `## kind: modules` (fields `modules`, `deps`, `groups`,
  `layout`, `sequence`, and the paragraph on layer assignment / group
  banding), `## Still figures`, `## Checking a figure against the facts`
  (the `--expect` field table), and `## Annotations` (not used here, but read
  to know what was available).
- CLI output of:
  - `pnpm exec vlmkit-anim --help`
  - `pnpm exec vlmkit-anim schema --kind modules`

I did not open anything under `packages/vlmkit-anim/`, any other
`fixtures/anim-scenario/attempts/*` directory, `docs/reports/`,
`CHANGELOG.md`, or any test file, and did not grep the repo for examples.

## 2. Rounds

### Round 1

Wrote `scene.json` (see final file; unchanged from this first draft — no
edits were needed across rounds). Nesting was expressed with the `groups`
field's `"parent"` key, documented in `docs/anim-ir.md` under `## kind:
modules`:

> `parent` nests one container inside another: `"parent": "backend"` on
> `services` and `core` draws them inside `backend`, whose box wraps theirs
> with room for their labels, and the layout keeps each inner group's
> modules together.

So the guide told me directly how to do it — I used
`{"id": "services", ..., "parent": "platform"}` and
`{"id": "kernel", ..., "parent": "platform"}`, with `platform` itself a
plain top-level group holding only `["api"]`.

Command:

```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/nc/scene.json --expect fixtures/anim-scenario/briefs/facts/modules-nested-still.expect.json
```

Full output:

```
✓ scene.json (modules): 0 error(s), 0 warning(s)
  560ms · 2 steps (1 captioned) · 35 nodes · 0 tracks / 0 keyframes
  scene 790 B (minified) → timeline 5617 B (×7.1)
  facts modules-nested-still.expect.json: 10 module(s) · 13 dependencies · 5 group(s) — all as drawn
  next: vlmkit-anim explain fixtures/anim-scenario/attempts/nc/scene.json · vlmkit-anim render fixtures/anim-scenario/attempts/nc/scene.json --step N · vlmkit-anim html fixtures/anim-scenario/attempts/nc/scene.json --out page.html
```

Reported lines, quoted, and what they meant (no ✗ or ⚠ appeared, so there
was nothing to change):

- `"✓ scene.json (modules): 0 error(s), 0 warning(s)"` — clean on the first
  try; no edit made.
- `"facts modules-nested-still.expect.json: 10 module(s) · 13 dependencies ·
  5 group(s) — all as drawn"` — confirms my 10 modules, 13 deps and 5 groups
  match the fact sheet's `modules`, `deps` and `groups` maps exactly (the
  fact sheet's `groups.platform` is `["api"]` only, which is what my
  `platform` group's own `modules` list holds — `services` and `kernel`'s
  members are separate groups, not `platform`'s, which is exactly what
  "own members" in the brief meant).

I then ran the other two required checks, still round 1, no edits triggered
by either:

```
pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/nc/scene.json
```
```
0 of 2 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

```
pnpm exec vlmkit-anim still fixtures/anim-scenario/attempts/nc/scene.json --out fixtures/anim-scenario/attempts/nc/figure.svg
```
```
still t=560 → fixtures/anim-scenario/attempts/nc/figure.svg
```

Since `check --expect` exited 0 with no ✗/⚠, `layout` reported no issue, and
`figure.svg` was rendered, the brief's success condition held at round 1.
No further rounds were needed.

## 3. The brief's specific questions

**How did I express the nesting, and did the guide tell me how?** With
`groups[].parent`: `services` and `kernel` both carry `"parent": "platform"`;
`platform`, `apps` and `infra` have no `parent` (top-level). Yes — the guide
states this exactly, in the `parent` bullet of `## kind: modules` quoted
above. One gap: `pnpm exec vlmkit-anim schema --kind modules` (the other
document I was allowed to read) does **not** mention `parent` at all — its
`groups` line reads only `[ {"id", "label", "modules": [ids]} ]  containers;
a module is in at most one; ids are anchors and highlight targets`. Had I
read only the CLI schema and not `docs/anim-ir.md`, I would have had no way
to express nesting.

**What did I look at in `figure.svg` to confirm the boxes nest?** The three
group `<rect>` elements' `transform="translate(cx cy)"` plus their own
`x/y/width/height` (which are offsets from that translate, so absolute
bounds are `cx + x` … `cx + x + width` and likewise for y). Quoting the
geometry:

```
platform: transform="translate(459.2 412.5)" rect x="-339.2" y="-203.7" width="678.4" height="407.4"
  → abs x: [120.0, 798.4]   abs y: [208.8, 616.2]

services: transform="translate(459.2 413)"   rect x="-315.2" y="-40.2" width="630.4" height="80.4"
  → abs x: [144.0, 774.4]   abs y: [372.8, 453.2]

kernel:   transform="translate(467.1 552)"   rect x="-264.5" y="-40.2" width="529"   height="80.4"
  → abs x: [202.6, 731.6]   abs y: [511.8, 592.2]

api (module box): transform="translate(455 281)" rect x="-23.8" y="-18.2" width="47.6" height="36.4"
  → abs x: [431.2, 478.8]   abs y: [262.8, 299.2]
```

- `services` bounds `[144.0, 774.4] x [372.8, 453.2]` lie entirely inside
  `platform` bounds `[120.0, 798.4] x [208.8, 616.2]` — nested. ✓
- `kernel` bounds `[202.6, 731.6] x [511.8, 592.2]` lie entirely inside
  `platform` bounds — nested. ✓
- `api` bounds `[431.2, 478.8] x [262.8, 299.2]` lie inside `platform`'s
  bounds (both x and y ranges fall within `platform`'s), but its y-range
  `[262.8, 299.2]` does **not** overlap `services`' y-range
  `[372.8, 453.2]` nor `kernel`'s y-range `[511.8, 592.2]` — so `api` is
  inside `platform` but outside both `services` and `kernel`, exactly as
  the brief's success condition requires.

I also read the label `<g>` elements' `text-anchor` / position (e.g.
`platform-label` at `(130, 220.8)`, near `platform`'s own top-left corner)
just to sanity-check each label sits at its own container's edge rather than
a child's, though the brief didn't ask this explicitly.

**Every coordinate / colour / canvas size typed by hand:** none. I wrote no
`canvas`, no `pos`, no `fill`/`stroke`/hex colour, and no explicit `x`/`y`
anywhere in `scene.json` — every field is an id, a dependency pair, or a
group membership/parent relationship. All coordinates, the canvas size
(`1220x637` per the SVG `viewBox`/`width`/`height`), box sizes and colours
(`#9ca3af` group outlines, `#1f2328` module strokes/text/arrows,
`#ffffff` fills) in `figure.svg` were generated by the layout engine and the
default theme — I never touched them.

**Anything I wanted and could not express:** nothing. The brief only asked
for modules, one level of dependency arrows, and two-level container
nesting, and `modules` + `groups[].parent` covered all of it without
needing `sequence` or any annotation op (which the still-figure section of
the guide confirms is optional: "`check` does not warn about a missing
`sequence` on `modules`").

## 4. Friction

- The CLI's own `schema --kind modules` output — one of the two references
  I was permitted besides the guide — silently omits the `parent` field on
  `groups` that the prose guide documents and that this task required. An
  agent that (reasonably) trusted the terser, machine-generated schema over
  the prose guide, or that only had time to run `schema` and skim, would
  have had no way to discover nesting exists. I would add `parent` to the
  `groups` line of the `schema --kind modules` output (and to
  `schema --kind expect`, if group nesting is ever meant to be
  distinguishable in facts) so the quick reference matches the full guide.
- The fact sheet's `groups` map (`{"id": ["member", …]}`) has no field for a
  group's parent, and the guide's own `## Checking a figure against the
  facts` table doesn't mention nesting at all in the `groups` row ("each
  container holds exactly these members"). I inferred — correctly, per this
  round's clean pass — that the fact sheet only ever needed to state each
  group's *own* direct members (which is what the brief also says:
  "fixes ... each container's own members"), and that nesting itself is
  asserted only by reading the rendered SVG, not by the fact sheet. That
  inference happened to be right, but the guide never states it; a
  one-line note next to the `groups` fact-sheet field ("nesting itself is
  not checked by `--expect`; confirm it by geometry, e.g. `still` +
  reading the SVG rects") would have saved the small amount of doubt I had
  before writing this log's geometry section.
- Nothing else was unclear. The `modules`/`deps`/`groups` field table in
  `## kind: modules`, the worked example immediately under it, and the
  `parent` bullet were sufficient to write a correct scene on the first
  attempt with no iteration.
