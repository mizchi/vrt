# Reset CSS 比較 — VRT による実測データ

## 概要

normalize.css をベースラインとして、3 つの reset CSS variant を VRT で比較した。
共通の HTML コンテンツ (見出し、リスト、フォーム、テーブル、画像、footer) に、同一のアプリケーション CSS を適用。

## 比較結果

| Variant | diff (desktop) | diff (mobile) | drop-in 置換 |
|---------|---------------|---------------|-------------|
| **modern-normalize** | 0.9% | 2.6% | ✓ 可能 (1行修正) |
| **no-reset** (ブラウザデフォルト) | 1.7% | 3.6% | △ 条件付き |
| **destyle** | 6.8% | 12.0% | ✗ 不可 |

## 各 variant の差分原因

### normalize.css → modern-normalize

**diff: 0.9-2.6%** — 最も近い。

差分の原因:
1. **`box-sizing: border-box` のグローバル適用** — modern-normalize は `*, ::before, ::after` に `border-box` を設定。normalize.css はしない。form 要素 (input, textarea) の幅が border + padding 分変わる
2. **`h1` の margin** — normalize.css は `h1 { margin: 0.67em 0 }` を設定。modern-normalize はこれを持たない。アプリ CSS が `margin-bottom` のみ設定している場合、`margin-top` が異なる

修正 (0% にするため):
```css
/* normalize → modern-normalize 移行時に追加 */
h1 { margin-top: 0.67em; }
```

box-sizing の差は一般的に modern-normalize の方が正しい (CSS の現代的なベストプラクティス)。
意図的な差異として approve するのが妥当。

### normalize.css → ブラウザデフォルト (no-reset)

**diff: 1.7-3.6%** — moderate。

差分の原因:
1. **form 要素の font** — normalize.css は `font-family: inherit; font-size: 100%; line-height: 1.15` を設定。ブラウザデフォルトでは input/select に独自のフォントが使われる
2. **`h1` の margin** — ブラウザデフォルトの h1 margin は normalize の `0.67em` より大きい
3. **`pre` のフォント** — normalize.css の `font-family: monospace, monospace` (ダブルでブラウザの quirk を回避) がない
4. **`hr` の box-sizing** — normalize.css が明示的に `content-box` を設定

### normalize.css → destyle

**diff: 6.8-12.0%** — 大幅に異なる。**drop-in 置換は不可能。**

差分の原因:
1. **`list-style: none`** — リストマーカー (・, 1. 2. 3.) がすべて消える。アプリ CSS が `list-style` を設定していない限り、リストがプレーンテキストになる
2. **heading のリセット** — `font-size: inherit; font-weight: inherit` で見出しが本文と同じサイズ/太さになる。アプリ CSS で明示的に設定していれば問題ないが、normalize.css のデフォルトに依存しているセレクタが壊れる
3. **`appearance: none`** — checkbox, radio, select のネイティブ描画が消える。カスタム form コンポーネントを使っている場合のみ許容される
4. **`margin: 0` on all elements** — p, blockquote, pre, table, form のデフォルト margin がゼロになる。アプリ CSS が `margin-bottom` のみ設定している場合、`margin-top` の差が累積する
5. **`text-decoration: none` on `a`** — リンクの下線が消える

destyle は normalize.css の代替ではなく、CSS をゼロから書く前提の opinionated reset。normalize.css からの移行には、normalize.css が提供していたすべてのデフォルトをアプリ CSS に移す必要がある。

## 推奨

### normalize.css → modern-normalize

**推奨**。同じ哲学 (normalize, not reset)。差異は `box-sizing` と `h1` margin のみ。

移行チェックリスト:
1. `h1 { margin-top: 0.67em }` を追加 (または既にアプリ CSS で margin を明示指定していれば不要)
2. `box-sizing: border-box` で form 要素の幅が変わらないか確認
3. VRT で全 viewport をチェック

### normalize.css → destyle

**非推奨 (drop-in)**。移行する場合は:
1. リストに `list-style` を追加
2. 見出しに `font-size` / `font-weight` を追加
3. form 要素に `appearance: auto` を追加 (ネイティブ描画が必要な場合)
4. リンクに `text-decoration: underline` を追加
5. 全ブロック要素に margin を明示指定

これは normalize.css を再実装するのとほぼ同義。destyle を採用するなら、最初から destyle 前提で CSS を書くべき。

## VRT の知見

- **mobile では差分が増大する** — responsive CSS の差異 + 垂直方向の累積ズレ
- **breakpoint 境界 (640px ±1) のテストが重要** — media query の切り替わりで差分が変わる
- **form 要素が最も差分に敏感** — reset CSS の違いが最も影響するのは input/select/textarea
