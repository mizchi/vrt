# anim-scenario — subagent evaluation fixture for `vlmkit-anim`

Closed-loop validation of the explanatory-animation IR (see
`.claude/skills/agent-validation-loop`). A fresh subagent gets ONLY a brief
from `briefs/` and `docs/anim-ir.md`, writes a scene, and runs
`vlmkit-anim check` until green. What it stumbles on is the deliverable.

- `briefs/<name>.md` — the task. Each names a deterministic success criterion
  (`check` exit 0 + a semantic condition the checker can read back).
- `attempts/<agent>/` — one directory per run: the scene(s), `log.md`, and the
  agent's deliverable. Prior attempts are off-limits to later agents.
- `re-edit/` — a second-phase task: an existing scene plus a change request,
  measuring whether intent is readable enough to edit in one round.
  `README.md` + `replication.scene.json` is the v2 variant (absolute event
  times, kept frozen because two agents' failures are recorded against it);
  `README-v3.md` + `replication-after.scene.json` is the same story written
  with `after` anchors, used from v3 on. `README-v4-sequential.md` and
  `README-v4-causal.md` + `replication-causal.scene.json` are v4's two arms
  (same change request, explicit "ok must not wait" criterion) that decided
  the timing default.

v5 (2026-09-04) added briefs for the three kinds that landed that day —
`matrix-knapsack`, `graph-friend-of-friend` (explicit ops),
`graph-build-critical-path` (directed Dijkstra, pinned nodes),
`chart-deploy-frequency` — run by agents `t`–`w`.

v6 re-edited one frozen scene per new kind (`README-v6-*.md`, agents `x`–`z`).
v7 added `array` and `tree`: briefs `array-partition`, `tree-bst-lesson`
and re-edit tasks `README-v7-{array,tree}.md` (agents `aa`–`ad`).
v8 added `stack`, `queue` and `list`: briefs `stack-postfix`, `queue-bfs-frontier`,
`list-lru`, and re-edit tasks `README-v8-{list,vector}.md` — the `vector` one is
the first re-edit of that kind (agents `ba`–`be`).

v9 (2026-09-05) changed the question from "animate this structure" to "explain
this concept": `concept-vector-clock`, `concept-http2-multiplexing`,
`intro-vlmkit-anim` (a presentation of the tool itself) and
`arxiv-batched-pandora` (a paper submitted that week, arXiv 2609.04059). No
brief names a kind; several scenes are allowed; every writer counts their
hand-written coordinates and colours, the facts that fit only in a caption,
and what they could not say (agents `ca`–`ce`).

v10 re-ran the same five briefs after the annotation layer and `kind: compose`
landed (agents `da`–`de`): the coordinate-fallback count is the metric that has
to move, and the attempts are kept next to v9's for the comparison.

v11 is the re-edit round on the annotated scenes v10 produced, after `relate`
landed: `README-v11-distributed.md` + `vector-clock-values.scene.json` (da's
scene: an extra upstream event that every `value` downstream has to follow),
`README-v11-matrix.md` + `pandora-batched.scene.json` (dd's scene: a cheaper
box that moves both readouts and the decision arithmetic), and
`README-v11-relate.md` + `vector-clock-relate.scene.json` (the package fixture:
a receive that retires a `∥` relation for a `≤` one). The question is whether
a readout or a relation survives someone changing the data it tracks
(agents `ea`–`ec`; `ed` re-ran ea's task after the `relate` routing fix ea's
friction produced, to measure the fix the same way the defect was found).

v12 measured the frames instead of the writers: `v12/before-timelines/` holds
the four v11 scenes compiled by the pre-v12 compiler (the layout defects kept),
`v12/before/` and `v12/after/` their review sets (sheet, brief, geometry
report), `v12/reads/<letter>/` the blind folders the readers saw — a sheet and
a brief, nothing else; `KEY.md` maps letters to before/after — with each
reader's `answers-<model>.json`, and `v12/scores/` the frame-level agreement
of each answer with the geometry (`vlmkit-anim review --answers`).

v13 (2026-09-06) is the first round on **still figures**, after `kind: modules`,
diagram `groups` and the `still` verb landed: `modules-this-workspace` (this
repository's packages from their `package.json` files; the `repo` generator is
forbidden), `modules-ports-adapters` (a rule — every dependency points inward —
plus one dependency that must be shown as forbidden), `depgraph-import-cycle`
(nine modules, one cycle to make visible and name the cut) and
`modules-request-walk` (one file as both the onboarding map and a walked
request). Writers `fa`–`fe`; success adds `layout` reporting no issue and an
edge-fidelity hand count (every listed dependency drawn, none invented).
`ga`–`gc` re-ran three of the briefs on the compiler and guide the first
five's friction produced (`layout` had learned to see a line through a text
in between).

v14 (2026-09-06) answers v13's two green-but-wrong pictures (fe deleted a true
dependency, gc highlighted the wrong edge): each still-figure brief now ships a
**fact sheet** in `briefs/facts/<brief>.expect.json` — modules, `deps`
`"a->b"`, `forbidden`, `highlighted`, `groups` — and success is
`check scene.json --expect facts/….expect.json` exiting 0. Writers `ha`–`hd`
(two of them the smaller model that produced both v13 errors) re-run the four
briefs; the sheet's verdict on each first attempt, and how many rounds the
sheet's own lines take to clear, are the metrics.

v15 (2026-09-07) is the first round in **Japanese**: `ja-modules-checkout`
(the request walk with Japanese labels and its fact sheet), `ja-state-order`
(an order's state machine) and `ja-distributed-payment` (a payment timeout and
idempotent retry). The round exists because every width estimate counted a CJK
glyph as 0.6 em; the briefs ask writers to open their own SVG and say whether a
label looks like it overflows, because the geometry's green had been a lie
(writers `ia`–`ic`).

v16 (2026-09-08) adds the still figure's own vocabulary — `tone` on modules
and dependencies, `"style": "implements"`, `relate` `"style": "equals"` — and
one brief, `modules-adapters-still`, that needs all of it: five things a
reader must see in the figure itself, with a fact sheet that fixes what may be
lit (writers `ja`, `jb`).

Metrics per run: first-attempt error count, rounds to green, scene bytes,
semantic verdict, and the agent's own words on what helped / what was missing;
from v9 also the coordinate-fallback count, the expressiveness metric; from
v11 also whether every dependent literal (readout text, message label,
caption arithmetic) was updated — the checker cannot read arithmetic, so that
is a hand count.
Reports: `docs/reports/2026-09-04-anim-ir-v*.md`, `docs/reports/2026-09-05-anim-ir-v{9,10,11,12}.md`,
`docs/reports/2026-09-06-anim-ir-v{13,14}.md`, `docs/reports/2026-09-07-anim-ir-v15.md`,
`docs/reports/2026-09-08-anim-ir-v16.md`.
