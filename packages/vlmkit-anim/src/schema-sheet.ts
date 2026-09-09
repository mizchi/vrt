/**
 * The writing guide, one screen per kind: what fields exist, what each
 * accepts, and a minimal example that compiles clean. Printed by
 * `vlmkit-anim schema --kind <kind>` and mirrored in `docs/anim-ir.md`.
 *
 * `EXAMPLES` are the source of truth the tests compile; the prose is written
 * to be the ONLY thing a writer needs to read before producing a scene.
 */

import {
  SCENE_FORMAT,
  SCENE_KINDS,
  TIMELINE_FORMAT,
  type ArrayScene,
  type ChartScene,
  type ComposeScene,
  type DiagramScene,
  type DistributedScene,
  type GraphScene,
  type HeapScene,
  type ListScene,
  type MatrixScene,
  type ModulesScene,
  type QueueScene,
  type Scene,
  type SortScene,
  type StackScene,
  type StateMachineScene,
  type FlowchartScene,
  type GanttScene,
  type SequenceScene,
  type Timeline,
  type TreeScene,
  type VectorScene,
} from "./types.ts";

export interface Examples {
  sort: SortScene;
  array: ArrayScene;
  stack: StackScene;
  queue: QueueScene;
  list: ListScene;
  "state-machine": StateMachineScene;
  heap: HeapScene;
  tree: TreeScene;
  distributed: DistributedScene;
  matrix: MatrixScene;
  graph: GraphScene;
  chart: ChartScene;
  flowchart: FlowchartScene;
  gantt: GanttScene;
  sequence: SequenceScene;
  diagram: DiagramScene;
  modules: ModulesScene;
  vector: VectorScene;
  compose: ComposeScene;
  timeline: Timeline;
}

export const EXAMPLES: Examples = {
  sort: {
    format: SCENE_FORMAT,
    kind: "sort",
    title: "Bubble sort",
    algorithm: "bubble",
    values: [5, 3, 8, 1],
  },
  array: {
    format: SCENE_FORMAT,
    kind: "array",
    title: "Binary search for 23",
    values: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91],
    algorithm: "binary-search",
    target: 23,
  },
  stack: {
    format: SCENE_FORMAT,
    kind: "stack",
    title: "Matching brackets with a stack",
    ops: [
      { push: "(", caption: "Read (: an opener, push it" },
      { push: "[", caption: "Read [: another opener" },
      { pop: true, caption: "Read ]: it must match the top — [ does, pop it" },
      { pop: true, caption: "Read ): matches (, pop it" },
      { note: "Input consumed and the stack is empty: the brackets balance" },
    ],
  },
  queue: {
    format: SCENE_FORMAT,
    kind: "queue",
    title: "Print jobs",
    initial: ["report.pdf", "photo.png"],
    ops: [
      { enqueue: "memo.txt" },
      { dequeue: true, caption: "The printer takes the oldest job first" },
      { peek: true },
      { dequeue: true },
    ],
  },
  list: {
    format: SCENE_FORMAT,
    kind: "list",
    title: "Singly linked list",
    initial: [3, 7, 9],
    ops: [
      { insert: { value: 5, after: 3 } },
      { insert: { value: 1, at: 0 }, caption: "Insert 1 at the head: no shifting, the head pointer just moves" },
      { remove: 7 },
      { find: 9 },
      { reverse: true },
    ],
  },
  tree: {
    format: SCENE_FORMAT,
    kind: "tree",
    title: "Binary search tree",
    initial: [8, 3, 10, 1, 6],
    ops: [
      { insert: 14 },
      { insert: 4, caption: "4 goes under 3, then right of 3: 3 < 4 < 6" },
      { search: 6 },
      { delete: 3, caption: "3 has two children: its in-order successor 4 takes its place" },
      { traverse: "inorder" },
    ],
  },
  "state-machine": {
    format: SCENE_FORMAT,
    kind: "state-machine",
    title: "Door",
    states: ["closed", "open", { id: "locked", final: true }],
    initial: "closed",
    transitions: [
      { from: "closed", to: "open", on: "push" },
      { from: "open", to: "closed", on: "pull" },
      { from: "closed", to: "locked", on: "lock", note: "/ beep" },
    ],
    trace: ["push", "pull", { note: "Locking is the other way out of closed" }, "lock"],
  },
  heap: {
    format: SCENE_FORMAT,
    kind: "heap",
    title: "Min-heap",
    type: "min",
    ops: [{ push: 5 }, { push: 3 }, { push: 8 }, { pop: true }],
  },
  distributed: {
    format: SCENE_FORMAT,
    kind: "distributed",
    title: "Write with replication",
    nodes: ["client", { id: "primary", status: "leader" }, "replica"],
    messages: [
      { from: "client", to: "primary", label: "write x=1" },
      { from: "primary", to: "replica", label: "replicate" },
      { from: "replica", to: "primary", label: "ack" },
      { from: "primary", to: "client", label: "ok" },
    ],
    events: [{ after: "ok", node: "replica", status: "down", caption: "replica crashes" }],
  },
  matrix: {
    format: SCENE_FORMAT,
    kind: "matrix",
    title: "Edit distance: cat → cut",
    rowLabels: ["", "c", "a", "t"],
    colLabels: ["", "c", "u", "t"],
    cells: [
      [0, 1, 2, 3],
      [1, null, null, null],
      [2, null, null, null],
      [3, null, null, null],
    ],
    ops: [
      { set: { cell: [1, 1], value: 0, from: [[0, 0]] }, caption: "c = c: copy the diagonal" },
      { set: { cell: [1, 2], value: 1, from: [[1, 1]] }, caption: "c ≠ u: 1 + the smallest neighbour" },
      { set: { cell: [1, 3], value: 2, from: [[1, 2]] } },
      { set: { cell: [2, 1], value: 1, from: [[1, 1]] } },
      { set: { cell: [2, 2], value: 1, from: [[1, 1], [1, 2], [2, 1]] }, caption: "a ≠ u: 1 + min(diagonal, above, left) = 1 + 0" },
      { set: { cell: [2, 3], value: 2, from: [[2, 2]] } },
      { set: { cell: [3, 1], value: 2, from: [[2, 1]] } },
      { set: { cell: [3, 2], value: 2, from: [[2, 2]] } },
      { set: { cell: [3, 3], value: 1, from: [[2, 2]] }, caption: "t = t: copy the diagonal" },
      { mark: { cell: [3, 3] }, caption: "Edit distance is 1" },
    ],
  },
  graph: {
    format: SCENE_FORMAT,
    kind: "graph",
    title: "Shortest path A → E",
    nodes: ["A", "B", "C", "D", "E"],
    edges: [
      { from: "A", to: "B", weight: 4 },
      { from: "A", to: "C", weight: 1 },
      { from: "C", to: "B", weight: 2 },
      { from: "B", to: "D", weight: 1 },
      { from: "C", to: "D", weight: 5 },
      { from: "D", to: "E", weight: 3 },
    ],
    algorithm: "dijkstra",
    start: "A",
    goal: "E",
  },
  chart: {
    format: SCENE_FORMAT,
    kind: "chart",
    title: "p95 latency by region (ms)",
    categories: ["us", "eu", "ap"],
    series: [
      { id: "before", label: "before cache", values: [120, 180, 260] },
      { id: "after", label: "after cache", values: [40, 60, 90] },
    ],
    sequence: [
      { reveal: "before", caption: "Before: every request hits the database" },
      { threshold: { value: 100, label: "SLO" }, caption: "The SLO is 100 ms; two regions miss it" },
      { reveal: "after", caption: "After: a regional cache absorbs most reads" },
      { highlight: { category: "ap" }, caption: "ap improves most — it was furthest from the database" },
    ],
  },
  flowchart: {
    format: SCENE_FORMAT,
    kind: "flowchart",
    title: "Retry with a cap",
    nodes: [
      { id: "start", label: "request", shape: "terminal" },
      { id: "send", label: "send it" },
      { id: "ok", label: "2xx?", shape: "decision" },
      { id: "tries", label: "tries < 3?", shape: "decision" },
      { id: "wait", label: "back off" },
      { id: "done", label: "done", shape: "terminal" },
      { id: "fail", label: "give up", shape: "terminal" },
    ],
    edges: [
      ["start", "send"],
      ["send", "ok"],
      { from: "ok", to: "done", label: "yes" },
      { from: "ok", to: "tries", label: "no" },
      { from: "tries", to: "wait", label: "yes" },
      { from: "tries", to: "fail", label: "no" },
      ["wait", "send"],
    ],
    walk: ["send", "ok", "tries", "wait", "send", "ok", "done"],
  },
  gantt: {
    format: SCENE_FORMAT,
    kind: "gantt",
    title: "Release 1.2",
    unit: "day",
    tasks: [
      { id: "design", label: "Design", start: 0, end: 3, lane: "UX" },
      { id: "build", label: "Build", start: 3, end: 8, lane: "Eng", after: ["design"] },
      { id: "qa", label: "QA", start: 8, end: 10, lane: "QA", after: ["build"] },
      { id: "ship", label: "Ship", start: 10, milestone: true, lane: "QA", after: ["qa"] },
    ],
    ops: [
      { advance: 3 },
      { advance: 6, caption: "Day 6: build is halfway" },
      { slip: { task: "build", end: 9, cascade: true }, caption: "A dependency breaks: build slips a day, and everything after it" },
      { status: { task: "qa", state: "late" }, caption: "QA starts a day late" },
      { advance: 11 },
    ],
  },
  sequence: {
    format: SCENE_FORMAT,
    kind: "sequence",
    title: "Login with a cache miss",
    participants: [{ id: "user", label: "User", kind: "actor" }, { id: "web", label: "Web" }, { id: "auth", label: "Auth" }, { id: "db", label: "DB" }],
    messages: [
      { from: "user", to: "web", label: "POST /login" },
      { from: "web", to: "auth", label: "verify(token)" },
      {
        alt: [
          { when: "cached", items: [{ from: "auth", to: "web", label: "ok (cached)", kind: "return" }] },
          {
            when: "miss",
            items: [
              { from: "auth", to: "db", label: "SELECT user" },
              { from: "db", to: "auth", label: "row", kind: "return" },
              { from: "auth", to: "web", label: "ok", kind: "return" },
            ],
          },
        ],
      },
      { from: "web", to: "user", label: "200 + cookie", kind: "return" },
      { from: "web", to: "auth", label: "audit(login)", kind: "async" },
    ],
  },
  diagram: {
    format: SCENE_FORMAT,
    kind: "diagram",
    title: "Request path",
    nodes: [{ id: "browser", label: "Browser" }, { id: "api", label: "API" }, { id: "db", label: "Database", hidden: true }],
    edges: [{ from: "browser", to: "api", label: "GET /items" }, { from: "api", to: "db", hidden: true }],
    sequence: [
      { flow: "browser->api", caption: "The browser calls the API" },
      { show: "db", caption: "The API needs the database" },
      { flow: "api->db" },
      { flow: "db->api", caption: "Rows come back" },
      { highlight: "browser", caption: "…and the page renders" },
    ],
  },
  modules: {
    format: SCENE_FORMAT,
    kind: "modules",
    title: "A web service, by module",
    modules: ["web", "api", { id: "auth", label: "auth service" }, "db", "cache", "logging"],
    deps: [["web", "api"], ["api", "auth"], ["api", "db"], ["api", "cache"], ["auth", "db"], { from: "api", to: "logging", style: "line", label: "emits" }],
    groups: [
      { id: "edge", label: "edge", modules: ["web"] },
      { id: "core", label: "core", modules: ["api", "auth"] },
      { id: "infra", label: "infrastructure", modules: ["db", "cache", "logging"] },
    ],
  },
  vector: {
    format: SCENE_FORMAT,
    kind: "vector",
    title: "Two balls",
    canvas: { width: 400, height: 200 },
    nodes: [
      { id: "a", shape: "circle", pos: [40, 60], r: 16, fill: "#f59e0b" },
      { id: "b", shape: "rect", pos: [40, 140], size: [40, 30], fill: "#3b82f6" },
    ],
    timeline: [
      { target: "a", to: { x: 360 }, duration: 800, easing: "ease-out", caption: "a slides right" },
      { target: "b", to: { x: 360, rotate: 90 }, duration: 800, at: "<" },
      { wait: 200 },
      { target: ["a", "b"], to: { opacity: 0.2 }, duration: 400, caption: "both fade" },
    ],
  },
  compose: {
    format: SCENE_FORMAT,
    kind: "compose",
    title: "Bubble vs insertion",
    layout: "row",
    timing: "parallel",
    panes: [
      { title: "bubble", scene: { format: SCENE_FORMAT, kind: "sort", algorithm: "bubble", values: [3, 1, 2] } },
      { title: "insertion", scene: { format: SCENE_FORMAT, kind: "sort", algorithm: "insertion", values: [3, 1, 2] } },
    ],
  },
  timeline: {
    format: TIMELINE_FORMAT,
    canvas: { width: 300, height: 120 },
    nodes: [{ id: "dot", shape: "circle", pos: [30, 60], r: 12, fill: "#f59e0b" }],
    tracks: [{ target: "dot", prop: "pos", keyframes: [{ t: 0, value: [30, 60] }, { t: 800, value: [270, 60], easing: "ease-in-out" }] }],
    steps: [{ t: 0, caption: "the dot crosses" }],
  },
};

const COMMON = `Common to every scene
  "format": "${SCENE_FORMAT}"      required, exactly this string
  "kind": one of ${SCENE_KINDS.join(" | ")}
  "title": string                  optional; drawn at the top and used as the first caption
  "stepMs": number                 optional; milliseconds per beat (kinds default 500–700)
  "canvas": {"width", "height", "background"}   optional; kinds choose a size that fits
  "theme": {"node","nodeStroke","text","accent","muted","ok","bad","background","fontSize"}  optional colours

Captions are the explanation. Every beat that matters should carry one; the
runtime shows the current caption under the picture and \`vlmkit-anim explain\`
prints them as a numbered list. Write them for the reader, not the machine.
A "caption" on an op replaces the generated one; {"note": "…"} is a captioned
pause and counts as a step; compilers add a first (title / "Start") and a last
("Sorted" / "End") step of their own.

Annotations (every kind, in the same op list — vlmkit-anim schema --kind annotations):
  {"value": {"id", "label", "text", "at"?}}  a readout that tracks a number; same id = update
  {"callout": {"at", "text"} | null}          a pointer at an anchor        {"snapshot": {"of", "label"}}  a frozen copy
  {"group": {"around": [anchors], "label"}}   an outline                    {"text": {"lines": [...], "highlight"}}  a block
  {"relate": {"from", "to", "label"} | null}  a labelled arrow between two anchors ("style": "line" for no head, "equals" for a double line: substitutable)
  Anchors are what the kind documents: an index, a cell "r,c", a node id, a state, a value. "ms": 0 folds the op into the previous beat.`;

const ANNOTATIONS_SHEET = `Annotations — six ops every kind accepts in its own op / sequence / trace / messages / timeline list.
They add nothing a "vector" scene could not draw by hand; the point is that you never type a coordinate.

  {"value": {"id": "best", "label": "best so far", "text": "1/2"}}      a named readout in the panel on the right;
                                                                          the same id later updates it: {"value": {"id": "best", "text": "10"}}
  {"value": {"id": "vA", "label": "A", "text": "[1,0,0]", "at": "A"}}   …or beside an anchor ("side": above | below | left | right)
  {"callout": {"at": "3", "text": "pivot", "side": "above"}}             a text box with a pointer at the anchor; {"callout": null} hides it;
                                                                          "id" for several at once
  {"snapshot": {"of": "row:C", "label": "C at step 4"}}                   a frozen copy, in the panel, of what the anchor shows right now
  {"group": {"around": ["1", "2"], "label": "batch 1"}}                   a dashed outline around anchors; {"group": null} removes it
  {"text": {"lines": ["for i in a:", "  if i > x:"], "highlight": 1}}    a multi-line block (panel, or "at" an anchor); same id + same
                                                                          line count updates in place and moves the highlight; null hides
  {"relate": {"from": "A", "to": "B", "label": "A ≤ B"}}                  a labelled arrow from one anchor to another ("style": "line" for
                                                                          no head, "equals" for a double line — the two are equivalent /
                                                                          substitutable; "tone": "accent" (default, amber) | "bad" (red, dashed:
                                                                          a relation that must not exist) | "muted"); same id redraws it,
                                                                          {"relate": null} removes all.
                                                                          Where "group" would enclose a bystander, "relate" names the pair:
                                                                          edge to edge, or level beside the pair, or arced over what lies between

  Every op takes "caption" (replaces the generated one, e.g. "best so far = 1/2") and "ms" ("ms": 0 = inside the previous beat).
  explain lists value changes as their beats; check names the anchors that exist when one is misspelt.
  An omitted "id" on callout / group / text / relate is "main": a second op without an id replaces the first.
  Replaced or nulled annotations fade out and stay in the markup at opacity 0 — "gone" means invisible, not absent.

Anchors by kind (what "at" / "of" / "around" may name):
  sort           a value ("5" = the bar labelled 5, wherever it is)
  array          an index ("3"), a pointer name ("lo"), "window"
  stack / queue  a slot index ("0" = bottom / front), a value, "top" | "front" | "back"
  list           a value, "head", "nil"
  tree           a value, "cursor"
  heap           a slot index ("0" = root), "v7" (the value 7)
  state-machine  a state id, an event name (when only one transition uses it), "from->to", "token"
  distributed    a node id, a message label
  matrix         a cell "r,c", "row:<label or index>", "col:<label or index>"
  graph          a node id, an edge "a->b"
  chart          a series id, a category, "series/category"
  flowchart      a node id, an edge "a->b", an edge label (when only one edge carries it), "token"
  gantt          a task id, a lane name, a dependency "pre->task", "cursor"
  sequence       a participant id, a message label (when only one message carries it), "from->to" (the first), a frame's label, "participants"
  diagram / modules  a node or module id, a group id, an edge "a->b" (the dependency ["a", "b"] is the edge "a->b")
  vector         a node id`;

const SHEETS: Record<Scene["kind"] | "timeline", string> = {
  sort: `kind: sort — bars that swap into order
  "values": number[]               required, 2+ numbers
  "algorithm": "bubble" | "insertion" | "selection"
                                   generates the ops by running the algorithm; use this unless you need a custom walk
  "ops": [ {"compare": [i, j]} | {"swap": [i, j]} | {"done": i | [i, ...]} | {"set": {"index": i, "value": v}} | {"note": "…"} ]
                                   explicit alternative; indices are 0-based positions (not values); every op may carry "caption" and "ms"
                                   compare only highlights; swap moves; done turns a bar green (the sorted run)
  "captions": false                turn off the generated captions
The check fails unless the final left-to-right order is sorted. Give "algorithm" OR "ops".`,
  array: `kind: array — a row of boxes with named pointers underneath and an optional window; for searches and pointer walks
  "values": (number | string)[]    required, 1+
  "algorithm": "binary-search" | "two-pointer-sum" | "sliding-window"
                                   generates the ops; binary-search / two-pointer-sum need "target" and sorted numeric values,
                                   sliding-window takes "window" (length, default 3) and marks the max-sum window
  "ops": [ {"pointers": {"lo": 0, "hi": 9, "mid": null}}   create / move named pointers (arrows under the boxes); null removes one
           {"window": [i, j] | null}                       bracket an inclusive range; null clears it
           {"compare": [i, j]} {"swap": [i, j]} {"set": {"index": i, "value": v}}
           {"highlight": i | [i, …]} {"unhighlight": … | "all"} {"mark": i | [i, …]}   mark = permanent done colour
           {"found": i}                                    the answer: green + a pulse
           {"note": "…"} ]                                  each may carry "caption" and "ms"; indices are 0-based positions
Use this, not sort, when the story is where the pointers are. The check reads the final row back by position; with
binary-search it also checks that the search ended at the target's index.`,
  stack: `kind: stack — a column of slots; values are pushed on top and popped from the top (LIFO)
  "initial": (number | string)[]   optional, bottom to top
  "ops": [ {"push": v} | {"pop": true} | {"peek": true} | {"note": "…"} ]   required, 1+; each may carry "caption"
  "capacity": number               optional; draws that many slots, a push past it is narrated as refused (the check warns)
pop / peek on an empty stack is narrated, not an error. The check reads the final contents back by slot.`,
  queue: `kind: queue — a row of slots; values join at the back and leave from the front (FIFO), the rest shift forward
  "initial": (number | string)[]   optional, front to back
  "ops": [ {"enqueue": v} | {"dequeue": true} | {"peek": true} | {"note": "…"} ]   required, 1+; each may carry "caption"
  "capacity": number               optional; as for stack
The check reads the final contents back by slot.`,
  list: `kind: list — a singly linked list: boxes with an arrow between neighbours, "head" on the first, ∅ after the last
  "initial": (number | string)[]   optional, head first
  "ops": [ {"insert": {"value": v, "at": i}} | {"insert": {"value": v, "after": w}}   at a 0-based position (default: tail) or after a value
           {"remove": v}            the first node holding v; its neighbours relink
           {"find": v}              a cursor walks from the head, one captioned beat per node, until v (or ∅)
           {"reverse": true}        the arrows turn around, then the boxes trade places so it reads head-first again
           {"note": "…"} ]          required, 1+; each may carry "caption"
Nodes slide between slots; arrows are per-gap and toggled. The check reads the final order back by x and counts the arrows.`,
  tree: `kind: tree — a binary search tree; values are circles, x = in-order rank, y = depth
  "initial": number[]              optional; inserted in this order before the first op, without animation
  "ops": [ {"insert": n} | {"search": n} | {"delete": n} | {"traverse": "inorder" | "preorder" | "postorder" | "levelorder"} | {"note": "…"} ]
                                   required, 1+; each may carry "caption" (replaces the generated one for that op's LAST beat)
                                   insert / search / delete walk a token down the comparisons, one captioned beat per node;
                                   delete narrates leaf / one child / two children (in-order successor moves up);
                                   traverse walks every node and lines the values up underneath
The check reads the final tree back from the frame: left-to-right order must be ascending and every node at its depth.`,
  "state-machine": `kind: state-machine — circles, labelled arrows, a token walking a trace
  "states": [ "id" | {"id", "label", "final": true, "pos": [x, y]} ]   required; final = double ring; pos pins a state
  "initial": "id"                  required
  "transitions": [ {"from", "to", "on": "event", "note": "/ action"} ]   required; one transition per (from, on)
  "trace": [ "event" | {"on": "event", "caption"} | {"note": "…"} | {"goto": "state", "caption"} ]
                                   required; events fire in order and must be legal from the current state;
                                   note = captioned pause; goto = jump the token to show a second path after the first
  "layout": "lr" | "tb" | "circle" default lr
Each fired event is one step captioned "on <event>: a → b". The validator names the legal events when a trace step is not.`,
  heap: `kind: heap — a binary tree of slots; values sift up and down
  "type": "min" | "max"            default min
  "initial": number[]              optional; must ALREADY be a valid heap (placed without sifting)
  "ops": [ {"push": n} | {"pop": true} | {"note": "…"} ]   required, 1+; each may carry "caption"
Every comparison and swap becomes a captioned step ("3 < parent 5: swap up"). The check verifies the final tree is a heap.`,
  distributed: `kind: distributed — nodes across the top, lifelines down, messages as travelling dots
  "nodes": [ "id" | {"id", "label", "status": "up" | "down" | "leader" | "busy"} ]   required
  "messages": [ {"from", "to", "label", "at": ms | "<", "after": "label", "delay": ms, "latency": ms, "lost": true, "caption"}
              | {"note": "…", "at" | "after", "delay"} ]                                 required; a note is a captioned pause every node waits for
                                   "at" defaults to right after the previous message lands; "<" = together with the previous
                                   message (a broadcast); "latency" defaults to stepMs; "after" starts it when the earlier
                                   message with that label lands (+ "delay"); that label must be unique (a broadcast to two
                                   nodes needs two labels).
  "timing": "causal" | "sequential"   default causal: an unanchored message starts when its SENDER is free (its last received
                                   message and its own previous message have landed) — a reply waits for what it replies to,
                                   a side branch from another node never delays it, idle senders send at 0; a node that should
                                   wait says {"after": "label", "delay": ms}. sequential: it starts when the previous message
                                   in the list lands, so inserting one delays all later ones
  "events": [ {"after": "label" | "at": ms, "delay": ms, "node", "status", "caption"} ]   status changes; prefer "after" — an absolute
                                   "at" stays put when message timing shifts (the check warns when it lands mid-flight)
Time runs down the canvas, so order is visible. A message to a node that is down at arrival should be "lost": true (the check warns).`,
  matrix: `kind: matrix — a grid of cells (a DP table, a matrix, a table of rows); rows and columns can swap
  "cells": [[…], …]                required; rows of number | string | null (null = empty, to be filled); one row = a plain array
  "rowLabels", "colLabels": string[]   optional headers, one per row / column
  "ops": [ {"set": {"cell": [r, c], "value": v, "from": [[r, c], …]}}   write a value; "from" names the cells it came from
                                                                          (they flash and a token flies from each into the target)
           {"highlight": T} {"unhighlight": T | "all"} {"mark": T}      T = {"cell": [r, c]} | {"cells": [[r, c], …]} | {"row": r} | {"col": c}
                                                                          highlight = accent until unhighlighted; mark = permanent done colour
           {"swap": {"rows": [i, j]} | {"cols": [i, j]}}                 rows / columns trade places, labels move with them
           {"note": "…"} ]                                                each may carry "caption" and "ms"
Cell references are [row, col], 0-based. The check reads the final grid back by position and compares it with the ops' result.`,
  graph: `kind: graph — nodes and edges walked by a traversal; nodes never move
  "nodes": [ "id" | {"id", "label", "pos": [x, y]} ]   required; pos pins a node
  "edges": [ {"from", "to", "weight", "label"} | ["a", "b"] ]   required; weight (or label) is drawn on the edge
  "directed": true                 arrows; explore must follow the arrow. Default false (lines, either direction)
  "layout": "circle" | "lr" | "tb" | "grid"   default circle
  "algorithm": "bfs" | "dfs" | "dijkstra", "start": "id", "goal": "id"
                                   generates the ops by running the algorithm from start (goal: dijkstra also paints the path)
  "ops": [ {"visit": "id"} {"explore": "a->b" | ["a", "b"]} {"label": {"node": "id" | [ids], "text": "…"}}
           {"highlight": id | [ids]} {"unhighlight": …} {"path": ["a", "b", "c"]} {"note": "…"} ]
                                   explicit alternative; each may carry "caption" and "ms"
                                   visit = current (accent, larger) then visited (green); explore = a token travels the edge;
                                   label = text under the node (a distance, a depth); path = the answer, painted green
Give "algorithm" OR "ops". With an algorithm the check fails unless every node reachable from start was visited.`,
  chart: `kind: chart — a bar or line chart revealed in beats
  "type": "bar" | "line"           default bar
  "categories": string[]           required; the x axis
  "series": [ {"id", "label", "values": number[], "color"} ]   required, 1+; one value per category
  "yMax": number                   optional; default a round number 10% above the largest value
  "yLabel": string                 optional
  "sequence": [ {"reveal": id | [ids] | "all"}   bars grow in / the line draws in
                {"set": {"series", "index", "value"}}   a bar animates to a new value (bar charts only)
                {"highlight": {"series", "index" | "category"}} {"unhighlight": … | "all"}   dim everything else
                {"threshold": {"value", "label"}}   a horizontal reference line
                {"note": "…"} ]                       each may carry "caption" and "ms"
                                   default: reveal each series in order
The check fails if a bar's final height is not its value's share of the axis, and warns about a series never revealed.`,
  flowchart: `kind: flowchart — boxes, diamonds and pills, arrows with the answers, a token walking a path
  "nodes": [ "id" | {"id", "label", "shape": "process" | "decision" | "terminal" | "io", "pos": [x, y]} ]
                                   required; process = box (default), decision = diamond, terminal = pill (start / end), io = slanted box
  "edges": [ ["from", "to"] | {"from", "to", "label": "yes"} ]   required; one edge per pair; a decision's ways out carry their answer
  "start": "id"                    default: the first node
  "walk": [ "id" | {"at": "id", "caption"} | {"note": "…"} ]   the nodes visited after start, in order; every hop must be an edge
  "layout": "tb" | "lr"            default tb
Each hop is one step captioned "<from> → <to>", or "<question>: <answer> → <to>" out of a decision. A loop is a normal edge back
to an earlier node; the arrow bends round what is in its way. The check warns about a decision with one way out, an unlabelled way
out of a decision, a node the walk never reaches, and a walk that stops at a node with a way out.`,
  gantt: `kind: gantt — tasks as bars on a time axis, dependencies, a cursor that moves through the plan
  "tasks": [ {"id", "label", "start", "end", "lane", "after": ["id", …], "milestone": true, "owner"} ]
                                   required; start / end in units (a label, not a clock); lane groups rows into a band;
                                   after draws an arrow from each prerequisite's end; milestone = a diamond at start (no end);
                                   owner is drawn small inside the bar
  "unit": "day"                    the axis's word, default day      "tick": n   axis step, default a 1-2-5 step
  "from", "to": numbers            axis range, default 0 .. the latest end
  "ops": [ {"advance": t} | {"slip": {"task", "start", "end", "cascade": true}} | {"status": {"task", "state": "late" | "blocked" | "done"}} | {"note": "…"} ]
                                   advance moves the cursor to t (bars fill as it passes; a step says who starts and who finishes);
                                   slip moves a task's dates — with cascade, dependents that would now start too early move with it;
                                   status colours a task by what happened
The check warns when a task starts before something it depends on ends, when the cursor never reaches a task's end, and errors
when the cursor goes backwards.`,
  sequence: `kind: sequence — a sequence diagram: participants across the top, messages in order down the page
  "participants": [ "id" | {"id", "label", "kind": "actor" | "system"} ]   required; actor = a pill, system = a box
  "messages": [ {"from", "to", "label", "kind": "call" | "return" | "async", "caption", "ms"}
              | {"note": "…", "at": "participant"} | {"loop": "while …", "items": [ … ]}
              | {"alt": [ {"when": "cached", "items": [ … ]}, {"when": "miss", "items": [ … ]} ]} ]
                                   required, in order; call = solid, filled head, activates the receiver until it returns;
                                   return = dashed, open head; async = solid, open head; from == to is a hook to oneself;
                                   loop / alt draw a frame round their items (alt needs two or more branches)
Nothing is timed: order is the meaning, each message one beat captioned "a → b: label" (returns "b ← a: label").
The check warns about a return from a participant no call activated, a participant never messaged, an alt with one branch.`,
  diagram: `kind: diagram — boxes and arrows, narrated in beats
  "nodes": [ {"id", "label", "shape": "rect" | "circle" | "ellipse", "pos": [x, y], "fill", "tone", "hidden": true} ]   required; "tone": "accent" fills the box, "bad" | "muted" colour outline and label
  "edges": [ {"from", "to", "label", "style": "arrow" | "line" | "dashed" | "implements" | "forbidden", "tone", "hidden": true} ]
             implements: dashed with a hollow head (realises an interface); forbidden: dashed red, ignored by the layout; "tone": "accent" | "bad" | "muted" colours one edge in a still
  "groups": [ {"id", "label", "nodes": [ids]} ]   containers; ids are anchors and highlight targets
  "layout": "lr" | "tb" | "grid" | "circle"   default lr; nodes with "pos" are pinned
  "sequence": [ one action per step, plus optional "caption" and "ms" ]
      {"show": id | [ids]}  {"hide": …}  {"highlight": id | group id | "a->b"}  {"unhighlight": …}
      {"flow": "a->b"}      a token travels along an existing edge (either direction)
      {"note": "…"}         a captioned pause
      {"relabel": {"id", "text"}}
Hidden nodes stay invisible until a "show" step. A "flow" needs an edge between the two nodes.`,
  modules: `kind: modules — a module map: layers with dependencies pointing one way, containers around what belongs together (a still figure unless it has a sequence)
  "modules": [ "id" | {"id", "label", "tone", "hidden": true} ]               required; "tone": "accent" fills the box, "bad" | "muted" colour outline and label
  "deps":    [ ["a", "b"] | {"from", "to", "label", "style", "tone", "hidden": true} ]   ["a", "b"] reads "a depends on b": arrow a → b, a drawn above b
             "style": "arrow" (default) | "line" (no head) | "dashed" (optional / weak, still laid out) | "implements" (dashed, hollow head: realises an interface, still laid out)
                      | "forbidden" (dashed red, drawn but ignored by the layout: the import that must not exist)
             "tone":  "accent" | "bad" | "muted" — colour one dependency in a still, no sequence needed
  "groups":  [ {"id", "label", "modules": [ids]} ]                            containers; a module is in at most one; ids are anchors and highlight targets
  "layout":  "tb" | "lr"                                                      default tb (dependencies point down)
  "sequence": [ the diagram steps: show / hide / highlight (a module, a group, or an edge "a->b") / unhighlight / flow "a->b" / note / relabel, and every annotation op ]   optional
The layout is automatic: a module's layer is one below the deepest thing it depends on (two modules with the same dependencies share a layer, whatever depends on them);
a group whose layers hold only its members is a full-width row, otherwise it gets its own band so a container holds only its members.
A dependency cycle is a warning: the back edge is drawn against the flow. vlmkit-anim still scene.json --out map.svg renders the figure without a caption.`,
  vector: `kind: vector — generic shapes with a list of tweens (when nothing semantic fits)
  "nodes": [ timeline nodes, see below ]   required
  "timeline": [ tween | {"wait": ms, "caption"} ]   required
      tween: {"target": id | [ids], "to": {…}, "duration": ms, "easing", "at", "caption", "label"}
      "to" keys: x, y (or pos: [x, y]), w, h (or size), r, opacity, fill, stroke, color, scale, rotate, dash, text
      "at": omitted = after the previous item; "<" = together with the previous; "+200" / "-100" = offset from its end; a number = absolute ms
Nodes: {"id", "shape": rect | circle | ellipse | text | line | arrow | path | group, "pos": [x, y], "size": [w, h], "r", "points": [[x1,y1],[x2,y2]], "d", "text", "fontSize", "fill", "stroke", "strokeWidth", "opacity", "dash", "rotate", "scale", "parent"}
  rect/ellipse need "size"; circle needs "r"; text needs "text"; line/arrow need "points"; path needs "d". Shapes are centred on "pos". Any shape with "text" draws it centred as a label.`,
  compose: `kind: compose — several scenes in one canvas, side by side or stacked, played in sequence or together
  "panes": [ {"id", "title", "scene": { a whole scene of any other kind }} ]   required; a pane cannot be a compose
  "layout": row | column | grid       optional; row (default) = side by side, grid = two per row
  "timing": sequence | parallel       optional; sequence (default) plays pane 1 then pane 2; parallel starts them together (a before / after in lockstep)
  "gap": px                           optional; space between panes (32)
  Each pane keeps its own kind's anchors and annotations; captions of coinciding beats join with " · ", prefixed by the pane title under parallel.`,
  timeline: `format: ${TIMELINE_FORMAT} — the compiled layer; write it directly only when a tween list is not enough
  "canvas": {"width", "height", "background"}   required
  "nodes": [ … same node fields as kind: vector … ]   required, drawn in order
  "tracks": [ {"target": id, "prop", "keyframes": [ {"t": ms, "value", "easing"} ]} ]   required
      prop: pos [x,y] | size [w,h] | r | opacity | fill | stroke | color | scale | rotate | dash (0..1 draw progress) | text (discrete)
      "easing" is INTO the keyframe: linear | ease | ease-in | ease-out | ease-in-out | step-end | step-start | cubic-bezier(a,b,c,d)
      keyframe times ascend; the first/last value holds outside the span
  "steps": [ {"t": ms, "label", "caption"} ]   chapter markers; the runtime steps between them and shows the caption
  "duration": ms                   optional; computed from the last keyframe/step`,
};

export function schemaSheet(kind: Scene["kind"] | "timeline" | "annotations"): string {
  if (kind === "annotations") return `${ANNOTATIONS_SHEET}\n\nThen: vlmkit-anim check scene.json`;
  const example = JSON.stringify(EXAMPLES[kind], null, 2);
  return `${SHEETS[kind]}\n\n${kind === "timeline" ? "" : COMMON + "\n\n"}Example\n${example}\n\nThen: vlmkit-anim check scene.json`;
}

export function schemaIndex(): string {
  return `vlmkit-anim — declarative explanatory animations, two layers

  Scene (what is explained)      ${SCENE_FORMAT}, one "kind":
    sort           an array being sorted (algorithm-generated or explicit ops)
    array          a row of boxes with named pointers and a window: binary search, two-pointer, sliding window
    stack          push / pop / peek on a LIFO column
    queue          enqueue / dequeue / peek on a FIFO row
    list           a singly linked list: insert / remove / find / reverse
    state-machine  states, transitions, and an event trace
    heap           push / pop on a binary heap
    tree           a binary search tree: insert / search / delete / traverse
    distributed    nodes exchanging messages over time, with status events
    matrix         a grid of cells (DP table, matrix, table) filled, highlighted, rows / columns swapped
    graph          nodes and edges traversed (bfs / dfs / dijkstra, or explicit ops)
    chart          a bar or line chart revealed series by series
    flowchart      boxes and decision diamonds with labelled ways out, a token walking one path
    gantt          tasks as bars on a time axis with dependencies, a cursor moving through the plan
    sequence       a sequence diagram: participants, ordered call / return / async messages, activations, loop / alt frames
    diagram        boxes and arrows walked through in narrated beats
    vector         generic shapes and a list of tweens
    compose        several scenes in panes, side by side or stacked, in sequence or in parallel
  Annotations (every kind)        value / callout / snapshot / group / text / relate — vlmkit-anim schema --kind annotations
  Timeline (how it moves)         ${TIMELINE_FORMAT}: nodes + keyframe tracks + steps.
                                  Every kind compiles to it; it can also be written directly.

  vlmkit-anim schema --kind <kind>    field list + minimal example for one kind
  vlmkit-anim check <scene.json>      validate → compile → semantic checks → stats

${COMMON}`;
}
