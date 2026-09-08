# vlmkit — Project Skills

## How to Update VLM Model Benchmarks

### Purpose
Periodically evaluate VLM (Vision Language Model) cost-performance for analyzing VRT diff images.

### Steps

1. **Check available models** (dynamically fetched from OpenRouter API):
```bash
pkf run vlm-bench -- --list --max-cost 0.001 --limit 30
```

2. **Run fix-loop with candidate models** (hard case: seed 11):
```bash
VLMKIT_VLM_MODEL="<model-id>" node --experimental-strip-types src/experiments/css-challenge/fix-loop.ts \
  --fixture page --seed 11 --mode selector --max-rounds 2
```

3. **Measure VLM quality** (token count, latency, CHANGE detection count):
```bash
pkf run vlm-bench -- <model1> <model2> <model3> --md
```

4. **Update results in the "VLM Model Comparison" section of `docs/knowledge.md`**

5. **Save report to `docs/reports/`**:
```bash
# Filename: YYYY-MM-DD-vlm-model-benchmark-vN.md
```

### Evaluation Criteria
- Fix Loop: whether seed 11 (`.readme-body pre` 6 props, 4.1% diff) reaches FIXED
- Speed: VLM latency (1-10s acceptable range)
- Cost: /call (guideline: below $0.5e-7 is cheap)
- CHANGE detection count: number of changes following structured format (7-15 is optimal)

### Current Recommendations (2026-05-19)
- **Default**: `bytedance/ui-tars-1.5-7b` (~1.35s, ~$0/call) — UI-domain-trained, fastest of the structured outputs. Verified FIXED in round 1 on seed 11 (.readme-body pre, 4.1% diff).
- **Stable / detailed**: `qwen/qwen3-vl-30b-a3b-instruct` (~2.0s) — emits hex codes directly.
- **Baseline fallback**: `amazon/nova-lite-v1` (~2.4s).
- **High coverage + prose root-cause**: `claude:claude-haiku-4-5-20251001` (~4.2s, ~$2e-6/call). Also FIXED in round 1 on seed 11 — works as Stage-1 VLM in the 2-stage pipeline despite format divergence; Stage-2 LLM handles it. The earlier "only when VLM is consumed directly" caveat was too conservative.

#### Avoid / re-evaluate
- `meta-llama/llama-4-scout` — regressed since 2026-04-04 (was 1.0s, now ~7s with conversational output)
- `meta-llama/llama-4-maverick` — claims "image not available" and returns methodology only
- `google/gemini-2.5-flash-lite` — hallucinates uniform `red → red` deltas

See `docs/reports/2026-05-19-vlm-haiku-vs-uitars.md` for today's 2-way re-bench (haiku + UI-TARS, both FIXED r1);
`docs/reports/2026-05-18-vlm-claude-vs-openrouter-vs-newcomers.md` for the 8-way bench from the prior week.

### `vlm-region-diff` CLI Default (2026-05-23) — DEPRECATED 2026-07-30

**`diff region` is deprecated**: net-negative for agent repair in every
controlled A/B (2026-06-06), and its role is now covered deterministically
by `diff png --elements-html`, `check integrity`, and `check equivalence`.
The model notes below are kept as bench history only.

The defaults above are for **fix-loop VLMs** (Stage-1 CHANGE list + Stage-2 LLM).
`src/experiments/migration/vlm-region-diff.ts` is a different tool — it asks
the VLM directly for `{verdict, regions, baselineColor, variantColor}`. The
two roles call for different models.

- **Default**: `anthropic/claude-haiku-4-5` (~$0.005/call). Only model that
  returned `diff` with correct *direction* on the 2026-05-23 bake-off
  (expressive-menu component pair, 86% changed pixels). Per-channel hex
  numbers are still off by ~±10 — treat them as vibes, not measurements.
- **Avoid as `vlm-region-diff` default**: `bytedance/ui-tars-1.5-7b` (returns
  `diff` verdict but every region reports `baselineColor == variantColor`),
  `qwen/qwen3-vl-30b-a3b-instruct` and `google/gemini-2.5-flash` (both
  return `no-diff` on a ~6% palette shift across the entire image).

The `ui-tars` recommendation in the section above is unchanged — it remains
the fix-loop Stage-1 VLM default. It just fails specifically at the
`vlm-region-diff` job of naming color literals.

Full bench: `docs/reports/2026-05-23-vlm-region-diff-bakeoff.md`.

**A/B caveat (2026-06-06)**: in the controlled control-vs-vlmkit repair
runs, `diff region` was net-negative for agent-driven repair in every
run that tried it (wrong selector attribution, fabricated deltas —
drafts 06/09). For agent repair loops prefer the deterministic
`diff png --elements-html` path (selector candidates + shift estimates,
no VLM). See `docs/reports/2026-06-06-ab-external-synthesis.md`.

**Refutation gate (2026-06-08)**: `diff region` now cross-checks each
VLM claim against the measured bbox pixels. When the measured average
channel delta is below `PIXEL_REFUTE_FLOOR` (3) the row is demoted to
`confidence: low`, flagged `verification.refuted` in the JSON report,
and segregated into an "Unverified — measured pixels refute the VLM
claim" markdown section. This blunts the worst of 06/09 (zero-delta
rows no longer read as findings) but the deterministic path is still
the recommended default.

### Stage-2 LLM Recommendations (2026-05-22)

Hard case: `ui-tars-1.5-7b` VLM + various LLMs, seed 11 selector mode.
Full bench: `docs/reports/2026-05-22-vlm-llm-coverage-bench.md`.

- **Default**: `google/gemini-2.5-flash` via OpenRouter — **7s total, ~$0.008/run**, FIXED r1 with 11 fixes. Beats the previous `claude:claude-haiku-4-5-20251001` default on both axes (~10s, ~$0.020).
- **Cheapest still-correct (batch / cost-sensitive)**: `google/gemini-2.5-flash-lite` — **~$0.002/run**, 43s, FIXED r1. Picks up 37 fix candidates; over-generation absorbed by the apply-and-rollback gate. Note: only suitable as LLM Stage-2 — its VLM mode is in the avoid list above.
- **Independent second opinion (no Google deps)**: `moonshotai/kimi-k2` — 20s, ~$0.011/run, FIXED r1.
- **Anthropic-direct baseline**: `claude-haiku-4-5-20251001` — 10s, ~$0.020/run, FIXED r1. Useful for cross-provider sanity.

#### Avoid for Stage-2 fix synthesis
- `moonshotai/kimi-k2-thinking` — hallucinates multi-token garbage selectors (`aside#cdl figcaptionSupplymonth proportionatefailures` etc.); 47s LLM latency.
- `moonshotai/kimi-k2.5`, `moonshotai/kimi-k2.6` — return 0 fixes despite VLM CHANGE list (emits prose-only, not structured JSON). LLM latency 40-100s also disqualifies them.
- `qwen/qwen3-coder` — generates plausible-looking fixes that over-correct the whole page (diff 4.1% → 46.7%); apply-and-rollback catches it but the loop never recovers.

## Component-focused VRT (fixing one component with a small image)

```bash
# Runnable example: a plain-JS gallery, no dev server or bundler needed.
cd examples/story-gallery
G="file://$PWD/index.html"
vlmkit check story components/Button/Primary Card/Default --gallery "$G"   # writes baselines
vlmkit check story components/Button/Primary Card/Default --gallery "$G"   # compares
vlmkit check story components/Button/Primary --gallery "$G" --update-baseline
```

Use this instead of `diff html` when repairing ONE component: the shot is the
component's own box (~47x fewer pixels than the viewport on the example), and a
change to one component does not make its neighbours report.

`check story` drives the Playwright **gallery contract** — `window.mount({ story,
props })` / `window.unmount()` rendering into `#root` — via `page.evaluate`, which
is how Playwright's own `mount` fixture works. Consequences:

- **No Playwright version floor.** The `mount` fixture is 1.62+; the repo pins
  1.61 and this does not use the fixture. Do not add a peer-dep bump for it.
- The gallery is framework-specific and the project's to own; `examples/story-gallery/README.md`
  carries a React + Vite one to copy. Storybook needs a shim (no `window.mount`).
- Baselines are keyed on the story id **as written**, so `Button/Primary` and
  `components/Button/Primary` get separate baselines. List the canonical spelling
  in `vlmkit.gates.json`.

## Explanatory animations (`vlmkit-anim`) and their evaluation loop

```bash
vlmkit-anim schema --kind sort                      # the writing guide for one kind (docs/anim-ir.md has all eighteen)
vlmkit-anim schema --kind modules                   # the still-figure preset: a module map (modules / deps / groups), layered, cycle-checked
vlmkit-anim schema --kind annotations               # the six ops every kind shares (value / callout / snapshot / group / text / relate) and each kind's anchors
vlmkit-anim check scene.json                        # validate → compile → semantic checks → stats; exit 1 on ✗
vlmkit-anim check scene.ts                          # same, for a module whose default export is `scene.<kind>({…})` (typed authoring)
vlmkit-anim explain scene.json                      # narration as a numbered list
vlmkit-anim render scene.json --step 4 --out f.svg  # one frame, headless and deterministic
vlmkit-anim still scene.json --out map.svg          # the figure: final frame, no caption, cropped to what is drawn (.png needs playwright)
vlmkit-anim html scene.json --out page.html         # <vlm-anim> runtime inline; `vlmkit check animation page.html` works on it
vlmkit-anim video scene.json --out demo.gif --width 480   # GIF encoded in-process; .mp4/.webm run ffmpeg or leave frames + the command
vlmkit-anim eval page.html                          # the shared frame-sampled evaluator on an emitted page (same report as `vlmkit check animation`)
vlmkit-anim check scene.json --expect facts.json    # …and the figure against its facts (modules, deps "a->b", forbidden, highlighted in the final frame, group members) — a green check on a wrong picture was v13's finding
vlmkit-anim check walk.json --expect facts.json     # …a graph's visit order and path, a state machine's transitions / end state, a distributed scene's messages and lost ones (v18)
vlmkit-anim facts packages/x/src --depth 1 --out x.expect.json   # a fact sheet from a directory's import graph: a map drawn by hand from the code is checked against the code
vlmkit-anim layout scene.json                       # texts on texts / under boxes / past the edge / lines through texts, per step, from the timeline (also warnings in `check`)
vlmkit-anim review scene.json --out dir [--model M | --answers a.json]   # contact sheet + review brief for a vision model or an agent; scores its JSON against `layout`
vlmkit-anim repo --out docs/diagrams --name vlmkit-architecture   # the workspace drawn layer by layer (pnpm anim:diagrams regenerates docs/diagrams/)
vlmkit-anim pr --base origin/main --out .vlmkit-anim/pr           # the change map of a branch: one beat per commit, areas + import edges + counts; <name>.md is paste-ready
```

The `pr-visual` workflow runs `vlmkit-anim pr` on every same-repo pull request, publishes the
GIF and contact sheet on the `pr-visuals` branch (one folder per PR number) and keeps one
comment on the PR up to date with them — the shape of a change before the diff.

`vlmkit-anim` is a **standalone binary** (`@mizchi/vlmkit-anim`), not a `vlmkit`
subcommand. Its only workspace tie is the **evaluation** package
`@mizchi/vlmkit-animation-eval` (an optional peer, loaded by `vlmkit-anim eval`):
the frame-sampled measurement behind `vlmkit check animation` lives there, so the
animation tool and the gate share one evaluator without the tool depending on
vlmkit's capture, diff or gate plumbing. Sample outputs (one GIF and one contact
sheet per fixture) are committed under `packages/vlmkit-anim/samples/`; regenerate
with `pnpm anim:samples` after changing a compiler. In this repo run it as
`pnpm exec vlmkit-anim …` (resolves to `dist/`, so `pnpm --filter @mizchi/vlmkit-anim build`
after editing `src/`) or, without a build, `node --experimental-strip-types packages/vlmkit-anim/src/cli.ts …`.

The IR is judged on two things, measured by fresh subagents rather than by
reading the code: **an agent gets it right from `docs/anim-ir.md` alone**, and
**intent is readable when someone edits the file later**. Scenario fixture:
`fixtures/anim-scenario/` (briefs, a re-edit task, per-agent attempts).
Procedure is the `agent-validation-loop` skill; prompt the agent with one brief
and the guide, forbid `packages/vlmkit-anim/` and other attempts, and record
first-attempt ✗ count, rounds to green, scene bytes, and its friction verbatim.
Reports: `docs/reports/2026-09-04-anim-ir-v*.md` (v1–v8, structures) and
`docs/reports/2026-09-05-anim-ir-v{9,10}.md` (concept introductions; the coordinate-fallback
count is the expressiveness metric — 3 of 8 scenes before the annotation layer and `compose`, 1 of 7 after),
`docs/reports/2026-09-05-anim-ir-v11.md` (re-edits of annotated scenes: every readout and relation followed
the data change; the round's defects were layout, fixed in the compiler, not in the writer's hands),
`docs/reports/2026-09-05-anim-ir-v12.md` (the frames measured two ways — `layout` geometry and vision readers on
the contact sheet — and compared; annotations now place themselves off other text),
`docs/reports/2026-09-06-anim-ir-v13.md` (the first still-figure round: five module maps, all green and all with lines
through labels the geometry could not see; `layout` now reports `crossed`, and the module layout, edge routing,
container labels, annotation placement and arcs were reworked until the five scenes went from 91 crossings to 2),
`docs/reports/2026-09-06-anim-ir-v14.md` (the figure against its facts: `check --expect facts.json` names v13's two
green-but-wrong pictures in one line each; four writers with fact sheets were four green, and the sheet caught one
wrong final highlight on the first run), `docs/reports/2026-09-07-anim-ir-v15.md` (labels in Japanese: a CJK glyph
is one em and every width estimate had said 0.6, so `layout`'s green was a lie on Japanese figures; measured against
Chromium, fixed in one module; the state-machine compiler learned the diagram's edge routing when a writer's only
fix for a transition through a state was to reorder the list), `docs/reports/2026-09-08-anim-ir-v16.md` (a still's
own vocabulary: `tone` on modules and dependencies, `"style": "implements"`, `relate` `"style": "equals"` — the two
asks the v13 writers left open, drawn by two writers on a brief that needs all three), `docs/reports/2026-09-08-anim-ir-v17.md`
(where an annotation lands: the canvas grows on the side the writer asked for — left and above included, the picture
shifts — and a callout's pointer goes round labelled boxes; three writers record asked side against landed side), `docs/reports/2026-09-08-anim-ir-v18.md`
(fact sheets for the walked kinds — a graph's visit order and path, a state machine's transitions and end state, a
distributed scene's messages and lost ones — and `vlmkit-anim facts` writing one from a directory's import graph; the
four writers' sheets all matched, and every further round was a compiler defect the round fixed: the token on a short
label, a 35px circle of four states, labels on states, a distance label under an edge), `docs/reports/2026-09-08-anim-ir-v19.md`
(two kinds — `flowchart` with decision diamonds, labelled ways out, a walked path and loops round the outside, and `gantt`
with bars on a unit axis, dependencies, a cursor, cascading slips — both flowchart writers green on the first write; the
gantt writer's five rounds were one callout that a moving cursor label walked under, fixed in the compiler).

## Measuring Gate / Rule Execution Cost

```bash
# One run, per-phase split (parse / run / findings / rules / format / ledger)
vlmkit check integrity page.html --timing

# Every gate that works from a bare page (18 of 26 when measured 2026-08-06; `check story`
# landed the next day), ranked by cost, with yield
vlmkit bench gates fixtures/css-challenge/page.html --repeat 3

# Full corpus + the "does turning rules off save time" probe, as markdown
vlmkit bench gates fixtures/css-challenge/{page,dashboard,form-app}.html \
  --repeat 3 --probe-suppression --md --out docs/reports/YYYY-MM-DD-gate-bench.md
```

**Per-rule cost is attributed, not isolated, and that is structural.** A gate does
one measurement (`run`) and every rule it declares reads that same report, so
`run` is ~100% of wall clock and the projection is under a millisecond across all
18 gates. Consequences worth remembering before optimizing anything:

- `--rule x=off` does **not** speed up a run (settings apply after the
  measurement). Measured at +0.4% — noise.
- The cost unit is the **gate**. Spend less by dropping a gate or narrowing its
  inputs (fewer viewports, no `--sweep`, shorter `--observe`).
- Four gates are ~60% of a full sweep: `check interactions`, `stress media`,
  `check perf`, `check integrity`. `check interactions` varies 5x by page.

Baseline: `docs/reports/2026-08-06-gate-rule-cost-bench.md`.

## Running CSS Challenge Benchmarks

### Cross-fixture Matrix
```bash
NO_IMAGES=1 node --experimental-strip-types src/experiments/css-challenge/css-challenge-bench.ts \
  --fixture all --mode selector --trials 10 --no-db
```

### Crater Prescanner Bench (requires crater server running)
```bash
# Start crater
cd ~/ghq/github.com/mizchi/crater && just build-bidi && just start-bidi-with-font

# Run bench
pkf run css-bench-crater -- --fixture page --trials 30
```

### Tracking Detection Rate
```bash
pkf run css-report  # Aggregate accumulated data
```

## Running Migration VRT

```bash
# Tailwind → vanilla CSS
pkf run migration-tailwind

# Reset CSS comparison
pkf run migration-reset

# File comparison
vlmkit diff html before.html after.html

# URL comparison
vlmkit diff html --url http://localhost:3000/ --current-url http://localhost:8080/

# With masks (exclude dynamic content)
vlmkit diff html --url http://localhost:3000/ --current-url http://localhost:8080/ --mask ".marquee-container,.hero-badge"
```

## Snapshot (URL → multi-viewport capture)

```bash
# First run: create baseline. Subsequent runs: baseline + diff
vlmkit snapshot http://localhost:3000/ http://localhost:3000/about/ --output snapshots/

# With masks (exclude animated/dynamic elements)
vlmkit snapshot http://localhost:3000/ --mask ".marquee-container,.hero-badge"
```

## Dogfooding

```bash
# luna.mbt (requires: npx serve ~/ghq/.../luna.mbt/dist/luna -p 4200)
pkf run dogfood-luna

# sol.mbt (requires: npx serve ~/ghq/.../sol.mbt/website/dist-docs -p 3000)
pkf run dogfood-sol

# False positive test (compare same URL twice)
pkf run false-positive --url http://localhost:3000/luna/
```

## Running Fix Loop

```bash
# Property mode (delete 1 CSS property)
pkf run fix-loop -- --fixture page --seed 42

# Selector mode (delete 1 selector block)
pkf run fix-loop -- --fixture page --seed 11 --mode selector --max-rounds 3

# Specify a VLM model
VLMKIT_VLM_MODEL="bytedance/ui-tars-1.5-7b" pkf run fix-loop -- --fixture page --seed 11 --mode selector
```

## Environment Variables

| Variable | Purpose | Default |
|------|------|----------|
| `VLMKIT_LLM_PROVIDER` | LLM provider | gemini |
| `VLMKIT_LLM_MODEL` | LLM model | Provider default |
| `VLMKIT_VLM_MODEL` | VLM model (OpenRouter / `gemini:` / `claude:`) | bytedance/ui-tars-1.5-7b |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
| `GEMINI_API_KEY` | Google AI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `DEBUG_VLMKIT` | Enable debug logs | — |

### Which model to set, by who is asking

Set your own family's model so a run is reproducible from the transcript. The same table is in
[`AGENTS.md`](../AGENTS.md), which is what a non-Claude agent reads, and
`tests/agent-model-defaults.test.mjs` pins the two to each other and to the code.

- **Claude Code** (this file's reader): `VLMKIT_VLM_MODEL=claude:claude-haiku-4-5-20251001`,
  `VLMKIT_LLM_PROVIDER=anthropic` — the benchmarked recommendations above.
- **Codex / any OpenAI-based agent**: `VLMKIT_VLM_MODEL=openai/gpt-5.6-luna` and
  `VLMKIT_LLM_PROVIDER=openrouter VLMKIT_LLM_MODEL=openai/gpt-5.6-luna`.

`openai` is **not** a provider name — there is no `api.openai.com` client and no `OPENAI_API_KEY`
in this codebase, and the `openai/` in the id is an OpenRouter catalogue prefix. Setting
`VLMKIT_LLM_PROVIDER=openai` fails with `INVALID_PROVIDER`; the message now names the route, and
`OPENAI_DEFAULT_MODEL` in `packages/vlmkit-ai/src/llm-client.ts` is the one place the id is written.

## Package Layout

This repository is a pnpm workspace.

| Path | Contents |
|------|----------|
| `packages/vlmkit-core/` | Image / CSS / DOM / a11y diff engine + shared types and CLI helpers. No Playwright or AI deps required to import core types. |
| `packages/vlmkit-core/src/plugin/` | **Gate plugin runtime**: the contract (`defineGate` / `definePlugin`), rule tables and settings, the registry, and the core runner that owns `--help` / `--json` / `--advisory` / the run ledger / the exit code. Core never imports a gate — definitions are handed to it. |
| `packages/vlmkit-markup/src/gates/` | Gate definitions (`*.gate.ts`) + the main built-in plugin (`index.ts`) — 25 of the 27 gates. Wraps existing measurement code; adding a gate is `defineGate` + one line in `index.ts`. |
| `packages/vlmkit-capture/src/gates/`, `src/gates/` | The other two built-in plugins: `check crater` (capture) and `check perf` (app-side). Composed by `src/cli/gate-registry.ts` alongside any `vlmkit.config.json` `"plugins"`. |
| `packages/vlmkit-capture/` | Playwright / Crater capture infrastructure, viewport discovery, prescanner. |
| `packages/vlmkit-ai/` | VLM / LLM clients, reasoning pipeline, NLP helpers. |
| `packages/vlmkit-markup/` | VLM-driven markup tooling: component extract / from-image, design tokens, theme parity, i18n stress, palette, dep-graph, selector-heal, smoke-runner. |
| `packages/vlmkit-animation-eval/` | **Frame-sampled animation evaluator** (`runAnimationEval`): the measurement behind `vlmkit check animation` and `vlmkit-anim eval`. Depends on core + Playwright only; the first evaluation tool split out so the animation tool can share it without the rest of vlmkit. |
| `packages/vlmkit-anim/` | **Explanatory animation IR** (`vlmkit-anim`): Scene IR (sort / array / stack / queue / list / state-machine / heap / tree / distributed / matrix / graph / chart / flowchart / gantt / diagram / modules / vector) → Timeline IR → `<vlm-anim>` runtime (SVG + Web Animations) and headless SVG frames. Writing guide `docs/anim-ir.md`; design `docs/design/anim-ir.md`. Every JSON block in the guide is compiled by `docs.test.ts` — edit the guide and the examples together. |
| `src/cli/` | CLI entry + router + workflow command implementations (split per-command under `cli/workflow/`). |
| `src/api/` | HTTP API server (deep-imports vlmkit-markup smoke-runner + experiments/css-challenge). |
| `src/experiments/` | migration, css-challenge, detection, benchmark, flaker. |
| `src/demo/` | Demo scripts. |
| `src/util/` | App-side helpers (agent, goal-runner, skill, perf, integration tests). |
| `src/vrt/snapshot/`, `src/vrt/compare/` | Baseline / snapshot / flipbook workflow. |

Cross-package imports use `@mizchi/vlmkit-<pkg>/<path>.ts` or the curated barrel `@mizchi/vlmkit-<pkg>`. Within a package, use relative imports. The barrel excludes Playwright-bound and CLI-entry modules — deep-import those. (This line said `@mizchi/vrt-<pkg>`, which no package has been called since 0.6 — an import written from it does not resolve.)

Run tests for a single package: `pnpm --filter @mizchi/vlmkit-core test`. From repo root, `pnpm test` runs all. **Editing a `packages/*/src` file and then running the CLI shows the OLD behavior**: `@mizchi/vlmkit-*` resolves through `exports` to `dist/*.mjs`, so `pnpm build` has to run in between (and never pipe its output to `head` — SIGPIPE leaves a half-deleted `dist/`).

The `vlmkit-markup` markup-core tests build MoonBit sources on demand and need the `moon` CLI. If tests fail with `spawnSync moon ENOENT`, add it to PATH first (it is often installed but not on PATH in sandboxes): `export PATH="$HOME/.moon/bin:$PATH"`. If it is not installed at all: `curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash`. Without it ~138 tests fail on the toolchain rather than on anything real, so install it before trusting a red suite.

**After editing anything under `.claude/skills/`, run `pnpm sync:skills`.** The content lives there once and is copied into two installer packages (`skills/vlmkit/workflows/`, `.apm/skills/vlmkit/`); `tests/skill-package.test.mjs` fails if the three drift, and hand-editing a copy is the wrong repair.

**Commands invoked from `.github/workflows/` are checked by `tests/workflow-commands.test.mjs`.** Renaming or removing a CLI verb fails that test rather than a 15-minute browser job — or, worse, than nothing at all when the workflow step ends in `|| true`.

## Documentation Structure

| File | Contents |
|---------|------|
| `docs/markup-assist.md` | Context-free guide to the deterministic markup gates (CLI / MCP / skill install, task routing, done-condition recipes) |
| `docs/cli-reference.md` | Complete command reference moved out of README (groups, examples, workflow/API/HTTP, architecture, project structure) |
| `docs/configuration.md` | Setup detail moved out of README (install, MCP/skill, env vars, snapshot/CI config, APM skills catalog) |
| `docs/knowledge.md` | Accumulated experiment findings (detection rates, VLM comparisons, fix patterns, etc.) |
| `docs/api-design.md` | CLI / library API design |
| `docs/reports/2026-08-06-gate-rule-cost-bench.md` | Measured gate/rule execution cost: where a ruleset's time goes, why per-rule cost is attributed rather than isolated, why suppression saves nothing |
| `docs/anim-ir.md` | **Writing guide for `vlmkit-anim`**: the seventeen scene kinds (sixteen structures + `compose`), the annotation ops every kind shares, the timeline layer, embedding. The one page an agent reads before producing a scene |
| `docs/design/anim-ir.md` | Why two layers, why SVG + WAAPI over Remotion, what the semantic checks read back from frames, the evaluation criteria (intent readable on re-edit; correct from little context) |
| `docs/authoring-gates.md` | **User-facing how-to for adding a metric**: the contract field by field, choosing severities/categories, reading project config, browser measurement, testing, publishing. Runnable examples in `examples/gate-plugin/` |
| `docs/design/gate-plugin-architecture.md` | Gate plugin contract, rule settings, the 27 gates + 127 rules, behavior changes, what is deliberately not a gate |
| `docs/design/moonbit-boundary.md` | **TS ↔ MoonBit boundary**: what the positional FFI costs (61 commands, 233 args, 2 duplicated dispatch tables), the JSON boundary that replaces it for new logic, how to add a command, and which pure logic belongs in MoonBit versus which deliberately does not |
| `docs/crater-css-status.md` | Crater CSS rendering verification status |
| `docs/reset-css-comparison.md` | Reset CSS domain knowledge |
| `docs/reports/` | Individual experiment reports (dated) |
| `TODO.md` | Done / Evaluation / Backlog |
