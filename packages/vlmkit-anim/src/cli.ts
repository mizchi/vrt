/**
 * `vlmkit-anim <verb> <file>` — the writer's loop for the animation IR.
 *
 *   check     validate + compile + semantic checks + stats, one report   ← the loop
 *   validate  schema/reference validation only
 *   compile   Scene → Timeline JSON
 *   explain   the narration as a numbered list of steps
 *   render    one frame as SVG at --at <ms> (or --step <n>)
 *   frames    every step (or --samples N) as SVG files, --png through Playwright
 *   video     GIF (encoded here) or mp4 / webm (ffmpeg), holding on each step
 *   html      a self-contained page with the <vlm-anim> runtime inline
 *   runtime   write the runtime JS to a file (or stdout)
 *   eval      measure an emitted page with the shared animation evaluator (@mizchi/vlmkit-animation-eval)
 *   still     one frame as a figure, no caption band: the end by default (a module map, a filled table), SVG or PNG
 *   layout    the deterministic layout reading: texts on texts, texts under boxes, texts past the edge, per step
 *   review    the contact sheet + a review brief for a vision model (or an agent); scores its JSON against `layout`
 *   repo      generate the workspace's architecture map (scene + GIF + sheet + markdown) from its package.json files
 *   pr        generate the change map of a commit range: areas touched per commit, import edges, running counts
 *   facts     write a fact sheet (`check --expect`) from a directory's import graph: its entries as modules, imports as deps
 *   schema    the cheat sheet for one kind, the shared annotation ops (--kind annotations), or the index
 *
 * `check` is the command an agent runs after every edit; everything it prints
 * is phrased for the next edit. Exit 1 on any error-severity diagnostic.
 */

import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sceneFromModule } from "./author.ts";
import { handleCliError, hasFlag, readFlag, readInt, readPositionals, UsageError } from "./cli-args.ts";
import { animStats, checkAnimation, explain } from "./check.ts";
import { compileScene, SceneValidationError } from "./compile/index.ts";
import { checkExpectation, EXPECT_SHEET, formatCompared, validateExpectation, type Expectation } from "./expect.ts";
import { changeMapScene, workspaceExpectation, workspaceScene } from "./generators/git.ts";
import { importFacts } from "./generators/imports.ts";
import { renderFrameSvg, sampleTimes } from "./render-svg.ts";
import { RUNTIME_SOURCE, renderEmbedHtml } from "./runtime.ts";
import { currentStep, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, SCENE_KINDS, TIMELINE_FORMAT, type Diagnostic, type Scene, type Timeline } from "./types.ts";
import { formatDiagnostics, hasErrors, validateDocument, validateTimeline } from "./validate.ts";
import { schemaIndex, schemaSheet } from "./schema-sheet.ts";
import { contentBox, formatLayout, layoutReport } from "./layout.ts";
import { formatScore, parseAnswers, reviewBrief, reviewTiles, scoreReview, type ReviewAnswers, type ReviewScore } from "./review.ts";
import { renderSheetHtml } from "./sheet.ts";
import { writeVideo, type VideoResult } from "./video.ts";

/** Scene files that are modules rather than JSON: `import()`ed, default export taken. */
const MODULE_EXTENSIONS = /\.(m?ts|m?js)$/;

const VALUE_FLAGS = ["--out", "--at", "--step", "--samples", "--kind", "--title", "--max-ms", "--expect", "--cols", "--tile", "--fps", "--hold", "--width", "--viewport", "--strip", "--base", "--head", "--root", "--name", "--model", "--answers"];

function usage(): string {
  return `Usage: vlmkit-anim <command> <file.json> [options]

Commands
  check <scene|timeline>          Validate, compile, run semantic checks, print stats. Exit 1 on errors.
        [--max-ms N]              …and fail when the animation runs longer than N ms.
        [--expect facts.json]     …and compare a modules / diagram scene with its facts: modules, dependencies
                                  ("a->b"), forbidden ones, what the final frame highlights, group members —
                                  drawn exactly as listed, nothing invented. \`schema --kind expect\` has the file.
  validate <scene|timeline>       Schema and reference validation only.
  compile <scene> [--out t.json]  Lower a scene to its timeline (stdout when no --out).
  explain <scene|timeline>        Print the narration: one line per step.
  render <file> --at <ms>|--step <n> [--out frame.svg]
                                  One frame as SVG (stdout when no --out).
  frames <file> --out <dir> [--samples N] [--png]
                                  Every step marker (plus N evenly spaced samples) as SVG files; --png also rasterises.
  sheet <file> --out sheet.png [--cols 3] [--tile 400] [--samples N]
                                  One contact-sheet image: every step as a labelled tile, for a vision model to read
                                  in a single call. --out sheet.html writes the page instead (no browser needed).
  video <file> --out demo.gif|demo.mp4|demo.webm [--fps 20] [--hold 400] [--width W] [--no-loop]
                                  A file that plays without the runtime. GIF is encoded here (no external tool);
                                  mp4 / webm run ffmpeg when it is on PATH and otherwise leave the frames plus the
                                  command to run. --hold pauses on every step so captions can be read.
  html <file> [--out page.html] [--no-autoplay] [--loop] [--title T]
                                  Self-contained page embedding the <vlm-anim> runtime and the timeline.
  runtime [--out vlm-anim.js]     The runtime script alone, for a site that embeds many animations.
  eval <page.html|url> [--samples N] [--viewport WxH] [--strip strip.png]
                                  Measure the page's Web Animations frame by frame — visible effect, settle time,
                                  reduced-motion, motion outside the API — with the evaluator vlmkit's
                                  \`check animation\` gate uses (@mizchi/vlmkit-animation-eval + playwright).
                                  Exit 1 on a suspect finding.
  still <scene.json> --out <fig.svg|fig.png> [--step N | --at ms] [--full]
                                  One frame as a figure without the caption band, cropped to what is drawn
                                  (--full keeps the canvas) — the end by default: a \`modules\` map, a filled
                                  matrix, a walked graph. PNG needs playwright.
  layout <scene.json> [--json]     Where texts sit on texts, under filled boxes, or past the canvas edge, at every
                                  step — read from the compiled timeline, no browser. Exit 1 when any is found.
  review <scene.json> --out <dir> [--model M] [--answers a.json] [--cols N] [--tile W]
                                  Writes <name>.sheet.png (or .html without playwright), <name>.review-brief.md
                                  (the prompt for a vision model or an agent: tiles + the JSON to return) and
                                  <name>.layout.json. --model M asks that VLM (@mizchi/vlmkit-ai, needs its key)
                                  and --answers a.json takes a reader's JSON; either is scored frame by frame
                                  against the geometry into <name>.review-score.md.
  repo [--root .] [--out dir] [--title T] [--no-images]
                                  The workspace's architecture as an animation: packages appear layer by layer
                                  with the dependencies that place them there. Writes <out>/repo.scene.json,
                                  repo.gif, repo.sheet.png, repo.md (the explain text with both images embedded)
                                  and repo.expect.json (the fact sheet a hand-drawn map is checked against).
  facts <dir> [--depth 1] [--tests] [--out facts.expect.json]
                                  The directory's import graph as a fact sheet for \`check --expect\`: the entries
                                  at --depth are the modules (a directory is one module, a file is one), and every
                                  relative import that crosses from one to another is a dependency "a->b". Test
                                  files are skipped unless --tests. Prints the sheet when --out is not given, so a
                                  map drawn by hand from the code is checked against the code.
  pr --base <ref> [--head HEAD] [--root .] [--out dir] [--title T] [--name pr] [--no-images]
                                  The change map of base..head: one beat per commit, the areas it touched light
                                  up, import edges between changed areas, running file / line counts. Same four
                                  files, named <name>.*; paste <name>.md into the pull request.
  schema [--kind <kind>]          The writing guide: field list and a minimal example for a kind, or the index.

Options
  --json                          Machine-readable output for check / validate / explain.

Kinds: ${SCENE_KINDS.join(", ")}. A scene is {"format": "${SCENE_FORMAT}", "kind": ...}; a
compiled timeline is {"format": "${TIMELINE_FORMAT}", ...} and every command that takes a scene also takes one.`;
}

interface Loaded {
  path: string;
  doc: unknown;
  layer: "scene" | "timeline";
  scene?: Scene;
  timeline: Timeline;
  diagnostics: Diagnostic[];
}

/** Read, validate, and (for a scene) compile. Diagnostics are collected, not thrown. */
async function load(path: string): Promise<Loaded | { path: string; diagnostics: Diagnostic[]; layer: "scene" | "timeline" | "unknown" }> {
  let doc: unknown;
  if (MODULE_EXTENSIONS.test(path)) {
    // A TypeScript / JavaScript module whose default export is the scene: the typed authoring surface.
    await readFile(path); // ENOENT / EISDIR surface as the same one-line errors a JSON path gets
    const picked = sceneFromModule(await import(pathToFileURL(resolve(path)).href));
    if ("error" in picked) {
      return { path, layer: "unknown", diagnostics: [{ severity: "error", path: "", message: picked.error, hint: 'import { scene } from "@mizchi/vlmkit-anim" and export default scene.sort({ … })' }] };
    }
    doc = picked.scene;
  } else {
    const raw = await readFile(path, "utf-8");
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      return { path, layer: "unknown", diagnostics: [{ severity: "error", path: "", message: `not valid JSON: ${(e as Error).message}`, hint: "the file must be a single JSON object; check for trailing commas and comments" }] };
    }
  }
  const { layer, diagnostics } = validateDocument(doc);
  if (layer === "unknown" || hasErrors(diagnostics)) return { path, layer, diagnostics };
  if (layer === "timeline") return { path, doc, layer, timeline: doc as Timeline, diagnostics };
  const scene = doc as Scene;
  let timeline: Timeline;
  try {
    timeline = compileScene(scene);
  } catch (e) {
    if (e instanceof SceneValidationError) return { path, layer, diagnostics: [...diagnostics, ...e.diagnostics] };
    throw e;
  }
  // The compiler's output must itself validate; a failure here is a compiler bug, reported as such.
  const tlDiags = validateTimeline(timeline).map((d) => ({ ...d, path: `compiled:${d.path}`, message: `compiler produced an invalid timeline: ${d.message}` }));
  return { path, doc, layer, scene, timeline, diagnostics: [...diagnostics, ...tlDiags] };
}

/** A side file (`--expect`) as JSON; a parse error names the file rather than throwing a stack. */
async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new UsageError(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

function isLoaded(x: Awaited<ReturnType<typeof load>>): x is Loaded {
  return "timeline" in x;
}

function printDiagnostics(diags: Diagnostic[], json: boolean): void {
  if (json) return;
  if (diags.length) console.log(formatDiagnostics(diags));
}

async function writeOut(out: string | undefined, content: string, what: string): Promise<void> {
  if (!out) {
    process.stdout.write(content.endsWith("\n") ? content : content + "\n");
    return;
  }
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(out, content);
  console.log(`${what} → ${out}`);
}

function requireFile(positionals: string[], verb: string): string {
  const file = positionals[0];
  if (!file) throw new UsageError(`vlmkit-anim ${verb} needs a file: vlmkit-anim ${verb} <scene.json>`);
  return file;
}

function resolveTime(tl: Timeline, argv: string[]): number {
  const at = readFlag(argv, "--at");
  const step = readInt(argv, "--step");
  if (step !== undefined) {
    const steps = tl.steps ?? [];
    if (step < 1 || step > steps.length) throw new UsageError(`--step ${step} is out of range: this timeline has ${steps.length} step(s), numbered 1..${steps.length}`);
    return steps[step - 1].t;
  }
  if (at === undefined) return timelineDuration(tl);
  if (at === "end") return timelineDuration(tl);
  const n = Number(at);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`--at takes milliseconds (or "end"), got ${JSON.stringify(at)}`);
  return Math.min(n, timelineDuration(tl));
}

export async function runAnimCli(argv: string[]): Promise<number> {
  const help = hasFlag(argv, "--help") || hasFlag(argv, "-h");
  const [verb, ...rest] = argv.filter((a) => a !== "--help" && a !== "-h");
  if (help || !verb) {
    console.log(usage());
    return help || !verb ? 0 : 1;
  }
  const json = hasFlag(rest, "--json");
  const positionals = readPositionals(rest, VALUE_FLAGS);

  if (verb === "schema") {
    const kind = readFlag(rest, "--kind") ?? positionals[0];
    if (!kind) {
      console.log(schemaIndex());
      return 0;
    }
    if (kind === "expect") {
      console.log(EXPECT_SHEET);
      return 0;
    }
    if (!(SCENE_KINDS as readonly string[]).includes(kind) && kind !== "timeline" && kind !== "annotations") {
      throw new UsageError(`unknown kind "${kind}"; kinds are ${SCENE_KINDS.join(", ")} (or "timeline", "annotations" for the ops every kind shares, "expect" for the fact sheet \`check --expect\` reads)`);
    }
    console.log(schemaSheet(kind as Scene["kind"] | "timeline" | "annotations"));
    return 0;
  }
  if (verb === "runtime") {
    await writeOut(readFlag(rest, "--out"), RUNTIME_SOURCE.trim(), "runtime");
    return 0;
  }

  if (verb === "eval") {
    const source = positionals[0];
    if (!source) throw new UsageError("vlmkit-anim eval needs a page: vlmkit-anim eval <page.html|url>");
    const viewportRaw = readFlag(rest, "--viewport");
    const viewportMatch = viewportRaw?.match(/^(\d+)x(\d+)$/);
    if (viewportRaw && !viewportMatch) throw new UsageError(`--viewport takes WxH (e.g. 1280x720), got ${JSON.stringify(viewportRaw)}`);
    const evaluator = await loadAnimationEval();
    const samples = readInt(rest, "--samples", { min: 1 });
    const stripPath = readFlag(rest, "--strip");
    const report = await evaluator.runAnimationEval({
      source,
      ...(samples !== undefined ? { samples } : {}),
      ...(viewportMatch ? { viewport: { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) } } : {}),
      ...(stripPath ? { stripPath } : {}),
    });
    if (json) console.log(JSON.stringify(report, null, 2));
    else console.log(evaluator.formatAnimationEvalReport(report));
    return report.issues.some((issue) => issue.severity === "suspect") ? 1 : 0;
  }

  if (verb === "facts") {
    const dir = positionals[0];
    if (!dir) throw new UsageError("vlmkit-anim facts needs a directory: vlmkit-anim facts src --depth 1 --out src.expect.json");
    const facts = importFacts(dir, { depth: readInt(rest, "--depth", { min: 1 }), tests: hasFlag(rest, "--tests") });
    const out = readFlag(rest, "--out");
    const text = JSON.stringify(facts.expectation, null, 2) + "\n";
    if (out) {
      await mkdir(dirname(resolve(out)), { recursive: true });
      await writeFile(out, text);
    }
    const modules = facts.expectation.modules?.length ?? 0;
    const deps = facts.expectation.deps?.length ?? 0;
    if (json) console.log(JSON.stringify({ dir, out, files: facts.files, imports: facts.imports, modules, deps, members: facts.members, expectation: facts.expectation }, null, 2));
    else if (out) console.log(`${out}: ${modules} module(s), ${deps} dependenc${deps === 1 ? "y" : "ies"} from ${facts.files} file(s) (${facts.imports} imports followed)\n  next: vlmkit-anim check scene.json --expect ${out}`);
    else process.stdout.write(text);
    return 0;
  }

  if (verb === "repo" || verb === "pr") {
    const root = resolve(readFlag(rest, "--root") ?? ".");
    const name = readFlag(rest, "--name") ?? verb;
    const out = readFlag(rest, "--out") ?? join(".vlmkit-anim", name);
    let scene: Scene;
    let summary: Record<string, unknown> = {};
    if (verb === "repo") scene = workspaceScene(root, readFlag(rest, "--title"));
    else {
      const base = readFlag(rest, "--base");
      if (!base) throw new UsageError("vlmkit-anim pr needs --base <ref> (the branch or commit the changes are against, e.g. --base origin/main)");
      const map = changeMapScene({ root, base, head: readFlag(rest, "--head"), title: readFlag(rest, "--title") });
      scene = map.scene;
      summary = { commits: map.commits, files: map.files, added: map.added, removed: map.removed, areas: map.areas };
    }
    const result = await emitGenerated(scene, out, name, { images: !hasFlag(rest, "--no-images"), width: readInt(rest, "--width", { min: 160 }) });
    if (verb === "repo") {
      // The workspace's facts, so a map someone draws by hand can be checked against the package.json files.
      const expectPath = join(out, `${name}.expect.json`);
      await writeFile(expectPath, JSON.stringify(workspaceExpectation(root), null, 2) + "\n");
      result.files.push(expectPath);
    }
    if (json) console.log(JSON.stringify({ ...result, ...summary }, null, 2));
    else {
      console.log(`${name}: ${result.files.join(", ")}`);
      if (result.skipped) console.log(`  ${result.skipped}`);
      if (summary.commits !== undefined) console.log(`  ${summary.commits} commit(s), ${summary.files} file(s), +${summary.added} −${summary.removed}, ${(summary.areas as string[]).length} area(s)`);
    }
    return result.ok ? 0 : 1;
  }

  const file = requireFile(positionals, verb);
  const loaded = await load(file);

  if (verb === "validate") {
    if (json) console.log(JSON.stringify({ file, layer: loaded.layer, ok: !hasErrors(loaded.diagnostics), diagnostics: loaded.diagnostics }, null, 2));
    else {
      printDiagnostics(loaded.diagnostics, false);
      const errs = loaded.diagnostics.filter((d) => d.severity === "error").length;
      console.log(errs ? `✗ ${errs} error(s) in ${basename(file)}` : `✓ ${basename(file)} is a valid ${loaded.layer}`);
    }
    return hasErrors(loaded.diagnostics) ? 1 : 0;
  }

  if (!isLoaded(loaded)) {
    if (json) console.log(JSON.stringify({ file, ok: false, diagnostics: loaded.diagnostics }, null, 2));
    else {
      printDiagnostics(loaded.diagnostics, false);
      console.log(`✗ ${loaded.diagnostics.filter((d) => d.severity === "error").length} error(s): fix these before ${verb === "check" ? "the semantic checks can run" : `\`${verb}\` can run`}`);
    }
    return 1;
  }
  const { timeline: tl, scene } = loaded;

  switch (verb) {
    case "check": {
      const diags = [...loaded.diagnostics, ...checkAnimation(tl, scene)];
      const stats = animStats(tl, scene);
      const maxMs = readInt(rest, "--max-ms", { min: 1 });
      if (maxMs !== undefined && stats.durationMs > maxMs) {
        diags.push({ severity: "error", path: "duration", message: `the animation runs ${stats.durationMs}ms, over the ${maxMs}ms budget`, hint: 'lower "stepMs", drop beats, or pass a per-op "ms"' });
      }
      // The facts the figure must show (`--expect`): compared with the scene and the final frame, reported in
      // the same list. A scene that is not a scene (a bare timeline) has no deps to compare.
      const expectPath = readFlag(rest, "--expect");
      let expect: { file: string; ok: boolean; compared: string } | undefined;
      if (expectPath) {
        const expectDoc = await readJson(expectPath);
        const shape = validateExpectation(expectDoc).map((d) => ({ ...d, path: `${basename(expectPath)}${d.path ? `:${d.path}` : ""}` }));
        if (shape.length) diags.push(...shape);
        else if (!scene) diags.push({ severity: "error", path: "expect", message: "--expect compares a scene with its facts; this file is a compiled timeline", hint: "run check on the scene.json" });
        else {
          const r = checkExpectation(expectDoc as Expectation, scene, tl);
          diags.push(...r.diagnostics);
          expect = { file: expectPath, ok: !hasErrors(r.diagnostics), compared: formatCompared(r.compared) };
        }
      }
      const ok = !hasErrors(diags);
      if (json) {
        console.log(JSON.stringify({ file, layer: loaded.layer, ok, diagnostics: diags, stats, expect, explain: (tl.steps ?? []).map((s) => ({ t: s.t, label: s.label, caption: s.caption })) }, null, 2));
      } else {
        printDiagnostics(diags, false);
        const errs = diags.filter((d) => d.severity === "error").length;
        const warns = diags.length - errs;
        console.log(`${ok ? "✓" : "✗"} ${basename(file)} (${stats.kind}): ${errs} error(s), ${warns} warning(s)`);
        const ann = stats.annotations ? ` · annotations: ${stats.annotations.drawn} drawn, ${stats.annotations.onScreen} on screen at the end` : "";
        console.log(`  ${stats.durationMs}ms · ${stats.steps} steps (${stats.captions} captioned) · ${stats.nodes} nodes · ${stats.tracks} tracks / ${stats.keyframes} keyframes${ann}`);
        if (stats.sceneBytes) console.log(`  scene ${stats.sceneBytes} B (minified) → timeline ${stats.timelineBytes} B (×${stats.expansion})`);
        if (expect) console.log(`  facts ${basename(expect.file)}: ${expect.compared} — ${expect.ok ? "all as drawn" : "see above"}`);
        console.log(`  next: vlmkit-anim explain ${file} · vlmkit-anim render ${file} --step N · vlmkit-anim html ${file} --out page.html`);
      }
      return ok ? 0 : 1;
    }
    case "compile": {
      printDiagnostics(loaded.diagnostics, json);
      await writeOut(readFlag(rest, "--out"), JSON.stringify(tl, null, 2), "timeline");
      return hasErrors(loaded.diagnostics) ? 1 : 0;
    }
    case "explain": {
      if (json) console.log(JSON.stringify({ file, steps: tl.steps ?? [], durationMs: timelineDuration(tl) }, null, 2));
      else console.log(explain(tl));
      return 0;
    }
    case "render": {
      const t = resolveTime(tl, rest);
      const svg = renderFrameSvg(tl, t);
      const step = currentStep(tl, t);
      const out = readFlag(rest, "--out");
      await writeOut(out, svg, `frame t=${Math.round(t)}${step?.caption ? ` "${step.caption}"` : ""}`);
      return 0;
    }
    case "still": {
      // The figure, not the film: one frame, no caption band. The end by default — a module map, a filled
      // table, a walked graph — or `--step` / `--at` for another instant.
      const out = readFlag(rest, "--out");
      if (!out) throw new UsageError("vlmkit-anim still needs --out <fig.svg|fig.png>");
      const t = rest.includes("--step") || rest.includes("--at") ? resolveTime(tl, rest) : timelineDuration(tl);
      // Cropped to what is drawn (plus a margin): the canvas was sized before the picture existed.
      const crop = rest.includes("--full") ? { x: 0, y: 0, w: tl.canvas.width, h: tl.canvas.height } : contentBox(tl, t);
      const svg = renderFrameSvg(tl, t, { caption: false, crop });
      if (out.endsWith(".png")) {
        await screenshotHtml(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${svg}</body></html>`, out, { width: crop.w, height: crop.h });
        if (json) console.log(JSON.stringify({ out, t }, null, 2));
        else console.log(`still t=${Math.round(t)} → ${out}`);
      } else await writeOut(out, svg, `still t=${Math.round(t)}`);
      return 0;
    }
    case "frames": {
      const out = readFlag(rest, "--out");
      if (!out) throw new UsageError("vlmkit-anim frames needs --out <dir>");
      const samples = readInt(rest, "--samples") ?? 0;
      const times = sampleTimes(tl, samples);
      await mkdir(out, { recursive: true });
      const written: { t: number; file: string; caption?: string }[] = [];
      for (const t of times) {
        const name = `frame-${String(Math.round(t)).padStart(6, "0")}.svg`;
        await writeFile(join(out, name), renderFrameSvg(tl, t));
        written.push({ t, file: name, caption: currentStep(tl, t)?.caption });
      }
      if (hasFlag(rest, "--png")) await rasterise(out, written.map((w) => w.file), tl);
      await writeFile(join(out, "frames.json"), JSON.stringify({ source: file, canvas: tl.canvas, frames: written }, null, 2));
      if (json) console.log(JSON.stringify({ out, frames: written }, null, 2));
      else {
        for (const w of written) console.log(`  ${w.file}  ${String(Math.round(w.t)).padStart(6)}ms  ${w.caption ?? ""}`);
        console.log(`${written.length} frame(s) → ${out}${hasFlag(rest, "--png") ? " (svg + png)" : ""}`);
      }
      return 0;
    }
    case "layout": {
      const report = layoutReport(tl);
      if (json) console.log(JSON.stringify(report, null, 2));
      else console.log(formatLayout(report));
      return report.totals.framesWithIssues ? 1 : 0;
    }
    case "review": {
      const out = readFlag(rest, "--out");
      if (!out) throw new UsageError("vlmkit-anim review needs --out <dir>");
      await mkdir(out, { recursive: true });
      // `--name` for files that share a basename (every attempt is a `scene.json`).
      const name = readFlag(rest, "--name") ?? basename(file).replace(/\.(scene\.|timeline\.)?(json|m?ts|m?js)$/, "");
      const times = sampleTimes(tl, 0);
      const cols = readInt(rest, "--cols", { min: 1 }) ?? 3;
      const tileWidth = readInt(rest, "--tile", { min: 120 }) ?? 400;
      const title = scene?.title ?? String(tl.meta?.title ?? name);
      const html = renderSheetHtml(tl, times, { cols, tileWidth, title });
      const files: string[] = [];
      let sheet = join(out, `${name}.sheet.png`);
      try {
        await screenshotHtml(html, sheet);
      } catch (e) {
        sheet = join(out, `${name}.sheet.html`);
        await writeFile(sheet, html);
        console.error(`sheet as HTML (${(e as Error).message})`);
      }
      files.push(sheet);
      const brief = reviewBrief(title, reviewTiles(tl, times));
      const briefPath = join(out, `${name}.review-brief.md`);
      await writeFile(briefPath, brief);
      files.push(briefPath);
      const report = layoutReport(tl);
      const layoutPath = join(out, `${name}.layout.json`);
      await writeFile(layoutPath, JSON.stringify(report, null, 2));
      files.push(layoutPath);
      let answers: ReviewAnswers | undefined;
      let readerLabel = "";
      const answersPath = readFlag(rest, "--answers");
      const model = readFlag(rest, "--model");
      if (answersPath) {
        answers = parseAnswers(await readFile(answersPath, "utf-8"));
        readerLabel = basename(answersPath);
      } else if (model) {
        if (!sheet.endsWith(".png")) throw new UsageError("--model needs the sheet as PNG: install playwright");
        const ai = await loadVlm();
        const client = await ai.createVlmClient(await ai.resolveModel(model));
        if (!client) throw new UsageError(`no API key for ${model}`);
        const res = await client.analyzeImageFile(sheet, brief, { maxTokens: 4000 });
        const rawPath = join(out, `${name}.review-${model.replace(/[^a-zA-Z0-9.-]/g, "_")}.json`);
        await writeFile(rawPath, res.content);
        files.push(rawPath);
        answers = parseAnswers(res.content);
        readerLabel = `${model} (${res.latencyMs}ms, $${res.costUsd.toFixed(5)})`;
      }
      let score: ReviewScore | undefined;
      if (answers) {
        score = scoreReview(report, answers);
        const scorePath = join(out, `${name}.review-score.md`);
        await writeFile(scorePath, `# ${title} — visual review vs geometry\n\nreader: ${readerLabel}\n\n${formatScore(score, report, answers)}\n`);
        files.push(scorePath);
      }
      if (json) console.log(JSON.stringify({ files, layout: report.totals, score: score?.totals }, null, 2));
      else {
        for (const f of files) console.log(`wrote ${f}`);
        console.log(formatLayout(report));
        if (score && answers) console.log(formatScore(score, report, answers));
        else console.log(`next: hand ${basename(sheet)} and ${basename(briefPath)} to a reader, then --answers <its.json>; or --model <vlm> with its API key`);
      }
      return 0;
    }
    case "sheet": {
      const out = readFlag(rest, "--out");
      if (!out) throw new UsageError("vlmkit-anim sheet needs --out <sheet.png|sheet.html>");
      const times = sampleTimes(tl, readInt(rest, "--samples") ?? 0);
      const cols = readInt(rest, "--cols", { min: 1 }) ?? 3;
      const tileWidth = readInt(rest, "--tile", { min: 120 }) ?? 400;
      const html = renderSheetHtml(tl, times, { cols, tileWidth, title: readFlag(rest, "--title") });
      if (out.endsWith(".html")) {
        await writeOut(out, html, `sheet (${times.length} frames)`);
        return 0;
      }
      await screenshotHtml(html, out);
      if (json) console.log(JSON.stringify({ out, frames: times.length, cols, tileWidth }, null, 2));
      else console.log(`sheet (${times.length} frames, ${cols} per row, ${tileWidth}px tiles) → ${out}`);
      return 0;
    }
    case "video": {
      const out = readFlag(rest, "--out");
      if (!out) throw new UsageError("vlmkit-anim video needs --out <demo.gif|demo.mp4|demo.webm>");
      let result: VideoResult;
      try {
        result = await writeVideo(tl, out, {
          fps: readInt(rest, "--fps", { min: 1 }),
          hold: readInt(rest, "--hold", { min: 0 }),
          width: readInt(rest, "--width", { min: 16 }),
          loop: !hasFlag(rest, "--no-loop"),
        });
      } catch (e) {
        throw new UsageError((e as Error).message);
      }
      if (json) console.log(JSON.stringify(result, null, 2));
      else if (result.pending) {
        console.log(`ffmpeg is not on PATH. ${result.frames} frame(s) are in ${result.pending.framesDir}; finish with:\n  ${result.pending.command}`);
      } else {
        console.log(`${result.format} (${result.frames} frames, ${result.durationMs}ms, ${result.width}×${result.height}, ${Math.round((result.bytes ?? 0) / 1024)} KB) → ${out}`);
      }
      return result.pending ? 1 : 0;
    }
    case "html": {
      const html = renderEmbedHtml(tl, { autoplay: !hasFlag(rest, "--no-autoplay"), loop: hasFlag(rest, "--loop"), title: readFlag(rest, "--title") });
      await writeOut(readFlag(rest, "--out"), html, "page");
      return 0;
    }
    default:
      throw new UsageError(`unknown command "${verb}"\n\n${usage()}`);
  }
}

async function loadChromium(): Promise<typeof import("playwright").chromium> {
  try {
    return (await import("playwright")).chromium;
  } catch {
    throw new UsageError("PNG output needs playwright installed (pnpm add -D playwright && npx playwright install chromium); write .svg / .html instead to skip the browser");
  }
}

/**
 * Write a generated scene and everything a reader needs around it: the scene
 * (so it can be edited by hand), the markdown with the narration and both
 * images, the GIF and the contact sheet. Without a browser the images are
 * skipped and the sheet is written as HTML; the scene and the text are the
 * deliverable, the pictures the bonus.
 */
async function emitGenerated(scene: Scene, out: string, name: string, opts: { images: boolean; width?: number }): Promise<{ ok: boolean; files: string[]; skipped?: string; dir: string }> {
  await mkdir(out, { recursive: true });
  const files: string[] = [];
  const scenePath = join(out, `${name}.scene.json`);
  await writeFile(scenePath, JSON.stringify(scene, null, 2) + "\n");
  files.push(scenePath);
  let tl: Timeline;
  try {
    tl = compileScene(scene);
  } catch (e) {
    if (e instanceof SceneValidationError) {
      console.log(formatDiagnostics(e.diagnostics));
      console.log(`✗ the generated scene does not compile — a generator bug; the scene is at ${scenePath}`);
      return { ok: false, files, dir: out };
    }
    throw e;
  }
  const diags = checkAnimation(tl, scene);
  // Warnings on a generated scene are the generator's to fix, so they are printed, not swallowed.
  if (diags.length) console.log(formatDiagnostics(diags));
  if (hasErrors(diags)) {
    console.log(`✗ the generated scene fails its own checks — a generator bug; the scene is at ${scenePath}`);
    return { ok: false, files, dir: out };
  }
  let skipped: string | undefined;
  let gifName: string | undefined;
  let sheetName: string | undefined;
  if (opts.images) {
    try {
      const gif = join(out, `${name}.gif`);
      await writeVideo(tl, gif, { width: opts.width ?? 720, fps: 12 });
      files.push(gif);
      gifName = `${name}.gif`;
      const sheet = join(out, `${name}.sheet.png`);
      await screenshotHtml(renderSheetHtml(tl, sampleTimes(tl, 0), { cols: 3, tileWidth: 400, title: scene.title }), sheet);
      files.push(sheet);
      sheetName = `${name}.sheet.png`;
    } catch (e) {
      skipped = `images skipped: ${(e as Error).message}`;
    }
  }
  if (!gifName) {
    const html = join(out, `${name}.sheet.html`);
    await writeFile(html, renderSheetHtml(tl, sampleTimes(tl, 0), { cols: 3, tileWidth: 400, title: scene.title }));
    files.push(html);
  }
  // The figure as well as the film: the final frame, no caption, cropped to what is drawn — the image a README
  // or a design note embeds when the motion is not the point.
  const end = timelineDuration(tl);
  const stillPath = join(out, `${name}.svg`);
  await writeFile(stillPath, renderFrameSvg(tl, end, { caption: false, crop: contentBox(tl, end) }));
  files.push(stillPath);
  const md = [
    `## ${scene.title ?? name}`,
    "",
    ...(gifName ? [`![${scene.title ?? name}](./${gifName})`, ""] : [`![${scene.title ?? name}](./${name}.svg)`, ""]),
    "<details><summary>Every step</summary>",
    "",
    ...(sheetName ? [`![steps](./${sheetName})`, ""] : []),
    "```",
    explain(tl),
    "```",
    "",
    "</details>",
    "",
    `<sub>Generated by \`vlmkit-anim ${name === "repo" ? "repo" : "pr"}\`; the scene is [\`${name}.scene.json\`](./${name}.scene.json) — edit it and re-run \`vlmkit-anim video\` for a different cut, or \`vlmkit-anim still\` for the figure alone ([\`${name}.svg\`](./${name}.svg)).</sub>`,
    "",
  ].join("\n");
  const mdPath = join(out, `${name}.md`);
  await writeFile(mdPath, md);
  files.push(mdPath);
  return { ok: true, files, skipped, dir: out };
}

/**
 * The shared evaluator is an optional peer: this tool writes animations and
 * depends on nothing else to do so; measuring them is what it shares with
 * vlmkit, and a consumer who wants that installs the one package that does it.
 */
async function loadVlm(): Promise<typeof import("@mizchi/vlmkit-ai")> {
  try {
    return await import("@mizchi/vlmkit-ai");
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new UsageError("vlmkit-anim review --model needs the VLM clients: pnpm add -D @mizchi/vlmkit-ai (and OPENROUTER_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY for the model)");
    }
    throw e;
  }
}

async function loadAnimationEval(): Promise<typeof import("@mizchi/vlmkit-animation-eval")> {
  try {
    return await import("@mizchi/vlmkit-animation-eval");
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new UsageError("vlmkit-anim eval needs the shared evaluator: pnpm add -D @mizchi/vlmkit-animation-eval playwright && npx playwright install chromium");
    }
    throw e;
  }
}

/** Screenshot a self-contained HTML string at its own width, full page. */
async function screenshotHtml(html: string, out: string, viewport = { width: 1280, height: 720 }): Promise<void> {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: Math.max(1, Math.round(viewport.width)), height: Math.max(1, Math.round(viewport.height)) }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await mkdir(dirname(resolve(out)), { recursive: true });
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await browser.close();
  }
}

/** SVG → PNG through Playwright, one page load per frame. Optional dependency: a clear message when absent. */
async function rasterise(dir: string, files: string[], tl: Timeline): Promise<void> {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: Math.ceil(tl.canvas.width), height: Math.ceil(tl.canvas.height) } });
    for (const f of files) {
      const svg = await readFile(join(dir, f), "utf-8");
      await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
      await page.screenshot({ path: join(dir, f.replace(/\.svg$/, ".png")), clip: { x: 0, y: 0, width: tl.canvas.width, height: tl.canvas.height } });
    }
  } finally {
    await browser.close();
  }
}

/**
 * Standalone entry: `vlmkit-anim` is its own binary, not a `vlmkit` subcommand.
 * Realpath both sides — npm installs `bin` as a symlink, so `argv[1]` is
 * `node_modules/.bin/vlmkit-anim` while `import.meta.url` is the real `dist/cli.mjs`.
 */
function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isDirectRun()) {
  runAnimCli(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exitCode = code;
    })
    .catch(handleCliError);
}
