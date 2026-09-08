/**
 * The `<vlm-anim>` web component: SVG + Web Animations API, no dependencies,
 * ~7KB. Shipped as a source string so `renderEmbedHtml` can inline it into a
 * self-contained page and so the same bytes can be written to a `.js` file
 * for a site to load once.
 *
 * Why a string rather than a module: this package builds for Node (the
 * compiler, the validator, the headless renderer), and the runtime is the one
 * browser-only file. Typechecking it against `lib: dom` would drag DOM types
 * into everything else; bundling it separately would add a second pipeline.
 * The Playwright test in `runtime.test.ts` is where it is exercised.
 *
 * Playback model: every track becomes one paused `Element.animate()` with
 * `fill: "both"`, and a master clock assigns `currentTime` to all of them each
 * frame. That keeps scrubbing, stepping and looping trivial, keeps every
 * animation in lock-step, and lets `vlmkit check animation` seek them like any
 * other page's. Discrete `text` tracks are applied by the clock directly.
 *
 * Light DOM on purpose: tooling that walks the page (`document.getAnimations()`,
 * selectors in the vlmkit gates) sees the SVG without piercing a shadow root.
 *
 * `prefers-reduced-motion: reduce` → no autoplay; the final frame is shown and
 * the step buttons walk through the chapters without motion.
 */

import type { Timeline } from "./types.ts";

export const RUNTIME_SOURCE = String.raw`
(() => {
  if (customElements.get("vlm-anim")) return;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
    return e;
  };
  const num = (n) => Math.round(n * 100) / 100;
  const markerId = (c) => "vlm-arrow-" + String(c).replace(/[^a-zA-Z0-9]/g, "");
  const STYLE = String.raw${"`"}
    vlm-anim{display:block;font-family:system-ui,sans-serif;color:#1f2328;max-width:100%}
    vlm-anim svg{display:block;width:100%;height:auto;background:transparent}
    vlm-anim .vlm-caption{min-height:1.6em;padding:6px 8px;font-size:14px;text-align:center}
    vlm-anim .vlm-controls{display:flex;gap:6px;align-items:center;padding:4px 8px;font-size:12px}
    vlm-anim .vlm-controls button{font:inherit;padding:2px 8px;border:1px solid #9ca3af;border-radius:4px;background:#fff;cursor:pointer}
    vlm-anim .vlm-controls input[type=range]{flex:1}
    vlm-anim .vlm-step{min-width:4em;text-align:right;color:#6b7280}
  ${"`"};

  class VlmAnim extends HTMLElement {
    static get observedAttributes() { return ["src"]; }
    constructor() {
      super();
      this._tl = null; this._anims = []; this._textTracks = []; this._time = 0; this._playing = false;
      this._raf = 0; this._last = 0; this._stepIndex = -1; this._built = false;
    }
    get ir() { return this._tl; }
    set ir(tl) { this._tl = tl; if (this.isConnected) this._build(); }
    get time() { return this._time; }
    get duration() { return this._tl ? (this._tl.duration ?? this._computeDuration()) : 0; }
    get playing() { return this._playing; }
    get stepIndex() { return this._stepIndex; }
    connectedCallback() {
      if (this._tl) { this._build(); return; }
      // While the parser is still streaming the document, connectedCallback runs
      // before this element's children exist, so an inline <script> is not yet
      // there to read. Wait for the parse to finish, then look again.
      if (document.readyState === "loading" && !this.getAttribute("src")) {
        document.addEventListener("DOMContentLoaded", () => this.connectedCallback(), { once: true });
        return;
      }
      const inline = this.querySelector('script[type="application/json"]');
      if (inline) { try { this._tl = JSON.parse(inline.textContent); } catch (e) { this._error("invalid JSON in <script type=application/json>: " + e.message); return; } this._build(); return; }
      const src = this.getAttribute("src");
      if (src) fetch(src).then((r) => r.json()).then((tl) => { this._tl = tl; this._build(); }).catch((e) => this._error("failed to load " + src + ": " + e.message));
    }
    attributeChangedCallback(name, _old, value) { if (name === "src" && value && this._built) this.connectedCallback(); }
    disconnectedCallback() { this.pause(); }
    _error(msg) { this.textContent = ""; const p = document.createElement("p"); p.style.color = "#b91c1c"; p.textContent = "vlm-anim: " + msg; this.appendChild(p); }
    _computeDuration() {
      let end = 0;
      for (const tr of this._tl.tracks) for (const k of tr.keyframes) end = Math.max(end, k.t);
      for (const s of this._tl.steps || []) end = Math.max(end, s.t);
      return end;
    }
    _build() {
      const tl = this._tl; if (!tl) return;
      this.pause();
      for (const a of this._anims) a.cancel();
      this._anims = []; this._textTracks = []; this._built = true;
      this.textContent = "";
      if (!document.getElementById("vlm-anim-style")) { const s = document.createElement("style"); s.id = "vlm-anim-style"; s.textContent = STYLE; document.head.appendChild(s); }
      const { width, height, background } = tl.canvas;
      const svg = el("svg", { viewBox: "0 0 " + width + " " + height, width, height, role: "img", "aria-label": (tl.meta && tl.meta.title) || "animation" });
      svg.style.maxWidth = width + "px";
      const defs = el("defs"); svg.appendChild(defs);
      svg.appendChild(el("rect", { width, height, fill: background || "#fff", "data-background": "true" }));
      const groups = new Map(); const shapes = new Map(); const texts = new Map(); const lengths = new Map();
      const ensureMarker = (color, hollow) => {
        const id = markerId(color) + (hollow ? "-hollow" : "");
        if (defs.querySelector("#" + id)) return id;
        if (hollow) {
          const m = el("marker", { id, viewBox: "0 0 12 12", refX: 10, refY: 6, markerWidth: 10, markerHeight: 10, orient: "auto-start-reverse" });
          m.appendChild(el("path", { d: "M 1 1 L 11 6 L 1 11 z", fill: background || "#fff", stroke: color, "stroke-width": 1.2 })); defs.appendChild(m); return id;
        }
        const m = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" });
        m.appendChild(el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color })); defs.appendChild(m); return id;
      };
      for (const n of tl.nodes) {
        const g = el("g", { id: n.id, "data-shape": n.shape });
        const pos = n.pos || [0, 0];
        g.style.translate = num(pos[0]) + "px " + num(pos[1]) + "px";
        if (n.rotate) g.style.rotate = n.rotate + "deg";
        if (n.scale !== undefined && n.scale !== 1) g.style.scale = String(n.scale);
        if (n.opacity !== undefined && n.opacity !== 1) g.style.opacity = String(n.opacity);
        const stroke = n.stroke || "#333", fill = n.fill || "#fff", sw = n.strokeWidth || 1.5;
        let shape = null;
        switch (n.shape) {
          case "rect": { const [w, h] = n.size || [80, 40]; shape = el("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: n.rx }); break; }
          case "ellipse": { const [w, h] = n.size || [80, 40]; shape = el("ellipse", { rx: w / 2, ry: h / 2 }); break; }
          case "circle": shape = el("circle", { r: n.r ?? 20 }); break;
          case "line": case "arrow": {
            const [[x1, y1], [x2, y2]] = n.points || [[0, 0], [0, 0]];
            shape = el("line", { x1, y1, x2, y2 }); lengths.set(n.id, Math.hypot(x2 - x1, y2 - y1));
            if (n.shape === "arrow") shape.setAttribute("marker-end", "url(#" + ensureMarker(stroke, n.head === "hollow") + ")");
            break;
          }
          case "path": shape = el("path", { d: n.d || "" }); if (n.head) shape.setAttribute("marker-end", "url(#" + ensureMarker(stroke, n.head === "hollow") + ")"); break;
        }
        if (shape) {
          const isStroke = n.shape === "line" || n.shape === "arrow" || n.shape === "path";
          shape.style.fill = isStroke ? (n.fill || "none") : fill; shape.style.stroke = stroke; shape.style.strokeWidth = sw;
          if (n.dashed && (n.dash === undefined || n.dash >= 1)) shape.style.strokeDasharray = "6 4";
          g.appendChild(shape); shapes.set(n.id, shape);
          if (n.shape === "path") lengths.set(n.id, shape.getTotalLength ? 0 : 0);
        }
        if (n.text !== undefined) {
          const size = n.fontSize || 14;
          const t = el("text", { "font-size": size, "text-anchor": n.shape === "text" ? (n.anchor || "middle") : "middle", "dominant-baseline": "central" });
          t.style.fill = n.color || "#1f2328";
          if (n.halo) { t.style.stroke = (tl.canvas && tl.canvas.background) || "#ffffff"; t.style.strokeWidth = "3px"; t.style.strokeLinejoin = "round"; t.style.paintOrder = "stroke"; }
          const lines = String(n.text).split("\n"); const y0 = -((lines.length - 1) * size * 1.2) / 2;
          lines.forEach((line, i) => { const ts = el("tspan", { x: 0, y: num(y0 + i * size * 1.2) }); ts.textContent = line; t.appendChild(ts); });
          g.appendChild(t); texts.set(n.id, t);
        }
        groups.set(n.id, g);
        const parent = n.parent && groups.get(n.parent);
        (parent || svg).appendChild(g);
      }
      this.appendChild(svg); this._svg = svg;
      // Path lengths need layout; dash on paths uses the measured length.
      for (const n of tl.nodes) if (n.shape === "path") { const s = shapes.get(n.id); try { lengths.set(n.id, s.getTotalLength()); } catch { lengths.set(n.id, 100); } }
      for (const n of tl.nodes) if (n.dash !== undefined && n.dash < 1 && lengths.has(n.id)) { const L = lengths.get(n.id); const s = shapes.get(n.id); s.style.strokeDasharray = L; s.style.strokeDashoffset = L * (1 - n.dash); }
      const total = Math.max(1, this.duration);
      const setText = (id, value) => { const t = texts.get(id); if (!t) return; const lines = String(value).split("\n"); const size = Number(t.getAttribute("font-size")) || 14; const y0 = -((lines.length - 1) * size * 1.2) / 2; t.textContent = ""; lines.forEach((line, i) => { const ts = el("tspan", { x: 0, y: num(y0 + i * size * 1.2) }); ts.textContent = line; t.appendChild(ts); }); };
      for (const tr of tl.tracks) {
        const g = groups.get(tr.target); if (!g) continue;
        const node = tl.nodes.find((x) => x.id === tr.target);
        if (tr.prop === "text") { this._textTracks.push({ id: tr.target, keyframes: tr.keyframes, set: setText }); continue; }
        let target = g, css = null, conv = (v) => v;
        switch (tr.prop) {
          case "pos": css = "translate"; conv = (v) => num(v[0]) + "px " + num(v[1]) + "px"; break;
          case "opacity": css = "opacity"; break;
          case "scale": css = "scale"; conv = (v) => String(v); break;
          case "rotate": css = "rotate"; conv = (v) => v + "deg"; break;
          case "fill": target = shapes.get(tr.target); css = "fill"; break;
          case "stroke": target = shapes.get(tr.target); css = "stroke"; break;
          case "color": target = texts.get(tr.target); css = "fill"; break;
          case "r": target = shapes.get(tr.target); css = "r"; conv = (v) => v + "px"; break;
          case "dash": { target = shapes.get(tr.target); const L = lengths.get(tr.target) || 100; if (target) target.style.strokeDasharray = L; css = "strokeDashoffset"; conv = (v) => (L * (1 - v)) + "px"; break; }
          case "size": {
            target = shapes.get(tr.target); if (!target) break;
            if (node.shape === "ellipse") { this._anims.push(...this._geom(target, tr, total, [["rx", (v) => v[0] / 2 + "px"], ["ry", (v) => v[1] / 2 + "px"]])); }
            else { this._anims.push(...this._geom(target, tr, total, [["width", (v) => v[0] + "px"], ["height", (v) => v[1] + "px"], ["x", (v) => -v[0] / 2 + "px"], ["y", (v) => -v[1] / 2 + "px"]])); }
            target = null; break;
          }
        }
        if (!target || !css) continue;
        this._anims.push(this._animate(target, css, tr.keyframes, total, conv));
      }
      this._time = 0; this._stepIndex = -1;
      this._caption = document.createElement("div"); this._caption.className = "vlm-caption"; this._caption.setAttribute("aria-live", "polite"); this.appendChild(this._caption);
      if (!this.hasAttribute("nocontrols")) this._buildControls();
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.seek(reduced ? this.duration : 0);
      if (this.hasAttribute("autoplay") && !reduced) this.play();
    }
    _geom(target, tr, total, props) { return props.map(([css, conv]) => this._animate(target, css, tr.keyframes, total, conv)); }
    _animate(target, css, keyframes, total, conv) {
      // IR: a keyframe's easing applies INTO it. WAAPI: a keyframe's easing applies OUT of it. Shift by one.
      const kfs = keyframes.map((k, i) => { const o = {}; o[css] = conv(k.value); o.offset = Math.min(1, Math.max(0, k.t / total)); o.easing = (keyframes[i + 1] && keyframes[i + 1].easing) || "ease-in-out"; return o; });
      if (kfs.length === 1) { kfs.push({ ...kfs[0], offset: 1 }); kfs[0].offset = 0; }
      // fill: both holds the first/last value outside the keyframe span. Duplicate endpoints at 0 and 1 for browsers that need it.
      if (kfs[0].offset > 0) kfs.unshift({ ...kfs[0], offset: 0 });
      if (kfs[kfs.length - 1].offset < 1) kfs.push({ ...kfs[kfs.length - 1], offset: 1 });
      const a = target.animate(kfs, { duration: total, fill: "both", easing: "linear" });
      a.pause(); a.currentTime = 0; return a;
    }
    _buildControls() {
      const c = document.createElement("div"); c.className = "vlm-controls";
      const btn = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.addEventListener("click", fn); c.appendChild(b); return b; };
      btn("⏮", "Restart", () => { this.seek(0); });
      btn("◀", "Previous step", () => this.prev());
      this._playBtn = btn("▶", "Play / pause", () => (this._playing ? this.pause() : this.play()));
      btn("▶|", "Next step", () => this.next());
      const range = document.createElement("input"); range.type = "range"; range.min = "0"; range.max = String(this.duration); range.step = "1"; range.value = "0"; range.setAttribute("aria-label", "time");
      range.addEventListener("input", () => { this.pause(); this.seek(Number(range.value)); }); c.appendChild(range); this._range = range;
      const s = document.createElement("span"); s.className = "vlm-step"; c.appendChild(s); this._stepEl = s;
      this.appendChild(c);
    }
    _apply() {
      const t = this._time;
      for (const a of this._anims) a.currentTime = t;
      for (const tt of this._textTracks) { let v = tt.keyframes[0].value; for (const k of tt.keyframes) if (k.t <= t) v = k.value; tt.set(tt.id, v); }
      const steps = this._tl.steps || []; let idx = -1; let caption = "";
      for (let i = 0; i < steps.length; i++) if (steps[i].t <= t + 1e-6) { idx = i; if (steps[i].caption) caption = steps[i].caption; }
      if (idx !== this._stepIndex) { this._stepIndex = idx; this.dispatchEvent(new CustomEvent("step", { detail: { index: idx, step: steps[idx] || null, time: t } })); }
      // A step without a caption keeps the previous caption showing.
      if (this._caption) this._caption.textContent = caption;
      if (this._range) this._range.value = String(Math.round(t));
      if (this._stepEl) this._stepEl.textContent = steps.length ? (idx + 1) + " / " + steps.length : Math.round(t) + "ms";
      this.setAttribute("data-time", String(Math.round(t)));
    }
    seek(ms) { this._time = Math.min(this.duration, Math.max(0, ms)); this._apply(); }
    play() {
      if (this._playing || !this._tl) return;
      if (this._time >= this.duration) this._time = 0;
      this._playing = true; this.setAttribute("data-playing", "true"); if (this._playBtn) this._playBtn.textContent = "❚❚";
      const speed = Number(this.getAttribute("speed")) || 1;
      this._last = performance.now();
      const tick = (now) => {
        if (!this._playing) return;
        this._time += (now - this._last) * speed; this._last = now;
        if (this._time >= this.duration) {
          if (this.hasAttribute("loop")) { this._time = 0; }
          else { this._time = this.duration; this._apply(); this.pause(); this.dispatchEvent(new CustomEvent("ended")); return; }
        }
        this._apply(); this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
    pause() { this._playing = false; this.removeAttribute("data-playing"); if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; if (this._playBtn) this._playBtn.textContent = "▶"; }
    next() { const steps = this._tl.steps || []; this.pause(); const n = steps.find((s) => s.t > this._time + 1e-6); this.seek(n ? n.t : this.duration); }
    prev() { const steps = this._tl.steps || []; this.pause(); let p = null; for (const s of steps) if (s.t < this._time - 1e-6) p = s; this.seek(p ? p.t : 0); }
  }
  customElements.define("vlm-anim", VlmAnim);
})();
`;

export interface EmbedOptions {
  title?: string;
  autoplay?: boolean;
  loop?: boolean;
  controls?: boolean;
  /** Extra body HTML placed under the element, e.g. an explanation. */
  after?: string;
}

/** A self-contained HTML page: the runtime inline, the timeline inline. */
export function renderEmbedHtml(tl: Timeline, opts: EmbedOptions = {}): string {
  const title = opts.title ?? tl.meta?.title ?? "vlm-anim";
  const json = JSON.stringify(tl).replace(/<\//g, "<\\/");
  const attrs = [opts.autoplay !== false ? "autoplay" : "", opts.loop ? "loop" : "", opts.controls === false ? "nocontrols" : ""].filter(Boolean).join(" ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; padding: 24px; background: #f6f8fa; font-family: system-ui, sans-serif; color: #1f2328; }
  main { max-width: ${tl.canvas.width + 2}px; margin: 0 auto; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; }
  @media (prefers-reduced-motion: reduce) { * { animation-play-state: paused !important; } }
</style>
<script>${RUNTIME_SOURCE}</script>
</head>
<body>
<main>
<vlm-anim ${attrs}><script type="application/json">${json}</script></vlm-anim>
</main>
${opts.after ?? ""}
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
