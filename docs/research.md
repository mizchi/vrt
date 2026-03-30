# VRT (Visual Regression Testing) + AI 調査メモ

## 動機

VRT で検出した差分を AI でリーズニングし、自己修復を行うアーキテクチャを検討する。
ただしコストが高いため、以下で最適化したい:

1. **依存ツリー解析** — 変更の影響範囲を絞り込み、スナップショット対象を最小化
2. **意図とのすり合わせ** — commit/PR の変更意図と視覚差分を照合し、期待通りの変更を自動承認

---

## 1. 既存ツール・プラグインの状況

### AI-Powered VRT (商用)

| ツール | アプローチ | 特徴 |
|--------|-----------|------|
| **Applitools Eyes** | 独自 Visual AI (CV ベース) | UI をセマンティックに理解。レンダリングノイズを無視。最も成熟 |
| **Percy Visual Review Agent** (BrowserStack) | スマートハイライト + 説明文生成 | 「ヘッダーが4px左にずれた」等の自然言語差分。偽陽性40%削減。人間承認は必要 |
| **Meticulous AI** | セッションリプレイ | ユーザ操作を記録→再生。静的スクリーンショットではなくフロー単位 |
| **TestMu SmartUI** | ピクセル + ヒューリスティクス | ルールベースの Smart Ignore (フォントレンダリング等) |

### 依存ツリー対応 VRT

| ツール | アプローチ | 特徴 |
|--------|-----------|------|
| **Chromatic TurboSnap** | Webpack/Vite Stats → モジュール依存グラフ | 変更ファイル → 影響 Story をマッピング。60-90% のスナップショット削減。**唯一の実装** |

### OSS VRT ツール (ピクセルベース)

- **Playwright** built-in VRT (pixelmatch)
- **Lost Pixel** — Storybook/Ladle 対応
- **BackstopJS** — ビューポート/シナリオ設定
- **reg-suit / reg-cli** — CI 統合・レポート生成
- **Visual-Regression-Tracker** — セルフホスト。実験的 VLM サポートあり

### ギャップ (未開拓領域)

1. **LLM ベース VRT リーズニング**: スクリーンショット差分を Vision LLM に送り判定する OSS ツールは**存在しない**
2. **依存ツリー対応 VRT**: Chromatic TurboSnap の独占。Vite 単独や任意フレームワークで使える OSS 代替なし
3. **Intent-aware VRT**: コミットメッセージ/PR 記述から変更意図を抽出し、視覚差分と照合する仕組みは**完全に未開拓**

---

## 2. 関連論文

### VRT 方法論・最適化

- Moradi et al. (2024) — **"AI for Context-Aware Visual Change Detection"** [arXiv:2405.00874](https://arxiv.org/abs/2405.00874)
  - YOLOv5 で UI コントロールを検出 → グラフ構築 → 空間的文脈から意味のある変更を判定。ピクセル/リージョン比較より優秀
- Web Application Testing Survey (2024) [arXiv:2412.10476](https://arxiv.org/abs/2412.10476)
  - 2014-2023 の Web テスト研究サーベイ

### 依存対応テスト選択

- **DIRTS** (ICST 2023) — DI フレームワーク対応の Regression Test Selection
- **Lam et al.** (ISSTA 2020) — 順序依存テストの優先付け・選択・並列化。依存対応アルゴリズムで失敗 80% 削減
- **CORTS/C2RTS** (2025, J. Systems Architecture) — コンポーネントベース RTS。モジュールレベル依存グラフ

### Self-Healing テスト自動化

- Chede & Tijare (2025, IJRASET) — **"AI-Driven Self-Healing UI Testing with Visual Proof"**
  - DOM ベースのヒーリングとセマンティック視覚検証の統合
- Self-Healing Test Automation with AI/ML (2024) — RL + 画像認識 + 動的ロケータ
- **SHML** (NeurIPS 2024) [arXiv:2411.00186](https://arxiv.org/abs/2411.00186) — 自律的診断・修復フレームワーク

### LLM/Vision モデル × テスト

- **Wang et al.** (TSE 2024) — LLM × ソフトウェアテスト 102 研究のサーベイ [arXiv:2307.07221](https://arxiv.org/abs/2307.07221)
- **VisionDroid** (2024) [arXiv:2407.03037](https://arxiv.org/abs/2407.03037) — マルチモーダル LLM で GUI 探索 + 非クラッシュバグ検出
- **Make LLM a Testing Expert** (ICSE 2024) — 機能認識に基づくモバイル GUI テスト
- **RepairAgent** (ICSE 2025) — LLM ベースの自律プログラム修復エージェント
- Yu et al. (ACM Computing Surveys, 2025) — Vision-Based Mobile GUI Testing サーベイ [arXiv:2310.13518](https://arxiv.org/abs/2310.13518)

### 参考リポジトリ

- [LLM4SoftwareTesting](https://github.com/LLM-Testing/LLM4SoftwareTesting) — LLM × テスト論文キュレーション
- [GUI-Agents-Paper-List](https://github.com/OSU-NLP-Group/GUI-Agents-Paper-List) — GUI エージェント論文一覧

---

## 3. 考察: 本プロジェクトへの適用可能性

### 構想: 依存ツリー + Intent-aware + AI リーズニングの統合

```
Code Change
    │
    ├─ 1. 依存ツリー解析 (低コスト)
    │     Vite モジュールグラフ / コンポーネント import 解析
    │     → 影響を受けるコンポーネント/ページを特定
    │     → VRT スナップショット対象を最小化 (TurboSnap 相当)
    │
    ├─ 2. Intent 抽出 (低〜中コスト)
    │     commit message / PR description を LLM でパース
    │     → 「ボタンの色を青→緑に変更」等の期待変更を構造化
    │
    ├─ 3. VRT 実行 (中コスト)
    │     最小化されたスナップショット対象のみ撮影・比較
    │
    └─ 4. AI リーズニング (高コスト、条件付き)
          Intent と一致する差分 → 自動承認
          Intent と不一致 or 予期しない差分 → Vision LLM で分析
          → 修復提案 or 人間レビューにエスカレート
```

### コスト最適化のポイント

1. **段階的フィルタリング**: 依存ツリー → Intent 照合 → AI 判定 の順で、安価なフィルタから先に適用
2. **AI 呼び出しの最小化**: 全差分を LLM に送るのではなく、自動承認できないものだけを AI に渡す
3. **キャッシュ**: 同一コンポーネントの類似差分パターンをキャッシュし、再判定を回避

### 技術的課題

- Vite モジュールグラフの取得方法 (TurboSnap は Webpack Stats API 依存)
- Intent 抽出の精度 (自然言語→構造化された期待変更の変換)
- Vision LLM のコスト vs 精度のトレードオフ
- self-healing の信頼性 (自動修復が意図しない変更を入れるリスク)

---

## 4. 次のステップ

- [ ] Vite プラグインとしての依存ツリー取得 PoC
- [ ] Playwright VRT + LLM リーズニングの最小プロトタイプ
- [ ] Intent 抽出プロンプトの設計
- [ ] コスト試算 (スナップショット数 × LLM API コスト)
