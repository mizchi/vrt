# vrt — CLI / Library API Design

## Current Problems

- 8 CLIs exist but naming is inconsistent (`css-challenge`, `migration-compare`, `demo`, `vrt-demo-fix` ...)
- 15+ library modules exist but public API is unclear
- `css-challenge-core.ts` mixes Playwright dependency, crater dependency, CSS parser, and LLM client
- Type definitions scattered across `types.ts` and individual modules

## Design Policy

### CLI: `vrt` Subcommand System

Hang subcommands off a single entry point (`vrt`).

```
vrt compare <before> <after>         # VRT comparison of 2 files
vrt compare --url <url> --current-url <url>  # URL mode
vrt snapshot <url1> [url2] ...       # URL → multi-viewport capture + baseline diff
vrt bench [options]                   # CSS challenge benchmark
vrt report                           # Report on accumulated data
vrt discover <file>                  # Breakpoint discovery + viewport suggestions
vrt smoke <file-or-url>              # A11y-driven random operation test
vrt serve [--port 3456]              # API server
vrt status [--url ...]               # Server health check
```

### Library: 3-Layer Structure

```
┌─────────────────────────────────────────────┐
│  CLI Layer (src/cli/)                       │
│  vrt compare, vrt bench, vrt report, ...    │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Core Layer (src/core/)                     │
│  Pure logic. No browser dependency          │
│                                             │
│  ├── css-parser.ts      CSS parse/transform │
│  ├── diff.ts            pixel diff, paint tree diff │
│  ├── classify.ts        Property classification │
│  ├── viewport.ts        Breakpoint discovery │
│  ├── approval.ts        Diff approval rules │
│  ├── a11y.ts            A11y tree diff      │
│  └── types.ts           All type definitions │
└─────────────┬───────────────────────────────┘
              │
┌─────────────▼───────────────────────────────┐
│  Backend Layer (src/backend/)               │
│  Browser/renderer dependent                 │
│                                             │
│  ├── chromium.ts        Playwright wrapper  │
│  ├── crater.ts          Crater BiDi client  │
│  └── interface.ts       Common interface    │
└─────────────────────────────────────────────┘
```

## CLI Details

### `vrt compare`

Compare 2 HTML files (or URLs). Auto breakpoint discovery + multi-viewport.

```bash
# File comparison
vrt compare before.html after.html

# Directory comparison (baseline + variants)
vrt compare --baseline normalize.html --variants modern.html destyle.html

# URL comparison
vrt compare --url http://localhost:3000/ --current-url http://localhost:8080/

# Options
vrt compare before.html after.html \
  --backend chromium           # chromium | crater | both
  --max-viewports 10           # Viewport limit
  --random-samples 2           # Random samples between breakpoints
  --no-discover                # Disable auto breakpoint discovery
  --approval approval.json     # Approval rules file
  --output-dir path            # Output directory
  --mask ".ads,.carousel"      # Selector masking (visibility: hidden)
```

### `vrt snapshot`

Capture URL at multiple viewports and auto-compare with previous baseline.

```bash
# First run: create baseline. Subsequent runs: measure diff
vrt snapshot http://localhost:3000/ http://localhost:3000/about/

# Options
vrt snapshot <url1> [url2] ... \
  --output snapshots/          # Output directory
  --mask ".marquee,.badge"     # Mask dynamic content
```

### `vrt bench`

CSS challenge benchmark. Delete 1 CSS line → measure detection rate.

```bash
vrt bench                                    # Default (page fixture, 20 trials)
vrt bench --fixture dashboard --trials 50    # Specify fixture + trial count
vrt bench --backend crater                   # Crater backend
vrt bench --all                              # All fixtures at once
vrt bench --no-db                            # Don't save to DB
```

### `vrt report`

Analysis of accumulated data.

```bash
vrt report                     # All data
vrt report --fixture page      # By fixture
vrt report --backend crater    # By backend
```

### `vrt discover`

Discover breakpoints from HTML/CSS and suggest test viewports.

```bash
vrt discover page.html
# Output:
#   Breakpoints: min-width:640px, min-width:768px, min-width:1024px
#   Suggested viewports (11):
#     375px (mobile)
#     639px (below 640px breakpoint)
#     640px (at 640px breakpoint)
#     ...
```

### `vrt demo`

Demo execution.

```bash
vrt demo              # Basic demo
vrt demo fix          # Fix loop
vrt demo multi        # Multi-scenario
vrt demo multistep    # Multi-step
```

## Library API

### Core Layer (Browser-independent)

```typescript
// --- css-parser ---
import { parseCssDeclarations, removeCssProperty, applyCssFix, extractCss } from "vrt/core/css-parser";

// --- diff ---
import { compareImages, diffComputedStyles } from "vrt/core/diff";
import { diffPaintTrees } from "vrt/core/diff";

// --- classify ---
import { categorizeProperty, classifySelectorType, classifyUndetectedReason, isOutOfScope } from "vrt/core/classify";

// --- viewport ---
import { extractBreakpoints, generateViewports, discoverViewports } from "vrt/core/viewport";

// --- a11y ---
import { diffA11yTrees, checkA11yTree } from "vrt/core/a11y";

// --- types ---
import type { CssDeclaration, ViewportSpec, Breakpoint, DetectionRecord, ... } from "vrt/core/types";
```

### Backend Layer (Browser-dependent)

```typescript
// --- Common interface ---
import type { RenderBackend, CapturedState } from "vrt/backend/interface";

// --- Chromium ---
import { ChromiumBackend } from "vrt/backend/chromium";
const backend = new ChromiumBackend();
await backend.init();
const state = await backend.capture(html, viewport);
await backend.close();

// --- Crater ---
import { CraterBackend } from "vrt/backend/crater";
const backend = new CraterBackend("ws://127.0.0.1:9222");
await backend.init();
const state = await backend.capture(html, viewport);
await backend.close();
```

### Backend Interface

```typescript
interface RenderBackend {
  name: string;                  // "chromium" | "crater"
  
  init(): Promise<void>;
  close(): Promise<void>;
  
  /** Render HTML and capture screenshot + metadata */
  capture(html: string, viewport: ViewportSpec, options?: CaptureOptions): Promise<CapturedState>;
  
  /** Check availability */
  isAvailable(): Promise<boolean>;
}

interface CaptureOptions {
  captureHover?: boolean;        // Also capture hover state
  capturePaintTree?: boolean;    // Paint tree (crater only)
  captureA11y?: boolean;         // A11y tree
  captureComputedStyles?: boolean; // Computed style
  screenshotPath?: string;       // PNG save path
}

interface CapturedState {
  screenshotPath: string;
  a11yTree?: A11yNode;
  computedStyles?: Map<string, Record<string, string>>;
  hoverComputedStyles?: Map<string, Record<string, string>>;
  paintTree?: PaintNode;         // crater only
}
```

## Migration Path

Mapping from current files to new structure:

| Current | New Structure | Notes |
|---------|--------------|-------|
| `src/css-challenge-core.ts` | Split: `core/css-parser.ts` + `core/diff.ts` + `backend/chromium.ts` + `backend/crater.ts` | Largest refactoring target |
| `src/detection-classify.ts` | `core/classify.ts` | Nearly as-is |
| `src/detection-db.ts` | `core/db.ts` | Nearly as-is |
| `src/viewport-discovery.ts` | `core/viewport.ts` | Nearly as-is |
| `src/heatmap.ts` | `core/diff.ts` | Pixel diff portion |
| `src/a11y-semantic.ts` | `core/a11y.ts` | Nearly as-is |
| `src/crater-client.ts` | `backend/crater.ts` | PaintNode/diff moves to `core/diff.ts` |
| `src/types.ts` | `core/types.ts` | Consolidate |
| `src/css-challenge.ts` | `cli/challenge.ts` | CLI entry |
| `src/css-challenge-bench.ts` | `cli/bench.ts` | CLI entry |
| `src/detection-report.ts` | `cli/report.ts` | CLI entry |
| `src/migration-compare.ts` | `cli/compare.ts` | CLI entry |
| `src/demo*.ts` | `cli/demo.ts` | Consolidate |

## For Now

Refactoring is deferred. First:
1. Treat this design document as the source of truth
2. Add new features following the new structure
3. Leave existing code as-is since it works
4. Batch refactor when packaging as npm
