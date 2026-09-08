/**
 * Post-compile checks: does the animation say what the scene claims?
 *
 * The validator proves a document is well-formed; this proves the compiled
 * motion has the semantics the kind promises — the sort's final frame is in
 * order, the heap satisfies the heap property at every step marker, every
 * state-machine event was legal, no node ends up off-canvas. Each finding is
 * a `Diagnostic` in the same shape the validator emits, so a writer reads one
 * list. Also computes the stats the evaluation loop tracks: bytes of scene vs
 * timeline (how much the semantic layer buys), duration, step count.
 */

import { moduleCycles } from "./compile/modules.ts";
import { layoutReport, type LayoutFrame, type LayoutIssue } from "./layout.ts";
import type { Placement } from "./compile/annotate.ts";
import { sampleFrame, timelineDuration, worldPos } from "./timeline.ts";
import { compileScene } from "./compile/index.ts";
import type { Diagnostic, Scene, Timeline } from "./types.ts";

export interface AnimStats {
  kind: string;
  durationMs: number;
  nodes: number;
  tracks: number;
  keyframes: number;
  steps: number;
  captions: number;
  sceneBytes?: number;
  timelineBytes: number;
  /** timelineBytes / sceneBytes — how many bytes of motion one byte of intent buys. */
  expansion?: number;
  /** Annotations the compiler drew, and how many are visible in the final frame. Absent when the scene has none. */
  annotations?: { drawn: number; onScreen: number };
}

export function animStats(tl: Timeline, scene?: Scene): AnimStats {
  const timelineBytes = Buffer.byteLength(JSON.stringify(tl));
  const sceneBytes = scene ? Buffer.byteLength(JSON.stringify(scene)) : undefined;
  // Annotation liveness (ed, v11): how many annotations the compiler drew and how many are still on screen at
  // the end — the number a re-edit otherwise verifies by reading opacity attributes out of the SVG. One node
  // stands for each annotation: the readout text, the callout box, the snapshot text, the outline, the block's
  // box, the relation's line.
  const primary = /^(value-(?!.*-label$)|callout-.*-box$|snapshot-\d+$|group-(?!.*-label$)|text-.*-box$|relate-(?!.*-label$))/;
  const drawn = tl.nodes.filter((n) => primary.test(n.id));
  const endFrame = drawn.length ? sampleFrame(tl, timelineDuration(tl)) : undefined;
  const annotations = drawn.length ? { drawn: drawn.length, onScreen: drawn.filter((n) => (endFrame!.get(n.id)?.opacity ?? 0) > 0).length } : undefined;
  return {
    annotations,
    kind: String(tl.meta?.kind ?? scene?.kind ?? "timeline"),
    durationMs: timelineDuration(tl),
    nodes: tl.nodes.length,
    tracks: tl.tracks.length,
    keyframes: tl.tracks.reduce((s, tr) => s + tr.keyframes.length, 0),
    steps: tl.steps?.length ?? 0,
    captions: (tl.steps ?? []).filter((s) => s.caption).length,
    sceneBytes,
    timelineBytes,
    expansion: sceneBytes ? Math.round((timelineBytes / sceneBytes) * 10) / 10 : undefined,
  };
}

const warn = (path: string, message: string, hint?: string): Diagnostic => ({ severity: "warn", path, message, ...(hint ? { hint } : {}) });
const error = (path: string, message: string, hint?: string): Diagnostic => ({ severity: "error", path, message, ...(hint ? { hint } : {}) });

/** Kind-agnostic checks on any timeline. */
export function checkTimeline(tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const dur = timelineDuration(tl);
  if (dur <= 0) out.push(error("duration", "the animation has zero length: no keyframe or step is later than t=0", "add a tween, or a step with a later t"));
  const animated = new Set(tl.tracks.map((tr) => tr.target));
  if (tl.tracks.length === 0) out.push(warn("tracks", "nothing moves: there are no tracks", "a still image is fine, but then a plain SVG is simpler"));
  for (const tr of tl.tracks) {
    if (tr.keyframes.length >= 2 && tr.keyframes.every((k) => JSON.stringify(k.value) === JSON.stringify(tr.keyframes[0].value))) {
      out.push(warn(`tracks(${tr.target}.${tr.prop})`, `every keyframe has the same value ${JSON.stringify(tr.keyframes[0].value)}: the track changes nothing`));
    }
  }
  // Off-canvas at any step marker or at the end.
  const times = [...new Set([0, ...(tl.steps ?? []).map((s) => s.t), dur])];
  const { width, height } = tl.canvas;
  const reported = new Set<string>();
  for (const t of times) {
    const frame = sampleFrame(tl, t);
    for (const n of tl.nodes) {
      if (reported.has(n.id) || n.shape === "group") continue;
      const st = frame.get(n.id)!;
      if (st.opacity <= 0) continue;
      const [x, y] = worldPos(frame, n.id);
      const margin = 4;
      if (x < -margin || y < -margin || x > width + margin || y > height + margin) {
        reported.add(n.id);
        // An annotation's node was placed by the compiler, not the writer: "move it" and "enlarge the canvas"
        // are not levers the writer has (ea, v11, tried the second and it did nothing). Say what is.
        const annotation = /^(value|callout|snapshot|group|text|relate)-/.test(n.id);
        out.push(
          warn(
            `nodes(${n.id})`,
            `visible node is outside the ${width}×${height} canvas at t=${Math.round(t)} (pos ${Math.round(x)}, ${Math.round(y)})`,
            annotation
              ? "an annotation placed itself there — it takes no coordinates, so a taller canvas does not move it; try another `side`, or fewer things between a related pair, and report it if nothing helps"
              : "move it, enlarge the canvas, or fade it out before it leaves",
          ),
        );
      }
    }
  }
  // A canvas a viewer cannot take in at one glance. Layouts grow with label length and node
  // count and nothing else complains (v9: five long-labelled states laid out `lr` gave 4266px).
  const WIDE = 2000;
  if (width > WIDE || height > WIDE) {
    out.push(warn("canvas", `the canvas is ${width}×${height}: on a 1280px-wide screen it shrinks to ${Math.round((1280 / Math.max(width, height)) * 100)}% and labels stop being legible`, 'use "layout": "tb" or "circle", shorten labels, or split the scene'));
  }
  // Steps without captions are legal but explain nothing.
  const steps = tl.steps ?? [];
  if (steps.length > 0 && steps.every((s) => !s.caption)) out.push(warn("steps", "no step has a caption: the viewer gets motion without narration", 'add "caption" to the steps that matter'));
  if (animated.size > 0 && steps.length === 0) out.push(warn("steps", "no steps: the runtime cannot step through the animation chapter by chapter"));
  return out;
}

function checkSort(scene: Extract<Scene, { kind: "sort" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const finalOrder = tl.meta?.finalOrder as number[] | undefined;
  const expected = [...scene.values].sort((a, b) => a - b);
  if (finalOrder && JSON.stringify(finalOrder) !== JSON.stringify(expected)) {
    out.push(error("ops", `the ops end with ${finalOrder.join(", ")} but sorted order is ${expected.join(", ")}`, "the explicit ops list does not finish the sort; add the missing swaps or let \"algorithm\" generate them"));
  }
  // Read the final frame back by position, independent of meta.
  const frame = sampleFrame(tl, timelineDuration(tl));
  const bars = tl.nodes.filter((n) => n.shape === "group" && n.id.startsWith("bar-")).map((n) => ({ id: n.id, x: worldPos(frame, n.id)[0], value: scene.values[Number(n.id.slice(4))] }));
  bars.sort((a, b) => a.x - b.x);
  const byPosition = bars.map((b) => b.value);
  if (JSON.stringify(byPosition) !== JSON.stringify(expected)) out.push(error("timeline", `final frame reads ${byPosition.join(", ")} left to right; sorted is ${expected.join(", ")}`));
  const xs = bars.map((b) => Math.round(b.x));
  if (new Set(xs).size !== xs.length) out.push(error("timeline", "two bars share a slot in the final frame: a swap moved one bar but not the other"));
  return out;
}

function checkHeap(scene: Extract<Scene, { kind: "heap" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const isMin = (scene.type ?? "min") === "min";
  const ok = (parent: number, child: number): boolean => (isMin ? parent <= child : parent >= child);
  const init = scene.initial ?? [];
  for (let i = 1; i < init.length; i++) {
    const p = Math.floor((i - 1) / 2);
    if (!ok(init[p], init[i])) {
      out.push(error(`initial[${i}]`, `${init[i]} under parent ${init[p]} breaks the ${isMin ? "min" : "max"}-heap property`, `"initial" must already be a valid heap (it is placed without sifting); push the values through "ops" instead`));
      break;
    }
  }
  // Read the heap by slot just before each step begins (the previous step's
  // motion has settled) and at the end.
  const slots = tl.nodes.filter((n) => n.id.startsWith("slot-")).map((n) => ({ i: Number(n.id.slice(5)), pos: n.pos! }));
  const tokens = tl.nodes.filter((n) => n.id.startsWith("v-"));
  const times = [...(tl.steps ?? []).map((s) => s.t - 1).filter((t) => t > 0), timelineDuration(tl)];
  for (const t of times) {
    const frame = sampleFrame(tl, t);
    const bySlot = new Map<number, number>();
    for (const tk of tokens) {
      const st = frame.get(tk.id)!;
      if (st.opacity < 0.5) continue;
      const slot = slots.find((s) => Math.hypot(s.pos[0] - st.pos[0], s.pos[1] - st.pos[1]) < 1);
      if (!slot) continue; // in flight or parked
      if (bySlot.has(slot.i)) out.push(error("timeline", `two values occupy slot ${slot.i} at t=${Math.round(t)}`));
      bySlot.set(slot.i, Number(tk.text));
    }
    // Mid-sift frames are legitimately not heaps (a value that has swapped up once
    // may still be out of order with its new parent) and a pop leaves slot 0 empty
    // until the last value moves up, so shape and ordering are judged on the final
    // frame only; intermediate frames are judged on occupancy alone (above).
    if (t !== times[times.length - 1]) continue;
    for (const [i, v] of bySlot) {
      if (i === 0) continue;
      const p = Math.floor((i - 1) / 2);
      const pv = bySlot.get(p);
      if (pv === undefined) out.push(error("timeline", `final heap has a hole: slot ${i} holds ${v} but its parent slot ${p} is empty`));
      else if (!ok(pv, v)) out.push(error("timeline", `final heap breaks the ${isMin ? "min" : "max"}-heap property: ${v} under ${pv}`));
    }
    const expected = (tl.meta?.finalHeap as number[] | undefined) ?? [];
    if (bySlot.size !== expected.length) out.push(error("timeline", `final frame shows ${bySlot.size} value(s) in the tree but the simulation ends with ${expected.length}`));
  }
  const popped = (tl.meta?.popped as number[] | undefined) ?? [];
  for (let i = 1; i < popped.length; i++) {
    if (isMin ? popped[i] < popped[i - 1] : popped[i] > popped[i - 1]) {
      // Legal when pushes happen between pops; only flag with no intervening push.
      const ops = scene.ops;
      let pops = 0;
      let violates = false;
      for (const op of ops) {
        if ("pop" in op) pops++;
        if (pops === i && "push" in op) {
          violates = false;
          break;
        }
        if (pops === i + 1) {
          violates = true;
          break;
        }
      }
      if (violates) out.push(error("ops", `popped ${popped[i - 1]} then ${popped[i]} with no push in between: not ${isMin ? "ascending" : "descending"}`));
    }
  }
  return out;
}

function checkStateMachine(scene: Extract<Scene, { kind: "state-machine" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const visited = (tl.meta?.visited as string[] | undefined) ?? [];
  const wanted = scene.trace.filter((it) => typeof it === "string" || "on" in it).length;
  const gotos = scene.trace.filter((it) => typeof it === "object" && "goto" in it).length;
  if (visited.length !== wanted + gotos + 1) out.push(error("trace", `only ${Math.max(0, visited.length - 1 - gotos)} of ${wanted} events could be fired`));
  const reachable = new Set<string>([scene.initial]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of scene.transitions) if (reachable.has(t.from) && !reachable.has(t.to)) { reachable.add(t.to); grew = true; }
  }
  const ids = scene.states.map((s) => (typeof s === "string" ? s : s.id));
  for (const id of ids) if (!reachable.has(id)) out.push(warn(`states(${id})`, `state "${id}" is unreachable from "${scene.initial}"`, "add a transition into it or drop it"));
  // Which (from, on) pairs actually fired: replay the trace over the visited list.
  const fired = new Set<string>();
  {
    let k = 0;
    for (const it of scene.trace) {
      if (typeof it === "object" && "goto" in it) { k++; continue; }
      if (typeof it === "object" && !("on" in it)) continue; // a note or an annotation fires nothing
      const ev = typeof it === "string" ? it : it.on;
      if (visited[k + 1] !== undefined) fired.add(`${visited[k]}:${ev}`);
      k++;
    }
  }
  const unused = scene.transitions.filter((t) => !fired.has(`${t.from}:${t.on}`));
  if (unused.length && unused.length === scene.transitions.length) out.push(warn("trace", "the trace fires no transition: the picture is static"));
  else {
    // Drawn but never animated: the viewer sees a path and never learns when it is taken.
    const visitedSet = new Set(visited);
    for (const id of ids) if (reachable.has(id) && !visitedSet.has(id)) out.push(warn(`states(${id})`, `state "${id}" is drawn but the trace never enters it`, `extend the trace to reach it, jump there with {"goto": "…"} after the main path and play the alternative, or explain it with {"note": "…"} in the trace`));
    for (const t of unused) if (visitedSet.has(t.from)) out.push(warn(`transitions(${t.from}:${t.on})`, `transition "${t.from}" —${t.on}→ "${t.to}" is drawn but the trace never fires it`));
  }
  return out;
}

function checkDistributed(scene: Extract<Scene, { kind: "distributed" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  // Timing as the compiler resolved it (`after` anchors, defaults), not as written.
  const times = (tl.meta?.messageTimes as [number, number][] | undefined) ?? [];
  const eventTimes = (tl.meta?.eventTimes as number[] | undefined) ?? [];
  const down = new Map<string, number>();
  (scene.events ?? []).forEach((e, i) => {
    const t = eventTimes[i];
    if (t === undefined) return;
    if (e.status === "down") down.set(e.node, Math.min(t, down.get(e.node) ?? Infinity));
    else if (down.has(e.node) && t > down.get(e.node)!) down.delete(e.node);
  });
  scene.messages.forEach((m, i) => {
    if (!("from" in m)) return; // a note or an annotation travels nowhere
    const [, lands] = times[i] ?? [0, 0];
    const initialDown = scene.nodes.some((n) => typeof n !== "string" && n.id === m.to && n.status === "down");
    const downAt = down.get(m.to);
    if (!m.lost && (initialDown || (downAt !== undefined && lands >= downAt))) {
      out.push(warn(`messages[${i}]`, `"${m.to}" is down when this message lands (t=${lands}) but the message is not marked lost`, 'add "lost": true, or move the event later'));
    }
  });
  if (scene.messages.length === 0) out.push(warn("messages", "no messages: nothing travels between nodes"));
  // An event pinned to an absolute time that lands mid-flight of a message is the
  // classic re-edit casualty: someone lengthened a latency upstream and the crash
  // now happens while the reply is in the air. `after` moves with the messages.
  (scene.events ?? []).forEach((e, i) => {
    const at = e.at;
    if (at === undefined) return;
    const inside = times.findIndex(([t0, t1], k) => "from" in scene.messages[k] && at > t0 && at < t1);
    if (inside >= 0) {
      const m = scene.messages[inside];
      if (!("from" in m)) return;
      out.push(warn(`events[${i}].at`, `t=${at} falls while "${m.from} → ${m.to}${m.label ? `: ${m.label}` : ""}" is in flight (${times[inside][0]}–${times[inside][1]}ms)`, `if that is not the story, anchor it: {"after": "${m.label ?? "<label that message>"}", …} follows the message when timing shifts`));
    }
  });
  // A node that sends after it went down: the other way the drift shows up.
  const downSince = new Map<string, number>();
  (scene.events ?? []).forEach((e, i) => {
    const t = eventTimes[i];
    if (t === undefined) return;
    if (e.status === "down") downSince.set(e.node, Math.min(t, downSince.get(e.node) ?? Infinity));
    else if (downSince.has(e.node) && t > downSince.get(e.node)!) downSince.delete(e.node);
  });
  scene.messages.forEach((m, i) => {
    if (!("from" in m)) return; // a note or an annotation travels nowhere
    const t0 = times[i]?.[0];
    const since = downSince.get(m.from);
    if (t0 !== undefined && since !== undefined && t0 >= since) {
      out.push(warn(`messages[${i}]`, `"${m.from}" sends this at t=${t0} but has been down since t=${since}`, "move the event later, anchor it with \"after\", or send from another node"));
    }
  });
  return out;
}

function checkDiagram(scene: Extract<Scene, { kind: "diagram" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const shown = new Set<string>();
  for (const st of scene.sequence ?? []) if ("show" in st) for (const id of Array.isArray(st.show) ? st.show : [st.show]) shown.add(id);
  for (const n of scene.nodes) if (n.hidden && !shown.has(n.id)) out.push(warn(`nodes(${n.id})`, `"${n.id}" is hidden and no step shows it: it never appears`, `add {"show": "${n.id}"} to "sequence" or drop "hidden"`));
  if ((scene.sequence ?? []).length === 0) out.push(warn("sequence", "no sequence: the diagram is a still image", "add steps such as {\"highlight\": \"a\", \"caption\": \"…\"} or {\"flow\": \"a->b\"}"));
  void tl;
  return out;
}

/**
 * A module map is a still figure by design, so no "no sequence" warning; what can be wrong is a
 * dependency cycle (the layers then lie about direction) and a hidden module no step shows.
 */
function checkModules(scene: Extract<Scene, { kind: "modules" }>): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const cycle of moduleCycles(scene)) {
    out.push(
      warn("deps", `dependency cycle: ${cycle.join(" → ")}`, `the layout cuts it at "${cycle[cycle.length - 2]} → ${cycle[cycle.length - 1]}" and draws that arrow against the flow — keep it if the cycle is the point, else break it, or mark the edge to remove with "style": "forbidden"`),
    );
  }
  const shown = new Set<string>();
  for (const st of scene.sequence ?? []) if ("show" in st) for (const id of Array.isArray(st.show) ? st.show : [st.show]) shown.add(id);
  for (const m of scene.modules) {
    if (typeof m !== "string" && m.hidden && !shown.has(m.id)) out.push(warn(`modules(${m.id})`, `"${m.id}" is hidden and no step shows it: it never appears`, `add {"show": "${m.id}"} to "sequence" or drop "hidden"`));
  }
  return out;
}

function checkArray(scene: Extract<Scene, { kind: "array" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const meta = tl.meta as { finalOrder?: (number | string)[]; slotX?: number[]; found?: number } | undefined;
  if ((scene.ops ?? []).length === 0 && !scene.algorithm) out.push(warn("ops", "no ops: the array is a still image"));
  // Positions are the story: read the final row back by x.
  if (meta?.finalOrder && meta.slotX) {
    const frame = sampleFrame(tl, timelineDuration(tl));
    const cells = tl.nodes.filter((n) => n.shape === "group" && /^cell-\d+$/.test(n.id));
    const byX = cells.map((c) => ({ x: worldPos(frame, c.id)[0], text: frame.get(`${c.id}-rect`)!.text ?? "" })).sort((a, b) => a.x - b.x);
    const read = byX.map((c) => c.text);
    if (JSON.stringify(read) !== JSON.stringify(meta.finalOrder.map(String))) out.push(error("timeline", `final frame reads ${read.join(", ")} left to right; the ops end with ${meta.finalOrder.join(", ")}`));
    if (new Set(byX.map((c) => Math.round(c.x))).size !== byX.length) out.push(error("timeline", "two cells share a slot in the final frame"));
  }
  if (scene.algorithm === "binary-search" && !scene.ops && scene.target !== undefined) {
    const present = scene.values.map(Number).indexOf(scene.target);
    if (present >= 0 && meta?.found !== present) out.push(error("ops", `${scene.target} is at index ${present} but the search ended ${meta?.found === undefined ? "without finding it" : `at ${meta.found}`}`));
    if (present < 0 && meta?.found !== undefined) out.push(error("ops", `${scene.target} is not in the array but the search reported index ${meta.found}`));
  }
  for (const op of scene.ops ?? []) {
    if ("found" in op && scene.target !== undefined && Number(scene.values[op.found]) !== scene.target) {
      out.push(warn(`ops`, `found index ${op.found} holds ${scene.values[op.found]}, not the target ${scene.target}`, "point found at the index that holds the target, or drop target"));
    }
  }
  return out;
}

function checkCollection(scene: Extract<Scene, { kind: "stack" | "queue" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const meta = tl.meta as { finalContents?: (number | string)[]; slots?: [number, number][]; refused?: (number | string)[] } | undefined;
  if (!meta?.finalContents || !meta.slots) return out;
  const frame = sampleFrame(tl, timelineDuration(tl));
  const visible = tl.nodes.filter((n) => n.id.startsWith("v-")).map((n) => ({ st: frame.get(n.id)! })).filter((n) => n.st.opacity > 0.5);
  const inSlot = visible.map((n) => ({ text: n.st.text ?? "", i: meta.slots!.findIndex((s) => Math.hypot(s[0] - n.st.pos[0], s[1] - n.st.pos[1]) < 1) })).filter((n) => n.i >= 0).sort((a, b) => a.i - b.i);
  const read = inSlot.map((n) => n.text);
  if (JSON.stringify(read) !== JSON.stringify(meta.finalContents.map(String))) out.push(error("timeline", `final frame holds ${read.join(", ") || "nothing"} in slot order; the ops end with ${meta.finalContents.join(", ") || "nothing"}`));
  if (new Set(inSlot.map((n) => n.i)).size !== inSlot.length) out.push(error("timeline", "two values occupy one slot in the final frame"));
  for (const v of meta.refused ?? []) out.push(warn("ops", `${scene.kind === "stack" ? "push" : "enqueue"} ${v} was refused: the ${scene.kind} was at capacity ${scene.capacity}`, "raise capacity, or remove something first — unless overflow is the point of the story"));
  return out;
}

function checkList(scene: Extract<Scene, { kind: "list" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const meta = tl.meta as { finalOrder?: (number | string)[]; slotX?: number[]; finds?: { value: number | string; found: boolean }[] } | undefined;
  if (!meta?.finalOrder || !meta.slotX) return out;
  const frame = sampleFrame(tl, timelineDuration(tl));
  const visible = tl.nodes.filter((n) => n.id.startsWith("n-")).map((n) => frame.get(n.id)!).filter((st) => st.opacity > 0.5).sort((a, b) => a.pos[0] - b.pos[0]);
  const read = visible.map((st) => st.text ?? "");
  if (JSON.stringify(read) !== JSON.stringify(meta.finalOrder.map(String))) out.push(error("timeline", `final frame reads ${read.join(" → ") || "∅"}; the ops end with ${meta.finalOrder.join(" → ") || "∅"}`));
  const arrows = tl.nodes.filter((n) => /^arr-\d+$/.test(n.id)).filter((n) => frame.get(n.id)!.opacity > 0.5).length;
  if (arrows !== Math.max(0, visible.length - 1)) out.push(error("timeline", `${arrows} arrow(s) drawn for ${visible.length} node(s): a link is missing or dangling`));
  for (const f of meta.finds ?? []) if (!f.found) out.push(warn("ops", `find ${f.value}: the value is not in the list at that point, so the walk reaches ∅`, "fine if that is the lesson; otherwise insert it first or fix the value"));
  return out;
}

function checkTree(scene: Extract<Scene, { kind: "tree" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const meta = tl.meta as { finalInorder?: number[]; finalDepths?: Record<string, number>; traversals?: number[][]; searches?: { value: number; found: boolean }[] } | undefined;
  if (!meta?.finalInorder) return out;
  // Read the final tree back: visible values sorted by x must be ascending (the BST property, as drawn).
  const frame = sampleFrame(tl, timelineDuration(tl));
  const visible = tl.nodes.filter((n) => n.id.startsWith("v-")).map((n) => ({ v: Number(n.id.slice(2)), st: frame.get(n.id)! })).filter((n) => n.st.opacity > 0.5);
  visible.sort((a, b) => a.st.pos[0] - b.st.pos[0]);
  const byX = visible.map((n) => n.v);
  if (JSON.stringify(byX) !== JSON.stringify(meta.finalInorder)) out.push(error("timeline", `final frame shows ${byX.join(", ")} left to right; the simulation ends with ${meta.finalInorder.join(", ")}`));
  for (let i = 1; i < byX.length; i++) if (byX[i] < byX[i - 1]) out.push(error("timeline", `${byX[i]} is drawn right of ${byX[i - 1]}: the picture breaks the BST order`));
  // Depth drawn matches the simulation (a promotion that did not move its subtree would show here).
  if (meta.finalDepths) {
    const ys = [...new Set(visible.map((n) => n.st.pos[1]))].sort((a, b) => a - b);
    for (const n of visible) {
      const drawn = ys.indexOf(n.st.pos[1]);
      const want = meta.finalDepths[String(n.v)];
      if (want !== undefined && drawn !== want) out.push(error("timeline", `${n.v} is drawn at level ${drawn} but sits at depth ${want} in the tree`));
    }
  }
  for (const [i, order] of (meta.traversals ?? []).entries()) {
    const op = scene.ops.filter((o) => "traverse" in o)[i] as { traverse: string } | undefined;
    if (op?.traverse === "inorder") for (let k = 1; k < order.length; k++) if (order[k] < order[k - 1]) out.push(error("ops", `inorder traversal came out ${order.join(", ")}: not ascending, the tree is not a BST`));
  }
  if (scene.ops.every((o) => "note" in o)) out.push(warn("ops", "only notes: the tree never changes"));
  return out;
}

function checkMatrix(scene: Extract<Scene, { kind: "matrix" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  if ((scene.ops ?? []).length === 0) out.push(warn("ops", "no ops: the grid is a still image", 'add ops such as {"set": {"cell": [1, 1], "value": 3, "from": [[0, 0]]}} or {"highlight": {"row": 0}}'));
  // Read the final grid back by position: which original cell sits in each slot, and what it says.
  const meta = tl.meta as { finalCells?: string[][]; slots?: { x: number[]; y: number[] } } | undefined;
  if (!meta?.finalCells || !meta.slots) return out;
  const frame = sampleFrame(tl, timelineDuration(tl));
  const cells = tl.nodes.filter((n) => n.id.startsWith("cell-"));
  const seen = new Map<string, string>();
  for (const c of cells) {
    const [x, y] = worldPos(frame, c.id);
    const r = meta.slots.y.findIndex((yy) => Math.abs(yy - y) < 1);
    const col = meta.slots.x.findIndex((xx) => Math.abs(xx - x) < 1);
    if (r < 0 || col < 0) {
      out.push(error("timeline", `cell ${c.id} ends between slots (${Math.round(x)}, ${Math.round(y)})`));
      continue;
    }
    const key = `${r},${col}`;
    if (seen.has(key)) out.push(error("timeline", `two cells share slot [${r}, ${col}] in the final frame`));
    seen.set(key, frame.get(c.id)!.text ?? "");
    const expected = meta.finalCells[r]?.[col];
    if (expected !== undefined && expected !== (frame.get(c.id)!.text ?? "")) out.push(error("timeline", `slot [${r}, ${col}] reads "${frame.get(c.id)!.text ?? ""}" but the ops end with "${expected}"`));
  }
  return out;
}

function checkGraph(scene: Extract<Scene, { kind: "graph" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const ids = scene.nodes.map((n) => (typeof n === "string" ? n : n.id));
  const visited = (tl.meta?.visited as string[] | undefined) ?? [];
  const directed = scene.directed === true;
  const edges = scene.edges.map((e) => (Array.isArray(e) ? { from: e[0], to: e[1] } : e));
  if (scene.algorithm && !scene.ops) {
    const start = scene.start ?? ids[0];
    const reach = new Set([start]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of edges) {
        if (reach.has(e.from) && !reach.has(e.to)) { reach.add(e.to); grew = true; }
        if (!directed && reach.has(e.to) && !reach.has(e.from)) { reach.add(e.from); grew = true; }
      }
    }
    for (const id of ids) if (!reach.has(id)) out.push(warn(`nodes(${id})`, `"${id}" is not reachable from "${start}", so ${scene.algorithm} never visits it`, "connect it with an edge, or drop it"));
    for (const id of reach) if (!visited.includes(id)) out.push(error("ops", `"${id}" is reachable from "${start}" but the generated ${scene.algorithm} never visited it`));
    if (scene.goal && !reach.has(scene.goal)) out.push(warn("goal", `"${scene.goal}" is not reachable from "${start}": no path to show`));
  }
  if ((scene.ops ?? []).length === 0 && !scene.algorithm) out.push(warn("ops", "no ops: the graph is a still image"));
  // Every visited node is the ok colour in the final frame, and the token is parked.
  const frame = sampleFrame(tl, timelineDuration(tl));
  for (const id of visited) {
    const st = frame.get(`node-${id}`);
    if (st && st.fill === tl.nodes.find((n) => n.id === `node-${id}`)?.fill) out.push(error("timeline", `"${id}" was visited but ends in its unvisited colour`));
  }
  const token = frame.get("token");
  if (token && token.opacity > 0) out.push(error("timeline", "the explore token is still visible at the end"));
  return out;
}

function checkChart(scene: Extract<Scene, { kind: "chart" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const revealed = new Set((tl.meta?.revealed as string[] | undefined) ?? []);
  for (const s of scene.series) if (!revealed.has(s.id)) out.push(warn(`series(${s.id})`, `series "${s.id}" is never revealed: it stays invisible`, `add {"reveal": "${s.id}"} to "sequence", or drop the series`));
  const type = (scene.type ?? "bar");
  if (type === "bar") {
    // A bar's final height must be its final value's share of the axis.
    const meta = tl.meta as { yMax?: number; plotH?: number; finalValues?: Record<string, number[]> } | undefined;
    if (meta?.yMax && meta.plotH && meta.finalValues) {
      const frame = sampleFrame(tl, timelineDuration(tl));
      for (const [sid, values] of Object.entries(meta.finalValues)) {
        if (!revealed.has(sid)) continue;
        values.forEach((v, i) => {
          const st = frame.get(`bar-${sid}-${i}`);
          if (!st?.size) return;
          const expected = (v / meta.yMax!) * meta.plotH!;
          if (Math.abs(st.size[1] - expected) > 1) out.push(error("timeline", `bar ${sid}[${i}] ends ${Math.round(st.size[1])}px tall; ${v} on a ${meta.yMax} axis is ${Math.round(expected)}px`));
        });
      }
    }
  }
  const maxV = Math.max(...scene.series.flatMap((s) => s.values));
  if (scene.yMax !== undefined && maxV > scene.yMax) out.push(warn("yMax", `yMax ${scene.yMax} is below the largest value ${maxV}: bars are clipped`, "raise yMax or drop it to have it computed"));
  return out;
}

/** All semantic checks that apply. `scene` is optional for a bare timeline. */
/** Each pane is checked by its own kind's rules, under its path; the merged timeline gets the generic checks. */
function checkCompose(scene: Extract<Scene, { kind: "compose" }>): Diagnostic[] {
  const out: Diagnostic[] = [];
  scene.panes.forEach((pane, i) => {
    const prefix = `panes[${i}].scene`;
    for (const d of checkAnimation(compileScene(pane.scene), pane.scene)) out.push({ ...d, path: d.path ? `${prefix}.${d.path}` : prefix });
  });
  if (scene.panes.length === 1) out.push(warn("panes", "a compose with one pane is that pane with a border", "add the second picture, or write the pane's scene on its own"));
  return out;
}

/**
 * Layout defects read back from the frames (v12): a text on another text, a text under a filled box that is
 * not its own, a text past the canvas edge. One warning per pair (or per clipped text), at the first step it
 * shows, with the count of later steps it persists through. The compiler places annotations to avoid these;
 * when one is reported on an annotation's node it is the compiler's to fix, and the hint says so.
 */
export function checkLayout(tl: Timeline): Diagnostic[] {
  const report = layoutReport(tl);
  const seen = new Map<string, { first: LayoutFrame; issue: LayoutIssue; more: number }>();
  for (const f of report.frames) {
    for (const issue of f.issues) {
      const key = `${issue.kind}:${issue.nodes.join("|")}`;
      const s = seen.get(key);
      if (s) s.more++;
      else seen.set(key, { first: f, issue, more: 0 });
    }
  }
  const out: Diagnostic[] = [];
  for (const { first, issue, more } of seen.values()) {
    const where = `at step ${first.step?.index ?? "?"} (${Math.round(first.t)}ms)${more ? ` and ${more} later step(s)` : ""}`;
    const annotation = issue.nodes.some((id) => /^(value|callout|snapshot|group|text|relate)-/.test(id));
    const hint = annotation
      ? "the compiler placed this annotation — try another `side`, a shorter label, or anchor it at a different thing (the node instead of the edge), and report it if nothing helps"
      : "move one of them, shorten the text, or widen the canvas — in a laid-out kind (state-machine, graph, modules, diagram) try another `layout`, or reorder the nodes list: ties in `lr` / `tb` follow it";
    if (issue.kind === "clipped") out.push(warn(`nodes(${issue.nodes[0]})`, `"${issue.texts[0]}" runs ${issue.amount}px past the canvas edge ${where}`, hint));
    else if (issue.kind === "crossed") {
      const edgeHint = annotation
        ? hint
        : "an edge runs through a box that is not one of its ends — reorder the modules in that layer, put the two in one group, or shorten the label so the layout has room";
      out.push(warn(`nodes(${issue.nodes[0]})`, `"${issue.texts[0]}" has a line through it (${issue.nodes[1]}, ${issue.amount}px) ${where}`, edgeHint));
    } else {
      const other = issue.texts[1] ? `"${issue.texts[1]}"` : issue.nodes[1];
      out.push(warn(`nodes(${issue.nodes[0]})`, `"${issue.texts[0]}" is covered by ${other} (${Math.round(issue.amount * 100)}% of the smaller) ${where}`, hint));
    }
  }
  return out;
}

/**
 * Annotations whose asked `side` was not honoured (v17). The compiler moves a note when its spot would cover a
 * text, run through a line or leave the canvas by too much; two writers found out only by measuring the SVG.
 * A warning, not an error: the picture is clean, but it is not the one the writer asked for.
 */
export function checkPlacements(tl: Timeline): Diagnostic[] {
  const notes = (tl.meta as { placements?: Placement[] } | undefined)?.placements ?? [];
  return notes.map((p) =>
    warn(
      `${p.path}.${p.op}.side`,
      `the ${p.op} at "${p.at}" asked for \`${p.asked}\` and landed \`${p.landed}\`: ${p.reason}`,
      `if ${p.landed} reads fine, ask for it (or drop \`side\`) and this goes away; otherwise make room on the ${p.asked}: a shorter text, or anchor it at a thing whose ${p.asked} side is free`,
    ),
  );
}

export function checkAnimation(tl: Timeline, scene?: Scene): Diagnostic[] {
  let out = [...checkTimeline(tl), ...checkLayout(tl), ...checkPlacements(tl)];
  if (!scene) return out;
  // A module map without a sequence is a still figure by design: that nothing moves is not a warning.
  if (scene.kind === "modules" && !(scene.sequence ?? []).length) out = out.filter((d) => d.path !== "tracks");
  switch (scene.kind) {
    case "sort": out.push(...checkSort(scene, tl)); break;
    case "array": out.push(...checkArray(scene, tl)); break;
    case "stack":
    case "queue": out.push(...checkCollection(scene, tl)); break;
    case "list": out.push(...checkList(scene, tl)); break;
    case "heap": out.push(...checkHeap(scene, tl)); break;
    case "tree": out.push(...checkTree(scene, tl)); break;
    case "state-machine": out.push(...checkStateMachine(scene, tl)); break;
    case "distributed": out.push(...checkDistributed(scene, tl)); break;
    case "diagram": out.push(...checkDiagram(scene, tl)); break;
    case "modules": out.push(...checkModules(scene)); break;
    case "matrix": out.push(...checkMatrix(scene, tl)); break;
    case "graph": out.push(...checkGraph(scene, tl)); break;
    case "chart": out.push(...checkChart(scene, tl)); break;
    case "vector": break;
    case "compose": out.push(...checkCompose(scene)); break;
  }
  return out;
}

/** The narration as text: one line per step. What the runtime shows as captions, readable without playing. */
export function explain(tl: Timeline): string {
  const steps = tl.steps ?? [];
  const dur = timelineDuration(tl);
  const lines = steps.map((s, i) => `${String(i + 1).padStart(2)}. [${String(Math.round(s.t)).padStart(5)}ms] ${s.caption ?? (s.label ? `(${s.label})` : "")}`.trimEnd());
  return [`${tl.meta?.title ?? tl.meta?.kind ?? "animation"} — ${steps.length} steps, ${dur}ms, ${tl.nodes.length} nodes`, ...lines].join("\n");
}
