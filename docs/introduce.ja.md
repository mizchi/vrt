# vrt — Visual Regression Testing ツールキット

## vrt とは

vrt は、Web ページの見た目の変化を検出・分析するためのコマンドラインツールです。

ピクセル単位の画像比較だけでなく、computed style の差分、アクセシビリティツリーの差分、AI による CSS 自動修正まで一貫して扱えます。Playwright ベースで動作し、ローカルの HTML ファイルとライブ URL の両方に対応しています。

## 主なユースケース

- **CSS リファクタリング前後の検証** — Tailwind → vanilla CSS、Reset CSS 切り替えなど
- **UI ライブラリのバージョンアップ** — shadcn/ui → 自作コンポーネントなど
- **クロスレンダラ比較** — Chromium vs Crater (独自レンダリングエンジン)
- **CI での自動回帰検出** — PR ごとに差分を計測し false positive 率を管理

## インストール

```bash
git clone https://github.com/mizchi/vrt.git
cd vrt
pnpm install
```

Playwright のブラウザも必要です:

```bash
npx playwright install chromium
```

## 基本的な使い方

### 1. ファイル比較 (`vrt compare`)

2つの HTML ファイルを複数の viewport で比較します。

```bash
# 2ファイルを比較
vrt compare before.html after.html

# ディレクトリ指定 + 複数バリアント
vrt compare --dir fixtures/migration/reset-css \
  --baseline normalize.html \
  --variants modern-normalize.html destyle.html
```

自動でレスポンシブブレイクポイントを検出し、境界値 ±1px を含む viewport セットを生成します。

### 2. URL 比較 (`vrt compare --url`)

ライブサーバーの URL を直接比較できます。

```bash
# 2つの URL を比較
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/

# 動的コンテンツをマスク
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/ \
  --mask ".marquee-container,.hero-badge"
```

### 3. スナップショット (`vrt snapshot`)

URL を定期的にキャプチャし、前回の baseline と比較します。

```bash
# 初回: baseline を作成。2回目以降: baseline との差分を計測
vrt snapshot http://localhost:3000/ http://localhost:3000/about/ --output snapshots/

# マスク指定
vrt snapshot http://localhost:3000/ --mask ".animated-banner"
```

出力ディレクトリに PNG (desktop / mobile) と JSON レポートが保存されます。

### 4. 要素単位比較 (`vrt elements`)

フルページの比較ではヘッダの高さが変わるだけで全体がシフトし、大きな差分として検出されてしまいます。要素単位比較はこの問題を解決します。

```bash
# 要素ごとに個別比較（カスケードシフトの影響を排除）
vrt elements --url http://localhost:3000/ --current-url http://localhost:8080/ \
  --selectors "header,main,footer,.sidebar"

# ファイルモード
vrt elements before.html after.html --selectors "header,main,.content"

# viewport 指定
vrt elements --url http://localhost:3000/ --current-url http://localhost:8080/ \
  --selectors "header,main" --viewport 375x812
```

**仕組み**: Playwright の `locator.screenshot()` で各要素を個別にキャプチャし、要素単位で pixelmatch を実行します。フルページ diff との比較により、カスケードシフトによるノイズをどれだけ除去できたかを表示します。

### 5. スモークテスト (`vrt smoke`)

アクセシビリティツリーを使って、ページ上のインタラクティブ要素をランダムに操作します。

```bash
# HTML ファイル
vrt smoke page.html --max-actions 20 --seed 42

# URL
vrt smoke --url https://example.com --mode reasoning
```

コンソールエラー、未キャッチ例外、クラッシュを監視します。seed 指定で再現可能です。

## マスク機能

アニメーション、カウンタ、広告など動的コンテンツによる false positive を防ぐため、特定のセレクタを非表示にできます。

```bash
vrt snapshot http://localhost:3000/ --mask ".carousel,.ad-banner,.live-counter"
```

`visibility: hidden !important` を注入するため、レイアウトへの影響はありません。要素は非表示になりますが、占有するスペースは維持されます。

## CSS チャレンジベンチマーク

CSS プロパティやセレクタブロックを1つ削除し、各検出手法がその変更を検出できるかを計測します。

```bash
# プロパティ削除モード
just css-bench --fixture page --trials 30

# セレクタブロック削除モード
just css-bench --fixture page --mode selector --trials 30

# 全フィクスチャ横断
just css-bench --fixture all --trials 10

# 検出率レポート
just css-report
```

現在の検出率: Chromium 96.7% (scoped)

## AI Fix パイプライン

CSS の破壊を検出し、AI が修正を生成して検証するループです。

```bash
# Fix ループ（CSS 破壊 → VLM 分析 → LLM 修正 → 検証）
just fix-loop --fixture page --seed 42

# セレクタモード + VLM 指定
VRT_VLM_MODEL="meta-llama/llama-4-scout" just fix-loop --fixture page --seed 11 --mode selector
```

2段階パイプライン:
1. **VLM** (安価): スクリーンショットから構造化された CHANGE レポートを生成
2. **LLM** (高精度): CHANGE レポートから CSS 修正コードを生成

修正は dry-run で検証し、改善しない場合はロールバックします。

## API サーバー

プログラムから vrt を利用するための HTTP API です。

```bash
# サーバー起動
vrt serve --port 3456

# ヘルスチェック
vrt status --url http://localhost:3456
```

エンドポイント:
- `POST /api/compare` — HTML/URL 比較
- `POST /api/compare-renderers` — クロスレンダラ比較
- `POST /api/smoke-test` — スモークテスト
- `GET /api/status` — サーバーステータス

TypeScript クライアント SDK (`src/vrt-client.ts`) も用意しています。

## Crater 連携

[Crater](https://github.com/mizchi/crater) は MoonBit で実装された CSS レイアウトエンジンです。vrt は WebSocket (BiDi プロトコル) 経由で Crater と連携し、以下の機能を提供します:

- **Paint tree diff**: ピクセルではなくレイアウトツリーレベルで比較
- **プリスキャナ**: Crater で事前スクリーニングし、差分がある場合のみ Chromium で詳細比較 (1.66x 高速化)
- **ブレイクポイント検出**: CSS ルールの viewport マッピングによる正確なブレイクポイント発見

```bash
# Crater 起動（別ターミナル）
cd ~/ghq/github.com/mizchi/crater && just build-bidi && just start-bidi-with-font

# Crater プリスキャナ付きベンチマーク
just css-bench-crater --fixture page --trials 30
```

## 環境変数

| 変数 | 用途 | デフォルト |
|------|------|----------|
| `VRT_LLM_PROVIDER` | LLM プロバイダ (gemini / anthropic) | gemini |
| `VRT_LLM_MODEL` | LLM モデル | プロバイダのデフォルト |
| `VRT_VLM_MODEL` | VLM モデル (OpenRouter) | qwen/qwen3-vl-8b-instruct |
| `OPENROUTER_API_KEY` | OpenRouter API キー | -- |
| `GEMINI_API_KEY` | Google AI API キー | -- |
| `ANTHROPIC_API_KEY` | Anthropic API キー | -- |
| `DEBUG_VRT` | デバッグログ有効化 | -- |

## CLI コマンド一覧

```
vrt compare <before> <after>              ファイル比較
vrt compare --url <url> --current-url <url>  URL 比較
vrt elements --selectors <s1,s2> [opts]   要素単位比較
vrt snapshot <url1> [url2] ...            スナップショット + baseline 差分
vrt bench [options]                       CSS チャレンジベンチマーク
vrt report                                検出パターンレポート
vrt discover <file>                       ブレイクポイント検出
vrt smoke <file-or-url>                   スモークテスト
vrt serve [--port N]                      API サーバー
vrt status [--url URL]                    サーバーヘルスチェック
```

## プロジェクト構成

```
src/
  vrt.ts                    CLI エントリポイント
  element-compare.ts        要素単位比較
  snapshot.ts               URL スナップショット + baseline 差分
  migration-compare.ts      HTML/URL 比較 (ブレイクポイント自動検出)
  css-challenge-bench.ts    CSS 削除/復元ベンチマーク
  fix-loop.ts               AI Fix ループ
  vrt-reasoning-pipeline.ts 2段階 VLM + LLM パイプライン
  heatmap.ts                ピクセル差分 + ヒートマップ生成
  mask.ts                   セレクタベースのマスキング
  vlm-client.ts             OpenRouter / Gemini VLM クライアント
  llm-client.ts             マルチプロバイダ LLM クライアント
  crater-client.ts          Crater BiDi WebSocket クライアント
  api-server.ts             Hono API サーバー
  smoke-runner.ts           A11y 駆動スモークテスト
fixtures/
  css-challenge/            CSS ベンチ用 HTML フィクスチャ (9種)
  migration/                Migration 比較用フィクスチャ
  element-compare/          要素単位比較用フィクスチャ
docs/
  knowledge.md              実験知見の蓄積
  reports/                  日付付き実験レポート
```

## ライセンス

MIT
