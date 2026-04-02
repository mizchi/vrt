import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_BIDI_URL } from "./crater-client.ts";
import { parseMigrationCompareArgs } from "./migration-compare.ts";

describe("parseMigrationCompareArgs", () => {
  it("should parse explicit flags into reusable options", () => {
    const options = parseMigrationCompareArgs([
      "--dir", "fixtures/migration/reset-css",
      "--baseline", "normalize.html",
      "--variants", "modern-normalize.html", "destyle.html",
      "--approval", "approval.json",
      "--strict",
      "--no-discover",
      "--max-viewports", "7",
      "--random-samples", "2",
      "--paint-tree-url", "ws://127.0.0.1:9333",
      "--no-paint-tree",
    ]);

    assert.equal(options.dir, "fixtures/migration/reset-css");
    assert.equal(options.baseline, "normalize.html");
    assert.deepEqual(options.variants, ["modern-normalize.html", "destyle.html"]);
    assert.equal(options.approvalPath, "approval.json");
    assert.equal(options.strict, true);
    assert.equal(options.autoDiscover, false);
    assert.equal(options.maxViewports, 7);
    assert.equal(options.randomSamples, 2);
    assert.equal(options.paintTreeUrl, "ws://127.0.0.1:9333");
    assert.equal(options.enablePaintTree, false);
  });

  it("should support positional before/after arguments", () => {
    const options = parseMigrationCompareArgs(["before.html", "after.html"]);

    assert.equal(options.dir, ".");
    assert.equal(options.baseline, "before.html");
    assert.deepEqual(options.variants, ["after.html"]);
    assert.equal(options.approvalPath, "");
    assert.equal(options.strict, false);
    assert.equal(options.autoDiscover, true);
    assert.equal(options.maxViewports, 15);
    assert.equal(options.randomSamples, 1);
    assert.equal(options.paintTreeUrl, DEFAULT_BIDI_URL);
    assert.equal(options.enablePaintTree, true);
  });
});
