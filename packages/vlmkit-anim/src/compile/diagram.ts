/**
 * `diagram` → boxes and arrows laid out automatically, walked through by a
 * `sequence` of narrated beats: reveal, highlight, flow a token along an
 * edge, relabel, or just pause on a note.
 */

import type { DiagramScene, Timeline, Tone } from "../types.ts";
import { Builder, along, boxRadius, labelWidth, trimEdge } from "./builder.ts";
import { layoutNodes } from "./layout.ts";

import { routeAround, segmentInside, type Box, type Seg } from "./route.ts";
export { segmentInside } from "./route.ts";

export function compileDiagram(scene: DiagramScene, kindName: "diagram" | "modules" = "diagram"): Timeline {
  const b = new Builder(scene, { width: 640, height: 360, stepMs: 700 });
  const T = b.theme;
  // Colour roles for a still (gb, v13, v14: "no colour field on deps edges — colouring one edge requires reaching
  // into the beat/sequence/highlight machinery on what is supposed to be a motion-free still figure").
  const toneStroke = (tone: Tone | undefined, plain: string): string => (tone === "accent" ? T.accent : tone === "bad" ? T.bad : tone === "muted" ? T.muted : plain);
  const nodeFill = (n: { fill?: string; tone?: Tone }): string => n.fill ?? (n.tone === "accent" ? T.accent : T.node);
  const ids = scene.nodes.map((n) => n.id);
  const fixed = new Map<string, [number, number]>();
  for (const n of scene.nodes) if (n.pos) fixed.set(n.id, n.pos);
  const sizes = new Map<string, [number, number]>();
  for (const n of scene.nodes) {
    const label = n.label ?? n.id;
    const w = labelWidth(label, T.fontSize);
    const h = T.fontSize * 1.2 * label.split("\n").length + T.fontSize * 1.4;
    sizes.set(n.id, n.shape === "circle" ? [Math.max(w, h), Math.max(w, h)] : [w, h]);
  }
  const maxW = Math.max(...[...sizes.values()].map((s) => s[0]));
  const maxH = Math.max(...[...sizes.values()].map((s) => s[1]));
  // A forbidden edge is drawn but says nothing about where things go: the layout never sees it.
  const edges = (scene.edges ?? []).filter((e) => e.style !== "forbidden").map((e): [string, string] => [e.from, e.to]);
  const groups = scene.groups ?? [];
  // Nesting (v20): a group's members are its own nodes plus every descendant's; the layout bands by the
  // outermost group and keeps each inner group's members together; a parent's box wraps its children's with
  // room for their labels.
  const byId = new Map(groups.map((g) => [g.id, g]));
  const childrenOf = (id: string) => groups.filter((g) => g.parent === id);
  const membersOf = (g: (typeof groups)[number]): string[] => {
    const seen = new Set<string>();
    const walk = (x: (typeof groups)[number]): void => {
      x.nodes.forEach((n) => seen.add(n));
      childrenOf(x.id).forEach(walk);
    };
    walk(g);
    return [...seen];
  };
  const depthBelow = (g: (typeof groups)[number]): number => Math.max(0, ...childrenOf(g.id).map((c) => depthBelow(c) + 1));
  const depthOf = (g: (typeof groups)[number]): number => (g.parent && byId.has(g.parent) ? depthOf(byId.get(g.parent)!) + 1 : 0);
  const roots = groups.filter((g) => !g.parent || !byId.has(g.parent));
  const cluster = new Map<string, string>();
  for (const g of groups) for (const n of g.nodes) cluster.set(n, g.id);
  const maxDepth = Math.max(0, ...groups.map(depthBelow));
  // Containers need room for their padding and label: the free area shrinks by a band per group level.
  const groupPad = groups.length ? 18 + maxDepth * 14 : 0;
  const pos = layoutNodes(
    {
      ids,
      edges,
      fixed,
      width: b.width - 40 - groupPad * 2,
      height: b.height - 90 - groupPad * 2,
      nodeW: maxW + groupPad,
      nodeH: maxH + groupPad,
      groups: roots.map((g) => ({ id: g.id, nodes: membersOf(g) })),
      cluster,
      // A module map layers from its leaves: what two modules depend on decides their layer, not what
      // depends on them (fa, v13: the same dependency set landed on different layers under the root walk).
      layering: kindName === "modules" ? "sinks" : "sources",
    },
    scene.layout ?? "lr",
  );
  for (const [id, p] of pos) if (!fixed.has(id)) pos.set(id, [p[0] + 20 + groupPad, p[1] + 40 + groupPad]);

  if (scene.title) b.node({ id: "title", shape: "text", pos: [b.width / 2, 22], text: scene.title, fontSize: T.fontSize + 4, color: T.text });

  // Edge geometry first — where each runs and where its label sits — so containers and their labels can keep
  // out of the way: "infrastructure" under "emits" was the first thing the layout geometry found in this
  // kind's own example (v12), and "core" with an arrow through it the first thing v13's writers drew.
  const boxOf = (id: string): Box => {
    const p = pos.get(id)!;
    const s = sizes.get(id)!;
    return { x: p[0] - s[0] / 2, y: p[1] - s[1] / 2, w: s[0], h: s[1] };
  };
  // An edge that would run behind a box that is not one of its ends bends around it: a waypoint level with
  // the box, just past its nearer side, then on. Passes repeat while a new segment finds a new box (fa, fc
  // and the workspace map, v13: dependency arrows from two layers up vanished behind a module in between).
  const route = (e: { from: string; to: string }): [number, number][] =>
    routeAround(pos.get(e.from)!, pos.get(e.to)!, scene.nodes.map((n) => ({ id: n.id, box: boxOf(n.id) })), new Set([e.from, e.to]));
  const edgeGeom = (scene.edges ?? []).map((e, i) => {
    const centres = route(e);
    const first = centres[1];
    const last = centres[centres.length - 2];
    const a = centres[0];
    const c = centres[centres.length - 1];
    const d0 = [first[0] - a[0], first[1] - a[1]];
    const l0 = Math.hypot(d0[0], d0[1]) || 1;
    const d1 = [c[0] - last[0], c[1] - last[1]];
    const l1 = Math.hypot(d1[0], d1[1]) || 1;
    const sa = sizes.get(e.from)!;
    const sc = sizes.get(e.to)!;
    const ra = scene.nodes.find((n) => n.id === e.from)?.shape === "circle" ? sa[0] / 2 : boxRadius(sa[0], sa[1], d0[0] / l0, d0[1] / l0);
    const rc = scene.nodes.find((n) => n.id === e.to)?.shape === "circle" ? sc[0] / 2 : boxRadius(sc[0], sc[1], d1[0] / l1, d1[1] / l1);
    const headless = e.style === "line";
    const [p] = trimEdge(a, first, ra + 2, 0);
    const [, q] = trimEdge(last, c, 0, rc + (headless ? 2 : 6));
    const pts: [number, number][] = [p, ...centres.slice(1, -1), q];
    const label = e.label ?? (e.style === "forbidden" ? "✗" : undefined);
    // The label sits off the middle of the longest segment, on its left-hand normal.
    let best = 0;
    for (let k = 1; k + 1 < pts.length; k++) if (Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) > Math.hypot(pts[best + 1][0] - pts[best][0], pts[best + 1][1] - pts[best][1])) best = k;
    const [sa0, sa1] = [pts[best], pts[best + 1]];
    const sl = Math.hypot(sa1[0] - sa0[0], sa1[1] - sa0[1]) || 1;
    const mid = along(sa0, sa1, 0.5);
    const labelPos: [number, number] = [mid[0] + (-(sa1[1] - sa0[1]) / sl) * 11, mid[1] + ((sa1[0] - sa0[0]) / sl) * 11];
    return { e, i, id: `edge-${i}`, p, q, pts, label, labelPos };
  });
  const occupied: Box[] = [];
  for (const n of scene.nodes) {
    const p = pos.get(n.id)!;
    const s = sizes.get(n.id)!;
    occupied.push({ x: p[0] - s[0] / 2, y: p[1] - s[1] / 2, w: s[0], h: s[1] });
  }
  for (const g of edgeGeom) {
    if (!g.label) continue;
    const w = labelWidth(g.label, T.fontSize - 2);
    occupied.push({ x: g.labelPos[0] - w / 2, y: g.labelPos[1] - 10, w, h: 20 });
  }
  const segs: Seg[] = edgeGeom.filter((g) => !g.e.hidden).flatMap((g) => g.pts.slice(1).map((pt, k): Seg => [g.pts[k], pt]));
  const hits = (bx: Box) => occupied.some((o) => bx.x < o.x + o.w && o.x < bx.x + bx.w && bx.y < o.y + o.h && o.y < bx.y + bx.h);
  const crossed = (bx: Box) => segs.reduce((s, seg) => s + segmentInside(seg, bx), 0);

  // Containers first, so they sit behind everything they hold: the members' bounding box with padding, the
  // label in the first corner that nothing occupies and no edge runs through — inside first, then just outside.
  const groupIds = new Set(groups.map((g) => g.id));
  // Outer containers first, so an inner one draws over its parent's outline and its label is placed after.
  const drawOrder = [...groups].sort((a, c) => depthOf(a) - depthOf(c));
  for (const g of drawOrder) {
    const members = membersOf(g).filter((id) => pos.has(id));
    if (!members.length) continue;
    const xs = members.flatMap((id) => [pos.get(id)![0] - sizes.get(id)![0] / 2, pos.get(id)![0] + sizes.get(id)![0] / 2]);
    const ys = members.flatMap((id) => [pos.get(id)![1] - sizes.get(id)![1] / 2, pos.get(id)![1] + sizes.get(id)![1] / 2]);
    // A parent's padding leaves room for each nested container and its label band.
    const pad = 14 + depthBelow(g) * 24;
    const labelH = g.label ? 16 : 0;
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad - labelH;
    const x1 = Math.max(...xs) + pad;
    let y1 = Math.max(...ys) + pad;
    let labelNode: Parameters<typeof b.node>[0] | undefined;
    if (g.label) {
      const fs = T.fontSize - 2;
      const lw = labelWidth(g.label, fs) - fs * 1.6;
      // Inside the top corners, inside the bottom corners (the container grows a band for it), then just outside;
      // then the middles — inside top and bottom, outside above and below, and beside the container at its
      // mid-height — for a small container under a fan of edges, where every corner has one through it (hd, v14:
      // two one-module containers straight below the root, both labels crossed at every corner).
      type Corner = { pos: [number, number]; anchor: "start" | "end" | "middle"; bottom?: boolean };
      const ym = (y0 + y1) / 2;
      const xm = (x0 + x1) / 2;
      const corners: Corner[] = [
        { pos: [x0 + 10, y0 + 12], anchor: "start" },
        { pos: [x1 - 10, y0 + 12], anchor: "end" },
        { pos: [x0 + 10, y1 + labelH - 12], anchor: "start", bottom: true },
        { pos: [x1 - 10, y1 + labelH - 12], anchor: "end", bottom: true },
        { pos: [x0 + 4, y0 - 10], anchor: "start" },
        { pos: [x1 - 4, y0 - 10], anchor: "end" },
        { pos: [x0 + 4, y1 + 10], anchor: "start" },
        { pos: [x1 - 4, y1 + 10], anchor: "end" },
        { pos: [xm, y0 + 12], anchor: "middle" },
        { pos: [xm, y1 + labelH - 12], anchor: "middle", bottom: true },
        { pos: [xm, y0 - 10], anchor: "middle" },
        { pos: [xm, y1 + 10], anchor: "middle" },
        { pos: [x0 - 6, ym], anchor: "end" },
        { pos: [x1 + 6, ym], anchor: "start" },
      ];
      const boxAt = (c: Corner): Box => ({ x: c.anchor === "start" ? c.pos[0] : c.anchor === "end" ? c.pos[0] - lw : c.pos[0] - lw / 2, y: c.pos[1] - fs * 0.65, w: lw, h: fs * 1.3 });
      const onCanvas = (bx: Box) => bx.y >= 4 && bx.x >= 0 && bx.x + bx.w <= b.width && bx.y + bx.h <= b.height - 40;
      const free = corners.filter((c) => onCanvas(boxAt(c)) && !hits(boxAt(c)));
      // A free corner no edge runs through; failing that the free corner with the least edge through it; failing
      // that the first corner.
      const clear = free.find((c) => crossed(boxAt(c)) < 4);
      const corner = clear ?? free.sort((c, d) => crossed(boxAt(c)) - crossed(boxAt(d)))[0] ?? corners[0];
      if (corner.bottom) y1 += labelH;
      // Hemmed in on every side (a one-module container straight under the root, hd, v14): the least-crossed
      // spot, with a halo so the edge breaks around the glyphs — the same treatment an edge label gets.
      labelNode = { id: `${g.id}-label`, shape: "text", pos: corner.pos, text: g.label, fontSize: fs, color: T.muted, anchor: corner.anchor, ...(clear ? {} : { halo: true }) };
      occupied.push(boxAt(corner));
    }
    b.node({ id: g.id, shape: "rect", pos: [(x0 + x1) / 2, (y0 + y1) / 2], size: [x1 - x0, y1 - y0], rx: 10, fill: "none", stroke: T.muted, strokeWidth: 1.2 });
    if (labelNode) b.node(labelNode);
    b.anchor(g.id, g.id);
  }

  const edgeEnds = new Map<string, [number, number][]>();
  const edgeId = new Map<string, string>();
  const edgeStroke = new Map<string, string>();
  for (const g of edgeGeom) {
    const { e, id, p, q, pts } = g;
    const stroke = toneStroke(e.tone, e.style === "forbidden" ? T.bad : T.nodeStroke);
    edgeEnds.set(`${e.from}->${e.to}`, pts);
    edgeId.set(`${e.from}->${e.to}`, id);
    edgeStroke.set(id, stroke);
    const dashed = e.style === "dashed" || e.style === "implements" || e.style === "forbidden" ? true : undefined;
    // A realisation of an interface carries a hollow head (UML), so it reads as "implements", not "calls".
    const head = e.style === "line" ? false : e.style === "implements" ? ("hollow" as const) : true;
    if (pts.length === 2) {
      b.node({ id, shape: e.style === "line" ? "line" : "arrow", points: [p, q], stroke, dashed, ...(head === "hollow" ? { head } : {}), opacity: e.hidden ? 0 : 1 });
    } else {
      // A bent edge is a path through its waypoints, drawn from its first point.
      const r = (v: number) => Math.round(v * 10) / 10;
      const d = pts.map((pt, k) => `${k === 0 ? "M" : "L"} ${r(pt[0] - p[0])} ${r(pt[1] - p[1])}`).join(" ");
      b.node({ id, shape: "path", pos: p, d, head, fill: "none", stroke, dashed, opacity: e.hidden ? 0 : 1 });
    }
    if (g.label) {
      // An edge label sits on a line by design: the halo breaks the line around the glyphs, so an edge that
      // crosses it stays a readable label rather than a struck-through one.
      b.node({ id: `${id}-label`, shape: "text", pos: g.labelPos, text: g.label, fontSize: T.fontSize - 2, color: toneStroke(e.tone, e.style === "forbidden" ? T.bad : T.text), halo: true, opacity: e.hidden ? 0 : 1 });
    }
  }
  for (const n of scene.nodes) {
    const p = pos.get(n.id)!;
    const s = sizes.get(n.id)!;
    const shape = n.shape ?? "rect";
    b.node({
      id: n.id,
      shape,
      pos: p,
      ...(shape === "circle" ? { r: s[0] / 2 } : { size: s, rx: 6 }),
      fill: nodeFill(n),
      stroke: n.tone === "bad" ? T.bad : n.tone === "muted" ? T.muted : T.nodeStroke,
      strokeWidth: 1.5,
      text: n.label ?? n.id,
      fontSize: T.fontSize,
      color: n.tone === "bad" ? T.bad : n.tone === "muted" ? T.muted : T.text,
      opacity: n.hidden ? 0 : 1,
    });
  }
  b.node({ id: "token", shape: "circle", pos: [0, 0], r: 6, fill: T.accent, stroke: T.nodeStroke, opacity: 0 });
  for (const n of scene.nodes) b.anchor(n.id, n.id);
  for (const [key, id] of edgeId) b.anchor(key, id);

  const arr = (v: string | string[]): string[] => (Array.isArray(v) ? v : [v]);
  b.step(scene.title ? scene.title : undefined, "start");
  b.advance(b.stepMs * 0.5);
  for (const st of scene.sequence ?? []) {
    if (b.annotate(st, "sequence")) continue;
    const ms = st.ms ?? b.stepMs;
    if ("show" in st || "hide" in st) {
      const targets = arr("show" in st ? st.show : st.hide);
      const to = "show" in st ? 1 : 0;
      // `ms: 0`: applied at the cursor inside the surrounding beat, no step of its own (the
      // convention `pointers` / `highlight` follow elsewhere; v10's generated change maps need it).
      // Otherwise the fade is short and the step marker sits at its end, so a frame taken at the
      // step (`render --step`, the contact sheet) shows the node the caption is talking about.
      const t0 = b.t;
      const fadeMs = Math.min(ms, 250);
      if (ms > 0) b.step(st.caption ?? `${to ? "Show" : "Hide"} ${targets.join(", ")}`, undefined, t0 + fadeMs);
      const t1 = b.advance(ms);
      const fade = (id: string): void => (ms > 0 ? b.tween(id, "opacity", to, t0, t0 + fadeMs) : b.set(id, "opacity", to, t0));
      for (const id of targets) {
        fade(id);
        // Edges touching a node follow its visibility so an arrow never points at nothing.
        for (const [key, eid] of edgeId) {
          const [from, dest] = key.split("->");
          if (from !== id && dest !== id) continue;
          const other = from === id ? dest : from;
          const otherVisible = (b.valueAt(other, "opacity", t1) ?? 1) as number;
          if (to === 1 && otherVisible < 1) continue;
          fade(eid);
          if (b.has(`${eid}-label`)) fade(`${eid}-label`);
        }
      }
    } else if ("highlight" in st || "unhighlight" in st) {
      const targets = arr("highlight" in st ? st.highlight : st.unhighlight);
      const on = "highlight" in st;
      const color = on ? T.accent : T.node;
      if (ms > 0) b.step(st.caption ?? (on ? `Focus on ${targets.join(", ")}` : undefined));
      const t0 = b.t;
      b.advance(ms);
      // Instant, like the sort and matrix highlights: the frame at the step shows the focus.
      for (const id of targets) {
        if (groupIds.has(id)) {
          // A container has no fill to change: its outline takes the accent instead.
          b.set(id, "stroke", on ? T.accent : T.muted, t0);
          continue;
        }
        const eid = edgeId.get(id.replace(/\s+/g, "")) ?? (id.includes("->") ? edgeId.get(id.split("->").reverse().join("->")) : undefined);
        if (eid) {
          // An edge lights up along its length, its label with it (fd and fc, v13, both reached for this).
          b.set(eid, "stroke", on ? T.accent : edgeStroke.get(eid)!, t0);
          if (b.has(`${eid}-label`)) b.set(`${eid}-label`, "color", on ? T.accent : T.text, t0);
          continue;
        }
        const original = nodeFill(scene.nodes.find((n) => n.id === id)!);
        const fill = on ? color : original ?? color;
        if (b.valueAt(id, "fill", t0) !== fill) b.set(id, "fill", fill, t0);
      }
    } else if ("flow" in st) {
      const [from, to] = typeof st.flow === "string" ? st.flow.split("->").map((x) => x.trim()) : st.flow;
      let ends = edgeEnds.get(`${from}->${to}`);
      let reversed = false;
      if (!ends) {
        ends = edgeEnds.get(`${to}->${from}`);
        reversed = true;
      }
      if (!ends) continue; // validator reports the missing edge
      const pts = reversed ? [...ends].reverse() : ends;
      b.step(st.caption ?? `${from} → ${to}`);
      const eid = edgeId.get(reversed ? `${to}->${from}` : `${from}->${to}`)!;
      b.set(eid, "stroke", T.accent);
      b.set("token", "pos", pts[0]);
      b.set("token", "opacity", 1);
      const t0 = b.t;
      const t1 = b.advance(ms);
      // The token follows the edge's waypoints, each leg taking its share of the beat by length.
      const legs = pts.slice(1).map((pt, k) => Math.hypot(pt[0] - pts[k][0], pt[1] - pts[k][1]));
      const total = legs.reduce((s, l) => s + l, 0) || 1;
      let at = t0;
      pts.slice(1).forEach((pt, k) => {
        const end = k === legs.length - 1 ? t1 : at + ((t1 - t0) * legs[k]) / total;
        b.tween("token", "pos", pt, at, end, legs.length === 1 ? "ease-in-out" : "linear");
        at = end;
      });
      b.set("token", "opacity", 0, t1);
      b.set(eid, "stroke", edgeStroke.get(eid)!, t1);
    } else if ("note" in st) {
      b.step(st.note);
      b.advance(ms);
    } else if ("relabel" in st) {
      b.step(st.caption ?? `${st.relabel.id}: "${st.relabel.text}"`);
      b.set(st.relabel.id, "text", st.relabel.text);
      b.advance(ms);
    }
  }
  b.step(undefined, "end");
  b.advance(b.stepMs * 0.3);
  return b.build({ title: scene.title, kind: kindName });
}
