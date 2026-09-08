/**
 * Edges around what is in their way, shared by diagram / modules and state-machine (v15). ib's order state
 * machine is the case: with the states in the brief's order, 支払い完了 → 返金済み ran through 出荷準備中 and
 * its label sat on the state; the writer's fix was to reorder the list. The compiler's is to bend.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { placeEdgeLabel, routeAround, segmentInside } from "./compile/route.ts";
import { layoutReport } from "./layout.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import type { StateMachineScene } from "./types.ts";

const SCENARIO = resolve(import.meta.dirname!, "../../../fixtures/anim-scenario");

/** ib's final scene with the states back in the brief's order — the order that collided. */
function ibAsBriefed(): StateMachineScene {
  const s = JSON.parse(readFileSync(resolve(SCENARIO, "attempts/ib/scene.json"), "utf-8")) as StateMachineScene;
  const order = ["accepted", "awaiting_payment", "paid", "preparing", "shipped", "delivered", "cancelled", "refunded"];
  const id = (x: StateMachineScene["states"][number]) => (typeof x === "string" ? x : x.id);
  return { ...s, states: [...s.states].sort((a, b) => order.indexOf(id(a)) - order.indexOf(id(b))) };
}

describe("routeAround", () => {
  const box = (cx: number, cy: number, s = 40) => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s });

  it("is straight when nothing is in the way, and bends around a box on the line", () => {
    assert.deepEqual(routeAround([0, 0], [300, 0], [{ id: "a", box: box(0, 0) }, { id: "c", box: box(300, 0) }], new Set(["a", "c"])), [[0, 0], [300, 0]]);
    const pts = routeAround([0, 0], [300, 0], [{ id: "x", box: box(150, 4) }], new Set());
    assert.equal(pts.length, 3);
    assert.ok(segmentInside([pts[0], pts[1]], box(150, 4)) <= 2 && segmentInside([pts[1], pts[2]], box(150, 4)) <= 2, "neither leg runs through the box");
  });

  it("goes round on the side that is the shorter detour, not only the side the line leans to", () => {
    // A steep line from top-left to a target far right: leaning a little left of the blocker, the shorter way
    // round is still the right — the way the target lies.
    const pts = routeAround([100, 0], [260, 300], [{ id: "x", box: { x: 110, y: 130, w: 80, h: 40 } }], new Set());
    assert.equal(pts.length, 3);
    assert.ok(pts[1][0] > 190, `waypoint at x=${pts[1][0]} should be right of the box`);
  });
});

describe("placeEdgeLabel", () => {
  it("takes the longest leg's middle when free, and a spot off the taken ones otherwise", () => {
    const pts: [number, number][] = [[0, 0], [200, 0]];
    const free = placeEdgeLabel(pts, 60, 16, []);
    assert.deepEqual(free, [100, 13]);
    const taken = placeEdgeLabel(pts, 60, 16, [{ x: 70, y: 5, w: 60, h: 16 }]);
    assert.notDeepEqual(taken, free);
    assert.ok(!(taken[0] > 40 && taken[0] < 160 && taken[1] > 0 && taken[1] < 26), `moved off the taken spot: ${taken}`);
  });
});

describe("state-machine: a transition bends around a state in its way (ib, v15)", () => {
  it("the briefed order is clean without reordering; the through-transition is a path and its label is off every state", () => {
    const scene = ibAsBriefed();
    const tl = compileScene(scene);
    const r = layoutReport(tl);
    assert.equal(r.totals.framesWithIssues, 0, r.frames.flatMap((f) => f.issues.map((i) => `${i.kind} ${i.texts.join(" / ")}`)).join("\n"));
    // paid → refunded is the sixth transition in the brief; it has to go round 出荷準備中.
    const through = scene.transitions.findIndex((t) => t.from === "paid" && t.to === "refunded");
    assert.ok(through >= 0);
    assert.equal(tl.nodes.find((n) => n.id === `tr-${through}`)!.shape, "path");
    // The token still walks it: the trace's キャンセル要求 from paid lands on refunded.
    const end = sampleFrame(tl, timelineDuration(tl));
    const refunded = tl.nodes.find((n) => n.id === "state-refunded")!;
    // The token rests on the top of the state's rim (v18: at the centre it covered a short label).
    assert.deepEqual(end.get("token")!.pos.map(Math.round), [Math.round(refunded.pos![0]), Math.round(refunded.pos![1] - refunded.r!)]);
  });

  it("the writer's reordered scene stays clean too", () => {
    const s = JSON.parse(readFileSync(resolve(SCENARIO, "attempts/ib/scene.json"), "utf-8")) as StateMachineScene;
    assert.equal(layoutReport(compileScene(s)).totals.framesWithIssues, 0);
  });
});
