import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySelectorType,
  isInteractiveSelector,
  classifyUndetectedReason,
  type ViewportDetectionResult,
} from "./detection-classify.ts";

describe("classifySelectorType", () => {
  it("should classify element selectors", () => {
    assert.equal(classifySelectorType("body"), "element");
    assert.equal(classifySelectorType("div"), "element");
  });

  it("should classify class selectors", () => {
    assert.equal(classifySelectorType(".header"), "class");
    assert.equal(classifySelectorType(".file-table"), "class");
  });

  it("should classify pseudo-class selectors", () => {
    assert.equal(classifySelectorType(".tab:hover"), "pseudo-class");
    assert.equal(classifySelectorType("a:focus"), "pseudo-class");
    assert.equal(classifySelectorType(".btn:active"), "pseudo-class");
  });

  it("should classify pseudo-element selectors", () => {
    assert.equal(classifySelectorType("*::before"), "pseudo-element");
    assert.equal(classifySelectorType(".icon::after"), "pseudo-element");
  });

  it("should classify compound selectors", () => {
    assert.equal(classifySelectorType(".file-table .date"), "compound");
    assert.equal(classifySelectorType(".header-nav a"), "compound");
    assert.equal(classifySelectorType("*, *::before, *::after"), "compound");
    assert.equal(classifySelectorType(".action-btn.primary"), "class");
  });
});

describe("isInteractiveSelector", () => {
  it("should detect :hover", () => {
    assert.equal(isInteractiveSelector(".tab:hover"), true);
    assert.equal(isInteractiveSelector(".footer a:hover"), true);
  });

  it("should detect :focus", () => {
    assert.equal(isInteractiveSelector("input:focus"), true);
    assert.equal(isInteractiveSelector(".btn:focus-visible"), true);
    assert.equal(isInteractiveSelector(".wrap:focus-within"), true);
  });

  it("should detect :active", () => {
    assert.equal(isInteractiveSelector(".btn:active"), true);
  });

  it("should not flag non-interactive pseudo-classes", () => {
    assert.equal(isInteractiveSelector(".item:first-child"), false);
    assert.equal(isInteractiveSelector(".item:last-child"), false);
    assert.equal(isInteractiveSelector(".item:nth-child(2)"), false);
  });

  it("should not flag regular selectors", () => {
    assert.equal(isInteractiveSelector(".header"), false);
    assert.equal(isInteractiveSelector(".file-table td"), false);
  });
});

describe("classifyUndetectedReason", () => {
  const noDetection: ViewportDetectionResult[] = [
    { width: 1280, height: 900, visualDiffDetected: false, visualDiffRatio: 0, a11yDiffDetected: false, a11yChangeCount: 0, computedStyleDiffCount: 0, hoverDiffDetected: false, paintTreeDiffCount: 0 },
  ];

  const partialDetection: ViewportDetectionResult[] = [
    { width: 1280, height: 900, visualDiffDetected: false, visualDiffRatio: 0, a11yDiffDetected: false, a11yChangeCount: 0, computedStyleDiffCount: 0, hoverDiffDetected: false, paintTreeDiffCount: 0 },
    { width: 375, height: 812, visualDiffDetected: true, visualDiffRatio: 0.05, a11yDiffDetected: false, a11yChangeCount: 0, computedStyleDiffCount: 0, hoverDiffDetected: false, paintTreeDiffCount: 0 },
  ];

  it("should classify hover-only", () => {
    assert.equal(
      classifyUndetectedReason(".footer a:hover", "text-decoration", "underline", null, noDetection),
      "hover-only",
    );
  });

  it("should classify media-scoped", () => {
    assert.equal(
      classifyUndetectedReason(".main", "flex-direction", "column", "(max-width: 768px)", noDetection),
      "media-scoped",
    );
  });

  it("should classify same-as-default", () => {
    assert.equal(
      classifyUndetectedReason(".item", "text-decoration", "none", null, noDetection),
      "same-as-default",
    );
    assert.equal(
      classifyUndetectedReason(".item", "font-weight", "normal", null, noDetection),
      "same-as-default",
    );
  });

  it("should classify same-as-parent for common bg colors", () => {
    assert.equal(
      classifyUndetectedReason(".readme-header", "background", "#f6f8fa", null, noDetection),
      "same-as-parent",
    );
  });

  it("should classify content-dependent", () => {
    assert.equal(
      classifyUndetectedReason(".date", "white-space", "nowrap", null, noDetection),
      "content-dependent",
    );
    assert.equal(
      classifyUndetectedReason(".lang-list", "flex-wrap", "wrap", null, noDetection),
      "content-dependent",
    );
  });

  it("should classify viewport-dependent when partially detected", () => {
    assert.equal(
      classifyUndetectedReason(".sidebar", "width", "100%", null, partialDetection),
      "viewport-dependent",
    );
  });

  it("should return unknown for unclassifiable cases", () => {
    assert.equal(
      classifyUndetectedReason(".main", "margin", "0 auto", null, noDetection),
      "unknown",
    );
  });
});
