import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCssBenchApprovalSuggestionsPath,
  listCssChallengeFixtureNames,
  normalizeCssChallengeFixtureSelection,
} from "./css-challenge-fixtures.ts";

describe("listCssChallengeFixtureNames", () => {
  it("discovers existing and newly added css challenge fixtures", async () => {
    const fixtures = await listCssChallengeFixtureNames();

    assert.deepEqual(fixtures, [
      "admin-panel",
      "blog-magazine",
      "dashboard",
      "ecommerce-catalog",
      "form-app",
      "grid-complex",
      "landing-product",
      "page",
      "stacking-context",
    ]);
  });
});

describe("normalizeCssChallengeFixtureSelection", () => {
  const available = [
    "admin-panel",
    "blog-magazine",
    "dashboard",
    "ecommerce-catalog",
    "form-app",
    "landing-product",
    "page",
  ];

  it("expands all to the full fixture set", () => {
    assert.deepEqual(
      normalizeCssChallengeFixtureSelection(["all"], available),
      available,
    );
  });

  it("deduplicates explicit fixtures while preserving order", () => {
    assert.deepEqual(
      normalizeCssChallengeFixtureSelection(["dashboard", "page", "dashboard"], available),
      ["dashboard", "page"],
    );
  });

  it("falls back to page when no fixture is provided", () => {
    assert.deepEqual(
      normalizeCssChallengeFixtureSelection([], available),
      ["page"],
    );
  });

  it("rejects unknown fixture names with the available set", () => {
    assert.throws(
      () => normalizeCssChallengeFixtureSelection(["unknown"], available),
      /Unknown css-challenge fixture: unknown\. Available: admin-panel, blog-magazine, dashboard, ecommerce-catalog, form-app, landing-product, page/,
    );
  });
});

describe("getCssBenchApprovalSuggestionsPath", () => {
  it("stores fixture suggestions under the fixture-specific bench directory", () => {
    assert.match(
      getCssBenchApprovalSuggestionsPath("page"),
      /test-results\/css-bench\/page\/approval-suggestions\.json$/,
    );
  });
});
