# Crater CSS レンダリング検証状況

> CSS challenge ベンチマーク (page fixture, 30 trial) の結果から分類。
> Crater BiDi サーバーで HTML をレンダリングし、CSS 1行削除の pixel diff で検出できるかを検証。

## サマリ

| 状態 | 件数 | 割合 | 説明 |
|------|------|------|------|
| **検出済み (verified)** | 15 | 50% | Chromium と同等に pixel diff で検出可能 |
| **未検出 (broken)** | 8 | 27% | Chromium では検出できるが crater では検出できない |
| **共通の限界 (out-of-scope)** | 7 | 23% | Chromium でも検出できない (dead-code, hover-only 等) |

## 検出済み (verified) — crater で正しくレンダリングされている CSS

| プロパティ | セレクタ例 | diff 率 | 備考 |
|-----------|-----------|---------|------|
| `padding` | `.readme-header` | 2-5% | spacing 正確 |
| `font-size` | `.tab`, `.sidebar-desc`, `.header-nav a` | 1-4% | テキストサイズ差が検出可能 |
| `color` | `.file-table .date`, `.tab` | <1% | 色変化を検出 |
| `display` | `.badge`, `.file-table .file-icon`, `.repo-badges` | 0-2% | 要素の表示/非表示 |
| `width` | `.file-table`, `.sidebar` | 1-2% | サイズ変化 |
| `height` | `.file-table .file-icon` | <1% | サイズ変化 |
| `border` | `.branch-btn` | <1% | ボーダー描画 |
| `margin` | `.main` | 4% | wide viewport でのみ検出 |
| `flex` | `.header-search` | <1% | flex レイアウト |

## 未検出 (broken) — crater のレンダリング精度に問題がある CSS

> これらは **Chromium では検出できるが crater ではできない**。
> crater 側の修正候補リスト。

| プロパティ | セレクタ | Chromium での検出 | 推定原因 |
|-----------|---------|-----------------|---------|
| `border-radius` | `.branch-btn` | ✓ (computed) | **border-radius のレンダリングが不正確** — 削除前後で pixel 差が出ない |
| `margin-bottom` | `.sidebar-desc` | ✓ (computed) | **margin のコラプシングまたは精度問題** |
| `margin-left` | `.tab-count` | ✓ (computed) | 同上 |
| `align-items` | `.branch-bar` | ✓ (computed) | **flexbox の align-items が正しくレンダリングされていない可能性** |
| `font-weight` | `.repo-name` | ✓ (computed) | **font-weight のレンダリングが不完全** (既知の問題: README に記載) |
| `text-decoration: none` | `.repo-name a`, `.header-nav a` | ✓ (computed) | **text-decoration の初期値が異なる** — crater ではデフォルトで underline なし? |
| `color` | `.footer a` | ✓ (computed) | **一部の color 変更が検出されない** |

### broken の詳細分析

1. **border-radius**: crater の paint backend で border-radius が正確に描画されていない可能性。削除しても見た目が変わらない = 元々 border-radius が効いていない。

2. **margin / spacing 系**: `margin-bottom`, `margin-left` — computed style では差が出るが pixel では差が出ない。crater のレイアウトエンジンがこれらのプロパティを正確に反映していない。

3. **font-weight**: README.md に「Font-weight CSS compute incomplete for `<b>` and `<strong>` tags」と記載されている既知の問題。font-weight 変更の視覚的影響が crater では再現されない。

4. **text-decoration**: README.md に「Text-decoration underline not implemented」と記載。text-decoration: none を削除しても、crater ではそもそも underline が描画されないため差分が出ない。

5. **align-items**: flexbox の cross-axis alignment。layout テスト 89.2% なので一部の align-items ケースが未サポートの可能性。

## 共通の限界 (out-of-scope)

| 理由 | 件数 | 例 |
|------|------|---|
| dead-code | 3 | `.readme-body code { background }` (pre code で上書き)、`.footer a { color }` |
| hover-only | 2 | `.footer a:hover { text-decoration }` |
| same-as-default | 1 | `.file-table .file-name a { text-decoration: none }` |
| same-as-parent | 1 | `.readme-header { background: #f6f8fa }` |
| content-dependent | 2 | `white-space: nowrap`, `flex-wrap: wrap` |

## CSS 機能別の対応状況

| CSS 機能 | Crater 状態 | 備考 |
|---------|------------|------|
| **display: flex** | ✓ verified | flexbox レイアウト全般は動作 |
| **display: none** | ✓ verified | 要素の表示/非表示 |
| **width / height** | ✓ verified | サイズ計算正確 |
| **padding** | ✓ verified | spacing 正確 |
| **color** | △ partial | 一部のセレクタで検出漏れ |
| **font-size** | ✓ verified | テキストサイズ変化を検出 |
| **flex** | ✓ verified | flex: 1 等の比率計算 |
| **border** | ✓ verified | ボーダー描画 |
| **margin** | △ partial | margin collapse / 小さい margin で不正確 |
| **border-radius** | ✗ broken | pixel diff で差が出ない |
| **font-weight** | ✗ broken | README に既知の問題として記載 |
| **text-decoration** | ✗ broken | underline 未実装 (README 記載) |
| **align-items** | ✗ broken | cross-axis alignment の一部で不正確 |

## crater 改善の優先順位

1. **text-decoration** (高) — 未実装。CSS challenge で 5/30 が text-decoration 関連
2. **border-radius** (高) — paint backend の修正が必要
3. **font-weight** (中) — `<b>`/`<strong>` 以外の font-weight 変更も影響
4. **margin 精度** (中) — margin-bottom/margin-left の小さい値で不正確
5. **align-items** (低) — 影響範囲が限定的
