/**
 * Deterministic layout reading of a timeline: at every step, which visible
 * texts sit on top of each other or on a filled box that is not their own, and
 * which run past the canvas edge.
 *
 * v11 found the first defects in ten rounds that a clean `check` did not catch
 * and a frame did — a title clipped at the left edge, a group label on a
 * column header, a relation label under a readout. This is the measurement
 * that reads those back from the compiled timeline, with the same box
 * estimates the compiler lays things out by, so a vision model's reading of a
 * contact sheet (`review.ts`) has something exact to be compared against.
 *
 * It is an estimate: text widths come from an average glyph width, not a font.
 * Overlaps count only when the intersection is a real fraction of the smaller
 * box, so two labels that touch corners are not an issue.
 */

import { sampleTimes } from "./render-svg.ts";
import { textWidth } from "./text-width.ts";
import { currentStep, sampleFrame, type NodeState } from "./timeline.ts";
import type { Timeline, TimelineNode } from "./types.ts";

export interface LayoutBox {
  id: string;
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutIssue {
  kind: "overlap" | "clipped" | "crossed" | "boxes";
  /** The nodes involved: two for an overlap (text first) or a crossing (text first, stroke second), one for a clipped text, two containers for `boxes`. */
  nodes: string[];
  /** Their texts, for a human or a scorer. */
  texts: string[];
  /** overlap: intersection area over the smaller box's area (0..1). clipped: pixels past the edge. crossed: pixels of stroke inside the text box. boxes: intersection over the smaller container (0..1). */
  amount: number;
}

export interface LayoutFrame {
  index: number;
  t: number;
  step?: { index: number; caption?: string };
  issues: LayoutIssue[];
}

export interface LayoutReport {
  frames: LayoutFrame[];
  totals: { frames: number; framesWithIssues: number; overlaps: number; clipped: number; crossed: number; boxes: number };
}

export interface LayoutOptions {
  /** Intersection over the smaller box below which an overlap is not reported. Default 0.3. */
  minOverlap?: number;
  /** Pixels past the canvas edge below which a text is not reported as clipped. Default 2. */
  minClip?: number;
  /** Pixels of a stroke inside a text box below which a crossing is not reported. Default 6. */
  minCross?: number;
  /** Sample times; default every step marker. */
  times?: number[];
}

const intersection = (a: LayoutBox, b: LayoutBox): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/** World position of a node at a frame: its own pos plus every ancestor's. */
function worldPos(tl: Timeline, frame: Map<string, NodeState>, id: string): [number, number] {
  let x = 0;
  let y = 0;
  let cur: string | undefined = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const st = frame.get(cur);
    if (st) {
      x += st.pos[0];
      y += st.pos[1];
    }
    cur = tl.nodes.find((n) => n.id === cur)?.parent;
  }
  return [x, y];
}

function isAncestor(tl: Timeline, maybeAncestor: string, id: string): boolean {
  let cur: string | undefined = tl.nodes.find((n) => n.id === id)?.parent;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === maybeAncestor) return true;
    seen.add(cur);
    cur = tl.nodes.find((n) => n.id === cur)?.parent;
  }
  return false;
}

/** The box a text occupies: a `text` node's glyphs, or the label centred in another shape. */
function textBox(n: TimelineNode, st: NodeState, pos: [number, number]): LayoutBox | undefined {
  const text = st.text ?? n.text;
  if (text === undefined || String(text) === "") return undefined;
  const lines = String(text).split("\n");
  const fs = n.fontSize ?? 14;
  // Latin at 0.55 em, CJK and emoji at 1 em — a Japanese label is not 60% of its width (v15).
  const w = textWidth(String(text), fs, 0.55);
  const h = lines.length * fs * 1.2;
  const anchor = n.shape === "text" ? n.anchor ?? "middle" : "middle";
  const left = anchor === "start" ? pos[0] : anchor === "end" ? pos[0] - w : pos[0] - w / 2;
  return { id: n.id, text: String(text), x: left, y: pos[1] - h / 2, w, h };
}

/** A filled, mostly opaque box that hides what is under it. */
function filledBox(n: TimelineNode, st: NodeState, pos: [number, number]): LayoutBox | undefined {
  if (n.shape !== "rect" && n.shape !== "ellipse" && n.shape !== "circle") return undefined;
  const fill = st.fill ?? n.fill;
  if (!fill || fill === "none" || fill === "transparent") return undefined;
  if (st.opacity < 0.5) return undefined;
  if (n.shape === "circle") {
    const r = st.r ?? n.r ?? 0;
    return { id: n.id, x: pos[0] - r, y: pos[1] - r, w: 2 * r, h: 2 * r };
  }
  const [w, h] = st.size ?? n.size ?? [0, 0];
  return { id: n.id, x: pos[0] - w / 2, y: pos[1] - h / 2, w, h };
}

type Segment = [[number, number], [number, number]];

/** The segments a visible stroke is made of: a line or arrow's points, a path's M/L points and a sampled Q curve. */
export function strokeSegments(n: TimelineNode, pos: [number, number]): Segment[] {
  const pts: [number, number][] = [];
  if ((n.shape === "line" || n.shape === "arrow") && n.points) {
    for (const [px, py] of n.points) pts.push([pos[0] + px, pos[1] + py]);
  } else if (n.shape === "path" && n.d && (n.fill === undefined || n.fill === "none")) {
    // An outlined path is a stroke; a filled one (a pointer head) is a shape.
    // Commands with their numbers; a quadratic curve is sampled so an arc over a label is seen as a crossing.
    const re = /([MLQZ])\s*((?:-?\d+(?:\.\d+)?[ ,]*)*)/g;
    let cur: [number, number] | undefined;
    for (const m of n.d.matchAll(re)) {
      const nums = m[2].trim().split(/[ ,]+/).filter(Boolean).map(Number);
      if (m[1] === "M" || m[1] === "L") {
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cur = [pos[0] + nums[i], pos[1] + nums[i + 1]];
          pts.push(cur);
        }
      } else if (m[1] === "Q" && cur && nums.length >= 4) {
        const [p0, c, p1] = [cur, [pos[0] + nums[0], pos[1] + nums[1]], [pos[0] + nums[2], pos[1] + nums[3]]];
        for (let k = 1; k <= 12; k++) {
          const s = k / 12;
          const u = 1 - s;
          pts.push([u * u * p0[0] + 2 * u * s * c[0] + s * s * p1[0], u * u * p0[1] + 2 * u * s * c[1] + s * s * p1[1]]);
        }
        cur = p1 as [number, number];
      }
    }
  }
  const segs: Segment[] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  return segs;
}

/** Length of the part of a segment that lies inside a box (Liang–Barsky). */
/** The rectangle two boxes share, or nothing. */
function clipBox(a: LayoutBox, b: LayoutBox): LayoutBox | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { id: b.id, x, y, w: x1 - x, h: y1 - y } : undefined;
}

function insideLength(seg: Segment, b: LayoutBox): number {
  const [[x0, y0], [x1, y1]] = seg;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, x0 - b.x) || !clip(dx, b.x + b.w - x0) || !clip(-dy, y0 - b.y) || !clip(dy, b.y + b.h - y0)) return 0;
  return Math.hypot(dx, dy) * Math.max(0, t1 - t0);
}

/** A stroke and a text that belong together: an edge and its label, a callout's arrow and its text, children of one group. */
function related(tl: Timeline, text: TimelineNode, stroke: TimelineNode): boolean {
  const base = text.id.replace(/-(label|text)$/, "");
  if (stroke.id === base || stroke.id.startsWith(`${base}-`) || base.startsWith(`${stroke.id}-`)) return true;
  if (text.parent && text.parent === stroke.parent) return true;
  if (text.parent && (stroke.id === text.parent || isAncestor(tl, stroke.parent ?? "", text.id))) return true;
  return false;
}

/** Whether a node's position is between two different keyframes at `t` — a token in flight, a bar mid-swap. */
function inMotion(tl: Timeline, id: string, t: number): boolean {
  for (const tr of tl.tracks) {
    if (tr.target !== id || tr.prop !== "pos") continue;
    const ks = tr.keyframes;
    for (let i = 0; i + 1 < ks.length; i++) {
      if (ks[i].t <= t && t < ks[i + 1].t && JSON.stringify(ks[i].value) !== JSON.stringify(ks[i + 1].value)) return true;
    }
  }
  return false;
}

export function layoutFrame(tl: Timeline, t: number, opts: LayoutOptions = {}): LayoutIssue[] {
  const minOverlap = opts.minOverlap ?? 0.3;
  const minClip = opts.minClip ?? 2;
  const minCross = opts.minCross ?? 6;
  const frame = sampleFrame(tl, t);
  const texts: LayoutBox[] = [];
  const fills: LayoutBox[] = [];
  /** Every filled box, the moving ones included: what hides a stroke at this instant, whatever it is doing. */
  const allFills: LayoutBox[] = [];
  const outlines: LayoutBox[] = [];
  const strokes: { node: TimelineNode; segs: Segment[] }[] = [];
  const byId = new Map(tl.nodes.map((n) => [n.id, n]));
  for (const n of tl.nodes) {
    const st = frame.get(n.id);
    if (!st || st.opacity <= 0 || n.shape === "group") continue;
    const pos = worldPos(tl, frame, n.id);
    const tb = textBox(n, st, pos);
    if (tb) texts.push(tb);
    // An outlined box with nothing written in it — a container, a frame — for the crossing check below.
    if (n.shape === "rect" && !n.text && st.opacity >= 0.5 && (!(st.fill ?? n.fill) || (st.fill ?? n.fill) === "none" || (st.fill ?? n.fill) === "transparent")) {
      const [w, h] = st.size ?? n.size ?? [0, 0];
      if (w >= 40 && h >= 24) outlines.push({ id: n.id, x: pos[0] - w / 2, y: pos[1] - h / 2, w, h });
    }
    // A filled box that is on its way somewhere (a matrix token leaving its source cell at the start of a
    // beat) is where the animation wants it for an instant, not a layout defect.
    const anyFill = filledBox(n, st, pos);
    if (anyFill) allFills.push(anyFill);
    const fb = inMotion(tl, n.id, t) ? undefined : anyFill;
    if (fb) fills.push(fb);
    // Strokes that are drawn (a dashed-in line at the start of its beat is not yet there) and hold still.
    if (st.opacity >= 0.5 && !inMotion(tl, n.id, t) && (st.dash === undefined || st.dash >= 0.5)) {
      const segs = strokeSegments(n, pos);
      if (segs.length) strokes.push({ node: n, segs });
    }
  }
  const issues: LayoutIssue[] = [];
  const { width, height } = tl.canvas;
  for (const b of texts) {
    const past = Math.max(-b.x, -b.y, b.x + b.w - width, b.y + b.h - height);
    if (past > minClip) issues.push({ kind: "clipped", nodes: [b.id], texts: [b.text ?? ""], amount: Math.round(past) });
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      const inter = intersection(a, b);
      if (!inter) continue;
      const ratio = inter / Math.min(a.w * a.h, b.w * b.h);
      if (ratio >= minOverlap) issues.push({ kind: "overlap", nodes: [a.id, b.id], texts: [a.text ?? "", b.text ?? ""], amount: Math.round(ratio * 100) / 100 });
    }
  }
  for (const tb of texts) {
    for (const fb of fills) {
      if (fb.id === tb.id || isAncestor(tl, fb.id, tb.id)) continue;
      // A box drawn after the text covers it; one drawn before sits under it and hides nothing.
      const textIndex = tl.nodes.findIndex((n) => n.id === tb.id);
      const fillIndex = tl.nodes.findIndex((n) => n.id === fb.id);
      if (fillIndex < textIndex) continue;
      const inter = intersection(tb, fb);
      if (!inter) continue;
      const ratio = inter / (tb.w * tb.h);
      // A narrow box through the middle of a text — an activation bar down a frame's tag (v20: `alt [c hed]`) —
      // covers little of its area and all of its sense: it cuts the word in two, so it counts whatever the ratio.
      const cuts = fb.x > tb.x + 2 && fb.x + fb.w < tb.x + tb.w - 2 && fb.y <= tb.y + 1 && fb.y + fb.h >= tb.y + tb.h - 1;
      if (ratio >= minOverlap || cuts) issues.push({ kind: "overlap", nodes: [tb.id, fb.id], texts: [tb.text ?? "", fb.text ?? ""], amount: Math.round(ratio * 100) / 100 });
    }
  }
  // A line through a text: an edge across a container label, a dependency under a callout (v13). The text's
  // own edge, a callout's own pointer and siblings in one annotation group are not crossings.
  const order = new Map(tl.nodes.map((n, i) => [n.id, i]));
  for (const tb of texts) {
    const tn = byId.get(tb.id)!;
    if (tn.halo) continue; // a haloed label breaks the line around itself: sitting on lines is its job
    const textIndex = order.get(tb.id)!;
    for (const s of strokes) {
      if (s.node.id === tb.id || related(tl, tn, s.node)) continue;
      // A callout's pointer has to reach an interior cell through its neighbours — a thin line over a labelled
      // box is what a hand-drawn callout does too. Over a free-standing text (a header, a label) it is a defect.
      if (/^callout-.*-arrow$/.test(s.node.id) && tn.shape !== "text") continue;
      // A filled shape drawn after the stroke and before the text hides the stroke where they meet: a heap's
      // tree edge runs centre to centre under the slot circles, and the value drawn on a circle is not crossed
      // by the part of the edge the circle covers (v15: digits measured wider and this started to count).
      const strokeIndex = order.get(s.node.id)!;
      // The text's own fill counts only where the stroke ends under it (the token on a heap slot); a stroke that
      // runs on through a labelled box is the v13 defect — the arrow vanishing behind a module — and stays counted.
      const endsUnder = (fb: LayoutBox) => s.segs.some(([p, q]) => [p, q].some(([x, y]) => x >= fb.x && x <= fb.x + fb.w && y >= fb.y && y <= fb.y + fb.h));
      const covers = allFills
        .filter((fb) => order.get(fb.id)! > strokeIndex && order.get(fb.id)! <= textIndex && (fb.id !== tb.id || endsUnder(fb)))
        .map((fb) => clipBox(tb, fb))
        .filter((c): c is LayoutBox => !!c);
      let inside = 0;
      for (const seg of s.segs) {
        inside += insideLength(seg, tb);
        for (const c of covers) inside -= insideLength(seg, c);
      }
      if (inside >= minCross) issues.push({ kind: "crossed", nodes: [tb.id, s.node.id], texts: [tb.text ?? "", ""], amount: Math.round(inside) });
    }
  }
  // Two containers that cross: each has part of the other inside it and neither holds the other (fe, v21: a
  // full-width "Adapters" row through the "Core domain" column, read as "the port sits inside both"). One
  // inside the other is nesting, and is fine.
  const contains = (a: LayoutBox, b: LayoutBox) => b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1;
  const labelOf = (id: string) => tl.nodes.find((n) => n.id === `${id}-label`)?.text ?? id;
  for (let i = 0; i < outlines.length; i++) {
    for (let j = i + 1; j < outlines.length; j++) {
      const a = outlines[i];
      const b = outlines[j];
      if (isAncestor(tl, a.id, b.id) || isAncestor(tl, b.id, a.id) || contains(a, b) || contains(b, a)) continue;
      const inter = intersection(a, b);
      if (!inter) continue;
      const ratio = inter / Math.min(a.w * a.h, b.w * b.h);
      if (ratio >= 0.02) issues.push({ kind: "boxes", nodes: [a.id, b.id], texts: [labelOf(a.id), labelOf(b.id)], amount: Math.round(ratio * 100) / 100 });
    }
  }
  return issues;
}

/**
 * The box everything visible at `t` occupies (texts, filled and outlined shapes, lines), for cropping a
 * still to its content rather than to a canvas that was sized before the picture existed.
 */
export function contentBox(tl: Timeline, t: number, margin = 16): { x: number; y: number; w: number; h: number } {
  const frame = sampleFrame(tl, t);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (b: { x: number; y: number; w: number; h: number }) => {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  };
  for (const n of tl.nodes) {
    const st = frame.get(n.id);
    if (!st || st.opacity <= 0 || n.shape === "group") continue;
    const pos = worldPos(tl, frame, n.id);
    const tb = textBox(n, st, pos);
    if (tb) take(tb);
    if (n.shape === "rect" || n.shape === "ellipse") {
      const [w, h] = st.size ?? n.size ?? [0, 0];
      take({ x: pos[0] - w / 2, y: pos[1] - h / 2, w, h });
    } else if (n.shape === "circle") {
      const r = st.r ?? n.r ?? 0;
      take({ x: pos[0] - r, y: pos[1] - r, w: 2 * r, h: 2 * r });
    } else if ((n.shape === "line" || n.shape === "arrow") && n.points) {
      for (const [px, py] of n.points) take({ x: pos[0] + px, y: pos[1] + py, w: 0, h: 0 });
    } else if (n.shape === "path" && n.d) {
      for (const m of n.d.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)) take({ x: pos[0] + Number(m[1]), y: pos[1] + Number(m[2]), w: 0, h: 0 });
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: tl.canvas.width, h: tl.canvas.height };
  return { x: Math.floor(x0 - margin), y: Math.floor(y0 - margin), w: Math.ceil(x1 - x0 + 2 * margin), h: Math.ceil(y1 - y0 + 2 * margin) };
}

export function layoutReport(tl: Timeline, opts: LayoutOptions = {}): LayoutReport {
  const times = opts.times ?? sampleTimes(tl, 0);
  const frames: LayoutFrame[] = times.map((t, i) => {
    const step = currentStep(tl, t);
    return { index: i + 1, t, step: step ? { index: step.index + 1, caption: step.caption } : undefined, issues: layoutFrame(tl, t, opts) };
  });
  const all = frames.flatMap((f) => f.issues);
  return {
    frames,
    totals: {
      frames: frames.length,
      framesWithIssues: frames.filter((f) => f.issues.length).length,
      overlaps: all.filter((i) => i.kind === "overlap").length,
      clipped: all.filter((i) => i.kind === "clipped").length,
      crossed: all.filter((i) => i.kind === "crossed").length,
      boxes: all.filter((i) => i.kind === "boxes").length,
    },
  };
}

/** One line per issue, phrased for the writer: what sits on what, at which step. */
export function formatLayout(report: LayoutReport): string {
  const lines: string[] = [];
  for (const f of report.frames) {
    if (!f.issues.length) continue;
    const head = `frame ${f.index}${f.step ? ` · step ${f.step.index}` : ""} · ${Math.round(f.t)}ms${f.step?.caption ? ` — ${f.step.caption}` : ""}`;
    lines.push(head);
    for (const i of f.issues) {
      if (i.kind === "clipped") lines.push(`  clipped  "${i.texts[0]}" runs ${i.amount}px past the canvas edge (${i.nodes[0]})`);
      else if (i.kind === "crossed") lines.push(`  crossed  "${i.texts[0]}" has a line through it — ${i.amount}px inside the text (${i.nodes.join(" × ")})`);
      else if (i.kind === "boxes") lines.push(`  boxes    containers "${i.texts[0]}" and "${i.texts[1]}" cross — neither holds the other, ${Math.round(i.amount * 100)}% of the smaller is inside (${i.nodes.join(" × ")})`);
      else lines.push(`  overlap  "${i.texts[0]}" on ${i.texts[1] ? `"${i.texts[1]}"` : i.nodes[1]} — ${Math.round(i.amount * 100)}% of the smaller box (${i.nodes.join(" × ")})`);
    }
  }
  const t = report.totals;
  lines.push(`${t.framesWithIssues} of ${t.frames} frames with layout issues · ${t.overlaps} overlap(s) · ${t.clipped} clipped · ${t.crossed} crossed${t.boxes ? ` · ${t.boxes} container(s) crossing` : ""}`);
  return lines.join("\n");
}
