/**
 * v21: what the still readers found in the figures, pinned. Two containers crossing (a full-width row through
 * a column another group spans) is a layout issue and the band layout no longer draws one; a container's
 * label stays in a top corner by growing the box sideways; several edges at one box spread along its side.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { compileScene } from "./compile/index.ts";
import { depEnds } from "./compile/modules.ts";
import { layoutFrame, layoutReport } from "./layout.ts";
import { sampleFrame, timelineDuration } from "./timeline.ts";
import { TIMELINE_FORMAT, type ModulesScene, type Scene, type Timeline } from "./types.ts";

const attempt = <T extends Scene>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "fixtures", "anim-scenario", "attempts", name, "scene.json"), "utf8")) as T;
const fixture = <T extends Scene>(name: string): T => JSON.parse(readFileSync(join(import.meta.dirname, "..", "fixtures", `${name}.json`), "utf8")) as T;

const box = (tl: Timeline, id: string, t: number) => {
  const st = sampleFrame(tl, t).get(id)!;
  const n = tl.nodes.find((x) => x.id === id)!;
  const [w, h] = (st.size as [number, number] | undefined) ?? n.size!;
  const [x, y] = st.pos as [number, number];
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
};

describe("containers that cross", () => {
  const tl = (nodes: Timeline["nodes"]): Timeline => ({ format: TIMELINE_FORMAT, canvas: { width: 400, height: 300 }, nodes, tracks: [], steps: [{ t: 0 }] });

  it("`layout` reports two outlined boxes that cross and neither holds the other; one inside the other is nesting", () => {
    const crossing = layoutFrame(
      tl([
        { id: "col", shape: "rect", pos: [150, 150], size: [80, 240], fill: "none", stroke: "#999", rx: 10 },
        { id: "col-label", shape: "text", pos: [120, 40], text: "Core", anchor: "start" },
        { id: "row", shape: "rect", pos: [200, 160], size: [300, 60], fill: "none", stroke: "#999", rx: 10 },
        { id: "row-label", shape: "text", pos: [60, 140], text: "Adapters", anchor: "start" },
      ]),
      0,
    );
    assert.equal(crossing.length, 1, JSON.stringify(crossing));
    assert.equal(crossing[0].kind, "boxes");
    assert.deepEqual(crossing[0].texts, ["Core", "Adapters"]);
    const nested = layoutFrame(
      tl([
        { id: "outer", shape: "rect", pos: [200, 150], size: [300, 200], fill: "none", stroke: "#999", rx: 10 },
        { id: "inner", shape: "rect", pos: [200, 170], size: [120, 60], fill: "none", stroke: "#999", rx: 10 },
      ]),
      0,
    );
    assert.deepEqual(nested, []);
  });

  it("fe's map (a plain `line` from domain to postgres): 'Adapters' is no longer a row through the 'Core domain' column", () => {
    const s = attempt<ModulesScene>("fe");
    const tl = compileScene(s);
    const end = timelineDuration(tl);
    assert.deepEqual(layoutFrame(tl, end).filter((i) => i.kind === "boxes"), []);
    const core = box(tl, "core", end);
    const adapters = box(tl, "adapters", end);
    const apart = core.x1 <= adapters.x0 || adapters.x1 <= core.x0 || core.y1 <= adapters.y0 || adapters.y1 <= core.y0;
    assert.ok(apart, `core ${JSON.stringify(core)} and adapters ${JSON.stringify(adapters)} do not cross`);
    assert.equal(layoutReport(tl).totals.boxes, 0);
  });
});

describe("a container's label stays in a top corner", () => {
  it("the nested shop: 'core' grows to the left until its top-left corner is clear of the arrows into 'domain model'", () => {
    const s = fixture<ModulesScene>("modules-nested");
    const tl = compileScene(s);
    const end = timelineDuration(tl);
    const core = box(tl, "core", end);
    const label = tl.nodes.find((n) => n.id === "core-label")!;
    assert.ok(Math.abs(label.pos![1] - (core.y0 + 12)) < 1, `label at the top (${label.pos![1]} vs top ${core.y0})`);
    assert.ok(Math.abs(label.pos![0] - (core.x0 + 10)) < 1, "…left corner");
    const domain = box(tl, "domain", end);
    assert.ok(domain.x0 - core.x0 > 14 + 12, `the box grew left of its padding (${domain.x0 - core.x0}px)`);
    assert.equal(layoutReport(tl).totals.framesWithIssues, 0);
  });
});

describe("edges spread along a box side", () => {
  it("fa's root CLI: its dependencies leave along the bottom at distinct points, ordered by where they go", () => {
    const s = attempt<ModulesScene>("fa");
    const tl = compileScene(s);
    const root = s.modules.map((m) => (typeof m === "string" ? m : m.id)).find((id) => /cli|vlmkit/.test(id))!;
    const deps = (s.deps ?? []).map((d, i) => ({ d, i })).filter(({ d }) => depEnds(d)[0] === root);
    assert.ok(deps.length >= 5, `${root} has a fan (${deps.length})`);
    const starts = deps.map(({ i }) => {
      const n = tl.nodes.find((x) => x.id === `edge-${i}`)!;
      return n.points ? n.points[0] : n.pos!;
    });
    // Every tail is its own point on the box's outline, not the one point nearest the far end.
    for (let a = 0; a < starts.length; a++) for (let c = a + 1; c < starts.length; c++) assert.ok(Math.hypot(starts[a][0] - starts[c][0], starts[a][1] - starts[c][1]) >= 6, `distinct tails: ${JSON.stringify(starts)}`);
    const rb = box(tl, root, timelineDuration(tl));
    const onOutline = (p: [number, number]) => (Math.abs(p[1] - rb.y1) < 8 || Math.abs(p[1] - rb.y0) < 8) && p[0] > rb.x0 && p[0] < rb.x1 || (Math.abs(p[0] - rb.x0) < 8 || Math.abs(p[0] - rb.x1) < 8) && p[1] > rb.y0 && p[1] < rb.y1;
    for (const p of starts) assert.ok(onOutline(p), `tail ${JSON.stringify(p)} sits on the box ${JSON.stringify(rb)}`);
    // Along the bottom, the tail further left heads further left: the fan does not cross itself. A bent edge's
    // heading is its first waypoint (its path's first `L`, relative to the start).
    const ends = deps.map(({ i }) => {
      const n = tl.nodes.find((x) => x.id === `edge-${i}`)!;
      if (n.points) return n.points[1];
      const m = n.d!.match(/L\s*(-?[\d.]+)\s+(-?[\d.]+)/)!;
      return [n.pos![0] + Number(m[1]), n.pos![1] + Number(m[2])] as [number, number];
    });
    // The bottom side as the compiler sees it: the end's offset from the centre, scaled by the box, is more down than sideways.
    const cx = (rb.x0 + rb.x1) / 2;
    const cy = (rb.y0 + rb.y1) / 2;
    const isBottom = (p: [number, number]) => (p[1] - cy) / ((rb.y1 - rb.y0) / 2) > Math.abs(p[0] - cx) / ((rb.x1 - rb.x0) / 2);
    const bottom = starts.map((p, k) => ({ x: p[0], to: ends[k][0], bottom: isBottom(p) })).filter((e) => e.bottom).sort((a, b) => a.x - b.x);
    assert.ok(bottom.length >= 2, "at least two leave the bottom");
    for (let k = 1; k < bottom.length; k++) assert.ok(bottom[k].to >= bottom[k - 1].to - 40, `ordered by destination: ${JSON.stringify(bottom)}`);
  });
});
