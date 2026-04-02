import { diffPaintTrees, type PaintNode, type PaintTreeChange } from "./crater-client.ts";

export interface PaintTreeCaptureRuntime {
  setViewport(width: number, height: number): Promise<void>;
  setContent(html: string): Promise<void>;
  capturePaintTree(): Promise<PaintNode>;
}

export interface MigrationPaintTreeSummary {
  counts: Record<PaintTreeChange["type"], number>;
  totalChanges: number;
  summary: string;
}

export async function capturePaintTreeForViewport(
  runtime: PaintTreeCaptureRuntime,
  viewport: { width: number; height: number },
  html: string,
): Promise<PaintNode> {
  await runtime.setViewport(viewport.width, viewport.height);
  await runtime.setContent(html);
  return runtime.capturePaintTree();
}

export async function captureMigrationPaintTreeDiff(
  runtime: PaintTreeCaptureRuntime,
  viewport: { width: number; height: number },
  baselineHtml: string,
  currentHtml: string,
): Promise<PaintTreeChange[]> {
  const baselinePaintTree = await capturePaintTreeForViewport(runtime, viewport, baselineHtml);
  const currentPaintTree = await capturePaintTreeForViewport(runtime, viewport, currentHtml);
  return diffPaintTrees(baselinePaintTree, currentPaintTree);
}

export function summarizeMigrationPaintTreeChanges(
  changes: PaintTreeChange[],
): MigrationPaintTreeSummary {
  const counts = createPaintTreeChangeCounts();
  for (const change of changes) {
    counts[change.type]++;
  }
  const entries = (Object.entries(counts) as Array<[PaintTreeChange["type"], number]>)
    .filter((entry) => entry[1] > 0)
    .map(([type, count]) => `${count} ${type}`);
  return {
    counts,
    totalChanges: changes.length,
    summary: entries.join(", ") || "no changes",
  };
}

function createPaintTreeChangeCounts(): Record<PaintTreeChange["type"], number> {
  return {
    geometry: 0,
    paint: 0,
    text: 0,
    added: 0,
    removed: 0,
  };
}
