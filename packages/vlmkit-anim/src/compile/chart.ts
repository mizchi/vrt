/**
 * `chart` → a bar or line chart revealed in beats. Bars are rects anchored
 * at the baseline (a reveal is a `size` + `pos` tween from height 0), a line
 * is points plus one `line` segment per gap whose `dash` draws in. Values are
 * what the checker reads back: a bar's final height must be its value's
 * share of the axis.
 */

import { textWidth } from "../text-width.ts";
import type { ChartScene, ChartStep, ChartTarget, Timeline } from "../types.ts";
import { Builder } from "./builder.ts";

const PALETTE = ["#f59e0b", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#14b8a6"];

/** Round up to a 1-2-5 × 10^k "nice" axis top. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * base >= v) return m * base;
  return 10 * base;
}

export function compileChart(scene: ChartScene): Timeline {
  const b = new Builder(scene, { width: 640, height: 360, stepMs: 700 });
  const T = b.theme;
  const type = scene.type ?? "bar";
  const cats = scene.categories;
  const n = cats.length;
  const series = scene.series.map((s, i) => ({ ...s, color: s.color ?? PALETTE[i % PALETTE.length] }));
  const steps: ChartStep[] = scene.sequence ?? series.map((s): ChartStep => ({ reveal: s.id, caption: series.length > 1 ? `${s.label ?? s.id}` : undefined }));

  const allValues = [...series.flatMap((s) => s.values)];
  for (const st of steps) {
    if ("set" in st) allValues.push(st.set.value);
    if ("threshold" in st) allValues.push(st.threshold.value);
  }
  const yMax = scene.yMax ?? niceMax(Math.max(...allValues, 0) * 1.1);

  const left = 56;
  const right = b.width - 24;
  const top = scene.title ? 48 : 24;
  const legendH = series.length > 1 ? 22 : 0;
  const baseY = b.height - 64;
  const plotW = right - left;
  const plotH = baseY - top - legendH;
  const yOf = (v: number): number => baseY - (v / yMax) * plotH;
  const groupW = plotW / n;
  const xOfCat = (i: number): number => left + groupW * (i + 0.5);

  if (scene.title) b.node({ id: "title", shape: "text", pos: [b.width / 2, 22], text: scene.title, fontSize: T.fontSize + 4, color: T.text });
  // Axes and ticks.
  b.node({ id: "axis-y", shape: "line", points: [[left, top + legendH], [left, baseY]], stroke: T.muted });
  b.node({ id: "axis-x", shape: "line", points: [[left, baseY], [right, baseY]], stroke: T.muted });
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    b.node({ id: `tick-${k}`, shape: "text", pos: [left - 8, yOf(v)], text: Number.isInteger(v) ? String(v) : v.toFixed(1), fontSize: T.fontSize - 3, color: T.muted, anchor: "end" });
    if (k > 0) b.node({ id: `grid-${k}`, shape: "line", points: [[left, yOf(v)], [right, yOf(v)]], stroke: "#e5e7eb" });
  }
  if (scene.yLabel) b.node({ id: "axis-y-label", shape: "text", pos: [left - 8, top + legendH - 10], text: scene.yLabel, fontSize: T.fontSize - 3, color: T.muted, anchor: "end" });
  cats.forEach((c, i) => b.node({ id: `cat-${i}`, shape: "text", pos: [xOfCat(i), baseY + 16], text: c, fontSize: T.fontSize - 2, color: T.text }));
  if (series.length > 1) {
    let lx = right;
    for (const s of [...series].reverse()) {
      const text = s.label ?? s.id;
      lx -= textWidth(text, T.fontSize - 3) + 8;
      b.node({ id: `legend-${s.id}-text`, shape: "text", pos: [lx, top + 6], text, fontSize: T.fontSize - 3, color: T.text, anchor: "start" });
      lx -= 14;
      b.node({ id: `legend-${s.id}`, shape: "rect", pos: [lx + 4, top + 6], size: [10, 10], fill: s.color, stroke: s.color, rx: 2 });
      lx -= 10;
    }
  }

  const cur = new Map(series.map((s) => [s.id, [...s.values]]));
  const revealed = new Set<string>();
  const barW = Math.max(6, (groupW * 0.7) / series.length);
  const xOfBar = (si: number, i: number): number => xOfCat(i) + (si - (series.length - 1) / 2) * barW;
  const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

  series.forEach((s, si) => {
    s.values.forEach((v, i) => {
      if (type === "bar") {
        b.node({ id: `bar-${s.id}-${i}`, shape: "rect", pos: [xOfBar(si, i), baseY], size: [barW - 2, 0], fill: s.color, stroke: s.color, rx: 2 });
        b.node({ id: `val-${s.id}-${i}`, shape: "text", pos: [xOfBar(si, i), yOf(v) - 9], text: fmt(v), fontSize: T.fontSize - 3, color: T.text, halo: true, opacity: 0 });
      } else {
        b.node({ id: `pt-${s.id}-${i}`, shape: "circle", pos: [xOfCat(i), yOf(v)], r: 4, fill: s.color, stroke: s.color, opacity: 0 });
        b.node({ id: `val-${s.id}-${i}`, shape: "text", pos: [xOfCat(i), yOf(v) - 12], text: fmt(v), fontSize: T.fontSize - 3, color: T.text, halo: true, opacity: 0 });
        if (i > 0) b.node({ id: `seg-${s.id}-${i}`, shape: "line", points: [[xOfCat(i - 1), yOf(s.values[i - 1])], [xOfCat(i), yOf(v)]], stroke: s.color, strokeWidth: 2, dash: 0 });
      }
    });
  });
  let thresholds = 0;
  // Anchors: a series id (all its marks), a category (that column across series), "series/category" (one mark).
  series.forEach((s) => b.anchor(s.id, ...s.values.map((_, i) => (type === "bar" ? `bar-${s.id}-${i}` : `pt-${s.id}-${i}`))));
  cats.forEach((c, i) => {
    b.anchor(c, ...series.map((s) => (type === "bar" ? `bar-${s.id}-${i}` : `pt-${s.id}-${i}`)));
    series.forEach((s) => b.anchor(`${s.id}/${c}`, type === "bar" ? `bar-${s.id}-${i}` : `pt-${s.id}-${i}`));
  });

  const resolve = (t: ChartTarget): { sid: string; i: number }[] => {
    const sids = t.series !== undefined ? [t.series] : series.map((s) => s.id);
    const idx = t.index !== undefined ? [t.index] : t.category !== undefined ? [cats.indexOf(t.category)] : cats.map((_, i) => i);
    return sids.flatMap((sid) => idx.filter((i) => i >= 0).map((i) => ({ sid, i })));
  };
  const markIds = (sid: string, i: number): string[] => (type === "bar" ? [`bar-${sid}-${i}`] : [`pt-${sid}-${i}`, ...(i > 0 ? [`seg-${sid}-${i}`] : []), ...(i + 1 < n ? [`seg-${sid}-${i + 1}`] : [])]);
  const describe = (t: ChartTarget): string => {
    const parts: string[] = [];
    if (t.series !== undefined) parts.push(series.find((s) => s.id === t.series)?.label ?? t.series);
    if (t.category !== undefined) parts.push(t.category);
    else if (t.index !== undefined) parts.push(cats[t.index] ?? String(t.index));
    return parts.join(" · ") || "everything";
  };

  b.step(scene.title ?? "Start", "start");
  b.advance(b.stepMs * 0.5);
  for (const st of steps) {
    if (b.annotate(st, "sequence")) continue;
    const ms = st.ms ?? b.stepMs;
    const caption = "caption" in st ? st.caption : undefined;
    if ("note" in st) {
      b.step(st.note);
      b.advance(ms);
    } else if ("reveal" in st) {
      const sids = st.reveal === "all" ? series.map((s) => s.id) : Array.isArray(st.reveal) ? st.reveal : [st.reveal];
      const names = sids.map((id) => series.find((s) => s.id === id)?.label ?? id);
      b.step(caption ?? (series.length > 1 || names[0] !== undefined ? `${names.join(", ")}` : undefined));
      const t0 = b.t;
      const t1 = t0 + ms;
      for (const sid of sids) {
        const si = series.findIndex((s) => s.id === sid);
        const vals = cur.get(sid)!;
        revealed.add(sid);
        vals.forEach((v, i) => {
          if (type === "bar") {
            const h = Math.max(0, yOf(0) - yOf(v));
            b.tween(`bar-${sid}-${i}`, "size", [barW - 2, h], t0, t1, "ease-out");
            b.tween(`bar-${sid}-${i}`, "pos", [xOfBar(si, i), baseY - h / 2], t0, t1, "ease-out");
            b.tween(`val-${sid}-${i}`, "opacity", 1, t0 + ms * 0.6, t1);
          } else {
            const ta = t0 + (ms * i) / n;
            const tb = t0 + (ms * (i + 1)) / n;
            b.set(`pt-${sid}-${i}`, "opacity", 1, ta);
            b.tween(`val-${sid}-${i}`, "opacity", 1, ta, tb);
            if (i > 0) b.tween(`seg-${sid}-${i}`, "dash", 1, ta, tb, "linear");
          }
        });
      }
      b.advance(ms);
    } else if ("set" in st) {
      const { series: sid, index: i, value } = st.set;
      const si = series.findIndex((s) => s.id === sid);
      if (si < 0 || type !== "bar") continue; // validator reports both
      const old = cur.get(sid)![i];
      cur.get(sid)![i] = value;
      b.step(caption ?? `${cats[i]}${series.length > 1 ? ` (${series[si].label ?? sid})` : ""}: ${fmt(old)} → ${fmt(value)}`);
      const t0 = b.t;
      const t1 = t0 + ms;
      const h = Math.max(0, yOf(0) - yOf(value));
      b.tween(`bar-${sid}-${i}`, "size", [barW - 2, h], t0, t1);
      b.tween(`bar-${sid}-${i}`, "pos", [xOfBar(si, i), baseY - h / 2], t0, t1);
      b.tween(`val-${sid}-${i}`, "pos", [xOfBar(si, i), yOf(value) - 9], t0, t1);
      b.set(`val-${sid}-${i}`, "text", fmt(value), t0 + ms / 2);
      b.advance(ms);
    } else if ("highlight" in st) {
      const keep = new Set(resolve(st.highlight).flatMap(({ sid, i }) => markIds(sid, i)));
      b.step(caption ?? `Focus on ${describe(st.highlight)}`);
      const t0 = b.t;
      for (const s of series) {
        if (!revealed.has(s.id)) continue;
        s.values.forEach((_, i) => {
          const fade = (id: string, to: number): void => {
            if (b.valueAt(id, "opacity", t0) !== to) b.tween(id, "opacity", to, t0, t0 + Math.min(250, ms));
          };
          for (const id of markIds(s.id, i)) fade(id, keep.has(id) ? 1 : 0.25);
          fade(`val-${s.id}-${i}`, keep.has(markIds(s.id, i)[0]) ? 1 : 0.25);
        });
      }
      b.advance(ms);
    } else if ("unhighlight" in st) {
      b.step(caption);
      const t0 = b.t;
      for (const s of series) {
        if (!revealed.has(s.id)) continue;
        s.values.forEach((_, i) => {
          for (const id of [...markIds(s.id, i), `val-${s.id}-${i}`]) if (b.valueAt(id, "opacity", t0) !== 1) b.tween(id, "opacity", 1, t0, t0 + Math.min(250, ms));
        });
      }
      b.advance(ms * 0.5);
    } else if ("threshold" in st) {
      const id = `threshold-${thresholds++}`;
      const yy = yOf(st.threshold.value);
      b.node({ id, shape: "line", points: [[left, yy], [right, yy]], stroke: T.bad, strokeWidth: 1.5, dash: 0 });
      if (st.threshold.label) b.node({ id: `${id}-label`, shape: "text", pos: [right - 4, yy - 8], text: st.threshold.label, fontSize: T.fontSize - 3, color: T.bad, anchor: "end", halo: true, opacity: 0 });
      b.step(caption ?? `${st.threshold.label ?? "Threshold"}: ${fmt(st.threshold.value)}`);
      const t0 = b.t;
      b.tween(id, "dash", 1, t0, t0 + ms, "linear");
      if (st.threshold.label) b.tween(`${id}-label`, "opacity", 1, t0 + ms * 0.5, t0 + ms);
      b.advance(ms);
    }
  }
  b.step(undefined, "end");
  b.advance(b.stepMs * 0.4);
  return b.build({
    title: scene.title,
    kind: "chart",
    type,
    yMax,
    plotH,
    finalValues: Object.fromEntries(cur),
    revealed: [...revealed],
  });
}
