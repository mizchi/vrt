/**
 * `flowchart` → boxes, diamonds and pills laid out top-down (or left-right), arrows between them with the
 * answer a decision's way out carries, and a token that walks the path the writer lists. A visited node
 * turns the ok colour, the current one the accent; the edge just taken lights while the token is on it.
 *
 * The layout is the shared layered one (`layoutNodes`): a back edge (a loop from the body of a loop up to its
 * test) is a layer-skipping edge, and the shared router bends it round the nodes it would cross.
 */

import { textEm } from "../text-width.ts";
import type { FlowchartScene, FlowEdge, FlowNode, FlowShape, Timeline, Vec2 } from "../types.ts";
import { Builder, along, labelWidth, trimEdge } from "./builder.ts";
import { placeEdgeLabel, polylineLegs, routeAround, segmentInside } from "./route.ts";

interface NormNode {
  id: string;
  label: string;
  shape: FlowShape;
  pos?: Vec2;
}
interface NormEdge {
  from: string;
  to: string;
  label?: string;
}

export const normFlowNode = (n: string | FlowNode): NormNode => (typeof n === "string" ? { id: n, label: n, shape: "process" } : { id: n.id, label: n.label ?? n.id, shape: n.shape ?? "process", ...(n.pos ? { pos: n.pos } : {}) });
export const normFlowEdge = (e: FlowEdge): NormEdge => (Array.isArray(e) ? { from: e[0], to: e[1] } : e);

/** The box a node occupies: a diamond is wider and taller than its label, a pill a little rounder. */
export function flowNodeSize(n: NormNode, fontSize: number): Vec2 {
  const lines = n.label.split("\n");
  const w = Math.max(...lines.map((l) => textEm(l, 0.6) * fontSize)) + 24;
  const h = fontSize * 1.3 * lines.length + 14;
  if (n.shape === "decision") return [Math.max(72, Math.round(w * 1.5)), Math.max(48, Math.round(h * 1.9))];
  if (n.shape === "terminal") return [Math.max(64, Math.round(w)), Math.max(34, Math.round(h))];
  if (n.shape === "io") return [Math.max(72, Math.round(w + 20)), Math.max(36, Math.round(h))];
  return [Math.max(72, Math.round(w)), Math.max(36, Math.round(h))];
}

/** Where a straight line from the centre in direction `d` leaves the node's outline. */
function exitPoint(shape: FlowShape, size: Vec2, d: Vec2): Vec2 {
  const [w, h] = size;
  const [dx, dy] = d;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  if (shape === "decision") {
    // |x|/(w/2) + |y|/(h/2) = 1
    const t = 1 / (Math.abs(ux) / (w / 2) + Math.abs(uy) / (h / 2) || 1);
    return [ux * t, uy * t];
  }
  // A box (a pill is close enough): the nearer of the two slab exits.
  const tx = Math.abs(ux) < 1e-9 ? Infinity : w / 2 / Math.abs(ux);
  const ty = Math.abs(uy) < 1e-9 ? Infinity : h / 2 / Math.abs(uy);
  const t = Math.min(tx, ty);
  return [ux * t, uy * t];
}

export function compileFlowchart(scene: FlowchartScene): Timeline {
  const nodes = scene.nodes.map(normFlowNode);
  const edges = scene.edges.map(normFlowEdge);
  const layout = scene.layout ?? "tb";
  const fs = scene.theme?.fontSize ?? 14;
  const sizes = new Map(nodes.map((n) => [n.id, flowNodeSize(n, fs)]));
  const maxW = Math.max(...[...sizes.values()].map((s) => s[0]));
  const maxH = Math.max(...[...sizes.values()].map((s) => s[1]));
  const widestLabel = Math.max(40, ...edges.map((e) => (e.label ? labelWidth(e.label, fs - 2) : 0)));
  // Layers by distance from `start` along the edges, ignoring an edge back to a node already placed (a loop):
  // a flowchart reads down the page in the order the walk would take, not by the longest path through it.
  const start = scene.start ?? nodes[0]?.id;
  const layer = flowLayers(nodes.map((n) => n.id), edges, start);
  const depth = Math.max(0, ...layer.values()) + 1;
  const byLayer: string[][] = Array.from({ length: depth }, () => []);
  for (const n of nodes) byLayer[layer.get(n.id)!].push(n.id);
  // Within a layer, a node sits under the mean of its parents in the layer above (its list order breaks ties),
  // so branches spread left and right of the decision they leave.
  const order = new Map<string, number>();
  byLayer.forEach((ids, li) => {
    if (li === 0) ids.forEach((id, i) => order.set(id, i));
    else {
      const key = (id: string): number => {
        const parents = edges.filter((e) => e.to === id && order.has(e.from) && layer.get(e.from)! < li).map((e) => order.get(e.from)!);
        return parents.length ? parents.reduce((a, c) => a + c, 0) / parents.length : ids.indexOf(id);
      };
      ids.sort((a, c) => key(a) - key(c) || ids.indexOf(a) - ids.indexOf(c));
      ids.forEach((id, i) => order.set(id, i));
    }
  });
  const widest = Math.max(1, ...byLayer.map((l) => l.length));
  const gapMain = 56 + Math.round(widestLabel * 0.3);
  const gapCross = 60;
  const b = new Builder(scene, {
    width: layout === "tb" ? Math.max(480, widest * (maxW + gapCross) + 120) : Math.max(640, depth * (maxW + gapMain) + 100),
    height: layout === "tb" ? Math.max(360, depth * (maxH + gapMain) + 110) : Math.max(360, widest * (maxH + 40) + 140),
    stepMs: 700,
  });
  const T = b.theme;
  const pos = new Map<string, Vec2>();
  const topY = scene.title ? 60 : 36;
  byLayer.forEach((ids, li) => {
    ids.forEach((id, i) => {
      const n = nodes.find((x) => x.id === id)!;
      if (n.pos) {
        pos.set(id, n.pos);
        return;
      }
      const main = li * (layout === "tb" ? maxH + gapMain : maxW + gapMain);
      const cross = (i - (ids.length - 1) / 2) * (layout === "tb" ? maxW + gapCross : maxH + 40);
      pos.set(id, layout === "tb" ? [Math.round(b.width / 2 + cross), Math.round(topY + maxH / 2 + main)] : [Math.round(50 + maxW / 2 + main), Math.round(topY + 20 + (b.height - topY - 80) / 2 + cross)]);
    });
  });

  if (scene.title) b.node({ id: "title", shape: "text", pos: [b.width / 2, 22], text: scene.title, fontSize: T.fontSize + 4, color: T.text });

  // Edges first so nodes draw over their ends. Blockers are every node's box, padded.
  const blockers = nodes.map((n) => {
    const p = pos.get(n.id)!;
    const [w, h] = sizes.get(n.id)!;
    return { id: n.id, box: { x: p[0] - w / 2 - 6, y: p[1] - h / 2 - 6, w: w + 12, h: h + 12 } };
  });
  const occupied = blockers.map((bl) => bl.box);
  const edgePts = new Map<number, Vec2[]>();
  const edgeKey = (e: NormEdge) => `${e.from}->${e.to}`;
  const labelBox = (p: Vec2, text: string) => {
    const lw = labelWidth(text, fs - 2) - (fs - 2) * 1.6;
    const lh = (fs - 2) * 1.3;
    return { x: p[0] - lw / 2, y: p[1] - lh / 2, w: lw, h: lh };
  };
  edges.forEach((e, i) => {
    const a = pos.get(e.from)!;
    const c = pos.get(e.to)!;
    const na = nodes.find((n) => n.id === e.from)!;
    const nc = nodes.find((n) => n.id === e.to)!;
    const id = `edge-${i}`;
    let pts: Vec2[];
    // Strictly earlier: two nodes on one layer (the two answers of a decision) are joined straight across.
    if (layer.get(e.to)! < layer.get(e.from)! && !na.pos && !nc.pos) {
      // A loop back to an earlier node runs round the outside of the chart — out of the node's side, along the
      // margin, and back in at the target's side — the way a hand-drawn flowchart does, instead of zigzagging
      // through the layers between.
      const [wa, ha] = sizes.get(e.from)!;
      const [wc, hc] = sizes.get(e.to)!;
      // A leg that would run through another node moves off the node's centre line to just past its edge.
      const others = blockers.filter((bl) => bl.id !== e.from && bl.id !== e.to).map((bl) => bl.box);
      const clear = (u: Vec2, v: Vec2): boolean => others.every((o) => segmentInside([u, v], o) <= 2);
      if (layout === "tb") {
        const rightEdge = Math.max(...nodes.map((n) => pos.get(n.id)![0] + sizes.get(n.id)![0] / 2));
        const leftEdge = Math.min(...nodes.map((n) => pos.get(n.id)![0] - sizes.get(n.id)![0] / 2));
        const useRight = a[0] + c[0] >= b.width;
        const sideX = useRight ? rightEdge + 28 : leftEdge - 28;
        const dir = useRight ? 1 : -1;
        let p: Vec2 = [a[0] + dir * (wa / 2), a[1]];
        let out: Vec2 = [sideX, a[1]];
        if (!clear(p, out)) {
          // Leave from the bottom instead and run along under the node to the margin.
          const y = a[1] + ha / 2 + 14;
          p = [a[0], a[1] + ha / 2];
          pts = [p, [a[0], y], [sideX, y]];
        } else pts = [p, out];
        let q: Vec2 = [c[0] + dir * (wc / 2 + 6), c[1]];
        const into: Vec2 = [sideX, c[1]];
        if (!clear(into, q)) {
          // Come in from above the target instead.
          const y = c[1] - hc / 2 - 14;
          q = [c[0], c[1] - hc / 2 - 6];
          pts.push([sideX, y], [c[0], y], q);
        } else pts.push(into, q);
      } else {
        const bottomEdge = Math.max(...nodes.map((n) => pos.get(n.id)![1] + sizes.get(n.id)![1] / 2));
        const topEdge = Math.min(...nodes.map((n) => pos.get(n.id)![1] - sizes.get(n.id)![1] / 2));
        const useBottom = a[1] + c[1] >= b.height - 60;
        const sideY = useBottom ? bottomEdge + 24 : topEdge - 24;
        const dir = useBottom ? 1 : -1;
        let p: Vec2 = [a[0], a[1] + dir * (ha / 2)];
        const out: Vec2 = [a[0], sideY];
        if (!clear(p, out)) {
          const x = a[0] + wa / 2 + 16;
          p = [a[0] + wa / 2, a[1]];
          pts = [p, [x, a[1]], [x, sideY]];
        } else pts = [p, out];
        let q: Vec2 = [c[0], c[1] + dir * (hc / 2 + 6)];
        const into: Vec2 = [c[0], sideY];
        if (!clear(into, q)) {
          const x = c[0] - wc / 2 - 16;
          q = [c[0] - wc / 2 - 6, c[1]];
          pts.push([x, sideY], [x, c[1]], q);
        } else pts.push(into, q);
      }
    } else {
      const centres = routeAround(a, c, blockers, new Set([e.from, e.to]));
      // Trim each end at the node's outline, on the leg that touches it.
      const first = centres[1];
      const last = centres[centres.length - 2];
      const pa = exitPoint(na.shape, sizes.get(e.from)!, [first[0] - a[0], first[1] - a[1]]);
      const pc = exitPoint(nc.shape, sizes.get(e.to)!, [last[0] - c[0], last[1] - c[1]]);
      const p: Vec2 = [a[0] + pa[0], a[1] + pa[1]];
      const qRaw: Vec2 = [c[0] + pc[0], c[1] + pc[1]];
      // Stop short of the outline so the arrowhead's tip sits on it.
      const [, q] = trimEdge(last, qRaw, 0, 6);
      pts = [p, ...centres.slice(1, -1), q];
    }
    const p = pts[0];
    const q = pts[pts.length - 1];
    edgePts.set(i, pts);
    if (pts.length === 2) b.node({ id, shape: "arrow", points: [p, q], stroke: T.nodeStroke, strokeWidth: 1.5 });
    else {
      const r = (v: number) => Math.round(v * 10) / 10;
      const d = pts.map((pt, k) => `${k === 0 ? "M" : "L"} ${r(pt[0] - p[0])} ${r(pt[1] - p[1])}`).join(" ");
      b.node({ id, shape: "path", pos: p, d, head: true, fill: "none", stroke: T.nodeStroke, strokeWidth: 1.5 });
    }
    if (e.label) {
      const probe = labelBox([0, 0], e.label);
      // A decision's answer sits near the decision, on the first leg, so the reader ties it to the question.
      const legPts: Vec2[] = na.shape === "decision" ? [pts[0], along(pts[0], pts[1], Math.min(1, 44 / (Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) || 1)) * 2)] : pts;
      const lp = placeEdgeLabel(legPts, probe.w, probe.h, occupied, 11);
      b.node({ id: `${id}-label`, shape: "text", pos: lp, text: e.label, fontSize: fs - 2, color: T.text, halo: true });
      occupied.push(labelBox(lp, e.label));
    }
    b.anchor(edgeKey(e), id);
  });
  // An edge label used once anchors its edge.
  for (const e of edges) if (e.label && edges.filter((x) => x.label === e.label).length === 1) b.anchor(e.label, `edge-${edges.indexOf(e)}`);

  for (const n of nodes) {
    const p = pos.get(n.id)!;
    const [w, h] = sizes.get(n.id)!;
    const id = `node-${n.id}`;
    if (n.shape === "decision") {
      const d = `M 0 ${-h / 2} L ${w / 2} 0 L 0 ${h / 2} L ${-w / 2} 0 Z`;
      b.node({ id, shape: "path", pos: p, d, fill: T.node, stroke: T.nodeStroke, strokeWidth: 1.5, text: n.label, fontSize: fs, color: T.text });
    } else if (n.shape === "io") {
      const k = 10;
      const d = `M ${-w / 2 + k} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2 - k} ${h / 2} L ${-w / 2} ${h / 2} Z`;
      b.node({ id, shape: "path", pos: p, d, fill: T.node, stroke: T.nodeStroke, strokeWidth: 1.5, text: n.label, fontSize: fs, color: T.text });
    } else b.node({ id, shape: "rect", pos: p, size: [w, h], rx: n.shape === "terminal" ? h / 2 : 6, fill: T.node, stroke: T.nodeStroke, strokeWidth: 1.5, text: n.label, fontSize: fs, color: T.text });
    b.anchor(n.id, id);
  }
  // The token rests at the node's right edge, off the label (v18's lesson from the state machine).
  const rest = (id: string): Vec2 => {
    const p = pos.get(id)!;
    const [w] = sizes.get(id)!;
    return [p[0] + w / 2 + 2, p[1]];
  };
  b.node({ id: "token", shape: "circle", pos: rest(start), r: 6, fill: T.accent, stroke: T.nodeStroke, opacity: 1 });
  b.anchor("token", "token");

  // The walk.
  const visited: string[] = [start];
  let cur = start;
  b.set(`node-${start}`, "fill", T.accent, 0);
  b.step(`Start at "${nodes.find((n) => n.id === start)?.label ?? start}"`, "start");
  b.advance(b.stepMs * 0.7);
  for (const item of scene.walk ?? []) {
    if (b.annotate(item, "walk")) continue;
    if (typeof item === "object" && "note" in item) {
      b.step(item.note);
      b.advance(item.ms ?? b.stepMs * 0.9);
      continue;
    }
    if (typeof item === "object" && !("at" in item)) continue;
    const next = typeof item === "string" ? item : item.at;
    const caption = typeof item === "string" ? undefined : item.caption;
    const ms = typeof item === "string" ? undefined : item.ms;
    const ei = edges.findIndex((e) => e.from === cur && e.to === next);
    if (ei < 0) break; // the validator reports it; compile what is legal
    const e = edges[ei];
    const from = nodes.find((n) => n.id === cur)!;
    const to = nodes.find((n) => n.id === next)!;
    const generated = from.shape === "decision" && e.label ? `${from.label}: ${e.label} → ${to.label}` : `${from.label} → ${to.label}`;
    b.step(caption ?? generated, next);
    b.set(`edge-${ei}`, "stroke", T.accent);
    const t0 = b.t;
    const t1 = b.advance(ms ?? b.stepMs);
    const pts = [rest(cur), ...(edgePts.get(ei) ?? []).slice(1, -1), rest(next)];
    if (pts.length === 2) b.tween("token", "pos", rest(next), t0, t1);
    else {
      const { legs, total } = polylineLegs(pts);
      let at = t0;
      pts.slice(1).forEach((pt, k) => {
        const end = k === legs.length - 1 ? t1 : at + ((t1 - t0) * legs[k]) / total;
        b.tween("token", "pos", pt, at, end, "linear");
        at = end;
      });
    }
    b.set(`node-${cur}`, "fill", T.ok, t0 + (t1 - t0) * 0.5);
    b.set(`node-${next}`, "fill", T.accent, t1);
    b.set(`edge-${ei}`, "stroke", T.nodeStroke, t1);
    b.advance(b.stepMs * 0.3);
    cur = next;
    visited.push(cur);
  }
  const last = nodes.find((n) => n.id === cur);
  b.step(last?.shape === "terminal" ? `End at "${last.label}"` : `Stop at "${last?.label ?? cur}"`, "end");
  b.advance(b.stepMs * 0.5);
  return b.build({ title: scene.title, kind: "flowchart", visited, path: visited });
}

/** Layer of each node: its distance from `start` along the edges, unreached nodes after the last reached layer. */
export function flowLayers(ids: string[], edges: NormEdge[], start: string | undefined): Map<string, number> {
  const layer = new Map<string, number>();
  const queue: string[] = start ? [start] : [];
  if (start) layer.set(start, 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const e of edges) {
      if (e.from !== u || layer.has(e.to)) continue;
      layer.set(e.to, layer.get(u)! + 1);
      queue.push(e.to);
    }
  }
  let next = Math.max(-1, ...layer.values()) + 1;
  for (const id of ids) if (!layer.has(id)) layer.set(id, next++);
  return layer;
}
