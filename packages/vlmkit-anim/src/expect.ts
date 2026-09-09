/**
 * `check --expect facts.json`: the figure checked against the facts it claims to show.
 *
 * `check` proves a scene is well-formed and `layout` proves nothing is drawn on top of
 * anything, and both were green on a module map with a true dependency deleted and on a
 * walk that highlighted the wrong edge (v13: fe, gc). Neither reads the brief. The
 * expectation file is the brief's fact sheet in a shape the checker can read — which
 * modules exist, which depends on which, which dependency must not exist, which edges the
 * final frame points at, which module is in which container — and every line of it is
 * compared with the scene and with the final frame: drawn, in that direction, in that
 * style, lit or not. A drawn dependency that is on no list is an error too, so the
 * check is exact, not one-sided.
 *
 * v18 extends the sheet to the walked kinds. A `graph` has nodes, edges, the order the walk
 * visited them, the path it ends on and the labels it leaves; a `state-machine` has states,
 * transitions with their events, the initial and final states, the states the token walked
 * and the one it ends in; a `distributed` scene has lanes, the messages in the order they
 * are sent, which were lost, and each node's status at the end. Each field is read from
 * where the truth is — the scene for what is declared, the compiled meta for what the walk
 * did, the final frame for what the reader sees.
 */

import { themeOf } from "./compile/builder.ts";
import { normEdge } from "./compile/graph.ts";
import { normalizeModules } from "./compile/modules.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import type { Diagnostic, DiagramScene, DistMessage, Scene, Timeline } from "./types.ts";

export const EXPECT_FORMAT = "vlmkit-anim/expect@1";

/** The facts a scene must show. Every field is optional; an absent field is not checked. Which fields apply depends on the kind. */
export interface Expectation {
  format: typeof EXPECT_FORMAT;
  // ---- modules / diagram ----
  /** Module / node ids that must be drawn and visible at the end. When given, a drawn module not on the list is an error. */
  modules?: string[];
  /** `"a->b"`: real dependencies (a depends on b), each drawn in that direction. A drawn real dependency on neither this list nor `forbidden` is an error. */
  deps?: string[];
  /** `"a->b"`: drawn with `"style": "forbidden"` — the dependency that must not exist, shown as such. */
  forbidden?: string[];
  /** Module ids, group ids and edges `"a->b"` that are highlighted in the final frame — and nothing else is. On a graph: the nodes lit at the end. */
  highlighted?: string[];
  /** Group id → exactly its members. When given, a drawn group not on the list is an error. */
  groups?: Record<string, string[]>;
  // ---- graph / distributed ----
  /** Node ids (graph) or lane ids (distributed) that must be drawn; a drawn one not listed is an error. */
  nodes?: string[];
  /** graph: `"a->b"` — on a directed graph in that direction, on an undirected one either way (`"a<->b"` says so). Exact both ways. */
  edges?: string[];
  /** graph / state-machine: the nodes (states) the walk visited, in order. */
  visited?: string[];
  /** graph: the nodes of the path shown at the end, in order. */
  path?: string[];
  /** graph: node id → the label text beside it at the end. */
  labels?: Record<string, string>;
  // ---- state-machine ----
  /** State ids; a drawn state not listed is an error. */
  states?: string[];
  /** `"a->b"` or `"a->b:event"`: the transitions drawn; with the event, it must match. Exact both ways. */
  transitions?: string[];
  /** The initial state. */
  initial?: string;
  /** The states drawn as final (double ring) — exactly these. */
  final?: string[];
  /** The state the token ends in, lit in the final frame. */
  end?: string;
  // ---- distributed ----
  /** `"a->b"` or `"a->b:label"`: the messages in the order they are listed (notes and annotations skipped). */
  messages?: string[];
  /** `"a->b"` or `"a->b:label"`: the messages that are lost — and no other is. */
  lost?: string[];
  /** Node id → its status at the end (`up` `down` `leader` `busy`), read from the final frame. */
  status?: Record<string, string>;
}

const err = (path: string, message: string, hint?: string): Diagnostic => ({ severity: "error", path, message, ...(hint ? { hint } : {}) });

/** `"a->b"` → `["a", "b"]`; ids may carry `-` (`repo-port->domain`) and spaces, so split on the first arrow. */
export const parseEdge = (s: string): [string, string] | undefined => {
  const i = s.indexOf("->");
  if (i < 0) return undefined;
  const from = s.slice(0, i).trim();
  const to = s.slice(i + 2).trim();
  return from && to && !to.includes("->") ? [from, to] : undefined;
};
const edgeKey = (from: string, to: string): string => `${from}->${to}`;

/**
 * `"a->b"`, `"a<->b"`, `"a->b:tag"` → the pair, whether the writer said undirected, and the tag (an event, a
 * message label) after the first `:` that follows the arrow. The tag may itself contain `:`.
 */
export interface Link {
  from: string;
  to: string;
  undirected: boolean;
  tag?: string;
}
export const parseLink = (s: string): Link | undefined => {
  const arrow = s.indexOf("<->") >= 0 ? "<->" : "->";
  const i = s.indexOf(arrow);
  if (i < 0) return undefined;
  const from = s.slice(0, i).trim();
  let rest = s.slice(i + arrow.length);
  let tag: string | undefined;
  const c = rest.indexOf(":");
  if (c >= 0) {
    tag = rest.slice(c + 1).trim();
    rest = rest.slice(0, c);
  }
  const to = rest.trim();
  if (!from || !to || to.includes("->")) return undefined;
  return { from, to, undirected: arrow === "<->", ...(tag !== undefined ? { tag } : {}) };
};
const linkText = (l: { from: string; to: string; tag?: string }, undirected = false): string => `${l.from}${undirected ? "<->" : "->"}${l.to}${l.tag !== undefined ? `:${l.tag}` : ""}`;

const KNOWN_FIELDS = ["format", "modules", "deps", "forbidden", "highlighted", "groups", "nodes", "edges", "visited", "path", "labels", "states", "transitions", "initial", "final", "end", "messages", "lost", "status"];

/** Shape check: the same one-list-of-diagnostics contract as the scene validator. */
export function validateExpectation(doc: unknown): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [err("", "the expectation file must be a JSON object", `{"format": "${EXPECT_FORMAT}", "deps": ["a->b", …]}`)];
  const d = doc as Record<string, unknown>;
  if (d.format !== EXPECT_FORMAT) out.push(err("format", `"format" must be "${EXPECT_FORMAT}"${d.format === undefined ? " (missing)" : `, got ${JSON.stringify(d.format)}`}`));
  for (const k of Object.keys(d)) if (!KNOWN_FIELDS.includes(k)) out.push(err(k, `unknown field "${k}"`, `fields are ${KNOWN_FIELDS.join(", ")}`));
  const strings = (k: string, shape: "ids" | "deps" | "links"): void => {
    const v = d[k];
    if (v === undefined) return;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      out.push(err(k, `"${k}" must be an array of strings`, shape === "ids" ? `["a", "b"]` : shape === "deps" ? `["a->b", "b->c"]` : `["a->b", "a->b:label"]`));
      return;
    }
    if (shape === "deps") for (const [i, s] of (v as string[]).entries()) if (!parseEdge(s)) out.push(err(`${k}[${i}]`, `${JSON.stringify(s)} is not an edge`, `write it as "a->b" (a depends on b)`));
    if (shape === "links") for (const [i, s] of (v as string[]).entries()) if (!parseLink(s)) out.push(err(`${k}[${i}]`, `${JSON.stringify(s)} is not an edge`, k === "edges" ? `write it as "a->b" (or "a<->b" on an undirected graph)` : `write it as "a->b" or "a->b:${k === "transitions" ? "event" : "label"}"`));
  };
  const record = (k: string, example: string): void => {
    const v = d[k];
    if (v === undefined) return;
    if (!v || typeof v !== "object" || Array.isArray(v) || Object.values(v as object).some((x) => typeof x !== "string")) out.push(err(k, `"${k}" must be an object: id → text`, example));
  };
  const string = (k: string): void => {
    if (d[k] !== undefined && typeof d[k] !== "string") out.push(err(k, `"${k}" must be a string`, `"${k}": "idle"`));
  };
  strings("modules", "ids");
  strings("deps", "deps");
  strings("forbidden", "deps");
  strings("highlighted", "ids");
  if (d.groups !== undefined) {
    if (!d.groups || typeof d.groups !== "object" || Array.isArray(d.groups)) out.push(err("groups", `"groups" must be an object: group id → its members`, `{"frontend": ["web", "gateway"]}`));
    else for (const [g, members] of Object.entries(d.groups as Record<string, unknown>)) if (!Array.isArray(members) || members.some((x) => typeof x !== "string")) out.push(err(`groups.${g}`, `the members of "${g}" must be an array of ids`));
  }
  strings("nodes", "ids");
  strings("edges", "links");
  strings("visited", "ids");
  strings("path", "ids");
  record("labels", `{"b": "d=3"}`);
  strings("states", "ids");
  strings("transitions", "links");
  string("initial");
  strings("final", "ids");
  string("end");
  strings("messages", "links");
  strings("lost", "links");
  record("status", `{"n2": "down"}`);
  return out;
}

export interface ExpectResult {
  diagnostics: Diagnostic[];
  /** What was compared, field by field, for the one line `check` prints: `8 modules · 9 deps · 1 forbidden · 2 highlighted · 3 groups`. */
  compared: Record<string, number>;
}

/** The kinds a sheet can be checked against, and the fields each reads. */
export const EXPECT_KINDS: Record<string, (keyof Expectation)[]> = {
  modules: ["modules", "deps", "forbidden", "highlighted", "groups"],
  diagram: ["modules", "deps", "forbidden", "highlighted", "groups"],
  graph: ["nodes", "edges", "visited", "path", "labels", "highlighted"],
  flowchart: ["nodes", "edges", "visited", "end"],
  "state-machine": ["states", "transitions", "initial", "final", "visited", "end"],
  distributed: ["nodes", "messages", "lost", "status"],
};

/**
 * Compare a compiled scene with its facts. Reads the scene for what is declared (edges, styles, groups), the
 * compiled meta for what the walk did (visited, path), and the final frame for what is shown (visible, lit),
 * so a hidden module that no step shows and an edge lit by a `highlight` step are both judged by what the
 * reader sees.
 */
export function checkExpectation(exp: Expectation, scene: Scene, tl: Timeline): ExpectResult {
  const fields = EXPECT_KINDS[scene.kind];
  if (!fields) {
    return {
      diagnostics: [err("expect", `--expect reads a ${Object.keys(EXPECT_KINDS).map((k) => `"${k}"`).join(", ")} scene; this scene is a "${scene.kind}"`, "the facts name what those kinds draw and walk; other kinds have their own semantic checks")],
      compared: {},
    };
  }
  const compared: Record<string, number> = {};
  for (const f of fields) {
    const v = exp[f];
    if (v === undefined) continue;
    compared[f] = Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : 1;
  }
  const out: Diagnostic[] = [];
  // A field the sheet has that this kind does not read is a mistake in the sheet, said once.
  for (const k of Object.keys(exp) as (keyof Expectation)[]) {
    if (k === "format" || fields.includes(k) || exp[k] === undefined) continue;
    out.push(err(`expect.${k}`, `"${k}" is not a fact a "${scene.kind}" scene has; it is not compared`, `a ${scene.kind} sheet reads ${fields.join(", ")}`));
  }
  if (scene.kind === "modules" || scene.kind === "diagram") out.push(...checkModulesExpectation(exp, scene, tl));
  else if (scene.kind === "graph" || scene.kind === "flowchart") out.push(...checkGraphExpectation(exp, scene, tl));
  else if (scene.kind === "state-machine") out.push(...checkStateMachineExpectation(exp, scene, tl));
  else out.push(...checkDistributedExpectation(exp, scene as Extract<Scene, { kind: "distributed" }>, tl));
  return { diagnostics: out, compared };
}

// ---- shared -------------------------------------------------------------------------------

/** An exact set: every fact drawn, nothing drawn that is not a fact. */
function exactIds(path: string, field: string, word: string, want: string[], drawn: string[], hints: { missing: (id: string) => string; extra: (id: string) => string }): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const id of want) if (!drawn.includes(id)) out.push(err(`expect.${field}`, `${word} "${id}" is not drawn`, hints.missing(id)));
  for (const id of drawn) if (!want.includes(id)) out.push(err(`${path}(${id})`, `${word} "${id}" is drawn but the facts do not have it`, hints.extra(id)));
  return out;
}

/** An ordered list: the first place the two differ, and a length mismatch, each said once. */
function sequence(field: string, what: string, want: string[], got: string[], hint: string): Diagnostic[] {
  const show = (xs: string[]) => (xs.length ? xs.join(" → ") : "(nothing)");
  for (let i = 0; i < Math.min(want.length, got.length); i++) {
    if (want[i] !== got[i]) return [err(`expect.${field}`, `${what} differs at position ${i + 1}: the facts say ${show(want)}, the scene does ${show(got)}`, hint)];
  }
  if (want.length !== got.length) return [err(`expect.${field}`, `${what} has ${got.length} step(s) in the scene and ${want.length} in the facts: the facts say ${show(want)}, the scene does ${show(got)}`, hint)];
  return [];
}

// ---- modules / diagram ---------------------------------------------------------------------

function checkModulesExpectation(exp: Expectation, scene: Scene, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const d: DiagramScene = scene.kind === "modules" ? normalizeModules(scene) : (scene as DiagramScene);
  const depWord = scene.kind === "modules" ? "dependency" : "edge";
  const depsField = scene.kind === "modules" ? "deps" : "edges";
  const nodeWord = scene.kind === "modules" ? "module" : "node";
  const nodesField = scene.kind === "modules" ? "modules" : "nodes";
  const T = themeOf(scene);
  const frame = sampleFrame(tl, timelineDuration(tl));
  const visible = (id: string): boolean => (frame.get(id)?.opacity ?? 0) > 0;
  // `highlight` fills a node with the accent, and strokes a group outline or an edge with it.
  const litFill = (id: string): boolean => visible(id) && frame.get(id)?.fill === T.accent;
  const litStroke = (id: string): boolean => visible(id) && frame.get(id)?.stroke === T.accent;

  // What the scene draws, keyed the way the facts are written.
  const drawnNodes = d.nodes.map((n) => n.id);
  const edges = (d.edges ?? []).map((e, i) => ({ key: edgeKey(e.from, e.to), from: e.from, to: e.to, id: `edge-${i}`, forbidden: e.style === "forbidden" }));
  const byKey = new Map(edges.map((e) => [e.key, e]));
  const listed = new Set([...(exp.deps ?? []), ...(exp.forbidden ?? [])]);

  // Modules: each fact drawn and on screen; nothing drawn that the facts do not know. An id the picture spells
  // differently ("app-svc" for "app") would also fail every dependency naming it, so those wait until the ids
  // agree: one line says how many, instead of twenty saying the same thing (fe, fb against the v14 sheets).
  const unknownIds = new Set<string>();
  if (exp.modules) {
    for (const id of exp.modules) {
      if (!drawnNodes.includes(id)) {
        unknownIds.add(id);
        out.push(err(`expect.modules`, `${nodeWord} "${id}" is not drawn`, `add "${id}" to "${nodesField}" — the facts use these ids, so name the ${nodeWord} exactly "${id}"`));
      } else if (!visible(id)) out.push(err(`expect.modules`, `${nodeWord} "${id}" is hidden at the end: the reader never sees it`, `drop "hidden", or add {"show": "${id}"} to "sequence"`));
    }
    for (const id of drawnNodes) {
      if (exp.modules.includes(id)) continue;
      unknownIds.add(id);
      out.push(err(`${nodesField}(${id})`, `${nodeWord} "${id}" is drawn but the facts do not have it`, `remove it, or rename it to the id the facts use${exp.modules.length ? ` (${exp.modules.map((m) => `"${m}"`).join(", ")})` : ""}`));
    }
  }
  const namesUnknown = (from: string, to: string): boolean => unknownIds.has(from) || unknownIds.has(to);
  let waiting = 0;

  // Dependencies: each fact drawn, in that direction, as a real dependency.
  for (const key of exp.deps ?? []) {
    const [from, to] = parseEdge(key)!;
    if (namesUnknown(from, to)) {
      waiting++;
      continue;
    }
    const e = byKey.get(key);
    if (!e) {
      const reversed = byKey.get(edgeKey(to, from));
      if (reversed && !listed.has(reversed.key)) out.push(err(`${depsField}(${reversed.key})`, `${depWord} ${key} is drawn the other way round, as ${reversed.key}`, `["${from}", "${to}"] reads "${from} depends on ${to}": the arrow runs ${from} → ${to}`));
      else out.push(err(`expect.deps`, `${depWord} ${key} is missing from the picture`, `add ["${from}", "${to}"] to "${depsField}"`));
      continue;
    }
    if (e.forbidden) out.push(err(`${depsField}(${key})`, `${depWord} ${key} is drawn as forbidden, but the facts list it as a real ${depWord}`, `drop "style": "forbidden" on it`));
    else if (!visible(e.id)) out.push(err(`${depsField}(${key})`, `${depWord} ${key} is hidden at the end: the reader never sees it`, `drop "hidden", or add {"show": …} for its ${nodeWord}s to "sequence"`));
  }
  // Forbidden: drawn, and drawn as forbidden — a real arrow here bends the layers around a lie (fe, v13).
  for (const key of exp.forbidden ?? []) {
    const [from, to] = parseEdge(key)!;
    if (namesUnknown(from, to)) {
      waiting++;
      continue;
    }
    const e = byKey.get(key);
    if (!e) out.push(err(`expect.forbidden`, `the forbidden ${depWord} ${key} is not in the picture`, `add {"from": "${from}", "to": "${to}", "style": "forbidden"} to "${depsField}" — the reader must see the ${depWord} that must not exist`));
    else if (!e.forbidden) out.push(err(`${depsField}(${key})`, `${key} is drawn as a real ${depWord}; the facts say it must not exist`, `give it "style": "forbidden" — drawn red and dashed, ignored by the layout and the cycle check`));
  }
  // Nothing invented: a drawn edge the facts do not know, when the facts list edges at all.
  if (exp.deps || exp.forbidden) {
    for (const e of edges) {
      if (listed.has(e.key) || !visible(e.id)) continue;
      if (namesUnknown(e.from, e.to)) {
        waiting++;
        continue;
      }
      const reversedListed = listed.has(edgeKey(e.to, e.from));
      if (reversedListed) continue; // reported above as "the other way round"
      out.push(err(`${depsField}(${e.key})`, `${depWord} ${e.key} is drawn${e.forbidden ? " as forbidden" : ""} but the facts do not have it`, `remove it from "${depsField}" — or, if the picture is right, the facts are wrong: fix the expectation file`));
    }
  }
  if (waiting) {
    const noun = waiting === 1 ? depWord : depWord === "dependency" ? "dependencies" : "edges";
    out.push(err(`expect.deps`, `${waiting} ${noun} name${waiting === 1 ? "s" : ""} a ${nodeWord} id the picture and the facts spell differently — not compared until the ids agree`, `fix the ${nodeWord} ids above and run check again`));
  }

  // Highlighted: what is lit in the final frame is exactly the fact list (gc, v13: the wrong edge lit, green check).
  if (exp.highlighted) {
    const want = new Set(exp.highlighted);
    const litNow = new Set<string>();
    for (const id of drawnNodes) if (litFill(id)) litNow.add(id);
    for (const g of d.groups ?? []) if (litStroke(g.id)) litNow.add(g.id);
    for (const e of edges) if (litStroke(e.id)) litNow.add(e.key);
    for (const key of want) {
      const edge = parseEdge(key);
      const known = edge ? byKey.has(key) : drawnNodes.includes(key) || (d.groups ?? []).some((g) => g.id === key);
      if (!known) out.push(err(`expect.highlighted`, `"${key}" is not in the picture, so it cannot be highlighted`, edge ? `add ["${edge[0]}", "${edge[1]}"] to "${depsField}" first` : `add "${key}" to "${nodesField}" or "groups" first`));
      else if (!litNow.has(key)) out.push(err(`expect.highlighted`, `${edge ? depWord : "id"} ${JSON.stringify(key)} is not highlighted in the final frame`, `add {"highlight": ${JSON.stringify(key)}} to "sequence" (after any "unhighlight" of it)`));
    }
    for (const key of litNow) if (!want.has(key)) out.push(err(`sequence`, `${JSON.stringify(key)} is highlighted in the final frame but the facts do not point at it`, `the facts highlight ${exp.highlighted.length ? exp.highlighted.map((h) => JSON.stringify(h)).join(", ") : "nothing"}; unhighlight ${JSON.stringify(key)}, take it out of the "highlight" step, or drop its "tone": "accent"`));
  }

  // Groups: each named container holds exactly its members; no container the facts do not know.
  if (exp.groups) {
    const drawn = new Map((d.groups ?? []).map((g) => [g.id, g.nodes]));
    for (const [id, members] of Object.entries(exp.groups)) {
      const got = drawn.get(id);
      if (!got) {
        out.push(err(`expect.groups`, `group "${id}" is not drawn`, `add {"id": "${id}", "modules": [${members.map((m) => `"${m}"`).join(", ")}]} to "groups"`));
        continue;
      }
      const missing = members.filter((m) => !got.includes(m));
      const extra = got.filter((m) => !members.includes(m));
      if (missing.length || extra.length) {
        out.push(err(`groups(${id})`, `group "${id}" holds ${got.map((m) => `"${m}"`).join(", ") || "nothing"}; the facts say ${members.map((m) => `"${m}"`).join(", ")}`, [missing.length ? `add ${missing.map((m) => `"${m}"`).join(", ")}` : "", extra.length ? `remove ${extra.map((m) => `"${m}"`).join(", ")}` : ""].filter(Boolean).join("; ")));
      }
    }
    for (const id of drawn.keys()) if (!(id in exp.groups)) out.push(err(`groups(${id})`, `group "${id}" is drawn but the facts do not have it`, `remove it, or name it as the facts do (${Object.keys(exp.groups).map((g) => `"${g}"`).join(", ")})`));
  }

  return out;
}

// ---- graph ---------------------------------------------------------------------------------

function checkGraphExpectation(exp: Expectation, scene: Extract<Scene, { kind: "graph" | "flowchart" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const T = themeOf(scene);
  const frame = sampleFrame(tl, timelineDuration(tl));
  const meta = (tl.meta ?? {}) as { visited?: string[]; path?: string[]; labels?: Record<string, string> };
  const nodes = scene.nodes.map((n) => (typeof n === "string" ? n : n.id));
  // A flowchart is always directed; its edges carry the answer as a label, which a fact may name (`"q->b:yes"`).
  const directed = scene.kind === "flowchart" || scene.directed === true;
  const edges = scene.edges.map((e) => normEdge(e as Parameters<typeof normEdge>[0]) as { from: string; to: string; label?: string });
  const same = (a: { from: string; to: string; tag?: string }, b: { from: string; to: string; label?: string }): boolean =>
    ((a.from === b.from && a.to === b.to) || (!directed && a.from === b.to && a.to === b.from)) && (a.tag === undefined || a.tag === b.label);
  if (exp.end !== undefined) {
    const got = meta.visited?.[meta.visited.length - 1];
    if (got !== exp.end) out.push(err(`walk`, `the walk ends at "${got ?? "?"}"; the facts say "${exp.end}"`, `the walk has to end with a hop into "${exp.end}"`));
  }

  if (exp.nodes) out.push(...exactIds("nodes", "nodes", "node", exp.nodes, nodes, { missing: (id) => `add "${id}" to "nodes" — the facts use these ids`, extra: () => `remove it, or rename it to the id the facts use (${exp.nodes!.map((m) => `"${m}"`).join(", ")})` }));
  if (exp.edges) {
    const want = exp.edges.map((s) => parseLink(s)!);
    for (const w of want) {
      const hit = edges.find((e) => same(e, w));
      if (hit) continue;
      const reversed = directed ? edges.find((e) => e.from === w.to && e.to === w.from) : undefined;
      if (reversed && !want.some((x) => same(x, reversed))) out.push(err(`edges(${edgeKey(reversed.from, reversed.to)})`, `edge ${linkText(w)} is drawn the other way round, as ${edgeKey(reversed.from, reversed.to)}`, `on a directed graph ["${w.from}", "${w.to}"] is an arrow ${w.from} → ${w.to}`));
      else if (edges.some((e) => e.from === w.from && e.to === w.to)) out.push(err(`edges(${edgeKey(w.from, w.to)})`, `edge ${edgeKey(w.from, w.to)} is labelled "${edges.find((e) => e.from === w.from && e.to === w.to)!.label ?? ""}"; the facts say "${w.tag}"`, `set "label": "${w.tag}" on it`));
      else out.push(err(`expect.edges`, `edge ${linkText(w, !directed)} is missing from the picture`, `add ["${w.from}", "${w.to}"] to "edges"`));
    }
    for (const e of edges) {
      if (want.some((w) => same(w, e) || (w.from === e.from && w.to === e.to))) continue; // a wrong label was reported above
      if (directed && want.some((w) => w.from === e.to && w.to === e.from)) continue; // reported as "the other way round"
      out.push(err(`edges(${edgeKey(e.from, e.to)})`, `edge ${edgeKey(e.from, e.to)} is drawn but the facts do not have it`, `remove it from "edges" — or, if the picture is right, fix the expectation file`));
    }
  }
  if (exp.visited) out.push(...sequence("visited", "the order of visits", exp.visited, meta.visited ?? [], `"visited" is the order of the "visit" ops (or of the algorithm's visits from "start"); change the ops, the start, or the facts`));
  if (exp.path) {
    if (!meta.path?.length) out.push(err("expect.path", `no path is shown at the end; the facts expect ${exp.path.join(" → ")}`, `add {"path": ${JSON.stringify(exp.path)}} as the last op, or with "algorithm": "dijkstra" set "goal"`));
    else out.push(...sequence("path", "the path shown at the end", exp.path, meta.path, `the last "path" op (or dijkstra's route to "goal") is what the reader sees lit`));
  }
  if (exp.labels) {
    const got = meta.labels ?? {};
    for (const [id, text] of Object.entries(exp.labels)) {
      if (!nodes.includes(id)) out.push(err(`expect.labels`, `"${id}" is not a node, so it has no label`, `the nodes are ${nodes.map((n) => `"${n}"`).join(", ")}`));
      else if (got[id] === undefined) out.push(err(`expect.labels`, `node "${id}" has no label at the end; the facts say "${text}"`, `add {"label": {"node": "${id}", "text": "${text}"}}`));
      else if (got[id] !== text) out.push(err(`ops`, `node "${id}" ends labelled "${got[id]}"; the facts say "${text}"`, `the last "label" op for "${id}" is what the reader sees`));
    }
  }
  if (exp.highlighted) {
    const lit = nodes.filter((id) => (frame.get(`node-${id}`)?.opacity ?? 0) > 0 && frame.get(`node-${id}`)?.fill === T.accent);
    for (const id of exp.highlighted) {
      if (!nodes.includes(id)) out.push(err(`expect.highlighted`, `"${id}" is not in the picture, so it cannot be highlighted`, `add "${id}" to "nodes" first`));
      else if (!lit.includes(id)) out.push(err(`expect.highlighted`, `node "${id}" is not highlighted in the final frame`, `add {"highlight": "${id}"} after any "unhighlight" of it — a visited node is green, not lit`));
    }
    for (const id of lit) if (!exp.highlighted.includes(id)) out.push(err(`ops`, `node "${id}" is highlighted in the final frame but the facts do not point at it`, `unhighlight it, or take it out of the "highlight" op`));
  }
  return out;
}

// ---- state-machine -------------------------------------------------------------------------

function checkStateMachineExpectation(exp: Expectation, scene: Extract<Scene, { kind: "state-machine" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const T = themeOf(scene);
  const frame = sampleFrame(tl, timelineDuration(tl));
  const meta = (tl.meta ?? {}) as { visited?: string[] };
  const states = scene.states.map((s) => (typeof s === "string" ? { id: s, final: false } : { id: s.id, final: s.final === true }));
  const ids = states.map((s) => s.id);
  const trText = (t: { from: string; to: string; on: string }) => `${t.from}->${t.to}:${t.on}`;

  if (exp.states) out.push(...exactIds("states", "states", "state", exp.states, ids, { missing: (id) => `add "${id}" to "states" — the facts use these ids`, extra: () => `remove it, or rename it to the id the facts use (${exp.states!.map((m) => `"${m}"`).join(", ")})` }));
  if (exp.transitions) {
    const want = exp.transitions.map((s) => parseLink(s)!);
    const matches = (w: Link, t: { from: string; to: string; on: string }) => w.from === t.from && w.to === t.to && (w.tag === undefined || w.tag === t.on);
    for (const w of want) {
      if (scene.transitions.some((t) => matches(w, t))) continue;
      const pair = scene.transitions.filter((t) => t.from === w.from && t.to === w.to);
      if (w.tag !== undefined && pair.length) out.push(err(`transitions(${edgeKey(w.from, w.to)})`, `transition ${edgeKey(w.from, w.to)} fires on ${pair.map((t) => `"${t.on}"`).join(", ")}; the facts say "${w.tag}"`, `set "on": "${w.tag}" on it`));
      else out.push(err(`expect.transitions`, `transition ${linkText(w)} is missing from the picture`, `add {"from": "${w.from}", "to": "${w.to}", "on": "${w.tag ?? "…"}"} to "transitions"`));
    }
    // A drawn transition whose pair the facts name with another event was reported above as the wrong event.
    for (const t of scene.transitions) if (!want.some((w) => w.from === t.from && w.to === t.to)) out.push(err(`transitions(${trText(t)})`, `transition ${trText(t)} is drawn but the facts do not have it`, `remove it from "transitions" — or, if the picture is right, fix the expectation file`));
  }
  if (exp.initial !== undefined && exp.initial !== scene.initial) out.push(err(`initial`, `the machine starts in "${scene.initial}"; the facts say "${exp.initial}"`, `set "initial": "${exp.initial}"`));
  if (exp.final) {
    const drawnFinal = states.filter((s) => s.final).map((s) => s.id);
    for (const id of exp.final) if (!drawnFinal.includes(id)) out.push(err(`expect.final`, `state "${id}" is not drawn as final (double ring)`, ids.includes(id) ? `write it as {"id": "${id}", "final": true} in "states"` : `add "${id}" to "states" with "final": true`));
    for (const id of drawnFinal) if (!exp.final.includes(id)) out.push(err(`states(${id})`, `state "${id}" is drawn as final but the facts do not have it final`, `drop "final": true on it`));
  }
  if (exp.visited) out.push(...sequence("visited", "the states the token walked", exp.visited, meta.visited ?? [], `"visited" starts at "initial" and follows the "trace"; change the trace, or the facts`));
  if (exp.end !== undefined) {
    const got = meta.visited?.[meta.visited.length - 1];
    if (got !== exp.end) out.push(err(`trace`, `the token ends in "${got ?? "?"}"; the facts say "${exp.end}"`, `the trace has to end with a transition into "${exp.end}"`));
    else if (frame.get(`state-${exp.end}`)?.fill !== T.accent) out.push(err(`trace`, `the token ends in "${exp.end}" but the state is not lit in the final frame`, `the current state is drawn in the accent colour; report this if the trace does end there`));
  }
  return out;
}

// ---- distributed ---------------------------------------------------------------------------

const STATUS_FILL: Record<string, "node" | "bad" | "accent" | "muted"> = { up: "node", down: "bad", leader: "accent", busy: "muted" };

function checkDistributedExpectation(exp: Expectation, scene: Extract<Scene, { kind: "distributed" }>, tl: Timeline): Diagnostic[] {
  const out: Diagnostic[] = [];
  const T = themeOf(scene);
  const frame = sampleFrame(tl, timelineDuration(tl));
  const nodes = scene.nodes.map((n) => (typeof n === "string" ? n : n.id));
  const msgs = scene.messages.filter((m): m is DistMessage => "from" in m && "to" in m);
  const msgText = (m: DistMessage) => `${m.from}->${m.to}${m.label !== undefined ? `:${m.label}` : ""}`;
  const matches = (w: Link, m: DistMessage) => w.from === m.from && w.to === m.to && (w.tag === undefined || w.tag === m.label);

  if (exp.nodes) out.push(...exactIds("nodes", "nodes", "node", exp.nodes, nodes, { missing: (id) => `add "${id}" to "nodes" — the facts use these ids`, extra: () => `remove it, or rename it to the id the facts use (${exp.nodes!.map((m) => `"${m}"`).join(", ")})` }));
  if (exp.messages) {
    const want = exp.messages.map((s) => parseLink(s)!);
    const n = Math.min(want.length, msgs.length);
    let told = false;
    for (let i = 0; i < n; i++) {
      if (matches(want[i], msgs[i])) continue;
      out.push(err(`messages[${i}]`, `message ${i + 1} is ${msgText(msgs[i])}; the facts say ${linkText(want[i])}`, `the facts list the messages in the order they are written in "messages"; reorder, relabel, or fix the sheet`));
      told = true;
      break;
    }
    if (!told && want.length !== msgs.length) out.push(err(`expect.messages`, `the scene sends ${msgs.length} message(s); the facts list ${want.length}`, want.length > msgs.length ? `missing: ${want.slice(msgs.length).map((w) => linkText(w)).join(", ")}` : `not in the facts: ${msgs.slice(want.length).map(msgText).join(", ")}`));
  }
  if (exp.lost) {
    const want = exp.lost.map((s) => parseLink(s)!);
    for (const w of want) {
      const hit = msgs.filter((m) => matches(w, m));
      if (!hit.length) out.push(err(`expect.lost`, `message ${linkText(w)} is not in the picture, so it cannot be lost`, `add it to "messages" with "lost": true`));
      else if (!hit.some((m) => m.lost)) out.push(err(`messages(${linkText(w)})`, `message ${linkText(w)} is delivered; the facts say it is lost`, `set "lost": true on it — it fades mid-way and never lands`));
    }
    for (const m of msgs) if (m.lost && !want.some((w) => matches(w, m))) out.push(err(`messages(${msgText(m)})`, `message ${msgText(m)} is lost but the facts do not have it lost`, `drop "lost": true on it, or add it to the sheet's "lost"`));
  }
  if (exp.status) {
    for (const [id, status] of Object.entries(exp.status)) {
      if (!nodes.includes(id)) {
        out.push(err(`expect.status`, `"${id}" is not a node, so it has no status`, `the nodes are ${nodes.map((n) => `"${n}"`).join(", ")}`));
        continue;
      }
      const key = STATUS_FILL[status];
      if (!key) {
        out.push(err(`expect.status`, `"${status}" is not a status`, `statuses are up, down, leader, busy`));
        continue;
      }
      const fill = frame.get(`node-${id}`)?.fill;
      const got = Object.entries(STATUS_FILL).find(([, k]) => T[k] === fill)?.[0] ?? "up";
      if (got !== status) out.push(err(`events`, `node "${id}" ends ${got}; the facts say ${status}`, `add {"node": "${id}", "status": "${status}", "after": "<the message that causes it>"} to "events"`));
    }
  }
  return out;
}

const WORDS: Record<string, [string, string]> = {
  modules: ["module", "modules"],
  deps: ["dependency", "dependencies"],
  forbidden: ["forbidden", "forbidden"],
  highlighted: ["highlighted", "highlighted"],
  groups: ["group", "groups"],
  nodes: ["node", "nodes"],
  edges: ["edge", "edges"],
  visited: ["visit", "visits"],
  path: ["path node", "path nodes"],
  labels: ["label", "labels"],
  states: ["state", "states"],
  transitions: ["transition", "transitions"],
  initial: ["initial state", "initial state"],
  final: ["final state", "final states"],
  end: ["end state", "end state"],
  messages: ["message", "messages"],
  lost: ["lost", "lost"],
  status: ["status", "statuses"],
};

/** The line `check` prints under the stats when `--expect` ran clean. */
export function formatCompared(c: ExpectResult["compared"]): string {
  const parts = Object.entries(c)
    .filter(([, n]) => n)
    .map(([k, n]) => {
      const [one, many] = WORDS[k] ?? [k, k];
      if (k === "modules" || k === "groups") return `${n} ${one}(s)`;
      return `${n} ${n === 1 ? one : many}`;
    });
  return parts.length ? parts.join(" · ") : "an empty fact sheet (nothing to compare)";
}

/** The writing guide for the file, printed by `vlmkit-anim schema --kind expect`. */
export const EXPECT_SHEET = `expect — the facts a scene must show, for \`check --expect facts.json\`

  A brief's fact sheet in a shape the checker reads: \`check\` proves the scene is well-formed and
  \`layout\` that nothing is drawn on anything, but neither knows that a dependency you deleted
  was real or that you highlighted the wrong edge. The expectation file does. Every field is
  optional and an absent field is not checked; a present one is checked exactly — what is listed
  must be drawn, and what is drawn must be listed. Which fields apply depends on the kind.

  format       "${EXPECT_FORMAT}"

  modules / diagram
  modules      ids that must be drawn and visible at the end; a drawn module not on the list is an error
  deps         "a->b" (a depends on b): drawn, in that direction, as a real dependency
  forbidden    "a->b": drawn with "style": "forbidden" — the dependency that must not exist
  highlighted  module / group ids and edges "a->b" that are lit in the final frame, and nothing else — by a
               "highlight" step or by "tone": "accent" on the module or dependency
  groups       {"id": ["member", …]}: each container holds exactly these; a drawn group not listed is an error

  graph
  nodes        ids drawn, exactly these
  edges        "a->b" — in that direction when "directed", either way otherwise ("a<->b" says so); exactly these
  visited      the nodes in the order the walk visits them ("visit" ops, or the algorithm from "start"; start first)
  path         the nodes of the path lit at the end, in order (the last "path" op, or dijkstra's route to "goal")
  labels       {"node": "text"}: the label beside a node at the end
  highlighted  the nodes lit by "highlight" in the final frame, and nothing else (visited nodes are green, not lit)

  flowchart
  nodes, edges ("a->b" or "a->b:yes" — with the answer, it must match), visited (start first, then every hop), end (where it stops)

  state-machine
  states       ids drawn, exactly these          initial   the state the token starts in
  transitions  "a->b" or "a->b:event": exactly these; with the event, it must match
  final        the states drawn as final (double ring), exactly these
  visited      the states the token walks, in order, starting at "initial"
  end          the state the token ends in, lit in the final frame

  distributed
  nodes        the lanes, exactly these
  messages     "a->b" or "a->b:label": every message, in the order written (notes and annotations skipped)
  lost         "a->b:label": the messages that never land — and no other does
  status       {"node": "up" | "down" | "leader" | "busy"}: a node's status in the final frame

Example
{
  "format": "${EXPECT_FORMAT}",
  "modules": ["web", "api", "db"],
  "deps": ["web->api", "api->db"],
  "forbidden": ["web->db"],
  "highlighted": ["api->db"],
  "groups": { "edge": ["web"], "core": ["api"], "infra": ["db"] }
}

Then: vlmkit-anim check scene.json --expect facts.json
      (\`vlmkit-anim repo\` writes the workspace's own fact sheet as <name>.expect.json;
       \`vlmkit-anim facts src --depth 1\` writes one from a directory's import graph)`;
