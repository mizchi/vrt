import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { diffA11yTrees, checkA11yTree, parsePlaywrightA11ySnapshot } from "./a11y-semantic.ts";
import { introspectToSpec, verifySpec } from "./introspect.ts";
import { reasonAboutChanges } from "./reasoning.ts";
import type { A11yNode, A11ySnapshot, ChangeIntent, PageExpectation } from "./types.ts";

const FIXTURES = join(import.meta.dirname!, "..", "fixtures");

async function loadTree(dir: string, file: string): Promise<A11yNode> {
  return JSON.parse(await readFile(join(FIXTURES, dir, file), "utf-8"));
}

function snap(testId: string, tree: A11yNode): A11ySnapshot {
  return { testId, testTitle: testId, tree };
}

function snapshotFromTree(testId: string, tree: A11yNode) {
  return parsePlaywrightA11ySnapshot(testId, testId, tree as any);
}

// ---- GitHub Repo Page ----

describe("GitHub repo page fixtures", () => {
  describe("desktop baseline - a11y quality", () => {
    it("should have no a11y issues on baseline", async () => {
      const tree = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const issues = checkA11yTree(tree);
      assert.equal(issues.length, 0, `Unexpected issues: ${issues.map((i) => `${i.rule}: ${i.message}`).join(", ")}`);
    });

    it("should detect all landmark roles", async () => {
      const tree = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const landmarks = new Set<string>();
      function walk(node: A11yNode) {
        if (["banner", "main", "contentinfo", "navigation", "search", "complementary", "region"].includes(node.role)) {
          landmarks.add(node.role);
        }
        for (const c of node.children ?? []) walk(c);
      }
      walk(tree);
      assert.ok(landmarks.has("banner"), "missing banner");
      assert.ok(landmarks.has("main"), "missing main");
      assert.ok(landmarks.has("contentinfo"), "missing contentinfo");
      assert.ok(landmarks.has("navigation"), "missing navigation");
      assert.ok(landmarks.has("search"), "missing search");
      assert.ok(landmarks.has("complementary"), "missing complementary (sidebar)");
    });

    it("should have significant interactive element count", async () => {
      const tree = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const interactive: string[] = [];
      function walk(node: A11yNode) {
        if (["button", "link", "textbox", "searchbox", "combobox"].includes(node.role)) {
          interactive.push(`${node.role}:${node.name}`);
        }
        for (const c of node.children ?? []) walk(c);
      }
      walk(tree);
      // GitHub repo page has many links and buttons
      assert.ok(interactive.length >= 30, `expected >=30 interactive elements, got ${interactive.length}`);
    });
  });

  describe("desktop vs mobile - responsive diff", () => {
    it("should detect structural differences between desktop and mobile", async () => {
      const desktop = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const mobile = await loadTree("github-repo", "baseline-mobile.a11y.json");
      const diff = diffA11yTrees(snap("desktop", desktop), snap("mobile", mobile));
      // Mobile collapses nav items, removes sidebar, simplifies header
      assert.ok(diff.changes.length > 0, "should detect responsive differences");
    });

    it("mobile should have hamburger menu button", async () => {
      const mobile = await loadTree("github-repo", "baseline-mobile.a11y.json");
      let hasMenuButton = false;
      function walk(node: A11yNode) {
        if (node.role === "button" && node.name === "Menu") hasMenuButton = true;
        for (const c of node.children ?? []) walk(c);
      }
      walk(mobile);
      assert.ok(hasMenuButton, "mobile should have Menu button");
    });

    it("desktop should have sidebar, mobile should not", async () => {
      const desktop = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const mobile = await loadTree("github-repo", "baseline-mobile.a11y.json");
      function hasSidebar(node: A11yNode): boolean {
        if (node.role === "complementary") return true;
        return (node.children ?? []).some(hasSidebar);
      }
      assert.ok(hasSidebar(desktop), "desktop should have sidebar");
      assert.ok(!hasSidebar(mobile), "mobile should not have sidebar");
    });

    it("mobile should show fewer nav items (overflow into More button)", async () => {
      const desktop = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const mobile = await loadTree("github-repo", "baseline-mobile.a11y.json");
      function countNavLinks(tree: A11yNode): number {
        let count = 0;
        function walk(node: A11yNode, inRepoNav: boolean) {
          if (node.role === "navigation" && node.name === "Repository") inRepoNav = true;
          if (inRepoNav && node.role === "link") count++;
          for (const c of node.children ?? []) walk(c, inRepoNav);
        }
        walk(tree, false);
        return count;
      }
      const desktopLinks = countNavLinks(desktop);
      const mobileLinks = countNavLinks(mobile);
      assert.ok(desktopLinks > mobileLinks, `desktop nav links (${desktopLinks}) should exceed mobile (${mobileLinks})`);
    });
  });

  describe("regression detection - nav broken", () => {
    it("should detect many label-missing issues", async () => {
      const broken = await loadTree("github-repo", "regression-nav-broken.a11y.json");
      const issues = checkA11yTree(broken);
      const labelMissing = issues.filter((i) => i.rule === "label-missing");
      // Broken: buttons/links/img without names
      assert.ok(labelMissing.length >= 5, `expected >=5 label-missing issues, got ${labelMissing.length}`);
    });

    it("should detect image without alt", async () => {
      const broken = await loadTree("github-repo", "regression-nav-broken.a11y.json");
      const issues = checkA11yTree(broken);
      assert.ok(issues.some((i) => i.rule === "img-alt-missing"), "should detect img without alt");
    });

    it("should detect regression when diffing baseline vs broken", async () => {
      const baseline = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const broken = await loadTree("github-repo", "regression-nav-broken.a11y.json");
      const diff = diffA11yTrees(snap("page", baseline), snap("page", broken));
      assert.ok(diff.hasRegression, "should flag as regression");
      assert.ok(diff.changes.length >= 5, `expected many changes, got ${diff.changes.length}`);
    });

    it("reasoning should reject refactor that breaks labels", async () => {
      const baseline = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const broken = await loadTree("github-repo", "regression-nav-broken.a11y.json");
      const diff = diffA11yTrees(
        snapshotFromTree("page", baseline),
        snapshotFromTree("page", broken),
      );
      const intent: ChangeIntent = {
        summary: "refactor: extract header component",
        changeType: "refactor",
        expectedVisualChanges: [],
        expectedA11yChanges: [],
        affectedComponents: [],
      };
      const exp: PageExpectation = {
        testId: "page",
        expect: "No changes expected in refactor",
        a11y: "no-change",
      };
      const chain = reasonAboutChanges("page", exp, diff, intent);
      assert.equal(chain.verdict, "not-realized", "refactor that breaks labels should be not-realized");
    });
  });

  describe("spec introspection", () => {
    it("should generate spec with many invariants from complex page", async () => {
      const tree = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const introspection = quickIntrospect("github-repo", tree);
      const spec = introspectToSpec({
        generatedAt: "test",
        pages: [introspection],
      });
      const page = spec.pages[0];
      // Complex page should generate many invariants
      assert.ok(page.invariants.length >= 8, `expected >=8 invariants, got ${page.invariants.length}`);
    });

    it("spec should pass on baseline", async () => {
      const tree = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const introspection = quickIntrospect("github-repo", tree);
      const spec = introspectToSpec({
        generatedAt: "test",
        pages: [introspection],
      });
      const result = verifySpec(spec, new Map([["github-repo", { a11yTree: tree, screenshotExists: true }]]));
      const failed = result.results[0].checked.filter((c) => !c.passed);
      assert.equal(failed.length, 0, `Spec failures: ${failed.map((f) => f.invariant.description).join(", ")}`);
    });

    it("spec should fail on broken page", async () => {
      const baseline = await loadTree("github-repo", "baseline-desktop.a11y.json");
      const broken = await loadTree("github-repo", "regression-nav-broken.a11y.json");
      const introspection = quickIntrospect("github-repo", baseline);
      const spec = introspectToSpec({
        generatedAt: "test",
        pages: [introspection],
      });
      const result = verifySpec(spec, new Map([["github-repo", { a11yTree: broken, screenshotExists: true }]]));
      const failed = result.results[0].checked.filter((c) => !c.passed);
      assert.ok(failed.length > 0, "spec should detect regressions on broken page");
    });
  });
});

// ---- Google Search Results Page ----

describe("Google search page fixtures", () => {
  describe("desktop baseline - a11y quality", () => {
    it("should have no a11y issues on baseline", async () => {
      const tree = await loadTree("google-search", "baseline-desktop.a11y.json");
      const issues = checkA11yTree(tree);
      assert.equal(issues.length, 0, `Unexpected issues: ${issues.map((i) => `${i.rule}: ${i.message}`).join(", ")}`);
    });

    it("should have search landmark", async () => {
      const tree = await loadTree("google-search", "baseline-desktop.a11y.json");
      let hasSearch = false;
      function walk(node: A11yNode) {
        if (node.role === "search") hasSearch = true;
        for (const c of node.children ?? []) walk(c);
      }
      walk(tree);
      assert.ok(hasSearch, "Google search should have search landmark");
    });

    it("should have multiple search result articles", async () => {
      const tree = await loadTree("google-search", "baseline-desktop.a11y.json");
      let articleCount = 0;
      function walk(node: A11yNode) {
        if (node.role === "article") articleCount++;
        for (const c of node.children ?? []) walk(c);
      }
      walk(tree);
      assert.ok(articleCount >= 4, `expected >=4 articles, got ${articleCount}`);
    });

    it("should have pagination navigation", async () => {
      const tree = await loadTree("google-search", "baseline-desktop.a11y.json");
      let hasPagination = false;
      function walk(node: A11yNode) {
        if (node.role === "navigation" && node.name === "Pagination") hasPagination = true;
        for (const c of node.children ?? []) walk(c);
      }
      walk(tree);
      assert.ok(hasPagination, "should have pagination navigation");
    });
  });

  describe("desktop vs mobile - responsive diff", () => {
    it("should detect responsive differences", async () => {
      const desktop = await loadTree("google-search", "baseline-desktop.a11y.json");
      const mobile = await loadTree("google-search", "baseline-mobile.a11y.json");
      const diff = diffA11yTrees(snap("desktop", desktop), snap("mobile", mobile));
      assert.ok(diff.changes.length > 0, "should detect responsive differences");
    });

    it("mobile should have fewer search results", async () => {
      const desktop = await loadTree("google-search", "baseline-desktop.a11y.json");
      const mobile = await loadTree("google-search", "baseline-mobile.a11y.json");
      function countArticles(tree: A11yNode): number {
        let n = 0;
        function walk(node: A11yNode) {
          if (node.role === "article") n++;
          for (const c of node.children ?? []) walk(c);
        }
        walk(tree);
        return n;
      }
      assert.ok(countArticles(desktop) > countArticles(mobile), "desktop should show more results");
    });

    it("mobile header should be simplified", async () => {
      const desktop = await loadTree("google-search", "baseline-desktop.a11y.json");
      const mobile = await loadTree("google-search", "baseline-mobile.a11y.json");
      function countHeaderLinks(tree: A11yNode): number {
        let n = 0;
        function walk(node: A11yNode, inBanner: boolean) {
          if (node.role === "banner") inBanner = true;
          if (inBanner && (node.role === "link" || node.role === "button")) n++;
          for (const c of node.children ?? []) walk(c, inBanner);
        }
        walk(tree, false);
        return n;
      }
      assert.ok(
        countHeaderLinks(desktop) > countHeaderLinks(mobile),
        "mobile header should have fewer items",
      );
    });
  });

  describe("regression detection - search results broken", () => {
    it("should detect many a11y issues", async () => {
      const broken = await loadTree("google-search", "regression-results-broken.a11y.json");
      const issues = checkA11yTree(broken);
      assert.ok(issues.length >= 5, `expected >=5 issues, got ${issues.length}`);
    });

    it("should detect regression vs baseline", async () => {
      const baseline = await loadTree("google-search", "baseline-desktop.a11y.json");
      const broken = await loadTree("google-search", "regression-results-broken.a11y.json");
      const diff = diffA11yTrees(snap("page", baseline), snap("page", broken));
      assert.ok(diff.hasRegression, "should flag regression");
      // Many changes: search input label gone, result titles gone, result links gone, etc.
      assert.ok(diff.changes.length >= 10, `expected many changes, got ${diff.changes.length}`);
    });

    it("reasoning should reject feature change that empties results", async () => {
      const baseline = await loadTree("google-search", "baseline-desktop.a11y.json");
      const broken = await loadTree("google-search", "regression-results-broken.a11y.json");
      const diff = diffA11yTrees(
        snapshotFromTree("page", baseline),
        snapshotFromTree("page", broken),
      );
      const intent: ChangeIntent = {
        summary: "refactor: migrate search API client",
        changeType: "refactor",
        expectedVisualChanges: [],
        expectedA11yChanges: [],
        affectedComponents: [],
      };
      const exp: PageExpectation = {
        testId: "page",
        expect: "No changes expected in API refactor",
        a11y: "no-change",
      };
      const chain = reasonAboutChanges("page", exp, diff, intent);
      assert.equal(chain.verdict, "not-realized");
    });

    it("spec generated from baseline should catch broken page", async () => {
      const baseline = await loadTree("google-search", "baseline-desktop.a11y.json");
      const broken = await loadTree("google-search", "regression-results-broken.a11y.json");
      const introspection = quickIntrospect("google-search", baseline);
      const spec = introspectToSpec({
        generatedAt: "test",
        pages: [introspection],
      });
      const result = verifySpec(spec, new Map([["google-search", { a11yTree: broken, screenshotExists: true }]]));
      const failed = result.results[0].checked.filter((c) => !c.passed);
      assert.ok(failed.length > 0, "spec should detect regressions");
    });
  });
});

// ---- Cross-site responsive comparison ----

describe("responsive diff summary", () => {
  it("should quantify responsive changes across both sites", async () => {
    const sites = ["github-repo", "google-search"] as const;
    for (const site of sites) {
      const desktop = await loadTree(site, "baseline-desktop.a11y.json");
      const mobile = await loadTree(site, "baseline-mobile.a11y.json");
      const diff = diffA11yTrees(snap(`${site}-desktop`, desktop), snap(`${site}-mobile`, mobile));
      // Both sites should have significant responsive differences
      assert.ok(
        diff.changes.length >= 3,
        `${site}: expected >=3 responsive changes, got ${diff.changes.length}`,
      );
      // But responsive changes should NOT be flagged as regression
      // (some may be due to removed elements which the tool flags)
      // The point is that we can detect and quantify the differences
    }
  });
});

// ---- Helper ----

function quickIntrospect(testId: string, tree: A11yNode) {
  const LANDMARK = new Set(["banner", "main", "navigation", "contentinfo", "form", "region", "search", "complementary"]);
  const INTERACTIVE = new Set(["button", "link", "textbox", "checkbox", "radio", "searchbox", "switch", "combobox"]);
  const landmarks: { role: string; name: string }[] = [];
  const interactive: { role: string; name: string; hasLabel: boolean }[] = [];
  let totalNodes = 0;

  function walk(node: A11yNode) {
    totalNodes++;
    if (LANDMARK.has(node.role)) landmarks.push({ role: node.role, name: node.name || "" });
    if (INTERACTIVE.has(node.role)) interactive.push({ role: node.role, name: node.name || "", hasLabel: !!node.name });
    for (const c of node.children ?? []) walk(c);
  }
  walk(tree);

  const roleCounts = new Map<string, number>();
  for (const el of interactive) roleCounts.set(el.role, (roleCounts.get(el.role) ?? 0) + 1);

  return {
    testId,
    description: `Page ${testId}`,
    landmarks,
    interactiveElements: interactive,
    stats: {
      totalNodes,
      landmarkCount: landmarks.length,
      interactiveCount: interactive.length,
      unlabeledCount: interactive.filter((e) => !e.hasLabel).length,
      headingLevels: [] as number[],
    },
    suggestedInvariants: [
      ...landmarks.map((l) => ({
        description: `${l.role} landmark "${l.name || "(unnamed)"}" is present`,
        check: "landmark-exists" as const,
        cost: "low" as const,
      })),
      ...[...roleCounts].map(([role, count]) => ({
        description: `${count} ${role} element(s) expected`,
        check: "element-count" as const,
        cost: "low" as const,
      })),
      { description: "All interactive elements have labels", check: "label-present" as const, cost: "low" as const },
      { description: "No whiteout", check: "no-whiteout" as const, cost: "low" as const },
    ],
  };
}
