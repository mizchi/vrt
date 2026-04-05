/**
 * VRT Mask — スクリーンショット撮影前に特定セレクタを不可視にする
 *
 * visibility: hidden でレイアウトを維持したまま描画だけ消す。
 * 動的コンテンツ (カウンタ, アニメーション, 広告等) の false positive を防ぐ。
 */
import type { Page } from "playwright";

const MASK_STYLE_ID = "__vrt-mask-style__";

/**
 * ページにマスクスタイルを注入する。
 * 対象セレクタの要素を visibility: hidden にし、子孫も含めて不可視にする。
 */
export async function applyMask(page: Page, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;

  const css = selectors
    .map((s) => `${s} { visibility: hidden !important; }`)
    .join("\n");

  await page.addStyleTag({ content: css });
}

/**
 * CLI の --mask フラグからセレクタ配列をパースする。
 * カンマ区切りまたは複数 --mask フラグに対応。
 *
 * --mask ".stars,.carousel"
 * --mask ".stars" --mask ".carousel"
 */
export function parseMaskSelectors(args: string[]): string[] {
  const selectors: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mask" && args[i + 1]) {
      for (const s of args[i + 1].split(",")) {
        const trimmed = s.trim();
        if (trimmed) selectors.push(trimmed);
      }
    }
  }
  return selectors;
}
