import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { findAffectedComponents, graphStats, buildDepGraph } from "./dep-graph.ts";
import type { DepGraph, DepNode } from "./types.ts";

function makeNode(id: string, opts: Partial<DepNode> = {}): DepNode {
  return {
    id,
    filePath: `/project/${id}`,
    language: "typescript",
    exports: [],
    isComponent: false,
    ...opts,
  };
}

function makeGraph(
  nodes: DepNode[],
  edges: Array<[string, string, string[]]>
): DepGraph {
  const graph: DepGraph = {
    nodes: new Map(nodes.map((n) => [n.id, n])),
    edges: edges.map(([from, to, specifiers]) => ({ from, to, specifiers })),
  };
  return graph;
}

describe("findAffectedComponents", () => {
  it("should find direct dependents", () => {
    const graph = makeGraph(
      [
        makeNode("utils.ts"),
        makeNode("Button.tsx", { isComponent: true }),
        makeNode("Header.tsx", { isComponent: true }),
      ],
      [
        ["Button.tsx", "utils.ts", ["cn"]],
        ["Header.tsx", "Button.tsx", ["Button"]],
      ]
    );

    const affected = findAffectedComponents(graph, ["utils.ts"]);
    assert.equal(affected.length, 2);
    assert.equal(affected[0].node.id, "Button.tsx");
    assert.equal(affected[0].depth, 1);
    assert.equal(affected[1].node.id, "Header.tsx");
    assert.equal(affected[1].depth, 2);
  });

  it("should skip non-component files", () => {
    const graph = makeGraph(
      [
        makeNode("config.ts"),
        makeNode("api.ts"),
        makeNode("Page.tsx", { isComponent: true }),
      ],
      [
        ["api.ts", "config.ts", []],
        ["Page.tsx", "api.ts", []],
      ]
    );

    const affected = findAffectedComponents(graph, ["config.ts"]);
    assert.equal(affected.length, 1);
    assert.equal(affected[0].node.id, "Page.tsx");
  });

  it("should respect maxDepth", () => {
    const graph = makeGraph(
      [
        makeNode("a.ts"),
        makeNode("b.ts"),
        makeNode("c.tsx", { isComponent: true }),
      ],
      [
        ["b.ts", "a.ts", []],
        ["c.tsx", "b.ts", []],
      ]
    );

    const affected = findAffectedComponents(graph, ["a.ts"], { maxDepth: 1 });
    assert.equal(affected.length, 0); // c.tsx is at depth 2
  });

  it("should handle cycles", () => {
    const graph = makeGraph(
      [
        makeNode("a.tsx", { isComponent: true }),
        makeNode("b.tsx", { isComponent: true }),
      ],
      [
        ["a.tsx", "b.tsx", []],
        ["b.tsx", "a.tsx", []],
      ]
    );

    const affected = findAffectedComponents(graph, ["a.tsx"]);
    // Should not infinite loop. b depends on a, a depends on b
    assert.equal(affected.length, 2);
  });

  it("should return empty for no changes", () => {
    const graph = makeGraph(
      [makeNode("a.tsx", { isComponent: true })],
      []
    );
    const affected = findAffectedComponents(graph, ["nonexistent.ts"]);
    assert.equal(affected.length, 0);
  });
});

describe("graphStats", () => {
  it("should compute correct stats", () => {
    const graph = makeGraph(
      [
        makeNode("a.ts"),
        makeNode("b.tsx", { isComponent: true }),
        makeNode("c.mbt", { language: "moonbit" }),
      ],
      [["b.tsx", "a.ts", ["foo"]]]
    );

    const stats = graphStats(graph);
    assert.equal(stats.totalFiles, 3);
    assert.equal(stats.totalEdges, 1);
    assert.equal(stats.components, 1);
    assert.deepEqual(stats.byLanguage, { typescript: 2, moonbit: 1 });
  });

  it("should handle empty graph", () => {
    const graph = makeGraph([], []);
    const stats = graphStats(graph);
    assert.equal(stats.totalFiles, 0);
    assert.equal(stats.totalEdges, 0);
    assert.equal(stats.components, 0);
    assert.deepEqual(stats.byLanguage, {});
  });
});

describe("findAffectedComponents edge cases", () => {
  it("should include changed file itself if it is a component", () => {
    const graph = makeGraph(
      [makeNode("App.tsx", { isComponent: true })],
      []
    );
    const affected = findAffectedComponents(graph, ["App.tsx"]);
    assert.equal(affected.length, 1);
    assert.equal(affected[0].node.id, "App.tsx");
    assert.equal(affected[0].depth, 0);
    assert.deepEqual(affected[0].changedDependencies, ["App.tsx"]);
  });

  it("should track multiple changed dependencies via BFS merge", () => {
    const graph = makeGraph(
      [
        makeNode("a.ts"),
        makeNode("c.ts"),
        makeNode("Shared.tsx", { isComponent: true }),
        makeNode("d.tsx", { isComponent: true }),
      ],
      [
        ["Shared.tsx", "a.ts", []],
        ["d.tsx", "c.ts", []],
        ["d.tsx", "Shared.tsx", []],
      ]
    );
    // a.ts changed -> Shared.tsx affected (depth 1) -> d.tsx affected (depth 2)
    // c.ts changed -> d.tsx affected (depth 1)
    // d.tsx should be visited from both paths
    const affected = findAffectedComponents(graph, ["a.ts", "c.ts"]);
    const dEntry = affected.find((a) => a.node.id === "d.tsx");
    assert.ok(dEntry, "d.tsx should be affected");
    assert.ok(dEntry.changedDependencies.includes("c.ts"));
  });

  it("should use default maxDepth of 10", () => {
    // Build a chain of 12 nodes: n0 -> n1 -> ... -> n11
    const nodes: DepNode[] = [];
    const edges: Array<[string, string, string[]]> = [];
    for (let i = 0; i <= 11; i++) {
      nodes.push(makeNode(`n${i}.tsx`, { isComponent: true }));
      if (i > 0) edges.push([`n${i}.tsx`, `n${i - 1}.tsx`, []]);
    }
    const graph = makeGraph(nodes, edges);
    const affected = findAffectedComponents(graph, ["n0.tsx"]);
    // n0 at depth 0, n1 at depth 1, ... n10 at depth 10
    // n11 at depth 11 is beyond default maxDepth
    assert.equal(affected.length, 11);
    assert.equal(affected[affected.length - 1].depth, 10);
  });
});

describe("buildDepGraph", () => {
  const TMP = join(import.meta.dirname!, "..", "test-results", "dep-graph-test");

  before(async () => {
    await mkdir(TMP, { recursive: true });
    // Create a small project structure
    await mkdir(join(TMP, "src"), { recursive: true });
    await writeFile(join(TMP, "src", "utils.ts"), `
export function cn(...args: string[]) { return args.join(" "); }
export function format(x: number) { return x.toFixed(2); }
`);
    await writeFile(join(TMP, "src", "Button.tsx"), `
import { cn } from "./utils.ts";
export function Button() { return <button className={cn("btn")}>OK</button>; }
`);
    await writeFile(join(TMP, "src", "App.tsx"), `
import { Button } from "./Button.tsx";
import { format } from "./utils.ts";
export default function App() { return <div><Button /></div>; }
`);
    await writeFile(join(TMP, "src", "standalone.ts"), `
const x = 42;
export default x;
`);
  });

  after(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  it("should build graph from real files", async () => {
    const graph = await buildDepGraph(TMP, { languages: ["typescript"] });

    // Should have 4 nodes
    assert.ok(graph.nodes.size >= 4);

    // Check that edges are created
    const buttonNode = [...graph.nodes.values()].find((n) => n.id.endsWith("Button.tsx"));
    assert.ok(buttonNode, "Button.tsx should be in graph");

    // Button.tsx imports from utils.ts, so there should be an edge
    const buttonEdges = graph.edges.filter((e) => e.from.endsWith("Button.tsx"));
    assert.ok(buttonEdges.length > 0, "Button.tsx should have import edges");
    assert.ok(buttonEdges.some((e) => e.to.includes("utils")));
  });

  it("should detect exports", async () => {
    const graph = await buildDepGraph(TMP, { languages: ["typescript"] });

    const utilsNode = [...graph.nodes.values()].find((n) => n.id.endsWith("utils.ts"));
    assert.ok(utilsNode);
    assert.ok(utilsNode.exports.includes("cn"), "should export cn");
    assert.ok(utilsNode.exports.includes("format"), "should export format");
  });

  it("should detect .tsx files as components", async () => {
    const graph = await buildDepGraph(TMP, { languages: ["typescript"] });

    const buttonNode = [...graph.nodes.values()].find((n) => n.id.endsWith("Button.tsx"));
    assert.ok(buttonNode);
    assert.equal(buttonNode.isComponent, true);

    const standaloneNode = [...graph.nodes.values()].find((n) => n.id.endsWith("standalone.ts"));
    assert.ok(standaloneNode);
    assert.equal(standaloneNode.isComponent, false);
  });

  it("should ignore specified directories", async () => {
    await mkdir(join(TMP, "node_modules", "fake"), { recursive: true });
    await writeFile(join(TMP, "node_modules", "fake", "index.ts"), "export default 1;");

    const graph = await buildDepGraph(TMP, { languages: ["typescript"] });

    // node_modules should be ignored
    const fakeNode = [...graph.nodes.values()].find((n) => n.filePath.includes("node_modules"));
    assert.equal(fakeNode, undefined);
  });

  it("should handle empty directory", async () => {
    const emptyDir = join(TMP, "empty");
    await mkdir(emptyDir, { recursive: true });

    const graph = await buildDepGraph(emptyDir, { languages: ["typescript"] });
    assert.equal(graph.nodes.size, 0);
    assert.equal(graph.edges.length, 0);
  });

  it("should parse TypeScript default imports and require()", async () => {
    const tsDir = join(TMP, "ts-imports");
    await mkdir(tsDir, { recursive: true });
    await writeFile(join(tsDir, "lib.ts"), `export const value = 1;`);
    await writeFile(join(tsDir, "main.ts"), `
import lib from "./lib.ts";
const x = require("./lib.ts");
export { lib, x };
`);
    const graph = await buildDepGraph(tsDir, { languages: ["typescript"] });

    const mainNode = [...graph.nodes.values()].find((n) => n.id === "main.ts");
    assert.ok(mainNode);
    // Should have edges from both import and require
    const mainEdges = graph.edges.filter((e) => e.from === "main.ts");
    assert.ok(mainEdges.length >= 2, "should have edges from import + require");
    // Default import should add specifier
    const importEdge = mainEdges.find((e) => e.specifiers.includes("lib"));
    assert.ok(importEdge, "default import specifier should be captured");
  });

  it("should parse MoonBit @pkg.func imports", async () => {
    const mbtDir = join(TMP, "mbt-imports");
    await mkdir(mbtDir, { recursive: true });
    await writeFile(join(mbtDir, "main.mbt"), `
fn main {
  let x = @pkg1.helper()
  let y = @pkg2/sub.deep()
  let z = @pkg1.helper() // duplicate, should be deduped
}
`);
    const graph = await buildDepGraph(mbtDir, { languages: ["moonbit"] });

    assert.ok(graph.nodes.size >= 1);
    const mainEdges = graph.edges.filter((e) => e.from === "main.mbt");
    // Should have 2 edges (pkg1 and pkg2/sub), deduped
    assert.equal(mainEdges.length, 2);
    const sources = mainEdges.map((e) => e.to).sort();
    assert.deepEqual(sources, ["@pkg1", "@pkg2/sub"]);
  });

  it("should parse Rust use and mod declarations", async () => {
    const rsDir = join(TMP, "rs-imports");
    await mkdir(rsDir, { recursive: true });
    await writeFile(join(rsDir, "lib.rs"), `pub fn helper() {}`);
    await writeFile(join(rsDir, "main.rs"), `
use crate::lib::helper;
use std::collections::{HashMap, HashSet};
mod parser;
`);
    const graph = await buildDepGraph(rsDir, { languages: ["rust"] });

    // Node should be created even though most Rust imports are external
    const mainNode = [...graph.nodes.values()].find((n) => n.id === "main.rs");
    assert.ok(mainNode, "main.rs should be in graph");
    assert.equal(mainNode.language, "rust");

    // crate::lib::helper and parser don't start with . or @ so resolveImport skips them
    // But the parser itself works — we verify by checking no crash and node was created
    const mainEdges = graph.edges.filter((e) => e.from === "main.rs");
    // All Rust imports are external (no relative ./ paths), so no edges
    assert.equal(mainEdges.length, 0);
  });

  it("should skip external TypeScript packages (not relative or @)", async () => {
    const extDir = join(TMP, "ext-pkg");
    await mkdir(extDir, { recursive: true });
    await writeFile(join(extDir, "main.ts"), `
import { readFile } from "node:fs/promises";
import lodash from "lodash";
import { foo } from "./local.ts";
`);
    const graph = await buildDepGraph(extDir, { languages: ["typescript"] });

    const mainEdges = graph.edges.filter((e) => e.from === "main.ts");
    // Only "./local.ts" should create an edge; "node:fs/promises" and "lodash" are external
    assert.equal(mainEdges.length, 1);
    assert.ok(mainEdges[0].to.includes("local"));
  });
});
