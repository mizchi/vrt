# Reset CSS Comparison — Empirical Data from VRT

## Overview

Compared 3 reset CSS variants using VRT with normalize.css as baseline.
Applied the same application CSS to shared HTML content (headings, lists, forms, tables, images, footer).

## Comparison Results

| Variant | diff (desktop) | diff (mobile) | Drop-in replacement |
|---------|---------------|---------------|---------------------|
| **modern-normalize** | 0.9% | 2.6% | ✓ Possible (1 line fix) |
| **no-reset** (browser default) | 1.7% | 3.6% | △ Conditional |
| **destyle** | 6.8% | 12.0% | ✗ Not possible |

## Diff Causes per Variant

### normalize.css → modern-normalize

**diff: 0.9-2.6%** — Closest match.

Diff causes:
1. **Global `box-sizing: border-box` application** — modern-normalize sets `border-box` on `*, ::before, ::after`. normalize.css doesn't. Form element (input, textarea) widths change by border + padding
2. **`h1` margin** — normalize.css sets `h1 { margin: 0.67em 0 }`. modern-normalize doesn't. When app CSS only specifies `margin-bottom`, `margin-top` differs

Fix (to reach 0%):
```css
/* Add when migrating normalize → modern-normalize */
h1 { margin-top: 0.67em; }
```

The box-sizing difference generally favors modern-normalize (modern CSS best practice).
Approving as an intentional difference is reasonable.

### normalize.css → browser default (no-reset)

**diff: 1.7-3.6%** — Moderate.

Diff causes:
1. **Form element fonts** — normalize.css sets `font-family: inherit; font-size: 100%; line-height: 1.15`. Browser defaults use proprietary fonts for input/select
2. **`h1` margin** — Browser default h1 margin is larger than normalize's `0.67em`
3. **`pre` font** — normalize.css's `font-family: monospace, monospace` (doubled to work around browser quirk) is absent
4. **`hr` box-sizing** — normalize.css explicitly sets `content-box`

### normalize.css → destyle

**diff: 6.8-12.0%** — Significantly different. **Drop-in replacement is not possible.**

Diff causes:
1. **`list-style: none`** — All list markers (bullets, 1. 2. 3.) disappear. Unless app CSS sets `list-style`, lists become plain text
2. **Heading reset** — `font-size: inherit; font-weight: inherit` makes headings the same size/weight as body text. No problem if app CSS explicitly sets them, but selectors depending on normalize.css defaults break
3. **`appearance: none`** — Native rendering of checkbox, radio, select disappears. Only acceptable when using custom form components
4. **`margin: 0` on all elements** — Default margins of p, blockquote, pre, table, form become zero. When app CSS only sets `margin-bottom`, `margin-top` differences accumulate
5. **`text-decoration: none` on `a`** — Link underlines disappear

destyle is not a normalize.css alternative but an opinionated reset that assumes writing CSS from scratch. Migrating from normalize.css requires moving all defaults provided by normalize.css into app CSS.

## Recommendations

### normalize.css → modern-normalize

**Recommended**. Same philosophy (normalize, not reset). Differences are only `box-sizing` and `h1` margin.

Migration checklist:
1. Add `h1 { margin-top: 0.67em }` (unnecessary if app CSS already explicitly specifies margin)
2. Verify form element widths aren't affected by `box-sizing: border-box`
3. Check all viewports with VRT

### normalize.css → destyle

**Not recommended (for drop-in)**. If migrating:
1. Add `list-style` to lists
2. Add `font-size` / `font-weight` to headings
3. Add `appearance: auto` to form elements (if native rendering needed)
4. Add `text-decoration: underline` to links
5. Explicitly specify margins on all block elements

This is essentially reimplementing normalize.css. If adopting destyle, CSS should be written with destyle in mind from the start.

## VRT Findings

- **Diffs increase on mobile** — responsive CSS differences + cumulative vertical shift
- **Testing at breakpoint boundaries (640px ±1) is important** — diffs change at media query transitions
- **Form elements are most sensitive to diffs** — reset CSS differences have the most impact on input/select/textarea
