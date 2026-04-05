# VRT Cost Estimation — 10,000 pages/day

## Assumptions

| Parameter | Value |
|-----------|-------|
| Pages | 10,000 |
| Viewports/page | 7 (3 standard + 4 breakpoint boundary) |
| Total viewports | 70,000 |
| Diff occurrence rate | 30% (21,000 viewports) |
| Stage 2 (fix) target | 10% of pages (1,000) |

## Stage 1 (VLM Image Analysis) Cost — 21,000 calls/day

| Model | /call | /day | /month | /year |
|-------|-------|------|--------|-------|
| **gemma-3-27b:free** | FREE | FREE | FREE | FREE |
| **amazon/nova-lite** | $0.00002 | $0.004 | **$0.12** | $1 |
| **gemini-2.0-flash-lite** | $0.00002 | $0.005 | **$0.15** | $2 |
| **qwen3-vl-8b** | $0.00003 | $0.007 | **$0.22** | $3 |
| gemini-2.0-flash | $0.00003 | $0.007 | $0.20 | $2 |
| gpt-4o-mini | $0.0001 | $0.01 | $0.30 | $4 |
| claude-3.5-haiku | $0.003 | $0.06 | $2 | $23 |
| claude-sonnet-4 | $0.01 | $0.23 | $7 | $85 |
| gpt-4o | $0.008 | $0.17 | $5 | $61 |

## Stage 1 + Stage 2 (Analysis + Fix) Total Cost

| Combination | S1/day | S2/day | **Total/month** |
|-------------|--------|--------|-----------------|
| **gemma-3:free + same** | FREE | FREE | **FREE** |
| **qwen3-vl-8b + gemini-flash** | $0.007 | $0.001 | **$0.24** |
| **gemini-flash + same** | $0.007 | $0.001 | **$0.22** |
| qwen3-vl-8b + haiku | $0.007 | $0.006 | $0.39 |
| qwen3-vl-8b + sonnet | $0.007 | $0.02 | $0.85 |
| gemini-flash + sonnet | $0.007 | $0.02 | $0.83 |

## Rendering Cost

| Backend | /viewport | Total time | CI cost (GH Actions) |
|---------|-----------|------------|---------------------|
| **Chromium** | 600ms | 11.7h | **$5.60/day** |
| **Crater (prescanner)** | 50ms | 1.0h | Self-hosted (free) |

## Total Cost Comparison

| Configuration | AI cost/month | CI cost/month | **Total/month** |
|---------------|--------------|---------------|-----------------|
| **Crater + gemma:free** | $0 | $0 | **$0** |
| **Crater + qwen3-vl-8b** | $0.24 | $0 | **$0.24** |
| Chromium + gemma:free | $0 | $168 | $168 |
| Chromium + qwen3-vl-8b | $0.24 | $168 | $168 |
| Chromium + sonnet | $25 | $168 | $193 |

## Conclusion

- **AI cost is negligible** — $0.24/month even at 10,000 pages/day (qwen3-vl-8b)
- **The real cost is rendering** — $168/month for Chromium vs $0 for Crater
- **Recommended configuration**: Crater prescanner + qwen3-vl-8b → **$0.24/month**
- Use Claude/Gemini at Stage 2 only when fixes are needed → +$0.60/month

> Regenerate: `node --experimental-strip-types src/vlm-bench.ts --list` to check model prices
