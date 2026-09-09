# Log — flowchart-checkout-facts (attempt: ma)

## What I read before writing anything

- `fixtures/anim-scenario/briefs/flowchart-checkout-facts.md` (the brief)
- `fixtures/anim-scenario/briefs/facts/flowchart-checkout-facts.expect.json` (the fact sheet)
- `docs/anim-ir.md` — read start to finish once (the top-of-file conventions, then
  `## kind: flowchart`, and `## Checking a figure against the facts` for the
  flowchart row of the fact-sheet table)
- `pnpm exec vlmkit-anim --help`
- `pnpm exec vlmkit-anim schema --kind flowchart`
- `pnpm exec vlmkit-anim schema --kind expect`

No other file under `packages/vlmkit-anim/`, `docs/reports/`, `docs/design/`, or other
attempts/briefs was opened.

## Deciding shapes for each node

The brief gives ids and labels; shape is my call, made from what the guide says a
shape is *for*:

- `start` ("cart") and `done` ("order placed") → `terminal` (pill: "start, end, give
  up" — the brief literally calls these "where the flow begins" / "the end").
- `login`, `stock`, `paid` (all suffixed `?` in the brief, all three ways-out-with-a-
  label) → `decision` (diamond — "a question with labelled ways out").
- `signin`, `address`, `remove`, `pay`, `retry` → left at the default `process` (box)
  — none of them is a question and none is input/output in the `io` sense (no data
  entering/leaving the system boundary is implied by "sign in" or "pay" at this level
  of detail), so I did not reach for `io`.

This was a direct, undebated mapping — the guide's one-line description of each
shape ("a box (default)", "a diamond — a question with labelled ways out", "a pill:
start, end, give up") was enough; I never had to guess.

## Building edges and the walk

Edges came straight off the fact sheet's `edges` list (`"a->b"` / `"a->b:label"`),
translated into the scene's two edge forms — I used the label-carrying long form
`{"from","to","label"}` only where the fact sheet had a `:answer` suffix, and the
plain `["from","to"]` shorthand for the four unlabelled edges (`start->login`,
`signin->address`, `address->stock`, `remove->stock`, `retry->pay`).

The fact sheet's `visited` list starts with `"start"` itself, but the guide's
`schema --kind flowchart` says `walk` is "the nodes visited **after** start" — so I
dropped the leading `"start"` from `visited` when writing `walk`. This is the one
place I had to translate rather than copy directly; the schema text made it
unambiguous (and `check --expect` would have said so if I'd guessed wrong, but it
never got the chance to).

## Round 1

Command:
```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/ma/scene.json \
  --expect fixtures/anim-scenario/briefs/facts/flowchart-checkout-facts.expect.json
```
Output (verbatim):
```
✓ scene.json (flowchart): 0 error(s), 0 warning(s)
  11760ms · 14 steps (14 captioned) · 30 nodes · 22 tracks / 98 keyframes
  scene 1034 B (minified) → timeline 11524 B (×11.1)
  facts flowchart-checkout-facts.expect.json: 10 nodes · 12 edges · 13 visits · 1 end state — all as drawn
  next: vlmkit-anim explain fixtures/anim-scenario/attempts/ma/scene.json · vlmkit-anim render fixtures/anim-scenario/attempts/ma/scene.json --step N · vlmkit-anim html fixtures/anim-scenario/attempts/ma/scene.json --out page.html
```

Command:
```
pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/ma/scene.json
```
Output (verbatim):
```
0 of 14 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```

**First-attempt result: 0 ✗, 0 ⚠, layout clean.** No edit round was needed —
scene.json written from the fact sheet + guide passed both checks on the very
first run. Nothing was changed after this; there is no Round 2.

## `explain` output

```
Checkout — 14 steps, 11760ms, 30 nodes
 1. [    0ms] Start at "cart"
 2. [  490ms] cart → logged in?
 3. [ 1400ms] logged in?: no → sign in
 4. [ 2310ms] sign in → enter address
 5. [ 3220ms] enter address → all in stock?
 6. [ 4130ms] all in stock?: no → remove missing item
 7. [ 5040ms] remove missing item → all in stock?
 8. [ 5950ms] all in stock?: yes → pay
 9. [ 6860ms] pay → payment ok?
10. [ 7770ms] payment ok?: no → retry card
11. [ 8680ms] retry card → pay
12. [ 9590ms] pay → payment ok?
13. [10500ms] payment ok?: yes → order placed
14. [11410ms] End at "order placed"
```

This reads exactly as the brief's prose ("this customer is not logged in, one item
is out of stock, and the first payment fails once"): step 3 shows the no-branch to
sign-in, steps 6-7 show the stock question failing once and the loop back, steps
10-11 show the payment failing once and retrying, and it ends at "order placed".
Success criterion "`explain` reads as the story above" — met on the first render.

## Hand-typed coordinates / colours / canvas sizes

**Zero.** I did not set `pos` on any node, did not set `canvas`, and did not set
`theme`. Every position in the rendered figure came from the automatic `tb` layout
(default) driven purely by graph distance-from-`start`; every colour is the kind's
default palette (decision diamonds, terminal pills, the accent/green walk colours).
The brief needed none of these — ids, labels, shapes and edges were the whole scene.

## Size

`scene.json`: **1351 bytes** on disk (the tool's own report calls the minified form
1034 B; the difference is my 2-space indentation and file-final newline, which I
kept for readability while editing).

## Rendered frames looked at

- `fixtures/anim-scenario/attempts/ma/final.svg` — `vlmkit-anim still scene.json --out
  final.svg` (the end-state figure, "order placed" as the terminal node, everything
  else visited/green).
- `fixtures/anim-scenario/attempts/ma/step6.svg` — `vlmkit-anim render scene.json
  --step 6 --out step6.svg` (the "all in stock?: no → remove missing item" beat,
  picked because it's the one hop into the retry-loop, the part of the story most
  likely to draw badly if the loop-back edge collided with anything). `layout`
  confirmed 0 crossed / 0 overlap across every one of the 14 steps, this one
  included, so I did not need to eyeball more than these two.

## Friction

**What helped.** `docs/anim-ir.md`'s `## kind: flowchart` section is short and
sufficient by itself: the four shapes are each given in one clause with a concrete
reason to pick them ("a pill: start, end, give up" told me immediately which two
nodes in a 10-node brief get `terminal`), the two edge forms (shorthand array vs.
labelled object) are shown side by side in the worked example, and the line "every
hop must be an edge (the validator names the ways out when it is not)" told me the
walk-checking failure mode before I ever triggered it. The "Checking a figure
against the facts" section's flowchart row (`nodes, edges ("a->b" or "a->b:yes"...),
visited, end`) is a one-line spec that matched the fact sheet's shape field for
field, so translating the fact sheet into a scene was mechanical, not a puzzle.
`schema --kind flowchart` on the CLI restates the same table plus a full worked
example inline — useful as a fast lookup without re-opening the guide, and its
"Then: vlmkit-anim check scene.json" footer is a nice explicit nudge on what to run
next.

**What was missing or misleading.** Nothing misled me on this brief, but one thing
took a beat of thought rather than being stated outright: the schema text says
`walk` is "the nodes visited after start" but the *fact sheet's* `visited` field
(read from `schema --kind expect`) is described only as "the walk from start" with
no explicit statement of whether it includes the start node itself. I resolved this
by trusting the flowchart schema's wording over the expect schema's silence, and it
turned out right, but the expect schema could save the next writer a moment of doubt
by saying explicitly whether `visited` in the fact sheet includes the start node (it
does — 13 entries for a 12-hop walk after a 10-node graph, i.e. start + 12 walk
steps).

**Were the check lines actionable?** I never got a ✗ or ⚠ to test this against on
this brief — both `check --expect` and `layout` were green on the first write, so I
can't report on the repair experience from firsthand friction here. The one line I
did have to interpret without a failure driving me to it — `facts
flowchart-checkout-facts.expect.json: 10 nodes · 12 edges · 13 visits · 1 end state
— all as drawn` — is a clean confirmation but doesn't itself explain *why* it counts
13 visits for a 12-item `walk` array; I had to reconstruct that "start + walk" gives
13, which the tool clearly knows (it's comparing against exactly that) but doesn't
say back to the writer. A "10 nodes · 12 edges · 13 visits (start + 12 hops) · 1 end
state" would have removed even that small bit of mental arithmetic.

**What I wanted and could not express.** Nothing. The brief is a plain flowchart
with two loop-backs (stock question retrying itself via `remove`, payment question
retrying itself via `retry`) and both are ordinary edges the guide explicitly calls
out ("a loop is a normal edge back to an earlier node; the arrow bends round what is
in its way") — there was no shape, loop, or caption this kind could not represent.
I did not need a single hand-written `caption` override, coordinate, or colour: the
generated captions ("all in stock?: no → remove missing item") already told the
story the brief asked for, word for word close enough that I left every one of them
as generated.
