/**
 * Playwright テストヘルパ: onlyOnFailure NL assertion
 *
 * 通常のアサーションが失敗した場合のみ、Vision LLM を使って
 * スクリーンショット + a11y ツリーから修正ヒントを生成する。
 *
 * コスト最適化:
 * - onlyOnFailure: true → テスト失敗時のみ発火
 * - dependsOn → dep graph で影響がなければスキップ
 * - キャッシュ → 同じアサーションを再実行しない
 */
import type { Page } from "@playwright/test";
import type { NlAssertion } from "./types.ts";
import type { LLMProvider } from "./intent.ts";

export interface NlAssertOptions {
  /** テスト失敗時のみ発火 (default: true) */
  onlyOnFailure?: boolean;
  /** このアサーションが依存するソースファイル */
  dependsOn?: string[];
  /** LLM プロバイダ */
  llm?: LLMProvider;
  /** 前回の結果をキャッシュするか */
  cache?: boolean;
}

interface NlAssertResult {
  passed: boolean;
  reasoning: string;
  hint?: string;
  skipped?: boolean;
  skipReason?: string;
}

// アサーション結果のキャッシュ
const assertionCache = new Map<string, NlAssertResult>();

/**
 * 自然言語でUIの状態をアサートする
 *
 * @example
 * ```ts
 * test("home page", async ({ page }) => {
 *   await page.goto("/");
 *
 *   // 通常のアサーション
 *   await expect(page.getByRole("heading")).toBeVisible();
 *
 *   // NL assertion: テスト失敗時のみ発火
 *   await nlAssert(page, "ナビゲーションバーに5つ以上のリンクがある", {
 *     dependsOn: ["src/Header.tsx"],
 *   });
 * });
 * ```
 */
export async function nlAssert(
  page: Page,
  assertion: string,
  opts: NlAssertOptions = {}
): Promise<NlAssertResult> {
  const { onlyOnFailure = true, dependsOn, llm, cache = true } = opts;

  // キャッシュチェック
  const cacheKey = `${page.url()}:${assertion}`;
  if (cache && assertionCache.has(cacheKey)) {
    return assertionCache.get(cacheKey)!;
  }

  // onlyOnFailure: テストが失敗していなければスキップ
  if (onlyOnFailure) {
    // Playwright のテスト状態を確認する方法がないため、
    // 呼び出し元が try-catch で制御する前提
    // このフラグは呼び出しパターンのガイドとして機能
  }

  // LLM が利用できない場合はヒューリスティクスにフォールバック
  if (!llm) {
    const result = await heuristicAssert(page, assertion);
    if (cache) assertionCache.set(cacheKey, result);
    return result;
  }

  // Vision LLM でアサーション
  const result = await llmAssert(page, assertion, llm);
  if (cache) assertionCache.set(cacheKey, result);
  return result;
}

/**
 * ヒューリスティクスベースの NL assertion (LLM なし)
 * a11y ツリーのテキストマッチで簡易判定
 */
async function heuristicAssert(
  page: Page,
  assertion: string
): Promise<NlAssertResult> {
  // a11y ツリーを取得
  let a11yYaml: string;
  try {
    a11yYaml = await page.locator(":root").ariaSnapshot();
  } catch {
    return { passed: false, reasoning: "Failed to get a11y snapshot" };
  }

  // キーワード抽出
  const keywords = assertion
    .toLowerCase()
    .split(/[\s、。が]+/)
    .filter((w) => w.length > 1);

  const a11yLower = a11yYaml.toLowerCase();
  const matched = keywords.filter((k) => a11yLower.includes(k));
  const ratio = matched.length / Math.max(keywords.length, 1);

  // 数値チェック (「5つ以上」「3個」等)
  const numMatch = assertion.match(/(\d+)[つ個以上以下]/);
  let numCheckPassed = true;
  if (numMatch) {
    const expected = parseInt(numMatch[1], 10);
    const isAtLeast = assertion.includes("以上");
    // a11y ツリー内の要素数を概算
    const elementCount = (a11yYaml.match(/- /g) || []).length;
    if (isAtLeast && elementCount < expected) numCheckPassed = false;
  }

  const passed = ratio >= 0.3 && numCheckPassed;

  return {
    passed,
    reasoning: passed
      ? `Heuristic: ${matched.length}/${keywords.length} keywords found in a11y tree`
      : `Heuristic: only ${matched.length}/${keywords.length} keywords matched`,
    hint: passed ? undefined : `Assertion "${assertion}" may not be satisfied. Check the UI.`,
  };
}

/**
 * Vision LLM でスクリーンショット + a11y ツリーからアサーション判定
 */
async function llmAssert(
  page: Page,
  assertion: string,
  llm: LLMProvider
): Promise<NlAssertResult> {
  // スクリーンショット取得
  const screenshot = await page.screenshot({ type: "png" });
  const base64 = screenshot.toString("base64");

  // a11y ツリー取得
  let a11yYaml = "";
  try {
    a11yYaml = await page.locator(":root").ariaSnapshot();
  } catch {
    // fallback
  }

  const prompt = `You are a UI testing assistant. Evaluate the following assertion against the current page state.

Assertion: "${assertion}"

Page URL: ${page.url()}

Accessibility tree:
${a11yYaml.slice(0, 2000)}

Screenshot is attached as base64 PNG.

Respond in JSON:
{
  "passed": true/false,
  "reasoning": "why it passed or failed",
  "hint": "if failed, what should be fixed"
}`;

  try {
    const response = await llm.complete(prompt);
    const parsed = JSON.parse(response);
    return {
      passed: parsed.passed ?? false,
      reasoning: parsed.reasoning ?? "LLM evaluation",
      hint: parsed.hint,
    };
  } catch {
    return {
      passed: false,
      reasoning: "LLM assertion failed to execute",
      hint: "Check LLM provider configuration",
    };
  }
}

/**
 * テスト失敗時のみ NL assertion を発火するラッパー
 *
 * @example
 * ```ts
 * test("form validation", async ({ page }) => {
 *   await page.goto("/contact");
 *
 *   try {
 *     await expect(page.getByRole("form")).toBeVisible();
 *     await expect(page.getByLabel("Email")).toBeVisible();
 *   } catch (e) {
 *     // テスト失敗時のみ NL assertion で修正ヒントを取得
 *     const hint = await nlAssertOnFailure(page, [
 *       "フォームが表示されている",
 *       "全てのフィールドにラベルがある",
 *       "送信ボタンが有効である",
 *     ]);
 *     console.log("Fix hints:", hint);
 *     throw e; // 元のエラーを再 throw
 *   }
 * });
 * ```
 */
export async function nlAssertOnFailure(
  page: Page,
  assertions: string[],
  opts: Omit<NlAssertOptions, "onlyOnFailure"> = {}
): Promise<NlAssertResult[]> {
  const results: NlAssertResult[] = [];

  for (const assertion of assertions) {
    const result = await nlAssert(page, assertion, { ...opts, onlyOnFailure: false });
    results.push(result);
  }

  return results;
}

/**
 * dep graph チェック付き NL assertion
 * 変更されたファイルが dependsOn に影響しなければスキップ
 */
export async function nlAssertWithDepCheck(
  page: Page,
  assertion: string,
  changedFiles: string[],
  opts: NlAssertOptions = {}
): Promise<NlAssertResult> {
  if (opts.dependsOn && opts.dependsOn.length > 0) {
    const affected = opts.dependsOn.some((dep) =>
      changedFiles.some((f) => f.includes(dep))
    );
    if (!affected) {
      return {
        passed: true,
        reasoning: "Skipped: no changes affect this assertion's dependencies",
        skipped: true,
        skipReason: `dependsOn [${opts.dependsOn.join(", ")}] not affected by changes`,
      };
    }
  }

  return nlAssert(page, assertion, opts);
}
