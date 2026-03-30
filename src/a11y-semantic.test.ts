import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffA11yTrees, checkA11yTree } from "./a11y-semantic.ts";
import type { A11ySnapshot, A11yNode } from "./types.ts";

function snap(tree: A11yNode): A11ySnapshot {
  return { testId: "test-1", testTitle: "Test", tree };
}

describe("diffA11yTrees", () => {
  it("should detect no changes for identical trees", () => {
    const tree: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "heading", name: "Title", level: 1 }],
    };
    const result = diffA11yTrees(snap(tree), snap(tree));
    assert.equal(result.changes.length, 0);
    assert.equal(result.hasRegression, false);
  });

  it("should detect added nodes", () => {
    const before: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "heading", name: "Title", level: 1 }],
    };
    const after: A11yNode = {
      role: "main",
      name: "",
      children: [
        { role: "heading", name: "Title", level: 1 },
        { role: "button", name: "Submit" },
      ],
    };
    const result = diffA11yTrees(snap(before), snap(after));
    assert.ok(result.stats.added > 0);
  });

  it("should detect removed interactive element as regression", () => {
    const before: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "button", name: "Delete" }],
    };
    const after: A11yNode = {
      role: "main",
      name: "",
      children: [],
    };
    const result = diffA11yTrees(snap(before), snap(after));
    assert.equal(result.hasRegression, true);
    assert.ok(result.stats.removed > 0);
  });

  it("should detect role changes", () => {
    const before: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "button", name: "Click" }],
    };
    const after: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "link", name: "Click" }],
    };
    const result = diffA11yTrees(snap(before), snap(after));
    const roleChanges = result.changes.filter((c) => c.type === "role-changed");
    assert.ok(roleChanges.length > 0);
  });

  it("should detect name changes", () => {
    const before: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "heading", name: "Old Title", level: 1 }],
    };
    const after: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "heading", name: "New Title", level: 1 }],
    };
    const result = diffA11yTrees(snap(before), snap(after));
    const nameChanges = result.changes.filter((c) => c.type === "name-changed");
    assert.ok(nameChanges.length > 0);
    assert.ok(nameChanges[0].description.includes("Old Title"));
    assert.ok(nameChanges[0].description.includes("New Title"));
  });

  it("should detect landmark removal as error", () => {
    const before: A11yNode = {
      role: "main",
      name: "",
      children: [
        { role: "navigation", name: "Main nav", children: [] },
      ],
    };
    const after: A11yNode = {
      role: "main",
      name: "",
      children: [],
    };
    const result = diffA11yTrees(snap(before), snap(after));
    assert.ok(result.landmarkChanges.length > 0);
    assert.equal(result.hasRegression, true);
  });

  it("should detect state changes", () => {
    const before: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "checkbox", name: "Agree", checked: false }],
    };
    const after: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "checkbox", name: "Agree", checked: true }],
    };
    const result = diffA11yTrees(snap(before), snap(after));
    const stateChanges = result.changes.filter((c) => c.type === "state-changed");
    assert.ok(stateChanges.length > 0);
  });
});

describe("checkA11yTree", () => {
  it("should flag button without name", () => {
    const tree: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "button", name: "" }],
    };
    const issues = checkA11yTree(tree);
    assert.ok(issues.some((i) => i.rule === "label-missing"));
  });

  it("should flag image without alt", () => {
    const tree: A11yNode = {
      role: "main",
      name: "",
      children: [{ role: "img", name: "" }],
    };
    const issues = checkA11yTree(tree);
    assert.ok(issues.some((i) => i.rule === "img-alt-missing"));
  });

  it("should pass for well-labeled tree", () => {
    const tree: A11yNode = {
      role: "main",
      name: "Main content",
      children: [
        { role: "heading", name: "Title", level: 1 },
        { role: "button", name: "Submit" },
        { role: "img", name: "Logo" },
      ],
    };
    const issues = checkA11yTree(tree);
    assert.equal(issues.length, 0);
  });
});
