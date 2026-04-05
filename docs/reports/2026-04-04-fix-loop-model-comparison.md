# Fix Loop Model Comparison

**Date**: 2026-04-04
**Test case**: page fixture, seed 11, `.readme-body pre` (6 props) deletion, selector mode
**Difficulty**: High (4.1% diff, entire code block's background/border/border-radius/padding/overflow/margin)

## Results

| VLM Model | Rounds | Final diff | Total time | Cost |
|-----------|--------|-----------|------------|------|
| **qwen3-vl-8b** | **1** | **0.0%** | 8.6s | ~FREE |
| **nova-lite** | **1** | **0.0%** | 8.4s | ~FREE |
| **qwen3-vl-32b** | **1** | **0.0%** | 9.5s | ~FREE |
| gemini-2.0-flash | 3 | 0.0% | 16.4s | ~FREE |

**All models FIXED.** The improvement of passing CSS diff directly to Stage 2 removed dependency on VLM image analysis quality.

## Analysis

### Why All Models Succeed

1. **CSS text diff contains the answer**: `MISSING: .readme-body pre { background: #f6f8fa }` etc.
2. **Stage 2 (LLM) generates fixes directly from CSS diff**: VLM image analysis is merely supplementary
3. **Selector validation filter**: Excludes fixes proposing non-existent selectors
4. **Dry-run + rollback**: Fixes that worsen results are not applied

### Why gemini-2.0-flash Took 3 Rounds

- Round 1: LLM couldn't convert CSS diff MISSING lines to fixes (0 fixes)
- Round 2: Proposed 11 fixes but also changed @media rules → worsened to 47.8% → rollback
- Round 3: Filter excluded 5 → applied 6 fixes → 0.0%

### VLM's Actual Contribution

When CSS diff exists, VLM image analysis is **not very important**.
VLM is truly needed when:
- CSS diff doesn't exist (original CSS unknown)
- Diff cause is HTML structure change, not CSS
- Visual quality judgment (color contrast, layout aesthetics, etc.)

## Recommended Configuration

| Use case | VLM | LLM | Reason |
|----------|-----|-----|--------|
| **Fast fix (with CSS diff)** | any (nova-lite recommended) | qwen3-vl-8b | VLM quality irrelevant when CSS diff exists |
| **No CSS diff** | qwen3-vl-8b or qwen3-vl-32b | Gemini/Claude | VLM quality matters |
| **Cost-focused** | nova-lite | qwen3-vl-8b | Cheapest, sufficient quality |
