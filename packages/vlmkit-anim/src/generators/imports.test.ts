/**
 * `vlmkit-anim facts <dir>`: the import graph of a source tree as a fact sheet — the entries at `--depth` are
 * the modules, relative imports that cross between them are the dependencies, tests are skipped unless asked.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, it } from "vitest";
import { EXPECT_FORMAT } from "../expect.ts";
import { importFacts, importSpecifiers, moduleOf } from "./imports.ts";

const root = mkdtempSync(join(tmpdir(), "anim-facts-"));
const write = (rel: string, text: string) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text);
};
// A small tree: two directories and two files at the top, a test, a d.ts, a node_modules to skip.
write("cli.ts", `import { run } from "./compile/index.ts";\nimport { check } from "./check.js";\nimport chalk from "chalk";\nexport { run, check };\n`);
write("check.ts", `import type { Timeline } from "./types.ts";\nimport { layout } from "./layout/index.ts";\nexport const check = (t: Timeline) => layout(t);\n`);
write("types.ts", `export interface Timeline { nodes: unknown[] }\n`);
write("compile/index.ts", `export * from "./builder.ts";\nimport "../types.ts";\n`);
write("compile/builder.ts", `import { Timeline } from "../types.ts";\nexport const run = (): Timeline => ({ nodes: [] });\n`);
write("layout/index.ts", `export const layout = (t: unknown) => t;\n`);
write("check.test.ts", `import { check } from "./check.ts";\nimport { run } from "./compile/index.ts";\nimport { layout } from "./layout/index.ts";\n`);
write("runtime.d.ts", `export declare const x: number;\n`);
write("node_modules/chalk/index.js", `import "../../types.ts";\n`);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("facts: a directory's import graph", () => {
  it("reads every specifier shape", () => {
    assert.deepEqual(importSpecifiers(`import a from "./a";\nimport { b } from './b.ts';\nexport * from "./c.js";\nconst d = await import("./d.mjs");\nconst e = require('./e');\nimport "./side-effect.ts";\nimport type { T } from "./types.ts";`), ["./a", "./b.ts", "./c.js", "./d.mjs", "./e", "./side-effect.ts", "./types.ts"]);
  });

  it("names a module by the entry at the depth: a directory as itself, a file without its extension", () => {
    assert.equal(moduleOf(root, join(root, "compile", "builder.ts"), 1), "compile");
    assert.equal(moduleOf(root, join(root, "compile", "builder.ts"), 2), "compile/builder");
    assert.equal(moduleOf(root, join(root, "check.ts"), 1), "check");
    assert.equal(moduleOf(root, join(root, "..", "elsewhere.ts"), 1), undefined);
  });

  it("depth 1: directories and files at the top are the modules; cross-module imports are the deps; tests, .d.ts and node_modules are skipped", () => {
    const r = importFacts(root);
    assert.deepEqual(r.expectation, { format: EXPECT_FORMAT, modules: ["check", "cli", "compile", "layout", "types"], deps: ["check->layout", "check->types", "cli->check", "cli->compile", "compile->types"] });
    assert.equal(r.files, 6);
    // `./check.js` resolved to check.ts; `chalk` (bare) and the import inside compile/ (same module) are not deps.
    assert.deepEqual(r.members.compile, ["compile/builder.ts", "compile/index.ts"]);
  });

  it("--tests brings the test file in as a module of its own, importing three others", () => {
    const r = importFacts(root, { tests: true });
    assert.ok(r.expectation.modules!.includes("check.test"));
    assert.ok(r.expectation.deps!.includes("check.test->layout"));
  });

  it("depth 2 splits the directories into their files", () => {
    const r = importFacts(root, { depth: 2 });
    assert.ok(r.expectation.modules!.includes("compile/builder"));
    assert.ok(r.expectation.deps!.includes("compile/index->compile/builder"));
    assert.ok(r.expectation.deps!.includes("compile/builder->types"));
  });

  it("on this repository's CLI directory it finds the entry point and what it imports", () => {
    const r = importFacts(resolve(import.meta.dirname!, "../../../../src/cli"));
    assert.ok(r.expectation.modules!.includes("cli"));
    assert.ok(r.expectation.deps!.includes("cli->commands"), r.expectation.deps!.join(" "));
  });
});
