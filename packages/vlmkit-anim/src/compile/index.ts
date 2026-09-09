/**
 * Scene → Timeline. Validates first: compiling an invalid scene would throw
 * from deep inside a kind's compiler with a message about `undefined`, which
 * is exactly the kind of error the validator exists to replace.
 */

import type { Diagnostic, Scene, Timeline } from "../types.ts";
import { hasErrors, validateScene } from "../validate.ts";
import { AnchorError } from "./annotate.ts";
import { compileArray } from "./array.ts";
import { compileChart } from "./chart.ts";
import { compileCompose } from "./compose.ts";
import { compileQueue, compileStack } from "./collection.ts";
import { compileDiagram } from "./diagram.ts";
import { compileDistributed } from "./distributed.ts";
import { compileFlowchart } from "./flowchart.ts";
import { compileGantt } from "./gantt.ts";
import { compileSequence } from "./sequence.ts";
import { compileGraph } from "./graph.ts";
import { compileHeap } from "./heap.ts";
import { compileList } from "./list.ts";
import { compileMatrix } from "./matrix.ts";
import { compileModules } from "./modules.ts";
import { compileSort } from "./sort.ts";
import { compileStateMachine } from "./state-machine.ts";
import { compileTree } from "./tree.ts";
import { compileVector } from "./vector.ts";

export class SceneValidationError extends Error {
  override readonly name = "SceneValidationError";
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(`scene has ${diagnostics.filter((d) => d.severity === "error").length} validation error(s)`);
    this.diagnostics = diagnostics;
  }
}

export function compileScene(scene: Scene): Timeline {
  const diags = validateScene(scene);
  if (hasErrors(diags)) throw new SceneValidationError(diags);
  try {
    return dispatch(scene);
  } catch (e) {
    // An annotation named an anchor the kind never registered: a scene error, phrased for the writer.
    if (e instanceof AnchorError) throw new SceneValidationError([...diags, e.diagnostic]);
    throw e;
  }
}

function dispatch(scene: Scene): Timeline {
  switch (scene.kind) {
    case "compose": return compileCompose(scene);
    case "diagram": return compileDiagram(scene);
    case "modules": return compileModules(scene);
    case "state-machine": return compileStateMachine(scene);
    case "sort": return compileSort(scene);
    case "array": return compileArray(scene);
    case "stack": return compileStack(scene);
    case "queue": return compileQueue(scene);
    case "list": return compileList(scene);
    case "heap": return compileHeap(scene);
    case "tree": return compileTree(scene);
    case "distributed": return compileDistributed(scene);
    case "matrix": return compileMatrix(scene);
    case "graph": return compileGraph(scene);
    case "chart": return compileChart(scene);
    case "flowchart": return compileFlowchart(scene);
    case "gantt": return compileGantt(scene);
    case "sequence": return compileSequence(scene);
    case "vector": return compileVector(scene);
  }
}

export { compileCompose } from "./compose.ts";
export { compileArray, compileChart, compileList, compileQueue, compileStack, compileDiagram, compileDistributed, compileGraph, compileHeap, compileMatrix, compileModules, compileSort, compileStateMachine, compileTree, compileVector };
export { moduleCycles, moduleLayers, normalizeModules } from "./modules.ts";
export { generateSortOps } from "./sort.ts";
export { generateArrayOps } from "./array.ts";
export { generateGraphOps } from "./graph.ts";
export { niceMax } from "./chart.ts";
