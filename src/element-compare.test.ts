import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runElementCompare, type ElementCompareOptions } from "./element-compare.ts";

const FIXTURE_DIR = resolve(import.meta.dirname!, "../fixtures/element-compare");

describe("element-compare", () => {
  it("isolates header change from cascading shift", async () => {
    const options: ElementCompareOptions = {
      selectors: ["header", "main", "footer"],
      baselineFile: resolve(FIXTURE_DIR, "before.html"),
      currentFile: resolve(FIXTURE_DIR, "after.html"),
      viewport: { width: 1280, height: 900 },
      outputDir: resolve(process.cwd(), "test-results", "element-compare-test"),
      threshold: 0.1,
    };

    const report = await runElementCompare(options);

    // All 3 elements should be found
    assert.equal(report.summary.total, 3);
    assert.equal(report.summary.matched, 3);
    assert.equal(report.summary.missing, 0);

    const header = report.elements.find((e) => e.selector === "header")!;
    const main = report.elements.find((e) => e.selector === "main")!;
    const footer = report.elements.find((e) => e.selector === "footer")!;

    // Header should have a diff (padding + subtitle added)
    assert.ok(header.diffRatio > 0, `header should have diff, got ${header.diffRatio}`);

    // Main and footer should have zero or near-zero diff
    // (they are identical content, just shifted in full-page view)
    assert.ok(main.diffRatio < 0.01, `main should have < 1% diff, got ${(main.diffRatio * 100).toFixed(2)}%`);
    assert.ok(footer.diffRatio < 0.01, `footer should have < 1% diff, got ${(footer.diffRatio * 100).toFixed(2)}%`);

    // Full-page diff should be significant (cascade shift inflates it)
    assert.ok(
      report.summary.fullPageDiffRatio! > 0.1,
      `full-page diff should be significant due to cascade, got ${report.summary.fullPageDiffRatio}`,
    );

    // The key value: element-level correctly isolates the change to header only.
    // main and footer are clean despite being shifted in the full-page view.
    assert.equal(report.summary.changed, 1, "only header should be marked as changed");
  });

  it("reports missing elements", async () => {
    const options: ElementCompareOptions = {
      selectors: ["header", ".nonexistent"],
      baselineFile: resolve(FIXTURE_DIR, "before.html"),
      currentFile: resolve(FIXTURE_DIR, "after.html"),
      viewport: { width: 1280, height: 900 },
      outputDir: resolve(process.cwd(), "test-results", "element-compare-missing"),
      threshold: 0.1,
    };

    const report = await runElementCompare(options);

    assert.equal(report.summary.total, 2);
    assert.equal(report.summary.matched, 1);
    assert.equal(report.summary.missing, 1);

    const nonexistent = report.elements.find((e) => e.selector === ".nonexistent")!;
    assert.equal(nonexistent.found.baseline, false);
    assert.equal(nonexistent.found.current, false);
  });
});
