/**
 * The deterministic layout reading (text on text, text under a filled box, text past
 * the edge) and the review protocol that compares a reader's JSON against it.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { formatLayout, layoutFrame, layoutReport } from "./layout.ts";
import { formatScore, parseAnswers, reviewBrief, reviewTiles, scoreReview } from "./review.ts";
import { sampleTimes } from "./render-svg.ts";
import { SCENE_FORMAT, TIMELINE_FORMAT, type MatrixScene, type Timeline } from "./types.ts";

const tl = (nodes: Timeline["nodes"], extra: Partial<Timeline> = {}): Timeline => ({
  format: TIMELINE_FORMAT,
  canvas: { width: 300, height: 200 },
  nodes,
  tracks: [],
  steps: [{ t: 0, caption: "one" }],
  ...extra,
});

describe("layout: geometry", () => {
  it("two texts on top of each other are an overlap; side by side they are not", () => {
    const over = layoutFrame(tl([{ id: "a", shape: "text", pos: [100, 50], text: "hello" }, { id: "b", shape: "text", pos: [104, 52], text: "world" }]), 0);
    assert.equal(over.length, 1);
    assert.equal(over[0].kind, "overlap");
    assert.deepEqual(over[0].nodes, ["a", "b"]);
    assert.ok(over[0].amount > 0.5);
    const apart = layoutFrame(tl([{ id: "a", shape: "text", pos: [60, 50], text: "hello" }, { id: "b", shape: "text", pos: [200, 50], text: "world" }]), 0);
    assert.deepEqual(apart, []);
  });

  it("a narrow bar down the middle of a text cuts the word: an overlap whatever its area (v20)", () => {
    const cut = layoutFrame(
      tl([
        { id: "tag", shape: "text", pos: [60, 50], text: "alt [cached]", fontSize: 11, anchor: "start" },
        { id: "bar", shape: "rect", pos: [90, 80], size: [10, 120], fill: "#fff", stroke: "#000" },
      ]),
      0,
    );
    assert.equal(cut.length, 1, JSON.stringify(cut));
    assert.deepEqual(cut[0].nodes, ["tag", "bar"]);
    assert.ok(cut[0].amount < 0.2, "the area says almost nothing");
    const beside = layoutFrame(tl([{ id: "tag", shape: "text", pos: [60, 50], text: "alt [cached]", fontSize: 11, anchor: "start" }, { id: "bar", shape: "rect", pos: [180, 80], size: [10, 120], fill: "#fff" }]), 0);
    assert.deepEqual(beside, []);
  });

  it("a text under a filled box drawn after it is hidden; its own box or an ancestor is not", () => {
    const hidden = layoutFrame(
      tl([
        { id: "header", shape: "text", pos: [100, 50], text: "box3" },
        { id: "callout", shape: "rect", pos: [100, 50], size: [80, 24], fill: "#f59e0b" },
      ]),
      0,
    );
    assert.equal(hidden.length, 1);
    assert.deepEqual(hidden[0].nodes, ["header", "callout"]);
    const own = layoutFrame(tl([{ id: "cell", shape: "rect", pos: [100, 50], size: [40, 30], fill: "#fff", text: "7" }]), 0);
    assert.deepEqual(own, [], "a labelled box is not hiding its own label");
    const child = layoutFrame(
      tl([
        { id: "row", shape: "rect", pos: [100, 50], size: [200, 40], fill: "#eee" },
        { id: "lbl", shape: "text", pos: [0, 0], text: "inside", parent: "row" },
      ]),
      0,
    );
    assert.deepEqual(child, [], "a text inside its ancestor box is where it belongs");
  });

  it("a text past the canvas edge is clipped by that many pixels; hidden nodes are ignored", () => {
    const clipped = layoutFrame(tl([{ id: "title", shape: "text", pos: [40, 20], text: "a very long title indeed", fontSize: 18 }]), 0);
    assert.equal(clipped.length, 1);
    assert.equal(clipped[0].kind, "clipped");
    assert.ok(clipped[0].amount > 50, String(clipped[0].amount));
    const hidden = layoutFrame(tl([{ id: "title", shape: "text", pos: [40, 20], text: "a very long title indeed", fontSize: 18, opacity: 0 }]), 0);
    assert.deepEqual(hidden, []);
  });

  it("the report samples every step and totals; the formatted text names texts, not only ids", () => {
    const scene: MatrixScene = {
      format: SCENE_FORMAT,
      kind: "matrix",
      rowLabels: ["cost", "reward"],
      colLabels: ["box1", "box2", "box3"],
      cells: [[0.2, 0.2, 1], [null, null, null]],
      ops: [{ set: { cell: [1, 0], value: 0.5 } }, { callout: { at: "1,0", text: "the cheap one", side: "above" } }],
    };
    const compiled = compileScene(scene);
    const report = layoutReport(compiled);
    assert.equal(report.frames.length, sampleTimes(compiled, 0).length);
    assert.equal(report.totals.frames, report.frames.length);
    const text = formatLayout(report);
    assert.match(text, /\d+ of \d+ frames with layout issues/);
    // The callout was asked for above cell 1,0, where row 0's cells are: the compiler moves it to a free side,
    // and the geometry, which found it there first (v12), now reads the frame clean.
    assert.equal(report.totals.overlaps, 0, formatLayout(report));
    const calloutBox = compiled.nodes.find((n) => n.id.startsWith("callout-main-") && n.id.endsWith("-box"))!;
    const cell = compiled.nodes.find((n) => n.id === "cell-1-0")!;
    const row = compiled.nodes.find((n) => n.id === "row-1")!;
    assert.ok(calloutBox.pos![1] > cell.pos![1] + row.pos![1] || Math.abs(calloutBox.pos![1] - (cell.pos![1] + row.pos![1])) < 30, "not above, where the other row is");
  });
});

describe("review: brief, answers, score", () => {
  // A hand-written timeline with one deliberate collision at its second step, since the compiler no longer makes any.
  const compiled = tl(
    [
      { id: "h", shape: "text", pos: [100, 40], text: "header" },
      { id: "lbl", shape: "text", pos: [102, 42], text: "A's event", opacity: 0 },
    ],
    {
      tracks: [{ target: "lbl", prop: "opacity", keyframes: [{ t: 0, value: 0 }, { t: 500, value: 1 }, { t: 1000, value: 0 }] }],
      steps: [{ t: 0, caption: "start" }, { t: 500, caption: "A's event" }, { t: 1000, caption: "gone" }],
    },
  );
  const times = sampleTimes(compiled, 0);
  const report = layoutReport(compiled);

  it("the brief lists every tile with its step and caption and asks for the JSON shape", () => {
    const tiles = reviewTiles(compiled, times);
    assert.equal(tiles.length, times.length);
    const brief = reviewBrief("Test", tiles);
    assert.match(brief, /- frame 1 \(step 1\), 0ms/);
    assert.match(brief, /A's event/);
    assert.match(brief, /"frames": \[/);
  });

  it("answers parse from a fenced block, unknown kinds become other, bad shapes are named", () => {
    const a = parseAnswers('```json\n{"frames":[{"frame":1,"issues":[]},{"frame":2,"issues":[{"kind":"smudge","what":"x"}]}],"notes":"n"}\n```');
    assert.equal(a.frames.length, 2);
    assert.equal(a.frames[1].issues[0].kind, "other");
    assert.equal(a.notes, "n");
    assert.throws(() => parseAnswers("{}"), /frames/);
    assert.throws(() => parseAnswers('{"frames":[{"frame":"1"}]}'), /frame must be a number/);
  });

  it("the score is frame-level agreement with recall and precision", () => {
    const flagged = report.frames.filter((f) => f.issues.length).map((f) => f.index);
    assert.ok(flagged.length >= 1, "the callout over the header gives the geometry something to flag");
    const perfect = scoreReview(report, { frames: report.frames.map((f) => ({ frame: f.index, issues: f.issues.map((i) => ({ kind: i.kind === "boxes" ? ("other" as const) : i.kind, what: i.texts.join(" on ") })) })) });
    assert.equal(perfect.totals.recall, 1);
    assert.equal(perfect.totals.precision, 1);
    assert.equal(perfect.totals.geometryOnly, 0);
    const blind = scoreReview(report, { frames: [] });
    assert.equal(blind.totals.recall, 0);
    assert.equal(blind.totals.geometryOnly, flagged.length);
    const eager = scoreReview(report, { frames: report.frames.map((f) => ({ frame: f.index, issues: [{ kind: "other" as const, what: "everything" }] })) });
    assert.equal(eager.totals.recall, 1);
    assert.ok(eager.totals.precision < 1);
    const text = formatScore(eager, report, { frames: [] });
    assert.match(text, /\| frame \| geometry \| reader \| agreement \|/);
    assert.match(text, /recall 1/);
  });
});

describe("layout: a line through a text (v13)", () => {
  it("an edge across a label is a crossing; the label's own edge, a haloed label and a callout pointer over a box are not", () => {
    const across = layoutFrame(tl([{ id: "lbl", shape: "text", pos: [100, 50], text: "platform" }, { id: "edge-0", shape: "arrow", points: [[20, 50], [200, 50]] }]), 0);
    assert.equal(across.length, 1);
    assert.equal(across[0].kind, "crossed");
    assert.deepEqual(across[0].nodes, ["lbl", "edge-0"]);
    assert.ok(across[0].amount > 30, String(across[0].amount));
    const own = layoutFrame(tl([{ id: "edge-0-label", shape: "text", pos: [100, 50], text: "emits" }, { id: "edge-0", shape: "arrow", points: [[20, 50], [200, 50]] }]), 0);
    assert.deepEqual(own, [], "an edge label belongs to its edge");
    const halo = layoutFrame(tl([{ id: "lbl", shape: "text", pos: [100, 50], text: "platform", halo: true }, { id: "edge-0", shape: "arrow", points: [[20, 50], [200, 50]] }]), 0);
    assert.deepEqual(halo, [], "a halo breaks the line around the glyphs");
    const pointer = layoutFrame(tl([{ id: "cell", shape: "rect", pos: [100, 50], size: [40, 30], fill: "#fff", text: "7" }, { id: "callout-main-0-arrow", shape: "arrow", points: [[100, 0], [100, 120]] }]), 0);
    assert.deepEqual(pointer, [], "a callout pointer may pass over a labelled box on its way");
    const bent = layoutFrame(tl([{ id: "lbl", shape: "text", pos: [100, 50], text: "platform" }, { id: "edge-0", shape: "path", pos: [20, 10], d: "M 0 0 L 80 40 L 180 40" }]), 0);
    assert.equal(bent.length, 1, "a bent edge is read segment by segment");
    const faded = layoutFrame(tl([{ id: "lbl", shape: "text", pos: [100, 50], text: "platform" }, { id: "edge-0", shape: "arrow", points: [[20, 50], [200, 50]], opacity: 0.2 }]), 0);
    assert.deepEqual(faded, [], "a faded stroke is not there");
  });

  it("the report totals crossings and the text names them", () => {
    const report = layoutReport(tl([{ id: "lbl", shape: "text", pos: [100, 50], text: "platform" }, { id: "edge-0", shape: "arrow", points: [[20, 50], [200, 50]] }]));
    assert.equal(report.totals.crossed, 1);
    assert.match(formatLayout(report), /crossed\s+"platform" has a line through it/);
    assert.match(formatLayout(report), /1 crossed$/);
  });
});
