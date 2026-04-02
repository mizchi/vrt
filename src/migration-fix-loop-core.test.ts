import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MigrationFixCandidate } from "./migration-fix-candidates.ts";
import {
  applyMigrationFixToHtml,
  buildMigrationFixLoopPrompt,
  parseMigrationFixResponse,
  resolveMigrationFixFromBaselineHtml,
  selectMigrationFixTarget,
  shouldIgnoreMigrationRerunError,
  type MigrationCompareReport,
} from "./migration-fix-loop-core.ts";

function createCandidate(
  overrides: Partial<MigrationFixCandidate> = {},
): MigrationFixCandidate {
  return {
    selector: ".card",
    property: "padding",
    value: "12px",
    category: "spacing",
    mediaCondition: null,
    score: 6,
    reasoning: "spacing mismatch",
    ...overrides,
  };
}

function createReport(): MigrationCompareReport {
  return {
    dir: "fixtures/migration/example",
    baseline: "before.html",
    variants: ["after.html"],
    viewports: [
      { width: 375, height: 812, label: "mobile", reason: "standard" },
      { width: 1280, height: 900, label: "desktop", reason: "standard" },
    ],
    results: [
      {
        variant: "after",
        viewport: "mobile",
        diffRatio: 0.01,
        diffPixels: 120,
        dominantCategory: "spacing",
        categorySummary: "3 spacing",
        paintTreeSummary: "1 geometry",
        paintTreeChangeCount: 1,
        fixCandidates: [createCandidate()],
      },
      {
        variant: "after",
        viewport: "desktop",
        diffRatio: 0.025,
        diffPixels: 420,
        dominantCategory: "layout-shift",
        categorySummary: "2 layout-shift, 1 spacing",
        paintTreeSummary: "2 geometry",
        paintTreeChangeCount: 2,
        fixCandidates: [
          createCandidate({
            selector: ".panel",
            property: "gap",
            category: "layout",
            score: 11,
            reasoning: "layout-shift mismatch; paint tree geometry bounds",
          }),
        ],
      },
    ],
  };
}

describe("selectMigrationFixTarget", () => {
  it("should choose the highest-impact non-zero result", () => {
    const target = selectMigrationFixTarget(createReport());

    assert.ok(target);
    assert.equal(target.variant, "after");
    assert.equal(target.variantFile, "after.html");
    assert.equal(target.viewport, "desktop");
    assert.equal(target.viewportWidth, 1280);
    assert.equal(target.diffPixels, 420);
    assert.equal(target.fixCandidates[0]?.selector, ".panel");
  });
});

describe("buildMigrationFixLoopPrompt", () => {
  it("should include target summary and exact response format", () => {
    const target = selectMigrationFixTarget(createReport());
    assert.ok(target);

    const prompt = buildMigrationFixLoopPrompt({
      baselineFile: "before.html",
      variantFile: "after.html",
      target,
      currentCss: ".panel { display: grid; gap: 24px; }",
    });

    assert.match(prompt, /Viewport[\s\S]*desktop \(1280px\)/);
    assert.match(prompt, /2 layout-shift, 1 spacing/);
    assert.match(prompt, /\.panel \{ display: grid; gap: 24px; \}/);
    assert.match(prompt, /SELECTOR: <css selector>/);
    assert.match(prompt, /MEDIA: <media condition or none>/);
  });
});

describe("parseMigrationFixResponse", () => {
  it("should parse selector, property, value, and media", () => {
    const fix = parseMigrationFixResponse(`SELECTOR: .panel
PROPERTY: gap
VALUE: 20px
MEDIA: (min-width: 768px)`);

    assert.deepEqual(fix, {
      selector: ".panel",
      property: "gap",
      value: "20px",
      mediaCondition: "(min-width: 768px)",
    });
  });

  it("should treat MEDIA: none as top-level", () => {
    const fix = parseMigrationFixResponse(`SELECTOR: .panel
PROPERTY: gap
VALUE: 20px
MEDIA: none`);

    assert.deepEqual(fix, {
      selector: ".panel",
      property: "gap",
      value: "20px",
      mediaCondition: null,
    });
  });
});

describe("resolveMigrationFixFromBaselineHtml", () => {
  it("should reuse baseline declaration when selector/property match", () => {
    const baselineHtml = `<!doctype html><style id="target-css">
.panel { gap: 20px; }
@media (min-width: 768px) {
  .panel { gap: 28px; }
}
</style>`;

    const fix = resolveMigrationFixFromBaselineHtml(
      baselineHtml,
      createCandidate({
        selector: ".panel",
        property: "gap",
        mediaCondition: "(min-width: 768px)",
      }),
    );

    assert.deepEqual(fix, {
      selector: ".panel",
      property: "gap",
      value: "28px",
      mediaCondition: "(min-width: 768px)",
    });
  });
});

describe("applyMigrationFixToHtml", () => {
  it("should replace an existing top-level declaration", () => {
    const html = `<!doctype html><style id="target-css">
.panel { display: grid; gap: 24px; }
</style>`;

    const nextHtml = applyMigrationFixToHtml(html, {
      selector: ".panel",
      property: "gap",
      value: "20px",
      mediaCondition: null,
    });

    assert.match(nextHtml, /\.panel \{ display: grid; gap: 20px; \}/);
  });

  it("should append a declaration inside the matching media block", () => {
    const html = `<!doctype html><style id="target-css">
.panel { display: grid; gap: 24px; }
@media (min-width: 768px) {
  .panel { gap: 28px; }
}
</style>`;

    const nextHtml = applyMigrationFixToHtml(html, {
      selector: ".panel",
      property: "padding",
      value: "32px",
      mediaCondition: "(min-width: 768px)",
    });

    assert.match(nextHtml, /@media \(min-width: 768px\) \{\n  \.panel \{ gap: 28px; padding: 32px; \}\n\}/);
  });
});

describe("shouldIgnoreMigrationRerunError", () => {
  it("should ignore known Playwright sandbox launch failures", () => {
    assert.equal(
      shouldIgnoreMigrationRerunError(new Error("browserType.launch: ... Operation not permitted ... MachPortRendezvousServer")),
      true,
    );
  });

  it("should preserve unrelated rerun errors", () => {
    assert.equal(
      shouldIgnoreMigrationRerunError(new Error("migration compare failed: diff output missing")),
      false,
    );
  });
});
