# VRT + Semantic Verification — Agent Skill Guide

## 概要

Visual Regression Testing (VRT) とアクセシビリティセマンティクス検証を組み合わせた、
コーディングエージェント向けの品質保証ツール。

変更が視覚的にもセマンティック（a11y）にも意図通りであることを自動検証し、
リグレッションを検出・修復するループを回す。

## CLI コマンド

すべて **プロジェクトルート** から実行する。サーバーが起動している前提。

```bash
# サーバー起動（別ターミナル）
just serve

# 初回: ベースライン作成
just vrt-init

# 変更後: スナップショット取得 → 検証
just vrt-capture
just vrt-verify
# または一括
just vrt

# 変更を承認: スナップショットを新ベースラインに昇格
just vrt-approve

# レポート確認
just vrt-report

# 影響範囲確認
just vrt-affected
```

## エージェントのワークフロー

### 基本ループ

```
┌─────────────────────────────────────────────┐
│ 1. just vrt-init (初回のみ)                  │
└─────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 2. コード変更を実施                           │
│    - commit message に意図を明記              │
│      (feat: / fix: / style: / refactor: /   │
│       a11y: / deps:)                        │
└─────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 3. just vrt                                  │
│    (= capture + verify)                      │
└─────────┬───────────────────────────────────┘
          │
     ┌────┴────────────────┐
     │                     │
   PASS               FAIL/ESCALATE
     │                     │
     ▼                     ▼
┌──────────┐    ┌─────────────────────┐
│ 4a.      │    │ 4b. just vrt-report │
│ approve  │    │     → 問題を特定     │
│ (任意)   │    │     → コード修正     │
└──────────┘    │     → 3 に戻る       │
                └─────────────────────┘
```

### 検証パイプライン（自動で実行される）

```
変更 ─→ 3 トラック並列実行:

Track 1: Diff Intent    — git diff + commit message → 変更意図を推測
Track 2: Visual Diff    — ピクセル比較 → ヒートマップ → 領域分類
Track 3: A11y Diff      — a11y ツリー差分 → セマンティック変化検出

→ Cross-Validation (3つの突き合わせ):

| Visual | A11y  | Intent  | → 判定               |
|--------|-------|---------|----------------------|
| なし    | なし   | any     | APPROVE (変化なし)    |
| あり    | あり   | match   | APPROVE (期待通り)    |
| あり    | あり   | none    | ESCALATE (意図不明)   |
| あり    | なし   | style   | APPROVE (見た目のみ)  |
| あり    | なし   | refac   | ESCALATE (意図しない) |
| なし    | あり   | a11y    | APPROVE (a11y 改善)  |
| なし    | あり   | other   | REJECT (セマンティクス破壊) |
| any    | regr   | any     | REJECT (a11y リグレ)  |

→ Quality Gate:
  - 白飛び検出 (画面が真っ白)
  - エラー状態検出 (赤い警告表示)
  - 空コンテンツ検出
  - A11y リグレッション (ラベル消失、ランドマーク削除)
  - VRT カバレッジ
```

## exit code

| code | 意味 |
|------|------|
| 0    | PASS — 変化なし、または全て approved |
| 1    | FAIL — reject された変更あり、または品質エラー |

escalate は exit 0 だが警告が出る。

## commit message の書き方

検証パイプラインは commit message から変更意図を推測する。
意図が正しく推測されると、期待通りの視覚変化は自動承認される。

```
feat: ダークモードトグル追加       → visual + a11y の追加が期待される
fix: モバイルでのレイアウト崩れ修正  → 修正対象のみの変化が期待される
refactor: ユーティリティ関数抽出    → visual/a11y ともに変化なしが期待される
style: ボタンの色を青→緑に変更     → visual 変化あり、a11y 変化なしが期待される
a11y: フォームにラベルを追加       → a11y 変化あり、visual 変化は最小限
deps: React 19 にアップデート      → visual/a11y ともに変化なしが期待される
```

## レポートの読み方

`just vrt-report` で出力される情報:

```
[APPROVE] home
  Diff matches expected change: "color change" (confidence: 80%)

[REJECT] settings
  A11y regression detected: Removed button "Delete"

[ESCALATE] profile
  Visual change during refactor — appearance changed unexpectedly
```

- **APPROVE**: 期待通りの変更。問題なし。
- **REJECT**: リグレッション検出。必ず修正が必要。
- **ESCALATE**: 判断が分かれる変更。人間レビューまたは追加調査が必要。

## A11y チェックの活用

VRT verify は A11y ツリーも同時に検査する。以下が検出される:

- ボタン/リンクにラベルがない (`label-missing`)
- 画像に alt テキストがない (`img-alt-missing`)
- ランドマーク要素の削除 (`landmark-changed`)
- インタラクティブ要素の削除 (`node-removed`)
- role の不適切な変更 (`role-changed`)

リファクタリング中にこれらが検出された場合は、
セマンティクスが壊れている可能性が高い。

## ファイル構成

```
vrt/
├── SKILL.md                   ← このファイル
├── package.json               # 独立パッケージ
├── playwright.config.ts       # VRT 用 Playwright 設定
├── e2e/
│   └── vrt-capture.spec.ts    # スクリーンショット + a11y 収集
├── src/
│   ├── vrt-cli.ts             # CLI エントリポイント
│   ├── types.ts               # 全型定義
│   ├── playwright-analyzer.ts # Playwright 出力解析
│   ├── dep-graph.ts           # 依存ツリー (TS/MoonBit/Rust)
│   ├── heatmap.ts             # ピクセル比較 + ヒートマップ
│   ├── visual-semantic.ts     # Visual Semantic Diff 分類
│   ├── a11y-semantic.ts       # A11y ツリー差分 + 品質チェック
│   ├── cross-validation.ts    # Visual x A11y x Intent 突き合わせ
│   ├── intent.ts              # Diff → 変更意図の推測
│   ├── quality.ts             # 品質ゲート
│   └── agent.ts               # 5段階検証ループ
└── test-results/              # 実行結果 (gitignore 推奨)
    ├── baselines/             # ベースライン PNG + a11y JSON
    ├── snapshots/             # 最新スナップショット
    ├── output/                # ヒートマップ等の出力
    └── vrt-report.json        # 検証レポート
```

## トラブルシューティング

| 問題 | 対処 |
|------|------|
| "Is the server running?" | `just serve` でサーバーを起動 |
| "No baselines found" | `just vrt-init` を実行 |
| フォントレンダリングの差分 | pixelmatch の threshold を調整 (heatmap.ts) |
| a11y ツリーが null | ページのレンダリング完了を待つ (waitFor 調整) |
| 全部 ESCALATE になる | commit message に prefix をつける (feat:/fix:/style: 等) |
