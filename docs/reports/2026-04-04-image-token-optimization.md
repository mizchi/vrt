# VLM Image Token Optimization

**Date**: 2026-04-04
**Model**: qwen/qwen3-vl-8b-instruct (OpenRouter)

## Resolution vs Token Count

| Resolution | File size | Prompt tokens | Cost/call | Reduction |
|------------|-----------|--------------|-----------|-----------|
| **800x600** (original) | 16KB | 499 | $8.7e-8 | — |
| **400x300** | 6KB | 132 | $6.1e-8 | **73% token reduction** |
| **200x150** | 2KB | 94 | $5.8e-8 | **81% token reduction** |
| **100x75** | 1KB | 94 | $2.7e-8 | **81% token reduction** |

## Color vs Token Count (800x600 fixed)

| Color | File size | Prompt tokens | Difference |
|-------|-----------|--------------|------------|
| Color | 16KB | 499 | — |
| Grayscale | 19KB | 499 | **Same tokens** |
| Binary (B/W) | 9KB | 499 | **Same tokens** |

## Findings

1. **Token count is determined by resolution, not color depth**
   - VLMs split images into tiles for encoding (e.g., 14x14 patches)
   - Tile count ∝ resolution. Color affects the vector representation within each tile but not token count

2. **400x300 is the optimal point**
   - 800x600 → 400x300 gives 73% token reduction (499 → 132)
   - At 200x150, tokens bottom out at 94 (no further reduction below that)
   - VRT heatmaps only need to show diff location, so 400x300 is sufficient

3. **Binarization only reduces file size**
   - Tokens don't decrease but PNG size halves (16KB → 9KB)
   - Contributes to API transfer time reduction

## Recommendations

| Use case | Resolution | Color | Tokens | Notes |
|----------|-----------|-------|--------|-------|
| **High-volume VRT (10K+/day)** | 400x300 | Color | 132 | Cost optimal |
| **Detailed analysis** | 800x600 | Color | 499 | When inspecting subtle diffs |
| **Debugging** | Original | Color | — | For human review, not sent to VLM |

## Revised Cost Estimation (with 400x300 downscaling)

10,000 pages/day, 21,000 VLM calls:

| | 800x600 (current) | 400x300 (optimized) |
|---|---|---|
| tokens/call | 590 | 232 |
| cost/call | $0.089e-7 | $0.035e-7 |
| **Monthly** | **$0.06** | **$0.02** |
