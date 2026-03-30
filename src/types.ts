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

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  diffPixelCount: number;
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
  /** 自然言語の説明 (正)。これだけでも機能する */
  description: string;
  /** 構造化ヒント (optional)。ヒューリスティックマッチに使う。モデル改善で不要になる */
  type?: A11yChangeType;
  path?: string;
  role?: string;
  name?: string;
}

// ---- Expectation Manifest (test-first) ----
//
// 設計原則: description が正、構造化フィールドはヒント
// - 最小形式: { description, pages: [{ testId, expect }] }
// - 構造化フィールドは精度向上のためのオプション
// - モデルが自然言語から直接判定できるようになれば構造化は不要

export interface VrtExpectation {
  /** 変更の意図を自然言語で記述。これが最も重要 */
  description: string;
  /** 構造化 intent (optional)。省略時は description から推測 */
  intent?: Partial<ChangeIntent>;
  pages: PageExpectation[];
}

export interface PageExpectation {
  testId: string;
  /** 期待する状態を自然言語で (構造化フィールドの代替) */
  expect?: string;
  /** 構造化ヒント (optional) */
  visual?: "no-change" | "changed" | "any";
  a11y?: "no-change" | "changed" | "regression-expected" | "any";
  expectedA11yChanges?: ExpectedA11yChange[];
  expectedVisualChanges?: VisualExpectation[];
}

// ---- Long-cycle Spec (invariants) ----
//
// short-cycle: expectation.json — per-commit、このコミットで何が変わるか
// long-cycle:  spec.json — 複数コミットにまたがる不変条件
//
// spec は「常に成り立つべきこと」を宣言する。
// expectation はそれを一時的に上書きできる (regression-expected)。

export interface UiSpec {
  /** この spec 全体の説明 */
  description: string;
  /** ページごとの不変条件 */
  pages: PageSpec[];
  /** グローバル不変条件 (全ページに適用) */
  global?: SpecInvariant[];
}

export interface PageSpec {
  testId: string;
  /** この画面の目的 */
  purpose?: string;
  /** 不変条件リスト */
  invariants: SpecInvariant[];
}

export interface SpecInvariant {
  /** 自然言語で不変条件を記述 (正) */
  description: string;
  /** 構造化ヒント (optional) */
  check?: SpecCheckType;
  /** NL assertion (将来用)。dep graph でスキップ可能 */
  assert?: string;
  /** この invariant を検証するのに必要な依存 (dep graph 連携でスキップ判定に使う) */
  dependsOn?: string[];
  /** 検証コスト。"low" はヒューリスティクス、"high" は LLM/Vision を使う */
  cost?: "low" | "high";
}

export type SpecCheckType =
  | "landmark-exists"     // 特定のランドマークが存在する
  | "label-present"       // インタラクティブ要素にラベルがある
  | "no-whiteout"         // 白飛びしていない
  | "no-error-state"      // エラー表示がない
  | "text-visible"        // 特定テキストが表示されている
  | "element-count"       // 要素数が範囲内
  | "nl-assertion";       // 自然言語アサーション (高コスト)

// ---- Introspect Output ----

export interface IntrospectResult {
  generatedAt: string;
  pages: PageIntrospection[];
}

export interface PageIntrospection {
  testId: string;
  /** 画面の自動生成された説明 */
  description: string;
  /** 検出されたランドマーク */
  landmarks: { role: string; name: string }[];
  /** インタラクティブ要素 */
  interactiveElements: { role: string; name: string; hasLabel: boolean }[];
  /** 画面の統計 */
  stats: {
    totalNodes: number;
    landmarkCount: number;
    interactiveCount: number;
    unlabeledCount: number;
    headingLevels: number[];
  };
  /** 自動推測された不変条件 */
  suggestedInvariants: SpecInvariant[];
}

// ---- NL Assertion (将来用) ----
//
// 自然言語でUIの状態をアサートする。
// コスト: 高 (Vision LLM 呼び出し)。dep graph で影響がないページはスキップ。
//
// 例: "ナビゲーションバーに5つ以上のリンクがある"
//     "フォームの送信ボタンが緑色である"
//     "エラーメッセージが赤字で表示されている"

export interface NlAssertion {
  /** アサーション本文 */
  assert: string;
  /** 対象ページ */
  testId: string;
  /** このアサーションが依存するソースファイル (dep graph でスキップ判定) */
  dependsOn?: string[];
  /** 最後に検証した結果のキャッシュ */
  lastResult?: { passed: boolean; reasoning: string; checkedAt: string };
}

// ---- Scoring ----

export interface LoopScore {
  usability: number;       // 0-100: CLI が使いやすいか、出力が明瞭か
  practicality: number;    // 0-100: 実際の問題を検出/承認できたか
  fixSteps: number;        // 修正に要したステップ数 (少ないほど良い)
  finalQuality: number;    // 0-100: 最終成果物の品質
  tokenUsage: number;      // LLM トークン消費量
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
  | "whiteout" // 白飛び検出
  | "error-state" // エラー表示検出
  | "coverage" // VRT カバレッジ
  | "layout-shift" // レイアウト崩れ
  | "empty-content" // 空コンテンツ
  | "a11y-regression" // A11y リグレッション
  | "a11y-coverage" // A11y カバレッジ
  | "landmark-missing" // ランドマーク欠損
  | "label-missing"; // ラベル欠損
