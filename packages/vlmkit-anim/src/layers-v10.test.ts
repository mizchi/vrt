/**
 * The two generic layers v9 asked for: annotations every kind accepts
 * (value / callout / snapshot / group / text / relate over named anchors) and
 * `compose` (several scenes in panes). Read back from frames, not from meta.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { checkAnimation, explain } from "./check.ts";
import { compileScene, SceneValidationError } from "./compile/index.ts";
import { renderFrameSvg } from "./render-svg.ts";
import { EXAMPLES } from "./schema-sheet.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, type ComposeScene, type MatrixScene, type Scene, type SortScene, type StateMachineScene } from "./types.ts";
import { formatDiagnostics, validateScene } from "./validate.ts";

const clean = (scene: Scene) => {
  const tl = compileScene(scene);
  const diags = checkAnimation(tl, scene);
  assert.deepEqual(diags.filter((d) => d.severity === "error"), [], formatDiagnostics(diags));
  return { tl, diags };
};

describe("annotations: value", () => {
  const vc: MatrixScene = {
    format: SCENE_FORMAT,
    kind: "matrix",
    title: "Vector clocks",
    rowLabels: ["A", "B", "C"],
    colLabels: ["a", "b", "c"],
    cells: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    ops: [
      { set: { cell: [0, 0], value: 1 }, caption: "A has a local event" },
      { value: { id: "best", label: "events so far", text: 1 }, ms: 0 },
      { set: { cell: [1, 0], value: 1, from: [[0, 0]] }, caption: "B receives A's vector: max, then +1 on its own slot" },
      { set: { cell: [1, 1], value: 1 } },
      { value: { id: "best", text: 2 } },
      { snapshot: { of: "row:C", label: "C before its event" } },
      { set: { cell: [2, 2], value: 1 }, caption: "C's concurrent event" },
      { value: { id: "vC", label: "C", text: "[0,0,1]", at: "row:C", side: "right" }, ms: 0 },
      // No `side`: above the top-left cell is the title, and a stated side that cannot be honoured is a warning (v17).
      { callout: { at: "0,0", text: "A's event" } },
      { group: { around: ["row:A", "row:B"], label: "ordered" } },
      { callout: null, caption: "…" },
    ],
  };

  it("draws a panel readout the kind's canvas did not have room for, updates it in place, and narrates the change", () => {
    const plain = compileScene({ ...vc, ops: (vc.ops ?? []).filter((o) => !("value" in o || "snapshot" in o || "callout" in o || "group" in o)) });
    const { tl } = clean(vc);
    assert.ok(tl.canvas.width > plain.canvas.width, "the panel widened the canvas");
    const end = timelineDuration(tl);
    const frame = sampleFrame(tl, end);
    assert.equal(frame.get("value-best")!.text, "2", "the readout shows its last value");
    assert.equal(frame.get("value-best")!.opacity, 1);
    const text = explain(tl);
    assert.match(text, /A has a local event · events so far = 1/, "ms: 0 joins the previous beat's caption");
    assert.match(text, /^ *\d+\. \[ *\d+ms\] events so far = 2$/m, "a value of its own is a beat");
    // Anchored value sits to the right of row C's last cell.
    const cellC = frame.get("cell-2-2")!;
    const rowC = frame.get("row-2")!;
    const vC = frame.get("value-vC")!;
    assert.ok(vC.pos[0] > cellC.pos[0] + rowC.pos[0], "the anchored readout is to the right of the row");
    assert.equal(vC.text, "[0,0,1]");
  });

  it("snapshot freezes what the anchor showed at that moment; callout points at a cell and hides on null; group outlines rows", () => {
    const { tl, diags } = clean(vc);
    assert.deepEqual(diags.filter((d) => d.severity === "warn"), [], formatDiagnostics(diags));
    const end = timelineDuration(tl);
    const frame = sampleFrame(tl, end);
    const snap = tl.nodes.find((n) => n.id.startsWith("snapshot-") && !n.id.endsWith("-label"))!;
    assert.equal(frame.get(snap.id)!.text, "[0, 0, 0]", "row C had not moved yet when the snapshot was taken");
    assert.equal(frame.get("cell-2-2")!.text, "1", "…and the live cell has");
    const calloutBox = tl.nodes.find((n) => n.id.startsWith("callout-main-") && n.id.endsWith("-box"))!;
    const tShown = tl.steps!.find((s) => s.caption === "A's event")!.t;
    assert.equal(sampleFrame(tl, tShown + 1).get(calloutBox.id)!.opacity, 1);
    assert.equal(frame.get(calloutBox.id)!.opacity, 0, "callout: null hid it");
    // Asked for "above" cell 0,0, where the column headers are: since v12 the box takes the nearest free spot
    // instead, and covers no header.
    const shown = sampleFrame(tl, tShown + 1);
    const box = { x: calloutBox.pos![0] - calloutBox.size![0] / 2, y: calloutBox.pos![1] - calloutBox.size![1] / 2, w: calloutBox.size![0], h: calloutBox.size![1] };
    for (const hdr of tl.nodes.filter((n) => n.id.startsWith("col-label-"))) {
      const h = shown.get(hdr.id)!;
      const inside = h.pos[0] > box.x && h.pos[0] < box.x + box.w && h.pos[1] > box.y && h.pos[1] < box.y + box.h;
      assert.ok(!inside, `the callout box covers the header ${hdr.text}`);
    }
    const group = tl.nodes.find((n) => n.id.startsWith("group-main-") && !n.id.endsWith("-label"))!;
    assert.equal(frame.get(group.id)!.opacity, 1);
    assert.ok(group.size![1] > 2 * 20, "the outline spans two rows");
  });

  it("an unknown anchor is a scene error with a did-you-mean and the anchors that exist", () => {
    const bad: MatrixScene = { ...vc, ops: [{ callout: { at: "row:D", text: "?" } }] };
    assert.throws(
      () => compileScene(bad),
      (e: unknown) => {
        assert.ok(e instanceof SceneValidationError);
        const d = e.diagnostics.find((x) => x.path === "ops[0].callout.at")!;
        assert.match(d.message, /no anchor named "row:D" in this matrix scene/);
        assert.match(d.hint ?? "", /did you mean "row:[0-2ABC]"\?/);
        assert.match(d.hint ?? "", /"0,0"/);
        return true;
      },
    );
  });

  it("validator: shapes and enumerations, before compile", () => {
    const diags = validateScene({
      format: SCENE_FORMAT,
      kind: "sort",
      values: [2, 1],
      ops: [
        { value: { label: "x", text: 1 } },
        { callout: { at: "2", text: "t", side: "up" } },
        { text: { lines: ["a"], highlight: 3 } },
        { group: { around: [] } },
        { value: { id: "a", text: 1 }, callout: null },
      ],
    });
    const paths = diags.map((d) => d.path);
    assert.ok(paths.includes("ops[0].value.id"), formatDiagnostics(diags));
    assert.ok(paths.includes("ops[1].callout.side"));
    assert.ok(paths.includes("ops[2].text.highlight"));
    assert.ok(paths.includes("ops[3].group.around"));
    assert.ok(diags.some((d) => d.path === "ops[4]" && /exactly one action key/.test(d.message)));
  });
});

describe("annotations: relate (v10, da: a labelled line between two anchors where a group would enclose a bystander)", () => {
  const vc: MatrixScene = {
    format: SCENE_FORMAT,
    kind: "matrix",
    rowLabels: ["A", "B", "C"],
    colLabels: ["a", "b", "c"],
    cells: [[1, 0, 0], [1, 1, 0], [0, 0, 1]],
    ops: [
      { relate: { from: "row:A", to: "row:B", label: "A ≤ B" } },
      { relate: { from: "row:A", to: "row:C", label: "A ∥ C", style: "line", id: "conc" } },
      { relate: { from: "row:B", to: "row:C", label: "B ∥ C", id: "conc" }, caption: "B and C are concurrent too" },
      { relate: null, caption: "clear" },
    ],
  };

  it("draws an edge-to-edge arrow from one anchor's box to the other's, the label beside it; explain narrates the label", () => {
    const { tl, diags } = clean(vc);
    assert.deepEqual(diags.filter((d) => d.severity === "warn"), [], formatDiagnostics(diags));
    const t0 = tl.steps!.find((s) => s.caption === "A ≤ B")!.t;
    const frame = sampleFrame(tl, t0 + 1);
    const line = tl.nodes.find((n) => n.id.startsWith("relate-main-") && !n.id.endsWith("-label"))!;
    assert.equal(line.shape, "arrow");
    assert.equal(frame.get(line.id)!.opacity, 1);
    const label = frame.get(`${line.id}-label`)!;
    assert.equal(label.text, "A ≤ B");
    assert.equal(label.opacity, 1);
    // Row A is above row B and the two touch, so the arrow cannot run between their edges: it runs
    // downward beside the rows, from A's centre line to B's, past the rows' right end.
    const rowA = frame.get("row-0")!;
    const rowB = frame.get("row-1")!;
    const lastCell = frame.get("cell-0-2")!;
    const [p, q] = line.points!;
    const yStart = line.pos![1] + p[1];
    const yEnd = line.pos![1] + q[1];
    assert.ok(Math.abs(yStart - rowA.pos[1]) < 20 && Math.abs(yEnd - rowB.pos[1]) < 20 && yStart < yEnd, `arrow ${yStart}→${yEnd} between rows at ${rowA.pos[1]} and ${rowB.pos[1]}`);
    assert.ok(line.pos![0] > rowA.pos[0] + lastCell.pos[0], "the line is to the right of the rows, not across them");
    assert.ok(label.pos[0] > line.pos![0], "the label is beside the line, further out");
    const text = explain(tl);
    assert.match(text, /A ≤ B/);
    assert.match(text, /B and C are concurrent too/, "caption replaces the generated one");
  });

  it("the same id redraws (the old line goes), a plain `line` has no head, and null removes every relation", () => {
    const { tl } = clean(vc);
    const lines = tl.nodes.filter((n) => n.id.startsWith("relate-conc-") && !n.id.endsWith("-label"));
    assert.equal(lines.length, 2, "two relations shared the id conc");
    assert.equal(lines[0].shape, "line");
    assert.equal(lines[1].shape, "arrow");
    const tSecond = tl.steps!.find((s) => s.caption === "B and C are concurrent too")!.t;
    const mid = sampleFrame(tl, tSecond + 1);
    assert.equal(mid.get(lines[0].id)!.opacity, 0, "the first `conc` line was replaced");
    assert.equal(mid.get(lines[1].id)!.opacity, 1);
    const main = tl.nodes.find((n) => n.id.startsWith("relate-main-") && !n.id.endsWith("-label"))!;
    assert.equal(mid.get(main.id)!.opacity, 1, "a different id is untouched");
    const end = sampleFrame(tl, timelineDuration(tl));
    for (const n of tl.nodes.filter((n) => n.id.startsWith("relate-"))) assert.equal(end.get(n.id)!.opacity, 0, `${n.id} still visible after relate: null`);
  });

  it("validator: both ends must be anchors, different from each other; style is arrow | line; unknown anchors name the list", () => {
    const diags = validateScene({
      format: SCENE_FORMAT,
      kind: "sort",
      values: [2, 1],
      ops: [{ relate: { from: "2", to: "2" } }, { relate: { from: "2", to: "1", style: "dashed" } }, { relate: { from: "2" } }],
    });
    const paths = diags.map((d) => d.path);
    assert.ok(paths.includes("ops[0].relate.to"), formatDiagnostics(diags));
    assert.ok(paths.includes("ops[1].relate.style"));
    assert.ok(paths.includes("ops[2].relate.to"));
    assert.throws(
      () => compileScene({ ...vc, ops: [{ relate: { from: "row:A", to: "row:D" } }] }),
      (e: unknown) => e instanceof SceneValidationError && e.diagnostics.some((d) => d.path === "ops[0].relate.to" && /no anchor named "row:D"/.test(d.message)),
    );
  });

  it("a node row with no room beside it (ea, v11: distributed A → C over B) gets an arc over the bystander, on the canvas", () => {
    const s = {
      format: SCENE_FORMAT,
      kind: "distributed",
      title: "Vector clocks",
      nodes: ["A", "B", "C"],
      messages: [
        { value: { id: "vecA", label: "A", text: "[1,0,0]", at: "A" } },
        { from: "A", to: "B", label: "[1,0,0]" },
        { from: "B", to: "C", label: "[1,1,0]" },
        { relate: { from: "A", to: "C", label: "∥", style: "line" }, caption: "concurrent" },
        { relate: { from: "A", to: "C", label: "≤" }, caption: "ordered" },
      ],
    } as Scene;
    const { tl, diags } = clean(s);
    assert.deepEqual(diags.filter((d) => d.severity === "warn"), [], formatDiagnostics(diags));
    const arcs = tl.nodes.filter((n) => n.id.startsWith("relate-main-") && !n.id.endsWith("-label"));
    assert.equal(arcs.length, 2);
    assert.equal(arcs[0].shape, "path");
    assert.equal(arcs[0].head, false, "a `line` arc has no head");
    assert.equal(arcs[1].shape, "path");
    assert.equal(arcs[1].head, true, "an `arrow` arc ends in a head");
    const end = sampleFrame(tl, timelineDuration(tl));
    const b = end.get("node-B")!;
    const apex = arcs[1].pos!;
    assert.ok(Math.abs(apex[0] - b.pos[0]) < 40, "the arc peaks over B");
    assert.ok(Math.abs(apex[1] - b.pos[1]) > 20 && apex[1] > 0 && apex[1] < tl.canvas.height, `apex ${apex} is clear of B at ${b.pos} and on the canvas`);
    const svg = renderFrameSvg(tl, timelineDuration(tl));
    assert.match(svg, /<path d="M [^"]+ Q [^"]+"[^>]*marker-end=/, "the arc is drawn with an arrowhead");
  });

  it("every kind's list takes it", () => {
    for (const kind of ["diagram", "matrix", "graph", "chart", "sort", "array", "heap", "list", "tree", "stack", "queue", "state-machine", "distributed", "vector"] as const) {
      const ex = EXAMPLES[kind] as Scene & Record<string, unknown>;
      const listName = (["ops", "sequence", "trace", "messages", "timeline"] as const).find((k) => Array.isArray(ex[k])) ?? "ops";
      const withRelate = { ...ex, [listName]: [...((ex[listName] as unknown[]) ?? []), { relate: { from: "x", to: "y" } }] } as Scene;
      assert.deepEqual(validateScene(withRelate).filter((d) => d.severity === "error"), [], `${kind} rejects a relate op`);
    }
  });
});

describe("layout defects the v11 frames showed (eb's Pandora scene)", () => {
  it("a title wider than the kind's own canvas is re-centred over the whole canvas, or the canvas grows to hold it", () => {
    const s: MatrixScene = {
      format: SCENE_FORMAT,
      kind: "matrix",
      title: "Batched Pandora's Box: one adaptive run (k=2, T=1/5)",
      rowLabels: ["cost", "reward"],
      colLabels: ["box1", "box2", "box3"],
      cells: [[0.2, 0.2, 0.5], [null, null, null]],
      ops: [{ set: { cell: [1, 0], value: 0.5 } }, { value: { id: "cost", label: "cost so far (setup + boxes)", text: "0.6 (setup 0.2 + boxes 0.2+0.2)" } }],
    };
    const { tl } = clean(s);
    const title = tl.nodes.find((n) => n.id === "title")!;
    assert.equal(title.pos![0], tl.canvas.width / 2, "centred over the final canvas, panel included");
    const narrow = clean({ ...s, ops: [{ set: { cell: [1, 0], value: 0.5 } }] }).tl;
    const t2 = narrow.nodes.find((n) => n.id === "title")!;
    assert.ok(t2.pos![0] - 300 >= 0 && t2.pos![0] + 300 <= narrow.canvas.width, `title of ~600px still fits a ${narrow.canvas.width}px canvas centred at ${t2.pos![0]}`);
  });

  it("a group label moves off a column header that already occupies its top-left corner", () => {
    const s: MatrixScene = {
      format: SCENE_FORMAT,
      kind: "matrix",
      rowLabels: ["cost", "reward"],
      colLabels: ["box1", "box2", "box3"],
      cells: [[0.2, 0.2, 1], [null, null, null]],
      ops: [{ group: { around: "col:box3", label: "Batch 2" } }],
    };
    const { tl } = clean(s);
    const label = tl.nodes.find((n) => n.id.startsWith("group-main-") && n.id.endsWith("-label"))!;
    const rect = tl.nodes.find((n) => n.id.startsWith("group-main-") && !n.id.endsWith("-label"))!;
    const top = rect.pos![1] - rect.size![1] / 2;
    const header = tl.nodes.find((n) => n.shape === "text" && n.text === "box3")!;
    assert.ok(!(Math.abs(label.pos![1] - header.pos![1]) < 10 && label.pos![0] < header.pos![0] + 30), `label at ${label.pos} sits on the header at ${header.pos}`);
    assert.ok(label.pos![1] >= top - 12, "and it stayed at the outline, not somewhere arbitrary");
  });
});

describe("annotations reach every kind's list", () => {
  it("state-machine trace, distributed messages, vector timeline, sort ops, chart sequence", () => {
    const sm: StateMachineScene = { ...EXAMPLES["state-machine"], trace: [...EXAMPLES["state-machine"].trace, { value: { id: "n", label: "events", text: 3 } }] };
    assert.match(explain(clean(sm).tl), /events = 3/);
    const dist = { ...EXAMPLES.distributed, messages: [...EXAMPLES.distributed.messages, { callout: { at: EXAMPLES.distributed.nodes.map((n) => (typeof n === "string" ? n : n.id))[0], text: "waits here" } }] } as Scene;
    assert.match(explain(clean(dist).tl), /waits here/);
    const vec = { ...EXAMPLES.vector, timeline: [...EXAMPLES.vector.timeline, { text: { lines: ["x = 1", "y = 2"], highlight: 1 } }] } as Scene;
    const vtl = clean(vec).tl;
    assert.ok(vtl.nodes.some((n) => n.id.startsWith("text-main-") && n.id.endsWith("-line-1")));
    const sort: SortScene = { format: SCENE_FORMAT, kind: "sort", values: [5, 3, 8], ops: [{ compare: [0, 1] }, { callout: { at: "8", text: "largest" } }, { swap: [0, 1] }, { done: [0, 1, 2] }] };
    clean(sort);
    const chart = { ...EXAMPLES.chart, sequence: [{ reveal: "all" }, { group: { around: [EXAMPLES.chart.series[0].id], label: "series" } }] } as Scene;
    clean(chart);
    // dc (v10) had this rejected: diagram's action list had not been extended with the shared ops.
    const diagram = { ...EXAMPLES.diagram, sequence: [...(EXAMPLES.diagram.sequence ?? []), { text: { lines: ['{"kind": "sort",', ' "values": [5, 3]}'], at: EXAMPLES.diagram.nodes[0].id, side: "below" } }] } as Scene;
    assert.deepEqual(validateScene(diagram).filter((d) => d.severity === "error"), []);
    clean(diagram);
    for (const kind of ["diagram", "matrix", "graph", "chart", "sort", "array", "heap", "list", "tree", "stack", "queue"] as const) {
      const ex = EXAMPLES[kind] as Scene & { ops?: unknown[]; sequence?: unknown[] };
      const listName = "sequence" in ex && ex.sequence ? "sequence" : "ops";
      const withValue = { ...ex, [listName]: [...((ex as unknown as Record<string, unknown[]>)[listName] ?? []), { value: { id: "n", text: 1 } }] } as Scene;
      assert.deepEqual(validateScene(withValue).filter((d) => d.severity === "error"), [], `${kind} rejects a value op`);
    }
  });

  it("`ms` is accepted on an annotation even in kinds whose own ops take only `caption` (queue, heap, list, tree)", () => {
    for (const scene of [
      { format: SCENE_FORMAT, kind: "queue", initial: ["a"], ops: [{ dequeue: true }, { value: { id: "t", text: 1 }, ms: 0 }] },
      { format: SCENE_FORMAT, kind: "heap", ops: [{ push: 3 }, { callout: { at: "0", text: "root" }, ms: 0 }] },
      { format: SCENE_FORMAT, kind: "list", ops: [{ insert: { value: 1 } }, { group: { around: ["1"] }, ms: 0 }] },
      { format: SCENE_FORMAT, kind: "tree", ops: [{ insert: 5 }, { snapshot: { of: "5" }, ms: 0 }] },
    ] as Scene[]) {
      const diags = validateScene(scene);
      assert.deepEqual(diags.filter((d) => d.severity === "error"), [], `${scene.kind}: ${formatDiagnostics(diags)}`);
      clean(scene);
    }
  });

  it("text block: same id + same line count updates in place, a different shape is redrawn, null hides", () => {
    const s: SortScene = {
      format: SCENE_FORMAT,
      kind: "sort",
      values: [2, 1],
      ops: [
        { text: { id: "code", lines: ["for i:", "  swap"], highlight: 0 } },
        { swap: [0, 1] },
        { text: { id: "code", lines: ["for i:", "  swap"], highlight: 1 } },
        { text: { id: "code", lines: ["done"] } },
        { text: null },
      ],
    };
    const { tl } = clean(s);
    const blocks = tl.nodes.filter((n) => /^text-code-\d+-box$/.test(n.id));
    assert.equal(blocks.length, 2, "one block for the two-line shape, one for the one-line shape");
    const end = timelineDuration(tl);
    for (const bx of blocks) assert.equal(sampleFrame(tl, end).get(bx.id)!.opacity, 0, "null hid the block");
  });
});

describe("compose", () => {
  const two: ComposeScene = EXAMPLES.compose;

  it("parallel: both panes start at 0, side by side, captions prefixed by the pane title; sequence: the second waits", () => {
    const par = clean(two).tl;
    const panes = par.meta?.panes as { id: string; x: number; y: number; offset: number; duration: number; width: number }[];
    assert.equal(panes.length, 2);
    assert.equal(panes[1].offset, 0);
    assert.ok(panes[1].x >= panes[0].x + panes[0].width, "side by side");
    assert.match(explain(par), /bubble: .* · insertion: /, "coinciding beats join with the pane titles");
    const seq = clean({ ...two, timing: "sequence" }).tl;
    const seqPanes = seq.meta?.panes as typeof panes;
    assert.equal(seqPanes[1].offset, seqPanes[0].duration);
    assert.ok(timelineDuration(seq) > timelineDuration(par));
    // Every pane node was translated: no top-level node of pane 2 sits left of its slot.
    const frame = sampleFrame(par, 0);
    for (const n of par.nodes.filter((x) => x.id.startsWith("pane-2:") && !x.parent)) assert.ok(frame.get(n.id)!.pos[0] >= panes[1].x - 1, n.id);
  });

  it("column layout stacks; a pane's own checks surface under its path; nesting is refused", () => {
    const col = clean({ ...two, layout: "column" }).tl;
    const panes = col.meta?.panes as { x: number; y: number; height: number }[];
    assert.ok(panes[1].y >= panes[0].y + panes[0].height);
    const broken: ComposeScene = {
      ...two,
      panes: [{ scene: { format: SCENE_FORMAT, kind: "sort", values: [3, 1, 2], ops: [{ swap: [0, 1] }] } }, two.panes[1]],
    };
    const tl = compileScene(broken);
    const diags = checkAnimation(tl, broken);
    assert.ok(diags.some((d) => d.severity === "error" && d.path.startsWith("panes[0].scene.")), formatDiagnostics(diags));
    const nested = validateScene({ format: SCENE_FORMAT, kind: "compose", panes: [{ scene: two }] });
    assert.ok(nested.some((d) => d.path === "panes[0].scene.kind" && /cannot itself be a compose/.test(d.message)));
    const inner = validateScene({ format: SCENE_FORMAT, kind: "compose", panes: [{ scene: { format: SCENE_FORMAT, kind: "sort", values: [1] } }] });
    assert.ok(inner.some((d) => d.path === "panes[0].scene.values"), formatDiagnostics(inner));
  });
});
