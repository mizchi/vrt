/// <reference lib="dom" />
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  buildInteractionTargetPlans,
  buildComputedStyleCaptureJsonExpression,
  buildComputedStyleCaptureExpression,
  captureComputedStyleSnapshotForTargetSelectorsInDom,
  captureEmulatedInteractionStyleSnapshotInDom,
  captureComputedStyleSnapshotInDom,
  computedStyleSnapshotToMap,
  hasMeaningfulComputedStyleSnapshot,
  mergeComputedStyleSnapshots,
  parseComputedStyleSnapshot,
  selectInteractionFallbackPlans,
} from "./computed-style-capture.ts";

type FakeElement = {
  id?: string;
  classList?: string[];
  className?: string;
  tagName: string;
  parentElement?: FakeElement | null;
};

type FakeStyleMap = Record<string, string>;

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalGetComputedStyle = globalThis.getComputedStyle;
const originalCssStyleRule = globalThis.CSSStyleRule;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

afterEach(() => {
  if (originalDocument === undefined) {
    delete (globalThis as Record<string, unknown>).document;
  } else {
    (globalThis as Record<string, unknown>).document = originalDocument;
  }

  if (originalWindow === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    (globalThis as Record<string, unknown>).window = originalWindow;
  }

  if (originalGetComputedStyle === undefined) {
    delete (globalThis as Record<string, unknown>).getComputedStyle;
  } else {
    (globalThis as Record<string, unknown>).getComputedStyle = originalGetComputedStyle;
  }

  if (originalCssStyleRule === undefined) {
    delete (globalThis as Record<string, unknown>).CSSStyleRule;
  } else {
    (globalThis as Record<string, unknown>).CSSStyleRule = originalCssStyleRule;
  }

  if (originalRequestAnimationFrame === undefined) {
    delete (globalThis as Record<string, unknown>).requestAnimationFrame;
  } else {
    (globalThis as Record<string, unknown>).requestAnimationFrame = originalRequestAnimationFrame;
  }
});

function installFakeDom(
  elements: FakeElement[],
  styles: Map<string, FakeStyleMap>,
  pseudoStyles: Map<string, FakeStyleMap> = new Map(),
  onQuery?: (selector: string) => void,
) {
  (globalThis as Record<string, unknown>).document = {
    querySelectorAll: (selector: string) => {
      onQuery?.(selector);
      return elements;
    },
  };
  (globalThis as Record<string, unknown>).window = {
    getComputedStyle: (element: FakeElement, pseudo?: string) => ({
      getPropertyValue: (prop: string) => {
        const key = pseudo ? `${styleKey(element)}${pseudo}` : styleKey(element);
        const source = pseudo ? pseudoStyles.get(key) : styles.get(key);
        return source?.[prop] ?? "";
      },
    }),
  };
  (globalThis as Record<string, unknown>).getComputedStyle =
    ((globalThis as Record<string, unknown>).window as { getComputedStyle: unknown }).getComputedStyle;
}

function styleKey(element: FakeElement): string {
  if (element.id) return `#${element.id}`;
  const classNames = element.classList ?? element.className?.split(/\s+/).filter(Boolean) ?? [];
  if (classNames.length > 0) return `.${classNames.join(".")}`;
  const tag = element.tagName.toLowerCase();
  const parentClass = element.parentElement?.classList?.[0]
    ?? element.parentElement?.className?.split(/\s+/).filter(Boolean)[0];
  return parentClass ? `.${parentClass}>${tag}` : tag;
}

describe("captureComputedStyleSnapshotInDom", () => {
  it("collects class/id elements and pseudo elements", () => {
    const hero: FakeElement = { id: "hero", classList: [], tagName: "DIV", parentElement: null };
    const badge: FakeElement = { classList: ["badge"], tagName: "SPAN", parentElement: hero };

    installFakeDom(
      [hero, badge],
      new Map([
        ["#hero", { color: "rgb(255, 0, 0)" }],
        [".badge", { color: "rgb(0, 0, 255)" }],
      ]),
      new Map<string, FakeStyleMap>([
        ["#hero::before", { content: '"prefix"', color: "rgb(0, 128, 0)" }],
        ["#hero::after", { content: "none" }],
      ]),
    );

    const snapshot = captureComputedStyleSnapshotInDom(["color"]);

    assert.deepEqual(snapshot, {
      "#hero": { color: "rgb(255, 0, 0)" },
      "#hero::before": { color: "rgb(0, 128, 0)" },
      ".badge": { color: "rgb(0, 0, 255)" },
    });
  });

  it("builds stable keys for semantic tags without class names", () => {
    const wrapper: FakeElement = { classList: ["wrapper"], tagName: "DIV", parentElement: null };
    const button1: FakeElement = { classList: [], tagName: "BUTTON", parentElement: wrapper };
    const button2: FakeElement = { classList: [], tagName: "BUTTON", parentElement: wrapper };

    installFakeDom(
      [button1, button2],
      new Map([
        [".wrapper>button", { display: "inline-block" }],
      ]),
    );

    const snapshot = captureComputedStyleSnapshotInDom(["display"]);

    assert.deepEqual(snapshot, {
      ".wrapper>button[1]": { display: "inline-block" },
      ".wrapper>button[2]": { display: "inline-block" },
    });
  });

  it("falls back to className when classList is unavailable", () => {
    const card: FakeElement = {
      className: "readme-header",
      tagName: "DIV",
      parentElement: null,
    };

    installFakeDom(
      [card],
      new Map([
        [".readme-header", { display: "flex" }],
      ]),
    );

    const snapshot = captureComputedStyleSnapshotInDom(["display"]);

    assert.deepEqual(snapshot, {
      ".readme-header": { display: "flex" },
    });
  });

  it("works when getComputedStyle is exposed only on the global object", () => {
    const card: FakeElement = {
      className: "readme-header",
      tagName: "DIV",
      parentElement: null,
    };

    installFakeDom(
      [card],
      new Map([
        [".readme-header", { display: "flex" }],
      ]),
    );
    (globalThis as Record<string, unknown>).window = {};

    const snapshot = captureComputedStyleSnapshotInDom(["display"]);

    assert.deepEqual(snapshot, {
      ".readme-header": { display: "flex" },
    });
  });

  it("scans the full DOM with a wildcard selector for crater compatibility", () => {
    const selectors: string[] = [];
    const wrapper: FakeElement = { classList: ["wrapper"], tagName: "DIV", parentElement: null };

    installFakeDom(
      [wrapper],
      new Map([
        [".wrapper", { display: "block" }],
      ]),
      new Map(),
      (selector) => selectors.push(selector),
    );

    captureComputedStyleSnapshotInDom(["display"]);

    assert.deepEqual(selectors, ["*"]);
  });
});

describe("captureComputedStyleSnapshotForTargetSelectorsInDom", () => {
  it("captures only selectors requested by runtime fallback", () => {
    const button: FakeElement = { classList: ["btn"], tagName: "BUTTON", parentElement: null };
    const field: FakeElement = { classList: ["field"], tagName: "INPUT", parentElement: null };

    installFakeDom(
      [button, field],
      new Map([
        [".btn", { background: "rgb(0, 0, 255)" }],
        [".field", { background: "rgb(255, 255, 255)" }],
      ]),
    );
    ((globalThis as Record<string, unknown>).document as Record<string, unknown>).querySelectorAll = (selector: string) => {
      if (selector === ".field") return [field];
      return [];
    };

    const snapshot = captureComputedStyleSnapshotForTargetSelectorsInDom({
      props: ["background"],
      selectors: [".field"],
    });

    assert.deepEqual(snapshot, {
      ".field": { background: "rgb(255, 255, 255)" },
    });
  });
});

describe("buildInteractionTargetPlans", () => {
  it("normalizes hover, focus, and pseudo-element selectors for runtime targeting", () => {
    const plans = buildInteractionTargetPlans([
      ".btn:hover, input:focus-visible",
      ".tooltip:hover::after",
    ]);

    assert.deepEqual(plans, [
      { selector: ".btn:hover", normalizedSelector: ".btn", interaction: "hover" },
      { selector: "input:focus-visible", normalizedSelector: "input", interaction: "focus" },
      { selector: ".tooltip:hover::after", normalizedSelector: ".tooltip", interaction: "hover" },
    ]);
  });
});

describe("selectInteractionFallbackPlans", () => {
  it("always keeps focus plans and adds hover plans when emulation is empty", () => {
    const plans = [
      { selector: ".btn:hover", normalizedSelector: ".btn", interaction: "hover" as const },
      { selector: "input:focus", normalizedSelector: "input", interaction: "focus" as const },
    ];

    assert.deepEqual(selectInteractionFallbackPlans(plans, true), [
      { selector: "input:focus", normalizedSelector: "input", interaction: "focus" },
    ]);
    assert.deepEqual(selectInteractionFallbackPlans(plans, false), plans);
  });
});

describe("captureEmulatedInteractionStyleSnapshotInDom", () => {
  it("injects emulated rules, waits for reflow + rAF, and captures interactive targets", async () => {
    class FakeCssStyleRule {
      selectorText: string;
      style: { cssText: string };

      constructor(selectorText: string, style: { cssText: string }) {
        this.selectorText = selectorText;
        this.style = style;
      }
    }

    const events: string[] = [];
    const button: FakeElement = { classList: ["btn"], tagName: "BUTTON", parentElement: null };
    const field: FakeElement = { classList: ["field"], tagName: "INPUT", parentElement: null };

    installFakeDom(
      [button, field],
      new Map<string, FakeStyleMap>([
        [".btn", { background: "rgb(0, 0, 255)" }],
        [".field", { "border-color": "rgb(255, 0, 0)" }],
      ]),
    );

    (globalThis as Record<string, unknown>).CSSStyleRule = FakeCssStyleRule;
    (globalThis as Record<string, unknown>).requestAnimationFrame = (callback: FrameRequestCallback) => {
      events.push("raf");
      callback(0);
      return 1;
    };

    const documentRecord = (globalThis as Record<string, unknown>).document as Record<string, unknown>;
    documentRecord.styleSheets = [
      {
        cssRules: [
          new FakeCssStyleRule(".btn:hover", { cssText: "background: rgb(0, 0, 255);" }),
          new FakeCssStyleRule(".field:focus", { cssText: "border-color: rgb(255, 0, 0);" }),
        ],
      },
    ];
    documentRecord.head = {
      appendChild: () => {
        events.push("append");
      },
    };
    documentRecord.createElement = () => ({
      id: "",
      textContent: "",
      remove: () => {
        events.push("remove");
      },
    });
    documentRecord.documentElement = {};
    Object.defineProperty(documentRecord.documentElement, "offsetHeight", {
      configurable: true,
      get() {
        events.push("reflow");
        return 1;
      },
    });

    const snapshot = await captureEmulatedInteractionStyleSnapshotInDom(["background", "border-color"]);

    assert.deepEqual(snapshot, {
      ".btn": { background: "rgb(0, 0, 255)", "border-color": "" },
      ".field": { background: "", "border-color": "rgb(255, 0, 0)" },
    });
    assert.deepEqual(events, ["append", "reflow", "raf", "raf", "remove"]);
  });
});

describe("computedStyleSnapshotToMap", () => {
  it("converts a plain snapshot object into a Map", () => {
    const map = computedStyleSnapshotToMap({
      ".card": { color: "red" },
      ".card::before": { color: "blue" },
    });

    assert.equal(map.get(".card")?.color, "red");
    assert.equal(map.get(".card::before")?.color, "blue");
  });
});

describe("parseComputedStyleSnapshot", () => {
  it("accepts JSON-serialized snapshots", () => {
    const snapshot = parseComputedStyleSnapshot(JSON.stringify({
      ".card": { color: "red" },
      ".card::before": { content: '"badge"' },
    }));

    assert.deepEqual(snapshot, {
      ".card": { color: "red" },
      ".card::before": { content: '"badge"' },
    });
  });
});

describe("hasMeaningfulComputedStyleSnapshot", () => {
  it("returns false when all captured values are empty", () => {
    assert.equal(hasMeaningfulComputedStyleSnapshot({
      ".card": { display: "", color: "" },
    }), false);
  });

  it("returns true when at least one property has a value", () => {
    assert.equal(hasMeaningfulComputedStyleSnapshot({
      ".card": { display: "flex", color: "" },
    }), true);
  });
});

describe("mergeComputedStyleSnapshots", () => {
  it("merges interaction snapshots with later values taking precedence", () => {
    assert.deepEqual(
      mergeComputedStyleSnapshots(
        { ".btn": { background: "rgb(0, 0, 255)" } },
        { ".btn": { background: "rgb(1, 1, 255)" }, ".field": { color: "red" } },
      ),
      {
        ".btn": { background: "rgb(1, 1, 255)" },
        ".field": { color: "red" },
      },
    );
  });
});

describe("buildComputedStyleCaptureExpression", () => {
  it("serializes the DOM collector into an executable expression", () => {
    const expression = buildComputedStyleCaptureExpression(["color", "display"]);
    assert.match(expression, /getComputedStyle/);
    assert.match(expression, /::before/);
    assert.match(expression, /"color","display"/);
  });

  it("can wrap the collector in JSON.stringify for BiDi transport", () => {
    const expression = buildComputedStyleCaptureJsonExpression(["color"]);
    assert.match(expression, /JSON\.stringify/);
    assert.match(expression, /getComputedStyle/);
  });

  it("stays self-contained when evaluated in an isolated context", () => {
    const hero: FakeElement = {
      className: "readme-header",
      tagName: "DIV",
      parentElement: null,
    };
    const context = {
      document: {
        querySelectorAll: () => [hero],
      },
      window: {
        getComputedStyle: (element: FakeElement) => ({
          getPropertyValue: (prop: string) => {
            const key = styleKey(element);
            return key === ".readme-header" && prop === "display" ? "flex" : "";
          },
        }),
      },
    };

    const serialized = vm.runInNewContext(
      buildComputedStyleCaptureJsonExpression(["display"]),
      context,
    );

    assert.equal(serialized, JSON.stringify({
      ".readme-header": { display: "flex" },
    }));
  });
});
