# E1: luna.mbt / sol.mbt Dogfooding Report

**Date**: 2026-04-05
**Test**: VRT snapshot (URL → multi-viewport capture) false positive rate

## Test Environment

- luna.mbt: `npx serve dist/ -p 4200` (6 demo pages × 2 viewports = 12 screenshots)
- sol.mbt: `npx serve website/dist-docs/ -p 3000` (5 doc pages × 2 viewports = 10 screenshots)
- Viewport: desktop (1280x900), mobile (375x812)
- Method: 1st run creates baseline → 2nd run measures diff

## False Positive Results

### luna.mbt (static demo pages)

| Page | Desktop | Mobile |
|------|---------|--------|
| todomvc | 0.0% | 0.0% |
| spa | 0.0% | 0.0% |
| wc | 0.0% | 0.0% |
| apg-playground | 0.0% | 0.0% |
| browser_router | 0.0% | 0.0% |
| css_split_test | 0.0% | 0.0% |

**False positive rate: 0/12 (0.0%)**

### sol.mbt (static documentation site)

**Without masking:**

| Page | Desktop | Mobile |
|------|---------|--------|
| / (root) | **0.32%** | **0.04%** |
| /luna/ | 0.0% | 0.0% |
| /luna/tutorial-js/islands/ | 0.0% | 0.0% |
| /sol/ | 0.0% | 0.0% |
| /benchmark/ | 0.0% | 0.0% |

False positive rate: 2/10 (20.0%)

**After applying `--mask ".marquee-container,.hero-badge"`:**

| Page | Desktop | Mobile |
|------|---------|--------|
| / (root) | 0.0% | 0.0% |

**False positive rate: 0/10 (0.0%)**

### sol.mbt root page false positive cause analysis

Heatmap diff pixel Y-coordinate distribution:
- 96% concentrated at y=1150-1400 → **`.marquee-container` (tweet card horizontal scroll animation)**
- Remaining 4% at y=150-250 → **`.hero-badge` (animated badge)**

`.marquee-container` continuously scrolls horizontally via CSS `@keyframes`, so its position varies depending on capture timing.
Using `--mask` to set `visibility: hidden` preserves layout while hiding the rendering, achieving 0.0% diff.

## `--mask` Feature

Added `--mask` option to both `vrt snapshot` and `vrt compare`:

```bash
# Specify selectors comma-separated
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"

# Multiple --mask flags also supported
vrt compare --url http://example.com --current-url http://example.com \
  --mask ".marquee-container" --mask ".hero-badge"
```

Mechanism: inject `visibility: hidden !important` via `page.addStyleTag()`.
Layout is preserved, so surrounding elements are unaffected.

## Conclusion

| Project | Pages | FP (raw) | FP (after mask) | Mask targets |
|---------|-------|----------|-----------------|--------------|
| luna.mbt | 6 | 0% | 0% | None |
| sol.mbt | 5 | 20% | **0%** | `.marquee-container`, `.hero-badge` |

**0% false positives across all 22 screenshots** (after masking).
Dynamic content masking is handled via selector specification.
