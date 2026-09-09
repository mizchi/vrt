/**
 * `sequence` → a sequence diagram: participants across the top, lifelines down, messages in order, one row
 * each — a solid arrow with a filled head for a call, dashed with an open head for a return, solid with an
 * open head for an async send, a hook for a message to oneself. A call activates its receiver (a bar on the
 * lifeline) until that participant returns; `loop` and `alt` frames box the rows they hold. Unlike
 * `distributed`, nothing here is timed: order is the meaning, and each message is one beat.
 */

import type { SeqItem, SeqMessage, SequenceScene, Timeline, Vec2 } from "../types.ts";
import { isAnnotationOp } from "./annotate.ts";
import { Builder, labelWidth } from "./builder.ts";

const ROW_H = 34;
const FRAME_HEAD = 22;
const FRAME_PAD = 10;
const ACT_W = 10;

/** The rows a sequence lays out, frames flattened: what each row draws and how deep inside frames it is. */
export type SeqRow =
  | { type: "msg"; m: SeqMessage; index: number; depth: number }
  | { type: "note"; text: string; at?: string; ms?: number; depth: number }
  | { type: "open"; kind: "loop" | "alt"; label: string; depth: number; id: number }
  | { type: "else"; label: string; depth: number; id: number }
  | { type: "close"; depth: number; id: number }
  | { type: "annotation"; op: unknown; depth: number };

export const isSeqMessage = (it: SeqItem): it is SeqMessage => typeof it === "object" && it !== null && "from" in it && "to" in it;

export function flattenSequence(items: SeqItem[]): SeqRow[] {
  const rows: SeqRow[] = [];
  let index = 0;
  let frameId = 0;
  const walk = (list: SeqItem[], depth: number): void => {
    for (const it of list) {
      if (isAnnotationOp(it)) rows.push({ type: "annotation", op: it, depth });
      else if (isSeqMessage(it)) rows.push({ type: "msg", m: it, index: index++, depth });
      else if ("note" in it) rows.push({ type: "note", text: it.note, at: it.at, ms: it.ms, depth });
      else if ("loop" in it) {
        const id = frameId++;
        rows.push({ type: "open", kind: "loop", label: it.loop, depth, id });
        walk(it.items, depth + 1);
        rows.push({ type: "close", depth, id });
      } else if ("alt" in it) {
        const id = frameId++;
        it.alt.forEach((branch, k) => {
          if (k === 0) rows.push({ type: "open", kind: "alt", label: branch.when, depth, id });
          else rows.push({ type: "else", label: branch.when, depth, id });
          walk(branch.items, depth + 1);
        });
        rows.push({ type: "close", depth, id });
      }
    }
  };
  walk(items, 0);
  return rows;
}

export function compileSequence(scene: SequenceScene): Timeline {
  const parts = scene.participants.map((p) => (typeof p === "string" ? { id: p, label: p, kind: "system" as const } : { id: p.id, label: p.label ?? p.id, kind: p.kind ?? ("system" as const) }));
  const fs = scene.theme?.fontSize ?? 14;
  const rows = flattenSequence(scene.messages);
  const msgs = rows.filter((r): r is Extract<SeqRow, { type: "msg" }> => r.type === "msg");
  // Lanes: wide enough for the box and for the longest label between neighbours.
  const boxW = new Map(parts.map((p) => [p.id, Math.max(72, labelWidth(p.label, fs))]));
  const laneIndex = new Map(parts.map((p, i) => [p.id, i]));
  let laneGap = Math.max(120, ...[...boxW.values()].map((w) => w + 40));
  for (const r of msgs) {
    if (!r.m.label) continue;
    const span = Math.max(1, Math.abs(laneIndex.get(r.m.to)! - laneIndex.get(r.m.from)!));
    laneGap = Math.max(laneGap, (labelWidth(r.m.label, fs - 2) + 24) / span);
  }
  const maxDepth = Math.max(0, ...rows.map((r) => r.depth + (r.type === "open" || r.type === "close" || r.type === "else" ? 1 : 0)));
  // A frame's tag (`alt [cached]`) and its guards (`[miss]`) sit in its top-left corner, left of the first lifeline
  // it holds: the frame pads by the widest of them, or the participant's activation bar cuts the word in two
  // (the login fixture's first sheet read `alt [c hed]`).
  const framePad = Math.max(30, ...rows.map((r) => (r.type === "open" ? labelWidth(`${r.kind} [${r.label}]`, fs - 3) : r.type === "else" ? labelWidth(`[${r.label}]`, fs - 3) : 0) + 18));
  const left = 40 + maxDepth * FRAME_PAD + (framePad - 30);
  const top = (scene.title ? 52 : 28) + 20; // participant boxes' centre line
  const boxH = fs * 2.2;
  // Row heights: a frame opening takes a header row; a closing row is short.
  const rowH = (r: SeqRow): number => (r.type === "open" ? FRAME_HEAD + 8 : r.type === "else" ? FRAME_HEAD : r.type === "close" ? FRAME_PAD : r.type === "annotation" ? 0 : ROW_H);
  const ys: number[] = [];
  let y = top + boxH / 2 + 24;
  for (const r of rows) {
    ys.push(y);
    y += rowH(r);
  }
  const lifeBottom = y + 16;
  const width = Math.max(480, left + laneGap * (parts.length - 1) + left);
  const b = new Builder(scene, { width, height: lifeBottom + 80, stepMs: 700 });
  const T = b.theme;
  const laneX = (id: string): number => left + laneGap * laneIndex.get(id)! + (Math.max(...[...boxW.values()]) / 2 - 36);

  if (scene.title) b.node({ id: "title", shape: "text", pos: [b.width / 2, 22], text: scene.title, fontSize: T.fontSize + 4, color: T.text });
  // Frames first (under everything), then lifelines, then messages, then participant boxes over the lifeline tops.
  const frameStack: { id: number; kind: "loop" | "alt"; label: string; openRow: number; depth: number; lanes: Set<string>; elses: number[] }[] = [];
  const frames: (typeof frameStack)[number][] = [];
  rows.forEach((r, i) => {
    if (r.type === "open") frameStack.push({ id: r.id, kind: r.kind, label: r.label, openRow: i, depth: r.depth, lanes: new Set(), elses: [] });
    else if (r.type === "else") frameStack[frameStack.length - 1].elses.push(i);
    else if (r.type === "close") frames.push({ ...frameStack.pop()!, closeRow: i } as never);
    else if (r.type === "msg") for (const f of frameStack) f.lanes.add(r.m.from).add(r.m.to);
    else if (r.type === "note" && r.at) for (const f of frameStack) f.lanes.add(r.at);
  });
  for (const f of frames as ((typeof frameStack)[number] & { closeRow: number })[]) {
    const lanes = [...f.lanes];
    const xs = lanes.length ? lanes.map(laneX) : parts.map((p) => laneX(p.id));
    const pad = FRAME_PAD * (maxDepth - f.depth) + framePad;
    const x0 = Math.min(...xs) - pad;
    const x1 = Math.max(...xs) + pad;
    const y0 = ys[f.openRow] - 4;
    const y1 = ys[f.closeRow] + 2;
    const id = `frame-${f.id}`;
    b.node({ id, shape: "rect", pos: [(x0 + x1) / 2, (y0 + y1) / 2], size: [x1 - x0, y1 - y0], fill: "none", stroke: T.muted, strokeWidth: 1, opacity: 0 });
    const tag = `${f.kind} [${f.label}]`;
    b.node({ id: `${id}-label`, shape: "text", pos: [x0 + 6, y0 + FRAME_HEAD / 2 + 1], text: tag, fontSize: fs - 3, color: T.muted, anchor: "start", halo: true, opacity: 0 });
    f.elses.forEach((ri, k) => {
      const ey = ys[ri];
      b.node({ id: `${id}-else-${k}`, shape: "line", points: [[x0, ey - 2], [x1, ey - 2]], stroke: T.muted, dashed: true, opacity: 0 });
      b.node({ id: `${id}-else-${k}-label`, shape: "text", pos: [x0 + 6, ey + FRAME_HEAD / 2 - 3], text: `[${(rows[ri] as Extract<SeqRow, { type: "else" }>).label}]`, fontSize: fs - 3, color: T.muted, anchor: "start", halo: true, opacity: 0 });
    });
    b.anchor(f.label, id);
  }
  for (const p of parts) {
    const x = laneX(p.id);
    b.node({ id: `life-${p.id}`, shape: "line", points: [[x, top + boxH / 2], [x, lifeBottom]], stroke: T.muted, strokeWidth: 1, dashed: true });
  }
  // Activation bars: a call activates its receiver from that row until the receiver returns (to anyone).
  // The branches of an `alt` are alternatives: each starts from the activations as they were when the frame
  // opened, and a bar begun inside a branch ends where the branch does.
  const active = new Map<string, { fromRow: number; id: string }>();
  let actSerial = 0;
  const bars: { pid: string; y0: number; y1: number; id: string; startRow: number }[] = [];
  const snapshots = new Map<number, Map<string, { fromRow: number; id: string }>>();
  const closeSince = (snap: Map<string, { fromRow: number; id: string }>, row: number): void => {
    for (const [pid, a] of [...active]) {
      if (snap.get(pid)?.id === a.id) continue;
      bars.push({ pid, y0: ys[a.fromRow], y1: ys[row] - 4, id: a.id, startRow: a.fromRow });
      active.delete(pid);
    }
    // An activation the previous branch returned is live again in this one: its bar runs on to wherever the
    // last branch ends it, so the bar it already closed is taken back.
    for (const [pid, a] of snap) {
      const k = bars.findIndex((bar) => bar.id === a.id);
      if (k >= 0) bars.splice(k, 1);
      active.set(pid, a);
    }
  };
  rows.forEach((r, i) => {
    if (r.type === "open" && r.kind === "alt") snapshots.set(r.id, new Map(active));
    else if (r.type === "else") closeSince(snapshots.get(r.id)!, i);
    if (r.type !== "msg") return;
    const kind = r.m.kind ?? "call";
    if (kind === "call" && r.m.from !== r.m.to && !active.has(r.m.to)) active.set(r.m.to, { fromRow: i, id: `act-${actSerial++}` });
    if (kind === "return" && active.has(r.m.from)) {
      const a = active.get(r.m.from)!;
      bars.push({ pid: r.m.from, y0: ys[a.fromRow], y1: ys[i], id: a.id, startRow: a.fromRow });
      active.delete(r.m.from);
    }
  });
  for (const [pid, a] of active) bars.push({ pid, y0: ys[a.fromRow], y1: lifeBottom - 16, id: a.id, startRow: a.fromRow });
  for (const bar of bars) {
    const x = laneX(bar.pid);
    b.node({ id: bar.id, shape: "rect", pos: [x, bar.y0], size: [ACT_W, 0], fill: T.node, stroke: T.nodeStroke, strokeWidth: 1, opacity: 0 });
  }
  // Messages.
  msgs.forEach((r) => {
    const i = rows.indexOf(r);
    const yy = ys[i];
    const m = r.m;
    const kind = m.kind ?? "call";
    const id = `msg-${r.index}`;
    const x0 = laneX(m.from);
    const x1 = laneX(m.to);
    if (m.from === m.to) {
      // A hook to the right and back.
      const d = `M 0 0 L 28 0 L 28 ${ROW_H * 0.55} L 6 ${ROW_H * 0.55}`;
      b.node({ id, shape: "path", pos: [x0 + ACT_W / 2, yy - ROW_H * 0.3], d, head: true, fill: "none", stroke: T.nodeStroke, strokeWidth: 1.5, dashed: kind === "return", opacity: 0 });
      if (m.label) b.node({ id: `${id}-label`, shape: "text", pos: [x0 + ACT_W / 2 + 34, yy - ROW_H * 0.05], text: m.label, fontSize: fs - 2, color: T.text, anchor: "start", halo: true, opacity: 0 });
    } else {
      const dir = x1 > x0 ? 1 : -1;
      const p: Vec2 = [x0 + dir * (ACT_W / 2 + 1), yy];
      const q: Vec2 = [x1 - dir * (ACT_W / 2 + 2), yy];
      b.node({ id, shape: "arrow", points: [p, q], stroke: T.nodeStroke, strokeWidth: 1.5, dashed: kind === "return", head: kind === "call" ? true : "hollow", dash: 0, opacity: 0 });
      if (m.label) b.node({ id: `${id}-label`, shape: "text", pos: [(p[0] + q[0]) / 2, yy - 9], text: m.label, fontSize: fs - 2, color: T.text, halo: true, opacity: 0 });
    }
    b.anchor(`${m.from}->${m.to}`, id);
    if (m.label && msgs.filter((x) => x.m.label === m.label).length === 1) b.anchor(m.label, id);
  });
  // Participant boxes last, over the lifeline tops.
  for (const p of parts) {
    const x = laneX(p.id);
    const w = boxW.get(p.id)!;
    b.node({ id: `part-${p.id}`, shape: "rect", pos: [x, top], size: [w, boxH], rx: p.kind === "actor" ? boxH / 2 : 6, fill: T.node, stroke: T.nodeStroke, strokeWidth: 1.5, text: p.label, fontSize: fs, color: T.text });
    b.anchor(p.id, `part-${p.id}`);
  }
  b.anchor("participants", ...parts.map((p) => `part-${p.id}`));

  // Beats: each message row is one; frames appear with their first inner row; activation bars grow row by row.
  const sent: string[] = [];
  const shownFrames = new Set<number>();
  const openFramesAt = (i: number): void => {
    for (const f of frames as ((typeof frameStack)[number] & { closeRow: number })[]) {
      if (f.openRow < i && i <= f.closeRow && !shownFrames.has(f.id)) {
        shownFrames.add(f.id);
        b.set(`frame-${f.id}`, "opacity", 1);
        b.set(`frame-${f.id}-label`, "opacity", 1);
      }
      f.elses.forEach((ri, k) => {
        if (ri <= i && shownFrames.has(f.id)) {
          b.set(`frame-${f.id}-else-${k}`, "opacity", 1);
          b.set(`frame-${f.id}-else-${k}-label`, "opacity", 1);
        }
      });
    }
  };
  const growBars = (i: number, t: number): void => {
    for (const bar of bars) {
      if (bar.startRow > i) continue;
      const to = Math.min(bar.y1, ys[i]);
      b.set(bar.id, "opacity", 1, t);
      b.tween(bar.id, "size", [ACT_W, Math.max(2, to - bar.y0)], t, t + 200);
      b.tween(bar.id, "pos", [laneX(bar.pid), bar.y0 + Math.max(2, to - bar.y0) / 2], t, t + 200);
    }
  };
  b.step(scene.title ?? "Sequence", "start");
  b.advance(b.stepMs * 0.5);
  rows.forEach((r, i) => {
    if (r.type === "annotation") {
      b.annotate(r.op, "messages");
      return;
    }
    if (r.type === "note") {
      openFramesAt(i);
      b.step(r.text);
      b.advance(r.ms ?? b.stepMs * 0.9);
      return;
    }
    if (r.type !== "msg") return;
    const m = r.m;
    const kind = m.kind ?? "call";
    const id = `msg-${r.index}`;
    const label = (m.label ? `: ${m.label}` : "");
    const generated = m.from === m.to ? `${m.from} → itself${label}` : kind === "return" ? `${m.to} ← ${m.from}${label}` : `${m.from} → ${m.to}${label}${kind === "async" ? " (async)" : ""}`;
    openFramesAt(i);
    b.step(m.caption ?? generated, `${m.from}->${m.to}`);
    const t0 = b.t;
    const t1 = b.advance(m.ms ?? b.stepMs);
    b.set(id, "opacity", 1, t0);
    b.tween(id, "dash", 1, t0, t0 + (t1 - t0) * 0.6, "linear");
    if (m.label) b.set(`${id}-label`, "opacity", 1, t0 + (t1 - t0) * 0.3);
    growBars(i, t0 + (t1 - t0) * 0.6);
    sent.push(`${m.from}->${m.to}${m.label ? `:${m.label}` : ""}`);
  });
  // Bars that never returned stay open to the end.
  const tEnd = b.t;
  for (const bar of bars) if (!rows.some((r, i) => r.type === "msg" && ys[i] >= bar.y1 && i > bar.startRow)) {
    b.set(bar.id, "opacity", 1, tEnd);
    b.set(bar.id, "size", [ACT_W, Math.max(2, bar.y1 - bar.y0)], tEnd);
    b.set(bar.id, "pos", [laneX(bar.pid), bar.y0 + Math.max(2, bar.y1 - bar.y0) / 2], tEnd);
  }
  b.step("end", "end");
  b.advance(b.stepMs * 0.4);
  return b.build({ title: scene.title, kind: "sequence", participants: parts.map((p) => p.id), messages: sent, unreturned: [...active.keys()] });
}
