/**
 * v19 — two kinds: `flowchart` (boxes, diamonds, pills, labelled ways out, a walked path) and `gantt` (bars on
 * a time axis, dependencies, a cursor). The fixtures compile clean in every layout, the walk and the cursor are
 * read back by the checks, loops run round the outside of a flowchart, and the validator names a bad hop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { checkAnimation } from "./check.ts";
import { compileScene } from "./compile/index.ts";
import { flowLayers } from "./compile/flowchart.ts";
import { niceTick } from "./compile/gantt.ts";
import { layoutReport } from "./layout.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, type FlowchartScene, type GanttScene, type Timeline } from "./types.ts";
import { formatDiagnostics, validateScene } from "./validate.ts";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as T;
const issues = (tl: Timeline) => {
  const r = layoutReport(tl);
  return r.frames.flatMap((f) => f.issues.map((i) => `frame ${f.index}: ${i.kind} ${i.texts.join(" / ")}`)).join("\n") || "clean";
};

describe("flowchart", () => {
  const retry = () => fixture<FlowchartScene>("flowchart-retry");

  it("compiles clean in tb and lr, walks the listed path, and narrates a decision with its answer", () => {
    for (const layout of ["tb", "lr"] as const) {
      const s = { ...retry(), layout };
      const tl = compileScene(s);
      assert.equal(issues(tl), "clean", layout);
      assert.deepEqual(tl.meta?.visited, ["start", "send", "ok", "tries", "wait", "send", "ok", "done"]);
      const captions = (tl.steps ?? []).map((st) => st.caption);
      assert.ok(captions.includes("2xx?: no → tries < 3?"), captions.join(" | "));
      assert.ok(captions.includes("End at \"done\""));
      const diags = checkAnimation(tl, s);
      assert.deepEqual(diags.filter((d) => d.severity === "error"), []);
      // `fail` is drawn and never walked: one warning, the only one.
      assert.deepEqual(diags.map((d) => d.path), ["nodes(fail)"], formatDiagnostics(diags));
    }
  });

  it("layers by distance from start: the loop back to `send` does not push it down the page", () => {
    const s = retry();
    const layer = flowLayers(s.nodes.map((n) => (typeof n === "string" ? n : n.id)), s.edges.map((e) => (Array.isArray(e) ? { from: e[0], to: e[1] } : e)), "start");
    assert.deepEqual([...layer.entries()], [["start", 0], ["send", 1], ["ok", 2], ["done", 3], ["tries", 3], ["wait", 4], ["fail", 4]]);
  });

  it("the loop back runs round the outside as an orthogonal path, and the token follows it", () => {
    const tl = compileScene(retry());
    const back = tl.nodes.find((n) => n.id === "edge-6")!; // wait -> send
    assert.equal(back.shape, "path");
    const numbers = back.d!.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const send = tl.nodes.find((n) => n.id === "node-send")!;
    // It reaches a margin left of every node before coming back to `send`.
    const leftmost = Math.min(...tl.nodes.filter((n) => n.id.startsWith("node-")).map((n) => n.pos![0] - (n.size?.[0] ?? 60) / 2));
    assert.ok(back.pos![0] + Math.min(...xs) < leftmost, `the loop runs at x=${back.pos![0] + Math.min(...xs)}, left of ${leftmost}`);
    void send;
    // The token ends on the terminal it stopped at.
    const end = sampleFrame(tl, timelineDuration(tl));
    const done = tl.nodes.find((n) => n.id === "node-done")!;
    assert.ok(Math.abs((end.get("token")!.pos as number[])[1] - done.pos![1]) < 1);
  });

  it("the validator names a hop that is not an edge, a bad shape, and a duplicate edge", () => {
    const s = retry();
    const d = validateScene({ ...s, walk: ["send", "done"] });
    assert.equal(d.length, 1, formatDiagnostics(d));
    assert.match(d[0].message, /no edge from "send" to "done"/);
    assert.match(d[0].hint ?? "", /the edges lead to "ok"/);
    const bad = validateScene({ ...s, nodes: [...s.nodes, { id: "x", shape: "hexagon" as never }], edges: [...s.edges, ["send", "ok"]] });
    assert.ok(bad.some((x) => x.path === "nodes[7].shape"));
    assert.ok(bad.some((x) => /already has an edge to "ok"/.test(x.message)));
  });

  it("the check warns about a decision with one way out and an unlabelled way out", () => {
    const s: FlowchartScene = { format: SCENE_FORMAT, kind: "flowchart", nodes: ["a", { id: "q", shape: "decision" }, "b"], edges: [["a", "q"], ["q", "b"]], walk: ["q", "b"] };
    const diags = checkAnimation(compileScene(s), s);
    assert.ok(diags.some((d) => /decision "q" has 1 way out/.test(d.message)), formatDiagnostics(diags));
    assert.ok(diags.some((d) => /has no label/.test(d.message)));
  });
});

describe("gantt", () => {
  const release = () => fixture<GanttScene>("gantt-release");

  it("compiles clean, moves the cursor, fills the bars, and records the slip and the status", () => {
    const s = release();
    const tl = compileScene(s);
    assert.equal(issues(tl), "clean");
    const meta = tl.meta as { cursor: number; finalTasks: Record<string, [number, number]>; status: Record<string, string> };
    assert.equal(meta.cursor, 11);
    assert.deepEqual(meta.finalTasks.build, [3, 9]);
    // `cascade`: QA and Ship moved with Build's slip; Design did not.
    assert.deepEqual(meta.finalTasks.qa, [9, 11]);
    assert.deepEqual(meta.finalTasks.ship, [11, 11]);
    assert.deepEqual(meta.finalTasks.design, [0, 3]);
    assert.equal(meta.status.qa, "late");
    assert.ok(tl.nodes.some((n) => n.id === "owner-build" && n.text === "Mia"));
    const captions = (tl.steps ?? []).map((st) => st.caption);
    assert.ok(captions.includes("day 3: Build starts; Design finishes"), captions.join(" | "));
    const end = sampleFrame(tl, timelineDuration(tl));
    // Design's fill spans its whole bar at the end; the cursor stands at day 11.
    const bar = tl.nodes.find((n) => n.id === "bar-design")!;
    assert.ok(Math.abs((end.get("fill-design")!.size as number[])[0] - (bar.size![0])) < 1);
    const cursorX = (end.get("cursor")!.pos as number[])[0];
    const tick10 = tl.nodes.find((n) => n.id === "tick-5")!; // ticks every 2: 0,2,4,6,8,10
    assert.ok(cursorX > tick10.pos![0], "the cursor is past day 10");
    assert.deepEqual(checkAnimation(tl, s).filter((d) => d.severity === "error"), []);
  });

  it("a 1-2-5 tick and the check's warnings: a dependent starting early, a cursor that stops short, time running backwards", () => {
    assert.equal(niceTick(12), 2);
    assert.equal(niceTick(60), 10);
    assert.equal(niceTick(3), 0.5);
    const s = release();
    const early: GanttScene = { ...s, tasks: s.tasks.map((t) => (t.id === "qa" ? { ...t, start: 7 } : t)) };
    const d1 = checkAnimation(compileScene(early), early);
    assert.ok(d1.some((d) => /"QA" starts at 7 but depends on "Build", which ends at 8/.test(d.message)), formatDiagnostics(d1));
    const noCascade: GanttScene = { ...s, ops: [{ slip: { task: "build", end: 9 } }, { advance: 11 }] };
    const tlN = compileScene(noCascade);
    assert.deepEqual((tlN.meta as { finalTasks: Record<string, [number, number]> }).finalTasks.qa, [8, 10], "without cascade the dependent stays");
    assert.ok(checkAnimation(tlN, noCascade).some((d) => /"QA" starts at 8 but depends on "Build", which ends at 9/.test(d.message)) === false, "the plan check reads the tasks as written, not the slip");
    const short: GanttScene = { ...s, ops: [{ advance: 5 }] };
    const d2 = checkAnimation(compileScene(short), short);
    assert.ok(d2.some((d) => /the cursor stops at 5; "Build" ends at 8/.test(d.message)), formatDiagnostics(d2));
    const back: GanttScene = { ...s, ops: [{ advance: 5 }, { advance: 2 }] };
    const d3 = checkAnimation(compileScene(back), back);
    assert.ok(d3.some((d) => d.severity === "error" && /goes back from 5 to 2/.test(d.message)), formatDiagnostics(d3));
  });

  it("the validator: a task without an end that is not a milestone, an end before its start, a slip with nothing to change", () => {
    const s = release();
    const d = validateScene({ ...s, tasks: [...s.tasks, { id: "x", start: 4 }, { id: "y", start: 5, end: 2 }], ops: [{ slip: { task: "build" } }] });
    assert.ok(d.some((x) => x.path === "tasks[4].end" && /no "end"/.test(x.message)), formatDiagnostics(d));
    assert.ok(d.some((x) => x.path === "tasks[5].end" && /before it starts/.test(x.message)));
    assert.ok(d.some((x) => x.path === "ops[0].slip"));
  });
});
