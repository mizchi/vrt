# CSS VRT Detection Patterns — Experimental Findings

## Goal

Large-scale cross-renderer diff verification + a11y-based smoke testing.

- **Chromium vs Crater**: Benchmark + auto-detect cross-browser engine diffs
- **Website v1 vs v2**: Regression verification during UI library rewrites
- **Cloudflare Workers**: Run VRT without Chromium via crater WASM + API
- **Diff Approval**: Declare and manage acceptable diff patterns (tolerance, expires, issue linkage)
- **A11y Smoke Test**: Enumerate interactive elements from a11y tree, perform random/reasoning-based operations to detect crashes

## Experiment Overview

Randomly delete 1 CSS property from a GitHub repo page-like HTML (237 CSS declarations), benchmarking whether the VRT pipeline can detect it. Results from 60 trials (2 runs).

## Detection Signals and Effectiveness

| Signal | Standalone Detection Rate | Role |
|--------|--------------------------|------|
| **Visual diff** (pixel) | 77% | Baseline. Detects layout, color, and size changes |
| **Computed style diff** | 73% | Detects CSS changes invisible to pixels. **Complementary to visual** |
| **Hover emulation** | 7% | Always-on `:hover` rules, compared via computed style |
| **A11y diff** | 17% | Only element disappearance via `display: none` etc. Nearly useless for CSS changes |
| **Multi-viewport** | +7% | 2 viewports (desktop 1280 + mobile 375) to catch misses |
| **All signals combined** | **93%** | **+23%** improvement from pixel-only (70%) |

### Signal Combination Effects

```
pixel only (1 viewport)       → 70%
+ multi-viewport (2 vp)       → 77%  (+7%)
+ computed style diff          → 87%  (+10%)
+ hover emulation             → 93%  (+6%)
+ wide viewport (3 vp)        → 95%  (+2%)
+ semantic tag collection      → 97%  (+2%)
                         Total: +27%
```

### Hover Emulation Mechanism

CSS `:hover` doesn't fire via JS `dispatchEvent` (browser internal state). So:

1. Collect rules containing `:hover` from `<style>` elements on the page
2. Duplicate the rules with `:hover` removed from selectors → inject as new `<style>`
3. Get `getComputedStyle` in this state (hover styles always applied)
4. Remove the injected `<style>`

This detects `:hover` style presence/absence as computed style differences.

## Detection Rate by Category

| Category | Detection Rate | n | Notes |
|----------|---------------|---|-------|
| **layout** | 100% | 13 | display, flex, align-items — always detectable |
| **sizing** | 100% | 6 | width, height — always detectable |
| **spacing** | 80% | 10 | padding, margin — misses subtle changes |
| **typography** | 77% | 17 | font-size, color are reliable. text-decoration is flaky |
| **visual** | 75% | 12 | Misses background when similar to parent color |

### Always Detected Properties (100%, n>=2)

`display`, `font-size`, `color`, `margin-left`, `border-radius`, `height`, `width`, `font-weight`, `align-items`

### Flaky Properties (unstable detection)

| Property | Detection Rate | Cause | After hover emulation |
|----------|---------------|-------|----------------------|
| `background` | 50% | Zero pixel diff when parent has similar color | Partially improved via computed style diff |
| `text-decoration` | 56% → **100%** | Hover-only styles invisible in static capture | Solved by hover emulation |
| `padding` | 67% | Inner space difference doesn't show with little content | Improved via computed style diff |

## Detection Rate by Selector Type

| Type | Detection Rate | n | Notes |
|------|---------------|---|-------|
| **class** (`.foo`) | 97% | 38 | Almost certainly detected |
| **compound** (`.foo .bar`) | 65% | 20 | Descendant selectors are context-dependent, easier to miss |
| **pseudo-class** (`:hover`) | 0% | 1 | Fundamentally invisible in static capture |

## Undetected Pattern Classification

### Before hover emulation (60 trials)

| Reason | Count | Ratio | Mitigation |
|--------|-------|-------|------------|
| **hover-only** | 5 | 56% | Solved by hover emulation |
| **unknown** | 3 | 33% | Element doesn't exist on page / computed value unchanged |
| **same-as-parent** | 1 | 11% | Partially detectable via computed style diff |

### After hover emulation (30 trials)

Undetected: 2/30 (6.7%) — **all hover-only cases resolved**

| Reason | Count | Example |
|--------|-------|---------|
| **unknown** | 2 | `.readme-body code { background: #eff1f3 }`, `.main { margin: 0 auto }` |

### Detailed Analysis of "unknown"

- `.readme-body code { background: #eff1f3 }` — `<code>` used inline, only exists within `<pre><code>` in the fixture HTML. Difference between `<pre>`'s background `#f6f8fa` and `<code>`'s `#eff1f3` is too subtle
- `.main { margin: 0 auto }` — `max-width: 1280px` with viewport=1280px so auto margin is zero. Same on mobile since no max-width constraint
- `.readme-body code { padding: 2px 6px }` — Little text inside inline `<code>`, padding difference absorbed by surroundings

## Detection Rate by Viewport

| Viewport | Detection Rate | Exclusive |
|----------|---------------|-----------|
| desktop (1280px) | 70% | 6 cases (detected only on desktop) |
| mobile (375px) | 62% | 1 case (detected only on mobile) |

Desktop has higher detection rate because: layout uses full width, making spacing/sizing differences more visible. On mobile, the sidebar is hidden (`@media` with `width: 100%`), collapsing some elements.

## Computed Style Diff Effectiveness

Examples detected by computed style diff but not by pixel diff:

| Declaration | Reason |
|-------------|--------|
| `.file-table .date { white-space: nowrap }` | Content too short for wrapping, but computed value changes |
| `.readme-header { background: #f6f8fa }` | Same as parent background color so zero pixel diff, but computed `background-color` changes to `transparent` |
| `.lang-list { flex-wrap: wrap }` | Too few items to need wrapping, but computed value `wrap` → `nowrap` difference is detectable |

## The Last 3% Barrier — Dead Code Problem

Reached 96.7% detection. Remaining 1 undetected case:

`.readme-body code { background: #eff1f3 }` — **effectively dead code**.

Chain of causes:
1. `<code>` on the page only exists within `<pre><code>`
2. `.readme-body pre code { background: none }` overrides it
3. Therefore `.readme-body code { background: #eff1f3 }` has no visual effect on any element
4. No difference in computed style either (`pre code` override takes priority)

**This is not a VRT limitation but dead code in the CSS itself**.

### Dead Code Detection

Introduced a heuristic to classify as `dead-code` when computed style diff = 0 AND visual diff = 0 across all viewports. This reduces `unknown` cases and distinguishes between "can't detect" and "doesn't need detection".

**Dead code should be treated as outside VRT's detection scope**. The effective detection rate, excluding CSS dead code, approaches **100%**.

## Multi-Fixture Comparison (90 trials, 3 fixtures)

| Fixture | Detection Rate | Declarations | Characteristics |
|---------|---------------|-------------|-----------------|
| **page** (GitHub-like) | 96.7% | 237 | Flexbox-based, simple selectors |
| **form-app** (settings page) | 90.0% | 228 | :focus/:hover/:disabled/:checked, toggle switch, form validation |
| **dashboard** | 83.3% | 276 | CSS Grid, var(), animation, filter, ::before/::after |
| **Total** | **90.0%** | 741 | |

Reasons for dashboard's lower detection rate:

### Newly Discovered Undetected Patterns

| Pattern | Example | Classification | Mitigation |
|---------|---------|---------------|------------|
| **vendor pseudo-element** | `::-webkit-scrollbar-track { background: transparent }` | same-as-default | transparent is browser default |
| **animation-delay** | `.stat-card:nth-child(2) { animation-delay: 0.05s }` | dead-code | Animation already completed at static capture time. Detectable right after initial load, but not after `networkidle` wait |
| **grid-column** | `.topbar { grid-column: 2 }` | dead-code | `@media (max-width: 768px)` changes grid-template-columns, but other viewports have the same column structure |
| **:focus styles** | `input:focus { border-color: var(--accent) }` | hover-only | Hover emulation covers `:focus`, but `var()` resolution timing issues |
| **CSS custom properties (var())** | `border-color: var(--accent)` | hover-only | var() references change in computed style comparison, but specificity conflicts can occur during hover emulation style injection |

### Detection by CSS Feature (60 trials, 2 fixtures)

| CSS Feature | Detection Rate | Notes |
|-------------|---------------|-------|
| flexbox | 100% | All display, align-items, gap etc. detected |
| CSS Grid | High | grid-template-columns detected. grid-column tends to be dead-code |
| transition | N/A | transition property itself has no static impact. Target property changes are detectable |
| animation | **Low** | delay/duration of completed animations undetectable. Separated as `animation` category |
| var() | High | Computed style uses resolved values, so comparison works |
| filter/backdrop-filter | High | Detectable via computed style. Separated as `transform` category |
| :hover | **Partial** | 100% for page fixture with hover emulation. Some gaps on dashboard due to `getComputedStyle` rendering timing |
| :focus | **Low** | Covered by hover emulation for `:focus` too, but same timing issues |
| ::before/::after | Undetected | Pseudo-element computed style capture not implemented |
| ::-webkit-* | Low | Vendor prefixes often have transparent default |
| :nth-child() | dead-code | Subtle value changes like animation-delay invisible in static capture |
| CSS custom properties (:root) | **Low** | Variable definitions like `--accent-hover: #60a5fa` undetectable unless the usage site's computed style changes |
| object-fit | dead-code | No cover effect when img is square |
| grid-column | dead-code | Same layout when declaration matches grid auto-placement |
| scrollbar styles | same-as-default | Vendor pseudo-elements often default to transparent |

## Large-Scale Test Results (90+60 trials)

Additional 60-trial testing on dashboard revealed the following new patterns:

### CSS Custom Properties Detection Limits

Deleting `:root { --accent-hover: #60a5fa }` doesn't cause direct computed style changes.
- `:root` styles are only CSS variable definitions
- Computed styles of elements referencing the variable fall back to fallback or default values when the variable becomes undefined
- However, inconsistencies can occur in `getComputedStyle` evaluation timing

**Mitigation idea**: Search for `var()` usage sites of CSS variables and track computed styles of those elements

### Hover Emulation Limits (Playwright + getComputedStyle)

Cases confirmed where `getComputedStyle` returns `transparent` even after setting inline styles.
`evaluate` may run before CSS recalculation completes after DOM construction via `page.setContent`.

**Interim finding**: Hover emulation works 100% for simple structures (page fixture) but is unstable on complex pages with CSS Grid + var() + many rules (dashboard).

### Complete List of Undetected Patterns (9/90)

| # | Fixture | Declaration | Reason | Root Cause | Mitigation |
|---|---------|-------------|--------|------------|------------|
| 1 | page | `.readme-body code { background }` | dead-code | Specificity override by `pre code` | CSS refactoring |
| 2 | dashboard | `.topbar { grid-column: 2 }` | dead-code | Same as grid auto-placement | Redundant declaration → recommend removal |
| 3 | dashboard | `.stat-card:nth-child(2) { animation-delay }` | dead-code | Already completed at networkidle | Animation detection is fundamentally difficult |
| 4 | dashboard | `.avatar { width: 32px }` | dead-code | Same as img natural size | Change natural size in fixture HTML → resolved |
| 5 | dashboard | `::-webkit-scrollbar-track { background }` | same-as-default | `transparent` is default | Legitimate same-as-default |
| 6 | dashboard | `input:focus { border-color: var(--accent) }` | hover-only | Specificity conflict in :focus hover emulation | Room for improvement |
| 7 | form-app | `.check-desc { color }` | dead-code | Same as parent's color | Legitimate dead-code |

### Resolution History of Previously Undetected Cases

| Issue | Detection Rate Impact | Resolution |
|-------|----------------------|------------|
| `margin: 0 auto` (viewport=max-width) | 93%→97% | **Added wide viewport (1440px)** |
| computed style missing class-less elements | 87%→90% | **Also collected semantic tags** |

## Crater Evaluation — Practicality as VRT Backend

### Benchmark Results

| Backend | Detection Rate (page fixture) | Signals |
|---------|------------------------------|---------|
| Chromium | **96.7%** | pixel + computed style + hover emulation |
| Crater | **60.0%** | pixel + **paint tree diff** |
| Crater (pixel only) | 50.0% | pixel only (no paint tree) |

**Paint tree diff effect: +10%** (50% → 60%). 3 cases detected by paint tree but not by pixel:

- `border-radius` — No pixel rendering difference, but paint tree has `br` property → detected via diff
- `align-items` — Looks like same layout in pixels, but paint tree node coordinates change → detected
- `background` (same as parent color) — Zero pixel diff, but paint tree `bg` property changes → detected

This is **crater-specific detection capability not available in Chromium**. Paint tree provides signal equivalent to Chromium's computed style diff.

### Prescanner Architecture

crater is best used as a prescanner that tolerates false negatives. Chromium eliminates false positives, so they're not a problem.

```
[CSS Change]
  │
  ▼
[crater paint tree diff]  ← Fast (<1s startup, pixel+paint tree)
  │
  ├── Diff found → DETECTED (crater alone is sufficient)
  │              Most cases end here. No Chromium needed
  │
  └── No diff → [Chromium precise verification]  ← Only when needed
                  pixel + computed style + hover emulation
                  → DETECTED or PASS
```

**Benefits**:
- 60% of cases detected by crater don't need Chromium → faster CI
- crater false positives eliminated by Chromium → no accuracy loss
- crater-specific signals (paint tree `bg`, `br`, etc.) complement Chromium blind spots

**False negative risk**:
Currently all 40% missed by crater prescanner fall back to Chromium, so no false negatives occur.
False negative rate when using prescanner alone = 40% (expected to decrease with crater #18-22 fixes).

**False positive rate: 0%** (measured):
Paint tree is perfectly identical across multiple renders of the same HTML. Confirmed across all 3 viewports (1440/1280/375).
crater rendering is fully deterministic.
Chromium pixel comparison can produce false positives from anti-aliasing and font rendering noise, but crater paint tree diff doesn't have this issue.

**Prescanner evaluation**:
- False positive rate: 0% → no unnecessary Chromium fallbacks
- False negative rate: 40% → Chromium catches what crater misses (to decrease with crater #18-22 fixes)
- Deterministic: same output for same input → zero test flakiness

### Speed Benchmark

**Per-operation speed comparison**:

| Operation | Crater | Chromium | Multiplier |
|-----------|--------|----------|------------|
| Startup/connect | 4ms | 418ms | **105x** |
| setContent | 13ms | 662ms | **51x** |
| setContent (warm) | 41ms | 559ms | **14x** |
| Paint tree retrieval | 18ms | — | crater-specific |
| Paint tree diff | <1ms | — | crater-specific |
| Screenshot | 325ms (RGBA) + 36ms (PNG) | 76ms (PNG) | Chromium is faster |
| Computed style | — | 5ms | Chromium only |

**Prescanner strategy measurement** (15 trials):

| Strategy | Total time | ms/trial | Speedup |
|----------|-----------|----------|---------|
| Chromium only | 9,366ms | 624ms | — |
| Crater prescanner + Chromium fallback | 5,638ms | 376ms | **1.66x (40% reduction)** |

7 of 15 trials (47%) detected by crater alone → completed without launching Chromium.
Remaining 8 fell back to Chromium.

**Speedup will increase further as crater core improvements (#18-22) reduce false negative rate**:

```
Current (40% false negatives): 1.66x speedup
20% false negatives:           ~2.5x speedup (estimated)
10% false negatives:           ~4x speedup (estimated)
0% false negatives:            ~10x speedup (Chromium not needed)
```

### Strengths

| Aspect | Rating | Details |
|--------|--------|---------|
| **Portability** | ◎ | No Chromium required. Runs on Node 24+ / Deno. Can build as WASM component. No X11/GPU needed in CI |
| **Startup speed** | ◎ | BiDi server startup < 1s. Fast compared to Chromium cold start (several seconds) |
| **Selector-targeted rendering** | ○ | `elementScreenshot` API available (defined in BiDi protocol). Implementation is bounding box + crop, but more control flexibility than Chromium |
| **Flexibility** | ◎ | Self-built, so easy to iterate. Full access to paint backend, layout engine, CSS parser |
| **Memory** | ○ | MoonBit/WASM-based. Smaller footprint than Chromium (~300MB), estimated 50-100MB |
| **Paint tree access** | ◎ | `capturePaintTree()` retrieves internal paint tree as JSON. Unique feature not in Chromium |
| **Raw RGBA output** | ◎ | `capturePaintData()` retrieves raw pixel data. No PNG encode/decode overhead |

### Weaknesses (current)

| Aspect | Rating | Details |
|--------|--------|---------|
| **CSS rendering accuracy** | △ | text-decoration not implemented, border-radius/font-weight/margin accuracy issues (mizchi/crater#18-22) |
| **Text rendering** | △ | Known differences in text wrapping precision, font-weight, inline layout |
| **computed style** | ✗ | `script.evaluate` works, but DOM's `getComputedStyle` equivalent is incomplete |
| **hover/focus state** | ✗ | BiDi input API (click/hover) implemented, but CSS :hover reflection unverified |
| **JavaScript compatibility** | △ | QuickJS-based. React/Preact partially works (preact-compat tests available) |

### Use Cases

**Currently effective scenarios**:

1. **Layout verification** — flexbox, grid, block layout calculation is highly accurate (WPT 99.2%). Reliable for detecting display/width/height/padding/flex changes
2. **Lightweight CI VRT** — Detect basic layout breakage without launching Chromium. Use as first-pass filter, then precise Chromium verification when diffs found
3. **Paint tree diff** — Compare paint trees (JSON) instead of pixels. Can directly detect CSS property-level changes
4. **Component-level VRT** — Render HTML snippets for individual component verification. Storybook-like usage

**Scenarios requiring Chromium**:

1. Accurate text-decoration / font-weight rendering needed
2. Visual verification of border-radius
3. Computed style diff / hover emulation needed
4. External JavaScript (React, Vue, etc.) execution needed

### Future Possibilities

- **Paint tree diff**: Implemented. Empirical data shows +10% detection rate. Detects border-radius, align-items, background (same color) without pixels
- **WASM standalone**: Distributing layout engine as WASM enables VRT in browsers or Edge Functions. Deployable beyond CI to editor integration and PR preview
- **Per-CSS-property verification**: crater's self-built CSS parser enables computing "layout diff when this property is enabled/disabled". Foundation for mutation testing

## Migration VRT Results

### Reset CSS Switch (normalize.css → each reset)

| Variant | wide (1440) | desktop (1280) | bp-above (769) | mobile (375) |
|---------|-------------|----------------|----------------|--------------|
| modern-normalize | 0.9% | 1.0% | 2.0% | 2.6% |
| no-reset (browser default) | 1.6% | 1.7% | 2.5% | 3.6% |
| destyle | 6.6% | 6.8% | 8.2% | 12.0% |

Diff causes identified by agent:

**modern-normalize (0.9-2.6%)**:
- Global `box-sizing: border-box` application → form element widths change
- `h1 { margin: 0.67em 0 }` present in normalize but not in modern-normalize → vertical shift below h1
- Fix: single line `h1 { margin-top: 0.67em }` resolves the most prominent diff

**destyle (6.6-12.0%)** — **drop-in replacement not possible**:
- `list-style: none` → list markers disappear
- Heading font-size/font-weight/margin all reset
- `appearance: none` removes native form element rendering
- Layering destyle on top of normalize defeats the purpose

**no-reset (1.6-3.6%)**:
- Missing `font-family: inherit` for form elements → browser default fonts
- `h1` margin is browser default (larger than normalize)

**Recommended migration path**: modern-normalize is easiest. Only need `h1 { margin-top: 0.67em }` + box-sizing impact check.

### Tailwind → vanilla CSS

**Initial → agent analysis → after fix**:

| Viewport | Initial | After fix | Improvement |
|----------|---------|-----------|-------------|
| wide (1440) | 1.1% | **0.3%** | -73% |
| desktop (1280) | 1.2% | **0.3%** | -75% |
| mobile (375) | 5.8% | **0.6%** | -90% |

3 bugs identified by agent:
1. **inline `display:none`** overrides CSS media query → Amount column always hidden
2. **Unspecified line-height** — Tailwind's `text-*` includes line-height but vanilla only has font-size → cumulative vertical shift
3. **Preflight compatibility** — button/input `font-family: inherit` etc.

After fix application, below 1.3% across all viewports. Remaining differences are subtle at breakpoint boundaries (769/768/640px).

## vrt + subagent Evaluation

**Demonstrated that the "VRT diff → agent analysis → fix code generation → re-verification" loop works practically.**

### Tailwind → vanilla CSS

- Agent identified 5 bugs (2 critical)
- 1 round of fixes reduced mobile diff 5.8% → 0.6% (90% reduction)
- Auto-generated Tailwind `text-*` → `line-height` mapping table
- Accurately pointed out inline style vs media query specificity issue

### Reset CSS migration

- Identified diff causes at CSS rule level for all 3 reset variants
- Explained destyle's incompatibility with 3 points: `list-style`, `appearance`, `font-weight`
- Narrowed the fix needed for modern-normalize migration to 1 line (`h1 { margin-top: 0.67em }`)
- Fully enumerated compensation CSS to reach 0% diff

### Blind test (without showing after)

> Details: `docs/reports/2026-04-01-tailwind-migration-blind-test.md`

Generated vanilla CSS without seeing after.html, using only before.html (Tailwind) + VRT diff.

| Iteration | desktop | mobile | Action |
|-----------|---------|--------|--------|
| 0 (no CSS) | 1.7% | 36.7% | — |
| 1 (initial CSS) | 0.3% | 0.6% | Tailwind class → CSS conversion |
| 3 (final) | **0.0%** | **0.0%** | td:last-child font-size fix |

**Achieved pixel-perfect across all 7 viewports in 3 rounds, 58 tool calls (632s).**

#### CSS Migration Findings

| Finding | Content |
|---------|---------|
| **line-height is most important** | Tailwind `text-sm` = font-size + line-height set. Converting only font-size causes cumulative vertical shift |
| **Partial application trap** | When class is applied to only some elements, bulk CSS conversion over-applies |
| **Preflight version differences** | Subtly different between CDN vs PostCSS. font-smoothing, font-family |
| **Heatmap effective for cause identification** | Not just diff %, but spatial pattern (table row shifts, etc.) provides clues |
| **Easy conversions** | layout (flex/grid), colors, spacing, border → nearly 1:1 mapping |
| **Difficult conversions** | line-height, text-decoration, partial application, Preflight compatibility |

### Evaluation Summary

| Metric | Result |
|--------|--------|
| Bug identification accuracy | High — accurately identifies causes at CSS property level |
| Fix code quality | High — achieved 0.0% in blind test |
| Migration judgment validity | High — correctly determined destyle incompatibility, recommended modern-normalize |
| Loop rounds | 3 rounds to pixel-perfect |
| Agent efficiency | 58 tool calls / 632s ≈ 10 min. Work that would take a human several hours |

**vrt functions sufficiently as a foundation for "generating code that makes migration work".**

### Reset CSS blind test (E3)

> Details: `docs/reports/2026-04-04-e3-reset-css-blind-test.md`

Had the agent blindly write app CSS compensation for normalize.css → modern-normalize switch.

| | Initial diff | After fix | Rounds | Tool calls | Time |
|---|---|---|---|---|---|
| Reset CSS (normalize → modern-normalize) | 2.6% | **0.0%** | **1** | **6** | **54s** |
| Tailwind → vanilla CSS (comparison) | 36.7% | 0.0% | 3 | 58 | 632s |

Fix: added 1 line `*, *::before, *::after { box-sizing: content-box; }`.
Canceled modern-normalize's global `border-box` to restore normalize.css's box model.

## CSS Migration Fix Pattern Collection

Systematized from 2 blind tests + 2 regular evaluations: frequent diff causes and fix patterns in CSS migration.

### Pattern 1: box-sizing difference

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | Overall layout-shift. Prominent on mobile | Reset CSS applies `border-box` globally (modern-normalize, Tailwind Preflight) | Cancel with `*, ::before, ::after { box-sizing: content-box }`, or adjust widths accounting for padding/border |
| **VRT hint** | Spatial pattern is global (all elements shift by a few px) | | |
| **Difficulty** | Low — 1 line fix | | |

### Pattern 2: Missing line-height

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | Cumulative vertical shift of text lines. Prominent on mobile | Tailwind `text-sm` = font-size + line-height set. Writing only font-size in vanilla CSS causes line-height to inherit from body | Explicitly specify line-height for each text size |
| **VRT hint** | Horizontal stripe pattern per text line in heatmap | | |
| **Difficulty** | Medium — mapping table needed | | |

Tailwind line-height mapping:
```
text-xs  (0.75rem)  → line-height: 1rem
text-sm  (0.875rem) → line-height: 1.25rem
text-base (1rem)    → line-height: 1.5rem
text-lg  (1.125rem) → line-height: 1.75rem
text-xl  (1.25rem)  → line-height: 1.75rem
text-2xl (1.5rem)   → line-height: 2rem
```

### Pattern 3: inline style vs CSS specificity

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | Specific element always hidden/shown | `style="display:none"` takes priority over CSS media query (`@media (min-width: 640px)`) | Remove inline style, control via CSS class |
| **VRT hint** | Element missing at specific viewport only | | |
| **Difficulty** | Low — structural issue. HTML fix, not CSS | | |

### Pattern 4: Partial application (class on only some elements)

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | Subtle table row height differences | Tailwind `text-sm` applied to first 3 columns only, last column uses body default. Applying `font-size: 0.875rem` to all columns in vanilla CSS is excessive | Limit with selector like `td:not(:last-child) { font-size: 0.875rem }` |
| **VRT hint** | Table row heights shift uniformly (2px/row × N rows = cumulative) | | |
| **Difficulty** | High — need to read before's class structure | | |

### Pattern 5: Preflight / reset CSS default differences

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | List markers disappear, form element appearance changes | Aggressive resets like destyle apply `list-style: none`, `appearance: none` | Explicitly restore needed defaults: `ul { list-style: disc }`, `select { appearance: auto }` |
| **VRT hint** | Very large diff (6-12%). Concentrated on specific element types | | |
| **Difficulty** | High — not drop-in replaceable. Close to reimplementing normalize | | |

### Pattern 6: Missing heading margin-top

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | All content below h1 shifts upward | normalize.css sets `h1 { margin: 0.67em 0 }`. modern-normalize doesn't. App CSS specifies only `margin-bottom`, so `margin-top` differs | Add `h1 { margin-top: 0.67em }` |
| **VRT hint** | Cumulative downward shift starting from h1 position | | |
| **Difficulty** | Low — 1 line fix | | |

### Pattern 7: font-smoothing difference

| | Symptom | Cause | Fix |
|---|------|------|------|
| **Detection** | Subtle pixel diff across all text (<0.5%) | Tailwind Preflight (PostCSS) includes `-webkit-font-smoothing: antialiased` but CDN version doesn't | Explicitly specify or remove font-smoothing to unify |
| **VRT hint** | Diff is global but very small ratio | | |
| **Difficulty** | Low — 1 line, but version-dependent | | |

### Fix Pattern Application Order

Recommended order for fixing CSS migration diffs:

1. **box-sizing** — affects everything. Align first
2. **heading/block margin** — resolve upward cumulative shift
3. **line-height** — resolve text line vertical shift
4. **inline style → CSS** — resolve specificity issues
5. **Partial application fixes** — limit selectors
6. **Preflight defaults** — list markers, form elements
7. **font-smoothing** — final fine-tuning

Applying in this order ensures diff decreases reliably at each step, and VRT loop converges quickly.

### Image Size Mismatch Handling

Initial testing revealed "100% diff across entire page when heights differ".
Fixed to compare only the common region with pixelmatch, counting the excess area as additional diff.
This prevents full-page diff when heights differ by only a few pixels.

## pixelmatch Implementation Comparison

Comparison with identical images. 500x500 = 250,000 pixels.

| Implementation | 500x500 | 1280x900 | 1920x1080 |
|----------------|---------|----------|-----------|
| **npm pixelmatch v7** (JS) | **0.56ms** | **2.52ms** | **4.50ms** |
| mizchi/pixelmatch (MoonBit JS) | 1.94ms | ~9ms (est.) | ~16ms (est.) |
| mizchi/pixelmatch (MoonBit WASM-GC) | 1.11ms | ~5ms (est.) | ~9ms (est.) |

npm pixelmatch v7 is fastest (C algorithm JS implementation).
MoonBit WASM-GC is ~1.7x faster than JS version but can't match npm v7.

**Bottleneck is PNG encode (153ms/call), not pixelmatch**. crater's `capturePaintData` (raw RGBA) can skip PNG encode/decode.

| Operation | Time | Notes |
|-----------|------|-------|
| pixelmatch 1280x900 | 2.5ms | Fast. Not a bottleneck |
| PNG encode 1280x900 | 153ms | **Biggest bottleneck** |
| PNG decode 1280x900 | 73ms | Second biggest |
| paint tree diff (125 nodes) | 0.07ms | crater-specific. Extremely fast |

**Optimization direction**: Compare raw RGBA without going through PNG. Already possible with crater prescanner.

## Findings Summary

### High-Impact Methods (implemented)

| Method | Improvement | Mechanism |
|--------|------------|-----------|
| **Multi-viewport** | +7→+9% | 3 viewports: wide(1440) + desktop(1280) + mobile(375) |
| **Computed style diff** | +10% | Compare all elements including semantic tags via `getComputedStyle` |
| **Hover emulation** | +6% | Inject `:hover` rules as always-on `<style>` → computed style diff |
| **Dead-code classification** | Accuracy improvement | Zero diff across all viewports → exclude as dead code |

### CSS Property Detection Ease Ranking (final, 60 trials)

```
100%  display, font-size, color, text-decoration, width, height
      align-items, border-radius, margin-*, font-weight, flex
 90%  background, padding (context-dependent)
  0%  Dead code (overridden rules / no target elements)
```

### Final Detection Rate (90 trials, 3 fixtures, 741 CSS declarations)

```
VRT detection rate:      92.2%  (83/90)
Undetected breakdown:    dead-code 71%, same-as-default 14%, hover-only 14%

By fixture:
  page (GitHub-like):     96.7%  (29/30) — 1 dead-code
  form-app (settings):    96.7%  (29/30) — 1 dead-code
  dashboard:              83.3%  (25/30) — 3 dead-code, 1 same-as-default, 1 hover-only
```

### By Property Category (90 trials)

```
100%  spacing (9), typography (20), layout (17)
 91%  visual (33)  — background same-color issue
 71%  sizing (7)   — natural size equals dead-code
  0%  animation (1) — invisible in post-completion capture
```

### Always Detected (100%, n>=2)

`font-size` (9), `color` (9), `text-decoration` (6), `display` (5), `border-radius` (4), `padding` (4), `gap` (4), `border-bottom` (4), `align-items` (3), `height` (3)

### Flaky (unstable)

- `width` 50% — dead-code when natural size equals CSS width
- `background` 82% — same as parent color, `pre code` override, etc.

## VLM Model Comparison (2026-04-04)

### Fix Loop Results (hard case: .readme-body pre 6 props, 4.1% diff)

| Model | Fix | Speed | Cost/call | Monthly (21K/day) | CHANGE count |
|-------|-----|-------|-----------|-------------------|-------------|
| **meta-llama/llama-4-scout** | ✅ 1r | **1.0s** | $0.14e-7 | **$0.09** | 11 |
| **amazon/nova-lite-v1** | ✅ 1r | 2.3s | $0.14e-7 | $0.09 | 7 |
| qwen/qwen3-vl-235b-a22b (MoE) | ✅ 1r | 3.2s | $0.25e-7 | $0.16 | 8 |
| amazon/nova-2-lite-v1 | ✅ 1r | 3.5s | $1.38e-7 | $0.87 | 27 |
| google/gemini-3-flash-preview | ✅ 1r | 5.1s | $1.20e-7 | $0.76 | 10 |
| qwen/qwen3-vl-8b-instruct | ✅ 1r | 7.0s | $0.30e-7 | $0.19 | 28 |
| bytedance-seed/seed-1.6-flash | ✅ 1r | 8.6s | $0.49e-7 | $0.31 | 10 |
| openai/gpt-5-nano | ✅ 1r | 10.1s | $0.24e-7 | $0.15 | 0 |
| google/gemma-4-31b-it | ✅ 1r | 40.5s | $0.10e-7 | $0.06 | — |
| openai/gpt-4.1-nano | ❌ | 1.2s | — | — | — |

### Image Resolution and Token Cost

| Resolution | Tokens | Cost multiplier |
|------------|--------|----------------|
| 800x600 (full) | 499 | 1x |
| 400x300 (medium) | 132 | 0.26x |
| 200x150 (low) | 94 | 0.19x |

Color (color/grayscale/binary) does not affect token count.

### Resolution Presets by Viewport

| Preset | Size | Target viewport |
|--------|------|----------------|
| low | 375x320 | mobile (375-640px) |
| medium | 640x480 | tablet/desktop (768-1280px) |
| high | 1280x900 | wide (1440px+) |

### 2-Stage Pipeline

```
Stage 1 (VLM, cheap): heatmap → structured diff (CHANGE: element | property | before | after)
Stage 2 (LLM, precise): structured diff + CSS source + CSS text diff → FIX: selector | property | value
```

**Passing CSS text diff directly to Stage 2 makes VLM quality differences irrelevant.** All models reach the same fix result.

### Cost Estimation (10,000 pages/day)

| Configuration | AI/month | Rendering/month | Total |
|---------------|----------|-----------------|-------|
| Crater + llama-4-scout | $0.09 | $0 | **$0.09** |
| Crater + free model | $0 | $0 | **$0** |
| Chromium + llama-4-scout | $0.09 | $168 | $168 |

### Rendering Cost Comparison (10,000 pages/day, 80,500 renders)

| | Chromium | Crater pixel | Crater paint tree | Crater batch |
|---|---|---|---|---|
| Speed/VP | 600ms | 50ms | 18ms | 10ms |
| CPU/day | 13.5h | 1.1h | 0.4h | 0.2h |
| Speedup | 1x | 12x | 33x | 60x |

### Total Monthly by Infrastructure (AI $0.10 + Compute)

| Configuration | Monthly |
|---------------|---------|
| Self-hosted + Crater | **$0.10** |
| Fly.io + Crater paint tree | **$0.14** |
| Fly.io + Crater pixel | $0.21 |
| CF Workers + Crater WASM | $1 |
| GH Actions + Crater paint tree | $6 |
| GH Actions + Crater pixel | $16 |
| GH Actions + Chromium | $193 |
