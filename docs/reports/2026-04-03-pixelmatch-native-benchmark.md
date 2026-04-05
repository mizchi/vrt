# pixelmatch Implementation Comparison Benchmark (native added)

**Date**: 2026-04-03

## Results

Comparison with 500x500 identical images:

| Implementation | Time | Multiplier (vs npm v7) |
|----------------|------|:----------------------:|
| **MoonBit native** | **85µs** | **6.6x faster** |
| npm pixelmatch v7 (JS) | 560µs | 1x |
| MoonBit WASM-GC | 1,110µs | 0.5x |
| MoonBit JS | 1,940µs | 0.3x |

## Native Build Fix

MoonBit native build requires `mizchi/zlib`'s FFI stub (`zlib_impl_native.c`) to link against the system's zlib.

**Problem**: `cc-link-flags: "-lz"` is set in `mizchi/zlib`'s `moon.pkg`, but it doesn't auto-propagate to the link stage of dependent test/bench binaries.

**Fix** (mizchi/pixelmatch):
```
# Add to src/moon.pkg
options(
  link: { "native": { "cc-link-flags": "-lz" } },
)
```

Must be added to both `src/moon.pkg` and `src/e2e/moon.pkg`.

## Implications for VRT harness

- **PNG encode (153ms) is the biggest bottleneck** — pixelmatch itself is fast
- Native pixelmatch is 85µs (6.6x) but calling from Node.js requires WASM component bridge
- **Optimization direction**: crater's `capturePaintData` (raw RGBA) → direct pixelmatch comparison, skipping PNG encode/decode
- Paint tree diff (0.07ms) is comparable speed to pixelmatch native (0.085ms)
