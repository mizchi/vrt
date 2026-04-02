import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { discoverViewports } from "./viewport-discovery.ts";

const MIGRATION_DIR = join(import.meta.dirname!, "..", "fixtures", "migration");

describe("migration fixture inventory", () => {
  it("includes the planned phase-1 fixture directories", async () => {
    const entries = await readdir(MIGRATION_DIR, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    assert.deepEqual(directories, [
      "reset-css",
      "shadcn-to-luna",
      "tailwind-to-vanilla",
    ]);
  });
});

describe("tailwind-to-vanilla breakpoint discovery", () => {
  it("covers 768px and 1024px boundaries", async () => {
    const html = await readFile(join(MIGRATION_DIR, "tailwind-to-vanilla", "after.html"), "utf-8");
    const result = discoverViewports(html, { includeStandard: false, randomSamples: 0 });
    const widths = result.viewports.map((viewport) => viewport.width);

    assert.ok(widths.includes(767), "should include 768px boundary below");
    assert.ok(widths.includes(768), "should include 768px boundary at");
    assert.ok(widths.includes(1023), "should include 1024px boundary below");
    assert.ok(widths.includes(1024), "should include 1024px boundary at");
  });
});

describe("shadcn-to-luna fixture", () => {
  it("provides before/after HTML with target styles for migration compare", async () => {
    const beforeHtml = await readFile(join(MIGRATION_DIR, "shadcn-to-luna", "before.html"), "utf-8");
    const afterHtml = await readFile(join(MIGRATION_DIR, "shadcn-to-luna", "after.html"), "utf-8");

    assert.match(beforeHtml, /<style id="target-css">/);
    assert.match(afterHtml, /<style id="target-css">/);
    assert.match(beforeHtml, /Command Center/);
    assert.match(afterHtml, /Command Center/);
    assert.match(beforeHtml, /Review dialog/);
    assert.match(afterHtml, /Review dialog/);
  });
});
