# VRT + Semantic Verification — Agent Skill Guide

## Overview

A quality assurance tool for coding agents that combines Visual Regression Testing (VRT)
with accessibility semantics verification.

Automatically verifies that changes are visually and semantically (a11y) as intended,
running a loop to detect and repair regressions.

## CLI Commands

All commands run from the **project root**. See `docs/api-design.md` for API design details.

### Basic

```bash
just vrt-test                  # Unit tests
just vrt                       # Playwright VRT
just vrt-update                # Update snapshots
```

### CSS Challenge (detection rate benchmark)

```bash
just css-challenge             # Single CSS deletion challenge (LLM recovery)
just css-bench --trials 30     # Benchmark (detection rate measurement)
just css-bench --fixture dashboard --backend crater  # Specify fixture/backend
just css-bench-all             # All fixtures at once
just css-report                # Analysis report of accumulated data
```

### Migration VRT (CSS migration verification)

```bash
just migration-compare before.html after.html   # 2-file comparison
just migration-reset           # Reset CSS comparison (normalize vs others)
just migration-tailwind        # Tailwind → vanilla CSS
```

Breakpoints are auto-discovered from CSS, generating boundary ±1px + random sample viewports.

### Demo

```bash
just vrt-demo                  # Basic VRT demo (kitty graphics)
just vrt-demo-fix              # Fix loop demo
just vrt-demo-multi            # Multi-scenario
just vrt-demo-multistep        # Multi-step
```

## Agent Workflow

### Basic Loop

```
┌─────────────────────────────────────────────┐
│ 1. Create baseline                          │
│    just vrt-update                          │
└─────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 2. Make code changes                        │
│    - State intent clearly in commit message │
│      (feat: / fix: / style: / refactor: /   │
│       a11y: / deps:)                        │
└─────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 3. just vrt                                 │
└─────────┬───────────────────────────────────┘
          │
     ┌────┴────────────────┐
     │                     │
   PASS               FAIL/ESCALATE
     │                     │
     ▼                     ▼
┌──────────┐    ┌─────────────────────┐
│ 4a.      │    │ 4b. Identify issue  │
│ Done     │    │     → Fix code      │
│          │    │     → Return to 3   │
└──────────┘    └─────────────────────┘
```

### Verification Pipeline (runs automatically)

```
Change ─→ 3 tracks run in parallel:

Track 1: Diff Intent    — git diff + commit message → infer change intent
Track 2: Visual Diff    — pixel comparison → heatmap → region classification
Track 3: A11y Diff      — a11y tree diff → semantic change detection

→ Cross-Validation (cross-reference all 3):

| Visual | A11y  | Intent  | → Verdict             |
|--------|-------|---------|----------------------|
| None   | None  | any     | APPROVE (no change)   |
| Yes    | Yes   | match   | APPROVE (as expected) |
| Yes    | Yes   | none    | ESCALATE (unclear intent) |
| Yes    | None  | style   | APPROVE (visual only) |
| Yes    | None  | refac   | ESCALATE (unintended) |
| None   | Yes   | a11y    | APPROVE (a11y improvement) |
| None   | Yes   | other   | REJECT (semantics broken) |
| any    | regr  | any     | REJECT (a11y regression) |

→ Quality Gate:
  - Whiteout detection (blank white screen)
  - Error state detection (red warning display)
  - Empty content detection
  - A11y regression (lost label, removed landmark)
```

## exit code

| code | Meaning |
|------|---------|
| 0    | PASS — no change, or all approved |
| 1    | FAIL — rejected changes, or quality error |

escalate returns exit 0 but emits warnings.

## How to Write Commit Messages

The verification pipeline infers change intent from the commit message.
When intent is correctly inferred, expected visual changes are auto-approved.

```
feat: add dark mode toggle          → visual + a11y additions expected
fix: fix mobile layout breakage     → only fix target should change
refactor: extract utility functions → no visual/a11y changes expected
style: change button color blue→green → visual change, no a11y change expected
a11y: add labels to form            → a11y change, minimal visual change expected
deps: update to React 19            → no visual/a11y changes expected
```

## A11y Check Usage

VRT verify also inspects the A11y tree simultaneously. The following are detected:

- Button/link without label (`label-missing`)
- Image without alt text (`img-alt-missing`)
- Landmark element removed (`landmark-changed`)
- Interactive element removed (`node-removed`)
- Inappropriate role change (`role-changed`)

If any of these are detected during refactoring,
semantics are likely broken.

## File Structure

```
├── SKILL.md                   ← This file
├── justfile                   # Task runner
├── package.json
├── playwright.config.ts       # Playwright config for VRT
├── e2e/
│   └── vrt-capture.spec.ts    # Screenshot + a11y collection
├── fixtures/                  # Test fixtures
├── src/
│   ├── vrt-cli.ts             # CLI entry point
│   ├── cli.ts                 # CLI helpers
│   ├── types.ts               # All type definitions
│   ├── playwright-analyzer.ts # Playwright output analysis
│   ├── playwright-helper.ts   # Playwright helpers
│   ├── dep-graph.ts           # Dependency tree (TS/MoonBit/Rust)
│   ├── heatmap.ts             # Pixel comparison + heatmap
│   ├── visual-semantic.ts     # Visual Semantic Diff classification
│   ├── a11y-semantic.ts       # A11y tree diff + quality checks
│   ├── cross-validation.ts    # Visual x A11y x Intent cross-reference
│   ├── intent.ts              # Diff → change intent inference
│   ├── quality.ts             # Quality gate
│   ├── reasoning.ts           # Change reason inference
│   ├── expectation.ts         # Expectation matching
│   ├── introspect.ts          # Spec generation/verification
│   ├── goal-runner.ts         # Goal-driven execution
│   ├── llm-client.ts          # LLM provider
│   ├── agent.ts               # 5-stage verification loop
│   ├── demo.ts                # VRT demo
│   ├── demo-fix-loop.ts       # Fix loop demo
│   ├── demo-scenarios.ts      # Multi-scenario demo
│   └── demo-multistep.ts      # Multi-step demo
└── test-results/              # Execution results (gitignore)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Font rendering diffs | Adjust pixelmatch threshold (heatmap.ts) |
| A11y tree is null | Wait for page render completion (adjust waitFor) |
| Everything becomes ESCALATE | Add prefix to commit message (feat:/fix:/style: etc.) |
