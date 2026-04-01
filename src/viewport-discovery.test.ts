import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractBreakpoints, generateViewports, discoverViewports } from "./viewport-discovery.ts";

describe("extractBreakpoints", () => {
  it("should extract min-width breakpoints", () => {
    const css = `
      @media (min-width: 640px) { .a { display: block; } }
      @media (min-width: 768px) { .b { display: block; } }
      @media (min-width: 1024px) { .c { display: block; } }
    `;
    const bps = extractBreakpoints(css);
    assert.equal(bps.length, 3);
    assert.equal(bps[0].value, 640);
    assert.equal(bps[0].type, "min-width");
    assert.equal(bps[1].value, 768);
    assert.equal(bps[2].value, 1024);
  });

  it("should extract max-width breakpoints", () => {
    const css = `@media (max-width: 768px) { .a { display: none; } }`;
    const bps = extractBreakpoints(css);
    assert.equal(bps.length, 1);
    assert.equal(bps[0].type, "max-width");
    assert.equal(bps[0].value, 768);
  });

  it("should handle rem units", () => {
    const css = `@media (min-width: 48rem) { .a {} }`;
    const bps = extractBreakpoints(css);
    assert.equal(bps[0].value, 768); // 48 * 16
  });

  it("should deduplicate identical breakpoints", () => {
    const css = `
      @media (min-width: 768px) { .a {} }
      @media (min-width: 768px) { .b {} }
    `;
    const bps = extractBreakpoints(css);
    assert.equal(bps.length, 1);
  });

  it("should return empty for no media queries", () => {
    const bps = extractBreakpoints("body { color: red; }");
    assert.equal(bps.length, 0);
  });
});

describe("generateViewports", () => {
  it("should generate boundary viewports for breakpoints", () => {
    const bps = [
      { value: 640, type: "min-width" as const, raw: "(min-width: 640px)" },
      { value: 768, type: "min-width" as const, raw: "(min-width: 768px)" },
    ];
    const vps = generateViewports(bps, { includeStandard: false });
    const widths = vps.map((v) => v.width);
    assert.ok(widths.includes(639), "should include 640-1 = 639");
    assert.ok(widths.includes(640), "should include 640");
    assert.ok(widths.includes(767), "should include 768-1 = 767");
    assert.ok(widths.includes(768), "should include 768");
  });

  it("should generate boundary for max-width", () => {
    const bps = [{ value: 768, type: "max-width" as const, raw: "(max-width: 768px)" }];
    const vps = generateViewports(bps, { includeStandard: false });
    const widths = vps.map((v) => v.width);
    assert.ok(widths.includes(768), "should include 768");
    assert.ok(widths.includes(769), "should include 768+1 = 769");
  });

  it("should include standard viewports by default", () => {
    const vps = generateViewports([]);
    const widths = vps.map((v) => v.width);
    assert.ok(widths.includes(375));
    assert.ok(widths.includes(1280));
    assert.ok(widths.includes(1440));
  });

  it("should add random samples when requested", () => {
    const bps = [
      { value: 640, type: "min-width" as const, raw: "(min-width: 640px)" },
      { value: 1024, type: "min-width" as const, raw: "(min-width: 1024px)" },
    ];
    const vps = generateViewports(bps, { includeStandard: false, randomSamples: 2, seed: 1 });
    assert.ok(vps.length > 4, `expected > 4 viewports, got ${vps.length}`);
    // Random samples should be within ranges
    const samples = vps.filter((v) => v.reason.includes("random"));
    assert.ok(samples.length > 0, "should have random samples");
  });

  it("should respect maxViewports", () => {
    const bps = [
      { value: 480, type: "min-width" as const, raw: "(min-width: 480px)" },
      { value: 640, type: "min-width" as const, raw: "(min-width: 640px)" },
      { value: 768, type: "min-width" as const, raw: "(min-width: 768px)" },
      { value: 1024, type: "min-width" as const, raw: "(min-width: 1024px)" },
    ];
    const vps = generateViewports(bps, { maxViewports: 5 });
    assert.ok(vps.length <= 5);
  });
});

describe("discoverViewports", () => {
  it("should discover from HTML", () => {
    const html = `<html><head><style>
      body { color: red; }
      @media (min-width: 640px) { .a { display: flex; } }
      @media (min-width: 1024px) { .b { display: grid; } }
    </style></head><body></body></html>`;
    const result = discoverViewports(html);
    assert.equal(result.breakpoints.length, 2);
    assert.ok(result.viewports.length >= 5); // standard + boundaries
    const widths = result.viewports.map((v) => v.width);
    assert.ok(widths.includes(639));
    assert.ok(widths.includes(640));
    assert.ok(widths.includes(1023));
    assert.ok(widths.includes(1024));
  });
});
