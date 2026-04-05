# Experiment: Tailwind → vanilla CSS Blind Migration Test

**Date**: 2026-04-01
**Objective**: Can vanilla CSS be written from only before.html (Tailwind) + VRT diff, without seeing after.html?

## Experiment Design

1. Prepare a dashboard built with Tailwind CDN (`before.html`)
2. Prepare `after-blank.html` with HTML structure only, zero CSS
3. Provide only the following to the subagent:
   - `before.html` source (Tailwind utility classes visible)
   - `after-blank.html` (target for writing CSS)
   - VRT diff results (pixel diff % and heatmap)
4. **Do not show after.html (existing vanilla CSS version)**
5. Have the agent reduce diff via VRT loop

## Results

### Diff Progression

| Iteration | wide (1440) | desktop (1280) | bp-above (769) | mobile (375) | Action |
|-----------|-------------|----------------|----------------|--------------|--------|
| 0 (no CSS) | 1.6% | 1.7% | 4.1% | 36.7% | — |
| 1 (initial CSS) | 0.3% | 0.3% | 1.2% | 0.6% | Tailwind class → CSS conversion |
| 2 (fine-tuning) | 0.3% | 0.3% | 1.2% | 0.7% | font-smoothing adjustment |
| 3 (final) | **0.0%** | **0.0%** | **0.0%** | **0.0%** | td:last-child font-size fix |

**Achieved pixel-perfect (0.0%) across all 7 viewports in 3 rounds.**

### Agent Behavior

- **58 tool calls** (632 seconds)
- 4 VRT runs (migration-compare)
- Read before.html and converted Tailwind classes to CSS
- Read VRT heatmap to identify diff causes
- Iteratively fixed CSS

### Findings

#### 1. Reproducing Tailwind Preflight Was the Biggest Challenge

Tailwind CDN v3.4.17's Preflight subtly differs from official docs:
- `-webkit-font-smoothing: antialiased` is **not applied** in CDN version (present in official Preflight)
- font-family is shorter: `ui-sans-serif, system-ui, sans-serif` (no Roboto etc.)

**Lesson**: Preflight varies by Tailwind version and distribution format (CDN vs PostCSS). Checking DevTools computed style is the accurate approach.

#### 2. line-height Is the Most Important Conversion Rule

Tailwind's `text-*` classes specify font-size **and** line-height as a set:

| Tailwind class | font-size | line-height |
|---------------|-----------|-------------|
| `text-xs` | 0.75rem | 1rem |
| `text-sm` | 0.875rem | 1.25rem |
| `text-base` | 1rem | 1.5rem |
| `text-lg` | 1.125rem | 1.75rem |
| `text-xl` | 1.25rem | 1.75rem |
| `text-2xl` | 1.5rem | 2rem |

Specifying only font-size in vanilla CSS causes line-height to inherit body's `1.5`, accumulating several px difference per line.

**Lesson**: First thing to do when leaving Tailwind is creating a line-height mapping table.

#### 3. Partial Application Trap (td:last-child)

Cause of the last remaining diff:
- before.html: `<td class="px-6 py-4 text-sm">` on first 3 columns only. Last column (Status) has no `text-sm`
- Initial CSS: `td { font-size: 0.875rem }` applied to all columns → Status column became 2px shorter
- Fix: `td:not(:last-child) { font-size: 0.875rem; line-height: 1.25rem; }`

**Lesson**: Tailwind classes differ per element. Watch for "elements where the class is NOT applied" when doing bulk conversion.

#### 4. VRT Heatmap Was Effective for Identifying Diff Causes

The agent used heatmap images to identify:
- Table row height differences (2px/row × 3 rows = 6px cumulative)
- Whole-page subtle diff from font-smoothing presence/absence
- Nav show/hide differences at breakpoint boundaries

**Lesson**: Not just diff %, but the spatial pattern of the heatmap provides clues for root cause identification.

## vrt Evaluation

| Criteria | Result |
|----------|--------|
| **Can CSS be written without seeing after?** | ✓ Possible. Generated CSS from Tailwind classes in before.html |
| **Can VRT loop reduce diff?** | ✓ Reached 0.0% in 3 rounds |
| **What's difficult?** | line-height, partial application (class on only some elements), Preflight version differences |
| **What's easy?** | Layout (flex, grid), colors, spacing (padding/margin), border |
| **Agent efficiency** | 58 tool calls / 632s. Work that would take a human several hours in ~10 min |
| **Reproducibility** | No seed (LLM judgment). Same result not guaranteed |

## Conclusion

**vrt provides a verification platform with sufficient accuracy for "automating CSS migration".**

Demonstrated that with only the source code of before (migration source) and VRT diff, an agent can generate after (migration target) code and achieve pixel-perfect migration.

Conditions where this approach works:
- HTML structure is similar (class names change but DOM structure stays the same)
- CSS-only changes (JavaScript behavior changes cannot be verified by VRT)
- Static pages (animations, hover states etc. need separate verification)
