/**
 * Goal Runner テスト
 *
 * マルチステップのゴールを逐次検証する。
 *
 * シナリオ: "ダークモード対応"
 *   Step 1: テーマ変数 + switch 追加 → baseline → step1
 *   Step 2: ダークモード適用 (switch ON) → step1 → step2
 *   Step 3: a11y 改善 (コントラスト情報 + アクセシビリティリンク) → step2 → step3
 *
 * 各 step で前の step の snapshot が次のベースラインになる。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runGoal, formatGoalReport } from "./goal-runner.ts";
import type { Goal, GoalStep } from "./goal-runner.ts";
import type { A11yNode, PageExpectation } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures", "react-sample");

async function loadTree(filename: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, filename), "utf-8"));
}

describe("Goal Runner: dark mode implementation", () => {
  const darkModeGoal: Goal = {
    description: "Implement dark mode with accessibility",
    steps: [
      {
        description: "Add theme switch to header",
        snapshotFile: "snapshot-step1-theme-vars.a11y.json",
        expectation: {
          testId: "page",
          expect: "Dark mode switch added to banner",
          expectedA11yChanges: [
            { description: "Switch element for dark mode added" },
          ],
        },
      },
      {
        description: "Apply dark theme (toggle switch ON)",
        snapshotFile: "snapshot-step2-dark-applied.a11y.json",
        expectation: {
          testId: "page",
          expect: "Dark mode switch toggled to checked state",
          expectedA11yChanges: [
            { description: "Switch checked state changed to true" },
          ],
        },
      },
      {
        description: "Add accessibility info and links",
        snapshotFile: "snapshot-step3-dark-a11y.a11y.json",
        expectation: {
          testId: "page",
          expect: "Accessibility link and contrast info region added",
          expectedA11yChanges: [
            { description: "Accessibility link added to navigation" },
            { description: "Color contrast region added" },
          ],
        },
      },
    ],
    successCriteria: "Dark mode toggle exists, accessibility info present",
  };

  it("should complete all 3 steps successfully", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const state = await runGoal(
      darkModeGoal,
      baseline,
      async (step, _retry) => loadTree(step.snapshotFile!),
    );

    console.log(formatGoalReport(state));

    assert.equal(state.status, "completed", `Goal should complete: ${state.finalScore?.summary}`);
    assert.equal(state.stepResults.length, 3);
    assert.ok(state.stepResults.every((r) => r.passed), "All steps should pass");
    assert.equal(state.finalScore!.totalRetries, 0);
    assert.equal(state.finalScore!.averageStepScore, 100);
  });

  it("should fail if step 2 snapshot is wrong", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const brokenGoal: Goal = {
      ...darkModeGoal,
      steps: [
        darkModeGoal.steps[0],
        {
          ...darkModeGoal.steps[1],
          // Wrong snapshot — use nav-removed instead of dark-applied
          snapshotFile: "snapshot-nav-removed.a11y.json",
        },
        darkModeGoal.steps[2],
      ],
    };

    const state = await runGoal(
      brokenGoal,
      baseline,
      async (step, _retry) => loadTree(step.snapshotFile!),
      { maxRetries: 0 },
    );

    assert.equal(state.status, "failed");
    assert.ok(!state.stepResults[1].passed, "Step 2 should fail");
    assert.equal(state.stepResults.length, 2, "Should stop at failed step");
  });

  it("should produce meaningful scores", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const state = await runGoal(
      darkModeGoal,
      baseline,
      async (step, _retry) => loadTree(step.snapshotFile!),
    );

    const score = state.finalScore!;
    assert.equal(score.stepSuccessRate, 1);
    assert.equal(score.goalRealized, true);
    assert.ok(score.averageStepScore >= 80);
    assert.ok(score.summary.includes("ACHIEVED"));
  });

  it("should verify reasoning chains at each step", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const state = await runGoal(
      darkModeGoal,
      baseline,
      async (step, _retry) => loadTree(step.snapshotFile!),
    );

    // Step 1: switch added
    const r1 = state.stepResults[0].reasoning;
    assert.equal(r1.verdict, "realized");
    assert.ok(r1.mappings.some((m) => m.realized && m.actual!.includes("switch")),
      `Step 1 should realize switch: ${r1.reasoning}`);

    // Step 2: state changed
    const r2 = state.stepResults[1].reasoning;
    assert.equal(r2.verdict, "realized");
    assert.ok(r2.mappings.some((m) => m.realized),
      `Step 2 should realize state change: ${r2.reasoning}`);

    // Step 3: accessibility additions (may have side effects like extra links)
    const r3 = state.stepResults[2].reasoning;
    assert.ok(
      r3.verdict === "realized" || r3.verdict === "unexpected-side-effects",
      `Step 3 verdict: ${r3.verdict}`
    );
    assert.ok(r3.mappings.length >= 2, `Step 3 should have 2+ mappings: ${r3.reasoning}`);
    assert.ok(r3.mappings.every((m) => m.realized), `All step 3 mappings realized: ${r3.reasoning}`);
  });
});

describe("Goal Runner: single-step goal", () => {
  it("should handle trivial 1-step goal", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const goal: Goal = {
      description: "Rename submit button",
      steps: [{
        description: "Change Send to Submit",
        snapshotFile: "snapshot-button-renamed.a11y.json",
        expectation: {
          testId: "page",
          expect: "Button label changed",
          expectedA11yChanges: [{ description: "Button name changed from Send to Submit", name: "Send" }],
        },
      }],
      successCriteria: "Button says Submit",
    };

    const state = await runGoal(goal, baseline, async (step, _r) => loadTree(step.snapshotFile!));
    assert.equal(state.status, "completed");
    assert.equal(state.finalScore!.stepSuccessRate, 1);
  });
});

describe("Goal Runner: goal with final invariant check", () => {
  it("should verify final state against invariants", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const goal: Goal = {
      description: "Add search and dark mode",
      steps: [
        {
          description: "Add search form",
          snapshotFile: "snapshot-search-added.a11y.json",
          expectation: {
            testId: "page",
            expect: "Search landmark added",
            expectedA11yChanges: [{ description: "Search landmark added" }],
          },
        },
      ],
      successCriteria: "Search exists in final state",
      finalInvariants: [
        {
          testId: "page",
          expect: "Search form should exist in final state",
          a11y: "changed",
          expectedA11yChanges: [{ description: "Search landmark present" }],
        },
      ],
    };

    const state = await runGoal(goal, baseline, async (step, _r) => loadTree(step.snapshotFile!));
    assert.equal(state.status, "completed");
  });
});

describe("Goal Runner: retry behavior", () => {
  it("should retry and succeed on second attempt", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const goal: Goal = {
      description: "Add search with retry",
      steps: [{
        description: "Add search form",
        snapshotFile: "snapshot-search-added.a11y.json",
        expectation: {
          testId: "page",
          expect: "Search landmark added",
          expectedA11yChanges: [{ description: "Search landmark added" }],
        },
      }],
      successCriteria: "Search exists",
    };

    // First call returns baseline (no change → fail), second returns search-added (pass)
    let callCount = 0;
    const state = await runGoal(goal, baseline, async (step, retryCount) => {
      callCount++;
      if (retryCount === 0) return baseline; // fail first
      return loadTree(step.snapshotFile!); // succeed on retry
    }, { maxRetries: 2 });

    assert.equal(state.status, "completed");
    assert.equal(state.stepResults[0].retries, 1);
    assert.ok(state.stepResults[0].passed);
    assert.ok(callCount >= 2, `Should call loadSnapshot at least twice: ${callCount}`);
    // Score should reflect the retry penalty
    assert.ok(state.finalScore!.averageStepScore < 100, `Score should be penalized: ${state.finalScore!.averageStepScore}`);
  });

  it("should fail after max retries exhausted", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const goal: Goal = {
      description: "Impossible task",
      steps: [{
        description: "This always fails",
        snapshotFile: "baseline.a11y.json", // same as baseline → no changes → not-realized
        expectation: {
          testId: "page",
          expect: "Something new added",
          expectedA11yChanges: [{ description: "New element added" }],
        },
      }],
      successCriteria: "Never",
    };

    const state = await runGoal(goal, baseline, async (_step, _retry) => baseline, { maxRetries: 2 });

    assert.equal(state.status, "failed");
    assert.equal(state.stepResults[0].retries, 3); // 0 + 3 retries
    assert.ok(!state.stepResults[0].passed);
  });
});

describe("Goal Runner: empty steps", () => {
  it("should complete immediately with no steps", async () => {
    const baseline = await loadTree("baseline.a11y.json");

    const goal: Goal = {
      description: "Empty goal",
      steps: [],
      successCriteria: "Nothing to do",
    };

    const state = await runGoal(goal, baseline, async () => baseline);
    assert.equal(state.status, "completed");
    assert.equal(state.stepResults.length, 0);
    assert.ok(state.finalScore);
  });
});
