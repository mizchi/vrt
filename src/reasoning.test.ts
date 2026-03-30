/**
 * Reasoning chain テスト
 *
 * 期待 → 変更 → 実現 の3段階を検証する。
 * 各シナリオで:
 *   1. 期待を宣言する
 *   2. baseline と snapshot の a11y diff を取る
 *   3. 期待が a11y セマンティクスとして実現されたか reasoning する
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, parsePlaywrightA11ySnapshot } from "./a11y-semantic.ts";
import { reasonAboutChanges } from "./reasoning.ts";
import type { A11yNode, PageExpectation, ChangeIntent } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");

async function loadTree(filename: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, filename), "utf-8"));
}

function diffTrees(baseline: A11yNode, snapshot: A11yNode) {
  const b = parsePlaywrightA11ySnapshot("test", "test", baseline as any);
  const s = parsePlaywrightA11ySnapshot("test", "test", snapshot as any);
  return diffA11yTrees(b, s);
}

const baseIntent: ChangeIntent = {
  summary: "",
  changeType: "feature",
  expectedVisualChanges: [],
  expectedA11yChanges: [],
  affectedComponents: [],
};

// ================================================================
// Scenario 1: ヘッダーに検索フォームを追加
// 期待: search ランドマーク + searchbox + button が追加される
// ================================================================
describe("Reasoning: search form added to header", () => {
  it("should verify search landmark was realized", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-search-added.a11y.json");
    const diff = diffTrees(baseline, snapshot);

    // a11y diff では子要素は親 (search landmark) の追加に包含される。
    // そのため期待は「search landmark が追加された」の1つだけでマッチする。
    const exp: PageExpectation = {
      testId: "home",
      expect: "Add search form with search landmark to the header",
      expectedA11yChanges: [
        { description: "Search landmark added to the header" },
      ],
    };

    const chain = reasonAboutChanges("home", exp, diff, {
      ...baseIntent,
      summary: "feat: add search form to header",
      changeType: "feature",
    });

    // search landmark の追加が実現されたか
    assert.equal(chain.verdict, "realized", chain.reasoning);
    assert.equal(chain.mappings.length, 1);
    assert.ok(chain.mappings[0].realized, "Search landmark should be realized");
    assert.ok(chain.reasoning.includes("search"), "Reasoning mentions search");
    assert.ok(chain.reasoning.includes("REALIZED"), "Verdict is REALIZED");
  });

  it("should detect not-realized if search was not added", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    // nav-removed snapshot has no search — search expectation should fail
    const snapshot = await loadTree("snapshot-nav-removed.a11y.json");
    const diff = diffTrees(baseline, snapshot);

    const exp: PageExpectation = {
      testId: "home",
      expect: "Add a search landmark to the header banner",
      expectedA11yChanges: [
        { description: "Search landmark with searchbox added to header", role: "search" },
      ],
    };

    const chain = reasonAboutChanges("home", exp, diff, {
      ...baseIntent,
      summary: "feat: add search form",
    });

    // search は diff に存在しない。nav removal は search ではない。
    assert.ok(!chain.mappings[0].realized, `Should not match: ${chain.reasoning}`);
    assert.ok(
      chain.verdict === "not-realized" || chain.verdict === "unexpected-side-effects",
      `Verdict: ${chain.verdict}`
    );
  });
});

// ================================================================
// Scenario 2: ボタンのラベルを "Send" → "Submit" に変更
// 期待: button の name が変わる。セマンティクスは維持される。
// ================================================================
describe("Reasoning: button label renamed", () => {
  it("should verify name change was realized", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-button-renamed.a11y.json");
    const diff = diffTrees(baseline, snapshot);

    const exp: PageExpectation = {
      testId: "home",
      expect: "Change the send button label from 'Send' to 'Submit'",
      expectedA11yChanges: [
        { description: "Button name changed from Send to Submit", name: "Send" },
      ],
    };

    const chain = reasonAboutChanges("home", exp, diff, {
      ...baseIntent,
      summary: "style: rename send button to submit",
      changeType: "style",
    });

    assert.equal(chain.verdict, "realized", chain.reasoning);

    // mapping が name-changed を捉えている
    const mapping = chain.mappings[0];
    assert.ok(mapping.realized);
    assert.ok(mapping.actual!.includes("name-changed"), `Actual: ${mapping.actual}`);
    assert.ok(mapping.reasoning.includes("Send"), "Reasoning mentions old name");
    assert.ok(mapping.reasoning.includes("Submit"), "Reasoning mentions new name");
  });
});

// ================================================================
// Scenario 3: フォームの a11y を改善 (ラベル追加)
// 期待: 壊れたラベルが修正される。a11y 改善として実現される。
// ================================================================
describe("Reasoning: a11y improvement (label fix)", () => {
  it("should verify labels were added", async () => {
    // baseline = broken labels, snapshot = fixed labels
    const baseline = await loadTree("snapshot-label-broken.a11y.json");
    const snapshot = await loadTree("snapshot-a11y-fixed.a11y.json");
    const diff = diffTrees(baseline, snapshot);

    const exp: PageExpectation = {
      testId: "home",
      expect: "Fix form accessibility: add labels to all form elements",
      expectedA11yChanges: [
        { description: "Form name added (Contact form)" },
        { description: "Email input gets accessible label" },
        { description: "Message input gets accessible label" },
        { description: "Send button gets accessible label" },
      ],
    };

    const chain = reasonAboutChanges("home", exp, diff, {
      ...baseIntent,
      summary: "a11y: add labels to contact form",
      changeType: "a11y",
    });

    // すべてのラベル追加が実現されたか
    const realized = chain.mappings.filter((m) => m.realized);
    assert.ok(realized.length >= 3, `At least 3 of 4 realized: ${realized.length}. ${chain.reasoning}`);

    // verdict は realized or unexpected-side-effects (form name change が extra)
    assert.ok(
      chain.verdict === "realized" || chain.verdict === "unexpected-side-effects",
      `Verdict: ${chain.verdict}. ${chain.reasoning}`
    );
  });

  it("should show detailed reasoning for each label fix", async () => {
    const baseline = await loadTree("snapshot-label-broken.a11y.json");
    const snapshot = await loadTree("snapshot-a11y-fixed.a11y.json");
    const diff = diffTrees(baseline, snapshot);

    const exp: PageExpectation = {
      testId: "home",
      expect: "Add accessible labels to form inputs",
      expectedA11yChanges: [
        { description: "Email textbox gets label", role: "textbox" },
      ],
    };

    const chain = reasonAboutChanges("home", exp, diff, {
      ...baseIntent,
      summary: "a11y: fix form labels",
      changeType: "a11y",
    });

    // mapping の reasoning に name change の詳細が含まれる
    const emailMapping = chain.mappings[0];
    assert.ok(emailMapping.realized, chain.reasoning);
    assert.ok(
      emailMapping.reasoning.includes("name changed") ||
      emailMapping.reasoning.includes("Accessible name"),
      `Reasoning should describe the name change: ${emailMapping.reasoning}`
    );
  });
});

// ================================================================
// Scenario 4: 意図しない side effect の検出
// 期待: ボタン名の変更のみ。実際にはナビも消えている。
// ================================================================
describe("Reasoning: unexpected side effects", () => {
  it("should detect nav removal as side effect when only button rename was expected", async () => {
    const baseline = await loadTree("baseline.a11y.json");
    const snapshot = await loadTree("snapshot-nav-removed.a11y.json");
    const diff = diffTrees(baseline, snapshot);

    const exp: PageExpectation = {
      testId: "home",
      expect: "Only change the button color, no structural changes",
      expectedA11yChanges: [], // 構造変化は期待しない
    };

    const chain = reasonAboutChanges("home", exp, diff, {
      ...baseIntent,
      summary: "style: change button color",
      changeType: "style",
    });

    // 期待した変更はないのに実際に変更がある → not-realized or unexpected
    assert.ok(chain.actualChanges.length > 0, "Should detect actual changes");
    assert.ok(
      chain.verdict === "not-realized" || chain.verdict === "unexpected-side-effects",
      `Should flag unexpected changes: ${chain.verdict}`
    );
    assert.ok(chain.reasoning.includes("not detected") || chain.reasoning.includes("NOT"),
      chain.reasoning);
  });
});
