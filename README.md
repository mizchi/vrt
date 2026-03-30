# vrt-harness

Visual Regression Testing + Accessibility Semantic Verification harness for coding agents.

Detects visual and semantic regressions, reasons about whether changes match intent, and generates fix plans — with optional LLM-powered AI diagnosis.

## Quick Start

```bash
pnpm install

# Run 150 tests
pnpm test

# Run demos (kitty terminal graphics)
pnpm demo              # 5 basic scenarios
pnpm demo:fix          # detect → AI diagnose → fix → verify
pnpm demo:multi        # 3 complex scenarios
pnpm demo:multistep    # 6-step dashboard rebuild

# With AI reasoning
ANTHROPIC_API_KEY=sk-ant-... pnpm demo:fix
```

## Architecture

```
Code Change
    │
    ├── Track 1: Diff Intent (git diff → dep graph → affected → intent)
    ├── Track 2: Visual Semantic Diff (screenshots → pixelmatch → heatmap → classify)
    └── Track 3: A11y Semantic Diff (a11y tree → diff → landmark/role/name changes)
          │
          ▼
    Cross-Validation (Visual × A11y × Intent)
          │
          ▼
    Verdict (approve / reject / escalate)
          │
          ▼
    Quality Gate (whiteout / error-state / coverage / a11y regression)
```

### Two-tier expectations

- **Short cycle** (`expectation.json`): per-commit — "this commit removes the nav"
- **Long cycle** (`spec.json`): invariants — "all pages must have a main landmark"

Short cycle can temporarily override long cycle (e.g., "regression-expected").

### Flexibility principle

`description` is canonical. Structured fields are optional hints. As models improve, structured fields become unnecessary — the system degrades gracefully to description-only.

```json
// Minimal (works today, works with future models)
{ "testId": "home", "expect": "Navigation removed from header" }

// With hints (better precision now)
{
  "testId": "home",
  "expect": "Navigation removed",
  "a11y": "regression-expected",
  "expectedA11yChanges": [{ "description": "Navigation landmark removed" }]
}
```

## CLI (when integrated with a project)

```bash
vrt init          # Create baseline screenshots + a11y trees
vrt capture       # Take current snapshots
vrt expect        # Auto-generate expectation.json from diff
vrt verify        # Run verification pipeline
vrt approve       # Promote snapshots to baselines
vrt introspect    # Generate spec.json from a11y snapshots
vrt spec-verify   # Verify spec invariants
vrt report        # Show last report
vrt graph         # Show dependency graph
vrt affected      # Show components affected by changes
```

## Agent workflow

```
vrt init                    # once
loop {
  (make code changes)
  vrt capture               # snapshot
  vrt expect                # auto-generate expectations
  vrt verify                # check → PASS/FAIL
  if FAIL {
    read report → fix → repeat
  }
}
vrt approve                 # accept as new baseline
```

## Tests

```
150 tests across 45 suites:
- a11y-semantic: tree diffing, quality checks
- visual-pipeline: real PNG pixelmatch + heatmap
- cross-validation: Visual × A11y × Intent matrix
- expectation: fuzzy matching, scoring
- reasoning: expectation → change → realization chains
- harness: 10 fixture scenarios × 4 checks
- goal-runner: multi-step with retry
- roundtrip: introspect → spec → verify
- scenario: integrated 3-case scenarios
```

## License

MIT
