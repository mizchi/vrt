# flaker / vrt Integration Design

## Background

`flaker` excels at test selection / flaky detection / quarantine / history accumulation.
`vrt` excels at VRT execution, approval, migration fix loop, and renderer diff analysis.

Combining these two allows VRT to operate not as a one-off comparison tool but as a test suite with retry, quarantine, and trend analysis capabilities in CI.

Target repositories:

- `flaker`: [/Users/mz/ghq/github.com/mizchi/metric-ci](/Users/mz/ghq/github.com/mizchi/metric-ci)
- `vrt`: [/Users/mz/ghq/github.com/mizchi/vrt](/Users/mz/ghq/github.com/mizchi/vrt)

## Goal

- Run Migration VRT via `flaker`'s custom runner
- Have stable test identity per `variant x viewport x backend`
- View per-renderer / per-viewport instability via `flaker flaky --by-variant`
- Use `approval` and `quarantine` together while keeping responsibilities separate

## Non-Goal

- Treating `css-challenge-bench` seed-based trials as `flaker` tests directly
- Merging `approval.json` into `flaker.quarantine.json`
- Adding a built-in runner to `flaker` itself from the start

Initial implementation places the custom runner on the `vrt` side, called from `flaker` as an external command.
As of 2026-04-02, in addition to this custom runner, built-in `vrt-migration` / `vrt-bench` adapters on the `metric-ci` side and artifact collection workflows are implemented.

## Responsibility Boundary

### flaker's responsibilities

- test listing / sampling / execution orchestration
- Execution history accumulation
- Flaky detection
- Quarantine
- Per-variant trend analysis

References: [docs/why-flaker.ja.md](/Users/mz/ghq/github.com/mizchi/metric-ci/docs/why-flaker.ja.md), [types.ts](/Users/mz/ghq/github.com/mizchi/metric-ci/src/cli/runners/types.ts), [quarantine-manifest.ts](/Users/mz/ghq/github.com/mizchi/metric-ci/src/cli/quarantine-manifest.ts)

### vrt's responsibilities

- HTML/URL rendering comparison
- pixel diff / paint tree diff / computed style diff
- Known diff filtering via approval
- migration compare report and fix loop

References: [migration-compare.ts](/Users/mz/ghq/github.com/mizchi/vrt/src/migration-compare.ts), [approval.ts](/Users/mz/ghq/github.com/mizchi/vrt/src/approval.ts), [migration-fix-loop-core.ts](/Users/mz/ghq/github.com/mizchi/vrt/src/migration-fix-loop-core.ts)

## Core Policy

From `flaker`'s perspective, VRT is not a "special test runner" but a "test suite executable via custom runner".

Therefore, the integration centers on the runner protocol, not an import adapter.

```text
flaker sample/run/quarantine
  -> custom runner
    -> vrt migration-compare
      -> report.json + test results
        -> flaker DuckDB
```

## Integration Priority

### Phase 1: Migration VRT custom runner

Top priority. `migration-compare` already outputs machine-readable reports, enabling minimum-cost connection.

### Phase 2: Playwright VRT import

Analyze existing `playwright test`-based `vrt` via `flaker import --adapter playwright` or `collect`.

### Phase 3: report import

Add adapters to directly feed `migration-report.json` and `bench-report.json` into `flaker`.

As of 2026-04-02, built-in `vrt-migration` and `vrt-bench` adapters exist on the `metric-ci` side, handling `migration-report.json` and `bench-report.json` directly via `import / collect / report summarize`. The `vrt`-side `src/flaker-vrt-report-adapter.ts` remains for custom adapter paths and legacy report supplementation.
The `vrt` side has `.github/workflows/migration-report.yml`, running 1 scenario via `workflow_dispatch` and producing artifact name `migration-report`. To avoid conflicts with `metric-ci collect` defaults, initial operation fixes 1 run = 1 scenario.
Similarly, `.github/workflows/bench-report.yml` runs 1 fixture of `css-challenge-bench` with Chromium backend, producing artifact name `bench-report`. Since the `vrt-bench` adapter expects a single `bench-report.json` in the artifact, this also fixes 1 run = 1 fixture.

## Why Start with Migration VRT

- `runMigrationCompare()` is already exported and callable as a function, not just CLI
- `fixedViewports` can be passed, making it easy to run only the test subset specified by `flaker`
- Convergence concepts of `clean / approved / remaining` already exist

References: [migration-compare.ts](/Users/mz/ghq/github.com/mizchi/vrt/src/migration-compare.ts), [migration-fix-loop-core.ts](/Users/mz/ghq/github.com/mizchi/vrt/src/migration-fix-loop-core.ts)

## Stable Test Identity

In `flaker`, stable test identity is important. Using `auto-discover`ed viewports ad hoc means test sets fluctuate with HTML changes, skewing flaky detection.

For this reason, `flaker` integration uses scenario manifests with fixed viewports.

## Scenario Manifest

Filename: `flaker.vrt.json`.

```json
{
  "scenarios": [
    {
      "id": "migration/tailwind-to-vanilla",
      "kind": "migration",
      "dir": "fixtures/migration/tailwind-to-vanilla",
      "baseline": "before.html",
      "variants": ["after.html"],
      "approval": "approval.json",
      "backend": "chromium",
      "viewports": [
        { "label": "wide", "width": 1440, "height": 900 },
        { "label": "desktop", "width": 1280, "height": 900 },
        { "label": "desktop-bp-up", "width": 1025, "height": 900 },
        { "label": "desktop-bp-down", "width": 1024, "height": 900 },
        { "label": "mobile", "width": 375, "height": 812 }
      ]
    }
  ]
}
```

### Design Decisions

- `viewports` is required
- `approval` is optional. If unspecified, follows `migration-compare`'s existing auto-discovery
- `backend` is the scenario default. No per-test override
- `kind` is reserved for future `page-compare` or `component-compare`

## TestId Mapping

Since `flaker`'s `quarantine manifest` expects `spec` to be a real path, `suite` uses the relative path to the variant HTML.

| flaker field | Value |
| --- | --- |
| `suite` | `fixtures/migration/<scenario>/<variant>.html` |
| `testName` | `viewport:<label>` |
| `taskId` | scenario id (`migration/tailwind-to-vanilla`) |
| `variant.backend` | `chromium` / `crater` / `prescanner` |
| `variant.viewport` | `wide` / `desktop` / `mobile` etc. |
| `variant.width` | viewport width |
| `variant.height` | viewport height |

Example:

```json
{
  "suite": "fixtures/migration/tailwind-to-vanilla/after.html",
  "testName": "viewport:desktop",
  "taskId": "migration/tailwind-to-vanilla",
  "variant": {
    "backend": "chromium",
    "viewport": "desktop",
    "width": "1280",
    "height": "900"
  }
}
```

This format allows `flaker quarantine` to point to file paths, and `flaker flaky --by-variant` to show trends by viewport / backend.

## Runner Protocol

The `flaker` side uses the existing custom runner as-is.

References: [runner-adapters.md](/Users/mz/ghq/github.com/mizchi/metric-ci/docs/runner-adapters.md), [custom-runner.ts](/Users/mz/ghq/github.com/mizchi/metric-ci/src/cli/runners/custom-runner.ts)

### list

`flaker-vrt-runner.ts list` reads `flaker.vrt.json` and enumerates `scenario x variant x viewport`, returning `TestId[]`.

### execute

`flaker-vrt-runner.ts execute` bundles the specified `TestId[]` by scenario and calls `runMigrationCompare()` once per scenario.

Calling rules:

- `variants` derived from the requested `suite`
- `fixedViewports` restored from requested `testName` / `variant.viewport`
- `autoDiscover` is `false`
- `outputDir` is `test-results/flaker-vrt/<timestamp-or-runid>/...`

## Result Status Mapping

Map `migration-compare` results to `flaker`'s `TestCaseResult.status`.

| migration result | flaker status | Reason |
| --- | --- | --- |
| `diffPixels === 0` | `passed` | Exact match |
| `approved === true` | `passed` | Known diff is accepted in VRT |
| `partiallyApproved === true` with remaining diff | `failed` | Diff remains even after approval |
| `remaining` | `failed` | Unresolved diff |
| browser launch / crater connection failure / timeout | `flaky` | Treated as temporary infra failure |
| skip by manifest | `skipped` | Quarantine runtime overrides |

### Important decision

Both `clean` and `approved` are treated as `passed`.

Reasons for not making `approved` a separate status:

- `flaker`'s current status model is `passed/failed/skipped/flaky`
- `approved` is run metadata, not identity
- Including `approved` in identity would fragment history

`approved` details are preserved in `vrt`-side report artifacts.

## Approval and Quarantine Separation

### approval

`approval.json` represents "known diffs that exist visually but are acceptable product-wise".

Examples:

- renderer gap
- reset CSS diff
- tiny spacing drift

Reference: [approval.ts](/Users/mz/ghq/github.com/mizchi/vrt/src/approval.ts)

### quarantine

`flaker.quarantine.json` represents "tests that shouldn't block CI right now".

Examples:

- crater server occasionally goes down
- mobile viewport only is non-deterministic
- specific backend only times out

References: [quarantine-manifest.ts](/Users/mz/ghq/github.com/mizchi/metric-ci/src/cli/quarantine-manifest.ts), [quarantine-runtime.ts](/Users/mz/ghq/github.com/mizchi/metric-ci/src/cli/runners/quarantine-runtime.ts)

### Operational rules

- Known legitimate diffs → `approval`
- Non-deterministic failures → `quarantine`
- Don't increase `approval` to hide flaky tests
- Don't increase `quarantine` to hide known diffs

## Output artifacts

The custom runner saves the original report in addition to returning a summary on `stdout`.

Expected path:

```text
test-results/flaker-vrt/
  2026-04-02T18-00-00/
    migration-tailwind-to-vanilla-report.json
    migration-reset-css-report.json
```

`stdout` outputs the report path. Deep-dive by examining `vrt`'s artifacts.

## flaker.toml example

```toml
[repo]
owner = "mizchi"
name = "vrt"

[storage]
path = ".flaker/data.duckdb"

[adapter]
type = "vrt-migration"
artifact_name = "migration-report"

[runner]
type = "custom"
list = "node --experimental-strip-types ./src/flaker-vrt-runner.ts list --config ./examples/flaker.vrt.json"
execute = "node --experimental-strip-types ./src/flaker-vrt-runner.ts execute --config ./examples/flaker.vrt.json"

[affected]
resolver = "simple"
config = ""

[quarantine]
auto = true
flaky_rate_threshold = 30.0
min_runs = 5
```

When operating in the `vrt` standalone repository, the runner lives in this repo, and artifact collection uses `metric-ci`'s built-in `vrt-migration` adapter.

## Implementation Phases

### Phase 1: Minimum connection

- `src/flaker-vrt-config.ts`
  - Type definitions and parser for `flaker.vrt.json`
- `src/flaker-vrt-runner.ts`
  - `list`
  - `execute`
  - `migration-compare` only
- Register `fixtures/migration/*` in scenario manifest

Completion criteria:

- Migration VRT runs with `flaker run --runner custom`
- `viewport` and `backend` appear in `flaker flaky --by-variant`

### Phase 2: Operational pipeline

- `examples/flaker.toml`
- `examples/flaker.vrt.json`
- `node --experimental-strip-types ./src/flaker-vrt-runner.ts list --config ./examples/flaker.vrt.json`
- `node --experimental-strip-types ./src/flaker-vrt-runner.ts execute --config ./examples/flaker.vrt.json`
- `just flaker-vrt-adapt`

Completion criteria:

- Fastest onboarding by copying to a new repo

### Phase 3: Additional integration

- `migration-report.json` import adapter
- Playwright VRT import README pipeline
- `css-bench` summary import

As of 2026-04-02, all 3 items above are complete. What remains is not built-in runner-ization but accumulating real-world artifact operation examples.

## Open Questions

### 1. Runner placement

Initial implementation on the `vrt` side is fine. Reasons:

- Direct access to internal APIs like `runMigrationCompare()`
- `metric-ci` side is currently rename/development in progress with a dirty worktree
- Built-in runner-ization is fine after the protocol is settled

### 2. crater backend handling

`backend = crater` / `prescanner` is included in Phase 1 scope, but start with `chromium` as default considering compatibility with `flaky` detection.

### 3. dynamic viewport discovery

Not used for `flaker` test identities. Kept only as an authoring aid.

## Acceptance Criteria

This design being implemented means the following are satisfied:

1. `flaker-vrt-runner.ts list` returns stable `TestId[]`
2. `flaker-vrt-runner.ts execute` can subset-execute `migration-compare`
3. `approved` maps to `passed`
4. Temporary `crater` / browser failures map to `flaky`
5. `flaker quarantine` and `approval.json` can be used simultaneously without responsibility conflicts
