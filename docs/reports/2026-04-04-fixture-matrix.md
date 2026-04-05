# Cross-Fixture Detection Rate Matrix

**Date**: 2026-04-04
**Conditions**: selector mode, 10 trials/fixture, Chromium backend, 3 viewports (1440/1280/375)

## Results

| Fixture | Declarations | Sel | Any | Visual | CS | Undetected reason |
|---------|-------------|-----|-----|--------|----|-------------------|
| page | 237 | 73 | **100%** | 100% | 100% | — |
| blog-magazine | 227 | 69 | **100%** | 100% | 90% | — |
| dashboard | 276 | 81 | **100%** | 90% | 80% | — |
| stacking-context | 291 | 60 | **100%** | 70% | 70% | — |
| admin-panel | 301 | 92 | 90% | 80% | 70% | hover-only (:focus) |
| ecommerce-catalog | 308 | 90 | 90% | 80% | 80% | media-scoped |
| form-app | 228 | 73 | 90% | 80% | 80% | dead-code (.alert-success) |
| grid-complex | 245 | 71 | 90% | 60% | 60% | media-scoped (.stats grid) |
| landing-product | 278 | 81 | 90% | 80% | 80% | hover-only (:hover) |

**Overall**: 9 fixtures × 10 trials = 90 trials → detection rate **94.4%** (85/90)

## Undetected Pattern Analysis

| Reason | Count | Example | Mitigation |
|--------|-------|---------|------------|
| **hover-only** | 2 | `:focus`, `:hover` styles | Improve hover emulation (also run hover at breakpoint viewports) |
| **media-scoped** | 2 | grid changes inside `@media (max-width: 640px)` | Include breakpoint viewports for each @media in test targets |
| **dead-code** | 1 | `.alert-success` (no success alert on page) | Exclude via CSS rule usage tracking |

## Needed Features

### 1. Breakpoint-aware media-scoped detection

Current: 3 fixed viewports (1440/1280/375)
Problem: Rules inside `@media (max-width: 640px)` are only active at 375px, but not testing multiple viewports below 640px

Improvement:
- Parse conditions of each `@media` rule and add viewports where the condition is active
- Example: `@media (max-width: 640px)` → add 640px, 639px, 480px as test targets

### 2. Cross-fixture report

Current: Bench runs per fixture individually, results overwritten in `bench-report.json`
Problem: Only way to compare all fixtures side-by-side is eyeballing console output

Improvement:
- Summary `--fixture all` results in matrix format
- Accumulate in `data/fixture-matrix.jsonl`
- Add matrix display to `just css-report`

### 3. Automatic mitigation for undetected reasons

| Reason | Automatic mitigation |
|--------|---------------------|
| hover-only | Auto retry on detection: re-test with hover emulation ON |
| media-scoped | Breakpoint discovery → dynamically add viewports matching the condition |
| dead-code | If computed style diff = 0, verify with CSS rule usage API |

### 4. Difficulty scoring

Quantify fixture difficulty:
- `difficulty = 1 - (any_signal_rate)`
- `detection_diversity = visual_rate / computed_rate` (signal redundancy)
- `fragility = media_scoped_count + hover_only_count` (environment dependency)
