# Log — graph-roads-facts (writer `la`)

Only source read: `docs/anim-ir.md` plus `vlmkit-anim schema --kind graph`,
`--kind expect`, and `--help`. Commands run as `pnpm exec vlmkit-anim …` from
repo root.

## Producing the visit order

The brief says: don't hand-copy the visit order into ops unless the guide
leaves no other way. It doesn't leave no other way — `kind: graph` takes
`algorithm: "dijkstra"`, `start`, `goal` and generates the walk itself. Before
writing anything I hand-ran Dijkstra on the given road map to sanity-check
what the tool would produce against the fact sheet:

```
dist S=0
visit S -> A=2, B=5
visit A(2) -> B=min(5,2+2)=4, C=8
visit B(4) -> C=min(8,4+1)=5, D=9
visit C(5) -> T=7
visit T(7) -> D=min(9,7+1)=8
visit D(8)
order: S, A, B, C, T, D   labels: S0 A2 B4 C5 T7 D8   path: S-A-B-C-T (=7)
```

That matches `facts/graph-roads-facts.expect.json` exactly (`visited`,
`labels`, `path`). So the whole scene is:

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "graph",
  "title": "Shortest route S → T",
  "nodes": ["S", "A", "D", "C", "B", "T"],
  "edges": [
    { "from": "S", "to": "A", "weight": 2 },
    { "from": "S", "to": "B", "weight": 5 },
    { "from": "A", "to": "B", "weight": 2 },
    { "from": "A", "to": "C", "weight": 6 },
    { "from": "B", "to": "C", "weight": 1 },
    { "from": "B", "to": "D", "weight": 5 },
    { "from": "C", "to": "T", "weight": 2 },
    { "from": "D", "to": "T", "weight": 1 }
  ],
  "algorithm": "dijkstra",
  "start": "S",
  "goal": "T"
}
```

**No `ops` were hand-written at all.** `visited`, `path` and `labels` all
come from the algorithm, not from typing the order in. The only field I
tuned across rounds was `nodes` — the order of the six ids, which the
default `circle` layout uses to place them around the ring (see Rounds 2–4).

**Hand-typed coordinates / colours / canvas sizes: 0.** No `pos`, no `theme`,
no `canvas`. The only thing I hand-picked was the *order* of six ids in an
array — ids, not numbers or coordinates.

`scene.json` is **572 bytes**.

## Round 1 — first attempt, default (circle) layout, brief's node order

`nodes: ["S","A","B","C","D","T"]`, no `layout` field (defaults to `circle`).

First-attempt counts: **0 ✗, 2 ⚠** (both from `check --expect`; `layout`
repeats the same two problems, plus counts every frame they persist in).

`vlmkit-anim check scene.json --expect facts/graph-roads-facts.expect.json`:
```
⚠ nodes(label-A): "∞" has a line through it (edge-2, 14px) at step 2 (360ms) and 16 later step(s)
    → an edge runs through a box that is not one of its ends — reorder the modules in that layer, put the two in one group, or shorten the label so the layout has room
⚠ nodes(label-T): "∞" has a line through it (edge-7, 14px) at step 2 (360ms) and 16 later step(s)
    → an edge runs through a box that is not one of its ends — reorder the modules in that layer, put the two in one group, or shorten the label so the layout has room
✓ scene.json (graph): 0 error(s), 2 warning(s)
  10200ms · 18 steps (17 captioned) · 30 nodes · 33 tracks / 139 keyframes
  scene 434 B (minified) → timeline 12972 B (×29.9)
  facts graph-roads-facts.expect.json: 6 nodes · 8 edges · 6 visits · 5 path nodes · 6 labels — all as drawn
  next: vlmkit-anim explain … · vlmkit-anim render … --step N · vlmkit-anim html … --out page.html
```

`vlmkit-anim layout scene.json` (exit 1):
```
frame 2 · step 2 · 360ms — Every node starts at distance ∞; S is 0
  crossed  "∞" has a line through it — 14px inside the text (label-A × edge-2)
  crossed  "∞" has a line through it — 14px inside the text (label-T × edge-7)
[... same two crossings repeat through frame 18, the label text updating (∞ → 2 → 7 as the algorithm relaxes them) but always label-A×edge-2 and label-T×edge-7 ...]
17 of 18 frames with layout issues · 0 overlap(s) · 0 clipped · 34 crossed
```

**What each sheet/warning line told me, and whether it was actionable:** the
`check --expect` summary line (`facts … all as drawn`) told me the semantics
were already correct — nodes, edges, visits, path, labels all matched
before I touched layout at all. That was useful and immediately actionable:
it meant every remaining round was purely a geometry problem, not a
correctness one, so I never had to touch `edges`/`algorithm`/`start`/`goal`
again. The `layout` `crossed` lines named the exact anchor pair
(`label-A × edge-2`) and gave a → hint ("reorder... or shorten the label") —
actionable in spirit, but the hint's own wording ("reorder the modules in
that layer") is written for `modules`/`diagram`, not `graph` — there is no
"layer" concept for a `circle`-layout graph, so I had to guess that
"reorder" meant reordering the `nodes` array, which turned out to be right,
but the hint text itself doesn't quite fit the kind it fired on.

**What I changed:** nothing yet — moved to Round 2 to find a `layout` value
that avoids the problem structurally instead of reordering by hand.

## Round 2 — trying `layout: "lr" / "tb" / "grid"` instead of circle

The guide documents `layout` as `circle` (default) `| lr | tb | grid` for
`graph`, so I tried the alternatives before touching node order, hoping one
of the alternate layouts was simply better for this edge set.

`layout: "lr"` — `check --expect` was still 0 errors, 2 warnings (semantics
untouched), but `layout` got *worse*, not better:
```
frame 1 · step 1 · 0ms — Shortest route S → T
  overlap  "5" on "A" — 39% of the smaller box (edge-1-label × node-A)
  overlap  "5" on node-A — 100% of the smaller box (edge-1-label × node-A)
  crossed  "A" has a line through it — 9px inside the text (node-A × edge-1)
[... repeats through frame 18 ...]
18 of 18 frames with layout issues · 36 overlap(s) · 0 clipped · 18 crossed
```
Now an edge label sits *on top of a node box itself* (`edge-1-label` on
`node-A`), which is worse than a label being grazed by a line.

`layout: "tb"` (tail of output):
```
crossed  "0" has a line through it — 9px inside the text (label-S × edge-0)
crossed  "0" has a line through it — 14px inside the text (label-S × edge-1)
crossed  "A" has a line through it — 17px inside the text (node-A × edge-1)
crossed  "2" has a line through it — 9px inside the text (label-A × edge-1)
crossed  "2" has a line through it — 9px inside the text (label-A × edge-2)
18 of 18 frames with layout issues · 18 overlap(s) · 0 clipped · 84 crossed
```
Worse again (84 crossings vs 34 for circle).

`layout: "grid"` (tail of output):
```
overlap  "6" on node-B — 100% of the smaller box (edge-3-label × node-B)
overlap  "5" on node-C — 100% of the smaller box (edge-5-label × node-C)
overlap  "2" on node-D — 100% of the smaller box (edge-6-label × node-D)
crossed  "A" has a line through it — 9px inside the text (node-A × edge-1)
crossed  "B" has a line through it — 9px inside the text (node-B × edge-3)
crossed  "C" has a line through it — 9px inside the text (node-C × edge-5)
crossed  "D" has a line through it — 9px inside the text (node-D × edge-6)
18 of 18 frames with layout issues · 144 overlap(s) · 0 clipped · 72 crossed
```
Worst of all four. **Conclusion: `circle` (the default) is the best of the
four `layout` values for this particular 6-node/8-edge graph** — none of the
alternatives is even close. Reverted to `layout` unset (circle) and moved to
reordering `nodes` instead.

## Round 3 — reordering `nodes` under the (default) circle layout

The guide only documents that node *order* affects tie-breaking for
`state-machine`'s `lr`/`tb` layouts ("ties follow the order of `states`"); it
says nothing about whether `graph`'s `circle` layout is order-sensitive. I
tried it anyway, since the two crossings both involved a node next to its
own edge, and circle placement is order-dependent by construction.

- `["S","A","C","T","D","B"]` → worse: 3 problem types, 16 overlaps, 50 crossed.
- `["S","A","B","C","T","D"]` → same *shape* of problem (2 warnings), just
  moved from label-T to label-D:
  ```
  crossed  "2" has a line through it — 14px inside the text (label-A × edge-2)
  crossed  "8" has a line through it — 14px inside the text (label-D × edge-7)
  17 of 18 frames with layout issues · 0 overlap(s) · 0 clipped · 34 crossed
  ```
- `["S","B","A","D","C","T"]` → still 2 warnings, different pair:
  ```
  crossed  "4" has a line through it — 14px inside the text (label-B × edge-2)
  crossed  "7" has a line through it — 14px inside the text (label-T × edge-6)
  17 of 18 frames with layout issues · 0 overlap(s) · 0 clipped · 34 crossed
  ```
- `["T","D","C","B","A","S"]` (fully reversed) → **down to 1 warning**:
  ```
  frame 3 · step 3 · 960ms — Visit S (distance 0): the smallest tentative distance left
    crossed  "0" has a line through it — 14px inside the text (label-S × edge-0)
  [... same single crossing repeats through frame 18 ...]
  16 of 18 frames with layout issues · 0 overlap(s) · 0 clipped · 16 crossed
  ```

So node order clearly *does* affect `circle` layout's label placement (this
is not written anywhere in the guide for `graph`), but hand-guessing orders
was diminishing returns — 6 tries, best found was 1 warning, not 0.

## Round 4 — brute-forcing the node order

Rather than keep guessing, I wrote a small script
(`/tmp/.../scratchpad/search.mjs`, not part of the deliverable) that ran
`vlmkit-anim layout` against every permutation of the 6 ids under the
untouched algorithm/edges, stopping at the first exit-0 result. This is
still "no hand-typed coordinates" — I searched over *orderings of ids*, the
same lever the guide exposes, just exhaustively instead of by hand.

```
FOUND ZERO: ["S","A","D","C","B","T"]
checked 15 permutations; best zero-warning order: [ 'S', 'A', 'D', 'C', 'B', 'T' ]
```

The 15th permutation tried was already exit-0, so this took under a second
wall-clock once the script existed (each `layout` invocation ≈0.13s).

## Round 5 — final verification

`nodes: ["S","A","D","C","B","T"]`, everything else unchanged from the very
first draft (edges, `algorithm: dijkstra`, `start: S`, `goal: T`).

`vlmkit-anim check scene.json --expect facts/graph-roads-facts.expect.json`:
```
✓ scene.json (graph): 0 error(s), 0 warning(s)
  10200ms · 18 steps (17 captioned) · 30 nodes · 33 tracks / 139 keyframes
  scene 434 B (minified) → timeline 13216 B (×30.5)
  facts graph-roads-facts.expect.json: 6 nodes · 8 edges · 6 visits · 5 path nodes · 6 labels — all as drawn
  next: vlmkit-anim explain … · vlmkit-anim render … --step N · vlmkit-anim html … --out page.html
```
exit 0.

`vlmkit-anim layout scene.json`:
```
0 of 18 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```
exit 0.

`vlmkit-anim explain scene.json`:
```
Shortest route S → T — 18 steps, 10200ms, 30 nodes
 1. [    0ms] Shortest route S → T
 2. [  360ms] Every node starts at distance ∞; S is 0
 3. [  960ms] Visit S (distance 0): the smallest tentative distance left
 4. [ 1560ms] S → A: 0 + 2 = 2 < ∞, improve
 5. [ 2160ms] S → B: 0 + 5 = 5 < ∞, improve
 6. [ 2760ms] Visit A (distance 2): the smallest tentative distance left
 7. [ 3360ms] A → B: 2 + 2 = 4 < 5, improve
 8. [ 3960ms] A → C: 2 + 6 = 8 < ∞, improve
 9. [ 4560ms] Visit B (distance 4): the smallest tentative distance left
10. [ 5160ms] B → C: 4 + 1 = 5 < 8, improve
11. [ 5760ms] B → D: 4 + 5 = 9 < ∞, improve
12. [ 6360ms] Visit C (distance 5): the smallest tentative distance left
13. [ 6960ms] C → T: 5 + 2 = 7 < ∞, improve
14. [ 7560ms] Visit T (distance 7): the smallest tentative distance left
15. [ 8160ms] T → D: 7 + 1 = 8 < 9, improve
16. [ 8760ms] Visit D (distance 8): the smallest tentative distance left
17. [ 9360ms] Shortest path to T: S → A → B → C → T (length 7)
18. [ 9960ms] (end)
```
This reads unmistakably as Dijkstra: relaxation comparisons written out
(`0 + 2 = 2 < ∞, improve`), a visit step naming "the smallest tentative
distance left" every time, and a closing step naming the shortest path and
its length. Note this narration is **byte-identical in content** across
every round — reordering `nodes` only moves boxes on the canvas, it never
touches the algorithm's own steps or captions. Rounds 1–4 were pure layout
work; the correctness (visited order, labels, path) was right from the very
first draft because `algorithm: "dijkstra"` computed it, not me.

`scene.json`: 572 bytes.

Total: **5 rounds** (1 diagnosis, 3 spent on layout geometry, 1 final
verification). 0 rounds spent on correctness — that part was one shot.

## Friction

**What helped.** The `graph` kind's `algorithm`/`start`/`goal` trio removed
the one part of this brief I was worried about (getting the visit order and
relaxed distances right by hand) entirely — I never wrote an `ops` list, and
the fact-sheet section of the guide told me exactly which fields (`visited`,
`path`, `labels`) the checker reads back and from where ("the algorithm's
from `start`"), so I trusted the tool instead of hand-verifying the whole
walk beyond a quick check of my own. `schema --kind graph` and
`--kind expect` printed field tables and one full example each, which was
enough to write a correct scene without ever opening `docs/anim-ir.md`'s
`graph` section a second time. The `check --expect` summary line is genuinely
excellent — "6 nodes · 8 edges · 6 visits · 5 path nodes · 6 labels — all as
drawn" told me immediately, in one line, that every fact-sheet dimension
matched, rather than me having to infer that from silence.

**What was missing or misleading.** Two things cost real rounds:

1. The `layout` warning's → hint is written for `modules`/`diagram`
   ("reorder the modules in that layer, put the two in one group, or shorten
   the label") and fired verbatim on a `graph` scene, where there is no
   "layer" and no grouping concept. It happened to still be *roughly*
   actionable (reordering did fix it), but I had to guess that "reorder the
   modules" meant "reorder the `nodes` array" — the hint never names the
   field, and doesn't acknowledge it's speaking `modules` vocabulary to a
   `graph` scene.
2. Nothing in `docs/anim-ir.md`'s `graph` section, `layout` field
   description, or the annotation-anchor table says that node *order*
   affects the `circle` layout's geometry at all — the only order-sensitivity
   documented anywhere in the guide is for `state-machine`'s `lr`/`tb` tie
   -breaking. I only found out `circle` is order-sensitive by trial and
   error (Round 3), and there is no documented way to *predict* which order
   will avoid a given label/edge crossing short of brute-forcing all 720
   orderings (which worked, but only because the graph was small enough that
   0.13s × 720 ≈ 95s was affordable — this would not scale to a
   twelve-node graph, and there is no CLI flag like `--auto-layout` or
   `--try-orders` that would have done this search for me).

**Did each sheet line tell me what to change?** The `check --expect` lines
did, completely — every one either said "all as drawn" (nothing to change)
or would have named a specific id mismatch (I never triggered a real
mismatch, since Dijkstra generated everything correctly from the first
draft). The `layout` lines named the *problem* precisely (which label,
which edge, how many px) but not a *fix* I could apply directly for a
`graph` scene — no `pos`, no explicit coordinate, no "try `layout: X`"
suggestion tuned to this kind. I ended up fixing it by search rather than by
following any single hint to its conclusion.

**What I wanted and could not express.** A way to ask the tool "pick a
`circle`/`lr`/`tb`/`grid` ordering (or the `layout` mode itself) that
minimizes label/edge crossings" instead of hand-searching orderings myself.
Given that `layout --json` already returns a structured crossing count, this
search is mechanical enough that it feels like it belongs in the tool
(`vlmkit-anim check --auto-order` or similar) rather than in a one-off
throwaway script outside the deliverable. Short of that, everything else in
this brief — the algorithm, the fact-sheet check, the narration — was
expressible exactly as I wanted it, with zero hand-typed coordinates,
colours, or canvas sizes.
