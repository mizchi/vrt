# E3: Reset CSS Blind Test

**Date**: 2026-04-04

## Experiment Design

Have an agent perform a normalize.css → modern-normalize migration.

- **Baseline**: `normalize.html` (normalize.css + app CSS)
- **Target**: `modern-normalize-blind.html` (modern-normalize + same app CSS)
- Agent is provided only VRT diff results and fix candidates
- Directly reading normalize.css source to find the answer is forbidden

## Results

| | Initial diff | After fix |
|---|---|---|
| wide (1440) | 0.9% | **0.0%** |
| desktop (1280) | 1.0% | **0.0%** |
| mobile (375) | 2.6% | **0.0%** |

**Achieved 0.0% across all viewports in 1 round, 6 tool calls (54 seconds).**

## Agent's Fix

```css
/* Added 1 line */
*, *::before, *::after { box-sizing: content-box; }
```

### Root Cause Identification

modern-normalize globally sets `*, ::before, ::after { box-sizing: border-box }`, but normalize.css doesn't.

The box-sizing difference causes:
- padding included in width (border-box) vs not included (content-box)
- Width calculation of flex container children changes
- Especially prominent on mobile (375px) — padding difference is larger on narrow viewports

### Usefulness of VRT Hints

Fix candidates' `header nav { display }` was misleading — the actual cause was box-sizing.
The agent inferred the box-sizing difference **from the spatial pattern of the diff (layout-shift)**, not from fix candidates.

## Comparison with Tailwind Blind Test

| | Tailwind → vanilla | Reset CSS switch |
|---|---|---|
| Initial diff (desktop) | 1.7% | 1.0% |
| Initial diff (mobile) | 36.7% | 2.6% |
| Fix rounds | 3 | **1** |
| Tool calls | 58 | **6** |
| Time | 632s | **54s** |
| Fix complexity | 14 line-height changes + structural changes | **1 line** |

Reset CSS switching is far simpler than Tailwind migration (smaller diff, single root cause).

## E3 Success Criteria

> diff < 1% within 3 rounds

✅ **0.0% diff in 1 round — far exceeding the criteria.**
