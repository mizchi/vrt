/**
 * vrt-harness API 型定義
 *
 * CLI, サーバー (Hono), Cloudflare Workers, Client SDK の共通型。
 * ここが全てのインターフェースの source of truth。
 */

// ---- Viewport ----

export interface Viewport {
  width: number;
  height: number;
  label?: string;
}

// ---- Compare API ----

export interface CompareRequest {
  /** HTML ベースライン */
  baseline: HtmlSource;
  /** HTML 比較対象 */
  current: HtmlSource;
  /** viewport 指定 (省略時は breakpoint 自動発見) */
  viewports?: Viewport[];
  /** breakpoint 自動発見オプション */
  discover?: DiscoverOptions;
  /** 許容差分ルール */
  approval?: ApprovalRule[];
  /** レンダリングバックエンド */
  backend?: "chromium" | "crater" | "prescanner";
  /** 追加オプション */
  options?: CompareOptions;
}

export interface HtmlSource {
  /** inline HTML */
  html?: string;
  /** URL (サーバーサイドで fetch) */
  url?: string;
  /** ラベル (レポート用) */
  label?: string;
}

export interface DiscoverOptions {
  /** breakpoint 発見バックエンド */
  backend?: "regex" | "crater" | "auto";
  /** ランダムサンプル数 */
  randomSamples?: number;
  /** viewport 上限 */
  maxViewports?: number;
}

export interface CompareOptions {
  /** pixel diff threshold (0-1) */
  threshold?: number;
  /** computed style diff を含める */
  computedStyle?: boolean;
  /** hover emulation を含める */
  hoverEmulation?: boolean;
  /** paint tree diff を含める (crater only) */
  paintTree?: boolean;
  /** a11y tree diff を含める */
  a11y?: boolean;
  /** heatmap 画像を生成 */
  generateHeatmap?: boolean;
}

export interface CompareResponse {
  /** 全体の判定 */
  status: "pass" | "fail" | "approved";
  /** viewport ごとの結果 */
  viewports: ViewportResult[];
  /** 発見された breakpoint */
  breakpoints?: BreakpointInfo[];
  /** メタ情報 */
  meta: CompareMeta;
}

export interface ViewportResult {
  viewport: Viewport;
  /** pixel diff */
  pixelDiff: PixelDiffResult;
  /** computed style diff (オプション) */
  computedStyleDiff?: ComputedStyleDiffResult;
  /** paint tree diff (crater, オプション) */
  paintTreeDiff?: PaintTreeDiffResult;
  /** a11y diff (オプション) */
  a11yDiff?: A11yDiffResult;
  /** hover diff (オプション) */
  hoverDiff?: HoverDiffResult;
  /** approval で承認された差分 */
  approvedDiffs?: ApprovedDiff[];
  /** この viewport の判定 */
  status: "pass" | "fail" | "approved";
}

export interface PixelDiffResult {
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  /** heatmap 画像 (base64 PNG, generateHeatmap 時) */
  heatmapBase64?: string;
  /** diff 領域 */
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
  /** canonical 形式 */
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
  /** CSS mutation リスト */
  mutations: CssMutation[];
  viewports?: Viewport[];
  discover?: DiscoverOptions;
  backend?: "chromium" | "crater" | "prescanner";
  options?: CompareOptions;
}

export interface CssMutation {
  id: string;
  /** セレクタ + プロパティの削除 */
  remove?: { selector: string; property?: string };
  /** CSS テキストの置換 */
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
  /** マッチ条件 */
  selector?: string;
  property?: string;
  category?: string;
  changeType?: string;

  /** 許容条件 */
  tolerance?: {
    pixels?: number;
    ratio?: number;
    geometryDelta?: number;
    colorDelta?: number;
  };

  /** メタ */
  reason: string;
  issue?: string;
  expires?: string;
}

export interface ApprovalManifest {
  rules: ApprovalRule[];
}

// ---- Smoke Test API ----

export interface SmokeTestRequest {
  /** テスト対象 */
  target: HtmlSource;
  /** 操作モード */
  mode: "random" | "reasoning";
  /** 最大操作数 */
  maxActions?: number;
  /** ランダム seed (再現用) */
  seed?: number;
  /** 外部ナビゲーションをブロック */
  blockExternalNavigation?: boolean;
  /** LLM provider (reasoning モード) */
  llmProvider?: string;
}

export interface SmokeTestResponse {
  /** 全体の判定 */
  status: "pass" | "crash" | "error";
  /** 実行した操作列 */
  actions: SmokeAction[];
  /** 検出したエラー */
  errors: SmokeError[];
  /** 各ステップの a11y スナップショット */
  snapshots?: A11ySnapshot[];
  meta: SmokeTestMeta;
}

export interface SmokeAction {
  step: number;
  /** 操作対象 */
  target: {
    role: string;
    name: string;
    selector?: string;
  };
  /** 操作種別 */
  action: "click" | "type" | "check" | "uncheck" | "select" | "hover" | "focus";
  /** 入力値 (type, select) */
  value?: string;
  /** 操作後の状態 */
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
