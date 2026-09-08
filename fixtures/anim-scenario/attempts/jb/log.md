# log: modules-adapters-still (attempt jb)

## Round 1

Wrote `scene.json` in one pass from the brief + `## kind: modules` /
`## Annotations` sections of `docs/anim-ir.md`, mapping each of the five
brief points directly to a documented field:

- adapters implement the port → `deps` entries `postgres->port`,
  `memory->port` with `"style": "implements"`.
- memory is a test double, visually secondary → `"tone": "muted"` on the
  `memory` module.
- postgres/memory substitutable → one-beat `sequence`:
  `{"relate": {"from": "postgres", "to": "memory", "style": "equals",
  "label": "substitutable"}}`.
- app→port is the rule the eye should land on → `"tone": "accent"` on that
  `deps` entry.
- domain→postgres forbidden → `deps` entry `{"from": "domain", "to":
  "postgres", "style": "forbidden", "label": "forbidden"}`.

Ran:

```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/jb/scene.json \
  --expect fixtures/anim-scenario/briefs/facts/modules-adapters-still.expect.json
✓ scene.json (modules): 0 error(s), 0 warning(s)
  1260ms · 3 steps (2 captioned) · 27 nodes · 3 tracks / 6 keyframes · annotations: 2 drawn, 2 on screen at the end
  scene 777 B → timeline 4920 B (×6.3)
  facts modules-adapters-still.expect.json: 7 module(s) · 7 dependencies · 1 forbidden · 1 highlighted · 3 group(s) — all as drawn

pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/jb/scene.json
0 of 3 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

Both green, 0 ✗ / 0 ⚠, on the first attempt. No changes needed. Rendered
`figure.svg` via `still` and read it back (raw SVG, not a screenshot):

- Point 1 (implements): edges `postgres->port` and `memory->port` render
  with `stroke-dasharray="6 4"` and `marker-end="url(#arrow-hollow-...)"`
  (hollow triangular head) — visibly distinct from the solid arrows.
- Point 2 (test double, secondary): the `memory` box and its label render
  in `stroke="#9ca3af"` / `fill="#9ca3af"` (grey) vs. `postgres`'s black
  `#1f2328` outline and text.
- Point 3 (substitutable): two parallel horizontal lines (`relate-main-0`,
  `relate-main-0-2`) between `postgres` and `memory` with the label
  "substitutable" underneath, haloed for legibility.
- Point 4 (the rule to land on): `app->port` renders in amber
  (`stroke="#f59e0b"`), the only dependency in that colour among the plain
  black ones — it stands out on sight, and the `check --expect` run
  confirms it is exactly the edge marked `highlighted`.
- Point 5 (forbidden): `domain->postgres` renders in red
  (`stroke="#ef4444"`), dashed, labelled "forbidden", running against the
  layer flow without bending anything else.

Stopping here — success criterion met in round 1, budget not needed further.

---

## Summary

1. **First `check --expect` result**: 0 ✗, 0 ⚠, on the first attempt (no
   second run needed). All five fact-sheet categories matched exactly: "7
   module(s) · 7 dependencies · 1 forbidden · 1 highlighted · 3 group(s) —
   all as drawn." `layout` was also 0/0/0/0 on the first run.
2. **Rounds used**: 1 of 5 — scene written once from the guide, checked
   green immediately.
3. **The five points**:
   - implements: `deps[].style: "implements"` — guide names it explicitly
     ("dashed with a hollow head, the way UML draws a realisation") and
     even shows the exact `domain`/`postgres` pairing from this brief in
     its worked example.
   - test double / secondary: `modules[].tone: "muted"` — guide says
     directly "greys a test double... module."
   - substitutable: `sequence: [{"relate": {..., "style": "equals",
     "label": "substitutable"}}]` — copied near-verbatim from the guide's
     own example line, which happens to use `postgres`/`memory` as its
     illustration.
   - eye should land here: `deps[].tone: "accent"` — guide states this
     "colours the arrow and its label" and separately that `check --expect`
     treats `tone: accent` as satisfying `highlighted`.
   - forbidden: `deps[].style: "forbidden"` + `label` — guide's own example
     line is `{"from": "domain", "to": "postgres", "style": "forbidden",
     "label": "never"}`, i.e. this exact edge.
   All five were guide-confirmed, none guessed.
4. **Friction**: essentially none this round — the guide's worked examples
   for `modules` use the same module names (`domain`, `postgres`) as this
   brief's forbidden edge, and the `relate`/`equals`/"substitutable" example
   uses `postgres`/`memory` too, so the brief maps onto the doc's own
   illustrations almost one-to-one. The only mild ambiguity: the guide
   doesn't spell out whether `tone: accent` on a `deps` long-form entry
   needs `"style": "arrow"` stated explicitly or whether omitting `style`
   (default `arrow`) is fine when only `tone` is set — I omitted `style` and
   it worked, but the doc doesn't say so directly; I inferred it from
   "`style` (default `arrow`)" documented elsewhere in the same table.
5. **Hand-typed values**: zero coordinates, zero colours, zero canvas size —
   all positions, the amber/red/grey palette, and the canvas dimensions in
   `figure.svg` are the tool's automatic layout and default theme. Nothing
   in the brief needed animation to express; everything (implements,
   muted, substitutable, accent, forbidden) is a still-figure vocabulary
   item and rendered correctly with `still` on the first try.
