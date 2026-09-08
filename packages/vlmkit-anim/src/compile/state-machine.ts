/**
 * `state-machine` → states as circles, transitions as labelled arrows, and a
 * token that walks the trace. The active state is filled with the accent
 * colour; each fired event is one step with a caption "on <event>: a → b".
 */

import type { StateMachineScene, Timeline } from "../types.ts";
import { Builder, along, labelWidth, trimEdge } from "./builder.ts";
import { layoutNodes, circleRadius } from "./layout.ts";
import { placeEdgeLabel, polylineLegs, routeAround } from "./route.ts";

export function compileStateMachine(scene: StateMachineScene): Timeline {
  const states = scene.states.map((s) => (typeof s === "string" ? { id: s } : s));
  const layout = scene.layout ?? "lr";
  const fontSize = scene.theme?.fontSize ?? 14;
  const radius = new Map(states.map((s) => [s.id, Math.max(28, Math.ceil(labelWidth(s.label ?? s.id, fontSize) / 2) - 2)]));
  const R = Math.max(...radius.values());
  // Room between neighbouring states for the widest transition label.
  const widestLabel = Math.max(60, ...scene.transitions.map((t) => labelWidth(t.note ? `${t.on} ${t.note}` : t.on, fontSize - 2)));
  const span = states.length * R * 2 + (states.length - 1) * (widestLabel + 16) + 80;
  // A circle grows with the ring the states need, not the other way round.
  const ring = layout === "circle" ? circleRadius(states.length, R * 2.5) + R : 0;
  const b = new Builder(scene, {
    width: layout === "lr" ? Math.max(640, Math.round(span)) : Math.max(640, 2 * ring + 120),
    height: layout === "tb" ? Math.max(360, states.length * (R * 2 + 70)) : Math.max(360, 2 * ring + 130),
    stepMs: 700,
  });
  const T = b.theme;
  const ids = states.map((s) => s.id);
  // Pinned states are given in canvas coordinates; the layout works in a frame
  // inset by the title and caption bands, so translate pins into it and back.
  const fixed = new Map<string, [number, number]>();
  for (const s of states) if (s.pos) fixed.set(s.id, [s.pos[0] - 30, s.pos[1] - 40]);
  const pos = layoutNodes(
    { ids, edges: scene.transitions.map((t) => [t.from, t.to]), fixed, width: b.width - 60, height: b.height - 90, nodeW: R * 2.5, nodeH: R * 2.5 },
    layout,
  );
  for (const [id, p] of pos) pos.set(id, [p[0] + 30, p[1] + 40]);

  if (scene.title) b.node({ id: "title", shape: "text", pos: [b.width / 2, 22], text: scene.title, fontSize: T.fontSize + 4, color: T.text });

  // Transitions first so states draw over the arrow ends.
  const seen = new Map<string, { k: number; n: [number, number] }>();
  // A state in the way of a transition is a box the transition bends around (ib, v15: 支払い完了 → 返金済み ran
  // straight through 出荷準備中 and its label sat on the state; the diagram compiler had routed since v13).
  const blockers = states.map((s) => {
    const p = pos.get(s.id)!;
    const r = radius.get(s.id)! + 4;
    return { id: s.id, box: { x: p[0] - r, y: p[1] - r, w: 2 * r, h: 2 * r } };
  });
  /** Each transition's centre line, for the token to follow. */
  const edgePts = new Map<number, [number, number][]>();
  /** Where labels and states already are, so a bent transition's label goes somewhere else. */
  const occupied: { x: number; y: number; w: number; h: number }[] = blockers.map((bl) => bl.box);
  const labelBox = (p: [number, number], text: string): { x: number; y: number; w: number; h: number } => {
    const lw = labelWidth(text, T.fontSize - 2) - (T.fontSize - 2) * 1.6;
    const lh = (T.fontSize - 2) * 1.3;
    return { x: p[0] - lw / 2, y: p[1] - lh / 2, w: lw, h: lh };
  };
  // Straight transitions first (their labels are fixed by the pair rule), then the bent ones, whose labels
  // pick a spot the straight ones have not taken.
  const bent: { tr: (typeof scene.transitions)[number]; i: number; pts: [number, number][]; p: [number, number]; label: string }[] = [];
  scene.transitions.forEach((tr, i) => {
    const a = pos.get(tr.from)!;
    const c = pos.get(tr.to)!;
    const id = `tr-${i}`;
    const label = tr.note ? `${tr.on} ${tr.note}` : tr.on;
    const ra = radius.get(tr.from)!;
    const rc = radius.get(tr.to)!;
    if (tr.from === tr.to) {
      // Self loop: a small arc above the state.
      const d = `M ${a[0] - 12} ${a[1] - ra + 4} C ${a[0] - 40} ${a[1] - ra - 50}, ${a[0] + 40} ${a[1] - ra - 50}, ${a[0] + 12} ${a[1] - ra + 4}`;
      b.node({ id, shape: "path", d, stroke: T.nodeStroke, fill: "none" });
      b.node({ id: `${id}-label`, shape: "text", pos: [a[0], a[1] - ra - 48], text: label, fontSize: T.fontSize - 2, color: T.text, halo: true });
      edgePts.set(i, [a, a]);
      return;
    }
    const centres = routeAround(a, c, blockers, new Set([tr.from, tr.to]));
    if (centres.length > 2) {
      // Bent: a path through the waypoints, trimmed at the two circles; drawn after the straight ones.
      const [p] = trimEdge(a, centres[1], ra + 2, 0);
      const [, q] = trimEdge(centres[centres.length - 2], c, 0, rc + 6);
      const pts: [number, number][] = [p, ...centres.slice(1, -1), q];
      edgePts.set(i, pts);
      bent.push({ tr, i, pts, p, label });
      return;
    }
    // Parallel edges (a→b and b→a) share one perpendicular, fixed by the first of
    // the pair, so the partner is offset to the side AWAY from the first edge's
    // label. The first edge's label sits on the -n side (above a rightward arrow);
    // each further edge is shifted along +n and its label placed beyond it.
    const key = [tr.from, tr.to].sort().join("|");
    const [p, q] = trimEdge(a, c, ra + 2, rc + 6);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const pair = seen.get(key) ?? { k: 0, n: [-dy / len, dx / len] as [number, number] };
    seen.set(key, { k: pair.k + 1, n: pair.n });
    const [nx, ny] = pair.n;
    const off = pair.k * 14;
    const pp: [number, number] = [p[0] + nx * off, p[1] + ny * off];
    const qq: [number, number] = [q[0] + nx * off, q[1] + ny * off];
    b.node({ id, shape: "arrow", points: [pp, qq], stroke: T.nodeStroke });
    edgePts.set(i, [pp, qq]);
    const mid = along(pp, qq, 0.5);
    const labelOff = pair.k === 0 ? -13 : off + 13;
    let lp: [number, number] = [mid[0] + nx * labelOff, mid[1] + ny * labelOff];
    // The pair rule's spot may be on a state — a bystander ("refund" on `vending` in `tb`) or one of its own ends
    // ("last-item" on `vending` in `circle`; lb, v18); then the label takes a spot no state and no earlier label
    // holds, like a bent transition's does.
    const bystanders = blockers.map((bl) => bl.box);
    const hit = (box: { x: number; y: number; w: number; h: number }) => bystanders.some((o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h);
    if (hit(labelBox(lp, label))) {
      const probe = labelBox([0, 0], label);
      lp = placeEdgeLabel([pp, qq], probe.w, probe.h, [...occupied, ...bystanders]);
    }
    b.node({ id: `${id}-label`, shape: "text", pos: lp, text: label, fontSize: T.fontSize - 2, color: T.text, halo: true });
    occupied.push(labelBox(lp, label));
  });
  for (const { i, pts, p, label } of bent) {
    const id = `tr-${i}`;
    const r = (v: number) => Math.round(v * 10) / 10;
    const d = pts.map((pt, k) => `${k === 0 ? "M" : "L"} ${r(pt[0] - p[0])} ${r(pt[1] - p[1])}`).join(" ");
    b.node({ id, shape: "path", pos: p, d, head: true, fill: "none", stroke: T.nodeStroke });
    const probe = labelBox([0, 0], label);
    const lp = placeEdgeLabel(pts, probe.w, probe.h, occupied);
    b.node({ id: `${id}-label`, shape: "text", pos: lp, text: label, fontSize: T.fontSize - 2, color: T.text, halo: true });
    occupied.push(labelBox(lp, label));
  }

  for (const s of states) {
    const p = pos.get(s.id)!;
    const r = radius.get(s.id)!;
    if (s.final) b.node({ id: `state-${s.id}-ring`, shape: "circle", pos: p, r: r + 5, fill: "none", stroke: T.nodeStroke });
    b.node({ id: `state-${s.id}`, shape: "circle", pos: p, r, fill: T.node, stroke: T.nodeStroke, strokeWidth: 2, text: s.label ?? s.id, fontSize: T.fontSize, color: T.text });
  }
  // The token rests on the top of a state's rim, not on its label: at the centre it covered a short label ("idle",
  // lb, v18) and a writer typed coordinates for every state trying to move it off.
  const rest = (id: string): [number, number] => [pos.get(id)![0], pos.get(id)![1] - radius.get(id)!];
  b.node({ id: "token", shape: "circle", pos: rest(scene.initial), r: 7, fill: T.accent, stroke: T.nodeStroke, opacity: 1 });
  for (const s of states) b.anchor(s.id, `state-${s.id}`);
  scene.transitions.forEach((tr, i) => {
    b.anchor(`${tr.from}->${tr.to}`, `tr-${i}`);
    if (scene.transitions.filter((t) => t.on === tr.on).length === 1) b.anchor(tr.on, `tr-${i}`);
  });
  b.anchor("token", "token");

  const table = new Map<string, Map<string, { to: string; index: number; note?: string }>>();
  scene.transitions.forEach((tr, i) => {
    const row = table.get(tr.from) ?? new Map();
    row.set(tr.on, { to: tr.to, index: i, note: tr.note });
    table.set(tr.from, row);
  });

  let cur = scene.initial;
  const visited = [cur];
  b.set(`state-${cur}`, "fill", T.accent, 0);
  b.step(`Start in "${cur}"`, "start");
  b.advance(b.stepMs * 0.8);
  for (const item of scene.trace) {
    if (b.annotate(item, "trace")) continue;
    if (typeof item === "object" && "note" in item) {
      b.step(item.note);
      b.advance(b.stepMs * 0.9);
      continue;
    }
    if (typeof item === "object" && "goto" in item) {
      // A jump, not a transition: the token fades out here and in at the target.
      const next = item.goto;
      b.step(item.caption ?? `Now from "${next}"`, `goto ${next}`);
      const t0 = b.t;
      const t1 = b.advance(b.stepMs * 0.8);
      b.tween("token", "opacity", 0, t0, t0 + (t1 - t0) * 0.4);
      b.set("token", "pos", rest(next), t0 + (t1 - t0) * 0.5);
      b.tween("token", "opacity", 1, t0 + (t1 - t0) * 0.6, t1);
      b.set(`state-${cur}`, "fill", T.node, t0 + (t1 - t0) * 0.4);
      b.set(`state-${next}`, "fill", T.accent, t0 + (t1 - t0) * 0.6);
      cur = next;
      visited.push(cur);
      continue;
    }
    if (typeof item === "object" && !("on" in item)) continue; // handled above (annotation / note / goto)
    const ev = typeof item === "string" ? item : item.on;
    const caption = typeof item === "string" ? undefined : item.caption;
    const hit = table.get(cur)?.get(ev);
    if (!hit) break; // validator reports this; compile what is legal.
    const next = hit.to;
    // The transition's `note` is drawn on the edge; the generated caption carries it too, so
    // `explain` says what the picture says (v9: a writer put every number in `note` and the
    // narration lost all of them).
    b.step(caption ?? `on ${ev}: ${cur} → ${next}${hit.note ? ` ${hit.note}` : ""}`, ev);
    b.set(`tr-${hit.index}`, "stroke", T.accent);
    const t0 = b.t;
    const t1 = b.advance();
    // The token follows the transition's centre line — leg by leg when the arrow bends around a state.
    const pts = [rest(cur), ...(edgePts.get(hit.index) ?? []).slice(1, -1), rest(next)];
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
    b.set(`state-${cur}`, "fill", T.node, t0 + (t1 - t0) * 0.5);
    b.set(`state-${next}`, "fill", T.accent, t1);
    b.set(`tr-${hit.index}`, "stroke", T.nodeStroke, t1);
    b.advance(b.stepMs * 0.4);
    cur = next;
    visited.push(cur);
  }
  const finalState = states.find((s) => s.id === cur);
  b.step(finalState?.final ? `End in final state "${cur}"` : `End in "${cur}"`, "end");
  b.advance(b.stepMs * 0.5);
  const fired = scene.trace.filter((it) => typeof it === "string" || "on" in it).length;
  return b.build({ title: scene.title, kind: "state-machine", visited, fired });
}
