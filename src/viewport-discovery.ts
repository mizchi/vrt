/**
 * Viewport Discovery — CSS から breakpoint を発見し、境界チェック用 viewport を生成
 *
 * @media クエリから breakpoint を抽出し、quickcheck 的に
 * 境界 ±1px + 範囲内ランダムサンプルの viewport リストを生成する。
 */

// ---- Types ----

export interface Breakpoint {
  value: number;          // px
  type: "min-width" | "max-width";
  raw: string;            // e.g. "(min-width: 768px)"
}

export interface ViewportSpec {
  width: number;
  height: number;
  label: string;
  reason: string;         // why this viewport was chosen
}

export interface DiscoveryResult {
  breakpoints: Breakpoint[];
  viewports: ViewportSpec[];
}

// ---- Breakpoint extraction ----

const MEDIA_PATTERN = /@media\s+([^{]+)\{/g;
const WIDTH_PATTERN = /\(\s*(min|max)-width\s*:\s*([\d.]+)(px|rem|em)\s*\)/g;

/** CSS テキストから全 breakpoint を抽出 */
export function extractBreakpoints(css: string): Breakpoint[] {
  const breakpoints = new Map<string, Breakpoint>(); // dedupe by key

  for (const mediaMatch of css.matchAll(MEDIA_PATTERN)) {
    const condition = mediaMatch[1].trim();
    for (const widthMatch of condition.matchAll(WIDTH_PATTERN)) {
      const type = `${widthMatch[1]}-width` as "min-width" | "max-width";
      let value = parseFloat(widthMatch[2]);
      const unit = widthMatch[3];
      // rem/em → px (assume 16px base)
      if (unit === "rem" || unit === "em") value *= 16;
      value = Math.round(value);

      const key = `${type}:${value}`;
      if (!breakpoints.has(key)) {
        breakpoints.set(key, { value, type, raw: `(${type}: ${value}px)` });
      }
    }
  }

  return [...breakpoints.values()].sort((a, b) => a.value - b.value);
}

/** HTML の <style> から breakpoint を抽出 */
export function extractBreakpointsFromHtml(html: string): Breakpoint[] {
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g);
  if (!styleMatch) return [];
  const css = styleMatch.map((s) => s.replace(/<\/?style[^>]*>/g, "")).join("\n");
  return extractBreakpoints(css);
}

// ---- Viewport generation ----

export interface ViewportOptions {
  height?: number;              // default: 900
  maxViewports?: number;        // 上限 (コスト制御)
  randomSamples?: number;       // 範囲内ランダムサンプル数 (default: 0)
  seed?: number;                // ランダム seed
  includeStandard?: boolean;    // 標準 viewport (375, 1280, 1440) を含める (default: true)
}

const STANDARD_VIEWPORTS: Array<{ width: number; label: string }> = [
  { width: 375, label: "mobile" },
  { width: 1280, label: "desktop" },
  { width: 1440, label: "wide" },
];

/**
 * Breakpoint から quickcheck 的に viewport リストを生成
 *
 * 各 breakpoint に対して:
 * - 境界直上 (+1px): breakpoint が有効になった直後
 * - 境界直下 (-1px): breakpoint が有効になる直前
 * - (オプション) 範囲内のランダムサンプル
 */
export function generateViewports(
  breakpoints: Breakpoint[],
  options: ViewportOptions = {},
): ViewportSpec[] {
  const height = options.height ?? 900;
  const maxViewports = options.maxViewports ?? 20;
  const randomSamples = options.randomSamples ?? 0;
  const includeStandard = options.includeStandard ?? true;
  const seed = options.seed ?? 42;

  const viewportMap = new Map<number, ViewportSpec>();

  function add(width: number, label: string, reason: string) {
    if (width < 320 || width > 2560) return;
    if (!viewportMap.has(width)) {
      viewportMap.set(width, { width, height, label, reason });
    }
  }

  // Standard viewports
  if (includeStandard) {
    for (const sv of STANDARD_VIEWPORTS) {
      add(sv.width, sv.label, "standard");
    }
  }

  // Boundary viewports for each breakpoint
  for (const bp of breakpoints) {
    if (bp.type === "min-width") {
      // min-width: N → test at N-1 (below) and N (at)
      add(bp.value - 1, `below-${bp.value}`, `${bp.raw} boundary-below`);
      add(bp.value, `at-${bp.value}`, `${bp.raw} boundary-at`);
    } else {
      // max-width: N → test at N (at) and N+1 (above)
      add(bp.value, `at-${bp.value}`, `${bp.raw} boundary-at`);
      add(bp.value + 1, `above-${bp.value}`, `${bp.raw} boundary-above`);
    }
  }

  // Random samples within breakpoint ranges
  if (randomSamples > 0 && breakpoints.length > 0) {
    const allWidths = [...new Set(breakpoints.map((b) => b.value))].sort((a, b) => a - b);
    const ranges: Array<[number, number]> = [];

    // Build ranges: [320, bp1], [bp1, bp2], ..., [bpN, 1920]
    ranges.push([320, allWidths[0] - 1]);
    for (let i = 0; i < allWidths.length - 1; i++) {
      ranges.push([allWidths[i], allWidths[i + 1] - 1]);
    }
    ranges.push([allWidths[allWidths.length - 1], 1920]);

    let s = seed;
    const rand = () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };

    for (const [lo, hi] of ranges) {
      if (hi - lo < 2) continue;
      for (let j = 0; j < randomSamples; j++) {
        const w = Math.round(lo + rand() * (hi - lo));
        add(w, `sample-${w}`, `random sample in [${lo}, ${hi}]`);
      }
    }
  }

  // Sort by width and limit
  const sorted = [...viewportMap.values()].sort((a, b) => a.width - b.width);
  return sorted.slice(0, maxViewports);
}

/**
 * HTML から breakpoint を発見し、境界チェック用 viewport を生成
 */
export function discoverViewports(
  html: string,
  options: ViewportOptions = {},
): DiscoveryResult {
  const breakpoints = extractBreakpointsFromHtml(html);
  const viewports = generateViewports(breakpoints, options);
  return { breakpoints, viewports };
}
