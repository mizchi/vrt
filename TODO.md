# TODO

## Done

- [x] 3-track parallel pipeline (Diff Intent / Visual Semantic / A11y Semantic)
- [x] Cross-validation matrix (Visual × A11y × Intent)
- [x] 2-tier expectations (short-cycle + long-cycle spec)
- [x] Introspect: auto-generate spec from a11y trees
- [x] Spec verify: validate invariants against current state
- [x] Reasoning chains: expectation → change → realization
- [x] Goal Runner: multi-step verification with retry
- [x] `vrt expect`: auto-generate expectation.json from diff
- [x] `vrt introspect` / `vrt spec-verify` CLI commands
- [x] form/region landmark invariant auto-generation
- [x] element-count invariant for role-change detection
- [x] Visual pipeline: real PNG diff with pixelmatch + heatmap
- [x] Round-trip test: introspect → spec → verify
- [x] Playwright NL assertion helper (heuristic + LLM)
- [x] 4 demos with kitty graphics protocol
- [x] 150 tests, 20+ fixtures

## Backlog

### Multi-step goal runner improvements

- [ ] Real agent integration: GoalRunner calls a coding agent (not just fixtures)
  - `runStep` callback that triggers subagent → code change → capture → return snapshot
  - Token usage tracking per step
- [ ] Goal decomposition: LLM-based goal → sub-tasks splitting
  - Input: natural language goal description
  - Output: ordered steps with expectations

### Playwright integration

- [ ] `nlAssert()` with Vision LLM (currently heuristic-only)
  - Send screenshot + a11y tree to LLM for evaluation
  - Cache results to avoid repeated calls
- [ ] `onlyOnFailure` pattern: Playwright test helper
  - Wrap standard assertions, fire NL assertion only on failure
  - Generate fix hints for coding agents
- [ ] Playwright `toHaveScreenshot()` integration
  - Use Playwright's native diff instead of custom pixelmatch
  - Feed Playwright's diff image into visual-semantic classifier

### Matching improvements

- [ ] LLM-based fuzzy matching (replace keyword matching)
  - `matchesSingleA11yChange` → LLM compares description vs actual
  - Fallback to keyword when LLM unavailable
- [ ] Better synonym handling
  - Auto-learn synonyms from fixture test failures
  - Domain-specific synonym packs (React, MoonBit, etc.)

### Spec & invariant coverage

- [ ] Heading hierarchy validation (h1 → h2 → h3, no skips)
- [ ] ARIA relationship validation (tablist → tab → tabpanel linkage)
- [ ] Color contrast invariants (requires pixel analysis)
- [ ] Responsive layout invariants (viewport-dependent checks)

### Cost optimization

- [ ] LLM call budget tracking and limits
- [ ] Incremental spec verify (only check invariants for changed components)
- [ ] Snapshot caching (avoid re-capture when source unchanged)
