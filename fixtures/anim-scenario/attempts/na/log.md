# Log — sequence-checkout-facts

## 1. What I read

- `fixtures/anim-scenario/briefs/sequence-checkout-facts.md` (the brief)
- `fixtures/anim-scenario/briefs/facts/sequence-checkout-facts.expect.json` (the fact sheet)
- `docs/anim-ir.md` in full (the writing guide — every section, including "kind: sequence", "Annotations (every kind)", "Checking a figure against the facts", and the `expect` sheet table)
- `pnpm exec vlmkit-anim --help`
- `pnpm exec vlmkit-anim schema --kind sequence`
- `pnpm exec vlmkit-anim schema --kind expect`

I did not open anything under `packages/vlmkit-anim/`, any sibling `fixtures/anim-scenario/attempts/*` directory, `docs/reports/`, `CHANGELOG.md`, or any test file, and did not grep the repo for examples.

## 2. Rounds

### Round 1

Wrote `scene.json` directly from the brief + the guide's `kind: sequence` section and the `schema --kind sequence` example, with no prior attempt to correct.

Command:
```
pnpm exec vlmkit-anim check fixtures/anim-scenario/attempts/na/scene.json --expect fixtures/anim-scenario/briefs/facts/sequence-checkout-facts.expect.json
```

Full output:
```
✓ scene.json (sequence): 0 error(s), 0 warning(s)
  6230ms · 10 steps (10 captioned) · 36 nodes · 39 tracks / 167 keyframes
  scene 885 B (minified) → timeline 16633 B (×18.8)
  facts sequence-checkout-facts.expect.json: 5 nodes · 8 messages — all as drawn
  next: vlmkit-anim explain fixtures/anim-scenario/attempts/na/scene.json · vlmkit-anim render fixtures/anim-scenario/attempts/na/scene.json --step N · vlmkit-anim html fixtures/anim-scenario/attempts/na/scene.json --out page.html
```

Reported lines and what I changed for each:

- `"✓ scene.json (sequence): 0 error(s), 0 warning(s)"` — no error/warning reported, no change made.
- `"facts sequence-checkout-facts.expect.json: 5 nodes · 8 messages — all as drawn"` — the fact sheet's 5 `nodes` (participant ids) and 8 `messages` (`"a->b:label"`, frames flattened) matched what I drew exactly. No change made.

No round 2 was needed — the first attempt was green against `check --expect`. I still ran `layout` and `explain` as the brief's success condition requires, and rendered frames to answer the brief's specific questions (below), which is exploration, not a fix round.

```
pnpm exec vlmkit-anim layout fixtures/anim-scenario/attempts/na/scene.json
```
```
0 of 10 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed
```
No issue reported, no change made.

```
pnpm exec vlmkit-anim explain fixtures/anim-scenario/attempts/na/scene.json
```
```
Place order — 10 steps, 6230ms, 36 nodes
 1. [    0ms] Place order
 2. [  350ms] customer → shop: place order
 3. [ 1050ms] shop → stock: reserve(items)
 4. [ 1750ms] shop ← stock: reserved
 5. [ 2450ms] shop → payment: charge(card)
 6. [ 3150ms] shop ← payment: declined
 7. [ 3850ms] shop ← payment: receipt
 8. [ 4550ms] shop → mail: send confirmation (async)
 9. [ 5250ms] customer ← shop: order #4711
10. [ 5950ms] end
```
This reads exactly as the brief's story, in order, with the right arrow direction on returns (`←`) and the async tag on step 8. No change made.

## 3. The brief's specific questions

**Which participant is "busy" while payment is charging, and where do the activation bars start/end?**

I rendered `render --step 5/6/7 --out …svg` (the charge, declined and receipt beats) and cross-checked against the compiled timeline (`compile … --out timeline.json`) by reading the `act-0`/`act-1`/`act-2` node tracks (one activation-bar node per participant that is ever activated: `act-0` = shop's column x=378.6, `act-1` = stock's column x=522.6, `act-2` = payment's column x=666.6 — I matched them by comparing each node's `pos.x` against the `part-<id>` boxes' `translate` x in the rendered SVG, since the ids are assigned in participant-first-activation order, not lifeline order).

Answer: **two** participants are busy while payment is charging (step 5, `charge(card)`, and through both alt branches at steps 6-7):
- **`shop`** (`act-0`) — opens at `t=770ms` (the instant `place order` lands on shop) and stays open (opacity 1, height only ever growing, `773 → 340px` across every later keyframe) all the way to the end of the run. It never closes before the final beat: shop is activated by the very first `call` and only returns at the very last message (`shop → customer: order #4711`, `kind: return`), so it is "busy" for the entire scenario, payment's charge included. This was the one part of the picture I did not expect from reading the guide alone — I assumed activation bars would visibly shrink at their close, but the compiler just **stops growing** the bar at the closing return; there is no shrink-back-to-zero animation, "closed" means "the box's bottom edge froze here."
- **`payment`** (`act-2`) — opens at `t=2870ms` (when `charge(card)` lands on payment, i.e. right after step 5's arrow finishes drawing) and stays open through **both** alt branches (its height keeps growing across the `declined` beat at `t≈3150-3570` and the `receipt` beat at `t≈3850-4270`), finally freezing at `t≈4470ms`, i.e. after the *last* branch in my `alt` array (`approved`/`receipt`) has its return drawn. This makes sense once you see it: the picture draws **both** alternative branches (it is not simulating a single run), so the activation bar corresponding to the one `charge(card)` call has to stay open until the last-drawn alternative return closes it, even though in a real run only one of the two returns would actually happen.

`stock` (`act-1`) opens at `t=1470ms` (`reserve(items)` lands) and freezes at `t≈2370ms` (right after `reserved` lands) — closed well before payment starts charging, so stock is not busy during that part.

**Do the two frames wrap the right messages?**

Yes, confirmed by rendering steps 5, 6 and 7 and reading each frame element's `opacity`:
- The `loop` frame (`frame-0`, labelled `"loop [until paid, max 2]"`) is already fully visible (no `opacity="0"`) at step 5 — it appears with its first inner message, `charge(card)`, and its outline (measured 718.2×200 in the SVG) spans down far enough to enclose the whole nested `alt` block, not just the `charge` message. Confirmed at steps 5, 6, 7 — same box, always visible from step 5 on.
- The `alt` frame (`frame-1`, labelled `"alt [declined]"` for the first branch, and `frame-1-else-0-label` `"[approved]"` for the second, separated by a dashed `frame-1-else-0` line) is `opacity="0"` at step 5 (correctly not yet drawn — the `alt` hasn't started) and becomes visible starting exactly at step 6, the moment the `declined` return message fires (its first inner item). It stays visible through step 7 (`receipt`). So both frames wrap exactly the messages the brief specifies: the `loop` around `charge(card)` + the whole `alt`; the `alt` around the `declined` and `receipt` returns, split by the dashed `[approved]` separator.

**Every coordinate / colour / canvas size typed by hand:**

None. I did not set `canvas`, `theme`, or any pixel/coordinate value anywhere in `scene.json` — every number in the rendered SVG (378.6, 522.6, 666.6, the frame boxes' 718.2×200 and 698.2×126, the activation-bar heights, etc.) was derived by the compiler from the participant list and message order alone. This is the whole point of the "Scene" layer per the guide ("intent... never coordinates") and it held up completely for this kind.

**Anything I wanted and could not express:**

Nothing. The brief's story (one actor, four system participants, a `loop` frame with a label, a nested two-branch `alt`, an `async` fire-and-forget message, and two `return`s) mapped onto the `kind: sequence` vocabulary (`participants`, `messages` with `kind: call|return|async`, `{"loop": "…", "items": […]}}`, `{"alt": [{"when", "items"}, …]}}`) with no gaps and no workaround needed.

## Friction

Nothing forced a guess or a workaround, but two points cost me time cross-checking rather than just reading:

1. **The `expect` sheet fields for `sequence` are not in the guide's own "Checking a figure against the facts" walk-through table** (`docs/anim-ir.md`, the table right after the JSON example with `modules`/`deps`/`forbidden`/`highlighted`/`groups` — it lists only `graph`, `state-machine`, `distributed`). I had the fact sheet already in the shape `{"nodes": [...], "messages": ["a->b:label", …]}` (matching `distributed`'s shape) and assumed by analogy it would work for `sequence` too — it did — but the guide's prose right there ("Other kinds (sort, matrix, chart, …) have their own semantic checks and no sheet yet") reads as if `sequence` might be one of the "no sheet yet" kinds, since it isn't named either way. I had to fall back to `schema --kind expect` (one of the explicitly whitelisted commands) to get positive confirmation that `sequence` has `nodes`/`messages` fields. **Guide fix**: add a `sequence` row to that walked-kinds table (or at minimum say "graph, state-machine, distributed **and sequence** have sheets of their own") so a reader doesn't have to run `schema --kind expect` just to find out a kind they're using is actually covered.

2. **Activation-bar close semantics aren't stated anywhere in the guide.** The `sequence` section says a `call` "activates the receiver ... until that participant returns," which reads as if the bar visibly ends/shrinks at that point. In practice (confirmed only by reading the compiled timeline's keyframes) the bar's height simply **stops growing** at the closing return — there's no shrink-to-zero animation, so "closed" is a freeze, not a visual event, and a bar that closes on the very last message of the scene is indistinguishable at a glance from a bar that "never closes." I only found this out by diffing `act-*` keyframes across time, which the rules forbid using as a rehearsal step for the deliverable itself (it's diagnostic, not part of the scene-writing loop) — this is exactly the kind of thing `render --step N` plus a *documented* note in the guide would save a writer from re-deriving by hand. **Guide fix**: one sentence under `kind: sequence` (or in the annotations/activation discussion) saying activation bars only grow and freeze at deactivation rather than shrinking, since a reader relying on "does it look closed" from a single rendered frame near the end of a scene cannot tell the difference between "still open" and "closed right at the edge."

3. Minor: the `alt` example in the guide and in `schema --kind sequence`'s printed example only shows a two-branch `alt` nested at the top level of `messages`, not nested inside a `loop`'s `items`. I had to infer (correctly, as it turned out) that `loop.items` and `alt` branches' `items` accept the same message-entry grammar recursively, including another frame type. It worked first try, but the guide never explicitly says frames can nest inside frames — it would be worth one line confirming that `loop`/`alt` items are the same grammar as `messages`, recursively.
