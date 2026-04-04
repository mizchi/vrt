#!/usr/bin/env node
/**
 * vrt-harness ベンチマーク
 *
 * LLM を通さない決定的な API のパフォーマンスを計測する。
 * 結果をベースラインとして記録し、改善の追跡に使う。
 *
 * Usage: npx tsx src/benchmark.ts
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";

const TMP = join(import.meta.dirname!, "..", "test-results", "benchmark");

// ---- Helpers ----

function createTestImage(width: number, height: number, seed: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(rand() * 256);
    data[i + 1] = Math.floor(rand() * 256);
    data[i + 2] = Math.floor(rand() * 256);
    data[i + 3] = 255;
  }
  return data;
}

function createSimilarImage(base: Uint8Array, diffRatio: number, seed: number): Uint8Array {
  const data = new Uint8Array(base);
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
  const pixelCount = data.length / 4;
  const diffPixels = Math.floor(pixelCount * diffRatio);
  for (let i = 0; i < diffPixels; i++) {
    const idx = Math.floor(rand() * pixelCount) * 4;
    data[idx] = (data[idx] + 50) % 256;
    data[idx + 1] = (data[idx + 1] + 50) % 256;
    data[idx + 2] = (data[idx + 2] + 50) % 256;
  }
  return data;
}

async function savePng(path: string, data: Uint8Array, width: number, height: number) {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  await writeFile(path, PNG.sync.write(png));
}

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

async function bench(name: string, fn: () => Promise<void> | void, iterations: number): Promise<BenchResult> {
  // Warmup
  for (let i = 0; i < Math.min(3, iterations); i++) await fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  const totalMs = performance.now() - start;

  return {
    name,
    iterations,
    totalMs: Math.round(totalMs * 100) / 100,
    avgMs: Math.round((totalMs / iterations) * 100) / 100,
    opsPerSec: Math.round(iterations / (totalMs / 1000)),
  };
}

// ---- Terminal ----

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

// ---- Main ----

async function main() {
  await mkdir(TMP, { recursive: true });

  console.log();
  console.log(`${BOLD}${CYAN}vrt-harness benchmark${RESET}`);
  console.log();

  const results: BenchResult[] = [];

  // ---- pixelmatch ----
  {
    const pixelmatch = (await import("pixelmatch")).default;
    const sizes = [
      { w: 320, h: 240, label: "320x240" },
      { w: 1280, h: 900, label: "1280x900" },
      { w: 1920, h: 1080, label: "1920x1080" },
    ];
    for (const { w, h, label } of sizes) {
      const img1 = createTestImage(w, h, 1);
      const img2 = createSimilarImage(img1, 0.05, 2);
      const output = new Uint8Array(w * h * 4);
      const r = await bench(`pixelmatch ${label}`, () => {
        pixelmatch(img1, img2, output, w, h, { threshold: 0.1 });
      }, label === "1920x1080" ? 20 : 50);
      results.push(r);
    }
  }

  // ---- PNG encode/decode ----
  {
    const img1280 = createTestImage(1280, 900, 1);
    const pngPath = join(TMP, "bench.png");
    await savePng(pngPath, img1280, 1280, 900);

    const r1 = await bench("PNG encode 1280x900", async () => {
      const png = new PNG({ width: 1280, height: 900 });
      png.data = Buffer.from(img1280);
      PNG.sync.write(png);
    }, 30);
    results.push(r1);

    const pngBuf = await readFile(pngPath);
    const r2 = await bench("PNG decode 1280x900", () => {
      PNG.sync.read(pngBuf);
    }, 30);
    results.push(r2);
  }

  // ---- CSS parser ----
  {
    const { parseCssDeclarations, extractCss } = await import("./css-challenge-core.ts");
    const html = await readFile(join(import.meta.dirname!, "..", "fixtures", "css-challenge", "dashboard.html"), "utf-8");
    const css = extractCss(html)!;

    const r = await bench("parseCssDeclarations (276 decls)", () => {
      parseCssDeclarations(css);
    }, 500);
    results.push(r);
  }

  // ---- Computed style diff ----
  {
    const { diffComputedStyles } = await import("./css-challenge-core.ts");
    const baseline = new Map<string, Record<string, string>>();
    const current = new Map<string, Record<string, string>>();
    for (let i = 0; i < 100; i++) {
      const key = `.element-${i}`;
      baseline.set(key, { display: "flex", width: "100px", color: "rgb(0,0,0)", padding: "8px", margin: "0px" });
      current.set(key, {
        display: "flex",
        width: i < 5 ? "200px" : "100px",
        color: i < 3 ? "rgb(255,0,0)" : "rgb(0,0,0)",
        padding: "8px",
        margin: "0px",
      });
    }

    const r = await bench("diffComputedStyles (100 elements)", () => {
      diffComputedStyles(baseline, current);
    }, 1000);
    results.push(r);
  }

  // ---- Paint tree diff ----
  {
    const { diffPaintTrees } = await import("./crater-client.ts");

    function makeTree(depth: number, width: number): any {
      const children: any[] = [];
      if (depth > 0) {
        for (let i = 0; i < width; i++) {
          children.push({ ...makeTree(depth - 1, width), y: i * 20 });
        }
      }
      return { tag: "div", x: 0, y: 0, w: 100, h: 20, p: { op: 1, c: [0, 0, 0, 1], bg: [255, 255, 255, 1], fs: 16 }, ch: children };
    }

    const tree1 = makeTree(3, 5); // 5^3 = 125 nodes
    const tree2 = JSON.parse(JSON.stringify(tree1));
    // Mutate a few nodes
    tree2.ch[0].ch[0].p.bg = [255, 0, 0, 1];
    tree2.ch[1].y = 100;

    const r = await bench("diffPaintTrees (125 nodes)", () => {
      diffPaintTrees(tree1, tree2);
    }, 500);
    results.push(r);
  }

  // ---- Viewport discovery ----
  {
    const { extractBreakpoints, generateViewports } = await import("./viewport-discovery.ts");
    const css = `
      @media (min-width: 480px) { .a {} }
      @media (min-width: 640px) { .b {} }
      @media (min-width: 768px) { .c {} }
      @media (min-width: 1024px) { .d {} }
      @media (min-width: 1280px) { .e {} }
    `;

    const r1 = await bench("extractBreakpoints (5 breakpoints)", () => {
      extractBreakpoints(css);
    }, 1000);
    results.push(r1);

    const bps = extractBreakpoints(css);
    const r2 = await bench("generateViewports (5 bp, 2 samples)", () => {
      generateViewports(bps, { randomSamples: 2, maxViewports: 20 });
    }, 1000);
    results.push(r2);
  }

  // ---- A11y tree diff ----
  {
    const { diffA11yTrees, checkA11yTree } = await import("./a11y-semantic.ts");
    const tree = JSON.parse(await readFile(join(import.meta.dirname!, "..", "fixtures", "github-repo", "baseline-desktop.a11y.json"), "utf-8"));
    const snap = (t: any) => ({ testId: "test", testTitle: "test", tree: t });

    const r1 = await bench("diffA11yTrees (github page)", () => {
      diffA11yTrees(snap(tree), snap(tree));
    }, 200);
    results.push(r1);

    const r2 = await bench("checkA11yTree (github page)", () => {
      checkA11yTree(tree);
    }, 500);
    results.push(r2);
  }

  // ---- Property classify ----
  {
    const { categorizeProperty } = await import("./css-challenge-core.ts");
    const { classifySelectorType } = await import("./detection-classify.ts");

    const r = await bench("categorizeProperty x100", () => {
      for (const p of ["display", "padding", "width", "color", "font-size", "animation", "transform",
        "margin", "background", "border-radius", "flex", "gap", "opacity", "cursor", "line-height"]) {
        categorizeProperty(p);
      }
    }, 500);
    results.push(r);
  }

  // ---- groupBySelector + removeSelectorBlock ----
  {
    const { parseCssDeclarations, groupBySelector, removeSelectorBlock, extractCss } = await import("./css-challenge-core.ts");
    const html = await readFile(join(import.meta.dirname!, "..", "fixtures", "css-challenge", "dashboard.html"), "utf-8");
    const css = extractCss(html)!;
    const decls = parseCssDeclarations(css);

    const r1 = await bench("groupBySelector (276 decls → blocks)", () => {
      groupBySelector(decls);
    }, 500);
    results.push(r1);

    const blocks = groupBySelector(decls);
    const r2 = await bench("removeSelectorBlock", () => {
      removeSelectorBlock(css, blocks[0]);
    }, 500);
    results.push(r2);
  }

  // ---- Viewport discovery from real HTML ----
  {
    const { discoverViewports } = await import("./viewport-discovery.ts");
    const html = await readFile(join(import.meta.dirname!, "..", "fixtures", "css-challenge", "grid-complex.html"), "utf-8");

    const r = await bench("discoverViewports (grid-complex)", () => {
      discoverViewports(html, { maxViewports: 10, randomSamples: 1 });
    }, 200);
    results.push(r);
  }

  // ---- JSONL read/write ----
  {
    const { appendRecords, readAllRecords } = await import("./detection-db.ts");
    const { tmpdir } = await import("node:os");
    const dbPath = join(tmpdir(), `bench-jsonl-${Date.now()}.jsonl`);

    // Write 100 records
    const records: DetectionRecord[] = [];
    for (let i = 0; i < 100; i++) {
      records.push({
        runId: "bench", fixture: "test", backend: "chromium",
        selector: `.el-${i}`, property: "color", value: "red",
        category: "visual", selectorType: "class", isInteractive: false,
        mediaCondition: null, viewports: [], detected: true, undetectedReason: null,
      } as any);
    }

    const rw = await bench("JSONL write 100 records", async () => {
      await appendRecords(records, dbPath);
    }, 20);
    results.push(rw);

    // Append to get 2000 records
    for (let i = 0; i < 19; i++) await appendRecords(records, dbPath);

    const rr = await bench("JSONL read 2000 records", async () => {
      await readAllRecords(dbPath);
    }, 20);
    results.push(rr);

    const { rm } = await import("node:fs/promises");
    await rm(dbPath, { force: true });
  }

  // ---- Image crop (heatmap size mismatch) ----
  {
    const { compareScreenshots } = await import("./heatmap.ts");
    const img1 = createTestImage(1280, 900, 1);
    const img2 = createTestImage(1280, 920, 2); // different height
    const p1 = join(TMP, "crop-base.png");
    const p2 = join(TMP, "crop-curr.png");
    await savePng(p1, img1, 1280, 900);
    await savePng(p2, img2, 1280, 920);

    const r = await bench("compareScreenshots (mismatch+heatmap)", async () => {
      await compareScreenshots({
        testId: "crop", testTitle: "crop", projectName: "bench",
        screenshotPath: p2, baselinePath: p1, status: "changed",
      }, { outputDir: TMP });
    }, 10);
    results.push(r);

    const r2 = await bench("compareScreenshots (mismatch, no heatmap)", async () => {
      await compareScreenshots({
        testId: "crop2", testTitle: "crop2", projectName: "bench",
        screenshotPath: p2, baselinePath: p1, status: "changed",
      }, { outputDir: TMP, skipHeatmap: true });
    }, 10);
    results.push(r2);
  }

  // ---- Full migration-compare pipeline (no browser) ----
  {
    const { extractBreakpoints } = await import("./viewport-discovery.ts");
    const { parseCssDeclarations, extractCss, diffComputedStyles } = await import("./css-challenge-core.ts");
    const html1 = await readFile(join(import.meta.dirname!, "..", "fixtures", "css-challenge", "page.html"), "utf-8");
    const html2 = await readFile(join(import.meta.dirname!, "..", "fixtures", "css-challenge", "dashboard.html"), "utf-8");

    const r = await bench("CSS analysis pipeline (parse+bp+diff)", () => {
      const css1 = extractCss(html1)!;
      const css2 = extractCss(html2)!;
      parseCssDeclarations(css1);
      parseCssDeclarations(css2);
      extractBreakpoints(css1);
      extractBreakpoints(css2);
    }, 200);
    results.push(r);
  }

  // ---- Module import time ----
  {
    // Cold import is already done, measure hot re-import cost
    const r = await bench("import('./viewport-discovery.ts')", async () => {
      await import("./viewport-discovery.ts");
    }, 100);
    results.push(r);
  }

  // ---- Report ----
  console.log(`  ${"Name".padEnd(40)} ${"avg".padStart(10)} ${"ops/s".padStart(10)} ${"total".padStart(10)} ${DIM}n${RESET}`);
  console.log(`  ${"─".repeat(40)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(10)} ${DIM}─${RESET}`);
  for (const r of results) {
    const avgStr = r.avgMs < 1 ? `${(r.avgMs * 1000).toFixed(0)}µs` : `${r.avgMs.toFixed(1)}ms`;
    console.log(`  ${r.name.padEnd(40)} ${avgStr.padStart(10)} ${String(r.opsPerSec).padStart(10)} ${`${r.totalMs.toFixed(0)}ms`.padStart(10)} ${DIM}${r.iterations}${RESET}`);
  }
  console.log();

  // Save baseline
  const baselinePath = join(TMP, "benchmark-baseline.json");
  await writeFile(baselinePath, JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  console.log(`  ${DIM}Baseline: ${baselinePath}${RESET}`);
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
