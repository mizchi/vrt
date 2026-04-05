# vrt — Architecture

## CLI コマンド体系

エントリポイント: `src/vrt.ts`

```
vrt compare <before> <after>           # HTML/URL の VRT 比較
vrt compare --url <url> --current-url <url>  # URL モード
vrt snapshot <url1> [url2] ...         # URL → multi-viewport キャプチャ + baseline diff
vrt bench [options]                    # CSS challenge ベンチマーク
vrt report                             # 蓄積データのレポート
vrt discover <file>                    # breakpoint 発見 + viewport 提案
vrt smoke <file-or-url>                # A11y-driven ランダム操作テスト
vrt serve [--port 3456]                # API サーバー
vrt status [--url ...]                 # サーバーヘルスチェック
```

## モジュール構成

```
src/
├── vrt.ts                      # CLI エントリポイント (サブコマンド分岐)
│
├── [検出パイプライン]
│   ├── heatmap.ts              # pixelmatch v7 + heatmap 生成
│   ├── computed-style-capture.ts # getComputedStyle キャプチャ (ブラウザ内実行)
│   ├── a11y-semantic.ts        # a11y ツリー diff
│   └── image-resize.ts         # VLM 用 PNG リサイズ (IHDR ヘッダ読み取り)
│
├── [CSS Challenge]
│   ├── css-challenge-core.ts   # CSS パース, computed style, VRT 分析
│   ├── css-challenge-bench.ts  # ベンチマークランナー
│   ├── css-challenge.ts        # 単発 recovery challenge
│   └── css-challenge-fixtures.ts # fixture パス解決
│
├── [AI Fix パイプライン]
│   ├── vrt-reasoning-pipeline.ts # 2段階 VLM + LLM パイプライン
│   ├── fix-loop.ts             # CSS 破壊 → 分析 → 修正 → 検証ループ
│   ├── vlm-client.ts           # OpenRouter / Gemini VLM クライアント
│   └── llm-client.ts           # マルチプロバイダ LLM クライアント
│
├── [Migration VRT]
│   ├── migration-compare.ts    # HTML/URL 比較 (breakpoint 自動発見)
│   ├── migration-fix-loop.ts   # migration diff の自動修正
│   └── migration-fix-candidates.ts # 修正候補生成
│
├── [Snapshot]
│   ├── snapshot.ts             # URL → multi-viewport キャプチャ + baseline diff
│   └── mask.ts                 # セレクタベース visibility マスキング
│
├── [検出パターン分析]
│   ├── detection-classify.ts   # CSS プロパティ/セレクタ分類
│   ├── detection-db.ts         # JSONL 永続化
│   └── detection-report.ts     # 蓄積データ集計
│
├── [Viewport]
│   └── viewport-discovery.ts   # @media breakpoint 抽出 + viewport 生成
│
├── [Crater 統合]
│   └── crater-client.ts        # Crater BiDi WebSocket クライアント
│
├── [API]
│   ├── api-server.ts           # Hono API サーバー
│   ├── api-types.ts            # API 型定義
│   └── vrt-client.ts           # TypeScript クライアント SDK
│
├── [共通ユーティリティ]
│   ├── terminal-colors.ts      # ANSI カラー定数 + hr()
│   ├── cli-args.ts             # CLI 引数パーサ (getArg, hasFlag, getArgValues)
│   └── types.ts                # 共通型定義
│
├── [Smoke Test]
│   └── smoke-runner.ts         # A11y-driven ランダム操作
│
├── [Approval]
│   ├── approval.ts             # 差分承認ルール
│   └── vrt-approve.ts          # 対話的承認 CLI
│
└── [flaker 連携]
    ├── flaker-vrt-runner.ts    # flaker custom runner protocol
    └── flaker-vrt-report-adapter.ts # migration-report → flaker 変換
```

## 検出シグナル

| シグナル | 実装 | 検出率 (単体) | 備考 |
|---------|------|-------------|------|
| Pixel diff | pixelmatch v7 | 77% | 全プロパティ対象、色・サイズ・位置 |
| Computed style diff | getComputedStyle | 73% | hover/focus 含む |
| A11y tree diff | accessibility snapshot | 7% | 構造変更のみ |
| Multi-viewport | breakpoint ±1px | +16% | media query 境界で検出 |
| Hover emulation | :hover ルール常時有効化 | +6% | hover-only プロパティ |
| Paint tree diff | Crater BiDi | 60% | レイアウトツリー比較 |
| **Combined** | | **96.7%** | 9 fixtures, selector mode |

## AI Fix パイプライン

```
Heatmap (PNG) + CSS text diff
    │
    ▼
  Stage 1: VLM (安い — llama-4-scout $0.14e-7)
    │  画像 → 構造化 CHANGE レポート
    ▼
  Stage 2: LLM (正確 — Gemini)
    │  構造化レポート + CSS source + CSS diff → FIX 提案
    ▼
  セレクタ検証フィルタ (存在しないセレクタの fix を除外)
    │
    ▼
  Dry-run 検証 (fix 適用 → VRT → 悪化なら rollback)
```

## マスキング

動的コンテンツ (アニメーション, カウンタ, 外部データ) の false positive を防ぐ。

```bash
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"
vrt compare --url http://a.com --current-url http://b.com --mask ".ads"
```

仕組み: `page.addStyleTag()` で `visibility: hidden !important` を注入。
レイアウトは維持されるため、周囲の要素に影響しない。

## TypeScript

- `tsconfig.json`: `strict: true`, `verbatimModuleSyntax: true`
- 実行: `node --experimental-strip-types` (esbuild/tsx 不使用)
- ブラウザ内実行コード (`computed-style-capture.ts`): `/// <reference lib="dom" />`
