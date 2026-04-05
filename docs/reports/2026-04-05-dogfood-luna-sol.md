# E1: luna.mbt / sol.mbt Dogfooding レポート

**日付**: 2026-04-05
**テスト**: VRT snapshot (URL → 複数 viewport キャプチャ) の false positive 率

## テスト環境

- luna.mbt: `npx serve dist/ -p 4200` (6 デモページ × 2 viewport = 12 スクリーンショット)
- sol.mbt: `npx serve website/dist-docs/ -p 3000` (5 ドキュメントページ × 2 viewport = 10 スクリーンショット)
- Viewport: desktop (1280x900), mobile (375x812)
- 方式: 1 回目 baseline 作成 → 2 回目 diff 計測

## False Positive 結果

### luna.mbt (静的デモページ)

| ページ | Desktop | Mobile |
|--------|---------|--------|
| todomvc | 0.0% | 0.0% |
| spa | 0.0% | 0.0% |
| wc | 0.0% | 0.0% |
| apg-playground | 0.0% | 0.0% |
| browser_router | 0.0% | 0.0% |
| css_split_test | 0.0% | 0.0% |

**False positive 率: 0/12 (0.0%)**

### sol.mbt (静的ドキュメントサイト)

**マスクなし:**

| ページ | Desktop | Mobile |
|--------|---------|--------|
| / (root) | **0.32%** | **0.04%** |
| /luna/ | 0.0% | 0.0% |
| /luna/tutorial-js/islands/ | 0.0% | 0.0% |
| /sol/ | 0.0% | 0.0% |
| /benchmark/ | 0.0% | 0.0% |

False positive 率: 2/10 (20.0%)

**`--mask ".marquee-container,.hero-badge"` 適用後:**

| ページ | Desktop | Mobile |
|--------|---------|--------|
| / (root) | 0.0% | 0.0% |

**False positive 率: 0/10 (0.0%)**

### sol.mbt root ページの false positive 原因分析

Heatmap の diff ピクセル Y 座標分布:
- y=1150-1400 に 96% 集中 → **`.marquee-container` (ツイートカードの横スクロールアニメーション)**
- y=150-250 に残り 4% → **`.hero-badge` (アニメーション付きバッジ)**

`.marquee-container` は CSS `@keyframes` で常時横スクロールしているため、キャプチャタイミングで位置が変わる。
`--mask` で `visibility: hidden` にすることでレイアウトを維持しつつ描画を消し、diff 0.0% を達成。

## `--mask` 機能

`vrt snapshot` と `vrt compare` の両方に `--mask` オプションを追加:

```bash
# セレクタをカンマ区切りで指定
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"

# 複数 --mask フラグも可
vrt compare --url http://example.com --current-url http://example.com \
  --mask ".marquee-container" --mask ".hero-badge"
```

仕組み: `page.addStyleTag()` で `visibility: hidden !important` を注入。
レイアウトは維持されるため、周囲の要素に影響しない。

## 結論

| プロジェクト | ページ数 | FP (素) | FP (マスク後) | マスク対象 |
|-------------|---------|---------|-------------|-----------|
| luna.mbt | 6 | 0% | 0% | なし |
| sol.mbt | 5 | 20% | **0%** | `.marquee-container`, `.hero-badge` |

**全 22 スクリーンショットで false positive 0%** (マスク適用後)。
動的コンテンツのマスクはセレクタ指定で対応可能。
