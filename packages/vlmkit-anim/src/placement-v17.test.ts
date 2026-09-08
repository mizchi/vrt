/**
 * v17 — placement escape hatches. The asked side of a `callout` / `value` is honoured by growing the canvas on
 * that side (left and above included: the Builder shifts the picture), and a callout's pointer goes round a
 * labelled box in its way instead of through it — but only when the detour crosses less than the straight line.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { checkAnimation } from "./check.ts";
import { compileScene } from "./compile/index.ts";
import { segmentInside } from "./compile/route.ts";
import { layoutReport, strokeSegments } from "./layout.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, type MatrixScene, type ModulesScene, type Scene, type Timeline, type TimelineNode } from "./types.ts";

const chain = (): ModulesScene => ({
  format: SCENE_FORMAT,
  kind: "modules",
  modules: ["api", "service", "repo", "db"],
  deps: [["api", "service"], ["service", "repo"], ["repo", "db"]],
});

const issues = (tl: Timeline) => {
  const r = layoutReport(tl);
  return r.frames.flatMap((f) => f.issues.map((i) => `frame ${f.index}: ${i.kind} ${i.nodes.join(" × ")} (${i.amount})`)).join("\n") || "clean";
};

const worldPos = (tl: Timeline, id: string, t: number): [number, number] => {
  const frame = sampleFrame(tl, t);
  const n = tl.nodes.find((x) => x.id === id)!;
  const own = (frame.get(id)!.pos as [number, number] | undefined) ?? [0, 0];
  const parent = n.parent ? ((frame.get(n.parent)!.pos as [number, number] | undefined) ?? [0, 0]) : [0, 0];
  return [own[0] + parent[0], own[1] + parent[1]];
};

const rectBox = (tl: Timeline, id: string, t: number) => {
  const [cx, cy] = worldPos(tl, id, t);
  const n = tl.nodes.find((x) => x.id === id)!;
  const [w, h] = n.size!;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
};

const pointerLegs = (tl: Timeline, t: number) => {
  const arrow = tl.nodes.find((n) => /^callout-main-\d+-arrow$/.test(n.id))!;
  return { arrow, legs: strokeSegments(arrow, worldPos(tl, arrow.id, t)) };
};

describe("v17 — the canvas grows on the side the writer asked for", () => {
  it("a callout asked `left` of the top module lands left, and the whole picture moves right to make room", () => {
    const plain = compileScene(chain());
    const s: ModulesScene = { ...chain(), sequence: [{ callout: { at: "api", text: "every request enters here and nowhere else", side: "left" }, ms: 0 }] };
    const tl = compileScene(s);
    const end = timelineDuration(tl);
    const api = rectBox(tl, "api", end);
    const box = rectBox(tl, tl.nodes.find((n) => /^callout-main-\d+-box$/.test(n.id))!.id, end);
    assert.ok(box.x + box.w < api.x, `the callout (${box.x}..${box.x + box.w}) is left of api (${api.x})`);
    assert.ok(box.x >= 0, "…and on the canvas");
    assert.ok(tl.canvas.width > plain.canvas.width, "the canvas grew");
    // Every root node moved by the same amount; the graph itself is unchanged.
    const shift = tl.canvas.width - plain.canvas.width;
    for (const id of ["api", "service", "repo", "db"]) {
      const before = worldPos(plain, id, 0);
      const after = worldPos(tl, id, end);
      assert.equal(Math.round(after[0] - before[0]), shift, `${id} shifted right by the growth`);
      assert.equal(after[1], before[1], `${id} kept its y`);
    }
    assert.equal(issues(tl), "clean");
  });

  it("a three-line callout asked `above` the top module grows the canvas upward and shifts the picture down", () => {
    const plain = compileScene(chain());
    const text = "the only entry point: every request, from the CLI or the HTTP handler, is parsed and validated here first";
    const tl = compileScene({ ...chain(), sequence: [{ callout: { at: "api", text, side: "above" }, ms: 0 }] });
    const end = timelineDuration(tl);
    const api = rectBox(tl, "api", end);
    const box = rectBox(tl, tl.nodes.find((n) => /^callout-main-\d+-box$/.test(n.id))!.id, end);
    assert.ok(box.y + box.h < api.y, "the callout is above api");
    assert.ok(box.y >= 0, "…and on the canvas");
    assert.ok(tl.canvas.height > plain.canvas.height, "the canvas grew upward");
    assert.ok(worldPos(tl, "api", end)[1] > worldPos(plain, "api", 0)[1], "api moved down by the growth");
    assert.equal(issues(tl), "clean");
  });

  it("a readout asked `right` of a matrix row sits beside that row; the canvas grows right rather than the readout going below", () => {
    const s = JSON.parse(readFileSync(new URL("../fixtures/matrix-vector-clock.json", import.meta.url), "utf8")) as MatrixScene;
    const tl = compileScene(s);
    const t = tl.steps![2].t;
    const value = tl.nodes.find((n) => n.id === "value-vA")!;
    const [vx, vy] = worldPos(tl, value.id, t);
    const [, rowY] = worldPos(tl, "row-0", t);
    const lastCell = rectBox(tl, "cell-0-2", t);
    assert.ok(Math.abs(vy - rowY) < 1, `the readout is level with row A (${vy} vs ${rowY})`);
    assert.ok(vx > lastCell.x + lastCell.w, "…and to its right");
  });

  it("a matrix that grew to the left still reads its grid back by slot position", () => {
    const s: MatrixScene = {
      format: SCENE_FORMAT,
      kind: "matrix",
      cells: [[1, 2, 3], [4, 5, 6]],
      ops: [{ callout: { at: "0,0", text: "the first cell is where the scan begins", side: "left" } }, { set: { cell: [1, 1], value: 9 } }],
    };
    const tl = compileScene(s);
    const errors = checkAnimation(tl, s).filter((d) => d.severity === "error");
    assert.deepEqual(errors, [], errors.map((e) => e.message).join("\n"));
    const end = timelineDuration(tl);
    const box = rectBox(tl, tl.nodes.find((n) => /^callout-main-\d+-box$/.test(n.id))!.id, tl.steps![0].t + 1);
    const cell = rectBox(tl, "cell-0-0", end);
    assert.ok(box.x >= 0 && box.x + box.w < cell.x, "the callout is left of the first cell and on the canvas");
    assert.equal(issues(tl), "clean");
  });
});

describe("v17 — a stated side that was not honoured is reported", () => {
  it("names the annotation, both sides and what was in the way (ka: `above` diagnostics, edges run there)", () => {
    const s = JSON.parse(readFileSync(new URL("../../../fixtures/anim-scenario/attempts/ka/scene.json", import.meta.url), "utf8")) as Scene;
    const diags = checkAnimation(compileScene(s), s);
    const notes = diags.filter((d) => d.path.endsWith(".side"));
    assert.equal(notes.length, 1, diags.map((d) => d.message).join("\n"));
    assert.equal(notes[0].severity, "warn");
    assert.equal(notes[0].path, "sequence[2].callout.side");
    assert.match(notes[0].message, /"diagnostics" asked for `above` and landed `below`: a line runs through that spot/);
    assert.match(notes[0].hint ?? "", /ask for it \(or drop `side`\)/);
  });

  it("says nothing when the asked side was honoured, and nothing for a default side that moved", () => {
    const honoured = compileScene({ ...chain(), sequence: [{ callout: { at: "api", text: "every request enters here and nowhere else", side: "left" }, ms: 0 }] });
    assert.deepEqual(checkAnimation(honoured).filter((d) => d.path.endsWith(".side")), []);
    const s: MatrixScene = { format: SCENE_FORMAT, kind: "matrix", title: "T", cells: [[0, 0], [0, 0]], ops: [{ callout: { at: "0,0", text: "under the title, so not above" } }, { set: { cell: [1, 1], value: 1 } }] };
    assert.deepEqual(checkAnimation(compileScene(s), s).filter((d) => d.path.endsWith(".side")), []);
  });
});

describe("v17 — a callout's pointer", () => {
  const hc = () => JSON.parse(readFileSync(new URL("../../../fixtures/anim-scenario/attempts/hc/scene.json", import.meta.url), "utf8")) as Scene;

  it("points at the middle of a bent edge, not its first end (hc: `events->handlers`)", () => {
    const tl = compileScene(hc());
    const end = timelineDuration(tl);
    // Edges are numbered; the one from `events` to `handlers` is the one whose ends touch those two boxes.
    const near = (p: [number, number], b: { x: number; y: number; w: number; h: number }) => p[0] > b.x - 12 && p[0] < b.x + b.w + 12 && p[1] > b.y - 12 && p[1] < b.y + b.h + 12;
    const events = rectBox(tl, "events", end);
    const handlers = rectBox(tl, "handlers", end);
    const edge = tl.nodes.find((n) => {
      if (!/^edge-\d+$/.test(n.id)) return false;
      const sg = strokeSegments(n, worldPos(tl, n.id, end));
      return sg.length > 0 && near(sg[0][0], events) && near(sg[sg.length - 1][1], handlers);
    })!;
    assert.ok(edge, "the edge node exists");
    const segs = strokeSegments(edge, worldPos(tl, edge.id, end));
    const { legs } = pointerLegs(tl, end);
    const tip = legs[legs.length - 1][1];
    // Distance from the pointer's tip to the edge's polyline.
    const dist = Math.min(
      ...segs.map(([a, b]) => {
        const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
        const f = Math.max(0, Math.min(1, ((tip[0] - a[0]) * (b[0] - a[0]) + (tip[1] - a[1]) * (b[1] - a[1])) / l2));
        return Math.hypot(tip[0] - (a[0] + (b[0] - a[0]) * f), tip[1] - (a[1] + (b[1] - a[1]) * f));
      }),
    );
    assert.ok(dist < 20, `the tip is ${dist.toFixed(1)}px from the edge`);
    // …and not at either end of the edge.
    const ends = [segs[0][0], segs[segs.length - 1][1]];
    for (const e of ends) assert.ok(Math.hypot(tip[0] - e[0], tip[1] - e[1]) > 40, "the tip is not at an end of the edge");
  });

  it("goes round a labelled module in its way (hc: `config` between the callout and the edge)", () => {
    const tl = compileScene(hc());
    const end = timelineDuration(tl);
    const { arrow, legs } = pointerLegs(tl, end);
    assert.equal(arrow.shape, "path", "the pointer bent");
    assert.ok(legs.length >= 2);
    const boxes: TimelineNode[] = tl.nodes.filter((n) => n.shape === "rect" && n.text !== undefined);
    for (const n of boxes) {
      const b = rectBox(tl, n.id, end);
      for (const leg of legs) assert.ok(segmentInside(leg, b) <= 2, `the pointer runs ${segmentInside(leg, b).toFixed(1)}px through ${n.id}`);
    }
    assert.equal(issues(tl), "clean");
  });

  it("stays straight when the detour would cross more text than the line did (matrix: a pointer over cells, not round the row letters)", () => {
    const s = JSON.parse(readFileSync(new URL("../fixtures/matrix-vector-clock.json", import.meta.url), "utf8")) as MatrixScene;
    const tl = compileScene(s);
    const { arrow } = pointerLegs(tl, timelineDuration(tl));
    assert.equal(arrow.shape, "arrow");
    assert.equal(issues(tl), "clean");
  });
});
