# E1: Dogfooding Evaluation Report

**Date**: 2026-04-04

## What Was Done

Ran vrt's full toolchain on the project's own fixtures to verify practicality.

## Results

### 1. Migration Compare

| Scenario | Status | Notes |
|----------|--------|-------|
| **Tailwind → vanilla CSS** | ✅ clean (13/13 viewport) | 0.0% diff — pixel-perfect achieved |
| **Reset CSS** (normalize → 3 variants) | ⚠️ remaining (7/7 unresolved) | Fix Candidates auto-generated |

Reset CSS Fix Candidates output:
```
modern-normalize   7x header nav { display }, 4x header nav { gap }, 4x label { display }
destyle            7x header nav { display }, 4x header nav { gap }, 4x label { display }
no-reset           7x header nav { display }, 4x header nav { gap }, 4x label { display }
```
→ Specific fix candidates are produced, ready to pass to subagent for fixing.

### 2. Smoke Test

| Fixture | Actions | Errors | Result | Time |
|---------|---------|--------|--------|------|
| page | 10 | 0 | PASS | ~2.5s |
| dashboard | 10 | 0 | PASS | ~2.5s |
| form-app | 10 | 0 | PASS | ~2.5s |

No crashes across all fixtures. Disabled element skipping works correctly.

### 3. CSS Bench (selector mode)

- 10 trials, page fixture
- **Detection rate: 100%** (all categories)
- multi-viewport bonus: 3 cases
- 0 false positives

### 4. CLI Usability

| Command | Status | Notes |
|---------|--------|-------|
| `vrt compare` | ✅ | Auto breakpoint discovery + convergence judgment is convenient |
| `vrt discover` | ✅ | Breakpoint and viewport candidates listed |
| `vrt smoke` | ✅ | Reproducible with seed |
| `vrt bench` | ✅ | Flexible fixture/mode/backend switching |
| `vrt report` | ✅ | Accumulated data aggregation |
| `vrt serve` | ✅ | Hono API server |

### 5. Issues

| Issue | Severity | Mitigation |
|-------|----------|------------|
| WASM-based apps (luna) render empty pages without JS execution → smoke test unusable | Medium | Add JS execution wait (networkidle) to smoke test, or serve WASM build via Playwright |
| paint tree diff / prescanner unavailable without crater BiDi | Low | Graceful fallback implemented |
| `vrt compare` output is verbose via `migration-compare.ts` | Low | Add simple JSON output mode |

## Evaluation

| Metric | Rating |
|--------|--------|
| **Practicality** | High — migration compare + fix candidates usable for real CSS migration |
| **False positives** | 0% — no false positives in 10 trial bench |
| **CLI UX** | Good — subcommands are intuitive |
| **CI compatibility** | High — GitHub Actions workflow included, reproducible with seed |
| **WASM app support** | Not supported — static HTML only |
