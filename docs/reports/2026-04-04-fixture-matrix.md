# Fixture 横断検出率マトリクス

**日付**: 2026-04-04
**条件**: selector mode, 10 trials/fixture, Chromium backend, 3 viewport (1440/1280/375)

## 結果

| Fixture | 宣言 | Sel | Any | Visual | CS | 未検出理由 |
|---------|------|-----|-----|--------|----|-----------|
| page | 237 | 73 | **100%** | 100% | 100% | — |
| blog-magazine | 227 | 69 | **100%** | 100% | 90% | — |
| dashboard | 276 | 81 | **100%** | 90% | 80% | — |
| stacking-context | 291 | 60 | **100%** | 70% | 70% | — |
| admin-panel | 301 | 92 | 90% | 80% | 70% | hover-only (:focus) |
| ecommerce-catalog | 308 | 90 | 90% | 80% | 80% | media-scoped |
| form-app | 228 | 73 | 90% | 80% | 80% | dead-code (.alert-success) |
| grid-complex | 245 | 71 | 90% | 60% | 60% | media-scoped (.stats grid) |
| landing-product | 278 | 81 | 90% | 80% | 80% | hover-only (:hover) |

**全体**: 9 fixture × 10 trials = 90 trials → 検出率 **94.4%** (85/90)

## 未検出パターン分析

| 理由 | 件数 | 例 | 対策 |
|------|------|---|------|
| **hover-only** | 2 | `:focus`, `:hover` のスタイル | hover emulation 改善 (breakpoint viewport でも hover 実行) |
| **media-scoped** | 2 | `@media (max-width: 640px)` 内の grid 変更 | 各 @media の breakpoint viewport をテスト対象に含める |
| **dead-code** | 1 | `.alert-success` (ページに success alert なし) | CSS rule usage tracking で除外 |

## 必要な機能

### 1. Breakpoint-aware media-scoped detection

現在: 3 viewport (1440/1280/375) 固定
問題: `@media (max-width: 640px)` のルールが 375px でのみ有効だが、640px 以下の複数 viewport でテストしていない

改善案:
- 各 `@media` ルールの条件を解析して、その条件が有効になる viewport を追加
- 例: `@media (max-width: 640px)` → 640px, 639px, 480px をテスト対象に

### 2. Fixture 横断レポート

現在: fixture ごとに個別にベンチ実行、結果は `bench-report.json` に上書き
問題: 全 fixture を並べて比較するにはコンソール出力を目視するしかない

改善案:
- `--fixture all` の結果をマトリクス形式で summary
- `data/fixture-matrix.jsonl` に蓄積
- `just css-report` にマトリクス表示を追加

### 3. 未検出理由の自動対策

| 理由 | 自動対策 |
|------|---------|
| hover-only | 検出時に自動 retry: hover emulation ON で再テスト |
| media-scoped | breakpoint 発見 → 条件に合う viewport を動的追加 |
| dead-code | computed style diff = 0 の場合、CSS rule usage API で確認 |

### 4. Difficulty scoring

fixture の難易度を定量化:
- `difficulty = 1 - (any_signal_rate)`
- `detection_diversity = visual_rate / computed_rate` (信号の冗長性)
- `fragility = media_scoped_count + hover_only_count` (環境依存の度合い)
