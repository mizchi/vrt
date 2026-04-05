# TODO

## Vision

**Large-scale cross-renderer diff verification tool**.

Use cases:
- Chromium vs Crater (cross-browser engine diffs)
- Website v1 vs v2 (UI library rewrites)
- Design system version comparison

Runs on Cloudflare Workers with Crater. WebUI is in a separate repo.

## Done (65 items)

### Core Pipeline
- [x] 3-track parallel pipeline (Diff Intent / Visual Semantic / A11y Semantic)
- [x] Cross-validation matrix (Visual × A11y × Intent)
- [x] 2-tier expectations (short-cycle + long-cycle spec)
- [x] Introspect / Spec verify / Reasoning chains / Goal Runner
- [x] Visual pipeline: pixelmatch v7 + heatmap + image size mismatch handling

### CSS Challenge Bench
- [x] 3 fixtures (page / dashboard / form-app), 741 CSS declarations
- [x] Property deletion mode + Selector block deletion mode
- [x] Multi-viewport (wide 1440 + desktop 1280 + mobile 375)
- [x] Computed style diff (esbuild __name bug fixed)
- [x] Hover emulation (:hover/:focus rule always-on + Playwright fallback)
- [x] ::before/::after pseudo-element computed style
- [x] CSS Custom Properties var() tracking
- [x] Detection pattern DB (JSONL) + aggregation report
- [x] Property/selector classification, auto-classification of undetected reasons (dead-code, hover-only, etc.)
- [x] Chromium detection rate 93.3% (scoped)

### Crater Integration
- [x] Crater BiDi client + Paint tree diff (detection rate 60%, false positive 0%)
- [x] Prescanner mode (1.66x speedup)
- [x] Best-effort computed style capture via BiDi
- [x] Bench summary persistence + speedup report

### Migration VRT
- [x] migration-compare.ts: auto breakpoint discovery + quickcheck-style viewport generation
- [x] Reset CSS fixture (normalize / modern-normalize / destyle / no-reset)
- [x] Tailwind → vanilla CSS fixture + blind test (0.0% pixel-perfect achieved)
- [x] shadcn/ui → luna fixture
- [x] Diff approval system (tolerance, expires, issue linkage)
- [x] Auto-approve workflow (vrt-approve)

### Viewport Discovery
- [x] @media breakpoint extraction (regex + crater BiDi)
- [x] Boundary ±1px + random sample viewport generation
- [x] ResponsiveBreakpoint type (ge/gt/le/lt) + merge
- [x] crater getResponsiveBreakpoints BiDi API integration

### API / CLI
- [x] API type definitions (src/api-types.ts) — Compare, Smoke, Report, Status
- [x] Hono API server (/api/compare, /api/compare-renderers, /api/smoke-test, /api/status)
- [x] /api/compare computed style diff integration
- [x] VrtClient SDK (src/vrt-client.ts)
- [x] Unified CLI (src/vrt.ts) — compare, bench, report, discover, smoke, serve, status
- [x] GitHub Actions CI workflow (vrt-compare.yml)

### Smoke Test
- [x] A11y-driven random operations (Playwright getByRole)
- [x] Disabled element skipping
- [x] LLM reasoning mode
- [x] Console error / uncaught exception / crash monitoring
- [x] External navigation blocking
- [x] Seed-based reproducible randomization

### Performance
- [x] pixelmatch v6 → v7
- [x] pixelmatch native benchmark (85µs, 6.6x vs npm v7)
- [x] tsx → node --experimental-strip-types (esbuild removed)
- [x] benchmark.ts (deterministic API baseline measurement)

### CI / Integration
- [x] flaker VRT runner + adapters (migration, bench)
- [x] migration-report / bench-report artifact workflows

### Code Quality
- [x] TypeScript strict mode (tsconfig strict + verbatimModuleSyntax, 151 tsc errors → 0)
- [x] Shared module extraction (terminal-colors.ts 12 files, cli-args.ts 9 files, mask.ts)
- [x] Playwright page reuse (fix-loop), PNG IHDR header reading, Gemini SDK init optimization

### Snapshot / URL Compare
- [x] `vrt snapshot` command (URL → multi-viewport capture + baseline diff)
- [x] `vrt compare --url / --current-url` URL mode (page.goto based)
- [x] `--mask` selector masking (visibility: hidden to exclude dynamic content)
- [x] Project rename: vrt-harness → vrt

---

## Evaluation Phase — Next Steps

### E1. Dogfooding on external projects

Use vrt on real projects to verify practicality.

- [x] Add `vrt snapshot` command (URL → multi-viewport capture + baseline diff)
- [x] Add `vrt compare --url` URL mode (page.goto based)
- [x] luna.mbt dogfooding: false positive rate 0% (6 pages × 2 viewports)
- [x] sol.mbt dogfooding: false positive rate 20% (dynamic content on root page)
- [x] Record results in `docs/reports/2026-04-05-dogfood-luna-sol.md`
- [ ] Run VRT in CI per PR, measure false positive rate
- [ ] Pass diff report to subagent for fix code generation, measure success rate

### E2. Crater prescanner tracking

Measure detection rate improvement after crater-side fixes (#18-22).
**Status**: #18-22 all Open (no progress as of 2026-04-05). Waiting for crater-side fixes.

- [ ] Re-run bench after text-decoration #18 fix
- [ ] Track progress toward detection rate 60% → target 80%+
- [ ] Track progress toward prescanner speedup 1.66x → target 3x+

### E3. Blind test replication

Reproduce the Tailwind blind test with different fixtures/scenarios to confirm reproducibility.

- [ ] Blind test with shadcn → luna
- [ ] Blind test with Reset CSS switch
- [ ] Success criteria: diff < 1% within 3 rounds

---

## Backlog (prioritize after evaluation)

### Infrastructure / Deploy
- [ ] Cloudflare Workers entry point (`worker/`)
- [ ] crater WASM backend (layout only — paint is future)
- [ ] Cloudflare R2 / KV / D1 storage
- [ ] npm package (`@mizchi/vrt-client`)
- [ ] OpenAPI spec

### Crater side (mizchi/crater)

**Rendering fixes**:
- [ ] text-decoration #18 / border-radius #19 / font-weight #20 / margin #21 / align-items #22

**VRT detection rate improvement (94.4% → 100%)**:
- [ ] Breakpoint-aware CSS rule mapping #33 — resolve media-scoped detection gaps
- [ ] Hover/focus state computed style #34 — resolve hover-only detection gaps
- [ ] Computed styles BiDi #26 — prescanner detection rate 60% → 80%+
- [ ] CSS rule usage tracking #27 — dead-code determination

**VRT optimization**:
- [ ] Paint tree diff API #23 / CSS mutation API #24 / Selector-scoped rendering #25
- [ ] Batch rendering #28
- [ ] VRT prescanner benchmark tracking #29

### Feature Extensions
- [ ] Component (selector) level comparison
- [ ] Enhanced diff classification (layout shift / color change / text change / element added/removed)
- [ ] Smoke test: Crater BiDi backend
- [ ] Smoke test: a11y tree consistency check after operations
- [ ] Animation detection (animation-play-state: paused / CSSOM diff)
- [ ] External stylesheet breakpoint discovery

### Playwright Integration
- [ ] `nlAssert()` with Vision LLM
- [ ] `onlyOnFailure` pattern
- [ ] `toHaveScreenshot()` integration

### Spec coverage
- [ ] Heading hierarchy validation
- [ ] ARIA relationship validation
- [ ] Color contrast invariants
- [ ] Responsive layout invariants

### Dashboard (separate repo)
- [ ] Execution result list/search
- [ ] Visual diff display (heatmap, side-by-side, overlay)
- [ ] Interactive approval operations
- [ ] Detection rate time-series graph
- [ ] Component-level status matrix
