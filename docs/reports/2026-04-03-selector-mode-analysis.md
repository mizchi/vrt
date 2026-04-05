# Selector Block Deletion Mode Analysis

## Investigation Results

Calling `diffComputedStyles` directly yields 54 diffs, but 0 through the bench runner.
The cause may be different snapshot formats between `captureComputedStyleSnapshotInDom` (refactored version for bench)
and direct `page.evaluate`.

**Next action**: Verify whether `captureComputedStyleSnapshotInDom` snapshots return
the same keys for baseline/broken and check for format conversion loss.

## Current Status (page fixture, 15 trials)

| Signal | property mode | selector mode | Notes |
|--------|--------------|---------------|-------|
| Visual diff (pixel) | 76.7% | 93.3% | Full selector deletion creates large pixel changes |
| Computed style diff | 73.3% | 0% | **Bug: tracked targets filter is incomplete** |
| Hover diff | 6.7% | 0% | Same as above |
| A11y diff | 16.7% | 46.7% | Full selector deletion changes element visibility |
| Any signal | 93.3% | 93.3% | Pixel diff alone catches these |

## Directions for Improving Detection Accuracy

### 1. Make computed style diff work correctly in selector mode

Current bug: In selector mode, `removed` is only the first declaration of the block,
so `findExpectedComputedStyleTargets` only tracks 1 property.
→ Fixed to pass all declarations in the block, but the filter logic (`filterComputedStyleDiffsByTargets`)
may be missing matches on selector names.

**Fix proposal**: In selector mode, bypass the tracked targets filter and treat all computed style diffs as detections.

### 2. Compare computed style snapshots per block before/after deletion

Current: Get computed styles for all elements → diff the whole thing
Improvement: Focus comparison on computed styles of elements matching the deleted selector

```typescript
// When the ".header" block is deleted:
// 1. Get target elements with document.querySelectorAll(".header")
// 2. Compare computed styles between baseline and broken
// 3. If different → detected
```

### 3. CSS selector → affected element mapping

Identify which DOM elements a CSS selector affects using Playwright's `page.locator()`,
then compare only those elements' computed style/bounding box.

```typescript
const elements = await page.locator(removedBlock.selector).all();
for (const el of elements) {
  const before = await el.evaluate(getComputedStyle);
  // ... after CSS deletion ...
  const after = await el.evaluate(getComputedStyle);
  // diff
}
```

### 4. DOM bounding box diff

Compare element bounding boxes (`getBoundingClientRect`) instead of computed styles.
Deleting a CSS selector changes layout, so bounding box changes detect it.

Faster than pixel diff and simpler than computed style.

### 5. Leveraging Crater paint tree diff

For selector mode, crater paint tree diff is most effective:
- Paint tree contains CSS property computation results
- Deleting a selector changes bg, color, fs, bounds in the paint tree
- Tells "what changed" at the property level, unlike pixel diff

### 6. Improving recovery accuracy (LLM-based)

To improve recovery accuracy, not just detection:

1. **Increase information in diff reports**
   - "This element's padding changed from 12px 24px → 0" (computed style diff)
   - "This element changed from flex → block" (paint tree diff)
   - "This element's height changed from 64px → 48px" (bounding box diff)

2. **Inference from remaining CSS**
   - If a `:hover` rule with the same name as the deleted selector remains, the original selector existed
   - Consistency check with other rules applying to the same element

3. **Inference from HTML structure**
   - Viewing HTML structure of elements with `.header` class suggests needed styles
   - Consistency with surrounding elements (referencing styles of other children of the same parent)

## Priority

| Approach | Impact | Cost | Priority |
|----------|--------|------|----------|
| Computed style diff bug fix | High (0% → 70%+) | Low | **Immediate** |
| Crater paint tree diff | High | Low (existing) | **High** |
| CSS selector → affected element mapping | Medium | Medium | Medium |
| DOM bounding box diff | Medium | Low | Medium |
| LLM recovery accuracy | High | High | Defer |
