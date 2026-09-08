/**
 * Edges that go around what is in their way. Shared by the diagram / modules compiler (v13: dependency arrows
 * from two layers up vanished behind a module in between) and the state-machine compiler (v15: a transition
 * from 支払い完了 to 返金済み ran straight through 出荷準備中, and the writer's only lever was to reorder the
 * states until it happened not to).
 */

export type Box = { x: number; y: number; w: number; h: number };
export type Seg = [[number, number], [number, number]];

/** Length of the part of a segment inside a box (Liang–Barsky), for "does this edge run through that label". */
export function segmentInside(seg: Seg, b: Box): number {
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

const along = (a: [number, number], c: [number, number], f: number): [number, number] => [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];

/**
 * The centre line of an edge from `from` to `to` as waypoints: straight when nothing is in the way, else bent
 * around each blocker it would run behind — a waypoint level with the box, just past its nearer side, then on.
 * Passes repeat while a new leg finds a new box (at most four). `blockers` are every box that could be in the
 * way, the edge's own ends included; they are skipped by id.
 */
export function routeAround(from: [number, number], to: [number, number], blockers: { id: string; box: Box }[], ends: Set<string>): [number, number][] {
  let pts: [number, number][] = [from, to];
  const routed = new Set<string>();
  for (let pass = 0; pass < 4; pass++) {
    const next: [number, number][] = [pts[0]];
    let bent = false;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [a, c] = [pts[k], pts[k + 1]];
      // Blockers in the order the leg meets them, by projection on the leg's dominant axis.
      const steep = Math.abs(c[1] - a[1]) >= Math.abs(c[0] - a[0]);
      const hit = blockers
        .filter((n) => !ends.has(n.id) && !routed.has(n.id) && segmentInside([a, c], n.box) > 2)
        .map((n) => ({ n, at: steep ? (n.box.y + n.box.h / 2 - a[1]) / ((c[1] - a[1]) || 1) : (n.box.x + n.box.w / 2 - a[0]) / ((c[0] - a[0]) || 1) }))
        .sort((u, v) => u.at - v.at);
      for (const { n, at } of hit) {
        const box = n.box;
        routed.add(n.id);
        bent = true;
        // Where the line is, level with the box: go round on the side it already leans to, far enough out
        // that neither leg clips a corner of the box. A mostly vertical leg goes round to the left or right
        // of the box; a mostly horizontal one over or under.
        const lineAt = along(a, c, Math.max(0, Math.min(1, at)));
        const prev = next[next.length - 1];
        // Which side: the one the line already leans to, unless the other side is the shorter detour by a
        // clear margin (ib, v15: a transition leaning a little left of the state in its way went round the
        // left and then crossed back over another arrow to reach a target on the right).
        const leanLow = steep ? lineAt[0] <= box.x + box.w / 2 : lineAt[1] <= box.y + box.h / 2;
        const detour = (low: boolean, margin: number): [number, number] =>
          steep ? [low ? box.x - margin : box.x + box.w + margin, box.y + box.h / 2] : [box.x + box.w / 2, low ? box.y - margin : box.y + box.h + margin];
        const length = (w: [number, number]) => Math.hypot(w[0] - prev[0], w[1] - prev[1]) + Math.hypot(c[0] - w[0], c[1] - w[1]);
        const lenLean = length(detour(leanLow, 14));
        const lenOther = length(detour(!leanLow, 14));
        // Near a tie — the line passes close to the box's centre — the side the destination lies on wins, so
        // the edge does not swing away from where it is going and back across whatever lies between.
        const destLow = steep ? c[0] <= box.x + box.w / 2 : c[1] <= box.y + box.h / 2;
        const low = lenOther < lenLean * 0.85 ? !leanLow : Math.abs(lenOther - lenLean) <= lenLean * 0.15 ? destLow : leanLow;
        let w: [number, number] = prev;
        for (const margin of [14, 26, 40]) {
          w = detour(low, margin);
          if (segmentInside([prev, w], box) <= 2 && segmentInside([w, c], box) <= 2) break;
        }
        next.push(w);
      }
      next.push(c);
    }
    pts = next;
    if (!bent) break;
  }
  return pts;
}

/** The legs of a polyline and their total, for a token that follows it leg by leg at constant speed. */
export function polylineLegs(pts: [number, number][]): { legs: number[]; total: number } {
  const legs = pts.slice(1).map((pt, k) => Math.hypot(pt[0] - pts[k][0], pt[1] - pts[k][1]));
  return { legs, total: legs.reduce((s, l) => s + l, 0) || 1 };
}

const intersects = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * A label for a polyline edge that sits on none of `occupied` (states, earlier labels): off the middle of the
 * longest leg first, then a third of the way along it, on either normal, then the other legs. Falls back to
 * the longest leg's middle when every spot is taken (ib, v15: two transitions into one state carried the same
 * label, and both landed on the same spot).
 */
export function placeEdgeLabel(pts: [number, number][], lw: number, lh: number, occupied: Box[], offset = 13): [number, number] {
  const legs = pts.slice(1).map((c, k): [[number, number], [number, number], number] => [pts[k], c, Math.hypot(c[0] - pts[k][0], c[1] - pts[k][1])]);
  const order = [...legs.keys()].sort((i, j) => legs[j][2] - legs[i][2]);
  const candidates: [number, number][] = [];
  for (const i of order) {
    const [a, c, l] = legs[i];
    const n: [number, number] = [-(c[1] - a[1]) / (l || 1), (c[0] - a[0]) / (l || 1)];
    for (const f of [0.5, 0.35, 0.65]) for (const s of [1, -1]) {
      const m = along(a, c, f);
      candidates.push([m[0] + n[0] * offset * s, m[1] + n[1] * offset * s]);
    }
  }
  const boxAt = (p: [number, number]): Box => ({ x: p[0] - lw / 2, y: p[1] - lh / 2, w: lw, h: lh });
  return candidates.find((p) => !occupied.some((o) => intersects(boxAt(p), o))) ?? candidates[0];
}

/** The longest leg of a polyline, and a label position off its middle on its left-hand normal. */
export function longestLegLabel(pts: [number, number][], offset = 11): { from: [number, number]; to: [number, number]; labelPos: [number, number] } {
  let best = 0;
  for (let k = 1; k + 1 < pts.length; k++) if (Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) > Math.hypot(pts[best + 1][0] - pts[best][0], pts[best + 1][1] - pts[best][1])) best = k;
  const [a, c] = [pts[best], pts[best + 1]];
  const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
  const mid = along(a, c, 0.5);
  return { from: a, to: c, labelPos: [mid[0] + (-(c[1] - a[1]) / l) * offset, mid[1] + ((c[0] - a[0]) / l) * offset] };
}
