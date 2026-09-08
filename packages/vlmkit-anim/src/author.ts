/**
 * The typed authoring surface: write a scene in TypeScript instead of JSON.
 *
 * JSON stays the IR — this file adds nothing the format does not have. What it
 * adds is the editor: `scene.sort({ … })` completes the fields of a sort scene,
 * rejects a misspelt algorithm at type-check time rather than at `check`, and
 * fills in `format` and `kind` so neither is ever typed by hand. A module whose
 * default export is a scene is accepted by every `vlmkit-anim` verb
 * (`vlmkit-anim check scene.ts`), and `sceneJson` writes the file a colleague
 * without a TypeScript toolchain can still read and edit.
 *
 *   import { scene } from "@mizchi/vlmkit-anim";
 *   export default scene.sort({ algorithm: "insertion", values: [5, 3, 8, 1] });
 */

import {
  SCENE_FORMAT,
  type ArrayScene,
  type ChartScene,
  type FlowchartScene,
  type GanttScene,
  type ComposeScene,
  type DiagramScene,
  type DistributedScene,
  type GraphScene,
  type HeapScene,
  type ListScene,
  type MatrixScene,
  type ModulesScene,
  type QueueScene,
  type Scene,
  type SortScene,
  type StackScene,
  type StateMachineScene,
  type TreeScene,
  type VectorScene,
} from "./types.ts";

/** Everything a scene of kind S carries except the two fields the constructor fills in. */
export type SceneBody<S extends Scene> = Omit<S, "format" | "kind">;

function constructor<S extends Scene>(kind: S["kind"]): (body: SceneBody<S>) => S {
  return (body) => ({ format: SCENE_FORMAT, kind, ...body }) as S;
}

/**
 * One constructor per kind. Each returns the plain object the JSON file would
 * hold — `JSON.stringify` it and `vlmkit-anim check` reads it unchanged.
 */
export const scene = {
  diagram: constructor<DiagramScene>("diagram"),
  modules: constructor<ModulesScene>("modules"),
  stateMachine: constructor<StateMachineScene>("state-machine"),
  sort: constructor<SortScene>("sort"),
  array: constructor<ArrayScene>("array"),
  stack: constructor<StackScene>("stack"),
  queue: constructor<QueueScene>("queue"),
  list: constructor<ListScene>("list"),
  heap: constructor<HeapScene>("heap"),
  tree: constructor<TreeScene>("tree"),
  distributed: constructor<DistributedScene>("distributed"),
  matrix: constructor<MatrixScene>("matrix"),
  graph: constructor<GraphScene>("graph"),
  chart: constructor<ChartScene>("chart"),
  flowchart: constructor<FlowchartScene>("flowchart"),
  gantt: constructor<GanttScene>("gantt"),
  vector: constructor<VectorScene>("vector"),
  compose: constructor<ComposeScene>("compose"),
} as const;

/**
 * Type-check a complete scene literal (with `format` and `kind` written out)
 * and hand it back unchanged — for a file that mirrors the JSON one to one.
 */
export function defineScene<S extends Scene>(s: S): S {
  return s;
}

/** The JSON file for a scene: two-space indent, trailing newline, keys in authoring order. */
export function sceneJson(s: Scene): string {
  return JSON.stringify(s, null, 2) + "\n";
}

/**
 * What a scene module has to export: `export default scene.sort({ … })`, or a
 * named `scene` export. The CLI's loader reads this after `import()`.
 */
export function sceneFromModule(mod: unknown): { scene: unknown } | { error: string } {
  const m = mod as { default?: unknown; scene?: unknown } | null;
  if (m && typeof m === "object" && m.default !== undefined) return { scene: m.default };
  if (m && typeof m === "object" && m.scene !== undefined) return { scene: m.scene };
  return { error: 'the module exports no scene: add `export default scene.<kind>({ … })` (or `export const scene = …`)' };
}
