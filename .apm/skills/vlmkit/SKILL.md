---
name: vlmkit
description: 'Automatic frontend quality router. Use automatically whenever the user asks to create, edit, debug, validate, test, compare, migrate, or repair a frontend UI, HTML/CSS, screenshot implementation, responsive or interactive behavior, Playwright/VRT, or a visual regression. The user does not need to mention vlmkit or choose a sub-skill. Classify the request, load the bundled workflow, run the smallest deterministic gates, fix failures, and rerun to green.'
---

# vlmkit — Skill Router and CLI Guide

## Overview

This is the single automatic entry for vlmkit's focused agent workflows and
the reference for its Visual Regression Testing (VRT) and accessibility
verification CLI. The user installs this skill once and describes the outcome
they want in ordinary language.

Automatically verifies that changes are visually and semantically (a11y) as intended,
running a loop to detect and repair regressions.

## Automatic routing contract

1. **Do not ask the user to choose or name a specialized skill.** Infer the
   workflow from their request, supplied artifacts, and files in scope.
2. Resolve every workflow path below **relative to the directory containing
   this `SKILL.md`**, not relative to the user's project. Read the selected
   workflow's `SKILL.md` completely before editing or running its gates.
3. Default to `markup-assist` for ordinary frontend work when there is no
   stronger screenshot, behavior, test-generation, comparison, migration, or
   benchmark signal.
4. Select one primary workflow. Chain a second only when the first workflow's
   output is genuinely the second workflow's input—for example, recreate a mock
   with `mock-markup`, then prove an explicit motion brief with
   `dynamic-markup`.
5. Ask only for a missing task artifact that materially blocks the work (such
   as the target screenshot), never for a skill-selection decision.
6. Execute the selected workflow; do not stop after recommending a command.
   Finish only when its stated deterministic done conditions are green, or
   report concrete evidence that blocks them.

## Automatic tool bootstrap

### The version these workflows are written against: 0.17.0

Recorded here, once. The workflows do not repeat it, and
`tests/skill-package.test.mjs` pins this line to the package's own version so the
two cannot drift. Every workflow is reached through this file, so this is the one
place an agent has already read before it runs a gate.

Read what is installed before the first gate of a task:

```sh
npx vlmkit --version     # vlmkit/0.17.0 darwin-arm64 node-v24.14.1
```

- **Older, or not installed** → install `@mizchi/vlmkit@0.17.0` and use that.
  A workflow that names a verb or a flag the installed CLI does not have fails
  with "unknown option", which reads as the user's mistake rather than as a
  version skew. Recent releases add gates and probe families that older CLIs
  refuse: `check story` and `--probe <families>` did not exist two releases ago.
- **Exactly this** → proceed.
- **Newer** → proceed with what is installed, and say which version the run used
  once in the result. Do not downgrade a project to match a skill: the recorded
  version is a FLOOR, and a newer CLI has every verb these workflows use. If a
  newer CLI rejects something a workflow asks for, the workflow is out of date —
  report that rather than working around it.
- **The registry does not have that version yet** — a release stamped in the repo
  and not published, which is a state this project passes through → install the
  latest published version, and say in the result which version ran and that the
  workflows were written against a newer one. Do not treat the 404 as a broken
  setup.

Then:

1. Reuse an existing `@mizchi/vlmkit` dependency when its version is not older
   than the one above. Otherwise, detect the existing package manager from its
   lockfile and add `@mizchi/vlmkit` as a development dependency with that
   package manager. Do not install a second package manager or add a global CLI.
2. Run the project-local binary (`pnpm exec vlmkit`, `npx vlmkit`, or the
   equivalent for the detected package manager).
3. Attempt the chosen gate first. Install Chromium only when Playwright reports
   that it is missing, then rerun the gate. Do not perform unrelated browser or
   system setup preemptively.
4. In a consumer repository, translate source-repo invocations to the published
   `vlmkit` binary. Use paths inside this bundled skill only for fixtures,
   references, or an explicitly requested vlmkit benchmark.
5. Treat dependency and lockfile edits as normal task changes: keep them scoped,
   validate them, and report them in the final result.

## Skill routing

Treat this root skill as the selector, not as a requirement to run every
workflow. Classify the task, load one primary specialized skill, and add a
second only when the task genuinely crosses boundaries.

| Task shape | Primary skill | Capability |
|---|---|---|
| Edited HTML/CSS; no reference design | `./workflows/markup-assist/SKILL.md` | Route to the smallest deterministic correctness gate and rerun to green |
| Raw mock, retina export, or screenshot with no reference HTML | `./workflows/mock-markup/SKILL.md` | Normalize the image and recreate verified markup |
| Target screenshot or UI Contract IR | `./workflows/auto-markup/SKILL.md` | Scaffold and converge page/component composition and decoration |
| Responsive, scroll, interaction, or animation behavior | `./workflows/dynamic-markup/SKILL.md` | Extend static convergence with deterministic dynamic gates |
| Natural-language story to browser test | `./workflows/spec-to-playwright/SKILL.md` | Generate reproducible Playwright/VRT and heal drift |
| Need markup authoring signals | `./workflows/vrt-markup-synth/SKILL.md` | Measure components, tokens, theme parity, and i18n stress |
| Whole screen or feature; needs splitting into components first | `./workflows/markup-decompose/SKILL.md` | Decide the component split, route each phase, freeze converged parts as story baselines |
| Repair or restyle ONE component; page diff too noisy | `./workflows/component-vrt/SKILL.md` | Mount one story and diff only that component, at component size |
| Compare two current renders | `./workflows/vrt-visual-diff/SKILL.md` | Explain pixel, section, viewport, and computed-style deltas |
| Detect regressions across repeated CI runs | `./workflows/vrt-regression-watch/SKILL.md` | Persist summaries and fail when most viewports worsen |
| Evaluate a framework/CSS/build migration | `./workflows/vrt-migration-eval/SKILL.md` | Judge visual equivalence despite large intentional rewrites |
| Benchmark known CSS repair challenges | `./workflows/vrt-css-fix-loop/SKILL.md` | Measure VLM+LLM recovery, not production healing |
| Harden an agent-facing CLI, SDK, or harness | `./workflows/agent-validation-loop/SKILL.md` | Turn fresh-agent friction into fixes and tracked evidence |

The human-facing catalog, direct install commands, and category rationale are
in the [vlmkit skill catalog](https://github.com/mizchi/vlmkit/tree/main/.claude/skills).

## CLI Commands

All commands run from the **project root**. See `docs/api-design.md` for API design details.

### Basic

```bash
pnpm test                      # Unit tests (all workspace packages)
vlmkit snapshot <url>...       # URL → baseline + diff
vlmkit diff html a.html b.html # Compare two HTML files / URLs
vlmkit diff agent <report>     # Agent-friendly Markdown diff report
```

### Markup assistance (automatic markup)

All deterministic — no VLM / API key required.

```bash
vlmkit build component <target.png> <current.html>  # Converge HTML toward a target screenshot
vlmkit build page <target.png> <current.html>       # Multi-component composition diff (missing/extra/order/gaps)
vlmkit scan component <screenshot.png>              # Detect + crop components
vlmkit contract introspect <html|url>               # Existing markup → UI Contract IR
vlmkit contract scaffold <ui.contract.json>         # UI Contract IR → HTML/CSS scaffold
vlmkit contract validate <ui.contract.json>         # Validate the IR
vlmkit check palette <target.png> [current.png]     # Dominant colors / palette diff
vlmkit check tokens|theme|motion <html>             # Design-system audits
vlmkit check a11y contrast|touch|focus <html>       # A11y gates
vlmkit stress i18n|media <html>                     # Overflow / media-variant stress
vlmkit heal selector <html|url> ".broken"           # Selector replacement candidates
```

### CSS Challenge (detection rate benchmark)

```bash
pkf run fix-loop -- --fixture page --seed 42         # Single CSS deletion challenge (VLM/LLM recovery)
pkf run css-bench -- --trials 30                     # Benchmark (detection rate measurement)
pkf run css-bench-crater -- --fixture page           # Crater prescanner backend
pkf run css-bench-all                                # All fixtures at once
pkf run css-report                                   # Analysis report of accumulated data
```

### Migration VRT (CSS migration verification)

```bash
pkf run migration-compare -- before.html after.html  # 2-file comparison
pkf run migration-reset        # Reset CSS comparison (normalize vs others)
pkf run migration-tailwind     # Tailwind → vanilla CSS
```

Breakpoints are auto-discovered from CSS, generating boundary ±1px + random sample viewports.

### Demo

```bash
pkf run vlmkit-demo               # Basic VRT demo (kitty graphics)
pkf run vlmkit-demo-fix           # Fix loop demo
pkf run vlmkit-demo-multi         # Multi-scenario
pkf run vlmkit-demo-multistep     # Multi-step
```

## Agent Workflow

### Basic Loop

```
┌─────────────────────────────────────────────┐
│ 1. Create baseline                          │
│    pkf run vrt-update                       │
└─────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 2. Make code changes                        │
│    - State intent clearly in commit message │
│      (feat: / fix: / style: / refactor: /   │
│       a11y: / deps:)                        │
└─────────┬───────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────┐
│ 3. pkf run vlmkit                              │
└─────────┬───────────────────────────────────┘
          │
     ┌────┴────────────────┐
     │                     │
   PASS               FAIL/ESCALATE
     │                     │
     ▼                     ▼
┌──────────┐    ┌─────────────────────┐
│ 4a.      │    │ 4b. Identify issue  │
│ Done     │    │     → Fix code      │
│          │    │     → Return to 3   │
└──────────┘    └─────────────────────┘
```

### Verification Pipeline (runs automatically)

```
Change ─→ 3 tracks run in parallel:

Track 1: Diff Intent    — git diff + commit message → infer change intent
Track 2: Visual Diff    — pixel comparison → heatmap → region classification
Track 3: A11y Diff      — a11y tree diff → semantic change detection

→ Cross-Validation (cross-reference all 3):

| Visual | A11y  | Intent  | → Verdict             |
|--------|-------|---------|----------------------|
| None   | None  | any     | APPROVE (no change)   |
| Yes    | Yes   | match   | APPROVE (as expected) |
| Yes    | Yes   | none    | ESCALATE (unclear intent) |
| Yes    | None  | style   | APPROVE (visual only) |
| Yes    | None  | refac   | ESCALATE (unintended) |
| None   | Yes   | a11y    | APPROVE (a11y improvement) |
| None   | Yes   | other   | REJECT (semantics broken) |
| any    | regr  | any     | REJECT (a11y regression) |

→ Quality Gate:
  - Whiteout detection (blank white screen)
  - Error state detection (red warning display)
  - Empty content detection
  - A11y regression (lost label, removed landmark)
```

## exit code

| code | Meaning |
|------|---------|
| 0    | PASS — no change, or all approved |
| 1    | FAIL — rejected changes, or quality error |

escalate returns exit 0 but emits warnings.

## How to Write Commit Messages

The verification pipeline infers change intent from the commit message.
When intent is correctly inferred, expected visual changes are auto-approved.

```
feat: add dark mode toggle          → visual + a11y additions expected
fix: fix mobile layout breakage     → only fix target should change
refactor: extract utility functions → no visual/a11y changes expected
style: change button color blue→green → visual change, no a11y change expected
a11y: add labels to form            → a11y change, minimal visual change expected
deps: update to React 19            → no visual/a11y changes expected
```

## A11y Check Usage

VRT verify also inspects the A11y tree simultaneously. The following are detected:

- Button/link without label (`label-missing`)
- Image without alt text (`img-alt-missing`)
- Landmark element removed (`landmark-changed`)
- Interactive element removed (`node-removed`)
- Inappropriate role change (`role-changed`)

If any of these are detected during refactoring,
semantics are likely broken.

## File Structure

This repository is a pnpm workspace. See `.claude/CLAUDE.md` § Package Layout for the authoritative table.

```
├── skills/vlmkit/SKILL.md     ← Public automatic skill entry
├── Taskfile.pkl               # Task runner (pkfire: `pkf run <task>`)
├── Spec.pkl / Test.pkl        # Specs + smoke gate (pkspec)
├── playwright.config.ts       # Playwright config for VRT
├── e2e/                       # Screenshot + a11y collection specs
├── fixtures/                  # Test fixtures (a11y, migration, wireframe, ...)
├── packages/
│   ├── vlmkit-core/           # Pixel/CSS/DOM/a11y diff engine + shared types
│   ├── vlmkit-capture/        # Playwright / Crater capture, viewport discovery
│   ├── vlmkit-ai/             # VLM/LLM clients, 2-stage reasoning pipeline
│   ├── vlmkit-markup/         # Markup tooling: build/scan component, contract
│   │                          #   introspect/validate/scaffold, checks, stress,
│   │                          #   selector-heal (all deterministic, no VLM)
│   ├── vlmkit-plan/           # Spec + UI observations → structured test plan
│   ├── vlmkit-generate/       # Plan → Playwright spec (diagnostics-driven retries)
│   └── vlmkit-heal/           # Failing-test heal loop (model escalation + budget)
├── src/
│   ├── cli/                   # `vlmkit` CLI entry + router + commands
│   ├── api/                   # Hono HTTP API server
│   ├── vrt/                   # snapshot / compare workflows
│   ├── util/                  # markup-loop, skill, agent helpers
│   └── experiments/           # migration, css-challenge, detection, benchmarks
└── docs/                      # knowledge.md, markup-implementation-flow.md, reports/
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Font rendering diffs | Adjust pixelmatch threshold (packages/vlmkit-core/src/heatmap.ts) |
| A11y tree is null | Wait for page render completion (adjust waitFor) |
| Everything becomes ESCALATE | Add prefix to commit message (feat:/fix:/style: etc.) |
