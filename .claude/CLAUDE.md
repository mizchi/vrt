# vrt — Project Skills

## VLM モデルベンチマークの更新方法

### 目的
VRT diff 画像の分析に使う VLM (Vision Language Model) のコスパを定期的に評価する。

### 手順

1. **モデル一覧を確認** (OpenRouter API から動的取得):
```bash
just vlm-bench --list --max-cost 0.001 --limit 30
```

2. **候補モデルで fix-loop を実行** (hard case: seed 11):
```bash
VRT_VLM_MODEL="<model-id>" node --experimental-strip-types src/fix-loop.ts \
  --fixture page --seed 11 --mode selector --max-rounds 2
```

3. **VLM 単体の品質計測** (トークン数, レイテンシ, CHANGE 検出数):
```bash
just vlm-bench <model1> <model2> <model3> --md
```

4. **結果を `docs/knowledge.md` の「VLM モデル比較」セクションに更新**

5. **レポートを `docs/reports/` に保存**:
```bash
# ファイル名: YYYY-MM-DD-vlm-model-benchmark-vN.md
```

### 評価基準
- Fix Loop: seed 11 (`.readme-body pre` 6 props, 4.1% diff) で FIXED になるか
- 速度: VLM レイテンシ (1-10s が許容範囲)
- コスト: /call (目安: $0.5e-7 以下が cheap)
- CHANGE 検出数: 構造化フォーマットに従った変更数 (7-15 が適正)

### 現在の推奨 (2026-04-04)
- **デフォルト**: `meta-llama/llama-4-scout` (1.0s, $0.14e-7)
- **安定**: `amazon/nova-lite-v1` (2.3s, $0.14e-7)
- **高品質**: `amazon/nova-2-lite-v1` (3.5s, $1.38e-7)

## CSS Challenge ベンチマークの実行

### 全 fixture 横断マトリクス
```bash
NO_IMAGES=1 node --experimental-strip-types src/css-challenge-bench.ts \
  --fixture all --mode selector --trials 10 --no-db
```

### Crater prescanner ベンチ (crater サーバー起動必要)
```bash
# crater 起動
cd ~/ghq/github.com/mizchi/crater && just build-bidi && just start-bidi-with-font

# ベンチ実行
just css-bench-crater --fixture page --trials 30
```

### 検出率の追跡
```bash
just css-report  # 蓄積データの集計
```

## Migration VRT の実行

```bash
# Tailwind → vanilla CSS
just migration-tailwind

# Reset CSS 比較
just migration-reset

# ファイル比較
vrt compare before.html after.html

# URL 比較
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/

# マスク付き (動的コンテンツ除外)
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/ --mask ".marquee-container,.hero-badge"
```

## Snapshot (URL → multi-viewport キャプチャ)

```bash
# 初回: baseline 作成。2回目以降: baseline と diff
vrt snapshot http://localhost:3000/ http://localhost:3000/about/ --output snapshots/

# マスク付き (アニメーション等の動的要素を除外)
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"
```

## Dogfooding

```bash
# luna.mbt (requires: npx serve ~/ghq/.../luna.mbt/dist -p 4200)
just dogfood-luna

# sol.mbt (requires: npx serve ~/ghq/.../sol.mbt/website/dist-docs -p 3000)
just dogfood-sol

# False positive テスト (同一 URL を 2 回比較)
just false-positive http://localhost:3000/luna/
```

## Fix Loop の実行

```bash
# Property mode (1 CSS プロパティ削除)
just fix-loop --fixture page --seed 42

# Selector mode (1 セレクタブロック削除)
just fix-loop --fixture page --seed 11 --mode selector --max-rounds 3

# 特定の VLM モデルを指定
VRT_VLM_MODEL="meta-llama/llama-4-scout" just fix-loop --fixture page --seed 11 --mode selector
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
| `DEBUG_VRT` | デバッグログ有効化 | — |

## ドキュメント構成

| ファイル | 内容 |
|---------|------|
| `docs/knowledge.md` | 実験知見の蓄積 (検出率, VLM 比較, Fix パターン等) |
| `docs/api-design.md` | CLI / ライブラリ API 設計 |
| `docs/crater-css-status.md` | Crater CSS レンダリング検証状況 |
| `docs/reset-css-comparison.md` | Reset CSS ドメイン知識 |
| `docs/reports/` | 個別実験レポート (日付付き) |
| `TODO.md` | Done / Evaluation / Backlog |
