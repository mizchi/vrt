/**
 * Static SVG for one instant of a Timeline.
 *
 * The same node model the `<vlm-anim>` runtime builds in the DOM, written out
 * as markup at a sampled time. Deterministic and browser-free, so a frame can
 * be diffed byte-for-byte in a test, rasterised for `vlmkit diff png`, or read
 * by an agent as text to see where things are.
 */

import { breakPieces, textWidth } from "./text-width.ts";
import { currentCaption, sampleFrame, timelineDuration, type NodeState } from "./timeline.ts";
import type { Timeline, Vec2 } from "./types.ts";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const num = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Approximate length of a path's `d`, flattening curves. Mirrors `getTotalLength()` closely enough for dash progress. */
export function pathLength(d: string): number {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let len = 0;
  const read = () => Number(tokens[i++]);
  const seg = (nx: number, ny: number) => {
    len += Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
  };
  const curve = (pts: Vec2[]) => {
    const p0: Vec2 = [x, y];
    let px = x;
    let py = y;
    for (let k = 1; k <= 16; k++) {
      const t = k / 16;
      const [cx, cy] = bezierPoint([p0, ...pts], t);
      len += Math.hypot(cx - px, cy - py);
      px = cx;
      py = cy;
    }
    x = pts[pts.length - 1][0];
    y = pts[pts.length - 1][1];
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        x = ox + read();
        y = oy + read();
        sx = x;
        sy = y;
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": seg(ox + read(), oy + read()); break;
      case "H": seg(ox + read(), y); break;
      case "V": seg(x, oy + read()); break;
      case "C": curve([[ox + read(), oy + read()], [ox + read(), oy + read()], [ox + read(), oy + read()]]); break;
      case "Q": curve([[ox + read(), oy + read()], [ox + read(), oy + read()]]); break;
      case "Z": seg(sx, sy); i += 0; break;
      default: i++; // unsupported command: skip a token to guarantee progress
    }
    if (cmd.toUpperCase() === "Z") cmd = "";
  }
  return len;
}

function bezierPoint(pts: Vec2[], t: number): Vec2 {
  let p = pts;
  while (p.length > 1) {
    const next: Vec2[] = [];
    for (let k = 0; k < p.length - 1; k++) next.push([p[k][0] + (p[k + 1][0] - p[k][0]) * t, p[k][1] + (p[k + 1][1] - p[k][1]) * t]);
    p = next;
  }
  return p[0];
}

function dashAttrs(n: NodeState, length: number): string {
  // A dashed pattern once drawn; while drawing in, the offset trick owns the dasharray.
  if (n.dash >= 1) return n.dashed ? ` stroke-dasharray="6 4"` : "";
  const L = Math.max(length, 0.01);
  return ` stroke-dasharray="${num(L)}" stroke-dashoffset="${num(L * (1 - n.dash))}"`;
}

/** Marker id per stroke colour: SVG markers do not inherit `stroke`. */
function markerId(color: string): string {
  return `arrow-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
}

function shapeMarkup(n: NodeState, markers: Set<string>): string {
  const stroke = n.stroke ?? "#333";
  const fill = n.fill ?? "#fff";
  const sw = n.strokeWidth ?? 1.5;
  const common = `fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${num(sw)}"`;
  switch (n.shape) {
    case "rect": {
      const [w, h] = n.size ?? [80, 40];
      return `<rect x="${num(-w / 2)}" y="${num(-h / 2)}" width="${num(w)}" height="${num(h)}"${n.rx !== undefined ? ` rx="${num(n.rx)}"` : ""} ${common}/>`;
    }
    case "ellipse": {
      const [w, h] = n.size ?? [80, 40];
      return `<ellipse rx="${num(w / 2)}" ry="${num(h / 2)}" ${common}/>`;
    }
    case "circle":
      return `<circle r="${num(n.r ?? 20)}" ${common}/>`;
    case "line":
    case "arrow": {
      const [[x1, y1], [x2, y2]] = n.points ?? [[0, 0], [0, 0]];
      let marker = "";
      // The head appears with the stroke: a message sampled at the start of its beat has dash 0, and a head
      // on an undrawn line reads as "an arrowhead pointing at nothing" (a v12 reader, on a contact sheet).
      if (n.shape === "arrow" && (n.dash === undefined || n.dash >= 0.999)) {
        markers.add(stroke);
        marker = ` marker-end="url(#${markerId(stroke)})"`;
      }
      return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${esc(stroke)}" stroke-width="${num(sw)}" fill="none"${marker}${dashAttrs(n, Math.hypot(x2 - x1, y2 - y1))}/>`;
    }
    case "path": {
      let marker = "";
      if (n.head) {
        markers.add(stroke);
        marker = ` marker-end="url(#${markerId(stroke)})"`;
      }
      return `<path d="${esc(n.d ?? "")}" fill="${esc(n.fill ?? "none")}" stroke="${esc(stroke)}" stroke-width="${num(sw)}"${marker}${dashAttrs(n, pathLength(n.d ?? ""))}/>`;
    }
    case "text":
    case "group":
      return "";
  }
}

function textMarkup(n: NodeState, background: string): string {
  if (n.text === undefined) return "";
  const size = n.fontSize ?? 14;
  const color = n.color ?? "#1f2328";
  const anchor = n.shape === "text" ? (n.anchor ?? "middle") : "middle";
  const lines = n.text.split("\n");
  const y0 = -((lines.length - 1) * size * 1.2) / 2;
  const spans = lines
    .map((line, i) => `<tspan x="0" y="${num(y0 + i * size * 1.2)}">${esc(line)}</tspan>`)
    .join("");
  // A halo: the background colour stroked under the glyphs, so a line the label sits on breaks around it.
  const halo = n.halo ? ` stroke="${esc(background)}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"` : "";
  return `<text font-size="${num(size)}" fill="${esc(color)}"${halo} text-anchor="${anchor}" dominant-baseline="central" font-family="system-ui, sans-serif">${spans}</text>`;
}

function nodeMarkup(n: NodeState, children: Map<string, NodeState[]>, markers: Set<string>, background: string): string {
  const [x, y] = n.pos;
  const transform = `translate(${num(x)} ${num(y)})${n.rotate ? ` rotate(${num(n.rotate)})` : ""}${n.scale !== 1 ? ` scale(${num(n.scale)})` : ""}`;
  const opacity = n.opacity < 1 ? ` opacity="${num(n.opacity)}"` : "";
  const kids = (children.get(n.id) ?? []).map((c) => nodeMarkup(c, children, markers, background)).join("");
  return `<g id="${esc(n.id)}" data-shape="${n.shape}" transform="${transform}"${opacity}>${shapeMarkup(n, markers)}${textMarkup(n, background)}${kids}</g>`;
}

export interface RenderOptions {
  /** Draw the current step's caption at the bottom of the canvas. Default true. */
  caption?: boolean;
  /** Show only this region of the canvas (a still cropped to its content). The image takes the region's size. */
  crop?: { x: number; y: number; w: number; h: number };
}

export function renderFrameSvg(tl: Timeline, t: number, opts: RenderOptions = {}): string {
  const frame = sampleFrame(tl, t);
  const children = new Map<string, NodeState[]>();
  const roots: NodeState[] = [];
  for (const n of tl.nodes) {
    const st = frame.get(n.id)!;
    if (n.parent && frame.has(n.parent)) {
      const arr = children.get(n.parent) ?? [];
      arr.push(st);
      children.set(n.parent, arr);
    } else roots.push(st);
  }
  const markers = new Set<string>();
  const { width, height, background } = tl.canvas;
  const body = roots.map((n) => nodeMarkup(n, children, markers, background ?? "#ffffff")).join("\n");
  const defs = [...markers]
    .map(
      (c) =>
        `<marker id="${markerId(c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${esc(c)}"/></marker>`,
    )
    .join("");
  let caption = "";
  if (opts.caption !== false) {
    const text = currentCaption(tl, t);
    if (text) {
      // A caption wider than the canvas wraps (up to three lines, growing upward from the bottom band)
      // rather than being clipped at both ends.
      const lines = wrapCaption(text, width - 24, 14, 3);
      const lineH = 17;
      const y0 = height - 14 - (lines.length - 1) * lineH;
      const spans = lines.map((l, i) => `<tspan x="${num(width / 2)}" y="${num(y0 + i * lineH)}">${esc(l)}</tspan>`).join("");
      caption = `<text font-size="14" fill="#1f2328" text-anchor="middle" font-family="system-ui, sans-serif" data-caption="true">${spans}</text>`;
    }
  }
  const view = opts.crop ?? { x: 0, y: 0, w: width, h: height };
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(view.x)} ${num(view.y)} ${num(view.w)} ${num(view.h)}" width="${num(view.w)}" height="${num(view.h)}" data-t="${num(t)}" data-duration="${num(timelineDuration(tl))}">`,
    defs ? `<defs>${defs}</defs>` : "",
    `<rect x="${num(view.x)}" y="${num(view.y)}" width="${num(view.w)}" height="${num(view.h)}" fill="${esc(background ?? "#ffffff")}"/>`,
    body,
    caption,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Greedy word wrap on an average-glyph-width estimate; the last allowed line takes whatever is left. */
export function wrapCaption(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const fits = (s: string) => textWidth(s, fontSize, 0.55) <= maxWidth;
  if (fits(text)) return [text];
  // Japanese captions have no spaces: break between glyphs instead.
  const { pieces: words, glue } = breakPieces(text);
  const lines: string[] = [];
  let cur = "";
  let k = 0; // index of the first piece not yet committed to `lines`
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = cur ? `${cur}${glue}${w}` : w;
    if (fits(next) || !cur) {
      cur = next;
      continue;
    }
    lines.push(cur);
    k = i;
    cur = w;
    if (lines.length === maxLines - 1) break;
  }
  // The last allowed line takes whatever is left, however long.
  if (lines.length === maxLines - 1) {
    const rest = words.slice(k).join(glue);
    if (rest) lines.push(rest);
  } else if (cur) lines.push(cur);
  return lines;
}

/** Sample times: every step marker plus evenly spaced fills, deduplicated and sorted. */
export function sampleTimes(tl: Timeline, samples: number): number[] {
  const dur = timelineDuration(tl);
  const ts = new Set<number>();
  for (let i = 0; i < samples; i++) ts.add(Math.round((dur * i) / Math.max(1, samples - 1)));
  for (const s of tl.steps ?? []) ts.add(Math.round(s.t));
  return [...ts].sort((a, b) => a - b);
}
