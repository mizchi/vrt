import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomPropertyUsageIndex,
  collectComputedStyleTrackingProperties,
  extractCustomPropertyReferences,
  filterComputedStyleDiffsByTargets,
} from "./css-custom-properties.ts";
import type { CssDeclaration } from "./css-challenge-core.ts";
import type { ComputedStyleDiff } from "./css-challenge-core.ts";

function decl(
  index: number,
  selector: string,
  property: string,
  value: string,
): CssDeclaration {
  return {
    index,
    text: `${selector} { ${property}: ${value}; }`,
    selector,
    property,
    value,
    mediaCondition: null,
  };
}

describe("extractCustomPropertyReferences", () => {
  it("should extract direct and fallback var() references", () => {
    assert.deepEqual(
      extractCustomPropertyReferences("linear-gradient(var(--accent), var(--bg, white))"),
      ["--accent", "--bg"],
    );
  });
});

describe("collectComputedStyleTrackingProperties", () => {
  it("should include concrete properties that consume custom properties", () => {
    const declarations = [
      decl(0, ":root", "--accent", "#09f"),
      decl(1, ".button", "color", "var(--accent)"),
      decl(2, ".button", "border-color", "var(--accent, red)"),
      decl(3, ".card", "--card-fg", "var(--accent)"),
    ];

    assert.deepEqual(
      collectComputedStyleTrackingProperties(declarations),
      ["border-color", "color"],
    );
  });
});

describe("buildCustomPropertyUsageIndex", () => {
  it("should resolve direct custom property consumers", () => {
    const declarations = [
      decl(0, ":root", "--accent", "#09f"),
      decl(1, ".button", "color", "var(--accent)"),
      decl(2, ".button", "background-color", "var(--accent, red)"),
    ];

    const index = buildCustomPropertyUsageIndex(declarations);

    assert.deepEqual(index.findImpactedTargets("--accent"), [
      { selector: ".button", property: "background-color", viaCustomProperties: ["--accent"] },
      { selector: ".button", property: "color", viaCustomProperties: ["--accent"] },
    ]);
  });

  it("should resolve transitive custom property consumers", () => {
    const declarations = [
      decl(0, ":root", "--accent", "#09f"),
      decl(1, ".button", "--button-fg", "var(--accent)"),
      decl(2, ".button", "color", "var(--button-fg)"),
      decl(3, ".button", "border-color", "var(--accent)"),
    ];

    const index = buildCustomPropertyUsageIndex(declarations);

    assert.deepEqual(index.findImpactedTargets("--accent"), [
      { selector: ".button", property: "border-color", viaCustomProperties: ["--accent"] },
      { selector: ".button", property: "color", viaCustomProperties: ["--accent", "--button-fg"] },
    ]);
  });

  it("should return empty targets for unknown custom properties", () => {
    const index = buildCustomPropertyUsageIndex([
      decl(0, ".button", "color", "var(--accent)"),
    ]);

    assert.deepEqual(index.findImpactedTargets("--missing"), []);
  });
});

describe("filterComputedStyleDiffsByTargets", () => {
  it("should match hover targets against normalized computed style selectors", () => {
    const diffs: ComputedStyleDiff[] = [
      { selector: ".btn-primary", property: "background", before: "rgb(0, 0, 255)", after: "rgb(1, 1, 255)" },
      { selector: ".btn-secondary", property: "background", before: "rgb(0, 0, 0)", after: "rgb(1, 1, 1)" },
    ];

    const filtered = filterComputedStyleDiffsByTargets(diffs, [
      { selector: ".btn-primary:hover", property: "background" },
    ]);

    assert.deepEqual(filtered, [diffs[0]]);
  });

  it("should match focus targets against semantic snapshot keys", () => {
    const diffs: ComputedStyleDiff[] = [
      {
        selector: ".search-box>input[1]",
        property: "border-color",
        before: "rgb(203, 213, 225)",
        after: "rgb(59, 130, 246)",
      },
    ];

    const filtered = filterComputedStyleDiffsByTargets(diffs, [
      { selector: ".search-box input:focus", property: "border-color" },
    ]);

    assert.deepEqual(filtered, diffs);
  });
});
