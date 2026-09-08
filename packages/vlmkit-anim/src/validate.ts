/**
 * Field-by-field validation of both IR layers, phrased for the writer to
 * repair from.
 *
 * Every diagnostic carries a JSON path, one sentence saying what is wrong,
 * and — whenever the validator can tell — a `hint` with the fix: the closest
 * accepted spelling for an unknown key or enum value, the list of ids that DO
 * exist for a dangling reference, the shape a value should have. The
 * validation loop an agent runs is "read the hints, edit, re-run", so a
 * message that only says "invalid" costs a round.
 *
 * No JSON Schema library: the schemas are small, and hand-written checks can
 * say "did you mean `rect`?" where a generic validator says "not one of enum".
 */

import {
  ANNOTATION_ACTIONS,
  EDGE_STYLES,
  TONES,
  NAMED_EASINGS,
  SCENE_FORMAT,
  SCENE_KINDS,
  SHAPES,
  TIMELINE_FORMAT,
  TRACK_PROPS,
  type Diagnostic,
  type Scene,
  type Timeline,
  FLOW_SHAPES,
} from "./types.ts";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isVec2 = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(isNum);

/** Levenshtein distance, for "did you mean". */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

export function closest(word: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(word.toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  // Accept a suggestion when it is plausibly a typo, or when one spelling is a
  // prefix of the other ("rectangle" → "rect", "position" → "pos"): the writer
  // knew the concept and guessed a longer or shorter name for it.
  if (best === undefined) return undefined;
  if (bestD <= Math.max(2, Math.floor(word.length / 2))) return best;
  const w = word.toLowerCase();
  const prefixed = candidates.find((c) => {
    const cl = c.toLowerCase();
    return cl.length >= 3 && w.length >= 3 && (w.startsWith(cl) || cl.startsWith(w));
  });
  return prefixed;
}

const list = (xs: readonly string[]): string => xs.map((x) => `"${x}"`).join(", ");

class Ctx {
  readonly diags: Diagnostic[] = [];
  error(path: string, message: string, hint?: string): void {
    this.diags.push({ severity: "error", path, message, ...(hint ? { hint } : {}) });
  }
  warn(path: string, message: string, hint?: string): void {
    this.diags.push({ severity: "warn", path, message, ...(hint ? { hint } : {}) });
  }

  /** Flag keys the schema does not know, suggesting the nearest known one. */
  keys(obj: Obj, path: string, known: readonly string[]): void {
    for (const k of Object.keys(obj)) {
      if (known.includes(k)) continue;
      const near = closest(k, known);
      this.error(
        path ? `${path}.${k}` : k,
        `unknown key "${k}"`,
        near ? `did you mean "${near}"? accepted keys: ${list(known)}` : `accepted keys: ${list(known)}`,
      );
    }
  }

  enumOf(v: unknown, path: string, options: readonly string[], what = "value"): boolean {
    if (isStr(v) && options.includes(v)) return true;
    const near = isStr(v) ? closest(v, options) : undefined;
    this.error(
      path,
      `${what} ${JSON.stringify(v)} is not one of ${list(options)}`,
      near ? `did you mean "${near}"?` : undefined,
    );
    return false;
  }

  number(v: unknown, path: string, opts: { min?: number; integer?: boolean } = {}): v is number {
    if (!isNum(v)) {
      this.error(path, `expected a number, got ${describe(v)}`);
      return false;
    }
    if (opts.integer && !Number.isInteger(v)) {
      this.error(path, `expected an integer, got ${v}`);
      return false;
    }
    if (opts.min !== undefined && v < opts.min) {
      this.error(path, `expected a number >= ${opts.min}, got ${v}`);
      return false;
    }
    return true;
  }

  string(v: unknown, path: string): v is string {
    if (isStr(v) && v.length > 0) return true;
    this.error(path, `expected a non-empty string, got ${describe(v)}`);
    return false;
  }

  vec2(v: unknown, path: string): v is [number, number] {
    if (isVec2(v)) return true;
    this.error(path, `expected [x, y] (two numbers), got ${describe(v)}`);
    return false;
  }

  array(v: unknown, path: string, opts: { minLength?: number } = {}): v is unknown[] {
    if (!Array.isArray(v)) {
      this.error(path, `expected an array, got ${describe(v)}`);
      return false;
    }
    if (opts.minLength !== undefined && v.length < opts.minLength) {
      this.error(path, `expected at least ${opts.minLength} item(s), got ${v.length}`);
      return false;
    }
    return true;
  }

  object(v: unknown, path: string): v is Obj {
    if (isObj(v)) return true;
    this.error(path, `expected an object, got ${describe(v)}`);
    return false;
  }

  ref(id: unknown, path: string, ids: readonly string[], what: string): boolean {
    if (!isStr(id)) {
      this.error(path, `expected a ${what} id (string), got ${describe(id)}`);
      return false;
    }
    if (ids.includes(id)) return true;
    const near = closest(id, ids);
    this.error(
      path,
      `unknown ${what} "${id}"`,
      near ? `did you mean "${near}"? known ${what}s: ${list(ids)}` : `known ${what}s: ${list(ids)}`,
    );
    return false;
  }
}

function describe(v: unknown): string {
  if (v === undefined) return "nothing (missing)";
  if (v === null) return "null";
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === "object") return "an object";
  if (typeof v === "string") return `the string ${JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v)}`;
  return `${typeof v} ${String(v)}`;
}

function easing(ctx: Ctx, v: unknown, path: string): void {
  if (v === undefined) return;
  if (isStr(v) && (NAMED_EASINGS as readonly string[]).includes(v)) return;
  if (isStr(v) && /^cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(v)) return;
  const near = isStr(v) ? closest(v, NAMED_EASINGS) : undefined;
  ctx.error(
    path,
    `easing ${JSON.stringify(v)} is not one of ${list(NAMED_EASINGS)} or cubic-bezier(a,b,c,d)`,
    near ? `did you mean "${near}"?` : undefined,
  );
}

function ids(ctx: Ctx, items: unknown[], path: string, key = "id"): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  items.forEach((item, i) => {
    const id = isObj(item) ? item[key] : isStr(item) ? item : undefined;
    if (!isStr(id) || id.length === 0) {
      ctx.error(`${path}[${i}].${key}`, `every item needs a non-empty string "${key}"`);
      return;
    }
    if (seen.has(id)) ctx.error(`${path}[${i}].${key}`, `duplicate ${key} "${id}"`, "ids must be unique");
    seen.add(id);
    out.push(id);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Timeline (layer 2)
// ---------------------------------------------------------------------------

const NODE_KEYS = [
  "id", "shape", "pos", "size", "r", "rx", "points", "d", "head", "text", "fontSize", "anchor", "fill", "stroke",
  "strokeWidth", "opacity", "dash", "dashed", "halo", "scale", "rotate", "parent", "color",
] as const;

export function validateTimelineNode(ctx: Ctx, node: unknown, path: string): void {
  if (!ctx.object(node, path)) return;
  ctx.keys(node, path, NODE_KEYS);
  ctx.string(node.id, `${path}.id`);
  if (!ctx.enumOf(node.shape, `${path}.shape`, SHAPES, "shape")) return;
  const shape = node.shape as string;
  if (node.pos !== undefined) ctx.vec2(node.pos, `${path}.pos`);
  if (node.size !== undefined) ctx.vec2(node.size, `${path}.size`);
  if (node.points !== undefined) {
    if (!Array.isArray(node.points) || node.points.length !== 2 || !node.points.every(isVec2)) {
      ctx.error(`${path}.points`, `expected [[x1, y1], [x2, y2]], got ${describe(node.points)}`);
    }
  }
  for (const k of ["r", "rx", "fontSize", "strokeWidth", "scale", "rotate"] as const) {
    if (node[k] !== undefined) ctx.number(node[k], `${path}.${k}`);
  }
  for (const k of ["opacity", "dash"] as const) {
    if (node[k] !== undefined && ctx.number(node[k], `${path}.${k}`) && ((node[k] as number) < 0 || (node[k] as number) > 1)) {
      ctx.error(`${path}.${k}`, `${k} must be within 0..1, got ${node[k]}`);
    }
  }
  if (node.anchor !== undefined) ctx.enumOf(node.anchor, `${path}.anchor`, ["start", "middle", "end"], "anchor");
  for (const k of ["text", "fill", "stroke", "color", "d", "parent"] as const) {
    if (node[k] !== undefined && !isStr(node[k])) ctx.error(`${path}.${k}`, `expected a string, got ${describe(node[k])}`);
  }
  // Shape-specific requirements, phrased as what to add.
  if (shape === "rect" || shape === "ellipse") {
    if (node.size === undefined) ctx.error(`${path}.size`, `${shape} needs "size": [width, height]`);
  } else if (shape === "circle") {
    if (node.r === undefined) ctx.error(`${path}.r`, `circle needs "r": radius`);
  } else if (shape === "text") {
    if (node.text === undefined) ctx.error(`${path}.text`, `text needs "text": "…"`);
  } else if (shape === "line" || shape === "arrow") {
    if (node.points === undefined) ctx.error(`${path}.points`, `${shape} needs "points": [[x1, y1], [x2, y2]]`);
  } else if (shape === "path") {
    if (node.d === undefined) ctx.error(`${path}.d`, `path needs "d": "M … "`);
  }
}

function trackValue(ctx: Ctx, prop: string, value: unknown, path: string): void {
  switch (prop) {
    case "pos":
    case "size":
      ctx.vec2(value, path);
      return;
    case "r":
    case "scale":
    case "rotate":
      ctx.number(value, path);
      return;
    case "opacity":
    case "dash":
      if (ctx.number(value, path) && (value < 0 || value > 1)) ctx.error(path, `${prop} must be within 0..1, got ${value}`);
      return;
    case "fill":
    case "stroke":
    case "color":
    case "text":
      if (!isStr(value)) ctx.error(path, `${prop} takes a string, got ${describe(value)}`);
      return;
  }
}

export function validateTimeline(doc: unknown): Diagnostic[] {
  const ctx = new Ctx();
  if (!ctx.object(doc, "")) return ctx.diags;
  ctx.keys(doc, "", ["format", "canvas", "duration", "nodes", "tracks", "steps", "meta"]);
  if (doc.format !== TIMELINE_FORMAT) {
    ctx.error("format", `expected "${TIMELINE_FORMAT}", got ${describe(doc.format)}`, `set "format": "${TIMELINE_FORMAT}"`);
  }
  if (ctx.object(doc.canvas, "canvas")) {
    ctx.keys(doc.canvas, "canvas", ["width", "height", "background"]);
    ctx.number(doc.canvas.width, "canvas.width", { min: 1 });
    ctx.number(doc.canvas.height, "canvas.height", { min: 1 });
  }
  if (doc.duration !== undefined) ctx.number(doc.duration, "duration", { min: 0 });

  let nodeIds: string[] = [];
  if (ctx.array(doc.nodes, "nodes")) {
    nodeIds = ids(ctx, doc.nodes, "nodes");
    doc.nodes.forEach((n, i) => validateTimelineNode(ctx, n, `nodes[${i}]`));
    doc.nodes.forEach((n, i) => {
      if (isObj(n) && n.parent !== undefined) ctx.ref(n.parent, `nodes[${i}].parent`, nodeIds, "node");
    });
  }

  let lastT = 0;
  if (ctx.array(doc.tracks, "tracks")) {
    doc.tracks.forEach((tr, i) => {
      const path = `tracks[${i}]`;
      if (!ctx.object(tr, path)) return;
      ctx.keys(tr, path, ["target", "prop", "keyframes"]);
      ctx.ref(tr.target, `${path}.target`, nodeIds, "node");
      const propOk = ctx.enumOf(tr.prop, `${path}.prop`, TRACK_PROPS, "prop");
      if (!ctx.array(tr.keyframes, `${path}.keyframes`, { minLength: 1 })) return;
      let prev = -Infinity;
      tr.keyframes.forEach((kf, j) => {
        const kp = `${path}.keyframes[${j}]`;
        if (!ctx.object(kf, kp)) return;
        ctx.keys(kf, kp, ["t", "value", "easing"]);
        if (ctx.number(kf.t, `${kp}.t`, { min: 0 })) {
          if (kf.t < prev) ctx.error(`${kp}.t`, `keyframes must be in ascending time order (${kf.t} after ${prev})`);
          prev = kf.t;
          lastT = Math.max(lastT, kf.t);
        }
        if (propOk) trackValue(ctx, tr.prop as string, kf.value, `${kp}.value`);
        easing(ctx, kf.easing, `${kp}.easing`);
      });
    });
  }

  if (doc.steps !== undefined && ctx.array(doc.steps, "steps")) {
    doc.steps.forEach((s, i) => {
      const path = `steps[${i}]`;
      if (!ctx.object(s, path)) return;
      ctx.keys(s, path, ["t", "label", "caption"]);
      if (ctx.number(s.t, `${path}.t`, { min: 0 })) lastT = Math.max(lastT, s.t);
    });
  }
  if (isNum(doc.duration) && doc.duration < lastT) {
    ctx.error("duration", `duration ${doc.duration} is shorter than the last keyframe/step at ${lastT}`, "raise duration or drop it to have it computed");
  }
  return ctx.diags;
}

// ---------------------------------------------------------------------------
// Scene (layer 1)
// ---------------------------------------------------------------------------

const BASE_KEYS = ["format", "kind", "title", "stepMs", "canvas", "theme"] as const;

function validateBase(ctx: Ctx, doc: Obj, extra: readonly string[]): void {
  ctx.keys(doc, "", [...BASE_KEYS, ...extra]);
  if (doc.stepMs !== undefined) ctx.number(doc.stepMs, "stepMs", { min: 1 });
  if (doc.canvas !== undefined && ctx.object(doc.canvas, "canvas")) {
    ctx.keys(doc.canvas, "canvas", ["width", "height", "background"]);
    if (doc.canvas.width !== undefined) ctx.number(doc.canvas.width, "canvas.width", { min: 1 });
    if (doc.canvas.height !== undefined) ctx.number(doc.canvas.height, "canvas.height", { min: 1 });
  }
  if (doc.theme !== undefined && ctx.object(doc.theme, "theme")) {
    ctx.keys(doc.theme, "theme", ["node", "nodeStroke", "text", "accent", "muted", "ok", "bad", "background", "fontSize"]);
  }
}

function captionAndMs(ctx: Ctx, step: Obj, path: string): void {
  if (step.caption !== undefined && !isStr(step.caption)) ctx.error(`${path}.caption`, `caption must be a string`);
  if (step.ms !== undefined) ctx.number(step.ms, `${path}.ms`, { min: 0 });
}

function idOrIds(ctx: Ctx, v: unknown, path: string, known: string[], what: string): void {
  const arr = Array.isArray(v) ? v : [v];
  arr.forEach((id, i) => ctx.ref(id, Array.isArray(v) ? `${path}[${i}]` : path, known, what));
}

/**
 * `modules`: its own vocabulary (modules / deps / groups) checked here with its own paths, then the
 * normalised diagram's sequence checked by the diagram rules — the steps are the diagram's steps.
 */
function validateModules(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["modules", "deps", "groups", "layout", "sequence"]);
  if (doc.layout !== undefined) ctx.enumOf(doc.layout, "layout", ["tb", "lr"], "layout");
  const before = ctx.diags.length;
  const moduleIds: string[] = [];
  if (ctx.array(doc.modules, "modules", { minLength: 1 })) {
    doc.modules.forEach((m, i) => {
      const path = `modules[${i}]`;
      const id = isStr(m) ? m : ctx.object(m, path) ? m.id : undefined;
      if (!isStr(m) && ctx.object(m, path)) {
        ctx.keys(m, path, ["id", "label", "tone", "hidden"]);
        if (!isStr(m.id)) ctx.error(`${path}.id`, `a module needs a string "id"`, `"${path}": "cache" or {"id": "cache", "label": "Cache"}`);
        if (m.tone !== undefined) ctx.enumOf(m.tone, `${path}.tone`, TONES, "tone");
      }
      if (isStr(id)) {
        if (moduleIds.includes(id)) ctx.error(path, `duplicate module id "${id}"`);
        else moduleIds.push(id);
      }
    });
  }
  if (doc.deps !== undefined && ctx.array(doc.deps, "deps")) {
    doc.deps.forEach((d, i) => {
      const path = `deps[${i}]`;
      if (Array.isArray(d)) {
        if (d.length !== 2) ctx.error(path, `a dependency is ["a", "b"] (a depends on b), got ${d.length} item(s)`);
        else {
          ctx.ref(d[0], `${path}[0]`, moduleIds, "module");
          ctx.ref(d[1], `${path}[1]`, moduleIds, "module");
        }
      } else if (ctx.object(d, path)) {
        ctx.keys(d, path, ["from", "to", "label", "style", "tone", "hidden"]);
        ctx.ref(d.from, `${path}.from`, moduleIds, "module");
        ctx.ref(d.to, `${path}.to`, moduleIds, "module");
        if (d.style !== undefined) ctx.enumOf(d.style, `${path}.style`, EDGE_STYLES, "style");
        if (d.tone !== undefined) ctx.enumOf(d.tone, `${path}.tone`, TONES, "tone");
      }
    });
  }
  if (doc.groups !== undefined && ctx.array(doc.groups, "groups")) {
    const owner = new Map<string, string>();
    const groupIds: string[] = [];
    doc.groups.forEach((g, i) => {
      const path = `groups[${i}]`;
      if (!ctx.object(g, path)) return;
      ctx.keys(g, path, ["id", "label", "modules"]);
      if (!isStr(g.id)) ctx.error(`${path}.id`, `a group needs a string "id"`);
      else if (moduleIds.includes(g.id) || groupIds.includes(g.id)) ctx.error(`${path}.id`, `"${g.id}" is already a module or group id`);
      else groupIds.push(g.id);
      if (ctx.array(g.modules, `${path}.modules`, { minLength: 1 })) {
        g.modules.forEach((m, k) => {
          if (!ctx.ref(m, `${path}.modules[${k}]`, moduleIds, "module")) return;
          const prev = owner.get(m as string);
          if (prev && prev !== g.id) ctx.error(`${path}.modules[${k}]`, `"${m as string}" is already in group "${prev}"`, "a module belongs to at most one group");
          else owner.set(m as string, String(g.id));
        });
      }
    });
  }
  // The sequence follows the diagram's rules over the normalised shape; only when the shape itself is sound,
  // so a bad dep is reported once, as deps[i], not again as edges[i].
  if (ctx.diags.length === before && doc.sequence !== undefined) {
    const nodes = (doc.modules as unknown[]).map((m) => (isStr(m) ? { id: m } : { id: (m as { id: string }).id, hidden: (m as { hidden?: boolean }).hidden }));
    const edges = ((doc.deps as unknown[] | undefined) ?? []).map((d) => (Array.isArray(d) ? { from: d[0], to: d[1] } : { from: (d as { from: string }).from, to: (d as { to: string }).to, style: (d as { style?: string }).style }));
    const groups = ((doc.groups as unknown[] | undefined) ?? []).map((g) => ({ id: (g as { id: string }).id, nodes: (g as { modules: string[] }).modules }));
    validateDiagram(ctx, { format: doc.format, kind: "diagram", nodes, edges, groups, sequence: doc.sequence } as Obj);
  }
}

function validateDiagram(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["nodes", "edges", "groups", "layout", "sequence"]);
  if (doc.layout !== undefined) ctx.enumOf(doc.layout, "layout", ["lr", "tb", "grid", "circle"], "layout");
  let nodeIds: string[] = [];
  if (ctx.array(doc.nodes, "nodes", { minLength: 1 })) {
    nodeIds = ids(ctx, doc.nodes, "nodes");
    doc.nodes.forEach((n, i) => {
      const path = `nodes[${i}]`;
      if (!ctx.object(n, path)) return;
      ctx.keys(n, path, ["id", "label", "shape", "pos", "fill", "tone", "hidden"]);
      if (n.shape !== undefined) ctx.enumOf(n.shape, `${path}.shape`, ["rect", "circle", "ellipse"], "shape");
      if (n.tone !== undefined) ctx.enumOf(n.tone, `${path}.tone`, TONES, "tone");
      if (n.pos !== undefined) ctx.vec2(n.pos, `${path}.pos`);
    });
  }
  const groupIds: string[] = [];
  if (doc.groups !== undefined && ctx.array(doc.groups, "groups")) {
    doc.groups.forEach((g, i) => {
      const path = `groups[${i}]`;
      if (!ctx.object(g, path)) return;
      ctx.keys(g, path, ["id", "label", "nodes"]);
      if (!isStr(g.id)) ctx.error(`${path}.id`, `a group needs a string "id"`);
      else if (nodeIds.includes(g.id) || groupIds.includes(g.id)) ctx.error(`${path}.id`, `"${g.id}" is already a node or group id`);
      else groupIds.push(g.id);
      if (ctx.array(g.nodes, `${path}.nodes`, { minLength: 1 })) g.nodes.forEach((n, k) => ctx.ref(n, `${path}.nodes[${k}]`, nodeIds, "node"));
    });
  }
  // Steps may name a group where they name a node: show / hide / highlight its container.
  const targetIds = [...nodeIds, ...groupIds];
  const edgeKeys: string[] = [];
  if (doc.edges !== undefined && ctx.array(doc.edges, "edges")) {
    doc.edges.forEach((e, i) => {
      const path = `edges[${i}]`;
      if (!ctx.object(e, path)) return;
      ctx.keys(e, path, ["from", "to", "label", "style", "tone", "hidden"]);
      if (e.tone !== undefined) ctx.enumOf(e.tone, `${path}.tone`, TONES, "tone");
      const a = ctx.ref(e.from, `${path}.from`, nodeIds, "node");
      const b = ctx.ref(e.to, `${path}.to`, nodeIds, "node");
      if (a && b) edgeKeys.push(`${e.from as string}->${e.to as string}`);
      if (e.style !== undefined) ctx.enumOf(e.style, `${path}.style`, EDGE_STYLES, "style");
    });
  }
  // `highlight` lights up a node, a container or an edge ("a->b"); show / hide take nodes and containers.
  const highlightIds = [...targetIds, ...edgeKeys];
  if (doc.sequence !== undefined && ctx.array(doc.sequence, "sequence")) {
    const ACTIONS = ["show", "hide", "highlight", "unhighlight", "flow", "note", "relabel", ...ANNOTATION_ACTIONS];
    doc.sequence.forEach((s, i) => {
      const path = `sequence[${i}]`;
      if (!ctx.object(s, path)) return;
      const actions = Object.keys(s).filter((k) => ACTIONS.includes(k));
      if (actions.length !== 1) {
        ctx.error(path, `a step needs exactly one action key, found ${actions.length ? list(actions) : "none"}`, `one of ${list(ACTIONS)}, plus optional "caption" and "ms"`);
        ctx.keys(s, path, [...ACTIONS, "caption", "ms"]);
        return;
      }
      ctx.keys(s, path, [...ACTIONS, "caption", "ms"]);
      captionAndMs(ctx, s, path);
      const action = actions[0];
      const v = s[action];
      if ((ANNOTATION_ACTIONS as readonly string[]).includes(action)) {
        validateAnnotationOp(ctx, s, path, action);
        return;
      }
      switch (action) {
        case "show":
        case "hide":
        case "highlight":
        case "unhighlight":
          idOrIds(ctx, v, `${path}.${action}`, highlightIds, "node");
          break;
        case "flow": {
          let from: unknown;
          let to: unknown;
          if (isStr(v) && v.includes("->")) [from, to] = v.split("->").map((x) => x.trim());
          else if (Array.isArray(v) && v.length === 2) [from, to] = v;
          else {
            ctx.error(`${path}.flow`, `flow takes "a->b" or ["a", "b"], got ${describe(v)}`);
            break;
          }
          const a = ctx.ref(from, `${path}.flow`, nodeIds, "node");
          const b = ctx.ref(to, `${path}.flow`, nodeIds, "node");
          if (a && b && !edgeKeys.includes(`${from as string}->${to as string}`) && !edgeKeys.includes(`${to as string}->${from as string}`)) {
            ctx.error(`${path}.flow`, `no edge between "${from as string}" and "${to as string}"`, `add {"from": "${from as string}", "to": "${to as string}"} to "edges", or flow along an existing edge: ${edgeKeys.length ? list(edgeKeys) : "(none declared)"}`);
          }
          break;
        }
        case "note":
          if (!isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
          break;
        case "relabel":
          if (ctx.object(v, `${path}.relabel`)) {
            ctx.keys(v, `${path}.relabel`, ["id", "text"]);
            ctx.ref(v.id, `${path}.relabel.id`, nodeIds, "node");
            if (!isStr(v.text)) ctx.error(`${path}.relabel.text`, `text must be a string`);
          }
          break;
      }
    });
  }
}

function validateStateMachine(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["states", "initial", "transitions", "trace", "layout"]);
  if (doc.layout !== undefined) ctx.enumOf(doc.layout, "layout", ["lr", "tb", "circle"], "layout");
  let stateIds: string[] = [];
  if (ctx.array(doc.states, "states", { minLength: 1 })) {
    stateIds = ids(ctx, doc.states, "states");
    doc.states.forEach((s, i) => {
      if (isObj(s)) {
        ctx.keys(s, `states[${i}]`, ["id", "label", "final", "pos"]);
        if (s.pos !== undefined) ctx.vec2(s.pos, `states[${i}].pos`);
      } else if (!isStr(s)) ctx.error(`states[${i}]`, `a state is a string id or {"id", "label", "final", "pos"}`);
    });
  }
  ctx.ref(doc.initial, "initial", stateIds, "state");
  const table = new Map<string, Map<string, string>>();
  if (ctx.array(doc.transitions, "transitions")) {
    doc.transitions.forEach((t, i) => {
      const path = `transitions[${i}]`;
      if (!ctx.object(t, path)) return;
      ctx.keys(t, path, ["from", "to", "on", "note"]);
      const a = ctx.ref(t.from, `${path}.from`, stateIds, "state");
      const b = ctx.ref(t.to, `${path}.to`, stateIds, "state");
      const on = ctx.string(t.on, `${path}.on`);
      if (a && b && on) {
        const row = table.get(t.from as string) ?? new Map<string, string>();
        if (row.has(t.on as string)) {
          ctx.error(`${path}.on`, `state "${t.from as string}" already has a transition on "${t.on as string}" (to "${row.get(t.on as string)}")`, "events must be deterministic per state");
        }
        row.set(t.on as string, t.to as string);
        table.set(t.from as string, row);
      }
    });
  }
  if (ctx.array(doc.trace, "trace") && isStr(doc.initial) && stateIds.includes(doc.initial)) {
    let cur = doc.initial;
    for (let i = 0; i < doc.trace.length; i++) {
      const item = doc.trace[i];
      let ev: unknown = item;
      if (isObj(item)) {
        const keys = Object.keys(item);
        if (annotationItem(ctx, item, `trace[${i}]`)) continue;
        if ("note" in item) {
          ctx.keys(item, `trace[${i}]`, ["note"]);
          if (!isStr(item.note)) ctx.error(`trace[${i}].note`, "note takes a string");
          continue;
        }
        if ("goto" in item) {
          ctx.keys(item, `trace[${i}]`, ["goto", "caption"]);
          if (ctx.ref(item.goto, `trace[${i}].goto`, stateIds, "state")) cur = item.goto as string;
          continue;
        }
        if (!("on" in item)) {
          ctx.error(`trace[${i}]`, `a trace item is an event name, {"on", "caption"}, {"note"} or {"goto", "caption"}; found keys ${keys.length ? list(keys) : "none"}`);
          break;
        }
        ctx.keys(item, `trace[${i}]`, ["on", "caption"]);
        ev = item.on;
      }
      if (!ctx.string(ev, isObj(item) ? `trace[${i}].on` : `trace[${i}]`)) break;
      const row = table.get(cur);
      const next = row?.get(ev);
      if (next === undefined) {
        const avail = row ? [...row.keys()] : [];
        const near = closest(ev, avail);
        ctx.error(
          `trace[${i}]`,
          `no transition from "${cur}" on "${ev}"`,
          avail.length
            ? `${near ? `did you mean "${near}"? ` : ""}from "${cur}" the legal events are ${list(avail)}`
            : `"${cur}" has no outgoing transitions; add one to "transitions" or end the trace here`,
        );
        break;
      }
      cur = next;
    }
  }
}

function validateFlowchart(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["nodes", "edges", "start", "walk", "layout"]);
  if (doc.layout !== undefined) ctx.enumOf(doc.layout, "layout", ["tb", "lr"], "layout");
  let nodeIds: string[] = [];
  const shapes = new Map<string, string>();
  if (ctx.array(doc.nodes, "nodes", { minLength: 1 })) {
    nodeIds = ids(ctx, doc.nodes, "nodes");
    doc.nodes.forEach((n, i) => {
      if (isObj(n)) {
        ctx.keys(n, `nodes[${i}]`, ["id", "label", "shape", "pos"]);
        if (n.shape !== undefined && ctx.enumOf(n.shape, `nodes[${i}].shape`, FLOW_SHAPES, "shape") && isStr(n.id)) shapes.set(n.id, n.shape as string);
        if (n.pos !== undefined) ctx.vec2(n.pos, `nodes[${i}].pos`);
      } else if (!isStr(n)) ctx.error(`nodes[${i}]`, `a node is a string id or {"id", "label", "shape", "pos"}`);
    });
  }
  const outs = new Map<string, Map<string, string | undefined>>();
  if (ctx.array(doc.edges, "edges")) {
    doc.edges.forEach((e, i) => {
      const path = `edges[${i}]`;
      let from: unknown;
      let to: unknown;
      let label: string | undefined;
      if (Array.isArray(e)) {
        if (e.length !== 2) ctx.error(path, `an edge shorthand is ["from", "to"], got ${e.length} item(s)`);
        [from, to] = e;
      } else if (isObj(e)) {
        ctx.keys(e, path, ["from", "to", "label"]);
        from = e.from;
        to = e.to;
        if (e.label !== undefined && ctx.string(e.label, `${path}.label`)) label = e.label;
      } else {
        ctx.error(path, `an edge is ["from", "to"] or {"from", "to", "label"}`);
        return;
      }
      const a = ctx.ref(from, `${path}.from`, nodeIds, "node");
      const c = ctx.ref(to, `${path}.to`, nodeIds, "node");
      if (a && c) {
        const row = outs.get(from as string) ?? new Map<string, string | undefined>();
        if (row.has(to as string)) ctx.error(path, `"${from as string}" already has an edge to "${to as string}"`, "one edge per pair; give a decision's two answers two different targets");
        row.set(to as string, label);
        outs.set(from as string, row);
      }
    });
  }
  let start = nodeIds[0];
  if (doc.start !== undefined && ctx.ref(doc.start, "start", nodeIds, "node")) start = doc.start as string;
  if (doc.walk !== undefined && ctx.array(doc.walk, "walk") && start) {
    let cur = start;
    for (let i = 0; i < doc.walk.length; i++) {
      const item = doc.walk[i];
      let next: unknown = item;
      if (isObj(item)) {
        if (annotationItem(ctx, item, `walk[${i}]`)) continue;
        if ("note" in item) {
          ctx.keys(item, `walk[${i}]`, ["note", "ms"]);
          if (!isStr(item.note)) ctx.error(`walk[${i}].note`, "note takes a string");
          continue;
        }
        if (!("at" in item)) {
          ctx.error(`walk[${i}]`, `a walk item is a node id, {"at": id, "caption"}, {"note"} or an annotation op; found keys ${list(Object.keys(item))}`);
          break;
        }
        ctx.keys(item, `walk[${i}]`, ["at", "caption", "ms"]);
        next = item.at;
      }
      if (!ctx.string(next, isObj(item) ? `walk[${i}].at` : `walk[${i}]`)) break;
      const row = outs.get(cur);
      if (!row?.has(next)) {
        const avail = row ? [...row.keys()] : [];
        const near = closest(next, avail);
        ctx.error(
          `walk[${i}]`,
          `no edge from "${cur}" to "${next}"`,
          avail.length ? `${near ? `did you mean "${near}"? ` : ""}from "${cur}" the edges lead to ${list(avail)}` : `"${cur}" has no way out; add an edge to "edges" or end the walk here`,
        );
        break;
      }
      cur = next;
    }
  }
  void shapes;
}

function validateGantt(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["tasks", "unit", "tick", "from", "to", "ops"]);
  if (doc.unit !== undefined) ctx.string(doc.unit, "unit");
  if (doc.tick !== undefined) ctx.number(doc.tick, "tick", { min: 0 });
  if (doc.from !== undefined) ctx.number(doc.from, "from");
  if (doc.to !== undefined) ctx.number(doc.to, "to");
  let taskIds: string[] = [];
  if (ctx.array(doc.tasks, "tasks", { minLength: 1 })) {
    taskIds = ids(ctx, doc.tasks, "tasks");
    doc.tasks.forEach((t, i) => {
      const path = `tasks[${i}]`;
      if (!ctx.object(t, path)) return;
      ctx.keys(t, path, ["id", "label", "start", "end", "lane", "after", "milestone"]);
      const s = ctx.number(t.start, `${path}.start`);
      if (t.end !== undefined && ctx.number(t.end, `${path}.end`) && s && (t.end as number) < (t.start as number)) ctx.error(`${path}.end`, `"${String(t.id)}" ends at ${t.end as number}, before it starts at ${t.start as number}`);
      if (t.end === undefined && t.milestone !== true) ctx.error(`${path}.end`, `"${String(t.id)}" has no "end": give it one, or make it a milestone with "milestone": true`);
      if (t.lane !== undefined) ctx.string(t.lane, `${path}.lane`);
      if (t.milestone !== undefined && typeof t.milestone !== "boolean") ctx.error(`${path}.milestone`, "milestone takes true/false");
      if (t.after !== undefined && ctx.array(t.after, `${path}.after`)) {
        t.after.forEach((a, k) => {
          if (ctx.ref(a, `${path}.after[${k}]`, taskIds, "task") && a === t.id) ctx.error(`${path}.after[${k}]`, `"${String(t.id)}" cannot depend on itself`);
        });
      }
    });
  }
  if (doc.ops !== undefined && ctx.array(doc.ops, "ops")) {
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      if (annotationItem(ctx, op, path)) return;
      if ("note" in op) {
        ctx.keys(op, path, ["note", "ms"]);
        if (!isStr(op.note)) ctx.error(`${path}.note`, "note takes a string");
      } else if ("advance" in op) {
        ctx.keys(op, path, ["advance", "caption", "ms"]);
        ctx.number(op.advance, `${path}.advance`);
      } else if ("slip" in op) {
        ctx.keys(op, path, ["slip", "caption", "ms"]);
        if (ctx.object(op.slip, `${path}.slip`)) {
          ctx.keys(op.slip, `${path}.slip`, ["task", "start", "end"]);
          ctx.ref(op.slip.task, `${path}.slip.task`, taskIds, "task");
          if (op.slip.start !== undefined) ctx.number(op.slip.start, `${path}.slip.start`);
          if (op.slip.end !== undefined) ctx.number(op.slip.end, `${path}.slip.end`);
          if (op.slip.start === undefined && op.slip.end === undefined) ctx.error(`${path}.slip`, `a slip changes "start" and/or "end"; neither is given`);
        }
      } else if ("status" in op) {
        ctx.keys(op, path, ["status", "caption", "ms"]);
        if (ctx.object(op.status, `${path}.status`)) {
          ctx.keys(op.status, `${path}.status`, ["task", "state"]);
          ctx.ref(op.status.task, `${path}.status.task`, taskIds, "task");
          ctx.enumOf(op.status.state, `${path}.status.state`, ["late", "blocked", "done"], "state");
        }
      } else ctx.error(path, `an op is {"advance": t}, {"slip": {"task", "start", "end"}}, {"status": {"task", "state"}}, {"note"} or an annotation op; found keys ${list(Object.keys(op))}`);
    });
  }
}

function validateSort(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["values", "algorithm", "ops", "captions"]);
  let n = 0;
  if (ctx.array(doc.values, "values", { minLength: 2 })) {
    n = doc.values.length;
    doc.values.forEach((v, i) => ctx.number(v, `values[${i}]`));
  }
  if (doc.algorithm !== undefined) ctx.enumOf(doc.algorithm, "algorithm", ["bubble", "insertion", "selection"], "algorithm");
  if (doc.algorithm === undefined && doc.ops === undefined) {
    ctx.error("algorithm", `give "algorithm" (bubble | insertion | selection) or an explicit "ops" list`);
  }
  if (doc.ops !== undefined && ctx.array(doc.ops, "ops")) {
    const ACTIONS = ["compare", "swap", "done", "set", "note", ...ANNOTATION_ACTIONS];
    const idx = (v: unknown, path: string): void => {
      if (ctx.number(v, path, { integer: true, min: 0 }) && v >= n) ctx.error(path, `index ${v} is out of range for ${n} values (0..${n - 1})`);
    };
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const actions = Object.keys(op).filter((k) => ACTIONS.includes(k));
      ctx.keys(op, path, [...ACTIONS, "caption", "ms"]);
      if (actions.length !== 1) {
        ctx.error(path, `an op needs exactly one action key, found ${actions.length ? list(actions) : "none"}`, `one of ${list(ACTIONS)}`);
        return;
      }
      captionAndMs(ctx, op, path);
      const a = actions[0];
      const v = op[a];
      if ((ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (a === "compare" || a === "swap") {
        if (Array.isArray(v) && v.length === 2) v.forEach((x, j) => idx(x, `${path}.${a}[${j}]`));
        else ctx.error(`${path}.${a}`, `${a} takes [i, j] (two indices), got ${describe(v)}`);
      } else if (a === "done") {
        (Array.isArray(v) ? v : [v]).forEach((x, j) => idx(x, Array.isArray(v) ? `${path}.done[${j}]` : `${path}.done`));
      } else if (a === "set") {
        if (ctx.object(v, `${path}.set`)) {
          ctx.keys(v, `${path}.set`, ["index", "value"]);
          idx(v.index, `${path}.set.index`);
          ctx.number(v.value, `${path}.set.value`);
        }
      } else if (a === "note" && !isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
    });
  }
}

function validateArray(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["values", "algorithm", "target", "window", "ops"]);
  let n = 0;
  let numeric = true;
  if (ctx.array(doc.values, "values", { minLength: 1 })) {
    n = doc.values.length;
    doc.values.forEach((v, i) => {
      if (!isNum(v) && !isStr(v)) ctx.error(`values[${i}]`, `a value is a number or a string, got ${describe(v)}`);
      if (!isNum(v)) numeric = false;
    });
  }
  if (doc.algorithm !== undefined) ctx.enumOf(doc.algorithm, "algorithm", ["binary-search", "two-pointer-sum", "sliding-window"], "algorithm");
  if (doc.algorithm === undefined && doc.ops === undefined) ctx.error("algorithm", `give "algorithm" (binary-search | two-pointer-sum | sliding-window) or an explicit "ops" list`);
  if (doc.target !== undefined) ctx.number(doc.target, "target");
  if (doc.window !== undefined) ctx.number(doc.window, "window", { integer: true, min: 1 });
  if (doc.ops === undefined && (doc.algorithm === "binary-search" || doc.algorithm === "two-pointer-sum")) {
    if (doc.target === undefined) ctx.error("target", `${doc.algorithm} needs "target": the value to find (binary-search) or the sum to reach (two-pointer-sum)`);
    if (!numeric) ctx.error("values", `${doc.algorithm} needs numeric values`);
    else if (Array.isArray(doc.values) && doc.values.some((v, i) => i > 0 && (v as number) < (doc.values as number[])[i - 1])) {
      ctx.error("values", `${doc.algorithm} assumes sorted values; these are not in ascending order`, "sort the values, or show the walk with explicit ops");
    }
  }
  if (doc.ops === undefined && doc.algorithm === "sliding-window") {
    if (!numeric) ctx.error("values", "sliding-window sums numeric values");
    if (isNum(doc.window) && doc.window > n) ctx.error("window", `window ${doc.window} is longer than the array (${n})`);
  }
  if (doc.ops !== undefined && ctx.array(doc.ops, "ops")) {
    const ACTIONS = ["pointers", "window", "compare", "swap", "set", "highlight", "unhighlight", "mark", "found", "note", ...ANNOTATION_ACTIONS];
    const idx = (v: unknown, path: string): void => {
      if (ctx.number(v, path, { integer: true, min: 0 }) && v >= n) ctx.error(path, `index ${v} is out of range for ${n} values (0..${n - 1})`);
    };
    const idxs = (v: unknown, path: string): void => {
      (Array.isArray(v) ? v : [v]).forEach((x, j) => idx(x, Array.isArray(v) ? `${path}[${j}]` : path));
    };
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const a = oneAction(ctx, op, path, ACTIONS, ["caption", "ms"], `{"pointers": {"lo": 0, "hi": 5}} or {"compare": [2, 3]}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (!a) return;
      const v = op[a];
      switch (a) {
        case "pointers":
          if (ctx.object(v, `${path}.pointers`)) {
            if (Object.keys(v).length === 0) ctx.error(`${path}.pointers`, `pointers is empty; name at least one, e.g. {"lo": 0}`);
            for (const [name, at] of Object.entries(v)) if (at !== null) idx(at, `${path}.pointers.${name}`);
          }
          break;
        case "window":
          if (v !== null) {
            if (Array.isArray(v) && v.length === 2) {
              idx(v[0], `${path}.window[0]`);
              idx(v[1], `${path}.window[1]`);
              if (isNum(v[0]) && isNum(v[1]) && v[1] < v[0]) ctx.error(`${path}.window`, `window [${v[0]}, ${v[1]}] ends before it starts`);
            } else ctx.error(`${path}.window`, `window takes [from, to] (inclusive indices) or null to clear it, got ${describe(v)}`);
          }
          break;
        case "compare":
        case "swap":
          if (Array.isArray(v) && v.length === 2) v.forEach((x, j) => idx(x, `${path}.${a}[${j}]`));
          else ctx.error(`${path}.${a}`, `${a} takes [i, j] (two indices), got ${describe(v)}`);
          break;
        case "set":
          if (ctx.object(v, `${path}.set`)) {
            ctx.keys(v, `${path}.set`, ["index", "value"]);
            idx(v.index, `${path}.set.index`);
            if (!isNum(v.value) && !isStr(v.value)) ctx.error(`${path}.set.value`, `value is a number or a string`);
          }
          break;
        case "highlight":
        case "mark":
          idxs(v, `${path}.${a}`);
          break;
        case "unhighlight":
          if (v !== "all") idxs(v, `${path}.unhighlight`);
          break;
        case "found":
          idx(v, `${path}.found`);
          break;
        case "note":
          if (!isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
          break;
      }
    });
  }
}

const isValue = (v: unknown): v is number | string => isNum(v) || isStr(v);

function validateCollection(ctx: Ctx, doc: Obj, mode: "stack" | "queue"): void {
  validateBase(ctx, doc, ["initial", "ops", "capacity"]);
  let n = 0;
  if (doc.initial !== undefined && ctx.array(doc.initial, "initial")) {
    n = doc.initial.length;
    doc.initial.forEach((v, i) => { if (!isValue(v)) ctx.error(`initial[${i}]`, `a value is a number or a string, got ${describe(v)}`); });
  }
  if (doc.capacity !== undefined && ctx.number(doc.capacity, "capacity", { integer: true, min: 1 }) && n > doc.capacity) ctx.error("capacity", `capacity ${doc.capacity} is smaller than the ${n} initial values`);
  const add = mode === "stack" ? "push" : "enqueue";
  const take = mode === "stack" ? "pop" : "dequeue";
  if (ctx.array(doc.ops, "ops", { minLength: 1 })) {
    const ACTIONS = [add, take, "peek", "note", ...ANNOTATION_ACTIONS];
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const other = mode === "stack" ? ["enqueue", "dequeue"] : ["push", "pop"];
      for (const k of other) if (k in op) ctx.error(`${path}.${k}`, `"${k}" is a ${mode === "stack" ? "queue" : "stack"} op; a ${mode} uses "${k === "enqueue" || k === "push" ? add : take}"`);
      const a = oneAction(ctx, op, path, ACTIONS, ["caption"], `{"${add}": 5} | {"${take}": true} | {"peek": true} | {"note": "…"}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (!a) return;
      const v = op[a];
      if (a === add && !isValue(v)) ctx.error(`${path}.${add}`, `${add} takes a number or a string, got ${describe(v)}`);
      else if ((a === take || a === "peek") && v !== true) ctx.error(`${path}.${a}`, `${a} takes the literal true, got ${describe(v)}`, `write {"${a}": true}`);
      else if (a === "note" && !isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
    });
  }
}

function validateList(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["initial", "ops"]);
  if (doc.initial !== undefined && ctx.array(doc.initial, "initial")) {
    doc.initial.forEach((v, i) => { if (!isValue(v)) ctx.error(`initial[${i}]`, `a value is a number or a string, got ${describe(v)}`); });
  }
  if (ctx.array(doc.ops, "ops", { minLength: 1 })) {
    const ACTIONS = ["insert", "remove", "find", "reverse", "note", ...ANNOTATION_ACTIONS];
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const a = oneAction(ctx, op, path, ACTIONS, ["caption"], `{"insert": {"value": 5, "after": 3}} | {"remove": 7} | {"find": 9} | {"reverse": true}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (!a) return;
      const v = op[a];
      switch (a) {
        case "insert":
          if (ctx.object(v, `${path}.insert`)) {
            ctx.keys(v, `${path}.insert`, ["value", "at", "after"]);
            if (!isValue(v.value)) ctx.error(`${path}.insert.value`, `value is a number or a string, got ${describe(v.value)}`);
            if (v.at !== undefined) ctx.number(v.at, `${path}.insert.at`, { integer: true, min: 0 });
            if (v.after !== undefined && !isValue(v.after)) ctx.error(`${path}.insert.after`, `after names an existing value`);
            if (v.at !== undefined && v.after !== undefined) ctx.error(`${path}.insert`, `give "at" (a position) or "after" (a value), not both`);
          }
          break;
        case "remove":
        case "find":
          if (!isValue(v)) ctx.error(`${path}.${a}`, `${a} takes a value (number or string), got ${describe(v)}`);
          break;
        case "reverse":
          if (v !== true) ctx.error(`${path}.reverse`, `reverse takes the literal true`, `write {"reverse": true}`);
          break;
        case "note":
          if (!isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
          break;
      }
    });
  }
}

function validateTree(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["initial", "ops"]);
  const present = new Set<number>();
  if (doc.initial !== undefined && ctx.array(doc.initial, "initial")) {
    doc.initial.forEach((v, i) => {
      if (!ctx.number(v, `initial[${i}]`)) return;
      if (present.has(v)) ctx.error(`initial[${i}]`, `${v} appears twice; a BST holds each value once`);
      present.add(v);
    });
  }
  if (ctx.array(doc.ops, "ops", { minLength: 1 })) {
    const ACTIONS = ["insert", "search", "delete", "traverse", "note", ...ANNOTATION_ACTIONS];
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const a = oneAction(ctx, op, path, ACTIONS, ["caption"], `{"insert": 5} | {"search": 7} | {"delete": 3} | {"traverse": "inorder"}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (!a) return;
      const v = op[a];
      if (a === "insert" || a === "search" || a === "delete") {
        if (!ctx.number(v, `${path}.${a}`)) return;
        if (a === "insert") {
          if (present.has(v)) ctx.warn(`${path}.insert`, `${v} is already in the tree at this point: the insert is narrated as a no-op`);
          present.add(v);
        } else if (a === "delete") {
          if (!present.has(v)) ctx.warn(`${path}.delete`, `${v} is not in the tree at this point: the delete is narrated as a no-op`);
          present.delete(v);
        }
      } else if (a === "traverse") ctx.enumOf(v, `${path}.traverse`, ["inorder", "preorder", "postorder", "levelorder"], "traverse");
      else if (a === "note" && !isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
    });
  }
}

function validateHeap(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["type", "initial", "ops"]);
  if (doc.type !== undefined) ctx.enumOf(doc.type, "type", ["min", "max"], "type");
  if (doc.initial !== undefined && ctx.array(doc.initial, "initial")) {
    doc.initial.forEach((v, i) => ctx.number(v, `initial[${i}]`));
  }
  if (ctx.array(doc.ops, "ops", { minLength: 1 })) {
    const ACTIONS = ["push", "pop", "note", ...ANNOTATION_ACTIONS];
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const actions = Object.keys(op).filter((k) => ACTIONS.includes(k));
      const isAnnotation = actions.length === 1 && (ANNOTATION_ACTIONS as readonly string[]).includes(actions[0]);
      ctx.keys(op, path, [...ACTIONS, "caption", ...(isAnnotation ? ["ms"] : [])]);
      if (actions.length !== 1) {
        ctx.error(path, `an op needs exactly one action key, found ${actions.length ? list(actions) : "none"}`, `{"push": 5} | {"pop": true} | {"note": "…"}`);
        return;
      }
      const a = actions[0];
      if ((ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        captionAndMs(ctx, op, path);
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (a === "push") ctx.number(op.push, `${path}.push`);
      else if (a === "pop" && op.pop !== true) ctx.error(`${path}.pop`, `pop takes the literal true, got ${describe(op.pop)}`, `write {"pop": true}`);
      else if (a === "note" && !isStr(op.note)) ctx.error(`${path}.note`, `note takes a string`);
    });
  }
}

const STATUSES = ["up", "down", "leader", "busy"];

function validateDistributed(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["nodes", "messages", "events", "timing"]);
  if (doc.timing !== undefined) ctx.enumOf(doc.timing, "timing", ["sequential", "causal"], "timing");
  let nodeIds: string[] = [];
  if (ctx.array(doc.nodes, "nodes", { minLength: 1 })) {
    nodeIds = ids(ctx, doc.nodes, "nodes");
    doc.nodes.forEach((n, i) => {
      if (isObj(n)) {
        ctx.keys(n, `nodes[${i}]`, ["id", "label", "status"]);
        if (n.status !== undefined) ctx.enumOf(n.status, `nodes[${i}].status`, STATUSES, "status");
      } else if (!isStr(n)) ctx.error(`nodes[${i}]`, `a node is a string id or {"id", "label", "status"}`);
    });
  }
  // `after` names an EARLIER message by label; a label used twice cannot be an anchor on its own — then the
  // message is named as `from->to:label` (or `from->to`), which a two-participant protocol needs for every label
  // (lc, v18: prepare / yes / commit / ack are all sent twice by design).
  const labelsSoFar: string[] = [];
  type Sent = { from: string; to: string; label?: string };
  const sentSoFar: Sent[] = [];
  const allSent: Sent[] = [];
  const allLabels = new Map<string, number>();
  if (Array.isArray(doc.messages)) {
    for (const m of doc.messages) {
      if (!isObj(m) || !isStr(m.from) || !isStr(m.to)) continue;
      allSent.push({ from: m.from, to: m.to, ...(isStr(m.label) ? { label: m.label } : {}) });
      if (isStr(m.label)) allLabels.set(m.label, (allLabels.get(m.label) ?? 0) + 1);
    }
  }
  const qualified = (v: string): { from: string; to: string; label?: string } | undefined => {
    const i = v.indexOf("->");
    if (i < 0) return undefined;
    const from = v.slice(0, i).trim();
    const rest = v.slice(i + 2);
    const c = rest.indexOf(":");
    const to = (c >= 0 ? rest.slice(0, c) : rest).trim();
    return from && to ? { from, to, ...(c >= 0 ? { label: rest.slice(c + 1).trim() } : {}) } : undefined;
  };
  const anchor = (v: unknown, path: string, candidates: string[], earlier: Sent[] = sentSoFar): void => {
    if (!isStr(v)) {
      ctx.error(path, `after takes the "label" of an earlier message, got ${describe(v)}`);
      return;
    }
    const q = qualified(v);
    if (q) {
      const hits = earlier.filter((m) => m.from === q.from && m.to === q.to && (q.label === undefined || m.label === q.label));
      if (hits.length === 1) return;
      const anyHits = allSent.filter((m) => m.from === q.from && m.to === q.to && (q.label === undefined || m.label === q.label));
      if (hits.length === 0) ctx.error(path, anyHits.length ? `"${v}" is a later message; after can only reference an earlier one` : `no earlier message is "${v}"`, `write the anchor as "from->to:label" — earlier messages: ${earlier.length ? earlier.map((m) => `"${m.from}->${m.to}${m.label !== undefined ? `:${m.label}` : ""}"`).join(", ") : "none yet"}`);
      else ctx.error(path, `"${v}" names ${hits.length} earlier messages, so it cannot anchor anything`, `add the label: "${q.from}->${q.to}:<label>", or give the message you mean a unique label`);
      return;
    }
    if ((allLabels.get(v) ?? 0) > 1) {
      const which = allSent.filter((m) => m.label === v).map((m) => `"${m.from}->${m.to}:${v}"`);
      ctx.error(path, `"${v}" labels ${allLabels.get(v)} messages, so it cannot anchor anything on its own`, `name the one you mean as ${which.join(" or ")}`);
      return;
    }
    if (!candidates.includes(v)) {
      const near = closest(v, candidates);
      const later = allLabels.has(v);
      ctx.error(
        path,
        later ? `"${v}" is a later message; after can only reference an earlier one` : `no earlier message is labelled "${v}"`,
        candidates.length ? `${near ? `did you mean "${near}"? ` : ""}earlier labels: ${list(candidates)}` : "no earlier message has a label yet",
      );
    }
  };
  if (ctx.array(doc.messages, "messages")) {
    doc.messages.forEach((m, i) => {
      const path = `messages[${i}]`;
      if (!ctx.object(m, path)) return;
      if (annotationItem(ctx, m, path)) return;
      if ("note" in m) {
        // A captioned pause between messages, timed like one.
        ctx.keys(m, path, ["note", "at", "after", "delay"]);
        if (!isStr(m.note)) ctx.error(`${path}.note`, `note takes the caption text, got ${describe(m.note)}`);
        if (m.at !== undefined) ctx.number(m.at, `${path}.at`, { min: 0 });
        if (m.after !== undefined) anchor(m.after, `${path}.after`, labelsSoFar);
        if (m.at !== undefined && m.after !== undefined) ctx.error(`${path}.after`, `give "at" or "after", not both`);
        if (m.delay !== undefined) {
          ctx.number(m.delay, `${path}.delay`, { min: 0 });
          if (m.after === undefined) ctx.error(`${path}.delay`, `delay only counts from an "after" anchor; without one it changes nothing`, `add "after": "<label of the message this waits for>"`);
        }
        return;
      }
      ctx.keys(m, path, ["from", "to", "label", "at", "after", "delay", "latency", "lost", "caption"]);
      const a = ctx.ref(m.from, `${path}.from`, nodeIds, "node");
      const b = ctx.ref(m.to, `${path}.to`, nodeIds, "node");
      if (a && b && m.from === m.to) ctx.error(`${path}.to`, `a message cannot go from "${m.from as string}" to itself`);
      if (m.at !== undefined && m.at !== "<") ctx.number(m.at, `${path}.at`, { min: 0 });
      if (m.at === "<" && i === 0) ctx.error(`${path}.at`, `"<" means "together with the previous message" and there is none before the first`);
      if (m.after !== undefined) anchor(m.after, `${path}.after`, labelsSoFar);
      if (m.at !== undefined && m.after !== undefined) ctx.error(`${path}.after`, `give "at" or "after", not both`);
      if (m.delay !== undefined) {
        ctx.number(m.delay, `${path}.delay`, { min: 0 });
        if (m.after === undefined) ctx.error(`${path}.delay`, `delay only counts from an "after" anchor; without one it changes nothing`, `add "after": "<label of the message this waits for>", or use "latency" if the message itself should take longer to arrive`);
      }
      if (m.latency !== undefined) ctx.number(m.latency, `${path}.latency`, { min: 1 });
      if (m.lost !== undefined && typeof m.lost !== "boolean") ctx.error(`${path}.lost`, `lost takes true/false`);
      if (isStr(m.label)) labelsSoFar.push(m.label);
      if (isStr(m.from) && isStr(m.to)) sentSoFar.push({ from: m.from, to: m.to, ...(isStr(m.label) ? { label: m.label } : {}) });
    });
  }
  if (doc.events !== undefined && ctx.array(doc.events, "events")) {
    doc.events.forEach((e, i) => {
      const path = `events[${i}]`;
      if (!ctx.object(e, path)) return;
      ctx.keys(e, path, ["at", "after", "delay", "node", "status", "caption"]);
      if (e.at === undefined && e.after === undefined) ctx.error(path, `an event needs "at" (ms) or "after" (a message label)`, `e.g. {"after": "ok", "node": "primary", "status": "down"}`);
      if (e.at !== undefined) ctx.number(e.at, `${path}.at`, { min: 0 });
      if (e.after !== undefined) anchor(e.after, `${path}.after`, [...allLabels.keys()].filter((l) => allLabels.get(l) === 1), allSent);
      if (e.at !== undefined && e.after !== undefined) ctx.error(`${path}.after`, `give "at" or "after", not both`);
      if (e.delay !== undefined) {
        ctx.number(e.delay, `${path}.delay`, { min: 0 });
        if (e.after === undefined) ctx.error(`${path}.delay`, `delay only counts from an "after" anchor; without one it changes nothing`, `add "after": "<message label>", or fold the delay into "at"`);
      }
      ctx.ref(e.node, `${path}.node`, nodeIds, "node");
      ctx.enumOf(e.status, `${path}.status`, STATUSES, "status");
    });
  }
}

const SIDES = ["above", "below", "left", "right"];

/**
 * The six annotation ops, shared by every kind. Anchor names are checked at
 * compile time (the compiler knows what it registered); here the shape.
 */
function validateAnnotationOp(ctx: Ctx, op: Obj, path: string, action: string): void {
  const v = op[action];
  const p = `${path}.${action}`;
  const anchor = (x: unknown, at: string): void => {
    if (!isStr(x) || !x) ctx.error(at, `takes an anchor name (a string the kind documents: an index, a cell "r,c", a node id, a state, a value), got ${describe(x)}`);
  };
  const side = (x: unknown, at: string): void => {
    if (x !== undefined) ctx.enumOf(x, at, SIDES, "side");
  };
  const text = (x: unknown, at: string): void => {
    if (!isStr(x) && !isNum(x)) ctx.error(at, `takes the text to show, got ${describe(x)}`);
  };
  switch (action) {
    case "value":
      if (!ctx.object(v, p)) return;
      ctx.keys(v, p, ["id", "label", "text", "at", "side"]);
      if (!isStr(v.id) || !v.id) ctx.error(`${p}.id`, `a value needs an "id" — the same id later updates the readout`, `e.g. {"value": {"id": "best", "label": "best so far", "text": "1/2"}}`);
      if (v.label !== undefined && !isStr(v.label)) ctx.error(`${p}.label`, `label must be a string`);
      text(v.text, `${p}.text`);
      if (v.at !== undefined) anchor(v.at, `${p}.at`);
      side(v.side, `${p}.side`);
      return;
    case "callout":
      if (v === null) return;
      if (!ctx.object(v, p)) return;
      ctx.keys(v, p, ["id", "at", "text", "side"]);
      anchor(v.at, `${p}.at`);
      text(v.text, `${p}.text`);
      side(v.side, `${p}.side`);
      if (v.id !== undefined && !isStr(v.id)) ctx.error(`${p}.id`, `id must be a string`);
      return;
    case "snapshot":
      if (!ctx.object(v, p)) return;
      ctx.keys(v, p, ["of", "label"]);
      anchor(v.of, `${p}.of`);
      if (v.label !== undefined && !isStr(v.label)) ctx.error(`${p}.label`, `label must be a string`);
      return;
    case "group":
      if (v === null) return;
      if (!ctx.object(v, p)) return;
      ctx.keys(v, p, ["id", "around", "label"]);
      if (Array.isArray(v.around)) {
        if (v.around.length === 0) ctx.error(`${p}.around`, `around needs at least one anchor`);
        v.around.forEach((x, i) => anchor(x, `${p}.around[${i}]`));
      } else anchor(v.around, `${p}.around`);
      if (v.label !== undefined && !isStr(v.label)) ctx.error(`${p}.label`, `label must be a string`);
      if (v.id !== undefined && !isStr(v.id)) ctx.error(`${p}.id`, `id must be a string`);
      return;
    case "relate":
      if (v === null) return;
      if (!ctx.object(v, p)) return;
      ctx.keys(v, p, ["id", "from", "to", "label", "style", "tone"]);
      anchor(v.from, `${p}.from`);
      anchor(v.to, `${p}.to`);
      if (isStr(v.from) && isStr(v.to) && v.from === v.to) ctx.error(`${p}.to`, `a relation needs two different anchors, both are "${v.from}"`);
      if (v.label !== undefined && !isStr(v.label)) ctx.error(`${p}.label`, `label must be a string`);
      if (v.style !== undefined) ctx.enumOf(v.style, `${p}.style`, ["arrow", "line", "equals"], "style");
      if (v.tone !== undefined) ctx.enumOf(v.tone, `${p}.tone`, TONES, "tone");
      if (v.id !== undefined && !isStr(v.id)) ctx.error(`${p}.id`, `id must be a string`);
      return;
    case "text":
      if (v === null) return;
      if (!ctx.object(v, p)) return;
      ctx.keys(v, p, ["id", "lines", "highlight", "at", "side"]);
      if (ctx.array(v.lines, `${p}.lines`, { minLength: 1 })) v.lines.forEach((l, i) => text(l, `${p}.lines[${i}]`));
      if (v.highlight !== undefined && v.highlight !== null) {
        if (ctx.number(v.highlight, `${p}.highlight`, { integer: true, min: 0 }) && Array.isArray(v.lines) && v.highlight >= v.lines.length) {
          ctx.error(`${p}.highlight`, `line ${v.highlight} does not exist; the block has ${v.lines.length} line(s), numbered 0..${v.lines.length - 1}`);
        }
      }
      if (v.at !== undefined) anchor(v.at, `${p}.at`);
      side(v.side, `${p}.side`);
      if (v.id !== undefined && !isStr(v.id)) ctx.error(`${p}.id`, `id must be a string`);
      return;
  }
}

/** An annotation op anywhere it can appear; `true` when `item` was one (valid or not). */
function annotationItem(ctx: Ctx, item: Obj, path: string, extra: readonly string[] = ["caption", "ms"]): boolean {
  const found = Object.keys(item).filter((k) => (ANNOTATION_ACTIONS as readonly string[]).includes(k));
  if (found.length === 0) return false;
  ctx.keys(item, path, [...ANNOTATION_ACTIONS, ...extra]);
  if (found.length > 1) {
    ctx.error(path, `one annotation per op, found ${list(found)}`);
    return true;
  }
  captionAndMs(ctx, item, path);
  validateAnnotationOp(ctx, item, path, found[0]);
  return true;
}

function validateCompose(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["layout", "timing", "gap", "panes"]);
  if (doc.layout !== undefined) ctx.enumOf(doc.layout, "layout", ["row", "column", "grid"], "layout");
  if (doc.timing !== undefined) ctx.enumOf(doc.timing, "timing", ["sequence", "parallel"], "timing");
  if (doc.gap !== undefined) ctx.number(doc.gap, "gap", { min: 0 });
  if (!ctx.array(doc.panes, "panes", { minLength: 1 })) return;
  const ids = new Set<string>();
  doc.panes.forEach((pane, i) => {
    const path = `panes[${i}]`;
    if (!ctx.object(pane, path)) return;
    ctx.keys(pane, path, ["id", "title", "scene"]);
    if (pane.id !== undefined) {
      if (!isStr(pane.id)) ctx.error(`${path}.id`, `id must be a string`);
      else if (ids.has(pane.id)) ctx.error(`${path}.id`, `pane id "${pane.id}" is used twice`);
      else ids.add(pane.id);
    }
    if (pane.title !== undefined && !isStr(pane.title)) ctx.error(`${path}.title`, `title must be a string`);
    if (!ctx.object(pane.scene, `${path}.scene`)) return;
    if (pane.scene.kind === "compose") {
      ctx.error(`${path}.scene.kind`, `a compose pane cannot itself be a compose scene`, `flatten: list every pane in the outer "panes"`);
      return;
    }
    // The pane is a whole scene: validate it with its own kind's rules, under this path.
    for (const d of validateScene(pane.scene)) ctx.diags.push({ ...d, path: d.path ? `${path}.scene.${d.path}` : `${path}.scene` });
  });
}

function oneAction(ctx: Ctx, op: Obj, path: string, actions: readonly string[], extra: readonly string[], example: string): string | undefined {
  const found = Object.keys(op).filter((k) => actions.includes(k));
  // An annotation op always takes "caption" and "ms", even in a kind whose own ops take only "caption".
  const shared = found.length === 1 && (ANNOTATION_ACTIONS as readonly string[]).includes(found[0]) ? ["caption", "ms"] : [];
  ctx.keys(op, path, [...actions, ...extra, ...shared]);
  if (found.length !== 1) {
    ctx.error(path, `an op needs exactly one action key, found ${found.length ? list(found) : "none"}`, `one of ${list(actions)}, e.g. ${example}`);
    return undefined;
  }
  if ("caption" in op || "ms" in op) captionAndMs(ctx, op, path);
  return found[0];
}

function validateMatrix(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["cells", "rowLabels", "colLabels", "ops"]);
  let rows = 0;
  let cols = 0;
  if (ctx.array(doc.cells, "cells", { minLength: 1 })) {
    rows = doc.cells.length;
    doc.cells.forEach((row, r) => {
      if (!ctx.array(row, `cells[${r}]`, { minLength: 1 })) return;
      if (r === 0) cols = row.length;
      else if (row.length !== cols) ctx.error(`cells[${r}]`, `row ${r} has ${row.length} cells but row 0 has ${cols}`, "every row needs the same length; use null for an empty cell");
      row.forEach((v, c) => {
        if (v !== null && !isNum(v) && !isStr(v)) ctx.error(`cells[${r}][${c}]`, `a cell is a number, a string, or null (empty), got ${describe(v)}`);
      });
    });
  }
  for (const [key, count, what] of [["rowLabels", rows, "row"], ["colLabels", cols, "column"]] as const) {
    if (doc[key] === undefined) continue;
    if (ctx.array(doc[key], key)) {
      if ((doc[key] as unknown[]).length !== count) ctx.error(key, `${(doc[key] as unknown[]).length} labels for ${count} ${what}s`);
      (doc[key] as unknown[]).forEach((l, i) => {
        if (!isStr(l)) ctx.error(`${key}[${i}]`, `a label is a string`);
      });
    }
  }
  const cell = (v: unknown, path: string): void => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => Number.isInteger(x))) {
      ctx.error(path, `a cell reference is [row, col] (two 0-based integers), got ${describe(v)}`);
      return;
    }
    const [r, c] = v as [number, number];
    if (r < 0 || r >= rows) ctx.error(`${path}[0]`, `row ${r} is out of range for ${rows} rows (0..${rows - 1})`);
    if (c < 0 || c >= cols) ctx.error(`${path}[1]`, `col ${c} is out of range for ${cols} columns (0..${cols - 1})`);
  };
  const TARGET_KEYS = ["cell", "cells", "row", "col"];
  const target = (v: unknown, path: string): void => {
    if (!ctx.object(v, path)) return;
    const keys = Object.keys(v).filter((k) => TARGET_KEYS.includes(k));
    ctx.keys(v, path, TARGET_KEYS);
    if (keys.length !== 1) {
      ctx.error(path, `a target is {"cell": [r, c]}, {"cells": [[r, c], …]}, {"row": r} or {"col": c}; found ${keys.length ? list(keys) : "none"}`);
      return;
    }
    if ("cell" in v) cell(v.cell, `${path}.cell`);
    else if ("cells" in v && ctx.array(v.cells, `${path}.cells`, { minLength: 1 })) v.cells.forEach((x, i) => cell(x, `${path}.cells[${i}]`));
    else if ("row" in v && ctx.number(v.row, `${path}.row`, { integer: true, min: 0 }) && v.row >= rows) ctx.error(`${path}.row`, `row ${v.row} is out of range for ${rows} rows (0..${rows - 1})`);
    else if ("col" in v && ctx.number(v.col, `${path}.col`, { integer: true, min: 0 }) && v.col >= cols) ctx.error(`${path}.col`, `col ${v.col} is out of range for ${cols} columns (0..${cols - 1})`);
  };
  if (doc.ops !== undefined && ctx.array(doc.ops, "ops")) {
    const ACTIONS = ["set", "highlight", "unhighlight", "swap", "mark", "note", ...ANNOTATION_ACTIONS];
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const a = oneAction(ctx, op, path, ACTIONS, ["caption", "ms"], `{"set": {"cell": [1, 2], "value": 7, "from": [[0, 2], [1, 1]]}}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (!a) return;
      const v = op[a];
      switch (a) {
        case "set":
          if (ctx.object(v, `${path}.set`)) {
            ctx.keys(v, `${path}.set`, ["cell", "value", "from"]);
            cell(v.cell, `${path}.set.cell`);
            if (!isNum(v.value) && !isStr(v.value)) ctx.error(`${path}.set.value`, `value is a number or a string, got ${describe(v.value)}`);
            if (v.from !== undefined && ctx.array(v.from, `${path}.set.from`)) v.from.forEach((x, k) => cell(x, `${path}.set.from[${k}]`));
          }
          break;
        case "highlight":
        case "mark":
          target(v, `${path}.${a}`);
          break;
        case "unhighlight":
          if (v !== "all") target(v, `${path}.unhighlight`);
          break;
        case "swap":
          if (ctx.object(v, `${path}.swap`)) {
            ctx.keys(v, `${path}.swap`, ["rows", "cols"]);
            const which = "rows" in v ? "rows" : "cols" in v ? "cols" : undefined;
            if (!which || ("rows" in v && "cols" in v)) {
              ctx.error(`${path}.swap`, `swap takes {"rows": [i, j]} or {"cols": [i, j]}`);
              break;
            }
            const pair = v[which];
            const limit = which === "rows" ? rows : cols;
            if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((x) => Number.isInteger(x))) ctx.error(`${path}.swap.${which}`, `${which} takes [i, j] (two indices), got ${describe(pair)}`);
            else pair.forEach((x, k) => { if ((x as number) < 0 || (x as number) >= limit) ctx.error(`${path}.swap.${which}[${k}]`, `index ${x} is out of range for ${limit} ${which} (0..${limit - 1})`); });
          }
          break;
        case "note":
          if (!isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
          break;
      }
    });
  }
}

function validateGraph(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["nodes", "edges", "directed", "layout", "algorithm", "start", "goal", "ops"]);
  if (doc.layout !== undefined) ctx.enumOf(doc.layout, "layout", ["circle", "lr", "tb", "grid"], "layout");
  if (doc.directed !== undefined && typeof doc.directed !== "boolean") ctx.error("directed", "directed takes true/false");
  const directed = doc.directed === true;
  let nodeIds: string[] = [];
  if (ctx.array(doc.nodes, "nodes", { minLength: 1 })) {
    nodeIds = ids(ctx, doc.nodes, "nodes");
    doc.nodes.forEach((n, i) => {
      if (isObj(n)) {
        ctx.keys(n, `nodes[${i}]`, ["id", "label", "pos"]);
        if (n.pos !== undefined) ctx.vec2(n.pos, `nodes[${i}].pos`);
      } else if (!isStr(n)) ctx.error(`nodes[${i}]`, `a node is a string id or {"id", "label", "pos"}`);
    });
  }
  const edgeKeys: string[] = [];
  const hasEdge = (a: string, c: string): boolean => edgeKeys.includes(`${a}->${c}`) || (!directed && edgeKeys.includes(`${c}->${a}`));
  if (ctx.array(doc.edges, "edges")) {
    doc.edges.forEach((e, i) => {
      const path = `edges[${i}]`;
      let from: unknown;
      let to: unknown;
      if (Array.isArray(e) && e.length === 2) [from, to] = e;
      else if (isObj(e)) {
        ctx.keys(e, path, ["from", "to", "weight", "label"]);
        from = e.from;
        to = e.to;
        if (e.weight !== undefined) ctx.number(e.weight, `${path}.weight`);
        if (e.label !== undefined && !isStr(e.label)) ctx.error(`${path}.label`, `label is a string`);
      } else {
        ctx.error(path, `an edge is {"from", "to", "weight", "label"} or ["a", "b"], got ${describe(e)}`);
        return;
      }
      const a = ctx.ref(from, `${path}.from`, nodeIds, "node");
      const b = ctx.ref(to, `${path}.to`, nodeIds, "node");
      if (a && b) {
        if (from === to) ctx.error(`${path}.to`, `an edge cannot go from "${from as string}" to itself`);
        edgeKeys.push(`${from as string}->${to as string}`);
      }
    });
  }
  if (doc.algorithm !== undefined) ctx.enumOf(doc.algorithm, "algorithm", ["bfs", "dfs", "dijkstra"], "algorithm");
  if (doc.start !== undefined) ctx.ref(doc.start, "start", nodeIds, "node");
  if (doc.goal !== undefined) ctx.ref(doc.goal, "goal", nodeIds, "node");
  if (doc.algorithm === undefined && doc.ops === undefined) ctx.error("algorithm", `give "algorithm" (bfs | dfs | dijkstra) with "start", or an explicit "ops" list`);
  if (doc.algorithm === "dijkstra" && Array.isArray(doc.edges) && doc.edges.some((e) => isObj(e) && isNum(e.weight) && (e.weight as number) < 0)) {
    ctx.error("edges", "dijkstra needs non-negative weights");
  }
  if (doc.ops !== undefined && ctx.array(doc.ops, "ops")) {
    const ACTIONS = ["visit", "explore", "label", "highlight", "unhighlight", "path", "note", ...ANNOTATION_ACTIONS];
    doc.ops.forEach((op, i) => {
      const path = `ops[${i}]`;
      if (!ctx.object(op, path)) return;
      const a = oneAction(ctx, op, path, ACTIONS, ["caption", "ms"], `{"explore": "a->b", "caption": "…"}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, op, path, a);
        return;
      }
      if (!a) return;
      const v = op[a];
      switch (a) {
        case "visit":
          ctx.ref(v, `${path}.visit`, nodeIds, "node");
          break;
        case "explore": {
          let from: unknown;
          let to: unknown;
          if (isStr(v) && v.includes("->")) [from, to] = v.split("->").map((x) => x.trim());
          else if (Array.isArray(v) && v.length === 2) [from, to] = v;
          else {
            ctx.error(`${path}.explore`, `explore takes "a->b" or ["a", "b"], got ${describe(v)}`);
            break;
          }
          const okA = ctx.ref(from, `${path}.explore`, nodeIds, "node");
          const okB = ctx.ref(to, `${path}.explore`, nodeIds, "node");
          if (okA && okB && !hasEdge(from as string, to as string)) {
            const reverse = directed && edgeKeys.includes(`${to as string}->${from as string}`);
            ctx.error(`${path}.explore`, reverse ? `the edge runs "${to as string}" → "${from as string}" and the graph is directed` : `no edge between "${from as string}" and "${to as string}"`, reverse ? `explore it as "${to as string}->${from as string}", or drop "directed"` : `add {"from": "${from as string}", "to": "${to as string}"} to "edges"; declared: ${edgeKeys.length ? list(edgeKeys) : "(none)"}`);
          }
          break;
        }
        case "label":
          if (ctx.object(v, `${path}.label`)) {
            ctx.keys(v, `${path}.label`, ["node", "text"]);
            idOrIds(ctx, v.node, `${path}.label.node`, nodeIds, "node");
            if (!isStr(v.text)) ctx.error(`${path}.label.text`, `text is a string`);
          }
          break;
        case "highlight":
        case "unhighlight":
          idOrIds(ctx, v, `${path}.${a}`, nodeIds, "node");
          break;
        case "path":
          if (ctx.array(v, `${path}.path`, { minLength: 2 })) {
            v.forEach((id, k) => ctx.ref(id, `${path}.path[${k}]`, nodeIds, "node"));
            for (let k = 1; k < v.length; k++) {
              if (isStr(v[k - 1]) && isStr(v[k]) && nodeIds.includes(v[k - 1] as string) && nodeIds.includes(v[k] as string) && !hasEdge(v[k - 1] as string, v[k] as string)) {
                ctx.error(`${path}.path[${k}]`, `no edge from "${v[k - 1] as string}" to "${v[k] as string}": the path is not connected`);
              }
            }
          }
          break;
        case "note":
          if (!isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
          break;
      }
    });
  }
}

function validateChart(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["type", "categories", "series", "yMax", "yLabel", "sequence"]);
  const type = doc.type ?? "bar";
  if (doc.type !== undefined) ctx.enumOf(doc.type, "type", ["bar", "line"], "type");
  let n = 0;
  if (ctx.array(doc.categories, "categories", { minLength: 1 })) {
    n = doc.categories.length;
    doc.categories.forEach((c, i) => { if (!isStr(c)) ctx.error(`categories[${i}]`, `a category is a string`); });
  }
  let seriesIds: string[] = [];
  if (ctx.array(doc.series, "series", { minLength: 1 })) {
    seriesIds = ids(ctx, doc.series, "series");
    doc.series.forEach((s, i) => {
      const path = `series[${i}]`;
      if (!ctx.object(s, path)) return;
      ctx.keys(s, path, ["id", "label", "values", "color"]);
      if (ctx.array(s.values, `${path}.values`)) {
        if (n && s.values.length !== n) ctx.error(`${path}.values`, `${s.values.length} values for ${n} categories`, "one value per category");
        s.values.forEach((v, k) => ctx.number(v, `${path}.values[${k}]`));
      }
    });
  }
  if (doc.yMax !== undefined) ctx.number(doc.yMax, "yMax", { min: 0 });
  if (doc.sequence !== undefined && ctx.array(doc.sequence, "sequence")) {
    const ACTIONS = ["reveal", "set", "highlight", "unhighlight", "threshold", "note", ...ANNOTATION_ACTIONS];
    const cats = Array.isArray(doc.categories) ? (doc.categories.filter(isStr) as string[]) : [];
    const target = (v: unknown, path: string): void => {
      if (!ctx.object(v, path)) return;
      ctx.keys(v, path, ["series", "index", "category"]);
      if (v.series !== undefined) ctx.ref(v.series, `${path}.series`, seriesIds, "series");
      if (v.index !== undefined && ctx.number(v.index, `${path}.index`, { integer: true, min: 0 }) && v.index >= n) ctx.error(`${path}.index`, `index ${v.index} is out of range for ${n} categories (0..${n - 1})`);
      if (v.category !== undefined) ctx.ref(v.category, `${path}.category`, cats, "category");
      if (v.index !== undefined && v.category !== undefined) ctx.error(path, `give "index" or "category", not both`);
    };
    doc.sequence.forEach((st, i) => {
      const path = `sequence[${i}]`;
      if (!ctx.object(st, path)) return;
      const a = oneAction(ctx, st, path, ACTIONS, ["caption", "ms"], `{"reveal": "<series id>", "caption": "…"}`);
      if (a !== undefined && (ANNOTATION_ACTIONS as readonly string[]).includes(a)) {
        validateAnnotationOp(ctx, st, path, a);
        return;
      }
      if (!a) return;
      const v = st[a];
      switch (a) {
        case "reveal":
          if (v !== "all") idOrIds(ctx, v, `${path}.reveal`, seriesIds, "series");
          break;
        case "set":
          if (ctx.object(v, `${path}.set`)) {
            ctx.keys(v, `${path}.set`, ["series", "index", "value"]);
            ctx.ref(v.series, `${path}.set.series`, seriesIds, "series");
            if (ctx.number(v.index, `${path}.set.index`, { integer: true, min: 0 }) && v.index >= n) ctx.error(`${path}.set.index`, `index ${v.index} is out of range for ${n} categories (0..${n - 1})`);
            ctx.number(v.value, `${path}.set.value`);
            if (type === "line") ctx.error(`${path}.set`, `set animates a bar's height; a line chart's segments cannot be re-pointed`, `use "type": "bar", or a second series with the new values`);
          }
          break;
        case "highlight":
          target(v, `${path}.highlight`);
          break;
        case "unhighlight":
          if (v !== "all") target(v, `${path}.unhighlight`);
          break;
        case "threshold":
          if (ctx.object(v, `${path}.threshold`)) {
            ctx.keys(v, `${path}.threshold`, ["value", "label"]);
            ctx.number(v.value, `${path}.threshold.value`);
            if (v.label !== undefined && !isStr(v.label)) ctx.error(`${path}.threshold.label`, `label is a string`);
          }
          break;
        case "note":
          if (!isStr(v)) ctx.error(`${path}.note`, `note takes a string`);
          break;
      }
    });
  }
}

const TWEEN_TO_KEYS = ["x", "y", "w", "h", ...TRACK_PROPS];

function validateVector(ctx: Ctx, doc: Obj): void {
  validateBase(ctx, doc, ["nodes", "timeline"]);
  let nodeIds: string[] = [];
  if (ctx.array(doc.nodes, "nodes", { minLength: 1 })) {
    nodeIds = ids(ctx, doc.nodes, "nodes");
    doc.nodes.forEach((n, i) => validateTimelineNode(ctx, n, `nodes[${i}]`));
    doc.nodes.forEach((n, i) => {
      if (isObj(n) && n.parent !== undefined) ctx.ref(n.parent, `nodes[${i}].parent`, nodeIds, "node");
    });
  }
  if (ctx.array(doc.timeline, "timeline")) {
    doc.timeline.forEach((item, i) => {
      const path = `timeline[${i}]`;
      if (!ctx.object(item, path)) return;
      if (annotationItem(ctx, item, path)) return;
      if ("wait" in item) {
        ctx.keys(item, path, ["wait", "caption", "label"]);
        ctx.number(item.wait, `${path}.wait`, { min: 0 });
        return;
      }
      ctx.keys(item, path, ["target", "to", "duration", "easing", "at", "caption", "label"]);
      if (item.target === undefined) ctx.error(`${path}.target`, `a tween needs "target" (node id or list of ids), or use {"wait": ms}`);
      else idOrIds(ctx, item.target, `${path}.target`, nodeIds, "node");
      if (ctx.object(item.to, `${path}.to`)) {
        ctx.keys(item.to, `${path}.to`, TWEEN_TO_KEYS);
        for (const [k, v] of Object.entries(item.to)) {
          if (!TWEEN_TO_KEYS.includes(k)) continue;
          if (k === "x" || k === "y" || k === "w" || k === "h") ctx.number(v, `${path}.to.${k}`);
          else trackValue(ctx, k, v, `${path}.to.${k}`);
        }
        if (Object.keys(item.to).length === 0) ctx.error(`${path}.to`, `"to" is empty; name at least one property to animate`, `e.g. {"x": 200} or {"opacity": 0}`);
      }
      if (item.duration !== undefined) ctx.number(item.duration, `${path}.duration`, { min: 0 });
      easing(ctx, item.easing, `${path}.easing`);
      if (item.at !== undefined && !isNum(item.at) && !(isStr(item.at) && /^(<|[+-]\d+(\.\d+)?)$/.test(item.at))) {
        ctx.error(`${path}.at`, `at takes a number (ms), "<" (with previous), or "+N"/"-N" (offset from previous end); got ${describe(item.at)}`);
      }
    });
  }
}

export function validateScene(doc: unknown): Diagnostic[] {
  const ctx = new Ctx();
  if (!ctx.object(doc, "")) return ctx.diags;
  if (doc.format !== SCENE_FORMAT) {
    if (doc.format === TIMELINE_FORMAT) {
      ctx.error("format", `this is a timeline document, not a scene`, `validate it with the timeline validator, or set "format": "${SCENE_FORMAT}" and a "kind"`);
      return ctx.diags;
    }
    ctx.error("format", `expected "${SCENE_FORMAT}", got ${describe(doc.format)}`, `set "format": "${SCENE_FORMAT}"`);
  }
  if (!ctx.enumOf(doc.kind, "kind", SCENE_KINDS, "kind")) return ctx.diags;
  switch (doc.kind as Scene["kind"]) {
    case "compose": validateCompose(ctx, doc); break;
    case "diagram": validateDiagram(ctx, doc); break;
    case "modules": validateModules(ctx, doc); break;
    case "state-machine": validateStateMachine(ctx, doc); break;
    case "sort": validateSort(ctx, doc); break;
    case "array": validateArray(ctx, doc); break;
    case "stack": validateCollection(ctx, doc, "stack"); break;
    case "queue": validateCollection(ctx, doc, "queue"); break;
    case "list": validateList(ctx, doc); break;
    case "heap": validateHeap(ctx, doc); break;
    case "tree": validateTree(ctx, doc); break;
    case "distributed": validateDistributed(ctx, doc); break;
    case "matrix": validateMatrix(ctx, doc); break;
    case "graph": validateGraph(ctx, doc); break;
    case "chart": validateChart(ctx, doc); break;
    case "flowchart": validateFlowchart(ctx, doc); break;
    case "gantt": validateGantt(ctx, doc); break;
    case "vector": validateVector(ctx, doc); break;
  }
  return ctx.diags;
}

/** Route a document to the validator for its `format`. */
export function validateDocument(doc: unknown): { layer: "scene" | "timeline" | "unknown"; diagnostics: Diagnostic[] } {
  if (isObj(doc) && doc.format === TIMELINE_FORMAT) return { layer: "timeline", diagnostics: validateTimeline(doc) };
  if (isObj(doc) && doc.format === SCENE_FORMAT) return { layer: "scene", diagnostics: validateScene(doc) };
  return {
    layer: "unknown",
    diagnostics: [
      {
        severity: "error",
        path: "format",
        message: `expected "${SCENE_FORMAT}" or "${TIMELINE_FORMAT}", got ${isObj(doc) ? describe(doc.format) : describe(doc)}`,
        hint: `a scene starts {"format": "${SCENE_FORMAT}", "kind": "sort" | "state-machine" | …}`,
      },
    ],
  };
}

export const hasErrors = (diags: Diagnostic[]): boolean => diags.some((d) => d.severity === "error");

export function formatDiagnostics(diags: Diagnostic[]): string {
  return diags
    .map((d) => `${d.severity === "error" ? "✗" : "⚠"} ${d.path || "(root)"}: ${d.message}${d.hint ? `\n    → ${d.hint}` : ""}`)
    .join("\n");
}

export type { Timeline, Scene };
