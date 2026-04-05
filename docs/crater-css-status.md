# Crater CSS Rendering Verification Status

> Classified from CSS challenge benchmark (page fixture, 30 trials) results.
> Verifies whether pixel diff can detect single CSS line deletion when rendering HTML with Crater BiDi server.

## Summary

| Status | Count | Ratio | Description |
|--------|-------|-------|-------------|
| **Detected (verified)** | 15 | 50% | Detectable via pixel diff same as Chromium |
| **Undetected (broken)** | 8 | 27% | Detectable in Chromium but not in crater |
| **Common limitations (out-of-scope)** | 7 | 23% | Not detectable in Chromium either (dead-code, hover-only, etc.) |

## Detected (verified) — CSS correctly rendered in crater

| Property | Selector example | diff rate | Notes |
|----------|-----------------|-----------|-------|
| `padding` | `.readme-header` | 2-5% | Spacing accurate |
| `font-size` | `.tab`, `.sidebar-desc`, `.header-nav a` | 1-4% | Text size difference detectable |
| `color` | `.file-table .date`, `.tab` | <1% | Color changes detected |
| `display` | `.badge`, `.file-table .file-icon`, `.repo-badges` | 0-2% | Element show/hide |
| `width` | `.file-table`, `.sidebar` | 1-2% | Size changes |
| `height` | `.file-table .file-icon` | <1% | Size changes |
| `border` | `.branch-btn` | <1% | Border rendering |
| `margin` | `.main` | 4% | Detected only at wide viewport |
| `flex` | `.header-search` | <1% | Flex layout |

## Undetected (broken) — Issues with crater rendering accuracy

> These are **detectable in Chromium but not in crater**.
> Candidate list for crater-side fixes.

| Property | Selector | Chromium detection | Estimated cause |
|----------|----------|-------------------|----------------|
| `border-radius` | `.branch-btn` | ✓ (computed) | **Inaccurate border-radius rendering** — no pixel diff before/after deletion |
| `margin-bottom` | `.sidebar-desc` | ✓ (computed) | **Margin collapsing or precision issue** |
| `margin-left` | `.tab-count` | ✓ (computed) | Same as above |
| `align-items` | `.branch-bar` | ✓ (computed) | **Possible incorrect flexbox align-items rendering** |
| `font-weight` | `.repo-name` | ✓ (computed) | **Incomplete font-weight rendering** (known issue: documented in README) |
| `text-decoration: none` | `.repo-name a`, `.header-nav a` | ✓ (computed) | **Different text-decoration initial value** — crater defaults to no underline? |
| `color` | `.footer a` | ✓ (computed) | **Some color changes not detected** |

### Detailed Analysis of broken items

1. **border-radius**: Likely not accurately drawn by crater's paint backend. Deleting it doesn't change appearance = border-radius wasn't applied in the first place.

2. **margin / spacing**: `margin-bottom`, `margin-left` — computed style shows differences but pixel doesn't. Crater's layout engine doesn't accurately reflect these properties.

3. **font-weight**: Known issue documented in README: "Font-weight CSS compute incomplete for `<b>` and `<strong>` tags". Visual impact of font-weight changes is not reproduced in crater.

4. **text-decoration**: Documented in README as "Text-decoration underline not implemented". Deleting text-decoration: none produces no diff since crater doesn't draw underlines in the first place.

5. **align-items**: Flexbox cross-axis alignment. Layout tests pass at 89.2%, so some align-items cases may be unsupported.

## Common Limitations (out-of-scope)

| Reason | Count | Example |
|--------|-------|---------|
| dead-code | 3 | `.readme-body code { background }` (overridden by pre code), `.footer a { color }` |
| hover-only | 2 | `.footer a:hover { text-decoration }` |
| same-as-default | 1 | `.file-table .file-name a { text-decoration: none }` |
| same-as-parent | 1 | `.readme-header { background: #f6f8fa }` |
| content-dependent | 2 | `white-space: nowrap`, `flex-wrap: wrap` |

## CSS Feature Support Status

| CSS Feature | Crater Status | Notes |
|-------------|--------------|-------|
| **display: flex** | ✓ verified | Flexbox layout generally works |
| **display: none** | ✓ verified | Element show/hide |
| **width / height** | ✓ verified | Accurate size calculation |
| **padding** | ✓ verified | Accurate spacing |
| **color** | △ partial | Detection gaps for some selectors |
| **font-size** | ✓ verified | Text size changes detected |
| **flex** | ✓ verified | flex: 1 ratio calculation |
| **border** | ✓ verified | Border rendering |
| **margin** | △ partial | Inaccurate for margin collapse / small margins |
| **border-radius** | ✗ broken | No pixel diff |
| **font-weight** | ✗ broken | Known issue documented in README |
| **text-decoration** | ✗ broken | Underline not implemented (documented in README) |
| **align-items** | ✗ broken | Inaccurate for some cross-axis alignment cases |

## Crater Improvement Priority

1. **text-decoration** (high) — Not implemented. 5/30 CSS challenges are text-decoration related
2. **border-radius** (high) — Requires paint backend fix
3. **font-weight** (medium) — Affects font-weight changes beyond `<b>`/`<strong>`
4. **margin accuracy** (medium) — Inaccurate for small margin-bottom/margin-left values
5. **align-items** (low) — Limited impact scope
