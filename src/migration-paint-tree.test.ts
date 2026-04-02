import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaintNode } from "./crater-client.ts";
import {
  captureMigrationPaintTreeDiff,
  summarizeMigrationPaintTreeChanges,
} from "./migration-paint-tree.ts";

describe("captureMigrationPaintTreeDiff", () => {
  it("captures baseline/current paint trees and diffs them at a viewport", async () => {
    const calls: string[] = [];
    const trees: PaintNode[] = [
      { x: 0, y: 0, w: 100, h: 40, ch: [{ x: 0, y: 0, w: 100, h: 40, tag: "div", p: { bg: [255, 255, 255, 255] } }] },
      { x: 0, y: 0, w: 100, h: 40, ch: [{ x: 0, y: 4, w: 100, h: 40, tag: "div", p: { bg: [255, 255, 255, 255] } }] },
    ];
    const runtime = {
      async setViewport(width: number, height: number) {
        calls.push(`viewport:${width}x${height}`);
      },
      async setContent(html: string) {
        calls.push(`content:${html}`);
      },
      async capturePaintTree() {
        calls.push("capture");
        return trees.shift()!;
      },
    };

    const changes = await captureMigrationPaintTreeDiff(
      runtime,
      { width: 640, height: 480 },
      "<div>before</div>",
      "<div>after</div>",
    );

    assert.deepEqual(calls, [
      "viewport:640x480",
      "content:<div>before</div>",
      "capture",
      "viewport:640x480",
      "content:<div>after</div>",
      "capture",
    ]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, "geometry");
    assert.equal(changes[0].property, "bounds");
  });
});

describe("summarizeMigrationPaintTreeChanges", () => {
  it("aggregates change counts by paint tree change type", () => {
    const summary = summarizeMigrationPaintTreeChanges([
      { path: "root > div[0]", type: "geometry", property: "bounds", before: "0,0 10x10", after: "0,4 10x10" },
      { path: "root > div[1]", type: "paint", property: "background", before: "[255,255,255,255]", after: "[0,0,0,255]" },
      { path: "root > div[2]", type: "paint", property: "color", before: "[0,0,0,255]", after: "[255,255,255,255]" },
      { path: "root > div[3]", type: "text", before: "A", after: "B" },
    ]);

    assert.equal(summary.counts.geometry, 1);
    assert.equal(summary.counts.paint, 2);
    assert.equal(summary.counts.text, 1);
    assert.equal(summary.totalChanges, 4);
    assert.match(summary.summary, /1 geometry/);
    assert.match(summary.summary, /2 paint/);
    assert.match(summary.summary, /1 text/);
  });
});
