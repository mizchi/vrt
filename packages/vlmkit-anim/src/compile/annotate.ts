/**
 * The annotation layer: six ops every kind accepts in its own op list, drawn
 * by the Builder so no compiler has to know how.
 *
 *   {"value":    {"id", "label", "text", "at"?, "side"?}}   a named readout; a later op with the same id updates it
 *   {"callout":  {"at", "text", "id"?, "side"?} | null}       a text box with a pointer at an anchor; null hides
 *   {"snapshot": {"of", "label"}}                             a frozen copy of what the anchor shows right now
 *   {"group":    {"around": [anchors], "label"?, "id"?} | null}  a dashed outline around several anchors
 *   {"text":     {"id"?, "lines": [...], "highlight"?, "at"?, "side"?} | null}  a multi-line block, one line highlightable
 *   {"relate":   {"from", "to", "label"?, "style"?, "id"?} | null}  a labelled arrow (or line) between two anchors
 *
 * v9 asked for every one of them: a value that tracks a number next to its
 * owner (three writers), a callout pointing at one thing, a frozen earlier
 * value to compare against, a bracket around a batch, a code block; v10 asked
 * for the pairwise line `relate` draws (a group would enclose a bystander). All are
 * things a `vector` scene could draw by hand with coordinates; the point is
 * that the writer never types one.
 *
 * **Anchors** are names each compiler registers for the things a viewer can
 * point at — an index, a cell, a node id, a state, a value — mapped to the
 * timeline nodes that draw them. Readouts without `at` go to a panel on the
 * right, which the Builder adds to the canvas only when something uses it.
 */

import { ANNOTATION_ACTIONS, type AnnotationOp, type AnnotationSide as Side, type CalloutSpec, type Diagnostic, type GroupSpec, type RelateSpec, type SnapshotSpec, type TextSpec, type ValueSpec, type Vec2 } from "../types.ts";
import type { Builder } from "./builder.ts";
import { boxRadius, labelWidth, wrapText } from "./builder.ts";
import { segmentInside } from "./route.ts";
import { strokeSegments } from "../layout.ts";

type Seg = [Vec2, Vec2];

export { ANNOTATION_ACTIONS };
export type { AnnotationOp };
export type AnnotationAction = (typeof ANNOTATION_ACTIONS)[number];

export function isAnnotationOp(op: unknown): op is AnnotationOp {
  return typeof op === "object" && op !== null && ANNOTATION_ACTIONS.some((k) => k in (op as object));
}

/** Thrown by the Builder when an op names an anchor the compiler never registered. */
export class AnchorError extends Error {
  readonly diagnostic: Diagnostic;
  constructor(diagnostic: Diagnostic) {
    // No parameter property: Node runs this file with type stripping only, which refuses that syntax.
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

export const PANEL_WIDTH = 220;
const PANEL_GAP = 16;
/**
 * The renderer and runtime draw the current caption in the bottom band of the canvas; nothing else goes
 * there. Captions wrap to up to three lines (14px + 2 × 17px above the 14px baseline margin), so the band
 * is sized for a wrapped one — eb's readout, grown onto a 32px band, sat on the second line of its caption.
 */
const CAPTION_BAND = 64;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const box = (cx: number, cy: number, w: number, h: number): Box => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Whether the segment p→q passes through `b` (slab clipping). */
function segmentHitsBox(p: Vec2, q: Vec2, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const d: Vec2 = [q[0] - p[0], q[1] - p[1]];
  const lo: Vec2 = [b.x, b.y];
  const hi: Vec2 = [b.x + b.w, b.y + b.h];
  for (const i of [0, 1] as const) {
    if (Math.abs(d[i]) < 1e-9) {
      if (p[i] < lo[i] || p[i] > hi[i]) return false;
      continue;
    }
    let ta = (lo[i] - p[i]) / d[i];
    let tb = (hi[i] - p[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Per-builder annotation state. Compilers call `anchor()` while laying out and
 * `apply()` from their op loop; everything else is drawing.
 */
export class Annotations {
  private readonly anchors = new Map<string, string[]>();
  private readonly readouts = new Map<string, { text: string; box: string; label: string }>();
  private readonly callouts = new Map<string, string[]>();
  private readonly groups = new Map<string, string[]>();
  private readonly blocks = new Map<string, { lines: string[]; hl: string[]; box: string }>();
  private readonly relations = new Map<string, string[]>();
  private panelRows = 0;
  private panelUsed = false;
  private panelNeed = PANEL_WIDTH;
  /** Height a relation asked for below the kind's own canvas, when a level line missed fitting by a little. */
  private extraH = 0;
  private serial = 0;

  private readonly b: Builder;

  constructor(b: Builder) {
    this.b = b;
  }

  /** Name the thing(s) a writer can point at. Later registrations of the same name replace it. */
  anchor(name: string, ...nodeIds: string[]): void {
    this.anchors.set(name, nodeIds);
  }

  anchorNames(): string[] {
    return [...this.anchors.keys()];
  }

  /** Extra canvas width the panel needs; 0 when nothing used it. */
  extraWidth(): number {
    return this.panelUsed ? this.panelNeed + PANEL_GAP : 0;
  }

  /** Extra canvas height a relation needed; 0 when none did. */
  extraHeight(): number {
    return this.extraH;
  }

  /** True when `op` was an annotation op and has been applied at `t`. */
  apply(op: unknown, t: number, path: string): boolean {
    if (!isAnnotationOp(op)) return false;
    if ("value" in op) this.value(op.value, t, path);
    else if ("callout" in op) this.callout(op.callout, t, path);
    else if ("snapshot" in op) this.snapshot(op.snapshot, t, path);
    else if ("group" in op) this.group(op.group, t, path);
    else if ("text" in op) this.text(op.text, t, path);
    else this.relate(op.relate, t, path);
    return true;
  }

  /** The caption an annotation op gets when the writer wrote none. */
  caption(op: AnnotationOp): string | undefined {
    if ("value" in op) return `${op.value.label ?? this.readouts.get(op.value.id)?.label ?? op.value.id} = ${op.value.text}`;
    if ("callout" in op) return op.callout ? op.callout.text : undefined;
    if ("snapshot" in op) return op.snapshot.label ?? `snapshot of ${op.snapshot.of}`;
    if ("group" in op) return op.group?.label;
    // A block narrates its highlighted line, else its first: the reader hears what they should look at.
    if ("text" in op) return op.text ? op.text.lines[op.text.highlight ?? 0] ?? op.text.lines[0] : undefined;
    return op.relate ? op.relate.label ?? `${op.relate.from} → ${op.relate.to}` : undefined;
  }

  // ---- resolution ------------------------------------------------------------

  private resolve(name: string, path: string): string[] {
    const ids = this.anchors.get(name);
    if (ids && ids.length) return ids;
    const names = this.anchorNames();
    const near = closestName(name, names);
    throw new AnchorError({
      severity: "error",
      path,
      message: `no anchor named "${name}" in this ${this.b.kindName} scene`,
      hint: `${near ? `did you mean "${near}"? ` : ""}anchors here: ${names.length ? names.slice(0, 24).map((n) => `"${n}"`).join(", ") + (names.length > 24 ? ", …" : "") : "(none)"}`,
    });
  }

  private nodeBox(id: string, t: number): Box {
    const n = this.b.nodes.find((x) => x.id === id);
    if (!n) return box(0, 0, 0, 0);
    const [x, y] = (this.b.valueAt(id, "pos", t) as Vec2 | undefined) ?? [0, 0];
    const [px, py] = n.parent ? ((this.b.valueAt(n.parent, "pos", t) as Vec2 | undefined) ?? [0, 0]) : [0, 0];
    const cx = x + px;
    const cy = y + py;
    switch (n.shape) {
      case "rect":
      case "ellipse": {
        const s = (this.b.valueAt(id, "size", t) as Vec2 | undefined) ?? n.size ?? [0, 0];
        return box(cx, cy, s[0], s[1]);
      }
      case "circle": {
        const r = (this.b.valueAt(id, "r", t) as number | undefined) ?? n.r ?? 0;
        return box(cx, cy, r * 2, r * 2);
      }
      case "text": {
        const text = String(this.b.valueAt(id, "text", t) ?? n.text ?? "");
        const fs = n.fontSize ?? this.b.theme.fontSize;
        const w = labelWidth(text, fs) - fs * 1.6;
        const anchor = n.anchor ?? "middle";
        const left = anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2;
        // Lines are 1.2 em apart and centred on the position, as the renderer draws them.
        const h = fs * 1.3 + (text.split("\n").length - 1) * fs * 1.2;
        return { x: left, y: cy - h / 2, w, h };
      }
      case "line":
      case "arrow": {
        const [p, q] = n.points ?? [[0, 0], [0, 0]];
        return union(box(cx + p[0], cy + p[1], 0, 0), box(cx + q[0], cy + q[1], 0, 0));
      }
      default:
        return box(cx, cy, 0, 0);
    }
  }

  private anchorBox(name: string, t: number, path: string): Box {
    return this.resolve(name, path).map((id) => this.nodeBox(id, t)).reduce(union);
  }

  /** Distance from `b`'s edge to the canvas edge in direction `sign · n` (dominant axis). */
  private room(b: Box, n: Vec2, sign: 1 | -1): number {
    const dx = n[0] * sign;
    const dy = n[1] * sign;
    // The panel, when something used it, widens the canvas to the right; the caption owns the bottom band.
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? this.b.width + this.extraWidth() - (b.x + b.w) : b.x;
    return dy > 0 ? this.b.height + this.extraH - CAPTION_BAND - (b.y + b.h) : b.y;
  }

  /**
   * How far from the centre line ca→cc, towards `sign · n`, a parallel line must run to clear everything
   * visible in the pair's lane (the band between the two centres): the pair's own boxes, a row label beside
   * them, a readout already anchored to one of them.
   */
  private laneClearance(ca: Vec2, cc: Vec2, u: Vec2, n: Vec2, sign: 1 | -1, t: number): number {
    const along = (v: Vec2) => (v[0] - ca[0]) * u[0] + (v[1] - ca[1]) * u[1];
    const across = (v: Vec2) => ((v[0] - ca[0]) * n[0] + (v[1] - ca[1]) * n[1]) * sign;
    const lo = Math.min(0, along(cc)) - 4;
    const hi = Math.max(0, along(cc)) + 4;
    let far = 0;
    for (const node of this.b.nodes) {
      if (node.shape === "group" || (this.b.valueAt(node.id, "opacity", t) ?? 1) === 0) continue;
      const b = this.nodeBox(node.id, t);
      if (b.w === 0 && b.h === 0) continue;
      const corners: Vec2[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
      const spans = corners.map(along);
      if (Math.max(...spans) < lo || Math.min(...spans) > hi) continue;
      far = Math.max(far, ...corners.map(across));
    }
    return far + 14;
  }

  /**
   * Whether the segment p→q runs through some other anchor's visible box — one that is neither of the pair's
   * nor touching them (a cell inside the row it relates, a column spanning both, the edge between two nodes).
   */
  /**
   * The boxes of every anchored node the straight segment p→q passes through that belongs to neither end —
   * per node, not per anchor: `col:box2` is two cells, and only the one in the row being related is in
   * the way (measuring the whole column once sent an arc over the header row).
   */
  /** Every node a relation has to keep clear of: the anchored ones, and the annotation texts drawn so far. */
  private inTheWay(): string[] {
    const ids = new Set<string>();
    for (const list of this.anchors.values()) for (const id of list) ids.add(id);
    for (const n of this.b.nodes) if (/^(callout|value|text|snapshot)-/.test(n.id) && (n.shape === "text" || n.shape === "rect")) ids.add(n.id);
    return [...ids];
  }

  private bystanders(p: Vec2, q: Vec2, a: Box, c: Box, from: string, to: string, t: number): Box[] {
    const own = new Set([...(this.anchors.get(from) ?? []), ...(this.anchors.get(to) ?? [])]);
    const out: Box[] = [];
    for (const id of this.inTheWay()) {
      if (own.has(id)) continue;
      if ((this.b.valueAt(id, "opacity", t) ?? 1) === 0) continue;
      const b = this.nodeBox(id, t);
      if ((b.w === 0 && b.h === 0) || intersects(b, a) || intersects(b, c)) continue;
      if (segmentHitsBox(p, q, b)) out.push(b);
    }
    return out;
  }

  private crossesBystander(p: Vec2, q: Vec2, a: Box, c: Box, from: string, to: string, t: number): boolean {
    return this.bystanders(p, q, a, c, from, to, t).length > 0;
  }

  /**
   * How far an arc from p to q must bulge towards `sign · n` to clear what it sweeps over, from the chord's
   * midpoint: first what the chord itself crosses, then whatever anchored node the arc would cross once it
   * bulges that far (a cell in the next row), until nothing new is in the way.
   */
  private bystanderBulge(p: Vec2, q: Vec2, n: Vec2, sign: 1 | -1, a: Box, c: Box, from: string, to: string, t: number): { bulge: number; clear: boolean } {
    const m: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const extent = (b: Box): number => Math.max(...([[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as Vec2[]).map(([x, y]) => ((x - m[0]) * n[0] + (y - m[1]) * n[1]) * sign));
    let bulge = Math.max(16, ...this.bystanders(p, q, a, c, from, to, t).map((b) => extent(b) + 12));
    const own = new Set([...(this.anchors.get(from) ?? []), ...(this.anchors.get(to) ?? [])]);
    // The arc itself, sampled: a quadratic Bézier clears its apex's line only at the middle, so a box near one
    // end can still be under the curve when the apex is past it (the callout beside `db`, v13).
    const samples = (bulge: number): Vec2[] => {
      const ctrl: Vec2 = [m[0] + n[0] * 2 * bulge * sign, m[1] + n[1] * 2 * bulge * sign];
      const pts: Vec2[] = [];
      for (let k = 0; k <= 16; k++) {
        const s = k / 16;
        const u = 1 - s;
        pts.push([u * u * p[0] + 2 * u * s * ctrl[0] + s * s * q[0], u * u * p[1] + 2 * u * s * ctrl[1] + s * s * q[1]]);
      }
      return pts;
    };
    const arcHits = (bulge: number, b: Box): boolean => {
      const pts = samples(bulge);
      for (let k = 0; k + 1 < pts.length; k++) if (segmentInside([pts[k], pts[k + 1]], b) > 2) return true;
      return false;
    };
    for (let iter = 0; iter < 6; iter++) {
      let next = bulge;
      for (const id of this.inTheWay()) {
        if (own.has(id) || (this.b.valueAt(id, "opacity", t) ?? 1) === 0) continue;
        const b = this.nodeBox(id, t);
        if ((b.w === 0 && b.h === 0) || intersects(b, a) || intersects(b, c) || !arcHits(bulge, b)) continue;
        next = Math.max(next, extent(b) + 12, bulge + 16);
      }
      if (next <= bulge) break;
      bulge = next;
    }
    // Whether the arc, bulged this far, still runs through something: the other side may do better.
    let clear = true;
    for (const id of this.inTheWay()) {
      if (own.has(id) || (this.b.valueAt(id, "opacity", t) ?? 1) === 0) continue;
      const b = this.nodeBox(id, t);
      if ((b.w === 0 && b.h === 0) || intersects(b, a) || intersects(b, c)) continue;
      if (arcHits(bulge, b)) clear = false;
    }
    return { bulge, clear };
  }

  private anchorText(name: string, t: number, path: string): string {
    const texts = this.resolve(name, path).map((id) => {
      const v = this.b.valueAt(id, "text", t);
      return v === undefined ? undefined : String(v);
    }).filter((s): s is string => s !== undefined && s !== "");
    return texts.length > 1 ? `[${texts.join(", ")}]` : texts[0] ?? "";
  }

  /** Where a box of `w×h` sits on `side` of `target`, with a gap. */
  private beside(target: Box, w: number, h: number, side: Side, gap = 14): Vec2 {
    const cx = target.x + target.w / 2;
    const cy = target.y + target.h / 2;
    switch (side) {
      case "above": return [cx, target.y - gap - h / 2];
      case "below": return [cx, target.y + target.h + gap + h / 2];
      case "left": return [target.x - gap - w / 2, cy];
      case "right": return [target.x + target.w + gap + w / 2, cy];
    }
  }

  /**
   * `beside`, but on the first side where the box covers no visible text that is not the anchor's own —
   * the requested side first, then the others clockwise. v12's geometry found a callout on the column
   * headers and a readout under a group label; both were placed exactly where they were asked, on top of
   * something already there.
   */
  /** Visible strokes (edges straight or bent, lifelines, message arrows, relation arcs) at `t`, in world coordinates. */
  private strokesAt(t: number, except: Set<string> = new Set()): Seg[] {
    const out: Seg[] = [];
    for (const n of this.b.nodes) {
      if ((n.shape !== "line" && n.shape !== "arrow" && n.shape !== "path") || except.has(n.id)) continue;
      if (((this.b.valueAt(n.id, "opacity", t) as number | undefined) ?? 1) < 0.5) continue;
      const [x, y] = (this.b.valueAt(n.id, "pos", t) as Vec2 | undefined) ?? [0, 0];
      const [px, py] = n.parent ? ((this.b.valueAt(n.parent, "pos", t) as Vec2 | undefined) ?? [0, 0]) : [0, 0];
      out.push(...strokeSegments(n, [x + px, y + py]));
    }
    return out;
  }

  /** Pixels of stroke that run through a box — an edge under a callout is as unreadable as a text under it. */
  private crossedBy(box: Box, strokes: Seg[]): number {
    return strokes.reduce((s, seg) => s + segmentInside(seg, box), 0);
  }

  /** The side `placeBeside` last chose, for a pointer that has to leave the box on that side. */
  private placedSide: Side = "above";

  private placeBeside(target: Box, w: number, h: number, side: Side, gap: number, own: Set<string>, t: number, pointer = false): Vec2 {
    const order: Side[] = [side, ...(["above", "right", "below", "left"] as Side[]).filter((s) => s !== side)];
    // The anchor's own strokes (the edge a callout is about) may run under the box; everything else may not.
    const strokes = this.strokesAt(t, own);
    const tc: Vec2 = [target.x + target.w / 2, target.y + target.h / 2];
    // A pointer from the box to the target must not run through some other box on its way (fd, v13: a callout
    // on one edge pointed straight through the module next to it).
    // Scored by how much of it runs through what: a thin pointer over a labelled box costs its length (a
    // hand-drawn callout does the same to reach an interior cell), over a free-standing label four times that
    // — that one the geometry reports.
    const pointerCost = (box: Box): number => {
      if (!pointer) return 0;
      let cost = 0;
      for (const n of this.b.nodes) {
        if ((n.shape !== "text" && n.text === undefined) || own.has(n.id) || (this.b.valueAt(n.id, "opacity", t) ?? 1) === 0) continue;
        const inside = segmentInside([[box.x + box.w / 2, box.y + box.h / 2], tc], this.nodeBox(n.id, t));
        if (inside > 6) cost += n.shape === "text" ? inside * 4 : inside;
      }
      return cost;
    };
    // How bad a spot is: a text it covers is never acceptable, a line through it or a blocked pointer is bad,
    // a clear spot is 0. The first clear spot wins; when none is, the least bad one does — an unchecked
    // fallback once put a callout squarely on the module next to its edge.
    const badness = (box: Box): number => {
      let s = 0;
      for (const n of this.b.nodes) {
        if ((n.shape !== "text" && n.text === undefined) || own.has(n.id) || (this.b.valueAt(n.id, "opacity", t) ?? 1) === 0) continue;
        if (intersects(this.nodeBox(n.id, t), box)) s += 1000;
      }
      const crossed = this.crossedBy(box, strokes);
      if (crossed >= 8) s += crossed;
      s += pointerCost(box);
      return s;
    };
    // Inside the canvas as it stands, panel included when something opened it.
    const inside = (box: Box): boolean =>
      box.x >= 0 && box.y >= 0 && box.x + box.w <= this.b.width + this.extraWidth() && box.y + box.h <= this.b.height + this.extraH - CAPTION_BAND;
    const boxAt = (cx: number, cy: number): Box => ({ x: cx - w / 2, y: cy - h / 2, w, h });
    // A spot inside the panel takes panel rows, so the readouts stacked there later start below it (ec, v12:
    // a callout moved into the panel and the code block was laid over it).
    const take = (box: Box): Vec2 => {
      if (box.x + box.w > this.b.width) {
        const top = this.b.hasTitle ? 56 : 32;
        this.panelRows = Math.max(this.panelRows, Math.ceil((box.y + box.h - top) / 24) + 1);
      }
      return [box.x + box.w / 2, box.y + box.h / 2];
    };
    // Nearest first: every side at the asked gap, then every side one box further out, and so on — a cell in
    // the middle of a matrix has neighbours on all four sides, and its callout belongs just past them.
    // A box above or below slides sideways to stay on the canvas (and one beside slides up or down): a wide
    // callout on a node at the left edge is otherwise never "inside" on the side it was asked for, and lands
    // on whatever is to the right (fc, v13).
    const W = this.b.width + this.extraWidth();
    const H = this.b.height + this.extraH - CAPTION_BAND;
    const slid = (cx: number, cy: number, s: Side): Box => {
      const box = boxAt(cx, cy);
      if (s === "above" || s === "below") box.x = Math.max(0, Math.min(W - box.w, box.x));
      else box.y = Math.max(0, Math.min(H - box.h, box.y));
      return box;
    };
    let best: { box: Box; side: Side; score: number; need: number } | undefined;
    for (let k = 0; k < 4; k++) {
      for (const s of order) {
        const step = s === "above" || s === "below" ? h + 6 : w + 6;
        const [cx, cy] = this.beside(target, w, h, s, gap + k * step);
        const box = slid(cx, cy, s);
        if (!inside(box)) continue;
        const score = badness(box);
        if (score === 0) {
          this.placedSide = s;
          return take(box);
        }
        if (!best || score < best.score) best = { box, side: s, score, need: 0 };
      }
    }
    // Nothing clear on the canvas as it stands: the bottom edge can grow. A spot below that covers no text is
    // worth the height it needs, within reason — and beats a spot on the canvas that covers one.
    for (let k = 0; k < 4; k++) {
      const [cx, cy] = this.beside(target, w, h, "below", gap + k * (h + 6));
      const box = slid(cx, cy, "below");
      const need = box.y + box.h + CAPTION_BAND - (this.b.height + this.extraH);
      if (box.x < 0 || box.x + box.w > W || need > 120) continue;
      const score = badness(box) + Math.max(0, need) / 10;
      if (score >= 1000) continue;
      if (!best || score < best.score) best = { box, side: "below", score, need };
    }
    if (best) {
      if (best.need > 0) this.extraH += Math.ceil(best.need);
      this.placedSide = best.side;
      return take(best.box);
    }
    this.placedSide = side;
    return this.beside(target, w, h, side, gap);
  }

  private panelSlot(rows: number): Vec2 {
    this.panelUsed = true;
    const x = this.b.width + PANEL_GAP + PANEL_WIDTH / 2;
    const y = (this.b.hasTitle ? 56 : 32) + this.panelRows * 24;
    this.panelRows += rows;
    return [x, y];
  }

  private fit(text: string, fontSize: number): void {
    this.panelNeed = Math.max(this.panelNeed, Math.ceil(labelWidth(text, fontSize)) + 8);
  }

  private show(id: string, on: boolean, t: number): void {
    if (this.b.valueAt(id, "opacity", t) !== (on ? 1 : 0)) this.b.set(id, "opacity", on ? 1 : 0, t);
  }

  // ---- the six ops -------------------------------------------------------------

  private value(spec: ValueSpec, t: number, path: string): void {
    const T = this.b.theme;
    const text = String(spec.text);
    const existing = this.readouts.get(spec.id);
    if (existing) {
      this.b.set(existing.text, "text", text, t);
      this.fit(`${existing.label}: ${text}`, T.fontSize);
      return;
    }
    const label = spec.label ?? spec.id;
    const textId = `value-${spec.id}`;
    const labelId = `value-${spec.id}-label`;
    if (spec.at) {
      const target = this.anchorBox(spec.at, t, `${path}.value.at`);
      const side = spec.side ?? "below";
      const w = labelWidth(`${label}: ${text}`, T.fontSize - 1);
      const h = T.fontSize * 1.4;
      const [cx, cy] = this.placeBeside(target, w, h, side, 10, new Set(this.anchors.get(spec.at) ?? []), t);
      // Haloed: a readout beside a node sits where lifelines and edges run, and reads over them.
      this.b.node({ id: labelId, shape: "text", pos: [cx - w / 2, cy], text: `${label}:`, fontSize: T.fontSize - 2, color: T.muted, anchor: "start", halo: true, opacity: 0 });
      const lx = cx - w / 2 + labelWidth(`${label}:`, T.fontSize - 2) - (T.fontSize - 2) * 1.2;
      this.b.node({ id: textId, shape: "text", pos: [lx, cy], text, fontSize: T.fontSize, color: T.accent, anchor: "start", halo: true, opacity: 0 });
    } else {
      const [cx, cy] = this.panelSlot(1);
      const left = cx - PANEL_WIDTH / 2;
      this.fit(`${label}: ${text}`, T.fontSize);
      this.b.node({ id: labelId, shape: "text", pos: [left, cy], text: `${label}:`, fontSize: T.fontSize - 2, color: T.muted, anchor: "start", opacity: 0 });
      this.b.node({ id: textId, shape: "text", pos: [left + labelWidth(`${label}:`, T.fontSize - 2) - (T.fontSize - 2) * 1.2, cy], text, fontSize: T.fontSize, color: T.accent, anchor: "start", opacity: 0 });
    }
    this.b.set(labelId, "opacity", 1, t);
    this.b.set(textId, "opacity", 1, t);
    this.readouts.set(spec.id, { text: textId, box: labelId, label });
  }

  private callout(spec: CalloutSpec | null, t: number, path: string): void {
    // `null` hides every callout; a spec replaces the one with its id.
    const stale = spec ? [spec.id ?? "main"] : [...this.callouts.keys()];
    for (const id of stale) {
      for (const nodeId of this.callouts.get(id) ?? []) this.show(nodeId, false, t);
      this.callouts.delete(id);
    }
    if (!spec) return;
    const id = spec.id ?? "main";
    const T = this.b.theme;
    let target = this.anchorBox(spec.at, t, `${path}.callout.at`);
    // An edge or a message is pointed at by its middle: "beside" the whole span of a diagonal would be far
    // from the line the callout is about.
    const anchored = this.resolve(spec.at, `${path}.callout.at`).map((nid) => this.b.nodes.find((n) => n.id === nid)?.shape);
    if (anchored.length && anchored.every((s) => s === "line" || s === "arrow" || s === "path")) target = box(target.x + target.w / 2, target.y + target.h / 2, 16, 16);
    const asked = spec.side ?? "above";
    const fs = T.fontSize - 1;
    // A callout wider than the picture has nowhere to go: every spot is off-canvas, and the unchecked fallback
    // laid hc's (v14) 70-character line across six edges and past the right edge. Wrap it to a readable width
    // first — a callout is a note, not a banner — unless the writer broke the lines themselves.
    const text = spec.text.includes("\n") ? spec.text : wrapText(spec.text, fs, Math.max(160, Math.min(360, this.b.width * 0.55)));
    const lines = text.split("\n").length;
    const w = labelWidth(text, fs);
    const h = fs * 1.9 + (lines - 1) * fs * 1.2;
    const [cx, cy] = this.placeBeside(target, w, h, asked, 26, new Set(this.anchors.get(spec.at) ?? []), t, true);
    const side = this.placedSide;
    const k = this.serial++;
    const ids = [`callout-${id}-${k}-box`, `callout-${id}-${k}-text`, `callout-${id}-${k}-arrow`];
    // The pointer runs from the box edge nearest the target to the target's edge — from the point on that edge
    // nearest the target, since the box may have slid sideways to stay on the canvas.
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    const fx = Math.max(cx - w / 2 + 8, Math.min(cx + w / 2 - 8, tx));
    const fy = Math.max(cy - h / 2 + 6, Math.min(cy + h / 2 - 6, ty));
    const from: Vec2 = side === "above" ? [fx, cy + h / 2] : side === "below" ? [fx, cy - h / 2] : side === "left" ? [cx + w / 2, fy] : [cx - w / 2, fy];
    const to: Vec2 = side === "above" ? [tx, target.y - 3] : side === "below" ? [tx, target.y + target.h + 3] : side === "left" ? [target.x - 3, ty] : [target.x + target.w + 3, ty];
    this.b.node({ id: ids[0], shape: "rect", pos: [cx, cy], size: [w, h], rx: 6, fill: T.accent, stroke: T.nodeStroke, strokeWidth: 1, opacity: 0 });
    this.b.node({ id: ids[1], shape: "text", pos: [cx, cy], text, fontSize: fs, color: T.nodeStroke, opacity: 0 });
    this.b.node({ id: ids[2], shape: "arrow", points: [[from[0] - cx, from[1] - cy], [to[0] - cx, to[1] - cy]], pos: [cx, cy], stroke: T.nodeStroke, strokeWidth: 1.5, opacity: 0 });
    for (const nodeId of ids) this.b.set(nodeId, "opacity", 1, t);
    this.callouts.set(id, ids);
  }

  private snapshot(spec: SnapshotSpec, t: number, path: string): void {
    const T = this.b.theme;
    const text = this.anchorText(spec.of, t, `${path}.snapshot.of`);
    const label = spec.label ?? spec.of;
    const k = this.serial++;
    const [cx, cy] = this.panelSlot(1);
    const left = cx - PANEL_WIDTH / 2;
    this.fit(`${label}: ${text}`, T.fontSize);
    const labelId = `snapshot-${k}-label`;
    const textId = `snapshot-${k}`;
    this.b.node({ id: labelId, shape: "text", pos: [left, cy], text: `${label}:`, fontSize: T.fontSize - 2, color: T.muted, anchor: "start", opacity: 0 });
    this.b.node({ id: textId, shape: "text", pos: [left + labelWidth(`${label}:`, T.fontSize - 2) - (T.fontSize - 2) * 1.2, cy], text, fontSize: T.fontSize, color: T.text, anchor: "start", opacity: 0 });
    this.b.set(labelId, "opacity", 1, t);
    this.b.set(textId, "opacity", 1, t);
  }

  private group(spec: GroupSpec | null, t: number, path: string): void {
    const stale = spec ? [spec.id ?? "main"] : [...this.groups.keys()];
    for (const id of stale) {
      for (const nodeId of this.groups.get(id) ?? []) this.show(nodeId, false, t);
      this.groups.delete(id);
    }
    if (!spec) return;
    const id = spec.id ?? "main";
    const T = this.b.theme;
    const names = Array.isArray(spec.around) ? spec.around : [spec.around];
    const bb = names.map((n) => this.anchorBox(n, t, `${path}.group.around`)).reduce(union);
    const pad = 10;
    const k = this.serial++;
    const rectId = `group-${id}-${k}`;
    const ids = [rectId];
    this.b.node({ id: rectId, shape: "rect", pos: [bb.x + bb.w / 2, bb.y + bb.h / 2], size: [bb.w + pad * 2, bb.h + pad * 2], rx: 8, fill: "none", stroke: T.accent, strokeWidth: 1.5, opacity: 0 });
    if (spec.label) {
      const labelId = `group-${id}-${k}-label`;
      ids.push(labelId);
      const fs = T.fontSize - 2;
      // Top-left, outside the outline — unless something already sits there (a column header over the
      // grouped columns, dd's "Batch 2" over "box3"); then bottom-left, then beside the top-right corner.
      // The first corner where no visible text already is wins; the top-left stays the default.
      const w = labelWidth(spec.label, fs) - fs * 1.6;
      const own = new Set(names.flatMap((n) => this.anchors.get(n) ?? []));
      const candidates: Vec2[] = [
        [bb.x - pad + 4, bb.y - pad - 9],
        [bb.x - pad + 4, bb.y + bb.h + pad + 9],
        [bb.x + bb.w + pad + 6, bb.y - pad + fs * 0.65],
      ];
      const free = (p: Vec2) => {
        const labelBox: Box = { x: p[0], y: p[1] - fs * 0.65, w, h: fs * 1.3 };
        // Anything that carries text counts — a `text` node or a labelled cell (v12's geometry caught "ordered"
        // landing on row C's first cell when only `text` nodes were checked).
        return !this.b.nodes.some(
          (n) => (n.shape === "text" || n.text !== undefined) && !own.has(n.id) && (this.b.valueAt(n.id, "opacity", t) ?? 1) !== 0 && intersects(this.nodeBox(n.id, t), labelBox),
        );
      };
      const pos = candidates.find(free) ?? candidates[0];
      this.b.node({ id: labelId, shape: "text", pos, text: spec.label, fontSize: fs, color: T.accent, anchor: "start", opacity: 0 });
    }
    for (const nodeId of ids) this.b.set(nodeId, "opacity", 1, t);
    this.groups.set(id, ids);
  }

  private text(spec: TextSpec | null, t: number, path: string): void {
    const T = this.b.theme;
    if (!spec) {
      for (const [id, blk] of this.blocks) {
        for (const nodeId of [...blk.lines, ...blk.hl, blk.box]) this.show(nodeId, false, t);
        this.blocks.delete(id);
      }
      return;
    }
    const id = spec.id ?? "main";
    const existing = this.blocks.get(id);
    const fs = T.fontSize - 1;
    const lineH = fs * 1.5;
    if (existing && existing.lines.length === spec.lines.length) {
      // Same shape: update lines in place and move the highlight.
      spec.lines.forEach((line, i) => {
        if (this.b.valueAt(existing.lines[i], "text", t) !== line) this.b.set(existing.lines[i], "text", line, t);
      });
      existing.hl.forEach((hlId, i) => this.show(hlId, spec.highlight === i, t));
      for (const nodeId of [...existing.lines, existing.box]) this.show(nodeId, true, t);
      return;
    }
    if (existing) for (const nodeId of [...existing.lines, ...existing.hl, existing.box]) this.show(nodeId, false, t);
    const w = Math.max(...spec.lines.map((l) => labelWidth(l, fs)), fs * 4);
    const h = spec.lines.length * lineH + fs;
    let cx: number;
    let cy: number;
    if (spec.at) {
      [cx, cy] = this.placeBeside(this.anchorBox(spec.at, t, `${path}.text.at`), w, h, spec.side ?? "right", 14, new Set(this.anchors.get(spec.at) ?? []), t);
    } else {
      const rows = Math.ceil(h / 24);
      const [px, py] = this.panelSlot(rows + 1);
      this.fit(spec.lines.reduce((a, c) => (c.length > a.length ? c : a), ""), fs);
      cx = px;
      cy = py + h / 2 - 12;
    }
    const k = this.serial++;
    const boxId = `text-${id}-${k}-box`;
    this.b.node({ id: boxId, shape: "rect", pos: [cx, cy], size: [w, h], rx: 6, fill: T.node, stroke: T.muted, strokeWidth: 1, opacity: 0 });
    const lines: string[] = [];
    const hl: string[] = [];
    const top = cy - h / 2 + fs * 0.5 + lineH / 2;
    spec.lines.forEach((line, i) => {
      const y = top + i * lineH;
      const hlId = `text-${id}-${k}-hl-${i}`;
      const lineId = `text-${id}-${k}-line-${i}`;
      this.b.node({ id: hlId, shape: "rect", pos: [cx, y], size: [w - 6, lineH - 2], rx: 3, fill: T.accent, opacity: 0 });
      this.b.node({ id: lineId, shape: "text", pos: [cx - w / 2 + fs * 0.8, y], text: line, fontSize: fs, color: T.text, anchor: "start", opacity: 0 });
      hl.push(hlId);
      lines.push(lineId);
      this.b.set(lineId, "opacity", 1, t);
      if (spec.highlight === i) this.b.set(hlId, "opacity", 0.35, t);
    });
    this.b.set(boxId, "opacity", 1, t);
    this.blocks.set(id, { lines, hl, box: boxId });
  }

  private relate(spec: RelateSpec | null, t: number, path: string): void {
    const stale = spec ? [spec.id ?? "main"] : [...this.relations.keys()];
    for (const id of stale) {
      for (const nodeId of this.relations.get(id) ?? []) this.show(nodeId, false, t);
      this.relations.delete(id);
    }
    if (!spec) return;
    const id = spec.id ?? "main";
    const T = this.b.theme;
    const a = this.anchorBox(spec.from, t, `${path}.relate.from`);
    const c = this.anchorBox(spec.to, t, `${path}.relate.to`);
    const ca: Vec2 = [a.x + a.w / 2, a.y + a.h / 2];
    const cc: Vec2 = [c.x + c.w / 2, c.y + c.h / 2];
    const d = Math.hypot(cc[0] - ca[0], cc[1] - ca[1]) || 1;
    let u: Vec2 = [(cc[0] - ca[0]) / d, (cc[1] - ca[1]) / d];
    // Edge to edge: trim each end at its anchor's box, plus a gap, so the line touches neither label.
    const ra = boxRadius(a.w, a.h, u[0], u[1]) + 5;
    const rc = boxRadius(c.w, c.h, u[0], u[1]) + (spec.style === "line" ? 5 : 9);
    let p: Vec2 = [ca[0] + u[0] * ra, ca[1] + u[1] * ra];
    let q: Vec2 = [cc[0] - u[0] * rc, cc[1] - u[1] * rc];
    let n: Vec2 = [-u[1], u[0]];
    const pair = union(a, c);
    const straight = { u, n, p, q };
    const tooShort = (q[0] - p[0]) * u[0] + (q[1] - p[1]) * u[1] < 16;
    const crosses = this.crossesBystander(p, q, a, c, spec.from, spec.to, t);
    // A pair that is apart on both axes (web at the top-left of a module map, db at the bottom-right) has no
    // "level" line worth drawing beside it: such a pair goes straight, arcing over what it crosses.
    const minor = Math.abs(u[0]) >= Math.abs(u[1]) ? 1 : 0;
    const apart = Math.abs(cc[minor] - ca[minor]) > (minor === 1 ? a.h / 2 + c.h / 2 : a.w / 2 + c.w / 2) + 20;
    const beside = tooShort || (crosses && !apart);
    const arcOnly = crosses && apart && !tooShort;
    if (beside) {
      // Adjacent boxes (two neighbouring rows, cells, bars) leave nothing between their edges, and a pair with
      // something else in between (rows A and C of three) would have the line drawn across the bystander — the
      // very thing `relate` exists to avoid. Either way the line runs beside them instead, along the pair's
      // dominant axis (horizontal for bars side by side, vertical for stacked rows) so bars of different heights
      // still get a level line.
      u = Math.abs(u[0]) >= Math.abs(u[1]) ? [Math.sign(u[0]) || 1, 0] : [0, Math.sign(u[1]) || 1];
      n = [-u[1], u[0]];
    }
    // The label (and, when beside, the whole line) goes to the side of the pair that is nearer to free space:
    // the smaller clearance past everything drawn in the pair's lane wins, as long as the canvas has room for it.
    const clearance = (sign: 1 | -1) => this.laneClearance(ca, cc, u, n, sign, t);
    // A level line sits at `ca + n · off · sign`: it fits when that coordinate is inside the canvas with a margin
    // for its label (the pair's radius says nothing about where the line is — that assumption once put a
    // relation at y = −4).
    const fits = (sign: 1 | -1, off: number): boolean => {
      const at: Vec2 = [ca[0] + n[0] * off * sign, ca[1] + n[1] * off * sign];
      const lo = 24;
      return at[0] >= lo && at[0] <= this.b.width + this.extraWidth() - lo && at[1] >= lo && at[1] <= this.b.height + this.extraH - CAPTION_BAND - lo;
    };
    const [offPlus, offMinus] = [clearance(1), clearance(-1)];
    let outward: 1 | -1 = offPlus <= offMinus ? 1 : -1;
    if (!fits(outward, outward === 1 ? offPlus : offMinus) && fits(-outward as 1 | -1, outward === 1 ? offMinus : offPlus)) outward = -outward as 1 | -1;
    let arc: { apex: Vec2; d: string } | undefined;
    if (beside || arcOnly) {
      let off = outward === 1 ? offPlus : offMinus;
      if (arcOnly) off = Infinity; // never a level line: straight to the arc below
      if (!fits(outward, off) && !arcOnly) {
        // Neither side fits as the canvas stands. The canvas can grow on its right and bottom edges (the
        // panel already does the former): when the level line misses by a little on a growable side, grow
        // that side rather than arc — eb's two-row matrix had its readouts sitting right on the caption band.
        const grow: 1 | -1 = n[0] + n[1] > 0 ? 1 : -1;
        const growOff = grow === 1 ? offPlus : offMinus;
        const pairRadius = boxRadius(pair.w, pair.h, n[0], n[1]);
        const deficit = growOff - pairRadius + 24 - this.room(pair, n, grow);
        // Only when the line would still be near the pair: a node row with lanes below it would need the
        // line under all the lanes, which is not a relation anyone can read — that case arcs.
        if (deficit <= 120 && growOff <= pairRadius + 100) {
          if (Math.abs(n[0]) > Math.abs(n[1])) {
            this.panelUsed = true;
            this.panelNeed = Math.max(this.panelNeed, PANEL_WIDTH + Math.ceil(deficit));
          } else this.extraH += Math.ceil(deficit);
          outward = grow;
          off = growOff;
        }
      }
      if (fits(outward, off)) {
        // Level with the first anchor's centre, offset just past everything in the lane (the pair's own boxes,
        // a row label, a readout beside a row); the arrow ends level with the second anchor's centre.
        const span = (cc[0] - ca[0]) * u[0] + (cc[1] - ca[1]) * u[1];
        p = [ca[0] + n[0] * off * outward, ca[1] + n[1] * off * outward];
        q = [p[0] + u[0] * span, p[1] + u[1] * span];
      } else {
        // Neither side has room for a level line — a node row at the top of a distributed scene, with the title
        // above it and the lanes below (ea, v11: the line went off the canvas at y = -16 and the writer's only
        // way out was to reorder the nodes). Arc over the bystanders instead, edge to edge along the straight
        // line, bulging on the side with more room by just enough to clear what it crosses.
        ({ u, n, p, q } = straight);
        const m: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const onCanvas = (pt: Vec2) => pt[0] >= 12 && pt[0] <= this.b.width + this.extraWidth() - 12 && pt[1] >= 12 && pt[1] <= this.b.height + this.extraH - CAPTION_BAND;
        // The side with more room first; if its apex would leave the canvas, the other side; if both would
        // (a long diagonal across a layered map), the straight line — crossing a box beats drawing off-canvas.
        // A side whose arc clears everything wins over one that still crosses something (the callout beside
        // `db` under an arc from `web`, v13); the roomier side breaks the tie.
        const sides: (1 | -1)[] = this.room(pair, n, 1) >= this.room(pair, n, -1) ? [1, -1] : [-1, 1];
        const tried = sides.map((side) => ({ side, ...this.bystanderBulge(p, q, n, side, a, c, spec.from, spec.to, t) }));
        const usable = tried.filter(({ bulge, side }) => onCanvas([m[0] + n[0] * bulge * side, m[1] + n[1] * bulge * side]));
        const pick = usable.find((x) => x.clear) ?? usable[0];
        if (pick) {
          const { side, bulge } = pick;
          const apex: Vec2 = [m[0] + n[0] * bulge * side, m[1] + n[1] * bulge * side];
          outward = side;
          // A quadratic Bézier passes halfway to its control point: the control sits at twice the bulge.
          const ctrl: Vec2 = [m[0] + n[0] * 2 * bulge * side, m[1] + n[1] * 2 * bulge * side];
          // The arc leaves and enters each box on the side that faces the bulge — an arc that swings left of
          // `db` comes into its left side, not down through the space above it where a callout sits.
          const towards = (from: Vec2, radius: (dx: number, dy: number) => number, gap: number): Vec2 => {
            const dx = ctrl[0] - from[0];
            const dy = ctrl[1] - from[1];
            const len = Math.hypot(dx, dy) || 1;
            const rr = radius(dx / len, dy / len) + gap;
            return [from[0] + (dx / len) * rr, from[1] + (dy / len) * rr];
          };
          p = towards(ca, (dx, dy) => boxRadius(a.w, a.h, dx, dy), 5);
          q = towards(cc, (dx, dy) => boxRadius(c.w, c.h, dx, dy), spec.style === "line" ? 5 : 9);
          const r = (v: number) => Math.round(v * 10) / 10;
          arc = {
            apex,
            d: `M ${r(p[0] - apex[0])} ${r(p[1] - apex[1])} Q ${r(ctrl[0] - apex[0])} ${r(ctrl[1] - apex[1])} ${r(q[0] - apex[0])} ${r(q[1] - apex[1])}`,
          };
        }
      }
    }
    const mid: Vec2 = arc ? arc.apex : [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const k = this.serial++;
    const lineId = `relate-${id}-${k}`;
    const ids = [lineId];
    // The tone is the relation's colour role: accent by default, `bad` for one that must not exist (a forbidden
    // import in a module map — fb, v13, wanted red and found only amber), `muted` for an aside.
    const color = spec.tone === "bad" ? T.bad : spec.tone === "muted" ? T.muted : T.accent;
    const dashed = spec.tone === "bad" ? true : undefined;
    const headless = spec.style === "line" || spec.style === "equals";
    if (arc) this.b.node({ id: lineId, shape: "path", pos: mid, d: arc.d, head: !headless, fill: "none", stroke: color, strokeWidth: 2, dashed, opacity: 0 });
    else this.b.node({ id: lineId, shape: headless ? "line" : "arrow", pos: mid, points: [[p[0] - mid[0], p[1] - mid[1]], [q[0] - mid[0], q[1] - mid[1]]], stroke: color, strokeWidth: 2, dashed, opacity: 0 });
    if (spec.style === "equals") {
      // Equivalence — "these two are substitutable / satisfy the same interface" (ga, v13) — is a double line:
      // the same stroke again, 4px along the line's normal, so the pair reads as = rather than as a connection.
      const twinId = `${lineId}-2`;
      ids.push(twinId);
      const shift: Vec2 = [n[0] * 4, n[1] * 4];
      if (arc) this.b.node({ id: twinId, shape: "path", pos: [mid[0] + shift[0], mid[1] + shift[1]], d: arc.d, fill: "none", stroke: color, strokeWidth: 2, dashed, opacity: 0 });
      else this.b.node({ id: twinId, shape: "line", pos: [mid[0] + shift[0], mid[1] + shift[1]], points: [[p[0] - mid[0], p[1] - mid[1]], [q[0] - mid[0], q[1] - mid[1]]], stroke: color, strokeWidth: 2, dashed, opacity: 0 });
    }
    if (spec.label) {
      const labelId = `relate-${id}-${k}-label`;
      ids.push(labelId);
      // A vertical line's label is beside it, start-anchored, so it reads left to right off the line.
      const vertical = Math.abs(u[1]) > Math.abs(u[0]);
      const gap = vertical ? 8 : 12;
      const fs = T.fontSize - 2;
      type Anchor = "start" | "end" | "middle";
      const sideAnchor = (dir: number): Anchor => (vertical ? (n[0] * dir > 0 ? "start" : "end") : "middle");
      const lw = labelWidth(spec.label, fs) - fs * 1.6;
      const lh = fs * 1.3;
      // Off the line's far side at its middle — unless text already sits there (ed, v12: the arc's label on
      // B's readout under the node row); then further out, then off the line's quarter points. Then the same
      // on the near side, and past either end along the line — a relation drawn beside the leftmost lane has
      // no canvas on its far side at all (ic, v15: a Japanese label 40px past the edge, shortened to fit).
      // Quarter points along the chord (an arc's label candidates sit off the chord, still on its far side).
      const quarter = (f: number): Vec2 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
      const side = (dir: number) =>
        [gap, gap * 2.5, gap * 4].flatMap((g) =>
          [mid, quarter(0.25), quarter(0.75)].map((pt) => ({ pt: [pt[0] + n[0] * g * dir, pt[1] + n[1] * g * dir] as Vec2, anchor: sideAnchor(dir) })),
        );
      const ends = [
        { pt: [p[0] - u[0] * (gap + lh), p[1] - u[1] * (gap + lh)] as Vec2, anchor: "middle" as Anchor },
        { pt: [q[0] + u[0] * (gap + lh), q[1] + u[1] * (gap + lh)] as Vec2, anchor: "middle" as Anchor },
      ];
      const candidates = [...side(outward), ...side(-outward), ...ends];
      const boxOf = (c: { pt: Vec2; anchor: Anchor }): Box => ({ x: c.anchor === "start" ? c.pt[0] : c.anchor === "end" ? c.pt[0] - lw : c.pt[0] - lw / 2, y: c.pt[1] - lh / 2, w: lw, h: lh });
      const strokes = this.strokesAt(t);
      const covered = (bx: Box) =>
        this.b.nodes.some((nd) => (nd.shape === "text" || nd.text !== undefined) && (this.b.valueAt(nd.id, "opacity", t) ?? 1) !== 0 && intersects(this.nodeBox(nd.id, t), bx)) ||
        this.crossedBy(bx, strokes) >= 8;
      const inCanvas = (bx: Box) => bx.x >= 0 && bx.y >= 0 && bx.x + bx.w <= this.b.width + this.extraWidth() && bx.y + bx.h <= this.b.height + this.extraH - CAPTION_BAND;
      const chosen = candidates.find((c) => inCanvas(boxOf(c)) && !covered(boxOf(c))) ?? candidates.find((c) => inCanvas(boxOf(c))) ?? candidates[0];
      // Haloed: the relation's own line runs right past its label, and another edge may cross it.
      this.b.node({ id: labelId, shape: "text", pos: chosen.pt, text: spec.label, fontSize: fs, color, anchor: chosen.anchor, halo: true, opacity: 0 });
    }
    for (const nodeId of ids) this.b.set(nodeId, "opacity", 1, t);
    this.relations.set(id, ids);
  }
}

/** Nearest anchor name for a did-you-mean, by edit distance, when close enough. */
function closestName(name: string, names: string[]): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const n of names) {
    const d = editDistance(name.toLowerCase(), n.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best !== undefined && bestD <= Math.max(2, Math.floor(name.length / 3)) ? best : undefined;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
