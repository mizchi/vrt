// ---- Playwright Report Types (subset of JSON reporter output) ----

export interface PlaywrightReport {
  config: { rootDir: string; projects: ProjectConfig[] };
  suites: TestSuite[];
}

export interface ProjectConfig {
  name: string;
  use: Record<string, unknown>;
}

export interface TestSuite {
  title: string;
  file: string;
  suites?: TestSuite[];
  specs: TestSpec[];
}

export interface TestSpec {
  title: string;
  ok: boolean;
  tests: TestResult[];
}

export interface TestResult {
  projectName: string;
  status: "expected" | "unexpected" | "flaky" | "skipped";
  duration: number;
  results: TestAttempt[];
}

export interface TestAttempt {
  status: "passed" | "failed" | "timedOut" | "skipped";
  duration: number;
  attachments: Attachment[];
  errors: TestError[];
}

export interface Attachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
}

export interface TestError {
  message: string;
  stack?: string;
}

// ---- Structured VRT Data ----

export interface VrtSnapshot {
  testId: string;
  testTitle: string;
  projectName: string;
  screenshotPath: string;
  baselinePath?: string;
  status: "new" | "unchanged" | "changed" | "missing";
}

export interface VrtDiff {
  snapshot: VrtSnapshot;
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  heatmapPath?: string;
  regions: DiffRegion[];
}

export type DiffRegionType = "shift" | "content" | "edge";

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPixelCount: number;
  regionType?: DiffRegionType;
}

export interface ShiftRegion {
  yStart: number;
  yEnd: number;
  shift: number;
}

export interface DiffReport {
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  regions: DiffRegion[];
  shiftOnly: boolean;
  contentChangeCount: number;
  globalShift: number;
  shiftRegions: ShiftRegion[];
  compensatedDiffCount: number;
  compact: string;
}

// ---- Dependency Graph ----

export type Language = "typescript" | "moonbit" | "rust";

export interface DepNode {
  id: string;
  filePath: string;
  language: Language;
  exports: string[];
  isComponent: boolean;
}

export interface DepEdge {
  from: string; // importer
  to: string; // imported
  specifiers: string[];
}

export interface DepGraph {
  nodes: Map<string, DepNode>;
  edges: DepEdge[];
}

export interface AffectedComponent {
  node: DepNode;
  depth: number; // distance from changed file
  changedDependencies: string[];
}

// ---- Intent / Semantics ----

export interface ChangeIntent {
  summary: string;
  expectedVisualChanges: VisualExpectation[];
  expectedA11yChanges: A11yExpectation[];
  affectedComponents: string[];
  changeType: "feature" | "bugfix" | "refactor" | "style" | "deps" | "a11y" | "unknown";
}

export interface VisualExpectation {
  component: string;
  description: string;
  confidence: number; // 0-1
}

export interface A11yExpectation {
  testId: string;
  expectedChanges: ExpectedA11yChange[];
}

export interface ExpectedA11yChange {
  /** NL description (primary). Works standalone */
  description: string;
  /** Structured hint (optional). Used for heuristic matching */
  type?: A11yChangeType;
  path?: string;
  role?: string;
  name?: string;
}

// ---- Expectation Manifest (test-first) ----
//
// Design: description is primary, structured fields are hints
// - Minimal form: { description, pages: [{ testId, expect }] }
// - Structured fields are optional for improved accuracy

export interface VrtExpectation {
  /** NL description of the change intent (primary) */
  description: string;
  /** Structured intent (optional). Inferred from description if omitted */
  intent?: Partial<ChangeIntent>;
  pages: PageExpectation[];
}

export interface PageExpectation {
  testId: string;
  /** Expected state in NL (alternative to structured fields) */
  expect?: string;
  /** Structured hint (optional) */
  visual?: "no-change" | "changed" | "any";
  a11y?: "no-change" | "changed" | "regression-expected" | "any";
  expectedA11yChanges?: ExpectedA11yChange[];
  expectedVisualChanges?: VisualExpectation[];
}

// ---- Long-cycle Spec (invariants) ----
//
// short-cycle: expectation.json -- per-commit, what changes in this commit
// long-cycle:  spec.json -- invariants across multiple commits
//
// spec declares "what must always hold".
// expectation can temporarily override it (regression-expected).

export interface UiSpec {
  /** Description of this spec */
  description: string;
  /** Per-page invariants */
  pages: PageSpec[];
  /** Global invariants (applied to all pages) */
  global?: SpecInvariant[];
}

export interface PageSpec {
  testId: string;
  /** Purpose of this page */
  purpose?: string;
  /** Invariant list */
  invariants: SpecInvariant[];
}

export interface SpecInvariant {
  /** NL description of the invariant (primary) */
  description: string;
  /** Structured hint (optional) */
  check?: SpecCheckType;
  /** NL assertion (future). Can be skipped via dep graph */
  assert?: string;
  /** Dependencies needed to verify this invariant (for dep graph skip decisions) */
  dependsOn?: string[];
  /** Verification cost. "low" = heuristics, "high" = LLM/Vision */
  cost?: "low" | "high";
}

export type SpecCheckType =
  | "landmark-exists"
  | "label-present"
  | "no-whiteout"
  | "no-error-state"
  | "text-visible"
  | "element-count"
  | "nl-assertion";

// ---- Introspect Output ----

export interface IntrospectResult {
  generatedAt: string;
  pages: PageIntrospection[];
}

export interface PageIntrospection {
  testId: string;
  /** Auto-generated page description */
  description: string;
  /** Detected landmarks */
  landmarks: { role: string; name: string }[];
  /** Interactive elements */
  interactiveElements: { role: string; name: string; hasLabel: boolean }[];
  /** Page statistics */
  stats: {
    totalNodes: number;
    landmarkCount: number;
    interactiveCount: number;
    unlabeledCount: number;
    headingLevels: number[];
  };
  /** Auto-inferred invariants */
  suggestedInvariants: SpecInvariant[];
}

// ---- NL Assertion (future) ----
//
// Assert UI state via natural language.
// Cost: high (Vision LLM call). Pages unaffected by dep graph are skipped.

export interface NlAssertion {
  /** Assertion text */
  assert: string;
  /** Target page */
  testId: string;
  /** Source files this assertion depends on (for dep graph skip decisions) */
  dependsOn?: string[];
  /** Cached result of last verification */
  lastResult?: { passed: boolean; reasoning: string; checkedAt: string };
}

// ---- Scoring ----

export interface LoopScore {
  usability: number;       // 0-100
  practicality: number;    // 0-100
  fixSteps: number;        // fewer is better
  finalQuality: number;    // 0-100
  tokenUsage: number;
  summary: string;
  details: ScoreDetail[];
}

export interface ScoreDetail {
  category: string;
  score: number;
  maxScore: number;
  reasoning: string;
}

export interface DiffSemantics {
  filesChanged: FileChange[];
  commitMessage: string;
  intent: ChangeIntent;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  content: string;
  startLine: number;
  endLine: number;
}

// ---- Agent Reasoning ----

export interface VrtVerdict {
  snapshotId: string;
  decision: "approve" | "reject" | "escalate";
  reasoning: string;
  matchedIntent?: VisualExpectation;
  confidence: number;
}

export interface AgentContext {
  intent: ChangeIntent;
  diffs: VrtDiff[];
  verdicts: VrtVerdict[];
  qualityChecks: QualityCheckResult[];
}

// ---- Accessibility Semantic Types ----

export interface A11yNode {
  role: string;
  name: string;
  level?: number;
  value?: string;
  description?: string;
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  pressed?: boolean | "mixed";
  selected?: boolean;
  children?: A11yNode[];
}

export interface A11ySnapshot {
  testId: string;
  testTitle: string;
  tree: A11yNode;
}

export type A11yChangeType =
  | "node-added"
  | "node-removed"
  | "role-changed"
  | "name-changed"
  | "state-changed"
  | "structure-changed"
  | "landmark-changed";

export interface A11yChange {
  type: A11yChangeType;
  path: string; // e.g. "main > navigation > list > listitem[2]"
  before?: Partial<A11yNode>;
  after?: Partial<A11yNode>;
  severity: "error" | "warning" | "info";
  description: string;
}

export interface A11yDiff {
  testId: string;
  changes: A11yChange[];
  hasRegression: boolean;
  landmarkChanges: A11yChange[];
  stats: {
    added: number;
    removed: number;
    modified: number;
  };
}

// ---- Visual Semantic Types ----

export type VisualChangeType =
  | "text-change"
  | "color-change"
  | "layout-shift"
  | "element-added"
  | "element-removed"
  | "icon-change";

export interface VisualSemanticChange {
  type: VisualChangeType;
  region: DiffRegion;
  confidence: number;
  description: string;
}

export interface VisualSemanticDiff {
  testId: string;
  changes: VisualSemanticChange[];
  summary: string;
}

// ---- Cross-Validation ----

export interface CrossValidationResult {
  testId: string;
  visualDiff?: VisualSemanticDiff;
  a11yDiff?: A11yDiff;
  intentMatch: boolean;
  consistency: "consistent" | "visual-only" | "a11y-only" | "mismatch";
  recommendation: "approve" | "reject" | "escalate";
  reasoning: string;
}

// ---- Unified Agent Context ----

export interface UnifiedAgentContext {
  intent: ChangeIntent;
  vrtDiffs: VrtDiff[];
  a11yDiffs: A11yDiff[];
  visualSemanticDiffs: VisualSemanticDiff[];
  crossValidations: CrossValidationResult[];
  verdicts: VrtVerdict[];
  qualityChecks: QualityCheckResult[];
}

// ---- Quality Checks ----

export interface QualityCheckResult {
  check: QualityCheckType;
  passed: boolean;
  details: string;
  severity: "error" | "warning" | "info";
}

export type QualityCheckType =
  | "whiteout"
  | "error-state"
  | "coverage"
  | "layout-shift"
  | "empty-content"
  | "a11y-regression"
  | "a11y-coverage"
  | "landmark-missing"
  | "label-missing";
