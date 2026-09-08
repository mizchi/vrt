/**
 * `graph` → nodes and edges, walked by a traversal. An `algorithm` runs BFS /
 * DFS / Dijkstra from `start` and emits the ops; an explicit `ops` list plays
 * as written. Nodes never move: `visit` recolours (current = accent and a
 * little larger, visited = ok), `explore` sends a token along an edge,
 * `label` writes text beside a node, `path` paints the answer.
 */

import type { GraphEdge, GraphOp, GraphScene, Timeline } from "../types.ts";
import { Builder, along, labelWidth, trimEdge } from "./builder.ts";
import { segmentInside } from "./route.ts";
import { layoutNodes, circleRadius } from "./layout.ts";

export interface NormEdge {
  from: string;
  to: string;
  weight?: number;
  label?: string;
}

export const normEdge = (e: GraphEdge): NormEdge => (Array.isArray(e) ? { from: e[0], to: e[1] } : e);

/** Outgoing edges of `u` in declaration order; both directions on an undirected graph. */
function neighbours(edges: NormEdge[], u: string, directed: boolean): { v: string; w: number }[] {
  const out: { v: string; w: number }[] = [];
  for (const e of edges) {
    if (e.from === u) out.push({ v: e.to, w: e.weight ?? 1 });
    else if (!directed && e.to === u) out.push({ v: e.from, w: e.weight ?? 1 });
  }
  return out;
}

export function generateGraphOps(scene: GraphScene): GraphOp[] {
  const edges = scene.edges.map(normEdge);
  const directed = scene.directed === true;
  const start = scene.start ?? (typeof scene.nodes[0] === "string" ? scene.nodes[0] : scene.nodes[0].id);
  const ops: GraphOp[] = [];
  const algo = scene.algorithm ?? "bfs";

  if (algo === "bfs") {
    const seen = new Set([start]);
    const depth = new Map([[start, 0]]);
    const queue = [start];
    ops.push({ visit: start, caption: `Start at ${start}: depth 0` });
    ops.push({ label: { node: start, text: "0" }, ms: 0 });
    while (queue.length) {
      const u = queue.shift()!;
      if (u !== start) ops.push({ visit: u, caption: `Dequeue ${u} (depth ${depth.get(u)}) and look at its neighbours` });
      for (const { v } of neighbours(edges, u, directed)) {
        if (seen.has(v)) {
          ops.push({ explore: [u, v], caption: `${u} → ${v}: already seen` });
          continue;
        }
        seen.add(v);
        depth.set(v, depth.get(u)! + 1);
        queue.push(v);
        ops.push({ explore: [u, v], caption: `${u} → ${v}: new, enqueue at depth ${depth.get(v)}` });
        ops.push({ highlight: v, ms: 0 });
        ops.push({ label: { node: v, text: String(depth.get(v)) }, ms: 0 });
      }
    }
    return ops;
  }

  if (algo === "dfs") {
    const seen = new Set<string>();
    const walk = (u: string, from?: string): void => {
      seen.add(u);
      ops.push({ visit: u, caption: from ? `Go deeper: visit ${u}` : `Start at ${u}` });
      for (const { v } of neighbours(edges, u, directed)) {
        if (seen.has(v)) {
          ops.push({ explore: [u, v], caption: `${u} → ${v}: already visited` });
          continue;
        }
        ops.push({ explore: [u, v], caption: `${u} → ${v}: unvisited, follow it` });
        walk(v, u);
      }
      if (from) ops.push({ note: `${u} has no unvisited neighbours: back to ${from}` });
    };
    walk(start);
    return ops;
  }

  // dijkstra
  const ids = scene.nodes.map((n) => (typeof n === "string" ? n : n.id));
  const dist = new Map<string, number>(ids.map((id) => [id, Infinity]));
  const prev = new Map<string, string>();
  dist.set(start, 0);
  const done = new Set<string>();
  ops.push({ label: { node: ids.filter((id) => id !== start), text: "∞" }, caption: `Every node starts at distance ∞; ${start} is 0` });
  ops.push({ label: { node: start, text: "0" }, ms: 0 });
  for (;;) {
    let u: string | undefined;
    for (const id of ids) if (!done.has(id) && dist.get(id)! < Infinity && (u === undefined || dist.get(id)! < dist.get(u)!)) u = id;
    if (u === undefined) break;
    done.add(u);
    ops.push({ visit: u, caption: `Visit ${u} (distance ${dist.get(u)}): the smallest tentative distance left` });
    for (const { v, w } of neighbours(edges, u, directed)) {
      if (done.has(v)) continue;
      const nd = dist.get(u)! + w;
      if (nd < dist.get(v)!) {
        ops.push({ explore: [u, v], caption: `${u} → ${v}: ${dist.get(u)} + ${w} = ${nd} < ${dist.get(v) === Infinity ? "∞" : dist.get(v)}, improve` });
        dist.set(v, nd);
        prev.set(v, u);
        ops.push({ label: { node: v, text: String(nd) }, ms: 0 });
      } else ops.push({ explore: [u, v], caption: `${u} → ${v}: ${dist.get(u)} + ${w} = ${nd} is no better than ${dist.get(v)}` });
    }
  }
  if (scene.goal && dist.get(scene.goal)! < Infinity) {
    const path = [scene.goal];
    while (prev.has(path[0])) path.unshift(prev.get(path[0])!);
    ops.push({ path, caption: `Shortest path to ${scene.goal}: ${path.join(" → ")} (length ${dist.get(scene.goal)})` });
  }
  return ops;
}

export function compileGraph(scene: GraphScene): Timeline {
  // A circle of many nodes needs a ring they fit on; the canvas grows to hold it (the layout used to shrink the
  // ring to the frame and stack the nodes).
  const fs0 = scene.theme?.fontSize ?? 14;
  const nodeR = Math.max(...scene.nodes.map((n) => Math.min(30, Math.max(18, labelWidth((typeof n === "string" ? n : n.label ?? n.id), fs0) / 2))));
  const ring = (scene.layout ?? "circle") === "circle" ? circleRadius(scene.nodes.length, nodeR * 2 + 28) + nodeR : 0;
  const b = new Builder(scene, { width: Math.max(640, 2 * ring + 120), height: Math.max(400, 2 * ring + 160), stepMs: 600 });
  const T = b.theme;
  const nodes = scene.nodes.map((n) => (typeof n === "string" ? { id: n } : n));
  const ids = nodes.map((n) => n.id);
  const edges = scene.edges.map(normEdge);
  const directed = scene.directed === true;
  const ops = scene.ops ?? generateGraphOps(scene);

  const radius = new Map(nodes.map((n) => [n.id, Math.min(30, Math.max(18, labelWidth(n.label ?? n.id, T.fontSize) / 2))]));
  const maxR = Math.max(...radius.values());
  const fixed = new Map<string, [number, number]>();
  for (const n of nodes) if (n.pos) fixed.set(n.id, n.pos);
  const pos = layoutNodes(
    { ids, edges: edges.map((e): [string, string] => [e.from, e.to]), fixed, width: b.width - 60, height: b.height - 110, nodeW: maxR * 2 + 16, nodeH: maxR * 2 + 28 },
    scene.layout ?? "circle",
  );
  for (const [id, p] of pos) if (!fixed.has(id)) pos.set(id, [p[0] + 30, p[1] + 50]);

  if (scene.title) b.node({ id: "title", shape: "text", pos: [b.width / 2, 22], text: scene.title, fontSize: T.fontSize + 4, color: T.text });

  const edgeGeom = new Map<string, { id: string; p: [number, number]; q: [number, number] }>();
  edges.forEach((e, i) => {
    const a = pos.get(e.from)!;
    const c = pos.get(e.to)!;
    const [p, q] = trimEdge(a, c, radius.get(e.from)! + 2, radius.get(e.to)! + (directed ? 7 : 2));
    const id = `edge-${i}`;
    edgeGeom.set(`${e.from}->${e.to}`, { id, p, q });
    b.node({ id, shape: directed ? "arrow" : "line", points: [p, q], stroke: T.nodeStroke, strokeWidth: 1.5 });
    const text = e.label ?? (e.weight !== undefined ? String(e.weight) : undefined);
    if (text !== undefined) {
      const mid = along(p, q, 0.5);
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nx = -(q[1] - p[1]) / len;
      const ny = (q[0] - p[0]) / len;
      b.node({ id: `${id}-label`, shape: "text", pos: [mid[0] + nx * 10, mid[1] + ny * 10], text, fontSize: T.fontSize - 2, color: T.muted, halo: true });
    }
  });
  // A node's label (a distance, a depth) goes on the side of the node no edge leaves from and no other node
  // sits on: below first, then above, right, left. Fixed below, it sat on an edge in 17 of 18 frames for a
  // writer who then permuted the node order 720 ways to move the edge instead (la, v18).
  const segs = [...edgeGeom.values()].map((g): [[number, number], [number, number]] => [g.p, g.q]);
  const labelSide = (id: string): [number, number] => {
    const p = pos.get(id)!;
    const r = radius.get(id)!;
    const fs = T.fontSize - 2;
    const lw = labelWidth("00", fs) - fs * 1.6;
    const lh = fs * 1.3;
    const spots: [number, number][] = [
      [p[0], p[1] + r + 12],
      [p[0], p[1] - r - 10],
      [p[0] + r + 6 + lw / 2, p[1]],
      [p[0] - r - 6 - lw / 2, p[1]],
    ];
    const cost = (c: [number, number]): number => {
      const box = { x: c[0] - lw / 2, y: c[1] - lh / 2, w: lw, h: lh };
      let s = 0;
      for (const sg of segs) s += segmentInside(sg, box);
      for (const other of nodes) {
        if (other.id === id) continue;
        const q = pos.get(other.id)!;
        const or = radius.get(other.id)!;
        const ob = { x: q[0] - or, y: q[1] - or, w: 2 * or, h: 2 * or };
        if (box.x < ob.x + ob.w && ob.x < box.x + box.w && box.y < ob.y + ob.h && ob.y < box.y + box.h) s += 100;
      }
      if (box.x < 0 || box.y < 0 || box.x + box.w > b.width || box.y + box.h > b.height - 40) s += 1000;
      return s;
    };
    let best = spots[0];
    let bestCost = Infinity;
    for (const c of spots) {
      const k = cost(c);
      if (k < bestCost - 1e-9) {
        best = c;
        bestCost = k;
      }
    }
    return best;
  };
  for (const n of nodes) {
    const p = pos.get(n.id)!;
    const r = radius.get(n.id)!;
    b.node({ id: `node-${n.id}`, shape: "circle", pos: p, r, fill: T.node, stroke: T.nodeStroke, strokeWidth: 1.5, text: n.label ?? n.id, fontSize: T.fontSize, color: T.text });
    b.node({ id: `label-${n.id}`, shape: "text", pos: labelSide(n.id), text: "", fontSize: T.fontSize - 2, color: T.accent });
  }
  b.node({ id: "token", shape: "circle", pos: [0, 0], r: 6, fill: T.accent, stroke: T.nodeStroke, opacity: 0 });
  for (const n of nodes) b.anchor(n.id, `node-${n.id}`);
  for (const [key, g] of edgeGeom) b.anchor(key, g.id);

  const lookup =(a: string, c: string): { id: string; p: [number, number]; q: [number, number] } | undefined => {
    const fwd = edgeGeom.get(`${a}->${c}`);
    if (fwd) return fwd;
    const back = edgeGeom.get(`${c}->${a}`);
    return back && !directed ? { id: back.id, p: back.q, q: back.p } : undefined;
  };
  const arr = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v]);
  const pair = (v: string | [string, string]): [string, string] => (typeof v === "string" ? (v.split("->").map((s) => s.trim()) as [string, string]) : v);

  let current: string | undefined;
  const visited: string[] = [];
  const explored: [string, string][] = [];
  const labels = new Map<string, string>();
  let path: string[] | undefined;

  b.step(scene.title ?? "Start", "start");
  b.advance(b.stepMs * 0.6);
  for (const op of ops) {
    if (b.annotate(op)) continue;
    const ms = op.ms ?? b.stepMs;
    const caption = "caption" in op ? op.caption : undefined;
    if ("note" in op) {
      b.step(op.note);
      b.advance(ms);
    } else if ("visit" in op) {
      b.step(caption ?? `Visit ${op.visit}`);
      const t0 = b.t;
      if (current !== undefined && current !== op.visit) {
        b.tween(`node-${current}`, "fill", T.ok, t0, t0 + Math.min(200, ms / 2));
        b.tween(`node-${current}`, "scale", 1, t0, t0 + Math.min(200, ms / 2));
      }
      b.tween(`node-${op.visit}`, "fill", T.accent, t0, t0 + Math.min(200, ms / 2));
      b.tween(`node-${op.visit}`, "scale", 1.15, t0, t0 + Math.min(200, ms / 2));
      current = op.visit;
      if (!visited.includes(op.visit)) visited.push(op.visit);
      b.advance(ms);
    } else if ("explore" in op) {
      const [a, c] = pair(op.explore);
      const g = lookup(a, c);
      if (!g) continue; // the validator reports the missing edge
      b.step(caption ?? `${a} → ${c}`);
      const t0 = b.t;
      const t1 = t0 + ms;
      b.set(g.id, "stroke", T.accent, t0);
      b.set("token", "pos", g.p, t0);
      b.set("token", "opacity", 1, t0);
      b.tween("token", "pos", g.q, t0, t1);
      b.set("token", "opacity", 0, t1);
      b.set(g.id, "stroke", T.nodeStroke, t1);
      explored.push([a, c]);
      b.advance(ms);
    } else if ("label" in op) {
      // `ms: 0` applies the text at the current instant with no step of its own — how a
      // generated relaxation writes the new distance inside the explore beat.
      const targets = arr(op.label.node);
      if (ms > 0) b.step(caption ?? (targets.length === 1 ? `${targets[0]}: ${op.label.text}` : undefined));
      for (const id of targets) {
        b.set(`label-${id}`, "text", op.label.text);
        labels.set(id, op.label.text);
      }
      b.advance(ms);
    } else if ("highlight" in op || "unhighlight" in op) {
      const lit = "highlight" in op;
      const targets = arr(lit ? op.highlight : op.unhighlight);
      if (ms > 0) b.step(caption ?? (lit ? `Look at ${targets.join(", ")}` : undefined));
      const t0 = b.t;
      for (const id of targets) {
        const fill = lit ? T.accent : visited.includes(id) ? T.ok : T.node;
        if (ms > 0) b.tween(`node-${id}`, "fill", fill, t0, t0 + Math.min(200, ms));
        else b.set(`node-${id}`, "fill", fill, t0);
      }
      b.advance(ms);
    } else if ("path" in op) {
      b.step(caption ?? `Path: ${op.path.join(" → ")}`);
      const t0 = b.t;
      if (current !== undefined) {
        b.tween(`node-${current}`, "fill", T.ok, t0, t0 + 200);
        b.tween(`node-${current}`, "scale", 1, t0, t0 + 200);
        current = undefined;
      }
      for (let i = 0; i < op.path.length; i++) {
        const t = t0 + (ms * i) / Math.max(1, op.path.length - 1);
        b.set(`node-${op.path[i]}`, "fill", T.ok, t);
        b.set(`node-${op.path[i]}`, "stroke", T.ok, t);
        if (i > 0) {
          const g = lookup(op.path[i - 1], op.path[i]);
          if (g) b.set(g.id, "stroke", T.ok, t);
        }
      }
      path = op.path;
      b.advance(ms);
    }
  }
  if (current !== undefined) {
    b.set(`node-${current}`, "fill", T.ok);
    b.set(`node-${current}`, "scale", 1);
  }
  b.step(undefined, "end");
  b.advance(b.stepMs * 0.4);
  return b.build({ title: scene.title, kind: "graph", visited, explored, labels: Object.fromEntries(labels), path });
}
