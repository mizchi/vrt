# vrt — Architecture

## CLI Command System

Entry point: `src/vrt.ts`

```
vrt compare <before> <after>           # HTML/URL VRT comparison
vrt compare --url <url> --current-url <url>  # URL mode
vrt snapshot <url1> [url2] ...         # URL → multi-viewport capture + baseline diff
vrt bench [options]                    # CSS challenge benchmark
vrt report                             # Report on accumulated data
vrt discover <file>                    # Breakpoint discovery + viewport suggestions
vrt smoke <file-or-url>                # A11y-driven random operation test
vrt serve [--port 3456]                # API server
vrt status [--url ...]                 # Server health check
```

## Module Structure

```
src/
├── vrt.ts                      # CLI entry point (subcommand dispatch)
│
├── [Detection Pipeline]
│   ├── heatmap.ts              # pixelmatch v7 + heatmap generation
│   ├── computed-style-capture.ts # getComputedStyle capture (in-browser execution)
│   ├── a11y-semantic.ts        # A11y tree diff
│   └── image-resize.ts         # VLM PNG resize (IHDR header reading)
│
├── [CSS Challenge]
│   ├── css-challenge-core.ts   # CSS parsing, computed style, VRT analysis
│   ├── css-challenge-bench.ts  # Benchmark runner
│   ├── css-challenge.ts        # Single recovery challenge
│   └── css-challenge-fixtures.ts # Fixture path resolution
│
├── [AI Fix Pipeline]
│   ├── vrt-reasoning-pipeline.ts # 2-stage VLM + LLM pipeline
│   ├── fix-loop.ts             # CSS break → analyze → fix → verify loop
│   ├── vlm-client.ts           # OpenRouter / Gemini VLM client
│   └── llm-client.ts           # Multi-provider LLM client
│
├── [Migration VRT]
│   ├── migration-compare.ts    # HTML/URL comparison (auto breakpoint discovery)
│   ├── migration-fix-loop.ts   # Auto-fix for migration diffs
│   └── migration-fix-candidates.ts # Fix candidate generation
│
├── [Snapshot]
│   ├── snapshot.ts             # URL → multi-viewport capture + baseline diff
│   └── mask.ts                 # Selector-based visibility masking
│
├── [Detection Pattern Analysis]
│   ├── detection-classify.ts   # CSS property/selector classification
│   ├── detection-db.ts         # JSONL persistence
│   └── detection-report.ts     # Accumulated data aggregation
│
├── [Viewport]
│   └── viewport-discovery.ts   # @media breakpoint extraction + viewport generation
│
├── [Crater Integration]
│   └── crater-client.ts        # Crater BiDi WebSocket client
│
├── [API]
│   ├── api-server.ts           # Hono API server
│   ├── api-types.ts            # API type definitions
│   └── vrt-client.ts           # TypeScript client SDK
│
├── [Common Utilities]
│   ├── terminal-colors.ts      # ANSI color constants + hr()
│   ├── cli-args.ts             # CLI argument parser (getArg, hasFlag, getArgValues)
│   └── types.ts                # Common type definitions
│
├── [Smoke Test]
│   └── smoke-runner.ts         # A11y-driven random operations
│
├── [Approval]
│   ├── approval.ts             # Diff approval rules
│   └── vrt-approve.ts          # Interactive approval CLI
│
└── [flaker Integration]
    ├── flaker-vrt-runner.ts    # flaker custom runner protocol
    └── flaker-vrt-report-adapter.ts # migration-report → flaker conversion
```

## Detection Signals

| Signal | Implementation | Detection Rate (standalone) | Notes |
|--------|---------------|---------------------------|-------|
| Pixel diff | pixelmatch v7 | 77% | All properties; color, size, position |
| Computed style diff | getComputedStyle | 73% | Including hover/focus |
| A11y tree diff | accessibility snapshot | 7% | Structural changes only |
| Multi-viewport | breakpoint ±1px | +16% | Detection at media query boundaries |
| Hover emulation | :hover rules always enabled | +6% | Hover-only properties |
| Paint tree diff | Crater BiDi | 60% | Layout tree comparison |
| **Combined** | | **96.7%** | 9 fixtures, selector mode |

## AI Fix Pipeline

```
Heatmap (PNG) + CSS text diff
    │
    ▼
  Stage 1: VLM (cheap — llama-4-scout $0.14e-7)
    │  Image → structured CHANGE report
    ▼
  Stage 2: LLM (accurate — Gemini)
    │  Structured report + CSS source + CSS diff → FIX proposal
    ▼
  Selector validation filter (exclude fixes for non-existent selectors)
    │
    ▼
  Dry-run verification (apply fix → VRT → rollback if worse)
```

## Masking

Prevent false positives from dynamic content (animations, counters, external data).

```bash
vrt snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"
vrt compare --url http://a.com --current-url http://b.com --mask ".ads"
```

Mechanism: inject `visibility: hidden !important` via `page.addStyleTag()`.
Layout is preserved, so surrounding elements are unaffected.

## TypeScript

- `tsconfig.json`: `strict: true`, `verbatimModuleSyntax: true`
- Execution: `node --experimental-strip-types` (no esbuild/tsx)
- In-browser execution code (`computed-style-capture.ts`): `/// <reference lib="dom" />`
