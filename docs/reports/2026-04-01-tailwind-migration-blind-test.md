# 実験: Tailwind → vanilla CSS ブラインド移行テスト

**日付**: 2026-04-01
**目的**: after.html を見せずに、before.html (Tailwind) + VRT diff だけから vanilla CSS を書けるか？

## 実験設計

1. Tailwind CDN で構築されたダッシュボード (`before.html`) を用意
2. HTML 構造のみ・CSS ゼロの `after-blank.html` を用意
3. subagent に以下だけを渡す:
   - `before.html` のソース (Tailwind utility classes が見える)
   - `after-blank.html` (CSS を書く対象)
   - VRT diff 結果 (pixel diff % と heatmap)
4. **after.html (既存の vanilla CSS 版) は見せない**
5. VRT ループで diff を下げさせる

## 結果

### diff 推移

| Iteration | wide (1440) | desktop (1280) | bp-above (769) | mobile (375) | 操作 |
|-----------|-------------|----------------|----------------|--------------|------|
| 0 (CSS なし) | 1.6% | 1.7% | 4.1% | 36.7% | — |
| 1 (初回 CSS) | 0.3% | 0.3% | 1.2% | 0.6% | Tailwind クラスの CSS 変換 |
| 2 (微調整) | 0.3% | 0.3% | 1.2% | 0.7% | font-smoothing 調整 |
| 3 (最終) | **0.0%** | **0.0%** | **0.0%** | **0.0%** | td:last-child の font-size 修正 |

**3 ラウンドで全 7 viewport pixel-perfect (0.0%) 達成。**

### エージェントの行動

- **58 回のツール呼び出し** (632 秒)
- 4 回の VRT 実行 (migration-compare)
- before.html を読んで Tailwind クラスを CSS に変換
- VRT heatmap を読んで差分の原因を特定
- 反復的に CSS を修正

### 発見された知見

#### 1. Tailwind Preflight の再現が最大の課題

Tailwind CDN v3.4.17 の Preflight は公式ドキュメントと微妙に異なる:
- `-webkit-font-smoothing: antialiased` が CDN 版では**適用されない** (公式 Preflight にはある)
- font-family が短い: `ui-sans-serif, system-ui, sans-serif` (Roboto 等なし)

**教訓**: Tailwind のバージョンと配布形式 (CDN vs PostCSS) で Preflight が異なる。DevTools の computed style を見るのが正確。

#### 2. line-height が最も重要な変換ルール

Tailwind の `text-*` クラスは font-size **と** line-height をセットで指定する:

| Tailwind class | font-size | line-height |
|---------------|-----------|-------------|
| `text-xs` | 0.75rem | 1rem |
| `text-sm` | 0.875rem | 1.25rem |
| `text-base` | 1rem | 1.5rem |
| `text-lg` | 1.125rem | 1.75rem |
| `text-xl` | 1.25rem | 1.75rem |
| `text-2xl` | 1.5rem | 2rem |

vanilla CSS で font-size だけ指定すると line-height が body の `1.5` を継承し、1 行あたり数 px の差が累積する。

**教訓**: Tailwind 脱却で最初にやるべきは line-height マッピングテーブルの作成。

#### 3. 部分適用の罠 (td:last-child)

最後まで残った diff の原因:
- before.html: `<td class="px-6 py-4 text-sm">` が最初の 3 列だけ。最後の列 (Status) には `text-sm` がない
- 初回の CSS: `td { font-size: 0.875rem }` で全列に適用 → Status 列が 2px 短くなる
- 修正: `td:not(:last-child) { font-size: 0.875rem; line-height: 1.25rem; }`

**教訓**: Tailwind のクラスは要素ごとに異なる。一括変換するとき「適用されていない要素」に注意。

#### 4. VRT heatmap が差分原因の特定に有効

エージェントは heatmap 画像から:
- テーブル行の高さ差 (2px/行 × 3 行 = 6px 累積) を特定
- font-smoothing の有無による全面的な微小 diff を特定
- breakpoint 境界での nav 表示/非表示の差異を特定

**教訓**: pixel diff の % だけでなく、heatmap の spatial pattern が原因特定の手がかりになる。

## vrt の評価

| 評価項目 | 結果 |
|---------|------|
| **after を見ずに CSS を書けるか** | ✓ 可能。before.html の Tailwind クラスから CSS を生成 |
| **VRT ループで diff を下げられるか** | ✓ 3 ラウンドで 0.0% 到達 |
| **何が難しいか** | line-height, 部分適用 (一部の要素にだけクラスが付いている), Preflight のバージョン差異 |
| **何が簡単か** | レイアウト (flex, grid), 色, spacing (padding/margin), border |
| **エージェントの効率** | 58 tool calls / 632s。人間なら数時間かかる作業を ~10 分 |
| **再現性** | seed なし (LLM の判断)。同じ結果を得られるかは保証されない |

## 結論

**vrt は「CSS 移行の自動化」に十分な精度の検証基盤を提供する。**

before (移行元) のソースコードと VRT diff だけがあれば、after (移行先) のコードをエージェントが生成し、pixel-perfect な移行を達成できることを実証した。

このアプローチが効く条件:
- HTML 構造が類似している (クラス名は変わっても DOM 構造は同じ)
- CSS-only の変更 (JavaScript の振る舞い変更は VRT では検証できない)
- 静的なページ (animation, hover 等の状態は別途検証が必要)
