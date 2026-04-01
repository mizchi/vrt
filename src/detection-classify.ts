/**
 * CSS 宣言の分類ロジック
 *
 * 事前分類: セレクタ種別、インタラクティブ状態かどうか
 * 事後分類: 未検出時の理由推定
 */
import type { PropertyCategory } from "./css-challenge-core.ts";

// ---- Types ----

export type SelectorType = "element" | "class" | "pseudo-class" | "pseudo-element" | "compound";

export type UndetectedReason =
  | "hover-only"        // :hover, :focus, :active — 静的スクリーンショットでは不可視
  | "same-as-default"   // 削除してもブラウザデフォルトと同じ
  | "same-as-parent"    // 親から継承される値と同一 (背景色が同じ等)
  | "viewport-dependent"// 一部の viewport でのみ検出
  | "content-dependent" // overflow, wrap 等 — コンテンツ量に依存
  | "media-scoped"      // @media 内で、テスト viewport に該当しない
  | "dead-code"         // 他のルールで上書きされている / 対象要素が存在しない
  | "unknown";

export interface ViewportDetectionResult {
  width: number;
  height: number;
  visualDiffDetected: boolean;
  visualDiffRatio: number;
  a11yDiffDetected: boolean;
  a11yChangeCount: number;
  computedStyleDiffCount: number;
  hoverDiffDetected: boolean;
  paintTreeDiffCount: number;
}

export interface ClassifiedDeclaration {
  selectorType: SelectorType;
  isInteractive: boolean;
  mediaCondition: string | null;
}

// ---- Selector classification ----

const INTERACTIVE_PSEUDOS = /:(hover|focus|active|focus-within|focus-visible|checked|disabled|invalid|valid|required|read-only)\b/;
const PSEUDO_ELEMENT = /::[\w-]+/;
const PSEUDO_CLASS = /:[\w-]+/;

export function classifySelectorType(selector: string): SelectorType {
  // Compound: multiple selectors or descendant combinators
  if (/[,>~+\s]/.test(selector.trim().replace(/::?[\w-]+(\(.*?\))?/g, "").trim())) {
    return "compound";
  }
  if (PSEUDO_ELEMENT.test(selector)) return "pseudo-element";
  if (PSEUDO_CLASS.test(selector)) return "pseudo-class";
  if (/^[a-zA-Z][\w-]*$/.test(selector.trim())) return "element";
  return "class";
}

export function isInteractiveSelector(selector: string): boolean {
  return INTERACTIVE_PSEUDOS.test(selector);
}

export function classifyDeclaration(
  selector: string,
  mediaCondition: string | null,
): ClassifiedDeclaration {
  return {
    selectorType: classifySelectorType(selector),
    isInteractive: isInteractiveSelector(selector),
    mediaCondition,
  };
}

// ---- Undetected reason classification ----

// Properties where removing = browser default (no visual change)
const DEFAULT_EQUIVALENT: Record<string, Set<string>> = {
  "text-decoration": new Set(["none"]),
  "font-weight": new Set(["normal", "400"]),
  "font-style": new Set(["normal"]),
  "opacity": new Set(["1"]),
  "overflow": new Set(["visible"]),
  "overflow-x": new Set(["visible"]),
  "overflow-y": new Set(["visible"]),
  "position": new Set(["static"]),
  "float": new Set(["none"]),
  "clear": new Set(["none"]),
  "border": new Set(["none", "0"]),
  "outline": new Set(["none"]),
  "margin": new Set(["0", "0px"]),
  "padding": new Set(["0", "0px"]),
  "background": new Set(["transparent", "none"]),
  "background-color": new Set(["transparent"]),
  "box-shadow": new Set(["none"]),
  "text-shadow": new Set(["none"]),
  "text-transform": new Set(["none"]),
  "letter-spacing": new Set(["normal"]),
  "word-spacing": new Set(["normal"]),
  "cursor": new Set(["auto"]),
};

// Properties that only matter when content exceeds container
const CONTENT_DEPENDENT_PROPS = new Set([
  "white-space",
  "overflow", "overflow-x", "overflow-y",
  "text-overflow",
  "flex-wrap",
  "word-break", "word-wrap", "overflow-wrap",
]);

// Common page-level background colors (same-as-parent heuristic)
const COMMON_BG_COLORS = new Set([
  "#f6f8fa", "#fff", "#ffffff", "#f5f5f5", "#fafafa",
  "transparent", "inherit",
]);

export function classifyUndetectedReason(
  selector: string,
  property: string,
  value: string,
  mediaCondition: string | null,
  viewportResults: ViewportDetectionResult[],
): UndetectedReason {
  // Check if any viewport detected it
  const anyDetected = viewportResults.some((v) => v.visualDiffDetected || v.a11yDiffDetected);
  if (anyDetected) {
    // If some viewports detected and others didn't, it's viewport-dependent
    const allDetected = viewportResults.every((v) => v.visualDiffDetected || v.a11yDiffDetected);
    if (!allDetected) return "viewport-dependent";
    // Should not be called for fully detected cases
    return "unknown";
  }

  // 1. Interactive selector → hover-only
  if (isInteractiveSelector(selector)) {
    return "hover-only";
  }

  // 2. @media scoped and no matching viewport tested
  if (mediaCondition) {
    return "media-scoped";
  }

  // 3. Value is browser default
  const defaults = DEFAULT_EQUIVALENT[property];
  if (defaults && defaults.has(normalizeForComparison(value))) {
    return "same-as-default";
  }

  // 4. Background/color same as common page background
  if ((property === "background" || property === "background-color") &&
      COMMON_BG_COLORS.has(normalizeForComparison(value))) {
    return "same-as-parent";
  }

  // 5. Content-dependent properties
  if (CONTENT_DEPENDENT_PROPS.has(property)) {
    return "content-dependent";
  }

  // 6. Dead code: no computed style diff AND no visual diff across all viewports
  // This suggests the rule is overridden by a more specific selector or targets no elements
  const allComputedZero = viewportResults.every((v) => v.computedStyleDiffCount === 0);
  const allVisualZero = viewportResults.every((v) => !v.visualDiffDetected);
  if (allComputedZero && allVisualZero && viewportResults.length >= 2) {
    return "dead-code";
  }

  return "unknown";
}

// ---- Scope check ----

const OUT_OF_SCOPE_PROPS = new Set([
  "animation", "animation-name", "animation-duration", "animation-delay",
  "animation-timing-function", "animation-iteration-count", "animation-direction",
  "animation-fill-mode", "animation-play-state",
]);

/** animation 系プロパティはスコープ外（別手法で対応予定） */
export function isOutOfScope(property: string): boolean {
  return OUT_OF_SCOPE_PROPS.has(property);
}

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/;$/, "");
}
