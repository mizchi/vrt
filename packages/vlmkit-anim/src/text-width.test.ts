/**
 * The width estimate against headless Chromium (14px, `system-ui, sans-serif`, the renderer's font stack),
 * measured 2026-09-07 with `getComputedTextLength`. CJK glyphs are exactly one em; the old estimate gave
 * them 0.6 and every Japanese label overflowed its box while `layout` reported nothing.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { labelWidth, wrapText } from "./compile/builder.ts";
import { compileScene } from "./compile/index.ts";
import { layoutReport } from "./layout.ts";
import { wrapCaption } from "./render-svg.ts";
import { breakPieces, glyphEm, textEm, textWidth } from "./text-width.ts";
import type { ModulesScene } from "./types.ts";

/** [text, measured px at 14px]. */
const MEASURED: [string, number][] = [
  ["core", 30.3],
  ["animation-eval", 104.8],
  ["Application services", 140.1],
  ["MEASUREMENT", 108.2],
  ["0123456789", 89.1],
  ["在庫", 28.0],
  ["決済サービス", 84.0],
  ["ゲートウェイ", 84.0],
  ["フロントエンド", 98.0],
  ["注文を記録する", 98.0],
  ["依存は内向きに", 98.0],
  ["在庫→DB", 60.1],
  ["支払い (queue)", 101.2],
  ["「禁止」", 56.0],
  ["→", 11.7],
  ["✗", 11.7],
  ["🚀 deploy", 68.6],
  ["Ａ Ｂ Ｃ", 50.9],
  ["한국어 모듈", 74.5],
  ["混合 mixed テキスト", 135.8],
];

describe("text width: the estimate against Chromium", () => {
  it("CJK, fullwidth and emoji glyphs are one em; Latin is estimated at 0.6 em (a safe over-estimate)", () => {
    for (const [text, px] of MEASURED) {
      const est = textWidth(text, 14, 0.6);
      // Never under by more than 4% (a box that is too narrow is the defect); never over by more than a third.
      assert.ok(est >= px * 0.96, `${JSON.stringify(text)}: estimated ${est.toFixed(1)}px, Chromium drew ${px}px`);
      assert.ok(est <= px * 1.34, `${JSON.stringify(text)}: estimated ${est.toFixed(1)}px for ${px}px drawn — too generous`);
    }
    // Pure CJK is exact, not merely within tolerance.
    for (const text of ["在庫", "決済サービス", "フロントエンド", "注文を記録する", "「禁止」"]) assert.equal(textWidth(text, 14), [...text].length * 14);
  });

  it("glyph classes: wide, symbol, zero-width, Latin", () => {
    assert.equal(glyphEm("漢", 0.6), 1);
    assert.equal(glyphEm("あ", 0.6), 1);
    assert.equal(glyphEm("한", 0.6), 1);
    assert.equal(glyphEm("Ａ", 0.6), 1);
    assert.equal(glyphEm("🚀", 0.6), 1);
    assert.equal(glyphEm("→", 0.6), 0.85);
    assert.equal(glyphEm("✗", 0.6), 0.85);
    assert.equal(glyphEm("‍", 0.6), 0);
    assert.equal(glyphEm("a", 0.6), 0.6);
    assert.equal(glyphEm("a", 0.55), 0.55);
    assert.equal(glyphEm("M", 0.6), 0.7);
    assert.equal(glyphEm("7", 0.6), 0.7);
    // The widest line counts, and lines are split on \n.
    assert.equal(textEm("ab\n漢字漢", 0.6), 3);
  });

  it("labelWidth pads by 1.6 em and never shrinks below 3 em, in any script", () => {
    assert.equal(labelWidth("在庫", 14), 2 * 14 + 1.6 * 14);
    assert.equal(labelWidth("db", 14), Math.max(2 * 0.6 * 14 + 1.6 * 14, 3 * 14));
    assert.ok(labelWidth("在庫管理サービス", 14) > labelWidth("inventory-svc", 14), "eight CJK glyphs are wider than thirteen Latin ones");
  });

  it("wrapping: at spaces where there are any, between glyphs for spaceless CJK, never inside a Latin word", () => {
    assert.deepEqual(breakPieces("a b"), { pieces: ["a", "b"], glue: " " });
    assert.deepEqual(breakPieces("在庫"), { pieces: ["在", "庫"], glue: "" });
    assert.deepEqual(breakPieces("supercalifragilistic"), { pieces: ["supercalifragilistic"], glue: "" });
    const ja = wrapText("支払いと注文の両方がここで非同期になる", 13, 160);
    assert.ok(ja.includes("\n"), ja);
    for (const line of ja.split("\n")) assert.ok(labelWidth(line, 13) <= 160, line);
    assert.equal(ja.replace(/\n/g, ""), "支払いと注文の両方がここで非同期になる");
    const cap = wrapCaption("この二本の非同期な依存が結果整合性の理由になっている", 200, 14, 3);
    assert.ok(cap.length >= 2 && cap.length <= 3, cap.join("|"));
    assert.equal(cap.join(""), "この二本の非同期な依存が結果整合性の理由になっている");
    assert.deepEqual(wrapCaption("short", 200, 14, 3), ["short"]);
  });

  it("a Japanese module map: every box is at least as wide as its glyphs, and the geometry is clean", () => {
    const scene: ModulesScene = {
      format: "vlmkit-anim/scene@1",
      kind: "modules",
      title: "注文処理の依存関係",
      modules: [
        { id: "web", label: "ストアフロント" },
        { id: "gateway", label: "APIゲートウェイ" },
        { id: "checkout", label: "決済フロー" },
        { id: "inventory", label: "在庫管理サービス" },
        { id: "db", label: "データベース" },
      ],
      deps: [["web", "gateway"], ["gateway", "checkout"], ["checkout", "inventory"], ["inventory", "db"]],
      groups: [{ id: "domain", label: "ドメイン層（業務ロジック）", modules: ["checkout", "inventory"] }],
      sequence: [{ callout: { at: "db", text: "支払いと注文の両方がここで非同期になる" }, ms: 0 }],
    };
    const tl = compileScene(scene);
    for (const m of scene.modules) {
      const id = typeof m === "string" ? m : m.id;
      const label = typeof m === "string" ? m : m.label!;
      const box = tl.nodes.find((n) => n.id === id)!;
      // The glyphs at 14px (CJK one em, Latin 0.6), plus at least 8px of padding on each side — the old estimate
      // gave 「在庫管理サービス」 a box of 80px for 112px of glyphs.
      assert.ok(box.size![0] >= textWidth(label, 14) + 16, `${label}: box ${box.size![0]}px for ${textWidth(label, 14)}px of glyphs`);
      if (!/[A-Za-z]/.test(label)) assert.ok(box.size![0] >= [...label].length * 14 + 16, label);
    }
    const r = layoutReport(tl);
    assert.equal(r.totals.framesWithIssues, 0);
  });
});
