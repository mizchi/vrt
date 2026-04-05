# vrt — CLI / ライブラリ API 設計

## 現状の問題

- CLI が 8 本あるが命名に統一性がない (`css-challenge`, `migration-compare`, `demo`, `vrt-demo-fix` ...)
- ライブラリモジュールが 15+ あるが public API が不明確
- `css-challenge-core.ts` に Playwright 依存・crater 依存・CSS パーサー・LLM クライアントが混在
- 型定義が `types.ts` と各モジュールに散在

## 設計方針

### CLI: `vrt` サブコマンド体系

1 つのエントリポイント (`vrt`) にサブコマンドをぶら下げる。

```
vrt compare <before> <after>         # 2 ファイルの VRT 比較
vrt compare --url <url> --current-url <url>  # URL モード
vrt snapshot <url1> [url2] ...       # URL → multi-viewport キャプチャ + baseline diff
vrt bench [options]                   # CSS challenge ベンチマーク
vrt report                           # 蓄積データのレポート
vrt discover <file>                  # breakpoint 発見 + viewport 提案
vrt smoke <file-or-url>              # A11y-driven ランダム操作テスト
vrt serve [--port 3456]              # API サーバー
vrt status [--url ...]               # サーバーヘルスチェック
```

### ライブラリ: 3 層構造

```
┌─────────────────────────────────────────────┐
│  CLI Layer (src/cli/)                       │
│  vrt compare, vrt bench, vrt report, ...    │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Core Layer (src/core/)                     │
│  純粋なロジック。ブラウザ依存なし            │
│                                             │
│  ├── css-parser.ts      CSS パース/変換     │
│  ├── diff.ts            pixel diff, paint tree diff │
│  ├── classify.ts        プロパティ分類      │
│  ├── viewport.ts        breakpoint 発見     │
│  ├── approval.ts        差分承認ルール      │
│  ├── a11y.ts            a11y ツリー diff     │
│  └── types.ts           全型定義            │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Backend Layer (src/backend/)               │
│  ブラウザ/レンダラー依存                    │
│                                             │
│  ├── chromium.ts        Playwright wrapper  │
│  ├── crater.ts          Crater BiDi client  │
│  └── interface.ts       共通インターフェース │
└─────────────────────────────────────────────┘
```

## CLI 詳細

### `vrt compare`

2 つの HTML (または URL) を比較。breakpoint 自動発見 + multi-viewport。

```bash
# ファイル比較
vrt compare before.html after.html

# ディレクトリ比較 (baseline + variants)
vrt compare --baseline normalize.html --variants modern.html destyle.html

# URL 比較
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/

# オプション
vrt compare before.html after.html \
  --backend chromium           # chromium | crater | both
  --max-viewports 10           # viewport 上限
  --random-samples 2           # breakpoint 間のランダムサンプル数
  --no-discover                # breakpoint 自動発見を無効化
  --approval approval.json     # 承認ルールファイル
  --output-dir path            # 結果出力先ディレクトリ
  --mask ".ads,.carousel"      # セレクタマスキング (visibility: hidden)
```

### `vrt snapshot`

URL を複数 viewport でキャプチャし、前回 baseline と自動比較。

```bash
# 初回: baseline 作成。2回目以降: diff 計測
vrt snapshot http://localhost:3000/ http://localhost:3000/about/

# オプション
vrt snapshot <url1> [url2] ... \
  --output snapshots/          # 出力ディレクトリ
  --mask ".marquee,.badge"     # 動的コンテンツのマスキング
```

### `vrt bench`

CSS challenge ベンチマーク。CSS 1行削除 → 検出率計測。

```bash
vrt bench                                    # デフォルト (page fixture, 20 trial)
vrt bench --fixture dashboard --trials 50    # fixture + trial 数指定
vrt bench --backend crater                   # crater バックエンド
vrt bench --all                              # 全 fixture 一括
vrt bench --no-db                            # DB に保存しない
```

### `vrt report`

蓄積データの分析。

```bash
vrt report                     # 全データ
vrt report --fixture page      # fixture 別
vrt report --backend crater    # backend 別
```

### `vrt discover`

HTML/CSS から breakpoint を発見し、テスト用 viewport を提案。

```bash
vrt discover page.html
# Output:
#   Breakpoints: min-width:640px, min-width:768px, min-width:1024px
#   Suggested viewports (11):
#     375px (mobile)
#     639px (below 640px breakpoint)
#     640px (at 640px breakpoint)
#     ...
```

### `vrt demo`

デモ実行。

```bash
vrt demo              # 基本デモ
vrt demo fix          # fix ループ
vrt demo multi        # マルチシナリオ
vrt demo multistep    # マルチステップ
```

## ライブラリ API

### Core Layer (ブラウザ非依存)

```typescript
// --- css-parser ---
import { parseCssDeclarations, removeCssProperty, applyCssFix, extractCss } from "vrt/core/css-parser";

// --- diff ---
import { compareImages, diffComputedStyles } from "vrt/core/diff";
import { diffPaintTrees } from "vrt/core/diff";

// --- classify ---
import { categorizeProperty, classifySelectorType, classifyUndetectedReason, isOutOfScope } from "vrt/core/classify";

// --- viewport ---
import { extractBreakpoints, generateViewports, discoverViewports } from "vrt/core/viewport";

// --- a11y ---
import { diffA11yTrees, checkA11yTree } from "vrt/core/a11y";

// --- types ---
import type { CssDeclaration, ViewportSpec, Breakpoint, DetectionRecord, ... } from "vrt/core/types";
```

### Backend Layer (ブラウザ依存)

```typescript
// --- 共通インターフェース ---
import type { RenderBackend, CapturedState } from "vrt/backend/interface";

// --- Chromium ---
import { ChromiumBackend } from "vrt/backend/chromium";
const backend = new ChromiumBackend();
await backend.init();
const state = await backend.capture(html, viewport);
await backend.close();

// --- Crater ---
import { CraterBackend } from "vrt/backend/crater";
const backend = new CraterBackend("ws://127.0.0.1:9222");
await backend.init();
const state = await backend.capture(html, viewport);
await backend.close();
```

### Backend インターフェース

```typescript
interface RenderBackend {
  name: string;                  // "chromium" | "crater"
  
  init(): Promise<void>;
  close(): Promise<void>;
  
  /** HTML をレンダリングしてスクリーンショット + メタデータを取得 */
  capture(html: string, viewport: ViewportSpec, options?: CaptureOptions): Promise<CapturedState>;
  
  /** 利用可能か確認 */
  isAvailable(): Promise<boolean>;
}

interface CaptureOptions {
  captureHover?: boolean;        // hover 状態もキャプチャ
  capturePaintTree?: boolean;    // paint tree (crater only)
  captureA11y?: boolean;         // a11y tree
  captureComputedStyles?: boolean; // computed style
  screenshotPath?: string;       // PNG 保存先
}

interface CapturedState {
  screenshotPath: string;
  a11yTree?: A11yNode;
  computedStyles?: Map<string, Record<string, string>>;
  hoverComputedStyles?: Map<string, Record<string, string>>;
  paintTree?: PaintNode;         // crater only
}
```

## 移行パス

現状のファイルから新構造への対応:

| 現在 | 新構造 | 備考 |
|------|--------|------|
| `src/css-challenge-core.ts` | 分割: `core/css-parser.ts` + `core/diff.ts` + `backend/chromium.ts` + `backend/crater.ts` | 最大のリファクタリング対象 |
| `src/detection-classify.ts` | `core/classify.ts` | ほぼそのまま |
| `src/detection-db.ts` | `core/db.ts` | ほぼそのまま |
| `src/viewport-discovery.ts` | `core/viewport.ts` | ほぼそのまま |
| `src/heatmap.ts` | `core/diff.ts` | pixel diff 部分 |
| `src/a11y-semantic.ts` | `core/a11y.ts` | ほぼそのまま |
| `src/crater-client.ts` | `backend/crater.ts` | PaintNode/diff は `core/diff.ts` へ |
| `src/types.ts` | `core/types.ts` | 統合 |
| `src/css-challenge.ts` | `cli/challenge.ts` | CLI エントリ |
| `src/css-challenge-bench.ts` | `cli/bench.ts` | CLI エントリ |
| `src/detection-report.ts` | `cli/report.ts` | CLI エントリ |
| `src/migration-compare.ts` | `cli/compare.ts` | CLI エントリ |
| `src/demo*.ts` | `cli/demo.ts` | 統合 |

## 現時点では

リファクタリングは後回し。まず:
1. この設計ドキュメントを正とする
2. 新機能は新構造に合わせて追加
3. 既存コードは動いているのでそのまま
4. npm パッケージ化するタイミングで一括リファクタ
