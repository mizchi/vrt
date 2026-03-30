import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findAffectedComponents, graphStats } from "./dep-graph.ts";
import type { DepGraph, DepNode, DepEdge } from "./types.ts";

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
});
