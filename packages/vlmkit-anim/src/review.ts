/**
 * Visual review of a contact sheet by a vision model — or by any reader that
 * can look at a PNG and fill in JSON — and the comparison of that reading
 * against the deterministic layout report.
 *
 * Three pieces, so the same protocol runs with an API key (`vlmkit-anim review
 * --model`), with an agent looking at the sheet (`--answers` its JSON), or with
 * a person:
 *
 *   reviewBrief()   the prompt: what the tiles are, what counts as an issue, the JSON to return
 *   parseAnswers()  the reader's JSON, checked against that shape
 *   scoreReview()   frame-level agreement with `layoutReport`: both flag / only the model / only the geometry
 *
 * The score is per frame, not per element: readers name things in words
 * ("the Batch 2 label sits on box3"), the geometry names node ids, and the
 * question a round asks is whether they see the same frames as broken.
 */

import type { LayoutReport } from "./layout.ts";

export interface ReviewTile {
  index: number;
  step?: number;
  t: number;
  caption?: string;
}

export interface ReviewIssue {
  kind: "overlap" | "clipped" | "crossed" | "offscreen" | "illegible" | "other";
  what: string;
  severity?: "minor" | "major";
}

export interface ReviewFrame {
  frame: number;
  issues: ReviewIssue[];
}

export interface ReviewAnswers {
  frames: ReviewFrame[];
  /** Free text the reader wanted to add. */
  notes?: string;
}

export const REVIEW_KINDS = ["overlap", "clipped", "crossed", "offscreen", "illegible", "other"] as const;

/** The brief a reader gets with the sheet. `tiles` come from the sheet's own labels. */
export function reviewBrief(title: string, tiles: ReviewTile[]): string {
  const list = tiles.map((t) => `- frame ${t.index}${t.step !== undefined ? ` (step ${t.step})` : ""}, ${Math.round(t.t)}ms${t.caption ? `: ${t.caption}` : ""}`).join("\n");
  return `# Visual review: ${title}

The image is a contact sheet: every frame of one explanatory animation, in reading order, each
tile labelled with its frame number, step and time, with the step's caption under it.

Look at each tile and report **layout defects only** — not whether the explanation is good:

- **overlap**: two pieces of text on top of each other, or text under a filled box that is not its own
  (a label on a column header, a readout under an arrow's label, a callout box hiding a cell).
- **clipped**: text cut off at the tile's edge (a title missing its first letters, a caption running out).
- **crossed**: a line or arrow drawn straight through a label, or through a box that is not one of its ends.
- **offscreen**: an arrow, box or label that clearly continues past the edge of the frame.
- **illegible**: text too small or too crowded to read at this size.
- **other**: anything else that looks wrong in the drawing (an arrow pointing at nothing, a line through a box).

Do not report the caption under a tile (it is outside the frame), and do not report the tile borders.
Report each defect once per frame it appears in; if a defect persists across frames, list it for every
frame where it is visible.

Frames on this sheet:
${list}

Return **only** JSON of this shape, one entry per frame (include frames with an empty issues list):

\`\`\`json
{
  "frames": [
    { "frame": 1, "issues": [] },
    { "frame": 7, "issues": [ { "kind": "overlap", "what": "label 'Batch 2' sits on the column header 'box3'", "severity": "minor" } ] }
  ],
  "notes": "optional, anything you were unsure about"
}
\`\`\`
`;
}

/** Tiles as the sheet renders them, from the same sample times. */
export function reviewTiles(tl: { steps?: { t: number; caption?: string }[] }, times: number[]): ReviewTile[] {
  const steps = [...(tl.steps ?? [])].sort((a, b) => a.t - b.t);
  return times.map((t, i) => {
    let stepIndex = -1;
    for (let k = 0; k < steps.length; k++) if (steps[k].t <= t) stepIndex = k;
    const step = stepIndex >= 0 ? steps[stepIndex] : undefined;
    return { index: i + 1, step: step ? stepIndex + 1 : undefined, t, caption: step?.caption };
  });
}

/** Parse a reader's JSON (a fenced block is tolerated). Throws with a reason a reader can act on. */
export function parseAnswers(text: string): ReviewAnswers {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    throw new Error(`review answers are not JSON: ${(e as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { frames?: unknown }).frames)) {
    throw new Error('review answers need {"frames": [...]}');
  }
  const frames = ((raw as { frames: unknown[] }).frames).map((f, i) => {
    if (typeof f !== "object" || f === null) throw new Error(`frames[${i}] is not an object`);
    const fr = f as { frame?: unknown; issues?: unknown };
    if (typeof fr.frame !== "number") throw new Error(`frames[${i}].frame must be a number`);
    const issues = Array.isArray(fr.issues) ? fr.issues : [];
    return {
      frame: fr.frame,
      issues: issues.map((it, j) => {
        const is = (it ?? {}) as { kind?: unknown; what?: unknown; severity?: unknown };
        const kind = REVIEW_KINDS.includes(is.kind as (typeof REVIEW_KINDS)[number]) ? (is.kind as ReviewIssue["kind"]) : "other";
        if (typeof is.what !== "string") throw new Error(`frames[${i}].issues[${j}].what must be a string`);
        const severity: ReviewIssue["severity"] = is.severity === "major" || is.severity === "minor" ? is.severity : undefined;
        const issue: ReviewIssue = { kind, what: is.what, ...(severity ? { severity } : {}) };
        return issue;
      }),
    };
  });
  const notes = typeof (raw as { notes?: unknown }).notes === "string" ? (raw as { notes: string }).notes : undefined;
  return { frames, ...(notes ? { notes } : {}) };
}

export interface ReviewScoreFrame {
  frame: number;
  geometry: number;
  reader: number;
  /** both | reader-only | geometry-only | neither */
  agreement: "both" | "reader-only" | "geometry-only" | "neither";
}

export interface ReviewScore {
  frames: ReviewScoreFrame[];
  totals: {
    frames: number;
    both: number;
    readerOnly: number;
    geometryOnly: number;
    neither: number;
    /** Of the frames the geometry flags, how many the reader also flagged. */
    recall: number;
    /** Of the frames the reader flags, how many the geometry also flagged. */
    precision: number;
    readerIssues: number;
    geometryIssues: number;
  };
}

/** Frame-level agreement between the geometry and a reader. Frames the reader did not mention count as clean. */
export function scoreReview(report: LayoutReport, answers: ReviewAnswers): ReviewScore {
  const byFrame = new Map(answers.frames.map((f) => [f.frame, f.issues.length]));
  const frames: ReviewScoreFrame[] = report.frames.map((f) => {
    const geometry = f.issues.length;
    const reader = byFrame.get(f.index) ?? 0;
    const agreement = geometry && reader ? "both" : reader ? "reader-only" : geometry ? "geometry-only" : "neither";
    return { frame: f.index, geometry, reader, agreement };
  });
  const both = frames.filter((f) => f.agreement === "both").length;
  const readerOnly = frames.filter((f) => f.agreement === "reader-only").length;
  const geometryOnly = frames.filter((f) => f.agreement === "geometry-only").length;
  const neither = frames.filter((f) => f.agreement === "neither").length;
  const r = (n: number, d: number) => (d ? Math.round((n / d) * 100) / 100 : 1);
  return {
    frames,
    totals: {
      frames: frames.length,
      both,
      readerOnly,
      geometryOnly,
      neither,
      recall: r(both, both + geometryOnly),
      precision: r(both, both + readerOnly),
      readerIssues: answers.frames.reduce((s, f) => s + f.issues.length, 0),
      geometryIssues: report.frames.reduce((s, f) => s + f.issues.length, 0),
    },
  };
}

// ---- a still figure, read back (v21) ---------------------------------------------------------
//
// A contact sheet asks "what is broken"; a still figure asks "what does it say". A module map is
// green when the picture matches the facts as compiled — v14 — but whether a reader recovers those
// facts from the pixels is a different question: an arrow whose head is lost in a box corner reads
// the other way round, a module at a container's edge reads as inside it. So the still brief asks
// the reader to read the figure back — every box, every container and what is directly inside it,
// which container is inside which, every arrow tail → head, what is coloured — and the score
// compares that reading with `sceneFacts`, name by name, plus the layout defects as on a sheet.

/** A reader's account of one still figure. Names are the labels as drawn; the scorer resolves them to ids. */
export interface Reading {
  /** Every box (module / node) label. */
  modules: string[];
  /** `"from->to"`, tail to head, by label. */
  deps: string[];
  /** `"from->to"`: the red dashed arrows — dependencies drawn as forbidden. */
  forbidden: string[];
  /** Container label → the boxes directly inside it (not those inside an inner container). */
  groups: Record<string, string[]>;
  /** Inner container label → the container it sits inside. */
  nesting: Record<string, string>;
  /** Boxes, containers or arrows drawn in the accent colour. */
  highlighted: string[];
  /** Layout defects, as on a sheet. */
  issues: ReviewIssue[];
  notes?: string;
}

/** The brief a reader gets with the figure. `nodeWord` / `groupWord` follow the kind (`module` / `container` for a map). */
export function stillBrief(title: string, opts: { nodeWord?: string; groupWord?: string; depWord?: string } = {}): string {
  const node = opts.nodeWord ?? "module";
  const group = opts.groupWord ?? "container";
  const dep = opts.depWord ?? "dependency";
  return `# Read this figure: ${title}

The image is one still figure: boxes (each a ${node}), rounded ${group}s drawn round some of them, and
arrows between boxes (each a ${dep}: from the arrow's tail to its head).

Read the figure back, exactly as drawn — do not infer what "should" be there:

- **modules**: the text in every box, spelled as written.
- **deps**: every plain arrow as \`"tail->head"\` using the box texts. The head is the end with the arrowhead.
  A grey dashed arrow counts as a ${dep} too; say so in notes if it looks different from the others.
- **forbidden**: every **red dashed** arrow, the same way — it draws a ${dep} that must not exist (often with
  a "✗" or "never" label). List it here, not in deps and not in highlighted.
- **groups**: for every ${group}, its label and the boxes **directly** inside it — a box inside an inner
  ${group} belongs to the inner one, not the outer.
- **nesting**: every ${group} drawn inside another ${group}: \`"inner": "outer"\`.
- **highlighted**: anything filled or outlined in a strong accent colour (not the plain box outline).
- **issues**: layout defects only — \`overlap\` (text on text, or text under a box that is not its own),
  \`clipped\` (text cut at the edge), \`crossed\` (a line or arrow through a label or through a box that is not
  one of its ends), \`illegible\` (too small to read), \`other\`. Say what and where.

If a name is hard to read, write what you see and add a note. If an arrow's direction is unclear, put your
best reading in deps and name the arrow in notes.

Return **only** JSON of this shape:

\`\`\`json
{
  "modules": ["web app", "API gateway"],
  "deps": ["web app->API gateway"],
  "forbidden": ["domain model->Postgres"],
  "groups": { "clients": ["web app"], "backend": ["API gateway"] },
  "nesting": { "services": "backend" },
  "highlighted": [],
  "issues": [ { "kind": "crossed", "what": "the arrow from orders to Postgres runs through the label 'core'" } ],
  "notes": "optional"
}
\`\`\`
`;
}

/** Parse a reader's reading (a fenced block is tolerated). Every field is optional in the text; missing ones are empty. */
export function parseReading(text: string): Reading {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (e) {
    throw new Error(`reading is not JSON: ${(e as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("reading must be a JSON object");
  const r = raw as Record<string, unknown>;
  const strings = (v: unknown, field: string): string[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`"${field}" must be an array of strings`);
    return v as string[];
  };
  const record = (v: unknown, field: string): Record<string, string[]> => {
    if (v === undefined || v === null) return {};
    if (typeof v !== "object" || Array.isArray(v)) throw new Error(`"${field}" must be an object: name → [names]`);
    const out: Record<string, string[]> = {};
    for (const [k, xs] of Object.entries(v as Record<string, unknown>)) out[k] = strings(xs, `${field}.${k}`);
    return out;
  };
  const nesting: Record<string, string> = {};
  if (r.nesting !== undefined && r.nesting !== null) {
    if (typeof r.nesting !== "object" || Array.isArray(r.nesting)) throw new Error('"nesting" must be an object: inner → outer');
    for (const [k, v] of Object.entries(r.nesting as Record<string, unknown>)) {
      if (typeof v !== "string") throw new Error(`"nesting.${k}" must be a container name`);
      nesting[k] = v;
    }
  }
  const issues: ReviewIssue[] = [];
  if (Array.isArray(r.issues)) {
    for (const it of r.issues) {
      const is = (it ?? {}) as { kind?: unknown; what?: unknown; severity?: unknown };
      if (typeof is.what !== "string") throw new Error('every issue needs a "what"');
      const kind = REVIEW_KINDS.includes(is.kind as (typeof REVIEW_KINDS)[number]) ? (is.kind as ReviewIssue["kind"]) : "other";
      const severity: ReviewIssue["severity"] = is.severity === "major" || is.severity === "minor" ? is.severity : undefined;
      issues.push({ kind, what: is.what, ...(severity ? { severity } : {}) });
    }
  }
  return {
    modules: strings(r.modules, "modules"),
    deps: strings(r.deps, "deps"),
    forbidden: strings(r.forbidden, "forbidden"),
    groups: record(r.groups, "groups"),
    nesting,
    highlighted: strings(r.highlighted, "highlighted"),
    issues,
    ...(typeof r.notes === "string" ? { notes: r.notes } : {}),
  };
}

/** What the scorer needs of the facts: ids, their labels, the edges, group members, nesting. */
export interface ReadingFacts {
  modules: string[];
  deps: string[];
  forbidden?: string[];
  highlighted?: string[];
  groups: Record<string, string[]>;
  labels: Record<string, string>;
  parents: Record<string, string>;
}

export interface FieldScore {
  /** Facts the reader read as drawn. */
  read: string[];
  /** Facts the reader did not report. */
  missed: string[];
  /** Things the reader reported that the figure does not have (by ids when both ends resolve, else as written). */
  invented: string[];
}

export interface ReadingScore {
  modules: FieldScore;
  /** `reversed`: a dependency read head-for-tail — the arrow's direction did not survive. */
  deps: FieldScore & { reversed: string[] };
  /** `asPlain`: a forbidden arrow the reader listed as a plain dependency — the red dashes did not read. */
  forbidden: FieldScore & { asPlain: string[] };
  /** Per group: members read, missed, and modules the reader put in this group that belong elsewhere. */
  groups: FieldScore & { misplaced: string[]; groupsMissed: string[]; groupsInvented: string[] };
  nesting: FieldScore;
  highlighted: FieldScore;
  /** Names the reader used that resolve to nothing drawn. */
  unknown: string[];
  totals: {
    facts: number;
    read: number;
    missed: number;
    invented: number;
    /** read / (facts + invented): 1 when the reading is the figure, nothing more, nothing less. */
    fidelity: number;
  };
}

const norm = (s: string): string => s.toLowerCase().replace(/[\s_]+/g, " ").replace(/[`"'“”‘’]/g, "").trim();

/** Resolve the names a reader wrote to ids: exact id, exact label, then a name that is one label's only word-prefix match. */
function resolver(facts: ReadingFacts): (name: string) => string | undefined {
  const byName = new Map<string, string>();
  const ids = [...facts.modules, ...Object.keys(facts.groups)];
  for (const id of ids) {
    byName.set(norm(id), id);
    const label = facts.labels[id];
    if (label) byName.set(norm(label.replace(/\n/g, " ")), id);
  }
  return (name: string) => {
    const n = norm(name);
    const exact = byName.get(n);
    if (exact) return exact;
    // "gateway" for "API gateway": one label contains the name as a whole word, and only one.
    const hits = [...byName.entries()].filter(([k]) => new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(k)).map(([, id]) => id);
    return new Set(hits).size === 1 ? hits[0] : undefined;
  };
}

const arrowParts = (s: string): [string, string] | undefined => {
  const m = s.match(/^(.*?)\s*(?:->|→|=>|-->)\s*(.*)$/);
  return m && m[1].trim() && m[2].trim() ? [m[1].trim(), m[2].trim()] : undefined;
};

/** Compare a reading with the facts. Names resolve by id or label; a name that resolves to nothing is `unknown`. */
export function scoreReading(facts: ReadingFacts, reading: Reading): ReadingScore {
  const resolve = resolver(facts);
  const unknown = new Set<string>();
  const res = (name: string): string | undefined => {
    const id = resolve(name);
    if (!id) unknown.add(name);
    return id;
  };
  const field = (want: string[], got: string[]): FieldScore => {
    const w = new Set(want);
    const g = new Set(got);
    return { read: want.filter((x) => g.has(x)), missed: want.filter((x) => !g.has(x)), invented: [...g].filter((x) => !w.has(x)) };
  };

  // Modules: names → ids; a group name reported as a module is invented (a container is not a box).
  const readModules = reading.modules.map(res).filter((x): x is string => !!x);
  const modules = field(facts.modules, readModules);

  // Dependencies: each arrow resolved at both ends; the other way round is its own finding.
  const wantDeps = new Set(facts.deps);
  const forbiddenFacts = new Set(facts.forbidden ?? []);
  const arrows = (list: string[]): { keys: string[]; reversed: string[] } => {
    const keys: string[] = [];
    const reversed: string[] = [];
    for (const s of list) {
      const p = arrowParts(s);
      if (!p) {
        unknown.add(s);
        continue;
      }
      const a = res(p[0]);
      const b = res(p[1]);
      if (!a || !b) continue;
      const key = `${a}->${b}`;
      const back = `${b}->${a}`;
      if (!wantDeps.has(key) && !forbiddenFacts.has(key) && (wantDeps.has(back) || forbiddenFacts.has(back))) reversed.push(back);
      else keys.push(key);
    }
    return { keys, reversed };
  };
  const readDeps = arrows(reading.deps);
  const readForbidden = arrows(reading.forbidden);
  // A forbidden arrow listed as a plain dependency was seen, but not its red dashes: read for the arrow, noted for the style.
  const asPlain = readDeps.keys.filter((k) => forbiddenFacts.has(k));
  const depsScore = field(facts.deps, readDeps.keys.filter((k) => !forbiddenFacts.has(k)));
  const deps = { ...depsScore, reversed: readDeps.reversed };
  const forbiddenScore = field(facts.forbidden ?? [], [...readForbidden.keys, ...asPlain]);
  // A plain dependency listed as forbidden is invented there, not read.
  const forbidden = { ...forbiddenScore, invented: [...forbiddenScore.invented, ...readForbidden.reversed.map((k) => `${k} (reversed)`)], asPlain };

  // Groups: own members, by group; a module placed in the wrong group is misplaced there.
  const ownerOf = new Map<string, string>();
  for (const [g, ms] of Object.entries(facts.groups)) for (const m of ms) ownerOf.set(m, g);
  const readGroups = new Map<string, string[]>();
  for (const [name, ms] of Object.entries(reading.groups)) {
    const g = res(name);
    if (!g || !(g in facts.groups)) {
      if (g) unknown.add(name);
      continue;
    }
    readGroups.set(g, ms.map(res).filter((x): x is string => !!x));
  }
  const memberKey = (g: string, m: string) => `${g}: ${m}`;
  const wantMembers = Object.entries(facts.groups).flatMap(([g, ms]) => ms.map((m) => memberKey(g, m)));
  const gotMembers = [...readGroups.entries()].flatMap(([g, ms]) => ms.map((m) => memberKey(g, m)));
  const membersScore = field(wantMembers, gotMembers);
  const misplaced = [...readGroups.entries()].flatMap(([g, ms]) => ms.filter((m) => ownerOf.has(m) && ownerOf.get(m) !== g).map((m) => `${m} read in ${g}, drawn in ${ownerOf.get(m)}`));
  const groupsMissed = Object.keys(facts.groups).filter((g) => !readGroups.has(g));
  const groupsInvented = Object.keys(reading.groups).filter((name) => {
    const g = resolve(name);
    return !g || !(g in facts.groups);
  });
  const groups = { ...membersScore, misplaced, groupsMissed, groupsInvented };

  // Nesting: inner → outer pairs.
  const wantNest = Object.entries(facts.parents).map(([c, p]) => `${c} in ${p}`);
  const gotNest: string[] = [];
  for (const [inner, outer] of Object.entries(reading.nesting)) {
    const c = res(inner);
    const p = res(outer);
    if (c && p) gotNest.push(`${c} in ${p}`);
  }
  const nesting = field(wantNest, gotNest);

  // Highlighted: ids or arrows.
  const gotLit: string[] = [];
  for (const s of reading.highlighted) {
    const p = arrowParts(s);
    if (p) {
      const a = res(p[0]);
      const b = res(p[1]);
      if (a && b) gotLit.push(`${a}->${b}`);
    } else {
      const id = res(s);
      if (id) gotLit.push(id);
    }
  }
  const highlighted = field(facts.highlighted ?? [], gotLit);

  const parts = [modules, deps, forbidden, groups, nesting, highlighted];
  const factsN = parts.reduce((s, f) => s + f.read.length + f.missed.length, 0);
  const read = parts.reduce((s, f) => s + f.read.length, 0);
  const invented = parts.reduce((s, f) => s + f.invented.length, 0) + deps.reversed.length;
  const missed = factsN - read;
  return {
    modules,
    deps,
    forbidden,
    groups,
    nesting,
    highlighted,
    unknown: [...unknown],
    totals: { facts: factsN, read, missed, invented, fidelity: factsN + invented ? Math.round((read / (factsN + invented)) * 100) / 100 : 1 },
  };
}

export function formatReading(score: ReadingScore, facts: ReadingFacts, reading: Reading, layoutIssues: { kind: string; texts: string[] }[]): string {
  const label = (id: string) => (facts.labels[id] && facts.labels[id] !== id ? `${id} "${facts.labels[id]}"` : id);
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "—");
  const lines = ["| fact | read | missed | invented | note |", "|---|---|---|---|---|"];
  const row = (name: string, f: FieldScore, note = "") => lines.push(`| ${name} | ${f.read.length} | ${list(f.missed.map(label))} | ${list(f.invented)} | ${note} |`);
  row("modules", score.modules);
  row("deps", score.deps, score.deps.reversed.length ? `reversed: ${score.deps.reversed.join(", ")}` : "");
  if (facts.forbidden?.length || score.forbidden.invented.length) row("forbidden", score.forbidden, score.forbidden.asPlain.length ? `read as plain: ${score.forbidden.asPlain.join(", ")}` : "");
  row(
    "group members",
    score.groups,
    [score.groups.misplaced.length ? `misplaced: ${score.groups.misplaced.join("; ")}` : "", score.groups.groupsMissed.length ? `groups not read: ${score.groups.groupsMissed.join(", ")}` : "", score.groups.groupsInvented.length ? `groups not drawn: ${score.groups.groupsInvented.join(", ")}` : ""]
      .filter(Boolean)
      .join("; "),
  );
  row("nesting", score.nesting);
  row("highlighted", score.highlighted);
  const t = score.totals;
  lines.push("");
  lines.push(`${t.facts} facts · read ${t.read} · missed ${t.missed} · invented ${t.invented} · fidelity ${t.fidelity}${score.unknown.length ? ` · names that resolve to nothing drawn: ${score.unknown.map((u) => `"${u}"`).join(", ")}` : ""}`);
  lines.push("");
  const geo = layoutIssues.map((i) => `${i.kind}: ${i.texts.filter(Boolean).map((x) => `"${x}"`).join(" on ")}`);
  lines.push(`layout defects — geometry: ${geo.length ? geo.join("; ") : "none"} · reader: ${reading.issues.length ? reading.issues.map((i) => `${i.kind}: ${i.what}`).join("; ") : "none"}`);
  if (reading.notes) lines.push("", `notes: ${reading.notes}`);
  return lines.join("\n");
}

export function formatScore(score: ReviewScore, report: LayoutReport, answers: ReviewAnswers): string {
  const lines = ["| frame | geometry | reader | agreement |", "|---|---|---|---|"];
  for (const f of score.frames) {
    const g = report.frames[f.frame - 1]?.issues.map((i) => `${i.kind}: ${i.texts.filter(Boolean).map((t) => `"${t}"`).join(" on ")}`).join("; ") || "—";
    const rd = answers.frames.find((a) => a.frame === f.frame)?.issues.map((i) => `${i.kind}: ${i.what}`).join("; ") || "—";
    lines.push(`| ${f.frame} | ${g} | ${rd} | ${f.agreement} |`);
  }
  const t = score.totals;
  lines.push("");
  lines.push(
    `${t.frames} frames · both ${t.both} · reader only ${t.readerOnly} · geometry only ${t.geometryOnly} · neither ${t.neither} · ` +
      `recall ${t.recall} (of the geometry's flagged frames, the reader saw) · precision ${t.precision} (of the reader's, the geometry agrees) · ` +
      `${t.readerIssues} reader issue(s) vs ${t.geometryIssues} geometry issue(s)`,
  );
  if (answers.notes) lines.push("", `notes: ${answers.notes}`);
  return lines.join("\n");
}
