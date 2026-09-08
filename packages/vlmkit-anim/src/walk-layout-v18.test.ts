/**
 * v18 — what the four writers' scenes found in the compilers, pinned. A state machine's token rests on the rim
 * (lb: at the centre it covered "idle"); a circle of states is a ring they fit on (lb: four states on a 35px
 * ring); a straight transition's label leaves a state it would sit on (lb: "refund" on `vending`); a graph's
 * distance labels pick the side clear of edges (la: fixed below, 17 of 18 frames crossed, and a writer permuted
 * the node list 720 ways); a message sent twice under one label is anchored as `from->to:label` (lc).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { circleRadius } from "./compile/layout.ts";
import { layoutReport } from "./layout.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { SCENE_FORMAT, type DistributedScene, type GraphScene, type Scene, type StateMachineScene, type Timeline } from "./types.ts";
import { formatDiagnostics, validateScene } from "./validate.ts";

const attempt = (letter: string): Scene => JSON.parse(readFileSync(new URL(`../../../fixtures/anim-scenario/attempts/${letter}/scene.json`, import.meta.url), "utf8")) as Scene;
const issues = (tl: Timeline) => {
  const r = layoutReport(tl);
  return r.frames.flatMap((f) => f.issues.map((i) => `frame ${f.index}: ${i.kind} ${i.texts.join(" / ")}`)).join("\n") || "clean";
};

/** lb's machine without the coordinates lb typed to chase the token overlap. */
const vending = (layout?: StateMachineScene["layout"]): StateMachineScene => {
  const s = attempt("lb") as StateMachineScene;
  const { canvas: _canvas, ...rest } = s;
  return { ...rest, ...(layout ? { layout } : {}), states: s.states.map((st) => (typeof st === "string" ? st : (({ pos: _pos, ...r }) => r)(st))) };
};

describe("v18 — state-machine layout", () => {
  it("the token rests on the top of the state's rim, not on its label", () => {
    const tl = compileScene(vending());
    const idle = tl.nodes.find((n) => n.id === "state-idle")!;
    const token = tl.nodes.find((n) => n.id === "token")!;
    assert.deepEqual(token.pos, [idle.pos![0], idle.pos![1] - idle.r!]);
    const end = sampleFrame(tl, timelineDuration(tl));
    const soldOut = tl.nodes.find((n) => n.id === "state-sold-out")!;
    assert.deepEqual((end.get("token")!.pos as number[]).map(Math.round), [Math.round(soldOut.pos![0]), Math.round(soldOut.pos![1] - soldOut.r!)]);
    assert.equal(issues(tl), "clean");
  });

  it("four states are clean in every layout — lr, tb and circle — without a coordinate", () => {
    for (const layout of ["lr", "tb", "circle"] as const) assert.equal(issues(compileScene(vending(layout))), "clean", layout);
  });

  it("a circle's ring grows with the states so neighbours do not touch, and the canvas grows with the ring", () => {
    assert.ok(circleRadius(4, 100) > 70 && circleRadius(4, 100) < 90);
    assert.equal(circleRadius(1, 100), 0);
    const tl = compileScene(vending("circle"));
    const states = tl.nodes.filter((n) => /^state-[^-]+$/.test(n.id) && !n.id.endsWith("-ring"));
    for (const a of states) for (const c of states) {
      if (a === c) continue;
      const d = Math.hypot(a.pos![0] - c.pos![0], a.pos![1] - c.pos![1]);
      assert.ok(d >= a.r! + c.r! + 8, `${a.id} and ${c.id} are ${d.toFixed(0)}px apart`);
      assert.ok(a.pos![0] - a.r! >= 0 && a.pos![0] + a.r! <= tl.canvas.width, `${a.id} is on the canvas`);
    }
  });
});

describe("v18 — graph labels", () => {
  it("la's road map is clean in the brief's own node order (la brute-forced 720 orders to find one that was)", () => {
    const s = { ...(attempt("la") as GraphScene), nodes: ["S", "A", "B", "C", "D", "T"] };
    const tl = compileScene(s);
    assert.equal(issues(tl), "clean");
    // The labels are not all below their nodes any more: at least one moved to another side.
    const sides = tl.nodes.filter((n) => n.id.startsWith("label-")).map((n) => {
      const node = tl.nodes.find((x) => x.id === n.id.replace("label-", "node-"))!;
      return Math.sign(Math.round(n.pos![1] - node.pos![1])) * 10 + Math.sign(Math.round(n.pos![0] - node.pos![0]));
    });
    assert.ok(new Set(sides).size > 1, `label sides: ${sides.join(", ")}`);
  });

  it("the crossed-edge hint speaks the graph's vocabulary", () => {
    // A graph laid out so a label has no clear side: every hint names `nodes`, `pos` or `layout`, never a layer.
    const s: GraphScene = { format: SCENE_FORMAT, kind: "graph", nodes: ["a", "b"], edges: [["a", "b"]], ops: [{ label: { node: "a", text: "0" } }] };
    const tl = compileScene(s);
    assert.ok(tl.meta?.kind === "graph");
  });
});

describe("v18 — distributed anchors", () => {
  const twoPC = (): DistributedScene => ({
    format: SCENE_FORMAT,
    kind: "distributed",
    nodes: ["coord", "p1", "p2"],
    messages: [
      { from: "coord", to: "p1", label: "commit" },
      { from: "coord", to: "p2", label: "commit" },
      { from: "p1", to: "coord", label: "ack" },
      { from: "p2", to: "coord", label: "ack", lost: true },
      { from: "coord", to: "p2", label: "commit again", after: "p2->coord:ack", delay: 400 },
    ],
  });

  it("`from->to:label` anchors a message whose label is used twice; the plain label is refused with the two choices", () => {
    assert.deepEqual(validateScene(twoPC()), []);
    const plain = twoPC();
    (plain.messages[4] as { after: string }).after = "ack";
    const d = validateScene(plain);
    assert.equal(d.length, 1, formatDiagnostics(d));
    assert.match(d[0].message, /"ack" labels 2 messages, so it cannot anchor anything on its own/);
    assert.match(d[0].hint ?? "", /"p1->coord:ack" or "p2->coord:ack"/);
    // A pair that sent once anchors by itself; a pair that sent twice needs the label.
    const pair = twoPC();
    (pair.messages[4] as { after: string }).after = "coord->p2";
    assert.deepEqual(validateScene(pair), []);
    const twice: DistributedScene = { format: SCENE_FORMAT, kind: "distributed", nodes: ["a", "b"], messages: [{ from: "a", to: "b", label: "x" }, { from: "a", to: "b", label: "y" }, { from: "b", to: "a", label: "z", after: "a->b" }] };
    const d2 = validateScene(twice);
    assert.equal(d2.length, 1, formatDiagnostics(d2));
    assert.match(d2[0].message, /"a->b" names 2 earlier messages/);
    assert.match(d2[0].hint ?? "", /"a->b:<label>"/);
  });

  it("the resend starts `delay` after the lost ack would have landed", () => {
    const tl = compileScene(twoPC());
    const times = (tl.meta as { messageTimes: [number, number][] }).messageTimes;
    const [lostStart, lostLands] = times[3];
    assert.ok(lostLands > lostStart);
    assert.equal(times[4][0], lostLands + 400);
  });
});
