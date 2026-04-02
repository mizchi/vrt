import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaintTreeChange } from "./crater-client.ts";
import {
  buildMigrationViewportFixCandidatesFromHtml,
  summarizeMigrationFixCandidates,
} from "./migration-fix-candidates.ts";

describe("buildMigrationViewportFixCandidatesFromHtml", () => {
  it("prioritizes spacing declarations for spacing-like migration diffs", () => {
    const html = `<!doctype html><style id="target-css">
.card { color: #111827; }
.card { padding: 16px; }
.card { margin-bottom: 24px; }
</style>`;

    const candidates = buildMigrationViewportFixCandidatesFromHtml(html, {
      viewportWidth: 375,
      dominantCategory: "spacing",
      categorySummary: "1 spacing",
      paintTreeChanges: [],
    });

    assert.equal(candidates[0].selector, ".card");
    assert.ok(["padding", "margin-bottom"].includes(candidates[0].property));
    assert.match(candidates[0].reasoning, /spacing/i);
  });

  it("prioritizes visual declarations that match paint tree properties", () => {
    const html = `<!doctype html><style id="target-css">
.badge { background-color: #dcfce7; }
.badge { border-radius: 9999px; }
.badge { color: #166534; }
</style>`;
    const paintTreeChanges: PaintTreeChange[] = [
      { path: "root > div[0]", type: "paint", property: "background", before: "[0,0,0,255]", after: "[1,1,1,255]" },
    ];

    const candidates = buildMigrationViewportFixCandidatesFromHtml(html, {
      viewportWidth: 768,
      dominantCategory: "color-change",
      categorySummary: "1 color-change",
      paintTreeChanges,
    });

    assert.equal(candidates[0].property, "background-color");
    assert.match(candidates[0].reasoning, /paint tree/i);
  });

  it("prefers media rules active at the current viewport", () => {
    const html = `<!doctype html><style id="target-css">
.grid { gap: 16px; }
@media (min-width: 640px) {
  .grid { gap: 24px; }
}
@media (min-width: 1024px) {
  .grid { gap: 32px; }
}
</style>`;

    const mobileCandidates = buildMigrationViewportFixCandidatesFromHtml(html, {
      viewportWidth: 375,
      dominantCategory: "spacing",
      categorySummary: "1 spacing",
      paintTreeChanges: [],
    });
    const desktopCandidates = buildMigrationViewportFixCandidatesFromHtml(html, {
      viewportWidth: 1200,
      dominantCategory: "spacing",
      categorySummary: "1 spacing",
      paintTreeChanges: [],
    });

    assert.equal(mobileCandidates[0].value, "16px");
    assert.equal(desktopCandidates[0].value, "32px");
  });
});

describe("summarizeMigrationFixCandidates", () => {
  it("aggregates repeated candidates across viewports", () => {
    const summary = summarizeMigrationFixCandidates([
      [
        { selector: ".grid", property: "gap", value: "16px", category: "spacing", mediaCondition: null, score: 6, reasoning: "spacing mismatch" },
        { selector: ".badge", property: "background-color", value: "#dcfce7", category: "visual", mediaCondition: null, score: 4, reasoning: "paint tree background" },
      ],
      [
        { selector: ".grid", property: "gap", value: "16px", category: "spacing", mediaCondition: null, score: 7, reasoning: "spacing mismatch" },
      ],
    ]);

    assert.equal(summary[0].selector, ".grid");
    assert.equal(summary[0].property, "gap");
    assert.equal(summary[0].occurrences, 2);
    assert.equal(summary[0].score, 7);
  });
});
