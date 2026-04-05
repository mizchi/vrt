# vrt

Visual Regression Testing ツールキット — ピクセル差分、computed style 差分、a11y ツリー差分、AI による CSS 自動修正。

## 機能

- **ピクセル差分** — pixelmatch v7 + ヒートマップ生成
- **Computed style 差分** — `getComputedStyle` キャプチャ (hover/focus 含む)
- **A11y ツリー差分** — アクセシビリティスナップショット比較
- **CSS チャレンジベンチ** — CSS 削除/復元の自動化 (検出率 96.7%)
- **2段階 AI パイプライン** — VLM (画像→構造化差分) + LLM (差分→CSS 修正)
- **Migration VRT** — レスポンシブ viewport での HTML before/after 比較
- **スナップショット** — URL ベースの複数 viewport キャプチャ + baseline 差分
- **マスク** — セレクタベースのマスキング (アニメーション、カウンタ等の動的コンテンツ除外)
- **Crater 統合** — BiDi による軽量プリスキャナー (1.66x 高速化、偽陽性 0%)

## クイックスタート

```bash
pnpm install

# テスト実行 (341 テスト)
pnpm test

# 2つの HTML ファイルを比較
vrt compare before.html after.html

# 2つの URL を比較
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/

# URL のスナップショット (初回は baseline 作成、以降は差分計測)
vrt snapshot http://localhost:3000/ http://localhost:3000/about/ --output snapshots/

# 動的コンテンツをマスク
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"

# CSS チャレンジベンチマーク
just css-bench --fixture page --trials 30

# Fix ループ (CSS 破壊 → VLM 分析 → LLM 修正 → 検証)
just fix-loop --fixture page --seed 42
```

## CLI

```bash
vrt compare <before.html> <after.html>     # Migration VRT (ファイルまたは URL)
vrt snapshot <url1> [url2] ...             # 複数 viewport スナップショット + 差分
vrt bench [options]                         # CSS チャレンジベンチマーク
vrt report                                 # 検出パターンレポート
vrt smoke <file-or-url>                    # A11y 駆動ランダム操作テスト
vrt serve [--port 3456]                    # API サーバー
vrt status [--url http://localhost:3456]   # サーバーヘルスチェック
```

## 環境変数

| 変数 | 用途 | デフォルト |
|------|------|----------|
| `VRT_LLM_PROVIDER` | LLM プロバイダ | gemini |
| `VRT_LLM_MODEL` | LLM モデル | プロバイダのデフォルト |
| `VRT_VLM_MODEL` | VLM モデル (OpenRouter) | qwen/qwen3-vl-8b-instruct |
| `OPENROUTER_API_KEY` | OpenRouter API キー | — |
| `GEMINI_API_KEY` | Google AI API キー | — |
| `ANTHROPIC_API_KEY` | Anthropic API キー | — |

## ライセンス

MIT
