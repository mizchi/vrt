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
 */

import { themeOf } from "./compile/builder.ts";
import { normalizeModules } from "./compile/modules.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import type { Diagnostic, DiagramScene, Scene, Timeline } from "./types.ts";

export const EXPECT_FORMAT = "vlmkit-anim/expect@1";

/** The facts a `modules` or `diagram` scene must show. Every field is optional; an absent field is not checked. */
export interface Expectation {
  format: typeof EXPECT_FORMAT;
  /** Module / node ids that must be drawn and visible at the end. When given, a drawn module not on the list is an error. */
  modules?: string[];
  /** `"a->b"`: real dependencies (a depends on b), each drawn in that direction. A drawn real dependency on neither this list nor `forbidden` is an error. */
  deps?: string[];
  /** `"a->b"`: drawn with `"style": "forbidden"` — the dependency that must not exist, shown as such. */
  forbidden?: string[];
  /** Module ids, group ids and edges `"a->b"` that are highlighted in the final frame — and nothing else is. */
  highlighted?: string[];
  /** Group id → exactly its members. When given, a drawn group not on the list is an error. */
  groups?: Record<string, string[]>;
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

/** Shape check: the same one-list-of-diagnostics contract as the scene validator. */
export function validateExpectation(doc: unknown): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [err("", "the expectation file must be a JSON object", `{"format": "${EXPECT_FORMAT}", "deps": ["a->b", …]}`)];
  const d = doc as Record<string, unknown>;
  if (d.format !== EXPECT_FORMAT) out.push(err("format", `"format" must be "${EXPECT_FORMAT}"${d.format === undefined ? " (missing)" : `, got ${JSON.stringify(d.format)}`}`));
  const known = ["format", "modules", "deps", "forbidden", "highlighted", "groups"];
  for (const k of Object.keys(d)) if (!known.includes(k)) out.push(err(k, `unknown field "${k}"`, `fields are ${known.join(", ")}`));
  const strings = (k: string, edges: boolean): void => {
    const v = d[k];
    if (v === undefined) return;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      out.push(err(k, `"${k}" must be an array of strings`, edges ? `["a->b", "b->c"]` : `["a", "b"]`));
      return;
    }
    if (edges) for (const [i, s] of (v as string[]).entries()) if (!parseEdge(s)) out.push(err(`${k}[${i}]`, `${JSON.stringify(s)} is not an edge`, `write it as "a->b" (a depends on b)`));
  };
  strings("modules", false);
  strings("deps", true);
  strings("forbidden", true);
  strings("highlighted", false);
  if (d.groups !== undefined) {
    if (!d.groups || typeof d.groups !== "object" || Array.isArray(d.groups)) out.push(err("groups", `"groups" must be an object: group id → its members`, `{"frontend": ["web", "gateway"]}`));
    else for (const [g, members] of Object.entries(d.groups as Record<string, unknown>)) if (!Array.isArray(members) || members.some((x) => typeof x !== "string")) out.push(err(`groups.${g}`, `the members of "${g}" must be an array of ids`));
  }
  return out;
}

export interface ExpectResult {
  diagnostics: Diagnostic[];
  /** What was compared, for the one line `check` prints: `8 modules · 9 deps · 1 forbidden · 2 highlighted · 3 groups`. */
  compared: { modules: number; deps: number; forbidden: number; highlighted: number; groups: number };
}

/**
 * Compare a compiled scene with its facts. Reads the scene for what is declared (edges, styles, groups) and the
 * final frame for what is shown (visible, highlighted), so a hidden module that no step shows and an edge lit by a
 * `highlight` step are both judged by what the reader sees.
 */
export function checkExpectation(exp: Expectation, scene: Scene, tl: Timeline): ExpectResult {
  const compared = { modules: exp.modules?.length ?? 0, deps: exp.deps?.length ?? 0, forbidden: exp.forbidden?.length ?? 0, highlighted: exp.highlighted?.length ?? 0, groups: exp.groups ? Object.keys(exp.groups).length : 0 };
  const out: Diagnostic[] = [];
  if (scene.kind !== "modules" && scene.kind !== "diagram") {
    out.push(err("expect", `--expect reads a "modules" or "diagram" scene; this scene is a "${scene.kind}"`, "the facts name modules, dependencies, groups and highlighted edges, which only those kinds have"));
    return { diagnostics: out, compared };
  }
  const d: DiagramScene = scene.kind === "modules" ? normalizeModules(scene) : scene;
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
    for (const key of litNow) if (!want.has(key)) out.push(err(`sequence`, `${JSON.stringify(key)} is highlighted in the final frame but the facts do not point at it`, `the facts highlight ${exp.highlighted.length ? exp.highlighted.map((h) => JSON.stringify(h)).join(", ") : "nothing"}; unhighlight ${JSON.stringify(key)} or take it out of the "highlight" step`));
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

  return { diagnostics: out, compared };
}

/** The line `check` prints under the stats when `--expect` ran clean. */
export function formatCompared(c: ExpectResult["compared"]): string {
  const parts = [c.modules && `${c.modules} module(s)`, c.deps && `${c.deps} dependenc${c.deps === 1 ? "y" : "ies"}`, c.forbidden && `${c.forbidden} forbidden`, c.highlighted && `${c.highlighted} highlighted`, c.groups && `${c.groups} group(s)`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "an empty fact sheet (nothing to compare)";
}

/** The writing guide for the file, printed by `vlmkit-anim schema --kind expect`. */
export const EXPECT_SHEET = `expect — the facts a modules / diagram scene must show, for \`check --expect facts.json\`

  A brief's fact sheet in a shape the checker reads: \`check\` proves the scene is well-formed and
  \`layout\` that nothing is drawn on anything, but neither knows that a dependency you deleted
  was real or that you highlighted the wrong edge. The expectation file does. Every field is
  optional and an absent field is not checked; a present one is checked exactly — what is listed
  must be drawn, and what is drawn must be listed.

  format       "${EXPECT_FORMAT}"
  modules      ids that must be drawn and visible at the end; a drawn module not on the list is an error
  deps         "a->b" (a depends on b): drawn, in that direction, as a real dependency
  forbidden    "a->b": drawn with "style": "forbidden" — the dependency that must not exist
  highlighted  module / group ids and edges "a->b" that are lit in the final frame, and nothing else — by a
               "highlight" step or by "tone": "accent" on the module or dependency
  groups       {"id": ["member", …]}: each container holds exactly these; a drawn group not listed is an error

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
      (\`vlmkit-anim repo\` writes the workspace's own fact sheet as <name>.expect.json)`;
