# VRT + Semantic Verification Pipeline

## 全体設計

3つの独立した Diff ソースを並列に生成し、統合検証で突き合わせる。

```mermaid
graph TB
  subgraph Input["入力ソース"]
    GIT["Git Diff<br/>(code change)"]
    PW["Playwright Execution"]
  end

  subgraph Parallel["並列パイプライン"]
    direction TB

    subgraph Track_Intent["Track 1: Diff Intent"]
      GIT --> PARSE_DIFF["Parse Unified Diff"]
      PARSE_DIFF --> DEP_GRAPH["Dependency Graph<br/>(TS / MoonBit / Rust)"]
      DEP_GRAPH --> AFFECTED["Affected Components"]
      PARSE_DIFF --> INTENT["Change Intent<br/>ヒューリスティック or LLM"]
    end

    subgraph Track_Visual["Track 2: Visual Semantic Diff"]
      PW --> SCREENSHOT["Screenshots<br/>(current + baseline)"]
      SCREENSHOT --> PIXEL_DIFF["Pixel Diff<br/>(pixelmatch)"]
      PIXEL_DIFF --> HEATMAP["Heatmap +<br/>Region Detection"]
      HEATMAP --> VIS_SEM["Visual Semantic Diff<br/>- 領域分類 (text/icon/layout/color)<br/>- 変化の性質 (added/removed/moved/restyled)"]
    end

    subgraph Track_A11y["Track 3: Accessibility Semantic Diff"]
      PW --> A11Y_TREE["A11y Tree Snapshot<br/>(current + baseline)"]
      A11Y_TREE --> A11Y_DIFF["A11y Tree Diff<br/>- ノード追加/削除/変更<br/>- role, name, state 変化"]
      A11Y_DIFF --> A11Y_SEM["A11y Semantic Diff<br/>- ARIA 契約の検証<br/>- ナビゲーション構造変化<br/>- ラベル/ランドマーク整合性"]
    end
  end

  subgraph Merge["統合検証"]
    VIS_SEM --> CROSS["Cross-Validation<br/>Visual ↔ A11y 整合性チェック"]
    A11Y_SEM --> CROSS
    INTENT --> JUDGE["Unified Verdict Engine"]
    AFFECTED --> JUDGE
    CROSS --> JUDGE
    JUDGE --> VERDICTS["Verdicts<br/>(approve / reject / escalate)"]
  end

  subgraph Quality["品質ゲート"]
    VERDICTS --> QC["Quality Checks"]
    QC --> WH["白飛び検出"]
    QC --> ERR["エラー状態検出"]
    QC --> COV["VRT + A11y カバレッジ"]
    QC --> A11Y_REG["A11y リグレッション<br/>(role欠損, label消失)"]
    QC --> REPORT["Verification Report"]
  end

  style Track_Intent fill:#e8f4f8,stroke:#2196F3
  style Track_Visual fill:#fff3e0,stroke:#FF9800
  style Track_A11y fill:#e8f5e9,stroke:#4CAF50
  style Merge fill:#f3e5f5,stroke:#9C27B0
  style Quality fill:#fce4ec,stroke:#E91E63
```

## Cross-Validation マトリクス

Visual Diff と A11y Diff の突き合わせで、変更の妥当性を判定する。

| Visual Diff | A11y Diff | Intent Match | 判定 |
|-------------|-----------|-------------|------|
| なし | なし | any | **Auto-approve** (変化なし) |
| あり | あり | あり | **Auto-approve** (期待通り) |
| あり | あり | なし | **Escalate** (意図しない変更) |
| あり | なし | style | **Approve** (見た目のみの変更、セマンティクス維持) |
| あり | なし | refactor | **Warning** (リファクタなのに見た目が変化) |
| なし | あり | any | **Reject** (見た目は同じだがセマンティクス破壊) |
| any | regression | any | **Reject** (A11y リグレッション) |

## データフロー詳細

### Visual Semantic Diff

ピクセル差分の「意味」を分類:
- **text-change**: テキスト領域の変化 (OCR ベースの検出)
- **color-change**: 色のみの変化 (形状は同一)
- **layout-shift**: 要素の位置移動
- **element-added**: 新しい要素の出現
- **element-removed**: 要素の消失
- **icon-change**: アイコン/画像の変化

### Accessibility Semantic Diff

A11y ツリーの構造差分:
- **node-added**: 新しい a11y ノード
- **node-removed**: ノードの消失 (リグレッション候補)
- **role-changed**: role 属性の変化
- **name-changed**: accessible name の変化
- **state-changed**: aria-* 状態の変化
- **structure-changed**: ツリー構造の変化 (親子関係)
- **landmark-changed**: ランドマーク (<nav>, <main> 等) の変化

### Diff Intent

コード変更から推測される意図:
- **feature**: 新機能 → visual + a11y の追加が期待される
- **bugfix**: バグ修正 → 修正対象のみの変化が期待される
- **refactor**: リファクタ → visual/a11y ともに変化なしが期待される
- **style**: スタイル変更 → visual 変化あり、a11y 変化なしが期待される
- **a11y**: アクセシビリティ改善 → a11y 変化あり、visual 変化は最小限
