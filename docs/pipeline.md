# VRT + Semantic Verification Pipeline

## Overall Design

Generate 3 independent diff sources in parallel and cross-validate them.

```mermaid
graph TB
  subgraph Input["Input Sources"]
    GIT["Git Diff<br/>(code change)"]
    PW["Playwright Execution"]
  end

  subgraph Parallel["Parallel Pipelines"]
    direction TB

    subgraph Track_Intent["Track 1: Diff Intent"]
      GIT --> PARSE_DIFF["Parse Unified Diff"]
      PARSE_DIFF --> DEP_GRAPH["Dependency Graph<br/>(TS / MoonBit / Rust)"]
      DEP_GRAPH --> AFFECTED["Affected Components"]
      PARSE_DIFF --> INTENT["Change Intent<br/>Heuristic or LLM"]
    end

    subgraph Track_Visual["Track 2: Visual Semantic Diff"]
      PW --> SCREENSHOT["Screenshots<br/>(current + baseline)"]
      SCREENSHOT --> PIXEL_DIFF["Pixel Diff<br/>(pixelmatch)"]
      PIXEL_DIFF --> HEATMAP["Heatmap +<br/>Region Detection"]
      HEATMAP --> VIS_SEM["Visual Semantic Diff<br/>- Region classification (text/icon/layout/color)<br/>- Nature of change (added/removed/moved/restyled)"]
    end

    subgraph Track_A11y["Track 3: Accessibility Semantic Diff"]
      PW --> A11Y_TREE["A11y Tree Snapshot<br/>(current + baseline)"]
      A11Y_TREE --> A11Y_DIFF["A11y Tree Diff<br/>- Node added/removed/changed<br/>- role, name, state changes"]
      A11Y_DIFF --> A11Y_SEM["A11y Semantic Diff<br/>- ARIA contract validation<br/>- Navigation structure changes<br/>- Label/landmark consistency"]
    end
  end

  subgraph Merge["Cross-Validation"]
    VIS_SEM --> CROSS["Cross-Validation<br/>Visual ↔ A11y consistency check"]
    A11Y_SEM --> CROSS
    INTENT --> JUDGE["Unified Verdict Engine"]
    AFFECTED --> JUDGE
    CROSS --> JUDGE
    JUDGE --> VERDICTS["Verdicts<br/>(approve / reject / escalate)"]
  end

  subgraph Quality["Quality Gate"]
    VERDICTS --> QC["Quality Checks"]
    QC --> WH["Whiteout detection"]
    QC --> ERR["Error state detection"]
    QC --> COV["VRT + A11y coverage"]
    QC --> A11Y_REG["A11y regression<br/>(missing role, lost label)"]
    QC --> REPORT["Verification Report"]
  end

  style Track_Intent fill:#e8f4f8,stroke:#2196F3
  style Track_Visual fill:#fff3e0,stroke:#FF9800
  style Track_A11y fill:#e8f5e9,stroke:#4CAF50
  style Merge fill:#f3e5f5,stroke:#9C27B0
  style Quality fill:#fce4ec,stroke:#E91E63
```

## Cross-Validation Matrix

Cross-reference Visual Diff and A11y Diff to determine change validity.

| Visual Diff | A11y Diff | Intent Match | Verdict |
|-------------|-----------|-------------|---------|
| None | None | any | **Auto-approve** (no change) |
| Yes | Yes | Yes | **Auto-approve** (as expected) |
| Yes | Yes | No | **Escalate** (unintended change) |
| Yes | None | style | **Approve** (visual-only change, semantics preserved) |
| Yes | None | refactor | **Warning** (refactor but visual changed) |
| None | Yes | any | **Reject** (same visually but semantics broken) |
| any | regression | any | **Reject** (A11y regression) |

## Data Flow Details

### Visual Semantic Diff

Classify the "meaning" of pixel differences:
- **text-change**: Changes in text regions (OCR-based detection)
- **color-change**: Color-only changes (shape unchanged)
- **layout-shift**: Element position movement
- **element-added**: New element appeared
- **element-removed**: Element disappeared
- **icon-change**: Icon/image changes

### Accessibility Semantic Diff

Structural diff of the A11y tree:
- **node-added**: New a11y node
- **node-removed**: Node disappeared (regression candidate)
- **role-changed**: role attribute changed
- **name-changed**: accessible name changed
- **state-changed**: aria-* state changed
- **structure-changed**: Tree structure changed (parent-child relationships)
- **landmark-changed**: Landmark changes (<nav>, <main>, etc.)

### Diff Intent

Intent inferred from code changes:
- **feature**: New feature → visual + a11y additions expected
- **bugfix**: Bug fix → only the fix target should change
- **refactor**: Refactor → no visual/a11y changes expected
- **style**: Style change → visual changes expected, no a11y changes
- **a11y**: Accessibility improvement → a11y changes expected, minimal visual changes
