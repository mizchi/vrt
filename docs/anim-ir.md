# vlmkit-anim — writing an explanatory animation

One JSON file describes *what is being explained*; `vlmkit-anim` turns it into
motion, checks that the motion says what the file claims, and embeds it as a
`<vlm-anim>` web component (SVG + Web Animations, no dependencies).

This page is the complete writing guide. Every JSON block on it passes
`vlmkit-anim check` (a test enforces that).

## The loop

```
1. write scene.json                         (one "kind", see below)
2. vlmkit-anim check scene.json             validate → compile → semantic checks → stats
   read each ✗ line: path, what is wrong, and the → hint with the fix; edit; re-run
3. vlmkit-anim explain scene.json           the narration as a numbered list — is this the story you meant?
4. vlmkit-anim render scene.json --step 4   one frame as SVG, at the instant step 4 begins; --out frame.svg
   vlmkit-anim render scene.json --at 2300   …at a time — what a step's own fade-in has drawn is only visible past its start
   vlmkit-anim frames scene.json --out dir [--png]   every step as a file, for looking at
   vlmkit-anim sheet scene.json --out sheet.png      every step on ONE labelled image — what to show a vision model
   vlmkit-anim check scene.json --expect facts.json  …and the figure against its facts: modules, dependencies "a->b", forbidden ones, what is lit, group members;
                                                     a graph's visits and path, a state machine's transitions and end state, a distributed scene's messages and lost ones
   vlmkit-anim facts src --depth 1 --out f.json      a fact sheet from a directory's import graph, for a map drawn by hand from the code
   vlmkit-anim layout scene.json                     texts on texts, under boxes, past the edge, lines through texts — per step (check warns about these too)
   vlmkit-anim review scene.json --out dir           the sheet + a review brief for a vision model or an agent; --answers its JSON scores it
5. vlmkit-anim html scene.json --out page.html       the playable page
   vlmkit-anim video scene.json --out demo.gif       a file for a README / slide (or .mp4 / .webm through ffmpeg)
6. vlmkit-anim eval page.html                        measure the emitted page frame by frame (needs @mizchi/vlmkit-animation-eval + playwright)
```

`check` exits 1 on any error. Warnings (⚠) are advice: off-canvas nodes,
steps without captions, a hidden node that is never shown.

## Two layers

- **Scene** (`"format": "vlmkit-anim/scene@1"`, one `kind`): intent. Short, and
  readable when someone edits it later — `"algorithm": "bubble"` or
  `"trace": ["connect", "SYN+ACK"]`, never coordinates.
- **Timeline** (`"format": "vlmkit-anim/timeline@1"`): nodes + absolute-time
  keyframe tracks + step markers. Every kind compiles to it (`vlmkit-anim compile`).
  Write it directly only when no kind fits and `kind: vector` is not enough.

Common to every scene: `format`, `kind`, optional `title` (drawn at the top),
`stepMs` (milliseconds per beat; kinds default to 500–700), `canvas`
(`{width, height, background}`; kinds pick a size that fits), `theme` (colours:
`node nodeStroke text accent muted ok bad background`, and `fontSize`).

Labels, captions and annotation texts may be in any script. Boxes are sized
for the glyphs they hold — a CJK glyph is one em, a Latin one about 0.6 — and
a callout or caption that has to wrap breaks at spaces where there are any and
between glyphs where there are none, so Japanese text needs no spaces or `\n`
to fit. Ids are what the ops and the fact sheets name; keep them ASCII and put
the language in `label`.

**Captions are the explanation.** The runtime shows the current step's caption
under the picture; `explain` prints them. Every kind generates sensible default
captions; write your own where the default would not say why. Three
conventions hold in every kind:

- A `caption` on an op or sequence item **replaces** the generated caption for that beat.
- `{"note": "…"}` is a captioned pause: the string is the caption, and it is a step like any other.
- Compilers add a first step at t=0 (the title, or "Start: …") and a last one ("Sorted: …", "End in …"), so `explain` shows two more steps than you wrote. `vector` is the exception: it narrates only the items you captioned, and adds neither.
- A *beat* is one step. Every op is its own beat by default; `ms: 0` on an op that only recolours or relabels (`pointers`, `window`, `highlight`, `mark`, `label`, and every annotation op) applies it inside the previous beat with no step of its own. Two beats that start at the same instant (two messages sent together, an event coinciding with a message) share one step and their captions are joined with " · ".
- Six **annotation ops** — `value`, `callout`, `snapshot`, `group`, `text`, `relate` — go in any kind's op list and name the kind's own things (an index, a cell, a node) instead of coordinates. See [Annotations](#annotations-every-kind). Two or more pictures at once is [`kind: compose`](#kind-compose).

`vlmkit-anim check scene.json --max-ms 15000` fails when the animation runs longer than a budget.

## kind: sort

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "sort",
  "title": "Bubble sort",
  "algorithm": "bubble",
  "values": [5, 3, 8, 1, 9, 2]
}
```

| field | |
|---|---|
| `values` | required, 2+ numbers |
| `algorithm` | `bubble` \| `insertion` \| `selection` — runs the algorithm and generates the ops |
| `ops` | explicit alternative: `{"compare":[i,j]}` `{"swap":[i,j]}` `{"done": i \| [i,…]}` `{"set":{"index":i,"value":v}}` `{"note":"…"}`; indices are 0-based **positions**; each may carry `caption` and `ms` (that beat's length) |
| `captions` | `false` to drop the generated captions |

Bars swap places; the check fails unless the final left-to-right order is
sorted. `compare` only highlights the two bars (nothing moves); `swap` moves
them; `done` turns a bar green for "in its final place" — use it to show the
sorted run growing.

## kind: array

A row of boxes with **named pointers** underneath and an optional **window**
bracket: binary search, two-pointer walks, sliding windows — anything where
the story is where the pointers are rather than what swaps (that is `sort`).

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "array",
  "title": "Binary search for 23",
  "values": [2, 5, 8, 12, 16, 23, 38, 56, 72, 91],
  "algorithm": "binary-search",
  "target": 23
}
```

| field | |
|---|---|
| `values` | required, 1+ numbers or strings |
| `algorithm` | `binary-search` (needs `target`, sorted numeric values) \| `two-pointer-sum` (needs `target`, the sum; sorted values) \| `sliding-window` (`window` = length, default 3; marks the max-sum window). Generates the ops with a caption on every beat |
| `ops` | explicit alternative, each with optional `caption`, `ms`: `{"pointers": {"lo": 0, "hi": 9}}` creates or moves named pointers (arrows under the boxes; name only the ones that move — `{"pointers": {"j": 1}}` leaves the others where they are; `null` removes one); `{"window": [i, j]}` brackets an inclusive range, `{"window": null}` clears it; `{"compare": [i, j]}` highlights two boxes for one beat and moves nothing, `{"swap": [i, j]}` moves them (pointers stay on their indices), `{"set": {"index": i, "value": v}}` rewrites one; `{"highlight": i \| [i, …]}` / `{"unhighlight": … \| "all"}`; `{"mark": i \| [i, …]}` permanent done colour; `{"found": i}` the answer, green with a pulse; `{"note": "…"}` |

Indices are 0-based **positions** and every pointer has its own lane, so two
pointers on the same index do not collide. `ms: 0` on a `pointers`, `window`,
`highlight` or `mark` applies it inside the previous beat with no step of its
own. The check reads the final row back by position; with `binary-search` it
also fails unless the search ended at the target's index (or reported "not in
the array" when it is absent).

## kind: stack, kind: queue

A stack is a column of slots (push on top, pop from the top); a queue is a
row (enqueue at the back, dequeue from the front, the rest shift forward).
Both take a list of ops and narrate every one.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "stack",
  "title": "Matching brackets with a stack",
  "ops": [
    { "push": "(", "caption": "Read (: an opener, push it" },
    { "push": "[", "caption": "Read [: another opener" },
    { "pop": true, "caption": "Read ]: it must match the top — [ does, pop it" },
    { "pop": true, "caption": "Read ): matches (, pop it" },
    { "note": "Input consumed and the stack is empty: the brackets balance" }
  ]
}
```

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "queue",
  "title": "Print jobs",
  "initial": ["report.pdf", "photo.png"],
  "ops": [
    { "enqueue": "memo.txt" },
    { "dequeue": true, "caption": "The printer takes the oldest job first" },
    { "peek": true },
    { "dequeue": true }
  ]
}
```

| field | |
|---|---|
| `initial` | values present at the start — bottom to top for a stack, front to back for a queue |
| `ops` | required, 1+, each with optional `caption`: stack `{"push": v}` `{"pop": true}` `{"peek": true}` `{"note": "…"}`; queue `{"enqueue": v}` `{"dequeue": true}` `{"peek": true}` `{"note": "…"}`. Values are numbers or strings |
| `capacity` | draw this many slots; a push / enqueue past it is narrated as refused and the check warns. Default: as many as the scene ever holds |

`pop` / `dequeue` / `peek` on an empty structure is narrated ("nothing to
remove"), not an error. A `top` (stack) or `front` / `back` (queue) marker
follows the occupied slots. Generated captions name the value (`pop → 7: the
last one in is the first one out`, `peek → photo.png: the front, left in
place`), and the compiler's closing step lists what is left and everything
removed, in order — a free trace of the run. One token that needs several
operations (an operator popping two operands) is several ops, each its own
beat; the captions tie them together. The check reads the final contents
back by slot.

## kind: list

A singly linked list: boxes with an arrow between neighbours, a `head`
marker on the first, `∅` after the last.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "list",
  "title": "Singly linked list",
  "initial": [3, 7, 9],
  "ops": [
    { "insert": { "value": 5, "after": 3 } },
    { "insert": { "value": 1, "at": 0 }, "caption": "Insert 1 at the head: no shifting, the head pointer just moves" },
    { "remove": 7 },
    { "find": 9 },
    { "reverse": true }
  ]
}
```

| field | |
|---|---|
| `initial` | values head first |
| `ops` | required, 1+, each with optional `caption`: `{"insert": {"value": v, "at": i}}` at a 0-based position (default: the tail) or `{"insert": {"value": v, "after": w}}` right after the first node holding `w`; `{"remove": v}` the first node holding `v`, its neighbours relink; `{"find": v}` a cursor walks from the head with one captioned beat per node until `v` or `∅`; `{"reverse": true}` the arrows turn around, then the boxes trade places so the list reads head-first again; `{"note": "…"}` |

Insert narrates the relinking (`3 will point to 5, and 5 to 7`); remove
names who now points where; `find` counts hops as arrows followed from the
head (a value at the head is 0 hops), and a `find` that reaches `∅` is
narrated and the check warns. With duplicate values, `after`, `remove` and
`find` all mean the first match from the head, and a reverse keeps duplicates
as separate boxes that trade places like any other. The check reads the final order back left to right and counts
the arrows drawn. A stack, a queue or a list of characters is the way to
show a string being processed; an array of one-character strings
(`"values": ["r", "a", "c", "e"]`) is the way to show one being scanned.

## kind: tree

A binary search tree. Values are circles; x is the value's in-order rank, y
its depth, so the picture is always a valid BST drawing and a promoted node
slides up into place.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "tree",
  "title": "Binary search tree",
  "initial": [8, 3, 10, 1, 6],
  "ops": [
    { "insert": 14 },
    { "insert": 4, "caption": "4 goes under 3, then right of 3: 3 < 4 < 6" },
    { "search": 6 },
    { "delete": 3, "caption": "3 has two children: its in-order successor 4 takes its place" },
    { "traverse": "inorder" }
  ]
}
```

| field | |
|---|---|
| `initial` | values inserted in this order before the first op, without animation (the shape depends on the order) |
| `ops` | required, 1+: `{"insert": n}` `{"search": n}` `{"delete": n}` `{"traverse": "inorder" \| "preorder" \| "postorder" \| "levelorder"}` `{"note": "…"}`; each may carry `caption`, which replaces the generated caption of that op's **last** beat (the comparisons on the way down keep theirs) |

Insert, search and delete walk a token down from the root with one captioned
beat per comparison (`14 > 8: go right`); a successful search's last beat is
the equality (`6 = 6: this is the node`) and counts in "found after N
comparisons". Delete narrates the three cases — leaf, one child (the child
moves up), two children (the in-order successor, the smallest value on the
right, takes the node's place; if the successor had a right child, that
child takes the successor's old spot). Traverse visits every node, lines the
values up in a row under the tree as they are reached, and ends with a step
captioned `inorder: 1, 4, 6, …`. Inserting a value already
present, or deleting one that is not, is narrated as a no-op and the validator
warns. The check reads the final tree back from the frame: left-to-right
order must be ascending and every node at its depth.

## kind: state-machine

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "state-machine",
  "title": "Door",
  "states": ["closed", "open", { "id": "locked", "final": true }],
  "initial": "closed",
  "transitions": [
    { "from": "closed", "to": "open", "on": "push" },
    { "from": "open", "to": "closed", "on": "pull" },
    { "from": "closed", "to": "locked", "on": "lock", "note": "/ beep" }
  ],
  "trace": ["push", "pull", { "note": "Locking is the other way out of closed" }, "lock"]
}
```

| field | |
|---|---|
| `states` | required: `"id"` or `{"id", "label", "final": true, "pos": [x, y]}` (final = double ring; `pos` pins the state, the rest are laid out around it) |
| `initial` | required |
| `transitions` | required: `{"from", "to", "on": "event", "note": "/ action"}`; one per (from, on). The note is drawn on the edge and appended to the generated caption (`on lock: closed → locked / beep`), so `explain` carries it; a trace item's own `caption` replaces the whole line |
| `trace` | required: items fired in order. An event name (must be legal from the current state — the validator lists the legal ones when it is not); `{"on": "ev", "caption": "…"}` to narrate that step yourself; `{"note": "…"}` for a captioned pause; `{"goto": "state", "caption": "…"}` to jump the token without a transition — how you show a second path after the first has ended |
| `layout` | `lr` (default) \| `tb` \| `circle`. `lr` and `tb` layer the states by distance from `initial` and order each layer to straighten the arrows; **ties follow the order of `states`**, so when two branches from one state collide, moving the target state earlier or later in the list moves it in the picture (ib, v15). `lr` with more than five or six states runs wide — the check warns past 2000px; use `tb`. `circle` suits a small ring of states with few branches; on a mostly linear machine every label lands on a neighbour |

Each event is a step captioned `on <event>: a → b`; a token slides along the
arrow. States and transitions the trace never reaches are still drawn, and the
check warns about each: extend the trace, or after the main path ends add
`{"goto": "<state>", "caption": "The other path: …"}` and play the alternative.

## kind: heap

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "heap",
  "title": "Min-heap",
  "type": "min",
  "ops": [
    { "push": 5 }, { "push": 3 }, { "push": 8 }, { "push": 1 },
    { "note": "The root is always the minimum. Watch what pop does." },
    { "pop": true }
  ]
}
```

| field | |
|---|---|
| `type` | `min` (default) \| `max` |
| `initial` | numbers already in the tree — must ALREADY satisfy the heap property (placed without sifting) |
| `ops` | required, 1+: `{"push": n}` `{"pop": true}` `{"note": "…"}`; each may carry `caption` |

Every comparison and swap is a captioned step (`3 < parent 5: swap up`). The
check verifies the final tree is a heap and that pops come out in order.

## kind: distributed

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "distributed",
  "title": "Write with replication",
  "nodes": ["client", { "id": "primary", "status": "leader" }, "replica"],
  "messages": [
    { "from": "client", "to": "primary", "label": "write x=1" },
    { "from": "primary", "to": "replica", "label": "replicate" },
    { "from": "replica", "to": "primary", "label": "ack" },
    { "from": "primary", "to": "client", "label": "ok" }
  ],
  "events": [{ "after": "ok", "node": "replica", "status": "down", "caption": "replica crashes" }]
}
```

| field | |
|---|---|
| `nodes` | required: `"id"` or `{"id", "label", "status": up \| down \| leader \| busy}` |
| `messages` | required: `{"from", "to", "label", "at": ms \| "<", "after": "label", "delay": ms, "latency": ms, "lost": true, "caption"}`; `at` defaults to right after the previous message lands, `"<"` starts it together with the previous message (a broadcast), `latency` defaults to `stepMs`; `after` starts it when the earlier message with that label lands (+ `delay`); a label sent twice is named `"from->to:label"`. `{"note": "…", "at" \| "after", "delay"}` in the same list is a captioned pause: nothing travels, every node waits for it, and it defaults to when everything so far has landed |
| `events` | `{"after": "label" \| "at": ms, "delay": ms, "node", "status", "caption"}` — recolours the node from that moment. Prefer `after`: an absolute `at` stays put when you lengthen a latency upstream, and the check warns when it then lands mid-flight or a down node keeps sending |

Sequence-diagram picture: node boxes across the top, lifelines down, time runs
down the canvas, each message a dot travelling with its arrow drawing in
behind. A message into a node that is down when it lands should be
`"lost": true` (the check warns otherwise).

**When does a message with no `at` / `after` start?** The scene's `timing` decides:

- `"causal"` (default): when its **sender is free** — after the last message the
  sender received has landed, and after the sender's own previous message has
  landed. So a reply waits for what it replies to, a side branch from another
  node never delays it, and two senders with nothing to wait for send at once.

  ```
  { "from": "a", "to": "b", "label": "req" }        sent 0,   lands 600   (a had nothing to wait for)
  { "from": "b", "to": "a", "label": "reply" }      sent 600, lands 1200  (b received req at 600)
  { "from": "b", "to": "c", "label": "notify" }     sent 1200            (b's own reply landed at 1200)
  { "from": "a", "to": "d", "label": "log" }        sent 1200            (a received reply at 1200; c's branch is irrelevant)
  ```

  A node that should wait before sending (a timeout, a slow disk) says so:
  `{"after": "req", "delay": 400}`. Inserting a message from one node never
  moves another node's messages.
- `"sequential"`: when the previous message in the list lands, whatever the
  sender. Reads plainly for one linear chain, but **inserting a message in the
  middle delays everything after it** — anchor the side branch with `after`
  and anchor the message it would otherwise push.

Either way, `"at": "<"` sends together with the previous message and `after`
pins to a landing. A lost message still "lands" for anchoring purposes at
the moment it would have arrived (send + latency), so a timeout can be
`{"after": "<the lost request>", "delay": 400}`. A label used as an `after`
target on its own must be unique; when the same label goes to two nodes (a
broadcast, every message of a two-participant commit) name the one you mean as
`"after": "coord->p2:ack"` — `from->to:label`, or `from->to` when that pair
sends once. The validator names the choices. `delay` on an event or message is milliseconds after its `after` anchor
lands. Run `explain` after an edit and read the times: a beat that moved when
it should not have is the tell.

## kind: matrix

A grid of cells: a dynamic-programming table filling in, a matrix, a table of
rows. A single row (`"cells": [[3, 1, 2]]`) is a plain array.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "matrix",
  "title": "Edit distance: cat → cut",
  "rowLabels": ["", "c", "a", "t"],
  "colLabels": ["", "c", "u", "t"],
  "cells": [
    [0, 1, 2, 3],
    [1, null, null, null],
    [2, null, null, null],
    [3, null, null, null]
  ],
  "ops": [
    { "set": { "cell": [1, 1], "value": 0, "from": [[0, 0]] }, "caption": "c = c: copy the diagonal" },
    { "set": { "cell": [1, 2], "value": 1, "from": [[1, 1]] }, "caption": "c ≠ u: 1 + the smallest neighbour" },
    { "set": { "cell": [1, 3], "value": 2, "from": [[1, 2]] } },
    { "set": { "cell": [2, 1], "value": 1, "from": [[1, 1]] } },
    { "set": { "cell": [2, 2], "value": 1, "from": [[1, 1], [1, 2], [2, 1]] }, "caption": "a ≠ u: 1 + min(diagonal, above, left) = 1 + 0" },
    { "set": { "cell": [2, 3], "value": 2, "from": [[2, 2]] } },
    { "set": { "cell": [3, 1], "value": 2, "from": [[2, 1]] } },
    { "set": { "cell": [3, 2], "value": 2, "from": [[2, 2]] } },
    { "set": { "cell": [3, 3], "value": 1, "from": [[2, 2]] }, "caption": "t = t: copy the diagonal" },
    { "mark": { "cell": [3, 3] }, "caption": "Edit distance is 1" }
  ]
}
```

| field | |
|---|---|
| `cells` | required: rows of `number` \| `string` \| `null`, all the same length; `null` is an empty cell waiting to be filled. A number is drawn as JavaScript prints it (`0.6`); write `"3/5"` as a string to keep your notation |
| `rowLabels`, `colLabels` | optional headers, one per row / column; captions use them instead of indices |
| `ops` | `{"set": {"cell": [r, c], "value": v, "from": [[r, c], …]}}` writes a value — `from` names the cells it was computed from, which flash while a token flies from each into the target; `{"highlight": T}` / `{"unhighlight": T \| "all"}` / `{"mark": T}` where T is `{"cell": [r, c]}` \| `{"cells": [[r, c], …]}` \| `{"row": r}` \| `{"col": c}` (highlight = accent until cleared, mark = permanent done colour); `{"swap": {"rows": [i, j]}}` / `{"swap": {"cols": [i, j]}}` (labels move with them); `{"note": "…"}`; each may carry `caption`, `ms` |

`ms` on a matrix op is that beat's length; only the annotation ops fold into
the previous beat with `"ms": 0` — a `set` is always a beat of its own. A
caption is free text and **not checked against what the op wrote**: "receives:
max, then +1" over a `set` that writes one cell promises a +1 no cell shows.
Write the second `set`, or write the caption for what this beat changes.

Cell references are `[row, col]`, 0-based, **by current position** (after a
swap, row 0 is whatever is now on top; the row label travels with its row,
so captions can keep naming rows by label). A `set` may write the value a
cell already holds — a beat that says "this one needs no change". `from` may list several cells (the
three neighbours a DP cell takes a min over); a token flies in from each.
The generated caption for a `set` reads `(row, col) = value (from (r, c), …)`
with the labels when there are any — it names the inputs but not why one won,
so write a `caption` on the beats where a comparison decides. The check reads
the final grid back by position and compares it with what the ops produced.

## kind: graph

Nodes and edges walked by a traversal. Nodes never move; the story is which
node is current, which are visited, what the labels say, and where the token
goes.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "graph",
  "title": "Shortest path A → E",
  "nodes": ["A", "B", "C", "D", "E"],
  "edges": [
    { "from": "A", "to": "B", "weight": 4 },
    { "from": "A", "to": "C", "weight": 1 },
    { "from": "C", "to": "B", "weight": 2 },
    { "from": "B", "to": "D", "weight": 1 },
    { "from": "C", "to": "D", "weight": 5 },
    { "from": "D", "to": "E", "weight": 3 }
  ],
  "algorithm": "dijkstra",
  "start": "A",
  "goal": "E"
}
```

| field | |
|---|---|
| `nodes` | required: `"id"` or `{"id", "label", "pos": [x, y]}` (`pos` pins a node) |
| `edges` | required: `{"from", "to", "weight", "label"}` or the shorthand `["a", "b"]`; the weight (or label) is drawn on the edge |
| `directed` | `true` draws arrows and `explore` must follow them; default `false` (lines, either direction) |
| `layout` | `circle` (default) \| `lr` \| `tb` \| `grid`; nodes with `pos` are pinned and the rest are laid out around them |
| `algorithm`, `start`, `goal` | `bfs` \| `dfs` \| `dijkstra` from `start` generates the ops (every beat captioned with the comparison it makes); `goal` makes Dijkstra paint the shortest path at the end |
| `ops` | explicit alternative: `{"visit": id}` (current = accent and larger, then stays green), `{"explore": "a->b"}` (a token travels the edge), `{"label": {"node": id \| [ids], "text": "…"}}` (text under the node: a distance, a depth), `{"highlight": id \| [ids]}` / `{"unhighlight": …}`, `{"path": ["a", "b", "c"]}` (paints the answer green), `{"note": "…"}`; each may carry `caption`, `ms` |

Colours: a node starts white; `highlight` makes it accent (amber by default)
and it stays amber until a `visit`, `path` or `unhighlight` recolours it —
so a node discovered but never dequeued ends amber, not green; `visit` makes
it accent and a little larger while it is the current node, and it turns
green ("visited") when the next `visit` happens or the animation ends; `path`
paints its nodes and edges green, and visited nodes off the path stay green
too. A node never touched stays white, so the final frame shows exactly what
the walk reached. Use explicit `ops` when the walk should be allowed to stop
before reaching everything (an `algorithm` visits every reachable node, and
the check holds it to that).

`ms: 0` on a `label` or `highlight` applies it at the current instant without
a step of its own — a relaxation writing the new distance inside the explore
beat. The generated ops use it; write it when two changes belong to one beat.
With an `algorithm`, the check fails unless every node reachable from `start`
was visited, and warns about nodes that are not reachable at all.

## kind: chart

A bar or line chart revealed series by series, with reference lines and focus.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "chart",
  "title": "p95 latency by region (ms)",
  "categories": ["us", "eu", "ap"],
  "series": [
    { "id": "before", "label": "before cache", "values": [120, 180, 260] },
    { "id": "after", "label": "after cache", "values": [40, 60, 90] }
  ],
  "sequence": [
    { "reveal": "before", "caption": "Before: every request hits the database" },
    { "threshold": { "value": 100, "label": "SLO" }, "caption": "The SLO is 100 ms; two regions miss it" },
    { "reveal": "after", "caption": "After: a regional cache absorbs most reads" },
    { "highlight": { "category": "ap" }, "caption": "ap improves most — it was furthest from the database" }
  ]
}
```

| field | |
|---|---|
| `type` | `bar` (default) \| `line` |
| `categories` | required: the x-axis labels |
| `series` | required, 1+: `{"id", "label", "values": number[], "color"}`, one value per category; colours default to a palette |
| `yMax`, `yLabel` | axis top and axis caption. Default top: 10% above the largest value (thresholds and `set` values included), rounded up to 1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 × 10ⁿ — a peak of 2.4 gets 3, of 260 gets 300 |
| `sequence` | `{"reveal": id \| [ids] \| "all"}` (bars grow in / the line draws in), `{"set": {"series", "index", "value"}}` (a bar animates to a new value; bar charts only), `{"highlight": T}` / `{"unhighlight": T \| "all"}` (everything outside T dims), `{"threshold": {"value", "label"}}` (a horizontal reference line), `{"note": "…"}`; each may carry `caption`, `ms`. Default: reveal each series in order |

A highlight target T picks by any combination of `series` and one of
`index` / `category`: `{"series": "after"}` is one series across every
category, `{"category": "ap"}` is every series in one category,
`{"series": "after", "category": "ap"}` is one bar. Every series stays
invisible until its own `reveal` (or `{"reveal": "all"}`); adding a series
to a hand-written sequence means adding its reveal, and the check warns
when one is missing. Without a `caption`, a `reveal` is captioned with the
series label; the story usually wants its own.
Put a `threshold` at the beat where it becomes relevant — after the series it
judges is on screen — rather than first. The check fails if a bar's final
height is not its value's share of the axis and warns about a series the
sequence never reveals.

## kind: flowchart

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "flowchart",
  "title": "Retry with a cap",
  "nodes": [
    { "id": "start", "label": "request", "shape": "terminal" },
    { "id": "send", "label": "send it" },
    { "id": "ok", "label": "2xx?", "shape": "decision" },
    { "id": "tries", "label": "tries < 3?", "shape": "decision" },
    { "id": "wait", "label": "back off" },
    { "id": "done", "label": "done", "shape": "terminal" },
    { "id": "fail", "label": "give up", "shape": "terminal" }
  ],
  "edges": [
    ["start", "send"], ["send", "ok"],
    { "from": "ok", "to": "done", "label": "yes" },
    { "from": "ok", "to": "tries", "label": "no" },
    { "from": "tries", "to": "wait", "label": "yes" },
    { "from": "tries", "to": "fail", "label": "no" },
    ["wait", "send"]
  ],
  "walk": ["send", "ok", "tries", "wait", "send", "ok", "done"]
}
```

| field | |
|---|---|
| `nodes` | required: `"id"` or `{"id", "label", "shape", "pos"}`. `shape`: `process` (a box, default), `decision` (a diamond — a question with labelled ways out), `terminal` (a pill: start, end, give up), `io` (a slanted box: input / output). `pos` pins a node |
| `edges` | required: `["from", "to"]` or `{"from", "to", "label"}`; one edge per pair. A decision's ways out carry their answer as `label` (`yes` / `no`, or the condition); the check warns when one has none |
| `start` | the node the walk starts at; default the first node |
| `walk` | the nodes visited after `start`, in order — every hop must be an edge (the validator names the ways out when it is not); `{"at": "id", "caption": "…"}` to narrate a hop yourself, `{"note": "…"}` for a captioned pause, and any annotation op |
| `layout` | `tb` (default) \| `lr`. Nodes are layered by distance from `start`; a loop — an edge back to an earlier node — runs round the outside of the chart, as a hand-drawn one does |

Each hop is a step: `send it → 2xx?`, or out of a decision `2xx?: no → tries < 3?`
— the question, the answer, the destination. A token slides along the arrow;
visited nodes turn green, the current one the accent colour. The check warns
about a decision with one way out (a question with one answer is a step), a way
out of a decision without a label, a node the walk never reaches, and a walk
that stops at a node with a way out. A fact sheet (`check --expect`) for a
flowchart has `nodes`, `edges` (`"a->b"` or `"a->b:yes"`), `visited` (`start`
first, then every hop) and `end`.

## kind: gantt

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "gantt",
  "title": "Release 1.2",
  "unit": "day",
  "tasks": [
    { "id": "design", "label": "Design", "start": 0, "end": 3, "lane": "UX" },
    { "id": "build", "label": "Build", "start": 3, "end": 8, "lane": "Eng", "after": ["design"] },
    { "id": "qa", "label": "QA", "start": 8, "end": 10, "lane": "QA", "after": ["build"] },
    { "id": "ship", "label": "Ship", "start": 10, "milestone": true, "lane": "QA", "after": ["qa"] }
  ],
  "ops": [
    { "advance": 3 },
    { "advance": 6, "caption": "Day 6: build is halfway" },
    { "slip": { "task": "build", "end": 9, "cascade": true }, "caption": "A dependency breaks: build slips a day, and everything after it" },
    { "status": { "task": "qa", "state": "late" }, "caption": "QA starts a day late" },
    { "advance": 11 }
  ]
}
```

| field | |
|---|---|
| `tasks` | required: `{"id", "label", "start", "end", "lane", "after": ["id", …], "milestone": true, "owner"}`. `start` / `end` are in `unit`s — a number line, not a calendar. `lane` groups rows into a labelled band (tasks without one each get a row); `after` draws an arrow from each prerequisite's end to this start, and the check warns when this starts before one of them ends; a `milestone` is a diamond at `start` and has no `end`; `owner` is drawn small inside the bar (after it when the bar is short) |
| `unit` | the axis's word — `day` (default), `week`, `sprint`, `ms` |
| `tick`, `from`, `to` | axis step and range; default a 1-2-5 step over 0 … the latest end |
| `ops` | `{"advance": t}` moves the time cursor to `t`: bars fill as it passes, a task it enters lights, one it leaves settles green, and the step says who starts and who finishes (`day 3: Build starts; Design finishes`). `{"slip": {"task", "start", "end", "cascade": true}}` moves a task's dates (its bar stretches; the arrows touching it fade). Without `cascade` dependents stay where they were — slip them too, or say the plan absorbed it; with it, every dependent that would now start before this ends moves by that much, and theirs after them, and the step names them (`Build slips: 3–8 → 3–9; QA, Ship move with it`). `{"status": {"task", "state": "late" \| "blocked" \| "done"}}` colours a task by what happened to it. `{"note": "…"}` and every annotation op. All take `caption` and `ms` |

The check warns when a task starts before something it depends on ends, when
the cursor stops before a task's end (the viewer never sees it finish), and
errors when the cursor goes backwards. Anchors: a task id, a lane name, a
dependency `"pre->task"`, `"cursor"` — so `{"callout": {"at": "build", "text":
"blocked on the API"}}` and `{"value": {"id": "eta", "text": "day 11", "at":
"ship", "side": "right"}}` work as in every kind.

## kind: sequence

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "sequence",
  "title": "Login with a cache miss",
  "participants": [{ "id": "user", "label": "User", "kind": "actor" }, { "id": "web", "label": "Web" }, { "id": "auth", "label": "Auth" }, { "id": "db", "label": "DB" }],
  "messages": [
    { "from": "user", "to": "web", "label": "POST /login" },
    { "from": "web", "to": "auth", "label": "verify(token)" },
    { "alt": [
      { "when": "cached", "items": [{ "from": "auth", "to": "web", "label": "ok (cached)", "kind": "return" }] },
      { "when": "miss", "items": [
        { "from": "auth", "to": "db", "label": "SELECT user" },
        { "from": "db", "to": "auth", "label": "row", "kind": "return" },
        { "from": "auth", "to": "web", "label": "ok", "kind": "return" }
      ] }
    ] },
    { "from": "web", "to": "user", "label": "200 + cookie", "kind": "return" },
    { "from": "web", "to": "auth", "label": "audit(login)", "kind": "async" }
  ]
}
```

| field | |
|---|---|
| `participants` | required: `"id"` or `{"id", "label", "kind"}`; `kind` is `system` (a box, default) or `actor` (a pill — a person). Left to right in list order |
| `messages` | required, in order down the page. A message `{"from", "to", "label", "kind", "caption", "ms"}`: `kind` is `call` (default — solid, filled head; **activates** the receiver, drawn as a bar on its lifeline, until that participant returns), `return` (dashed, open head) or `async` (solid, open head, activates nothing); `from` = `to` is a hook to oneself. `{"note": "…", "at": "participant"}` is a captioned pause. `{"loop": "while …", "items": […]}` and `{"alt": [{"when": "…", "items": […]}, …]}` draw a frame round their items (an `alt` needs two or more branches, separated by a dashed line; each branch starts from the activations as they were when the `alt` opened). Any annotation op |

Nothing here is timed — order is the meaning — where `distributed` is about
*when* messages land. Each message is one beat, captioned `web → auth:
verify(token)` (a return reads `web ← auth: ok`). The arrow draws in; a frame
appears with its first inner message. An activation bar starts where the call
lands and grows one row per beat; at the participant's `return` it **stops
growing** — it does not shrink or vanish, so in a frame near the end "closed at
the last message" and "still open" look alike, and `check` (not the picture)
says which participants are still activated. A frame's label (`"loop": "until
paid, max 2"`, `"when": "declined"`) is free text. `items` take the same
entries as `messages`, recursively: an `alt` inside a `loop` is a frame inside
a frame. The check warns about a return from a participant no call activated,
a participant still activated at the end, one that sends and receives nothing,
and an `alt` with one branch. Anchors: a participant id, a message label used
once, `"from->to"`, a frame's label, `"participants"`.

## kind: diagram

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "diagram",
  "title": "Request path",
  "nodes": [
    { "id": "browser", "label": "Browser" },
    { "id": "api", "label": "API" },
    { "id": "db", "label": "Database", "hidden": true }
  ],
  "edges": [
    { "from": "browser", "to": "api", "label": "GET /items" },
    { "from": "api", "to": "db", "hidden": true }
  ],
  "sequence": [
    { "flow": "browser->api", "caption": "The browser calls the API" },
    { "show": "db", "caption": "The API needs the database" },
    { "flow": "api->db" },
    { "flow": "db->api", "caption": "Rows come back" },
    { "highlight": "browser", "caption": "…and the page renders" }
  ]
}
```

| field | |
|---|---|
| `nodes` | required: `{"id", "label", "shape": rect \| circle \| ellipse, "pos": [x, y], "fill", "tone", "hidden": true}`; `tone` is `accent` (fills the box), `bad` or `muted` (outline and label) — a colour role for a still, without a `highlight` step |
| `edges` | `{"from", "to", "label", "style": arrow \| line \| dashed \| implements \| forbidden, "tone", "hidden": true}`; `implements` is dashed with a hollow head (realises an interface, still laid out); `tone` colours one edge `accent` \| `bad` \| `muted` |
| `layout` | `lr` (default) \| `tb` \| `grid` \| `circle`; nodes with `pos` are pinned |
| `sequence` | one action per step + optional `caption`, `ms`: `{"show": id \| [ids]}` `{"hide": …}` `{"highlight": …}` `{"unhighlight": …}` `{"flow": "a->b"}` (token travels along an existing edge, either direction) `{"note": "…"}` (captioned pause) `{"relabel": {"id", "text"}}` |

Hidden nodes and edges stay invisible until a `show`; an edge follows its nodes' visibility.
A `show` / `hide` fades over at most 250 ms and puts its step marker at the end of the fade, and
`highlight` / `unhighlight` recolour instantly, so the frame at a step (`render --step`, the
contact sheet) shows what its caption names. `"ms": 0` on `show` / `hide` / `highlight` /
`unhighlight` applies it inside the surrounding beat with no step of its own — `{"show": ["b"], "ms": 0}, {"highlight": ["a", "b"], "caption": "…"}`
is one beat in which `b` appears and both light up.

## kind: modules

A module map for when the picture, not the motion, is the explanation: which
modules exist, what depends on what, which belong together. Dependencies
point one way (down by default) and the layout follows from them; containers
group modules. Without a `sequence` it is a **still figure** —
`vlmkit-anim still scene.json --out map.svg` (or `.png`) renders it without
a caption band. With a `sequence` it is walked in beats like a `diagram`.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "modules",
  "title": "A web service, by module",
  "modules": ["web", "api", { "id": "auth", "label": "auth service" }, "db", "cache", "logging"],
  "deps": [["web", "api"], ["api", "auth"], ["api", "db"], ["api", "cache"], ["auth", "db"], { "from": "api", "to": "logging", "style": "line", "label": "emits" }],
  "groups": [
    { "id": "edge", "label": "edge", "modules": ["web"] },
    { "id": "core", "label": "core", "modules": ["api", "auth"] },
    { "id": "infra", "label": "infrastructure", "modules": ["db", "cache", "logging"] }
  ]
}
```

| field | |
|---|---|
| `modules` | required: ids, or `{"id", "label", "tone", "hidden"}`; `tone` is `accent` (the box is filled — the module the figure is about), `bad` or `muted` (outline and label; a test double, a deprecated module) |
| `deps` | `["a", "b"]` reads **a depends on b**: the arrow runs a → b and a sits above b. Long form `{"from", "to", "label", "style", "tone", "hidden"}`; `style` is `arrow` (default), `line` (no head), `dashed` (an optional or weak dependency — still laid out), `implements` (dashed with a hollow head: the module realises an interface — still laid out) or **`forbidden`** (dashed, in the `bad` colour, labelled ✗ unless you label it: drawn, but ignored by the layout and the cycle check — the import that must not exist, shown next to the ones that do). `tone` colours one dependency `accent` \| `bad` \| `muted` in a still, with no sequence — on its own, `{"from", "to", "tone": "accent"}` is a plain arrow in the accent colour; `style` stays at its default |
| `groups` | `{"id", "label", "modules": [ids], "parent"}` — a container around its modules; a module is in at most one (the innermost, when groups nest). `parent` nests one container inside another: `"parent": "backend"` on `services` and `core` draws them inside `backend`, whose box wraps theirs with room for their labels, and the layout keeps each inner group's modules together. Group ids are anchors (`callout`, `group`, `relate`) and `highlight` targets (the outline lights up) |
| `layout` | `tb` (default, dependencies point down) or `lr` (they point right) |
| `sequence` | optional: the `diagram` steps — `show`, `hide`, `highlight`, `unhighlight`, `flow "a->b"`, `note`, `relabel` — and every annotation op, **one action per step** plus `caption` / `ms` (a callout on the same beat as a highlight is the next step with `"ms": 0`). `show` / `hide` take module and group ids; `highlight` takes those **and an edge `"a->b"`** (the stroke and its label light up); `flow` takes an edge; the annotation ops take module ids, group ids and `"a->b"` |

The layout is automatic and deliberate. A module's layer is one below the
deepest module **it depends on**, so leaves are at the bottom and two modules
with the same dependencies share a layer whatever depends on them (what
depends on a module does not move it). Within a layer, modules are ordered so
edges run as straight as they can; an edge that would otherwise pass behind a
module that is not one of its ends bends around it. A group whose layers hold
nothing but its members is a full-width row (a "frontend" row above a
"domain" row above a "platform" row); groups that share a layer with something
else each get their own band across the layers, so a container is drawn
around exactly its members and never encloses a bystander. A **dependency
cycle** is a warning (`dependency cycle: a → b → c → a`): the layout cuts it at
the last edge and draws that arrow against the flow, which is what a cycle
looks like — keep it if the cycle is the point, break it, or mark the edge to
remove with `"style": "forbidden"`. The canvas is sized for the map; set
`canvas` to override.

A still has its own colour vocabulary, so nothing has to be animated to be
pointed at: `"tone": "accent"` on a module fills it, on a dependency colours
the arrow and its label; `"muted"` greys a test double or a legacy module;
`"style": "implements"` draws the adapter → port arrow dashed with a hollow
head, the way UML draws a realisation; and `{"relate": {"from": "postgres",
"to": "memory", "style": "equals", "label": "substitutable"}}` in a one-beat
`sequence` draws a double line between two modules that satisfy the same
interface.

The dependency someone keeps adding by mistake belongs in `deps` as
`{"from": "domain", "to": "postgres", "style": "forbidden", "label": "never"}`:
it is drawn red and dashed among the real arrows without bending the layers
around it. (A `relate` with `"tone": "bad"` draws the same thing as an
annotation, at a beat of the sequence.)

For a plain dependency graph without containers, `modules` without `groups`;
for a graph that is walked by an algorithm (BFS, Dijkstra) use `graph`, whose
`lr` / `tb` layouts layer the same way.

## Still figures

Any scene is a figure at any instant: `vlmkit-anim still scene.json --out
fig.svg` renders the final frame without the caption band (`--step N` or
`--at ms` for another instant; `.png` needs playwright). `modules` and a
`diagram` without `sequence` are written for this; a `matrix` after its ops,
a `graph` after its walk, or a `chart` fully revealed are stills too. `check`
does not warn about a missing `sequence` on `modules`; it does on `diagram`,
where the beats are the point. A still may still carry a one-beat `sequence`
for emphasis — `{"highlight": ["handlers->services", "services->events"]}`
colours those edges, a `callout` at an edge or module adds a note, a `text`
block without `at` says what the map leaves out ("tests omitted") — since
`still` renders the last frame.

## Checking a figure against the facts

`check` proves the scene is well-formed and `layout` that nothing is drawn on
anything, and both were green on a module map that had deleted a true
dependency to quiet a cycle warning and on a walk that highlighted the wrong
edge. Neither reads what the figure is *about*. When the facts exist somewhere
— a brief, the bundler's import list, the `package.json` files — write them as
an expectation file and pass it to `check`:

```json
{
  "format": "vlmkit-anim/expect@1",
  "modules": ["web", "api", "auth", "db", "cache", "logging"],
  "deps": ["web->api", "api->auth", "api->db", "api->cache", "auth->db", "api->logging"],
  "highlighted": [],
  "groups": { "edge": ["web"], "core": ["api", "auth"], "infra": ["db", "cache", "logging"] }
}
```

```
vlmkit-anim check scene.json --expect facts.json
```

| field | |
|---|---|
| `modules` | ids that must be drawn and visible at the end. A drawn module the list does not have is an error too — the facts fix the ids, so spell them as the facts do |
| `deps` | `"a->b"` (a depends on b): drawn, in that direction, as a real dependency. A real dependency drawn that is on neither `deps` nor `forbidden` is an error: nothing invented |
| `forbidden` | `"a->b"`: drawn with `"style": "forbidden"`. Drawn as a real arrow it is an error — that arrow bends the layers around a lie |
| `highlighted` | module and group ids and edges `"a->b"` that are lit in the **final frame**, and nothing else; read from the frame, so a `flow` (which lights nothing at the end) or a later `unhighlight` counts as dark, and a module or dependency with `"tone": "accent"` counts as lit |
| `groups` | `{"id": ["member", …]}`: each container holds exactly these **own** members — a nested group's members are its own, not its parent's, so `"platform": ["api"]` when `services` and `kernel` sit inside `platform`; a drawn group the list does not have is an error. Nesting itself is not a fact the sheet checks: confirm it in the figure (`vlmkit-anim still`), where the inner box lies inside the outer |

Every field is optional and an absent field is not checked; a present one is
checked exactly, both ways. Fact sheets for the still-figure briefs are in
`fixtures/anim-scenario/briefs/facts/`; `vlmkit-anim repo` writes the
workspace's own as `repo.expect.json`, so a map drawn by hand from the
`package.json` files is checked against them rather than against itself, and
`vlmkit-anim facts src --depth 1 --out src.expect.json` writes one from a
directory's **import graph** — the entries at that depth are the modules, every
relative import crossing between two of them a dependency — so a map drawn by
hand from reading the code is checked against the code.
`vlmkit-anim schema --kind expect` prints the field list.

The walked kinds have sheets of their own, read from where each truth is: the
scene for what is declared, the compiled walk for what it did, the final frame
for what the reader sees.

| kind | fields | |
|---|---|---|
| `graph` | `nodes`, `edges`, `visited`, `path`, `labels`, `highlighted` | `edges` are `"a->b"` — in that direction when `directed`, either way otherwise (`"a<->b"` says so). `visited` is the order of visits (the `visit` ops, or the algorithm's from `start`); `path` the nodes lit at the end, in order; `labels` `{"node": "text"}` what stands beside a node at the end; `highlighted` the nodes lit by `highlight` (a visited node is green, not lit) |
| `state-machine` | `states`, `transitions`, `initial`, `final`, `visited`, `end` | `transitions` are `"a->b"` or `"a->b:event"` — with the event it must match. `final` are the states drawn with the double ring; `visited` the states the token walks, from `initial`; `end` where it stops, lit in the final frame |
| `distributed` | `nodes`, `messages`, `lost`, `status` | `messages` are `"a->b"` or `"a->b:label"` in the order written (notes and annotations skipped); `lost` the ones that never land, and no other; `status` `{"node": "down"}` read from the final frame |
| `sequence` | `nodes`, `messages` | `nodes` are the participants; `messages` `"a->b"` or `"a->b:label"` in the order written, frames flattened (a `loop`'s items once, every `alt` branch in turn), notes and annotations skipped |
| `flowchart` | `nodes`, `edges`, `visited`, `end` | `edges` are `"a->b"` or `"a->b:yes"` — with the answer it must match; `visited` the walk from `start` (which it includes); `end` where it stops |

A sheet field the kind does not have is one error saying so; the rest is
compared. Other kinds (sort, matrix, chart, gantt, …) have their own semantic
checks and no sheet yet.

## kind: vector

For anything the semantic kinds do not cover: shapes plus a list of tweens.
Before reaching for it, check the table: an array is a one-row `matrix`, a
tree is a `graph` with `layout: "tb"`, a sequence of numbers is a `chart`.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "vector",
  "title": "Two balls",
  "canvas": { "width": 400, "height": 200 },
  "nodes": [
    { "id": "a", "shape": "circle", "pos": [40, 60], "r": 16, "fill": "#f59e0b" },
    { "id": "b", "shape": "rect", "pos": [40, 140], "size": [40, 30], "fill": "#3b82f6" }
  ],
  "timeline": [
    { "target": "a", "to": { "x": 360 }, "duration": 800, "easing": "ease-out", "caption": "a slides right" },
    { "target": "b", "to": { "x": 360, "rotate": 90 }, "duration": 800, "at": "<" },
    { "wait": 200 },
    { "target": ["a", "b"], "to": { "opacity": 0.2 }, "duration": 400, "caption": "both fade" }
  ]
}
```

| tween field | |
|---|---|
| `target` | node id or list of ids |
| `to` | properties reached by the end: `x`, `y` (or `pos: [x, y]`), `w`, `h` (or `size`), `r`, `opacity`, `fill`, `stroke`, `color`, `scale`, `rotate`, `dash` (0..1 stroke draw progress), `text` |
| `duration` | ms, default 500 |
| `easing` | `linear` `ease` `ease-in` `ease-out` `ease-in-out` `step-end` `step-start` `cubic-bezier(a,b,c,d)` |
| `at` | omitted = after the previous item; `"<"` = together with the previous item, whether that item is a tween or a `wait`; `"+200"` / `"-100"` = offset from its end; a number = absolute ms |
| `caption`, `label` | make this tween a step; an item with neither is motion only and gets no line in `explain` (a `duration: 0` text change riding on `"<"` is the usual case) |
| `{"wait": ms, "caption"}` | a pause instead of a tween; the next item starts when it ends |

Nodes (also the Timeline's node model):

| field | |
|---|---|
| `id`, `shape` | required; shape: `rect` `circle` `ellipse` `text` `line` `arrow` `path` `group` |
| `pos` | `[x, y]`, the shape's centre (default `[0, 0]`) |
| `size` `[w, h]` | rect / ellipse (required) |
| `r` | circle (required) |
| `points` `[[x1,y1],[x2,y2]]` | line / arrow (required), local to `pos` |
| `d` | path (required) |
| `text` | required for `text`; on any other shape draws a centred label |
| `fill` `stroke` `strokeWidth` `color` `opacity` `rx` `fontSize` `anchor` `dash` `scale` `rotate` | as in SVG; `color` is the text colour |
| `parent` | id of a `group` node; children move with it |

## Annotations (every kind)

Six ops every kind accepts **in its own op list** (`ops`, `sequence`, `trace`,
`messages`, `timeline`), next to its own verbs. They exist because a value
often has to stay readable beside the thing it describes, a viewer needs to be
pointed at one cell, an earlier value must survive to be compared, a relation
between two things has to be drawn rather than stated, and a rule or a few
lines of code have to be *on screen*, not in the caption. None of
them takes a coordinate: each names an **anchor**, one of the things the kind
already draws. An annotation op is an entry of its own: **one op per entry**,
plus `caption` and `ms` — `{"highlight": "a", "callout": {…}}` is an error
("a step needs exactly one action key"). To put a callout on the same beat as
a verb, write it as the next entry with `"ms": 0`, as the `value` lines below
do.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "array",
  "title": "Binary search for 23",
  "values": [2, 5, 8, 12, 16, 23, 38, 56],
  "ops": [
    { "pointers": { "lo": 0, "hi": 7, "mid": 3 }, "caption": "mid = (lo + hi) / 2" },
    { "value": { "id": "cmp", "label": "comparisons", "text": 1 }, "ms": 0 },
    { "callout": { "at": "3", "text": "12 < 23: search the right half" } },
    { "pointers": { "lo": 4, "mid": 5 }, "caption": "lo = mid + 1" },
    { "value": { "id": "cmp", "text": 2 }, "ms": 0 },
    { "callout": null, "ms": 0 },
    { "found": 5, "caption": "23 is at index 5" },
    { "text": { "lines": ["while lo <= hi:", "  mid = (lo + hi) // 2", "  if a[mid] < x: lo = mid + 1"], "highlight": 2 } }
  ]
}
```

| op | |
|---|---|
| `{"value": {"id", "label", "text", "at", "side"}}` | A named readout. The first op with an `id` creates it; a later op with the same `id` updates the text in place. Without `at` it sits in a panel on the right (the canvas widens to fit); with `at` it sits beside that anchor, `side` = `above` \| `below` (default) \| `left` \| `right`. Generated caption `label = text`, so `explain` carries every change |
| `{"callout": {"at", "text", "side", "id"}}` / `{"callout": null}` | A text box with a pointer at the anchor, `side` default `above`. One callout per `id` (`"main"` when omitted): a new one replaces it, `null` hides every callout |
| `{"snapshot": {"of", "label"}}` | A frozen copy, in the panel, of what the anchor shows **at this beat** — the value to compare against later, after the live one has moved on. An anchor that is several cells (a matrix row) snapshots as `[a, b, c]` |
| `{"group": {"around": anchor \| [anchors], "label", "id"}}` / `{"group": null}` | A dashed outline around the anchors' bounding box, label at the top-left. One per `id`, like callout; `null` removes every group |
| `{"text": {"lines": [...], "highlight", "at", "side", "id"}}` / `{"text": null}` | A multi-line block: code, a rule, a list. `highlight` is a 0-based line. Same `id` and the same number of lines updates in place and moves the highlight; a different line count redraws. Panel by default, or beside an anchor; `null` hides every block |
| `{"relate": {"from", "to", "label", "style", "tone", "id"}}` / `{"relate": null}` | A line between two anchors — `A ≤ C`, "this came from that", "these two are concurrent". `style` is `arrow` (default), `line` (no head) or `equals` (a double line: the two are equivalent / substitutable / satisfy the same interface); `tone` is `accent` (default), `bad` (red, dashed) or `muted`. Edge to edge when nothing is in the way; when the two touch or something else sits between them (rows A and C of three, bars with bars between) it runs **beside** the pair instead, level, on the side with room — and when neither side has room (a node row with the title above and the lanes below) it **arcs** over the bystander. The bystander is never crossed and nothing is placed off the canvas; the writer never has to reorder anything for it. `style` is `arrow` (default, from → to) or `line`; `tone` is `accent` (default — amber, the same colour every highlight uses), `bad` (red and dashed: a relation that must not exist) or `muted`; the label sits beside the midpoint, haloed so a line under it stays readable. One per `id`; `null` removes every relation. Where `group` would enclose a bystander, `relate` names the pair |

A rule that governs the whole scene — the definition of ≤ on vectors, the
invariant a loop keeps — is a `text` block **without** `at`: it goes to the
panel and stays there, referenceable, while the picture moves. `at` is for a
block that belongs to one thing.

**Where `side` puts it.** `side` is honoured: a callout or readout asked
`left` of the leftmost module lands left, and the canvas grows on that side
to make the room (the picture moves right or down by the same amount — every
side can grow, not only the bottom). The compiler moves it only when the asked
spot would cover another text or run through a line; then it tries the other
sides, nearest first, and grows an edge when nothing on the canvas is clear.
A callout's pointer goes round a labelled box in its way rather than through
it, and a callout on an edge points at the middle of the edge's line, bends
included. A **stated** `side` that could not be honoured is a `check` warning
naming the annotation, both sides and what was in the way (`asked for \`above\`
and landed \`below\`: it would cover "Vector clocks"`); the default side is a
preference, not an ask, and moves silently. So state `side` when it matters,
and when the warning comes either ask for the side it landed on or make room —
a shorter text, a different anchor — never a coordinate.

Every annotation op takes `caption` (replaces the generated one) and `ms`.
`"ms": 0` applies it **inside the previous beat** — the way to have "best so
far = 10" appear at the moment the reveal it belongs to happens, with its
caption joined to that beat's. "The moment" is the beat's **end**: the readout
becomes visible when the motion it belongs to completes, so a frame rendered at
that step's start (`render --step N`, the contact sheet) does not show it yet
and the next frame does. Joined means appended with ` · `, never
replaced, and an explicit `caption` on the folded op is joined the same way:
`{"note": "A has a local event"}` followed by `{"value": {"id": "vecA",
"text": "[1,0,0]"}, "ms": 0, "caption": "A: [0,0,0] → [1,0,0]"}` narrates as
`A has a local event · A: [0,0,0] → [1,0,0]`, one step. A misspelt anchor is an error naming the
anchors that exist: `no anchor named "row:D" in this matrix scene → did you
mean "row:C"? anchors here: "0,0", …`.

**Identity.** `callout`, `group`, `text` and `relate` are one-per-`id`, and an
omitted `id` is `"main"` — so two `relate` ops that both omit `id` are the
same relation, and the second **replaces** the first (that is how to retire
`A ∥ C` for `C ≤ A`); give ids only to the ones that must coexist. `value`
has no default: its `id` is required, because the id is how a later op finds
it. Replaced or nulled annotations are **faded out, not deleted**: the node
stays in the timeline and in a rendered frame at `opacity="0"`, so "gone"
means invisible — read opacity, not presence, when checking a frame.

**Anchors by kind** — what `at`, `of` and `around` may name:

| kind | anchors |
|---|---|
| `sort` | a value (`"5"` is the bar labelled 5, wherever it currently is) |
| `array` | an index (`"3"`), a pointer name (`"lo"`), `"window"` |
| `stack`, `queue` | a slot index (`"0"` is the bottom / front), a value (the newest box with it), `"top"` / `"front"` / `"back"` |
| `list` | a value, `"head"`, `"nil"` |
| `tree` | a value, `"cursor"` |
| `heap` | a slot index (`"0"` is the root), `"v7"` for the value 7 |
| `state-machine` | a state id, an event name (when one transition uses it), `"from->to"`, `"token"` |
| `distributed` | a node id (the node's box at the top of its lifeline, not the lifeline itself — a `relate` between two nodes runs along the top), a message label |
| `matrix` | a cell `"r,c"`, `"row:<label or index>"`, `"col:<label or index>"` |
| `graph` | a node id, an edge `"a->b"` |
| `chart` | a series id, a category, `"series/category"` |
| `diagram`, `modules` | a node or module id, a group id, an edge `"a->b"` (the dependency `["a", "b"]` is the edge `"a->b"`) |
| `vector` | a node id |

`vlmkit-anim schema --kind annotations` prints this table.

## kind: compose

Several scenes in one canvas: a before / after, a structure next to the
queue that drives it, a run next to its decision tree. Each pane is a whole
scene of any other kind and keeps its own anchors and annotations.

```json
{
  "format": "vlmkit-anim/scene@1",
  "kind": "compose",
  "title": "Two ways to sort 3, 1, 2",
  "layout": "row",
  "timing": "parallel",
  "panes": [
    { "title": "bubble", "scene": { "format": "vlmkit-anim/scene@1", "kind": "sort", "algorithm": "bubble", "values": [3, 1, 2] } },
    { "title": "insertion", "scene": { "format": "vlmkit-anim/scene@1", "kind": "sort", "algorithm": "insertion", "values": [3, 1, 2] } }
  ]
}
```

| field | |
|---|---|
| `panes` | required: `{"id", "title", "scene"}`; `scene` is a complete scene (its own `format` and `kind`), and may not itself be a `compose`. Errors inside a pane are reported under `panes[i].scene.…` |
| `layout` | `row` (default, side by side) \| `column` (stacked) \| `grid` (two per row) |
| `timing` | `sequence` (default): pane 2 starts when pane 1 ends, so captions never collide. `parallel`: all panes start at 0 — a before / after in lockstep; beats that coincide share one step and their captions join as `bubble: … · insertion: …` |
| `gap` | pixels between panes, default 32 |

Choose `sequence` when the second picture is the *consequence* of the first
(a history, then the comparison of two of its values); choose `parallel` when
the point is *when* things happen relative to each other (two protocols
finishing the same downloads). A pane's title is drawn above it, and each
pane keeps a faint border so the reader sees where one picture ends.

## Scenes generated from a repository

Two scenes nobody has to write: the workspace's architecture and the change
map of a range of commits. Both are ordinary `diagram` scenes — edit the
written `*.scene.json` and re-run `video` for a different cut.

```
vlmkit-anim repo --out docs/diagrams --name vlmkit-architecture
vlmkit-anim pr --base origin/main --title "PR #132: …" --out .vlmkit-anim/pr
```

- **`repo`** reads every `package.json` in the workspace and shows the packages
  layer by layer, from the ones that depend on nothing to the CLI, each beat's
  caption naming the dependencies that place a package where it is.
- **`pr`** reads `git log base..head`: one beat per commit, the **areas** it
  touched light up (a package's `src`, its fixtures, `docs/reports`, `tests`,
  `ci`), areas appear the first time a commit touches them, edges are the
  imports between changed areas as they stand at `head`, and two readouts
  count files and lines as they accumulate. More than fourteen areas fold into
  "other".

Each writes four files under `--out`: `<name>.scene.json`, `<name>.gif`,
`<name>.sheet.png` and `<name>.md` — the narration with both images embedded,
ready to paste into a pull request. Without a browser the images are skipped
and a `<name>.sheet.html` plus the final frame as SVG are written instead.
The repository's `pr-visual` workflow runs `pr` on every pull request and
keeps one comment on it up to date with the result.

## Writing a scene in TypeScript

JSON is the format. When the file is written from code — generated from data,
kept next to the program it explains, or edited with completion — write a
module instead and hand it to any verb:

```ts
// insertion.scene.ts
import { scene } from "@mizchi/vlmkit-anim";

export default scene.sort({
  title: "Insertion sort",
  algorithm: "insertion",
  values: [5, 3, 8, 1, 4],
});
```

```
vlmkit-anim check insertion.scene.ts        # any .ts / .mts / .js / .mjs whose default export is a scene
vlmkit-anim explain insertion.scene.ts
```

`scene.<kind>({ … })` has one constructor per kind (`scene.stateMachine` for
`state-machine`); it fills in `format` and `kind` and types the rest, so a
misspelt algorithm or an op the kind does not have is an editor error before it
is a `check` error. The result is the plain object the JSON file would hold:
`sceneJson(s)` writes that file for someone without a TypeScript toolchain, and
`defineScene({ format, kind, … })` type-checks a literal that mirrors the JSON
one to one. Nothing here adds to the format — the module is loaded with
`import()` (Node 24 runs `.ts` directly) and its default export goes through
the same validator as a file.

## Timeline (the compiled layer)

```json
{
  "format": "vlmkit-anim/timeline@1",
  "canvas": { "width": 300, "height": 120 },
  "nodes": [{ "id": "dot", "shape": "circle", "pos": [30, 60], "r": 12, "fill": "#f59e0b" }],
  "tracks": [
    { "target": "dot", "prop": "pos", "keyframes": [{ "t": 0, "value": [30, 60] }, { "t": 800, "value": [270, 60], "easing": "ease-in-out" }] }
  ],
  "steps": [{ "t": 0, "caption": "the dot crosses" }]
}
```

- `tracks[].prop`: `pos` `size` `r` `opacity` `fill` `stroke` `color` `scale` `rotate` `dash` `text` (discrete).
- `keyframes[].easing` is the curve **into** that keyframe. Times ascend; the first and last values hold outside the span.
- `steps`: chapter markers with `label` / `caption`; the runtime's ◀ ▶| buttons walk them. A step without a caption keeps the previous caption showing.
- `duration`: optional, computed from the last keyframe or step.

## Looking at it with a vision model

`sheet` puts every step on one image, tiles in reading order, each labelled
with step number, time and caption. One image is one call, the order is fixed
by layout, and a model judges "what changed between tile 3 and 4" far more
reliably than it reads absolute positions off a single frame. Two limits:
tiles shrink as frames grow (keep `--tile` at 300px+ and the count near a
dozen, or the labels inside frames stop being legible), and the sheet is for
the judgement "does this explain it?", not for correctness — `check` reads
sorted order, heap shape and trace legality back from the frames
deterministically, so do not spend a vision call on those.

## Video (GIF, MP4, WebM)

`vlmkit-anim video scene.json --out demo.gif` writes a file that plays where
no runtime runs: a README, a slide, a chat message. The frames are the same
deterministic samples `render` produces, at `--fps` (default 20), plus a
**hold** of `--hold` ms (default 400) on every step marker and on the last
frame — in a browser the viewer pauses to read a caption, in a video the file
has to do it. Identical consecutive frames collapse into one longer frame, so
a hold costs one frame.

- **`.gif`** is encoded in-process, no external tool. Flat SVG colours and
  text fit a 256-colour palette with no visible loss, and GIF autoplays inline
  everywhere. Size grows with pixel count: `--width 480` for a README, 640–800
  for a slide. `--no-loop` plays once.
- **`.mp4` / `.webm`** run `ffmpeg` (H.264 `yuv420p` / VP9) when it is on
  PATH. When it is not, the PNG frames and an `frames.ffconcat` list are left
  next to the output with the exact command printed; run it, or hand the
  frames to any encoder. MP4 is the format for X, YouTube and Keynote; GitHub
  renders MP4 only as an uploaded attachment, not from a repository path, so
  a README wants the GIF.

`sheet` and `video` divide the review work: the sheet is one image for a
vision model, the video is for a person.

## Embedding

`vlmkit-anim html scene.json --out page.html` writes a page with the runtime inline. For a site with many animations:

```html
<script src="vlm-anim.js"></script>                <!-- vlmkit-anim runtime --out vlm-anim.js -->
<vlm-anim src="sort.timeline.json" autoplay loop></vlm-anim>
<vlm-anim><script type="application/json">{ "format": "vlmkit-anim/timeline@1", … }</script></vlm-anim>
```

Attributes: `src`, `autoplay`, `loop`, `speed="1.5"`, `nocontrols`. Properties:
`ir` (set a timeline object directly), `time`, `duration`, `playing`,
`stepIndex`. Methods: `play()`, `pause()`, `seek(ms)`, `next()`, `prev()`.
Events: `step` (`detail: {index, step, time}`), `ended`. Under
`prefers-reduced-motion: reduce` it does not autoplay and shows the final
frame; the step buttons still walk the chapters.

Because the motion is ordinary Web Animations on ordinary SVG, `vlmkit check
animation page.html` evaluates it like any other page (visible effect, settle
time, reduced-motion honoured). `vlmkit-anim eval page.html` runs the same
evaluator without installing vlmkit: it needs the one package that holds the
measurement (`@mizchi/vlmkit-animation-eval`) plus `playwright`, both optional
peers of `vlmkit-anim`. Expect an `uncontrolled-motion` warning on an
autoplaying page — the runtime's master clock is a rAF loop the Web Animations
API cannot pause — and none with `html --no-autoplay`.
