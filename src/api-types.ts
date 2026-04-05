/**
 * vrt API type definitions
 *
 * Shared types for CLI, server (Hono), Cloudflare Workers, and Client SDK.
 * This is the source of truth for all interfaces.
 */

// ---- Viewport ----

export interface Viewport {
  width: number;
  height: number;
  label?: string;
}

// ---- Compare API ----

export interface CompareRequest {
  /** HTML baseline */
  baseline: HtmlSource;
  /** HTML to compare */
  current: HtmlSource;
  /** Viewport spec (auto-discovers breakpoints if omitted) */
  viewports?: Viewport[];
  /** Breakpoint auto-discovery options */
  discover?: DiscoverOptions;
  /** Approval rules for acceptable diffs */
  approval?: ApprovalRule[];
  /** Rendering backend */
  backend?: "chromium" | "crater" | "prescanner";
  /** Additional options */
  options?: CompareOptions;
}

export interface HtmlSource {
  /** inline HTML */
  html?: string;
  /** URL (fetched server-side) */
  url?: string;
  /** Label (for reports) */
  label?: string;
}

export interface DiscoverOptions {
  /** Breakpoint discovery backend */
  backend?: "regex" | "crater" | "auto";
  /** Number of random samples */
  randomSamples?: number;
  /** Max viewports */
  maxViewports?: number;
}

export interface CompareOptions {
  /** pixel diff threshold (0-1) */
  threshold?: number;
  /** Include computed style diff */
  computedStyle?: boolean;
  /** Include hover emulation */
  hoverEmulation?: boolean;
  /** Include paint tree diff (crater only) */
  paintTree?: boolean;
  /** Include a11y tree diff */
  a11y?: boolean;
  /** Generate heatmap image */
  generateHeatmap?: boolean;
  /** VLM reasoning (analyze diff via image recognition) */
  vlmReasoning?: VlmReasoningOptions;
}

export interface VlmReasoningOptions {
  /** Model tier: free, cheap, mid, premium */
  tier?: "free" | "cheap" | "mid" | "premium";
  /** Specific model ID */
  model?: string;
  /** Custom prompt */
  prompt?: string;
  /** max tokens */
  maxTokens?: number;
}

export interface VlmReasoningResult {
  model: string;
  content: string;
  costUsd: number;
  latencyMs: number;
  tokens: number;
}

// ---- Reasoning Pipeline API ----

export interface ReasoningPipelineRequest {
  /** heatmap PNG (base64) */  heatmapBase64?: string;
  /** baseline screenshot (base64) */
  baselineBase64?: string;
  /** current screenshot (base64) */
  currentBase64?: string;
  /** VRT text report (computed style diff, pixel diff %, etc.) */
  textReport?: string;
  /** CSS source to fix (required for Stage 2) */
  cssSource?: string;
  /** Run both stages (default: stage1 only if cssSource is absent) */
  stages?: "analyze" | "fix" | "both";
  /** Stage 1 VLM model override */
  vlmModel?: string;
  /** Stage 2 LLM provider override */
  llmProvider?: "gemini" | "anthropic" | "openrouter";
}

export interface ReasoningPipelineResponse {
  analysis?: {
    changes: Array<{
      element: string;
      property: string;
      before: string;
      after: string;
      severity: "low" | "medium" | "high";
    }>;
    summary: string;
    regression: boolean;
    model: string;
    latencyMs: number;
    costUsd: number;
  };
  fix?: {
    fixes: Array<{
      selector: string;
      property: string;
      value: string;
      reason: string;
    }>;
    explanation: string;
    confidence: "high" | "medium" | "low";
    model: string;
    latencyMs: number;
    costUsd: number;
  };
  totalCostUsd: number;
  totalLatencyMs: number;
}

export interface CompareResponse {
  /** Overall verdict */
  status: "pass" | "fail" | "approved";
  /** Per-viewport results */
  viewports: ViewportResult[];
  /** Discovered breakpoints */
  breakpoints?: BreakpointInfo[];
  /** Metadata */
  meta: CompareMeta;
}

export interface ViewportResult {
  viewport: Viewport;
  /** pixel diff */
  pixelDiff: PixelDiffResult;
  /** computed style diff (optional) */
  computedStyleDiff?: ComputedStyleDiffResult;
  /** paint tree diff (crater, optional) */
  paintTreeDiff?: PaintTreeDiffResult;
  /** a11y diff (optional) */
  a11yDiff?: A11yDiffResult;
  /** hover diff (optional) */
  hoverDiff?: HoverDiffResult;
  /** Diffs approved by rules */
  approvedDiffs?: ApprovedDiff[];
  /** VLM reasoning (image recognition analysis) */
  vlmReasoning?: VlmReasoningResult;
  /** Verdict for this viewport */
  status: "pass" | "fail" | "approved";
}

export interface PixelDiffResult {
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  /** heatmap image (base64 PNG, when generateHeatmap is set) */
  heatmapBase64?: string;
  /** Diff regions */
  regions: DiffRegion[];
}

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPixelCount: number;
}

export interface ComputedStyleDiffResult {
  changes: ComputedStyleChange[];
  count: number;
}

export interface ComputedStyleChange {
  selector: string;
  property: string;
  before: string;
  after: string;
}

export interface PaintTreeDiffResult {
  changes: PaintTreeChange[];
  count: number;
}

export interface PaintTreeChange {
  path: string;
  type: "geometry" | "paint" | "text" | "added" | "removed";
  property?: string;
  before?: string;
  after?: string;
}

export interface A11yDiffResult {
  changes: A11yChange[];
  hasRegression: boolean;
  count: number;
}

export interface A11yChange {
  type: string;
  path: string;
  description: string;
  severity: "error" | "warning" | "info";
}

export interface HoverDiffResult {
  detected: boolean;
  changes: ComputedStyleChange[];
}

export interface ApprovedDiff {
  rule: ApprovalRule;
  matchedChanges: number;
}

export interface BreakpointInfo {
  value: number;
  type: "min-width" | "max-width";
  /** Canonical form */
  op?: "ge" | "gt" | "le" | "lt";
}

export interface CompareMeta {
  backend: string;
  elapsedMs: number;
  viewportCount: number;
  baselineLabel?: string;
  currentLabel?: string;
}

// ---- Batch Compare API ----

export interface BatchCompareRequest {
  baseline: HtmlSource;
  /** CSS mutation list */
  mutations: CssMutation[];
  viewports?: Viewport[];
  discover?: DiscoverOptions;
  backend?: "chromium" | "crater" | "prescanner";
  options?: CompareOptions;
}

export interface CssMutation {
  id: string;
  /** Remove selector + property */
  remove?: { selector: string; property?: string };
  /** Replace CSS text */
  replaceCss?: { original: string; replacement: string };
}

export interface BatchCompareResponse {
  results: BatchMutationResult[];
  meta: CompareMeta;
}

export interface BatchMutationResult {
  mutationId: string;
  detected: boolean;
  viewports: ViewportResult[];
}

// ---- Approval API ----

export interface ApprovalRule {
  /** Match conditions */
  selector?: string;
  property?: string;
  category?: string;
  changeType?: string;

  /** Tolerance conditions */
  tolerance?: {
    pixels?: number;
    ratio?: number;
    geometryDelta?: number;
    colorDelta?: number;
  };

  /** Metadata */
  reason: string;
  issue?: string;
  expires?: string;
}

export interface ApprovalManifest {
  rules: ApprovalRule[];
}

// ---- Smoke Test API ----

export interface SmokeTestRequest {
  /** Test target */
  target: HtmlSource;
  /** Operation mode */
  mode: "random" | "reasoning";
  /** Max number of actions */
  maxActions?: number;
  /** Random seed (for reproducibility) */
  seed?: number;
  /** Block external navigation */
  blockExternalNavigation?: boolean;
  /** LLM provider (reasoning mode) */
  llmProvider?: string;
}

export interface SmokeTestResponse {
  /** Overall verdict */
  status: "pass" | "crash" | "error";
  /** Executed actions */
  actions: SmokeAction[];
  /** Detected errors */
  errors: SmokeError[];
  /** Per-step a11y snapshots */
  snapshots?: A11ySnapshot[];
  meta: SmokeTestMeta;
}

export interface SmokeAction {
  step: number;
  /** Target element */
  target: {
    role: string;
    name: string;
    selector?: string;
  };
  /** Action type */
  action: "click" | "type" | "check" | "uncheck" | "select" | "hover" | "focus";
  /** Input value (for type, select) */
  value?: string;
  /** Post-action result */
  result: "ok" | "error" | "navigation" | "timeout";
  elapsedMs: number;
}

export interface SmokeError {
  step: number;
  type: "console-error" | "uncaught-exception" | "timeout" | "crash" | "a11y-regression";
  message: string;
  stack?: string;
}

export interface A11ySnapshot {
  step: number;
  tree: A11yNodeCompact;
  interactiveCount: number;
  landmarkCount: number;
  issues: string[];
}

export interface A11yNodeCompact {
  role: string;
  name: string;
  children?: A11yNodeCompact[];
}

export interface SmokeTestMeta {
  totalActions: number;
  totalErrors: number;
  elapsedMs: number;
  seed?: number;
  mode: "random" | "reasoning";
}

// ---- Report API ----

export interface ReportRequest {
  runId?: string;
  fixture?: string;
  backend?: string;
}

export interface ReportResponse {
  summary: ReportSummary;
  byCategory: Record<string, CategoryStat>;
  bySelectorType: Record<string, CategoryStat>;
  trials: TrialSummary[];
}

export interface ReportSummary {
  totalRecords: number;
  uniqueRuns: number;
  detectionRate: number;
  dateRange?: { first: string; last: string };
}

export interface CategoryStat {
  total: number;
  detected: number;
  rate: number;
}

export interface TrialSummary {
  selector: string;
  property: string;
  category: string;
  detected: boolean;
  visualDiffRatio: number;
  computedStyleChanges: number;
  undetectedReason?: string;
}

// ---- Status API ----

export interface StatusResponse {
  version: string;
  capabilities: string[];
  backends: BackendStatus[];
}

export interface BackendStatus {
  name: string;
  available: boolean;
  version?: string;
}
