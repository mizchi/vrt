# VLM Model Benchmark v2 — Latest Model Comparison

**Date**: 2026-04-04
**Test**: fix-loop (page, seed 11, .readme-body pre 6 props, 4.1% diff) + VLM standalone quality

## Fix Loop Results

| Model | Fix | Rounds | VLM speed | Cost/call | Monthly (21K/day) |
|-------|-----|--------|-----------|-----------|-------------------|
| **meta-llama/llama-4-scout** | ✅ | 1 | **1.0s** | $0.14e-7 | **$0.09** |
| **amazon/nova-lite-v1** | ✅ | 1 | 2.3s | $0.14e-7 | $0.09 |
| amazon/nova-2-lite-v1 | ✅ | 1 | 3.5s | $1.38e-7 | $0.87 |
| qwen/qwen3-vl-235b-a22b (MoE) | ✅ | 1 | 3.2s | $0.25e-7 | $0.16 |
| qwen/qwen3-vl-8b | ✅ | 1 | 7.0s | $0.30e-7 | $0.19 |
| bytedance-seed/seed-1.6-flash | ✅ | 1 | 8.6s | $0.49e-7 | $0.31 |
| google/gemini-3-flash-preview | ✅ | 1 | 5.1s | $1.20e-7 | $0.76 |
| openai/gpt-5-nano | ✅ | 1 | 10.1s | $0.24e-7 | $0.15 |
| openai/gpt-4.1-nano | ❌ | 2 | 1.2s | — | — |
| google/gemma-4-31b-it | ✅ | 1 | 40.5s | $0.10e-7 | $0.06 |

## VLM Standalone Quality (CHANGE Detection Count)

| Model | CHANGE count | Notes |
|-------|-------------|-------|
| qwen3-vl-8b | 28 | Most detections (may include duplicates) |
| nova-2-lite | 27 | High quality but 10x cost |
| **llama-4-scout** | **11** | Accurate, few duplicates |
| seed-1.6-flash | 10 | |
| gemini-3-flash | 10 | |
| qwen3-vl-235b | 8 | MoE, concise |
| nova-lite | 7 | Concise |
| gpt-5-nano | 0 | Doesn't follow format |

## Recommendations

| Use case | Model | Reason |
|----------|-------|--------|
| **Default (best cost-performance)** | **llama-4-scout** | Fastest (1s), cheapest ($0.14e-7), sufficient quality |
| Stability-focused | nova-lite | Proven track record, same cost, slightly slower |
| Quality-focused | nova-2-lite | 27 changes detected, 10x cost |
| Large-scale MoE | qwen3-vl-235b | Stable, concise output |

## Conclusion

**When CSS diff exists, VLM quality differences don't affect fix results** (all models reach 0.0%).
The only differences are latency and cost. llama-4-scout is best at 1.0s/$0.14e-7.

*Regenerate: `just vlm-bench --md <models...>`*
