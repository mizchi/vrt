/**
 * CSS Challenge コアロジック
 *
 * css-challenge.ts と css-challenge-bench.ts の共通基盤
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import { compareScreenshots } from "./heatmap.ts";
import { classifyVisualDiff } from "./visual-semantic.ts";
import { diffA11yTrees, checkA11yTree, parsePlaywrightA11ySnapshot } from "./a11y-semantic.ts";
import { CraterClient, diffPaintTrees, type PaintNode, type PaintTreeChange } from "./crater-client.ts";
import type { A11yNode, VrtSnapshot, VrtDiff, VisualSemanticDiff, A11yDiff } from "./types.ts";

// ---- Types ----

export interface CssDeclaration {
  index: number;       // line index in full CSS text
  text: string;        // original line text
  property: string;    // e.g. "padding"
  value: string;       // e.g. "12px 24px"
  selector: string;    // containing selector
  mediaCondition: string | null;  // e.g. "(max-width: 768px)" or null
}

export interface CapturedState {
  a11yTree: A11yNode;
  screenshotPath: string;
  computedStyles: Map<string, Record<string, string>>;  // selector → { property: value }
  hoverComputedStyles: Map<string, Record<string, string>>;  // hover-forced computed styles
  paintTree?: PaintNode;  // crater only: internal paint tree
}

/** Computed style diff between two captures */
export interface ComputedStyleDiff {
  selector: string;
  property: string;
  before: string;
  after: string;
}

export function diffComputedStyles(
  baseline: Map<string, Record<string, string>>,
  broken: Map<string, Record<string, string>>,
): ComputedStyleDiff[] {
  const diffs: ComputedStyleDiff[] = [];
  for (const [selector, baseProps] of baseline) {
    const brokenProps = broken.get(selector);
    if (!brokenProps) continue;
    for (const [prop, baseVal] of Object.entries(baseProps)) {
      const brokenVal = brokenProps[prop];
      if (brokenVal !== undefined && brokenVal !== baseVal) {
        diffs.push({ selector, property: prop, before: baseVal, after: brokenVal });
      }
    }
  }
  return diffs;
}

export interface VrtAnalysis {
  vrtDiff: VrtDiff | null;
  visualSemantic: VisualSemanticDiff | null;
  a11yDiff: A11yDiff;
  baselineIssueCount: number;
  brokenIssueCount: number;
  computedStyleDiffs: ComputedStyleDiff[];
  hoverDiffDetected: boolean;
  paintTreeChanges: PaintTreeChange[];
  visualReport: string;
  a11yReport: string;
  fullReport: string;
}

export interface TrialResult {
  seed: number;
  removed: CssDeclaration;
  // Detection
  visualDiffDetected: boolean;
  visualDiffRatio: number;
  visualChangeTypes: string[];
  a11yDiffDetected: boolean;
  a11yChangeCount: number;
  newA11yIssues: number;
  // LLM recovery (if attempted)
  llmAttempted: boolean;
  llmFixParsed: boolean;
  selectorMatch: boolean;
  propertyMatch: boolean;
  valueMatch: boolean;
  exactMatch: boolean;
  pixelPerfect: boolean;
  nearPerfect: boolean;
  fixedDiffRatio: number;
  attempts: number;
  llmMs: number;
}

// ---- CSS Parsing ----

export function parseCssDeclarations(css: string): CssDeclaration[] {
  const lines = css.split("\n");
  const declarations: CssDeclaration[] = [];
  let currentMedia: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("//")) continue;

    // Track @media blocks
    const mediaMatch = trimmed.match(/^@media\s+(.+?)\s*\{$/);
    if (mediaMatch) {
      currentMedia = mediaMatch[1];
      continue;
    }
    if (trimmed === "}" && currentMedia !== null) {
      currentMedia = null;
      continue;
    }
    if (trimmed.startsWith("@") || trimmed === "}") continue;

    const oneLineMatch = trimmed.match(/^([^{]+)\{([^}]+)\}\s*$/);
    if (oneLineMatch) {
      const selector = oneLineMatch[1].trim();
      const body = oneLineMatch[2].trim();
      const props = body.split(";").filter((s) => s.trim());
      for (const prop of props) {
        const propMatch = prop.trim().match(/^([\w-]+)\s*:\s*(.+?)\s*$/);
        if (propMatch) {
          declarations.push({
            index: i,
            text: line,
            property: propMatch[1],
            value: propMatch[2],
            selector,
            mediaCondition: currentMedia,
          });
        }
      }
    }
  }

  return declarations;
}

export function removeCssProperty(css: string, declaration: CssDeclaration): string {
  const lines = css.split("\n");
  const line = lines[declaration.index];
  const propPattern = new RegExp(
    `\\s*${escapeRegex(declaration.property)}\\s*:\\s*${escapeRegex(declaration.value)}\\s*;?`,
  );
  lines[declaration.index] = line.replace(propPattern, "");
  return lines.join("\n");
}

export function applyCssFix(css: string, fix: { selector: string; property: string; value: string }): string {
  const lines = css.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const oneLineMatch = trimmed.match(/^([^{]+)\{([^}]+)\}\s*$/);
    if (oneLineMatch) {
      const selector = oneLineMatch[1].trim();
      if (selector === fix.selector) {
        const body = oneLineMatch[2].trim();
        const newBody = `${body} ${fix.property}: ${fix.value};`;
        lines[i] = `${selector} { ${newBody} }`;
        return lines.join("\n");
      }
    }
  }
  return css;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeValue(v: string): string {
  return v.replace(/\s+/g, " ").replace(/;$/, "").trim();
}

// ---- Random ----

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---- Render backends ----

export type RenderBackend = "chromium" | "crater";

export async function createBrowser(viewport = { width: 1280, height: 900 }): Promise<{ browser: Browser; viewport: { width: number; height: number } }> {
  const browser = await chromium.launch();
  return { browser, viewport };
}

export async function createCraterClient(): Promise<CraterClient> {
  const client = new CraterClient();
  await client.connect();
  return client;
}

// CSS properties worth tracking for computed style diff
const TRACKED_PROPERTIES = [
  "display", "visibility", "opacity",
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-radius",
  "background-color", "background-image",
  "color", "font-size", "font-weight", "font-family", "font-style",
  "text-decoration", "text-align", "text-transform",
  "line-height", "letter-spacing", "word-spacing", "white-space",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink",
  "align-items", "justify-content", "gap",
  "position", "top", "right", "bottom", "left",
  "overflow", "box-shadow", "cursor",
];

export async function capturePageState(
  browser: Browser,
  viewport: { width: number; height: number },
  html: string,
  screenshotPath: string,
  options?: { captureHover?: boolean },
): Promise<CapturedState> {
  const page = await browser.newPage({ viewport });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Capture computed styles for styled elements + semantic tags
  const computedStyles = new Map<string, Record<string, string>>();
  try {
    const styles = await page.evaluate((props: string[]) => {
      const results: Record<string, Record<string, string>> = {};
      // Include class/id elements AND semantic/content tags without classes
      const selector = "*[class], *[id], main, nav, header, footer, aside, article, section, " +
        "table, thead, tbody, tr, th, td, ul, ol, li, " +
        "h1, h2, h3, h4, h5, h6, p, a, button, input, select, textarea, " +
        "pre, code, blockquote, img, span, div, form, label";
      const elements = document.querySelectorAll(selector);
      let tagCounters: Record<string, number> = {};
      for (const el of elements) {
        const he = el as HTMLElement;
        let key: string;
        if (he.id) {
          key = `#${he.id}`;
        } else if (he.classList.length > 0) {
          key = `.${[...he.classList].join(".")}`;
        } else {
          // Tag-based key with parent context for uniqueness
          const tag = he.tagName.toLowerCase();
          const parentClass = he.parentElement?.classList?.[0];
          const ctx = parentClass ? `.${parentClass}` : "";
          const count = tagCounters[`${ctx}>${tag}`] = (tagCounters[`${ctx}>${tag}`] ?? 0) + 1;
          key = `${ctx}>${tag}[${count}]`;
        }
        if (!key || results[key]) continue;
        const computed = window.getComputedStyle(he);
        const s: Record<string, string> = {};
        for (const prop of props) {
          s[prop] = computed.getPropertyValue(prop);
        }
        results[key] = s;

        // Also capture ::before and ::after pseudo-elements
        for (const pseudo of ["::before", "::after"] as const) {
          const pseudoComputed = window.getComputedStyle(he, pseudo);
          const content = pseudoComputed.getPropertyValue("content");
          if (content && content !== "none" && content !== "normal") {
            const ps: Record<string, string> = {};
            for (const prop of props) {
              ps[prop] = pseudoComputed.getPropertyValue(prop);
            }
            results[`${key}${pseudo}`] = ps;
          }
        }
      }
      return results;
    }, TRACKED_PROPERTIES);
    for (const [sel, props] of Object.entries(styles)) {
      computedStyles.set(sel, props);
    }
  } catch { /* ignore */ }

  // Capture hover styles by temporarily activating :hover rules
  // Strategy: inject a <style> that converts :hover rules to always-active versions,
  // then capture computed styles, then remove the injected style.
  const hoverComputedStyles = new Map<string, Record<string, string>>();
  if (options?.captureHover) {
    try {
      // Extract :hover rules from the page CSS, convert to always-active
      const hoverStyles = await page.evaluate((props: string[]) => {
        // Collect all :hover rules from stylesheets
        const hoverRules: string[] = [];
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSStyleRule && (rule.selectorText.includes(":hover") || rule.selectorText.includes(":focus"))) {
                // Replace :hover/:focus with nothing to make it always active
                const newSelector = rule.selectorText.replace(/:hover/g, "").replace(/:focus/g, "").replace(/:focus-visible/g, "").replace(/:focus-within/g, "");
                hoverRules.push(`${newSelector} { ${rule.style.cssText} }`);
              }
            }
          } catch { /* cross-origin */ }
        }

        if (hoverRules.length === 0) return {};

        // Inject always-active hover rules
        const style = document.createElement("style");
        style.id = "__hover_emulation__";
        style.textContent = hoverRules.join("\n");
        document.head.appendChild(style);

        // Capture computed styles of elements targeted by hover rules
        const results: Record<string, Record<string, string>> = {};
        // Build selector list from hover rules (non-hover version)
        const hoverSelectors = new Set<string>();
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule instanceof CSSStyleRule && rule.selectorText.includes(":hover")) {
                const sel = rule.selectorText.replace(/:hover/g, "").replace(/:focus/g, "").trim();
                if (sel) hoverSelectors.add(sel);
              }
            }
          } catch { /* cross-origin */ }
        }
        const targetSelector = [...hoverSelectors].join(", ") || "a, button";
        let targets: NodeListOf<Element>;
        try { targets = document.querySelectorAll(targetSelector); }
        catch { targets = document.querySelectorAll("a, button, [role='button']"); }
        const tagCounters: Record<string, number> = {};
        for (const el of targets) {
          const he = el as HTMLElement;
          let key: string;
          if (he.id) {
            key = `#${he.id}`;
          } else if (he.classList.length > 0) {
            key = `.${[...he.classList].join(".")}`;
          } else {
            // Match the key format used by computed style collection
            const tag = he.tagName.toLowerCase();
            const parentClass = he.parentElement?.classList?.[0];
            const ctx = parentClass ? `.${parentClass}` : "";
            const count = tagCounters[`${ctx}>${tag}`] = (tagCounters[`${ctx}>${tag}`] ?? 0) + 1;
            key = `${ctx}>${tag}[${count}]`;
          }
          if (!key || results[key]) continue;
          const computed = window.getComputedStyle(he);
          const styles: Record<string, string> = {};
          for (const p of props) styles[p] = computed.getPropertyValue(p);
          results[key] = styles;
        }

        // Cleanup
        style.remove();
        return results;
      }, TRACKED_PROPERTIES);
      for (const [sel, props] of Object.entries(hoverStyles)) {
        hoverComputedStyles.set(sel, props);
      }
    } catch { /* ignore */ }
  }

  // Capture a11y tree via CDP
  let a11yTree: A11yNode = { role: "document", name: "", children: [] };
  try {
    const client = await page.context().newCDPSession(page);
    const result = await client.send("Accessibility.getFullAXTree");
    a11yTree = cdpNodesToTree(result.nodes) as A11yNode;
    await client.detach();
  } catch {
    // Fallback
  }
  await page.close();

  return { a11yTree, screenshotPath, computedStyles, hoverComputedStyles };
}

/** Crater BiDi バックエンドでキャプチャ */
export async function capturePageStateCrater(
  client: CraterClient,
  viewport: { width: number; height: number },
  html: string,
  screenshotPath: string,
): Promise<CapturedState> {
  await client.setViewport(viewport.width, viewport.height);
  await client.setContent(html);

  // PNG スクリーンショット (capturePaintData → PNG 変換)
  const { png } = await client.capturePng();
  await writeFile(screenshotPath, png);

  // Paint tree — crater 固有の強み
  let paintTree: PaintNode | undefined;
  try {
    paintTree = await client.capturePaintTree();
  } catch { /* ignore */ }

  // a11y tree — crater は空で返す (将来的に対応)
  const a11yTree: A11yNode = { role: "document", name: "", children: [] };

  const computedStyles = new Map<string, Record<string, string>>();
  const hoverComputedStyles = new Map<string, Record<string, string>>();

  return { a11yTree, screenshotPath, computedStyles, hoverComputedStyles, paintTree };
}

function cdpNodesToTree(nodes: Array<{
  nodeId: string;
  role?: { value: string };
  name?: { value: string };
  properties?: Array<{ name: string; value: { value: unknown } }>;
  childIds?: string[];
}>): unknown {
  if (!nodes || nodes.length === 0) return { role: "document", name: "", children: [] };

  const nodeMap = new Map<string, Record<string, unknown>>();
  const childMap = new Map<string, string[]>();

  for (const node of nodes) {
    const props: Record<string, unknown> = {};
    if (node.properties) {
      for (const p of node.properties) props[p.name] = p.value?.value;
    }
    const treeNode: Record<string, unknown> = {
      role: node.role?.value ?? "none",
      name: node.name?.value ?? "",
    };
    if (props.checked !== undefined) treeNode.checked = props.checked;
    if (props.disabled !== undefined) treeNode.disabled = props.disabled;
    if (props.expanded !== undefined) treeNode.expanded = props.expanded;
    if (props.level !== undefined) treeNode.level = props.level;
    nodeMap.set(node.nodeId, treeNode);
    if (node.childIds) childMap.set(node.nodeId, node.childIds);
  }

  function buildTree(nodeId: string): Record<string, unknown> | null {
    const node = nodeMap.get(nodeId);
    if (!node) return null;
    const childIds = childMap.get(nodeId) ?? [];
    const children = childIds.map(buildTree).filter((c): c is Record<string, unknown> => c !== null);
    if (children.length > 0) node.children = children;
    return node;
  }

  return buildTree(nodes[0].nodeId) ?? { role: "document", name: "", children: [] };
}

// ---- VRT Analysis ----

export async function analyzeVrtDiff(
  baselineState: CapturedState,
  brokenState: CapturedState,
  outputDir: string,
): Promise<VrtAnalysis> {
  const vrtSnap: VrtSnapshot = {
    testId: "page", testTitle: "page", projectName: "css-challenge",
    screenshotPath: brokenState.screenshotPath,
    baselinePath: baselineState.screenshotPath,
    status: "changed",
  };
  const vrtDiff = await compareScreenshots(vrtSnap, { outputDir });

  let visualSemantic: VisualSemanticDiff | null = null;
  let visualReport = "";
  if (vrtDiff && vrtDiff.diffPixels > 0) {
    visualSemantic = classifyVisualDiff(vrtDiff);
    visualReport = `Visual diff: ${(vrtDiff.diffRatio * 100).toFixed(1)}% pixels changed\n` +
      `Regions: ${vrtDiff.regions.map((r) => `(${r.x},${r.y} ${r.width}x${r.height})`).join(", ")}\n` +
      `Semantic: ${visualSemantic.summary}\n` +
      visualSemantic.changes.map((c) => `  - [${c.type}] ${c.description}`).join("\n");
  } else {
    visualReport = "No visual diff detected — the removed CSS line had no visible effect at this viewport size.";
  }

  const a11yDiff = diffA11yTrees(
    parsePlaywrightA11ySnapshot("page", "page", baselineState.a11yTree as any),
    parsePlaywrightA11ySnapshot("page", "page", brokenState.a11yTree as any),
  );

  const baselineIssueCount = checkA11yTree(baselineState.a11yTree).length;
  const brokenIssueCount = checkA11yTree(brokenState.a11yTree).length;

  let a11yReport = "";
  if (a11yDiff.changes.length > 0) {
    a11yReport = `A11y changes: ${a11yDiff.changes.length}\n` +
      a11yDiff.changes.map((c) => `  - [${c.type}] ${c.description}`).join("\n");
  } else {
    a11yReport = "No a11y tree changes detected.";
  }
  if (brokenIssueCount > baselineIssueCount) {
    a11yReport += `\nNew a11y quality issues: ${brokenIssueCount - baselineIssueCount}`;
  }

  // Computed style diff
  const computedStyleDiffs = diffComputedStyles(baselineState.computedStyles, brokenState.computedStyles);

  let computedReport = "";
  if (computedStyleDiffs.length > 0) {
    computedReport = `\nComputed style changes: ${computedStyleDiffs.length}\n` +
      computedStyleDiffs.slice(0, 10).map((d) => `  - ${d.selector} { ${d.property}: ${d.before} → ${d.after} }`).join("\n");
  }

  // Hover diff (computed style based)
  const hoverStyleDiffs = diffComputedStyles(baselineState.hoverComputedStyles, brokenState.hoverComputedStyles);
  const hoverDiffDetected = hoverStyleDiffs.length > 0;

  // Paint tree diff (crater only)
  let paintTreeChanges: PaintTreeChange[] = [];
  if (baselineState.paintTree && brokenState.paintTree) {
    paintTreeChanges = diffPaintTrees(baselineState.paintTree, brokenState.paintTree);
  }

  let paintTreeReport = "";
  if (paintTreeChanges.length > 0) {
    paintTreeReport = `\nPaint tree changes: ${paintTreeChanges.length}\n` +
      paintTreeChanges.slice(0, 10).map((c) => `  - [${c.type}] ${c.path} ${c.property ?? ""}: ${c.before ?? ""} → ${c.after ?? ""}`).join("\n");
  }

  const fullReport = `${visualReport}\n\n${a11yReport}${computedReport}${paintTreeReport}`;

  return {
    vrtDiff,
    visualSemantic,
    a11yDiff,
    baselineIssueCount,
    brokenIssueCount,
    computedStyleDiffs,
    hoverDiffDetected,
    paintTreeChanges,
    visualReport,
    a11yReport,
    fullReport,
  };
}

// ---- LLM ----

export function buildFixPrompt(vrtReport: string, fullCss: string): string {
  return `You are debugging a CSS regression. One CSS property declaration was removed from a stylesheet, causing a visual regression.

## VRT Diagnosis Report
${vrtReport}

## Current CSS (with the missing line)
\`\`\`css
${fullCss}
\`\`\`

## Task
Identify which CSS property declaration was removed and provide the exact fix.

Respond in this EXACT format (no other text):
SELECTOR: <the CSS selector>
PROPERTY: <the CSS property name>
VALUE: <the CSS value>

For example:
SELECTOR: .header
PROPERTY: padding
VALUE: 12px 24px`;
}

export function parseLLMFix(response: string): { selector: string; property: string; value: string } | null {
  const selectorMatch = response.match(/SELECTOR:\s*(.+)/);
  const propertyMatch = response.match(/PROPERTY:\s*(.+)/);
  const valueMatch = response.match(/VALUE:\s*(.+)/);
  if (!selectorMatch || !propertyMatch || !valueMatch) return null;
  return {
    selector: selectorMatch[1].trim(),
    property: propertyMatch[1].trim(),
    value: valueMatch[1].trim(),
  };
}

// ---- HTML helpers ----

export const HTML_PATH = join(import.meta.dirname!, "..", "fixtures", "css-challenge", "page.html");

export function extractCss(html: string): string | null {
  const m = html.match(/<style id="target-css">([\s\S]*?)<\/style>/);
  return m ? m[1] : null;
}

export function replaceCss(html: string, originalCss: string, newCss: string): string {
  return html.replace(originalCss, newCss);
}

// ---- Property categorization ----

const LAYOUT_PROPS = new Set([
  "display", "flex", "flex-direction", "flex-wrap", "flex-shrink", "flex-grow",
  "align-items", "justify-content", "gap", "grid-template-columns", "grid-template-rows",
  "position", "top", "right", "bottom", "left", "float", "clear", "overflow", "overflow-x", "overflow-y",
]);
const SPACING_PROPS = new Set([
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
]);
const SIZING_PROPS = new Set([
  "width", "height", "max-width", "max-height", "min-width", "min-height",
  "line-height",
]);
const VISUAL_PROPS = new Set([
  "background", "background-color", "background-image",
  "color", "opacity",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-radius", "border-spacing",
  "box-shadow", "text-shadow",
  "outline",
]);
const TYPO_PROPS = new Set([
  "font-family", "font-size", "font-weight", "font-style",
  "text-align", "text-decoration", "text-transform", "text-indent",
  "letter-spacing", "word-spacing", "white-space",
]);

const ANIMATION_PROPS = new Set([
  "animation", "animation-name", "animation-duration", "animation-delay",
  "animation-timing-function", "animation-iteration-count", "animation-direction",
  "animation-fill-mode", "animation-play-state",
  "transition", "transition-property", "transition-duration", "transition-delay",
  "transition-timing-function",
]);

const TRANSFORM_PROPS = new Set([
  "transform", "transform-origin", "translate", "rotate", "scale",
  "filter", "backdrop-filter", "clip-path", "mask",
]);

export type PropertyCategory = "layout" | "spacing" | "sizing" | "visual" | "typography" | "animation" | "transform" | "other";

export function categorizeProperty(property: string): PropertyCategory {
  if (LAYOUT_PROPS.has(property)) return "layout";
  if (SPACING_PROPS.has(property)) return "spacing";
  if (SIZING_PROPS.has(property)) return "sizing";
  if (VISUAL_PROPS.has(property)) return "visual";
  if (TYPO_PROPS.has(property)) return "typography";
  if (ANIMATION_PROPS.has(property)) return "animation";
  if (TRANSFORM_PROPS.has(property)) return "transform";
  return "other";
}
