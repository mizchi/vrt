# crater breakpoint discovery design

As of 2026-04-02, crater core / BiDi / `vrt` integration is implemented; what remains unfinished is the v2 scope such as external stylesheet discovery.

## Background

The original `vrt` had the idea of treating breakpoints as boundary values for quickcheck, but extraction was regex-based and only looked at `<style>`.

Now `migration-compare --discover-backend auto|regex|crater` is available, and the default `auto` prefers crater's `getResponsiveBreakpoints`, falling back to regex discovery only when unavailable.

Meanwhile, `crater` already has:

- media query parser / evaluator
- stylesheet parser
- BiDi extensions (`capturePaintTree`, `setViewport`)

Therefore, it's natural to consolidate breakpoint discovery normalization and contracts on the `crater` side, limiting `vrt` to the responsibility of converting them into test inputs.

## Goal

- Extract responsive breakpoint candidates from CSS media queries via parser-based approach
- Enable `vrt` to convert them into viewport sets as quickcheck boundary values
- Enable `migration-compare` to union breakpoints from baseline / variant
- Fix the contract upfront for easy future extension to external stylesheets and container queries

## Non-Goal

- Estimating "breakpoints where appearance actually changes" in v1
- Expanding container queries or `prefers-color-scheme` into test inputs in v1
- Having `crater` own viewport budget or random sampling policy
- Moving fixed viewport strategy for `flaker` into `crater`

## Responsibility Boundary

### crater's responsibilities

- Normalize media queries via parser-based approach
- Absorb unit differences like `px / em / rem`
- Map `min-width`, `max-width`, range syntax to the same contract
- Return breakpoint candidates from the current document
- Return non-width conditions and unsupported conditions as diagnostics

### vrt's responsibilities

- Union breakpoint sets from baseline / variant
- Expand `>= N` to `N-1, N` etc., converting to quickcheck boundary inputs
- Control `maxViewports`, `randomSamples`, standard viewport mixing
- Manage fixed viewport manifests for flaky analysis and CI

## Core Policy

What `crater` returns is `canonical responsive breakpoints`, not `suggested viewports`.

Reasons:

- Viewport generation is `vrt`'s test policy
- `maxViewports` and `randomSamples` change based on harness / CI needs
- Systems like `flaker` that require stable identities need fixed viewports
- `crater` is more reusable when it acts as the CSS semantics authority

## Target API Layers

```text
crater core
  -> discover_responsive_breakpoints(html, external_css?)

crater BiDi
  -> browsingContext.getResponsiveBreakpoints

vrt
  -> union breakpoints
  -> generateViewports(...)
```

## v1 Scope

v1 is cut narrow.

- axis: `width` only
- media type: `screen`, `all`, type omitted only
- feature:
  - `min-width`
  - `max-width`
  - `width >=`
  - `width >`
  - `width <=`
  - `width <`
- unit:
  - `px`
  - `em`
  - `rem`
- source:
  - inline / live `<style>` present in the current document

## Items deferred to diagnostics in v1

- `print`, `speech`
- `height`, `min-height`, `max-height`
- `orientation`
- `aspect-ratio`
- `prefers-color-scheme`
- `prefers-reduced-motion`
- `container query`
- `vw`, `vh`
- `not ...`

However, items that appear alongside width conditions are not fully discarded but returned as `guards`.

Example:

```css
@media (min-width: 768px) and (orientation: landscape) { ... }
```

In this case, `width >= 768` is returned as a breakpoint, and `orientation:landscape` is placed in `guards`.

## crater core contract

```ts
type ResponsiveBreakpoint = {
  axis: "width";
  op: "ge" | "gt" | "le" | "lt";
  valuePx: number;
  raw: string;
  normalized: string;
  guards: string[];
  ruleCount: number;
};

type BreakpointDiscoveryDiagnostics = {
  stylesheetCount: number;
  ruleCount: number;
  externalStylesheetLinks: string[];
  ignoredQueries: string[];
  unsupportedQueries: string[];
};

type BreakpointDiscoveryResult = {
  breakpoints: ResponsiveBreakpoint[];
  diagnostics: BreakpointDiscoveryDiagnostics;
};
```

### Normalization rules

- `min-width: 768px` -> `{ op: "ge", valuePx: 768 }`
- `max-width: 48em` -> `{ op: "le", valuePx: 768 }`
- `width > 600px` -> `{ op: "gt", valuePx: 600 }`
- `width < 1024px` -> `{ op: "lt", valuePx: 1024 }`

Equivalent breakpoints are aggregated by `(op, valuePx, guards)` unit, incrementing `ruleCount`.

## crater BiDi contract

Method name:

```json
{
  "method": "browsingContext.getResponsiveBreakpoints",
  "params": {
    "context": "session-1",
    "mode": "live-inline",
    "axis": "width",
    "includeDiagnostics": true
  }
}
```

Response:

```json
{
  "breakpoints": [
    {
      "axis": "width",
      "op": "ge",
      "valuePx": 768,
      "raw": "(min-width: 48em)",
      "normalized": "(width >= 768px)",
      "guards": [],
      "ruleCount": 8
    }
  ],
  "diagnostics": {
    "stylesheetCount": 2,
    "ruleCount": 145,
    "externalStylesheetLinks": [],
    "ignoredQueries": ["print"],
    "unsupportedQueries": ["(prefers-color-scheme: dark)"]
  }
}
```

### Reason for including `mode`

Including `mode` from the start allows extension later without breaking transport.

- `live-inline`: Serialize live document and analyze inline `<style>`
- `html-inline`: Analyze original HTML based on `__lastHTML`
- Future: `live-inline+external`

Default recommended is `live-inline`. It can pick up runtime-injected `<style>`.

## crater internal implementation policy

New module candidate:

```text
src/css/media/discovery.mbt
```

Responsibilities:

- Collect stylesheet text from HTML
- `parse_stylesheet` each stylesheet
- Walk `rule.media_query`
- Convert width conditions to canonical breakpoints
- Build diagnostics

Pseudo-algorithm:

```text
parse_document(html)
  -> stylesheets[]
  -> stylesheet_links[]

for each stylesheet
  parse_stylesheet(css)
  for each rule
    if media_query exists
      extract width breakpoints
      classify non-width conditions into guards / ignored / unsupported
      aggregate ruleCount
```

### Why create the pure API first

- Can unit test without BiDi transport
- Deterministically verifiable from HTML fixtures
- Reusable for future CLI and batch APIs

## live document and external CSS handling

### v1

Serialize the live document like `capturePaintTree` and pass it to the pure API.
At this stage, target inline `<style>` and runtime-injected `<style>`.

### v2

Include external stylesheets in discovery.

Two candidate approaches:

1. Reference loaded CSS text from BiDi handler via session / browser side
2. Have a JS-side cache like `globalThis.__loadedStylesheets`

Since the current `SessionState` is thin and doesn't directly hold browser state, v1 won't go this far.

## vrt-side integration point

`src/viewport-discovery.ts` has regex extraction and viewport generation tightly coupled.
When introducing crater, make the generation logic the proper API and make the extraction source swappable.

Expected:

- Keep `extractBreakpointsRegex()` as fallback
- Extend `generateViewports()` to be `op`-based
- Make `discoverViewports()` an adapter for crater / regex

### Mapping to boundary values

- `ge N` -> `N-1`, `N`
- `gt N` -> `N`, `N+1`
- `le N` -> `N`, `N+1`
- `lt N` -> `N-1`, `N`

`migration-compare` queries baseline / variant separately, unions breakpoints, then generates viewports.

## testing strategy

### crater core unit tests

Minimum Red:

1. `@media (min-width: 768px)` -> `ge 768`
2. `@media (max-width: 48em)` -> `le 768`
3. `@media (width > 600px)` -> `gt 600`
4. `@media (min-width: 768px) and (orientation: landscape)` -> `ge 768 + guards`
5. Deduplicate comma-separated queries
6. Put `print` into `ignoredQueries`

### BiDi integration tests

- Can retrieve inline `<style>` from current context
- Can retrieve runtime-added `<style>`
- `no such frame` on invalid context
- Unsupported conditions appear in diagnostics

### vrt tests

- Can pass crater breakpoints to `generateViewports()`
- Can take union of baseline / variant
- `--discover-backend crater|regex|auto` switching works
- Falls back to regex when crater is unavailable

## Phased implementation

### Phase 1

- crater core: `discover_responsive_breakpoints(html)`
- crater BiDi: `browsingContext.getResponsiveBreakpoints`
- vrt: crater client method

### Phase 2

- Separate `viewport-discovery.ts` into `extract` and `generate`
- Add `--discover-backend crater|regex|auto` to `migration-compare`
- Baseline / variant breakpoint union
- Include discovery diagnostics in report

### Phase 3

- External stylesheet support
- Breakpoint prioritization by `ruleCount`
- Phased support for `height`, `orientation`, `prefers-color-scheme`
- Add crater backend to `vrt discover` CLI

## open questions

### 1. How to handle `not`

Safest to defer to diagnostics in v1.
Accurately mapping `not` to boundary values adds a level of semantic complexity.

### 2. Reflect `guards` in viewports?

Not in v1.
Expand to test dimensions beyond viewport when there's a need to simultaneously test `orientation` or color scheme.

### 3. Where to store external stylesheets

More natural to keep on the browser runtime side rather than directly under the BiDi session.
However, v1 provides sufficient value with just inline/live styles.

## Adoption decision

With this design:

- `crater` is the authority on CSS / media semantics
- `vrt` is the authority on quickcheck input generation

This role separation holds.
Since v1 can be cut narrow, we can deliver parser-based discovery value quickly while safely extending to external CSS and multi-axis discovery.
