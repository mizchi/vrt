# vrt

Visual Regression Testing toolkit — pixel diff, computed style diff, a11y tree diff, and AI-powered CSS fix generation.

## Features

- **Pixel diff** — pixelmatch v7 + heatmap generation
- **Computed style diff** — `getComputedStyle` capture including hover/focus states
- **A11y tree diff** — accessibility snapshot comparison
- **CSS challenge bench** — automated CSS deletion/recovery with detection rate tracking (96.7%)
- **2-stage AI pipeline** — VLM (image → structured diff) + LLM (diff → CSS fix)
- **Migration VRT** — compare HTML before/after across responsive viewports
- **Snapshot** — URL-based multi-viewport capture with baseline diff
- **Mask** — selector-based masking for dynamic content (animations, counters)
- **Crater integration** — lightweight prescanner via BiDi (1.66x speedup, 0% false positive)

## Quick Start

```bash
pnpm install

# Run tests (341 tests)
pnpm test

# Compare two HTML files
vrt compare before.html after.html

# Compare two URLs
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/

# Snapshot URLs (creates baseline on first run, diffs on subsequent runs)
vrt snapshot http://localhost:3000/ http://localhost:3000/about/ --output snapshots/

# Mask dynamic content
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"

# CSS challenge benchmark
just css-bench --fixture page --trials 30

# Fix loop (break CSS → VLM analyze → LLM fix → verify)
just fix-loop --fixture page --seed 42
```

## CLI

```bash
vrt compare <before.html> <after.html>     # Migration VRT (file or URL)
vrt snapshot <url1> [url2] ...             # Multi-viewport snapshot + diff
vrt bench [options]                         # CSS challenge benchmark
vrt report                                 # Detection pattern report
vrt smoke <file-or-url>                    # A11y-driven random interaction test
vrt serve [--port 3456]                    # API server
vrt status [--url http://localhost:3456]   # Server health check
```

## Architecture

```
HTML (file or URL)
    │
    ├── Pixel diff (pixelmatch v7 → heatmap → diff ratio)
    ├── Computed style diff (getComputedStyle → property-level changes)
    ├── A11y tree diff (accessibility snapshot → structural changes)
    └── Paint tree diff (Crater BiDi → layout tree comparison)
          │
          ▼
    Detection & Classification
          │
          ▼
    AI Fix Pipeline (optional)
      Stage 1: VLM (cheap) → structured CHANGE report
      Stage 2: LLM (accurate) → CSS fix suggestions
          │
          ▼
    Dry-run verification → rollback if worse
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VRT_LLM_PROVIDER` | LLM provider | gemini |
| `VRT_LLM_MODEL` | LLM model | provider default |
| `VRT_VLM_MODEL` | VLM model (OpenRouter) | qwen/qwen3-vl-8b-instruct |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
| `GEMINI_API_KEY` | Google AI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |

## Project Structure

```
src/
  vrt.ts                    # CLI entry point
  snapshot.ts               # URL snapshot + baseline diff
  migration-compare.ts      # HTML/URL comparison across viewports
  css-challenge-bench.ts    # CSS deletion/recovery benchmark
  fix-loop.ts               # AI-powered CSS fix loop
  vrt-reasoning-pipeline.ts # 2-stage VLM + LLM pipeline
  heatmap.ts                # Pixel diff + heatmap generation
  mask.ts                   # Selector-based visibility masking
  vlm-client.ts             # OpenRouter / Gemini VLM client
  llm-client.ts             # Multi-provider LLM client
  crater-client.ts          # Crater BiDi WebSocket client
  api-server.ts             # Hono API server
fixtures/
  css-challenge/            # 9 HTML fixtures for CSS bench
  migration/                # Migration comparison fixtures
docs/
  knowledge.md              # Accumulated experimental findings
  reports/                  # Dated experiment reports
```

## License

MIT
