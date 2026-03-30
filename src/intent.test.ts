import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDiff, buildIntent } from "./intent.ts";

describe("parseDiff", () => {
  it("should parse a simple diff", () => {
    const diff = `diff --git a/src/Button.tsx b/src/Button.tsx
index abc123..def456 100644
--- a/src/Button.tsx
+++ b/src/Button.tsx
@@ -10,7 +10,7 @@ export function Button() {
   return (
-    <button className="bg-blue-500">
+    <button className="bg-green-500">
       Click me
     </button>
   );
`;

    const files = parseDiff(diff);
    assert.equal(files.length, 1);
    assert.equal(files[0].path, "src/Button.tsx");
    assert.equal(files[0].additions, 1);
    assert.equal(files[0].deletions, 1);
    assert.equal(files[0].hunks.length, 1);
  });

  it("should handle multiple files", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,4 @@
+import { foo } from "./b"
 const x = 1;
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,3 +1,3 @@
-export const foo = 1;
+export const foo = 2;
`;

    const files = parseDiff(diff);
    assert.equal(files.length, 2);
    assert.equal(files[0].path, "a.ts");
    assert.equal(files[1].path, "b.ts");
  });

  it("should return empty for empty diff", () => {
    assert.deepEqual(parseDiff(""), []);
  });
});

describe("buildIntent", () => {
  it("should infer style changeType", () => {
    const intent = buildIntent(
      [
        {
          path: "src/Button.tsx",
          additions: 1,
          deletions: 1,
          hunks: [
            {
              header: "@@ -10,7 +10,7 @@",
              content: '-    className="bg-blue"\n+    className="bg-green"\n',
              startLine: 10,
              endLine: 11,
            },
          ],
        },
      ],
      "style: change button color to green"
    );

    assert.equal(intent.changeType, "style");
    assert.equal(intent.affectedComponents.length, 1);
    assert.ok(intent.expectedVisualChanges.length > 0);
  });

  it("should infer refactor with no visual changes", () => {
    const intent = buildIntent(
      [
        {
          path: "src/utils.ts",
          additions: 5,
          deletions: 3,
          hunks: [
            {
              header: "@@ -1,3 +1,5 @@",
              content: "refactored code",
              startLine: 1,
              endLine: 5,
            },
          ],
        },
      ],
      "refactor: extract helper function"
    );

    assert.equal(intent.changeType, "refactor");
    assert.equal(intent.affectedComponents.length, 0);
  });

  it("should detect feature changeType", () => {
    const intent = buildIntent([], "feat: add dark mode toggle");
    assert.equal(intent.changeType, "feature");
  });

  it("should detect bugfix changeType", () => {
    const intent = buildIntent([], "fix: resolve layout overflow on mobile");
    assert.equal(intent.changeType, "bugfix");
  });
});
