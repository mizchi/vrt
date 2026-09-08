/**
 * How wide a text is, without a browser.
 *
 * Every estimate in this package counted characters and multiplied by 0.6 em (0.55 in the
 * layout geometry). Measured in headless Chromium at 14px with `system-ui, sans-serif`
 * (v15): Latin averages 0.50–0.55 em per glyph (0.28 for `i`, 0.99 for `W`), so 0.6 is a
 * safe estimate — and every CJK glyph is exactly 1.00 em: 「在庫」, 「決済サービス」,
 * 「フロントエンド」, 「注文を記録する」 all measured 14px per character. A Japanese label
 * was therefore placed at 60% of its width, and `layout` called the picture clean while the
 * glyphs ran into the next box. Hangul measured 0.89 with its spaces, fullwidth forms 1.00,
 * arrows and ✗ 0.84, emoji 1.00.
 *
 * This is the one place the per-glyph width is decided. Callers choose the Latin em (the
 * compiler's 0.6, the geometry's 0.55) and get the wide glyphs at their own width either way.
 */

/** East Asian Wide and Fullwidth (Hangul Jamo, CJK radicals / symbols / kana / unified ideographs, Hangul, compatibility, fullwidth forms), plus emoji: one em each. */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿︰-﹏！-｠￠-￦\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;
/** Arrows, math, enclosed alphanumerics, geometric shapes and dingbats: wider than a letter, narrower than a CJK glyph (→ and ✗ measured 0.84). */
const SYMBOL = /[←-⇿∀-⋿①-⓿■-➿⬀-⯿]/u;
/** Combining marks, zero-width joiners and variation selectors take no width of their own. */
const ZERO = /[̀-ͯ​-‍︀-️\u{E0100}-\u{E01EF}]/u;

/** Capitals and digits measured 0.64–0.70 em where lowercase averages 0.53: a tenth more than the Latin em. */
const TALL = /[A-Z0-9]/;

/** The width of one glyph in em, given the em a Latin glyph is assumed to take. */
export function glyphEm(ch: string, latin: number): number {
  if (ZERO.test(ch)) return 0;
  if (WIDE.test(ch)) return 1;
  if (SYMBOL.test(ch)) return 0.85;
  if (TALL.test(ch)) return latin + 0.1;
  return latin;
}

/** The width of a text's widest line in em. `latin` is the em per Latin glyph (0.6 in the compiler, 0.55 in the geometry). */
export function textEm(text: string, latin = 0.6): number {
  let widest = 0;
  for (const line of String(text).split("\n")) {
    let em = 0;
    for (const ch of line) em += glyphEm(ch, latin);
    widest = Math.max(widest, em);
  }
  return widest;
}

/** `textEm` in pixels at a font size. */
export function textWidth(text: string, fontSize: number, latin = 0.6): number {
  return textEm(text, latin) * fontSize;
}

/**
 * Where a text may be broken when it has to wrap: at spaces when it has any; between glyphs when it is CJK
 * without spaces (Japanese has none to break at); nowhere for a single Latin word, which stays whole.
 */
export function breakPieces(text: string): { pieces: string[]; glue: string } {
  if (/\s/.test(text)) return { pieces: text.split(/\s+/), glue: " " };
  if (WIDE.test(text)) return { pieces: [...text], glue: "" };
  return { pieces: [text], glue: "" };
}
