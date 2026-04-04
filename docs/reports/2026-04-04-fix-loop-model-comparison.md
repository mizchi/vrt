# Fix Loop モデル比較

**日付**: 2026-04-04
**テストケース**: page fixture, seed 11, `.readme-body pre` (6 props) 削除, selector mode
**難易度**: 高 (4.1% diff, コードブロック全体の background/border/border-radius/padding/overflow/margin)

## 結果

| VLM モデル | ラウンド | 最終 diff | 合計時間 | コスト |
|-----------|---------|----------|---------|--------|
| **qwen3-vl-8b** | **1** | **0.0%** | 8.6s | ~FREE |
| **nova-lite** | **1** | **0.0%** | 8.4s | ~FREE |
| **qwen3-vl-32b** | **1** | **0.0%** | 9.5s | ~FREE |
| gemini-2.0-flash | 3 | 0.0% | 16.4s | ~FREE |

**全モデル FIXED。** CSS diff を Stage 2 に直接渡す改善により、VLM の画像分析品質に依存しなくなった。

## 分析

### なぜ全モデルで成功するか

1. **CSS テキスト diff が正解を含んでいる**: `MISSING: .readme-body pre { background: #f6f8fa }` 等
2. **Stage 2 (LLM) が CSS diff から直接 fix を生成**: VLM の画像分析は参考情報にすぎない
3. **セレクタ検証フィルタ**: VLM が間違ったセレクタを提案しても除外
4. **ドライラン + ロールバック**: 悪化する fix は適用されない

### gemini-2.0-flash が 3 ラウンドかかった理由

- Round 1: LLM が CSS diff の MISSING 行を fix に変換できなかった (0 fixes)
- Round 2: 11 fixes 提案したが @media ルールも変更 → 47.8% に悪化 → ロールバック
- Round 3: フィルタで 5 件除外 → 6 fixes 適用 → 0.0%

### VLM の実際の貢献

CSS diff が存在する場合、VLM の画像分析は**あまり重要ではない**。
VLM が本当に必要なのは:
- CSS diff がない場合 (元の CSS が不明)
- diff の原因が CSS ではなく HTML 構造の変更
- 視覚的な品質判定 (色のコントラスト、レイアウトの美しさ等)

## 推奨構成

| 用途 | VLM | LLM | 理由 |
|------|-----|-----|------|
| **高速 fix (CSS diff あり)** | any (nova-lite 推奨) | qwen3-vl-8b | CSS diff があれば VLM 品質は不問 |
| **CSS diff なし** | qwen3-vl-8b or qwen3-vl-32b | Gemini/Claude | VLM 品質が重要 |
| **コスト重視** | nova-lite | qwen3-vl-8b | 最安、十分な品質 |
