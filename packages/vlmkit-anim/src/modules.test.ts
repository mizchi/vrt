/**
 * `modules`: a still-figure preset over `diagram` — layers from dependencies, containers that hold
 * exactly their members, a cycle check — and `still` rendering without a caption.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { checkAnimation } from "./check.ts";
import { labelWidth, wrapText } from "./compile/builder.ts";
import { compileScene, moduleCycles, moduleLayers, normalizeModules } from "./compile/index.ts";
import { layoutReport } from "./layout.ts";
import { renderFrameSvg } from "./render-svg.ts";
import { EXAMPLES } from "./schema-sheet.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, type DiagramScene, type ModulesScene } from "./types.ts";
import { formatDiagnostics, validateScene } from "./validate.ts";

const ex = EXAMPLES.modules;

describe("modules: layers and containers", () => {
  it("compiles clean, with no layout issues, and reads as a still (no 'no sequence' warning)", () => {
    const tl = compileScene(ex);
    const diags = checkAnimation(tl, ex);
    assert.deepEqual(diags, [], formatDiagnostics(diags));
    assert.equal(layoutReport(tl).totals.framesWithIssues, 0);
    assert.equal(tl.meta?.kind, "modules");
  });

  it("a module sits below everything it depends on (tb), or right of it (lr)", () => {
    const layers = moduleLayers(ex);
    assert.equal(layers.get("db"), 0, "db depends on nothing drawn: a leaf");
    assert.equal(layers.get("auth"), 1);
    assert.equal(layers.get("api"), 2);
    assert.equal(layers.get("web"), 3);
    const tb = sampleFrame(compileScene(ex), 0);
    assert.ok(tb.get("web")!.pos[1] < tb.get("api")!.pos[1] && tb.get("api")!.pos[1] < tb.get("auth")!.pos[1] && tb.get("auth")!.pos[1] < tb.get("db")!.pos[1]);
    const lr = sampleFrame(compileScene({ ...ex, layout: "lr" }), 0);
    assert.ok(lr.get("web")!.pos[0] < lr.get("api")!.pos[0] && lr.get("api")!.pos[0] < lr.get("db")!.pos[0]);
  });

  it("a container is drawn around exactly its members: every member inside, no bystander inside", () => {
    const tl = compileScene(ex);
    const frame = sampleFrame(tl, 0);
    const inside = (id: string, box: { pos: [number, number]; size?: [number, number] }) => {
      const p = frame.get(id)!.pos;
      const [w, h] = box.size!;
      return Math.abs(p[0] - box.pos[0]) < w / 2 && Math.abs(p[1] - box.pos[1]) < h / 2;
    };
    for (const g of ex.groups!) {
      const box = frame.get(g.id)!;
      for (const m of g.modules) assert.ok(inside(m, box), `${m} is outside its container ${g.id}`);
      for (const other of ex.modules.map((m) => (typeof m === "string" ? m : m.id))) {
        if (!g.modules.includes(other)) assert.ok(!inside(other, box), `${other} is inside ${g.id}, which is not its group`);
      }
    }
    assert.equal(frame.get("core-label")!.text, "core");
  });

  it("highlighting a group lights its outline; the group and 'a->b' are anchors", () => {
    // The fixture is the example plus a sequence that highlights the core group and relates web to db.
    const walked = JSON.parse(readFileSync(new URL("../fixtures/modules-web-service.json", import.meta.url), "utf8")) as ModulesScene;
    const tl = compileScene(walked);
    const end = sampleFrame(tl, timelineDuration(tl));
    const t = tl.steps!.find((s) => s.caption?.startsWith("The core"))!.t;
    assert.equal(sampleFrame(tl, t + 1).get("core")!.stroke, "#f59e0b");
    assert.notEqual(end.get("core")!.stroke, "#f59e0b", "unhighlighted again at the end");
    assert.ok(tl.nodes.some((n) => n.id.startsWith("relate-main-") && n.id.endsWith("-label") && n.text === "never directly"));
  });

  it("a dependency cycle is a warning naming the path; the map still compiles", () => {
    const cyclic: ModulesScene = { format: SCENE_FORMAT, kind: "modules", modules: ["a", "b", "c"], deps: [["a", "b"], ["b", "c"], ["c", "a"]] };
    assert.deepEqual(moduleCycles(cyclic), [["a", "b", "c", "a"]]);
    const tl = compileScene(cyclic);
    const diags = checkAnimation(tl, cyclic);
    assert.ok(diags.some((d) => d.severity === "warn" && /dependency cycle: a → b → c → a/.test(d.message)), formatDiagnostics(diags));
  });

  it("validator: unknown modules in deps and groups, a module in two groups, a non-module id", () => {
    const diags = validateScene({
      format: SCENE_FORMAT,
      kind: "modules",
      modules: ["a", { id: "b" }, { label: "no id" }],
      deps: [["a", "zz"], { from: "b", to: "a", style: "dotted" }, ["a"]],
      groups: [{ id: "g1", modules: ["a", "b"] }, { id: "g2", modules: ["b"] }, { id: "a", modules: ["a"] }],
    });
    const paths = diags.map((d) => d.path);
    assert.ok(paths.includes("modules[2].id"), formatDiagnostics(diags));
    assert.ok(paths.includes("deps[0][1]"));
    assert.ok(paths.includes("deps[1].style"));
    assert.ok(paths.includes("deps[2]"));
    assert.ok(paths.includes("groups[1].modules[0]"));
    assert.ok(paths.includes("groups[2].id"));
    const ok = validateScene(ex);
    assert.deepEqual(ok.filter((d) => d.severity === "error"), [], formatDiagnostics(ok));
  });

  it("normalises to a diagram with groups, sized for the map", () => {
    const d = normalizeModules(ex);
    assert.equal(d.kind, "diagram");
    assert.equal(d.nodes.length, 6);
    assert.equal(d.edges!.length, 6);
    assert.equal(d.groups!.length, 3);
    assert.equal(d.layout, "tb");
    assert.ok((d.canvas!.height ?? 0) >= 4 * 60, "four layers need height");
  });
});

describe("diagram groups and still", () => {
  it("a plain diagram takes groups too; a group id is a show/hide target", () => {
    const scene: DiagramScene = {
      format: SCENE_FORMAT,
      kind: "diagram",
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
      groups: [{ id: "left", label: "left", nodes: ["a", "b"] }],
      sequence: [{ hide: "left", caption: "the left side goes" }],
    };
    const tl = compileScene(scene);
    const diags = checkAnimation(tl, scene).filter((d) => d.severity === "error");
    assert.deepEqual(diags, []);
    assert.equal(sampleFrame(tl, timelineDuration(tl)).get("left")!.opacity, 0);
  });

  it("a still is the frame without its caption", () => {
    const tl = compileScene(ex);
    const svg = renderFrameSvg(tl, timelineDuration(tl), { caption: false });
    assert.doesNotMatch(svg, /data-caption/);
    assert.match(svg, /infrastructure/);
  });
});

describe("modules: v13 — the writers' friction", () => {
  const base = { format: SCENE_FORMAT, kind: "modules" } as const;
  const nodeOf = (tl: ReturnType<typeof compileScene>, id: string) => tl.nodes.find((n) => n.id === id)!;

  it("two modules with the same dependencies share a layer, whatever depends on them (fa)", () => {
    // `root` reaches `x` in one hop and `y` in two; under a root walk they landed on different layers.
    const s: ModulesScene = { ...base, modules: ["root", "mid", "x", "y", "core"], deps: [["root", "x"], ["root", "mid"], ["mid", "y"], ["x", "core"], ["y", "core"]] };
    const tl = compileScene(s);
    assert.equal(nodeOf(tl, "x").pos![1], nodeOf(tl, "y").pos![1], "x and y both depend on core alone: one layer");
    assert.ok(nodeOf(tl, "core").pos![1] > nodeOf(tl, "x").pos![1], "core, the leaf, is at the bottom");
    assert.ok(nodeOf(tl, "root").pos![1] < nodeOf(tl, "mid").pos![1], "root above mid");
  });

  it("a group that owns its layers is a full-width row; groups sharing a layer get bands (fd)", () => {
    const s: ModulesScene = {
      ...base,
      modules: ["web", "gateway", "checkout", "inventory", "payments", "orders", "db", "queue"],
      deps: [["web", "gateway"], ["gateway", "checkout"], ["checkout", "inventory"], ["checkout", "payments"], ["checkout", "orders"], ["inventory", "db"], ["orders", "db"], ["orders", "queue"], ["payments", "queue"]],
      groups: [
        { id: "frontend", modules: ["web", "gateway"] },
        { id: "domain", modules: ["checkout", "inventory", "payments", "orders"] },
        { id: "platform", modules: ["db", "queue"] },
      ],
    };
    const tl = compileScene(s);
    const fe = nodeOf(tl, "frontend");
    const dom = nodeOf(tl, "domain");
    const pf = nodeOf(tl, "platform");
    // Stacked: each container below the previous, none beside another.
    assert.ok(fe.pos![1] + fe.size![1] / 2 <= dom.pos![1] - dom.size![1] / 2 + 1, "frontend above domain");
    assert.ok(dom.pos![1] + dom.size![1] / 2 <= pf.pos![1] - pf.size![1] / 2 + 1, "domain above platform");
    assert.ok(Math.abs(fe.pos![0] - dom.pos![0]) < tl.canvas.width / 4, "rows are centred on the same axis, not staggered into bands");
    assert.equal(layoutReport(tl).totals.crossed, 0);
  });

  it("a forbidden dependency is drawn dashed in the bad colour, labelled ✗ by default, and ignored by layers and cycles (fb, fe)", () => {
    const s: ModulesScene = {
      ...base,
      modules: ["app", "domain", "port", "postgres"],
      deps: [["app", "domain"], ["app", "port"], ["postgres", "port"], { from: "domain", to: "postgres", style: "forbidden" }],
    };
    assert.deepEqual(moduleCycles(s), []);
    assert.equal(moduleLayers(s).get("domain"), 0, "domain depends on nothing real: a leaf, whatever the forbidden edge says");
    const tl = compileScene(s);
    const edge = nodeOf(tl, "edge-3");
    assert.equal(edge.dashed, true);
    assert.notEqual(edge.stroke, nodeOf(tl, "edge-0").stroke, "not the ordinary edge colour");
    assert.equal(nodeOf(tl, "edge-3-label").text, "✗");
    assert.ok(nodeOf(tl, "domain").pos![1] >= nodeOf(tl, "postgres").pos![1] - 1, "domain is not pushed above postgres by an edge that must not exist");
    const diags = checkAnimation(tl, s);
    assert.deepEqual(diags.filter((d) => d.severity === "error"), [], formatDiagnostics(diags));
    assert.ok(!diags.some((d) => /cycle/.test(d.message)));
    const dashed: ModulesScene = { ...base, modules: ["a", "b"], deps: [{ from: "a", to: "b", style: "dashed", label: "optional peer" }] };
    assert.equal(nodeOf(compileScene(dashed), "edge-0").dashed, true);
    assert.equal(nodeOf(compileScene(dashed), "edge-0-label").halo, true, "an edge label sits on lines: haloed");
  });

  it("highlight takes an edge \"a->b\": the stroke lights up and the validator accepts it (fc, fd)", () => {
    const s: ModulesScene = {
      ...base,
      modules: ["a", "b", "c"],
      deps: [["a", "b"], { from: "b", to: "c", label: "async" }],
      sequence: [{ highlight: ["b->c"], caption: "the asynchronous hop" }, { unhighlight: "b->c" }],
    };
    assert.deepEqual(validateScene(s).filter((d) => d.severity === "error"), [], formatDiagnostics(validateScene(s)));
    const tl = compileScene(s);
    const t = tl.steps!.find((st) => st.caption === "the asynchronous hop")!.t;
    const frame = sampleFrame(tl, t + 1);
    assert.notEqual(frame.get("edge-1")!.stroke, frame.get("edge-0")!.stroke, "the highlighted edge differs from the plain one");
    assert.equal(sampleFrame(tl, timelineDuration(tl)).get("edge-1")!.stroke, frame.get("edge-0")!.stroke, "unhighlight restores it");
  });

  it("an edge that would run behind a box that is not one of its ends bends around it; a flow follows the bend", () => {
    // `top` depends on `bottom` two layers down, with `mid` directly in between.
    const s: ModulesScene = { ...base, modules: ["top", "mid", "bottom"], deps: [["top", "mid"], ["mid", "bottom"], ["top", "bottom"]], sequence: [{ flow: "top->bottom" }] };
    const tl = compileScene(s);
    const long = nodeOf(tl, "edge-2");
    assert.equal(long.shape, "path", "bent: a path through a waypoint");
    assert.ok(long.head, "still an arrow");
    assert.equal(layoutReport(tl).totals.crossed, 0);
    const token = tl.tracks.filter((tr) => tr.target === "token" && tr.prop === "pos");
    assert.ok(token.some((tr) => tr.keyframes.length >= 3), "the token visits the waypoint");
  });

  it("relate takes a tone: bad is the bad colour and dashed; its label is haloed", () => {
    const s: ModulesScene = { ...base, modules: ["a", "b"], deps: [], sequence: [{ relate: { from: "a", to: "b", label: "never", tone: "bad" } }] };
    const tl = compileScene(s);
    const line = tl.nodes.find((n) => /^relate-main-\d+$/.test(n.id))!;
    assert.equal(line.dashed, true);
    assert.equal(line.stroke, nodeOf(compileScene({ ...s, sequence: [] }), "a").stroke === line.stroke ? "no" : line.stroke);
    assert.equal(tl.nodes.find((n) => /^relate-main-\d+-label$/.test(n.id))!.halo, true);
  });
});

describe("modules: v14 — the writers' friction", () => {
  const attempt = (letter: string): ModulesScene => JSON.parse(readFileSync(new URL(`../../../fixtures/anim-scenario/attempts/${letter}/scene.json`, import.meta.url), "utf-8")) as ModulesScene;

  it("a callout wider than the picture is wrapped instead of laid across the graph and past the edge (hc)", () => {
    // hc's round 2: a 70-character callout on the back edge of an eleven-module graph — clipped 18px past the
    // canvas and through six edges, because no spot on the canvas could hold it and the fallback was unchecked.
    const s = attempt("hc");
    const seq = s.sequence!.map((st) => ("callout" in st && st.callout ? { ...st, callout: { at: st.callout.at, text: "Cut events→handlers: events should notify, not call back into handlers" } } : st));
    const tl = compileScene({ ...s, sequence: seq });
    const text = tl.nodes.find((n) => /^callout-main-\d+-text$/.test(n.id))!;
    assert.ok(text.text!.includes("\n"), `wrapped: ${JSON.stringify(text.text)}`);
    assert.ok(text.text!.split("\n").length >= 2 && text.text!.split("\n").length <= 4);
    const r = layoutReport(tl);
    assert.equal(r.totals.clipped, 0, formatLayoutIssues(r));
    assert.equal(r.totals.crossed, 0, formatLayoutIssues(r));
    // Lines the writer broke themselves are kept as written.
    const own = compileScene({ ...s, sequence: s.sequence!.map((st) => ("callout" in st && st.callout ? { ...st, callout: { at: st.callout.at, text: "Cut here:\nevents should notify" } } : st)) });
    assert.equal(own.nodes.find((n) => /^callout-main-\d+-text$/.test(n.id))!.text, "Cut here:\nevents should notify");
  });

  it("a group label hemmed in by edges on every side gets a halo at the least-crossed spot (hd)", () => {
    // hd's round 1: two one-module containers straight under the root, every corner and middle of both labels
    // crossed by the fan of edges — the writer shortened the labels; the compiler now halos them instead.
    const s = attempt("hd");
    const long: Record<string, string> = { measurement: "Measurement & Capture", integration: "Integration", synthesis: "Synthesis & Healing" };
    const tl = compileScene({ ...s, groups: s.groups!.map((g) => ({ ...g, label: long[g.id] ?? g.label })) });
    const r = layoutReport(tl);
    assert.equal(r.totals.crossed, 0, formatLayoutIssues(r));
    assert.equal(tl.nodes.find((n) => n.id === "integration-label")!.halo, true);
    // A label with a clear corner stays plain.
    assert.notEqual(compileScene(EXAMPLES.modules).nodes.find((n) => n.id === "core-label")!.halo, true);
  });

  it("the writers' own final scenes stay clean under the reworked placement", () => {
    for (const letter of ["ha", "hb", "hc", "hd"]) {
      const r = layoutReport(compileScene(attempt(letter)));
      assert.equal(r.totals.framesWithIssues, 0, `${letter}: ${formatLayoutIssues(r)}`);
    }
  });
});

function formatLayoutIssues(r: ReturnType<typeof layoutReport>): string {
  return r.frames.flatMap((f) => f.issues.map((i) => `${i.kind} ${i.texts.join(" / ")} ${i.nodes.join(" × ")}`)).join("\n");
}

describe("wrapText", () => {
  it("breaks at spaces so no line is wider than the limit, never splits a word, and leaves short text alone", () => {
    const fs = 13;
    const text = "Cut events→handlers: events should notify, not call back into handlers";
    const wrapped = wrapText(text, fs, 240);
    for (const line of wrapped.split("\n")) assert.ok(labelWidth(line, fs) <= 240, line);
    assert.equal(wrapped.replace(/\n/g, " "), text);
    assert.equal(wrapText("short", fs, 240), "short");
    // A single word longer than the limit stays one line rather than being cut.
    assert.equal(wrapText("supercalifragilisticexpialidocious", fs, 60), "supercalifragilisticexpialidocious");
  });
});

describe("modules: v16 — a still's own colour vocabulary", () => {
  const fixture = (): ModulesScene => JSON.parse(readFileSync(new URL("../fixtures/modules-ports-adapters.json", import.meta.url), "utf-8")) as ModulesScene;
  const nodeOf = (tl: ReturnType<typeof compileScene>, id: string) => tl.nodes.find((n) => n.id === id)!;

  it("tone on a dependency colours its stroke and label without a sequence (gb)", () => {
    const tl = compileScene(fixture());
    const accent = nodeOf(tl, "edge-3");
    assert.equal(accent.stroke, "#f59e0b");
    assert.equal(nodeOf(tl, "edge-3-label").color, "#f59e0b");
    assert.equal(nodeOf(tl, "edge-0").stroke, "#1f2328", "an untoned dependency keeps the plain stroke");
  });

  it("tone on a module: accent fills it, muted greys its outline and label", () => {
    const tl = compileScene(fixture());
    assert.equal(nodeOf(tl, "domain").fill, "#f59e0b");
    assert.equal(nodeOf(tl, "memory").stroke, "#9ca3af");
    assert.equal(nodeOf(tl, "memory").color, "#9ca3af");
    assert.equal(nodeOf(tl, "postgres").fill, "#ffffff");
  });

  it("implements is dashed with a hollow head, laid out like a real dependency, and rendered with an outlined marker", () => {
    const tl = compileScene(fixture());
    const impl = nodeOf(tl, "edge-5");
    assert.equal(impl.dashed, true);
    assert.equal(impl.head, "hollow");
    assert.ok(moduleLayers(fixture()).get("postgres")! > moduleLayers(fixture()).get("port")!, "the adapter sits above the port it implements");
    const svg = renderFrameSvg(tl, timelineDuration(tl));
    assert.match(svg, /<marker id="arrow-hollow-[a-z0-9]+"[^>]*><path d="M 1 1 L 11 6 L 1 11 z" fill="#ffffff" stroke="#1f2328"/);
    assert.match(svg, /marker-end="url\(#arrow-hollow-/);
  });

  it("relate equals draws a double line with no head (ga: substitutable)", () => {
    const tl = compileScene(fixture());
    const lines = tl.nodes.filter((n) => /^relate-main-\d+(-2)?$/.test(n.id));
    assert.equal(lines.length, 2);
    for (const l of lines) assert.ok(l.shape === "line" || (l.shape === "path" && !l.head), `${l.id} is ${l.shape} with head ${l.head}`);
    const [a, b] = lines;
    assert.ok(Math.hypot(a.pos![0] - b.pos![0], a.pos![1] - b.pos![1]) > 3 && Math.hypot(a.pos![0] - b.pos![0], a.pos![1] - b.pos![1]) < 5, "the twin is 4px along the normal");
  });

  it("the fixture is clean: no layout issue, no crossing, and the validator accepts every new field", () => {
    const s = fixture();
    const diags = validateScene(s);
    assert.deepEqual(diags, [], formatDiagnostics(diags));
    const tl = compileScene(s);
    assert.deepEqual(checkAnimation(tl, s).filter((d) => d.severity === "error"), []);
    assert.equal(layoutReport(tl).totals.framesWithIssues, 0, formatLayoutIssues(layoutReport(tl)));
  });

  it("the validator names a bad tone and a bad style", () => {
    const s = fixture();
    const bad = validateScene({ ...s, modules: [...s.modules, { id: "x", tone: "loud" as never }], deps: [...s.deps!, { from: "x", to: "port", style: "wavy" as never, tone: "red" as never }] });
    const msgs = bad.map((d) => d.path);
    assert.ok(msgs.some((p) => p.endsWith("modules[7].tone")), msgs.join("\n"));
    assert.ok(msgs.some((p) => p.endsWith("deps[8].style")));
    assert.ok(msgs.some((p) => p.endsWith("deps[8].tone")));
  });
});
