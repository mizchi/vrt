# log — ja-state-order (attempt ib)

## Round 1 — default layout (`lr`)

`check`:
```
⚠ canvas: the canvas is 2598×360: on a 1280px-wide screen it shrinks to 49% and labels stop being legible
⚠ nodes(tr-6-label): "キャンセル要求 / 返金処理開始" is covered by state-preparing (51%) at step 1 and 8 later steps
⚠ nodes(state-preparing): "出荷準備中" has a line through it (tr-6, 71px) at step 1 and 8 later steps
⚠ states(cancelled): drawn but the trace never enters it
⚠ transitions(awaiting_payment:期限切れ): drawn but the trace never fires it
⚠ transitions(preparing:キャンセル要求): drawn but the trace never fires it
✓ 0 error(s), 6 warning(s)
```
`layout`: 9 of 9 frames with issues (1 overlap + 1 crossed, every frame).

Change: default `lr` packs 8 states side-by-side → canvas 2598px wide, way over
the 1280px the tool itself warns about. Set `"layout": "tb"`.

## Round 2 — `layout: "tb"`

`check`: canvas warning gone. Still:
```
⚠ nodes(tr-6-label): "キャンセル要求 / 返金処理開始" is covered by "出荷準備中" (60%)
⚠ nodes(state-preparing): "出荷準備中" has a line through it (tr-6, 20px)
✓ 0 error(s), 5 warning(s)
```
`layout`: still 9/9 frames flagged (now 2 overlaps + 1 crossed per frame — the
same label collides with the state box under two different anchor names).

Change: tried `"layout": "circle"` next, since `tb` alone didn't fix the
preparing/refunded collision.

## Round 3 — `layout: "circle"`

Made it much worse: 20+ `nodes(tr-0-label)` overlap warnings, every transition
label colliding with several state circles arranged around the ring. Reverted
to `tb` immediately — `circle` is not a fit for a graph this branchy (8 states,
2 states with 2 outgoing edges each).

## Round 4 — `tb` + reordered `states` list

Kept `layout: "tb"`. The colliding pair was always `preparing` (2 outgoing
edges: 発送→shipped, キャンセル要求→refunded) and the label of its second edge.
Guessing the layered layout picks state order from list order when breaking
ties, I moved `refunded` earlier in the `states` array (right after `paid`,
before `preparing`/`shipped`/`delivered`/`cancelled`) with no other change.

`check`:
```
⚠ states(cancelled): drawn but the trace never enters it
⚠ transitions(awaiting_payment:期限切れ): drawn but the trace never fires it
⚠ transitions(preparing:キャンセル要求): drawn but the trace never fires it
✓ 0 error(s), 3 warning(s)
```
`layout`: `0 of 9 frames with layout issues · 0 overlap(s) · 0 clipped · 0 crossed`.

The 3 remaining warnings are exactly the brief's carve-out: the brief's trace
only asks for the normal path (注文確定→入金確認→ピッキング開始→発送→受領) plus a
`goto` back to 支払い完了 and one キャンセル要求. It never asks to visit the
期限切れ→キャンセル済み branch or preparing's own キャンセル要求→返金済み edge — both are
real, drawn transitions the reader can see on the map, just not walked by this
trace. Stopping here: success criterion met (0 ✗, and every remaining ⚠ has a
reason).

Rendered `states.svg` with `still --step 9` (final frame, all 8 states + both
final rings + token at 返金済み visible).

## Reading `states.svg`

Circle radii scale with label length exactly as the guide promises ("a CJK
glyph is one em"): 4-char labels (受付済み, 出荷済み, 配達完了, 返金済み) got r=38,
5-char labels (支払い待ち, 支払い完了, 出荷準備中) got r=45, and the 7-char
キャンセル済み got auto-widened to r=59 with its final ring at r=64 — no label
looks clipped or tight against its circle's stroke. Transition labels: both
identical "キャンセル要求 / 返金処理開始" labels (tr-6, tr-7) sit ~125px apart
vertically and don't touch each other or any circle — matches `layout`'s
0-overlap/0-crossed report, so I'm trusting the automated geometry check over
a squint at coordinates for the fine-grained claim, and my own read of the
raw numbers agrees.

---

## Summary

1. **First `check`**: 0 ✗, 6 ⚠ (1 canvas-too-wide, 2 geometry [overlap + crossed
   on the same preparing/refunded pair], 3 untraced state/transition).
2. **Rounds**: R1 default `lr` → canvas + geometry warnings. R2 `layout: "tb"`
   → canvas fixed, geometry warning persisted. R3 `layout: "circle"` → much
   worse (20+ overlaps), reverted. R4 `tb` + reordered `states` array (moved
   `refunded` earlier) → geometry clean, 0 ✗ / 3 ⚠, all three explained by the
   brief's own carve-out for un-walked branches.
3. **Japanese-specific**: the guide's one line — "a CJK glyph is one em, a
   Latin one about 0.6... Japanese text needs no spaces or `\n` to fit" — held
   up exactly; every circle auto-sized to its label with no manual width/height
   input. No label overflowed its circle or split badly. The one real friction
   was topological, not linguistic: two states (`preparing`, `paid`) sharing an
   event name (`キャンセル要求`) to the same target (`refunded`) caused a label/box
   collision that neither `layout: "tb"` nor `layout: "circle"` fixed by itself;
   reordering the `states` array did. The guide never states that list order
   affects layering/tie-breaking in `lr`/`tb` — I inferred it from behavior, not
   from a documented rule, and would like `## kind: state-machine` to say so
   explicitly (or for `check`/`layout` to suggest reordering the same way it
   suggests `--layout` or shortening labels).
4. **Not helpful / missing / confusing**: `layout: "circle"` regressing so
   badly on a mostly-linear-with-two-branches graph was surprising given the
   guide lists it as a peer option with no caveat about branch count. The
   `check` hint for the collision ("move one of them, shorten the text, or
   widen the canvas") didn't mention reordering or switching layout, which
   were the two things that actually worked.
5. **Hand-typed coordinates/colours/canvas size: zero.** No `pos`, no `theme`,
   no `canvas` override — every fix was a `layout` value or a reorder of the
   `states` array. Nothing I wanted for the figure went unexpressed; the
   `note` field covered every action-on-transition the brief asked for.
