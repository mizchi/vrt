#!/usr/bin/env node
/**
 * VLM Model Benchmark — VRT diff 画像で各モデルの reasoning 品質を比較
 *
 * Usage:
 *   OPENROUTER_API_KEY=... node --experimental-strip-types src/vlm-bench.ts
 *   OPENROUTER_API_KEY=... node --experimental-strip-types src/vlm-bench.ts --image heatmap.png
 *   OPENROUTER_API_KEY=... node --experimental-strip-types src/vlm-bench.ts --tiers free,cheap,mid
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { createVlmClient, benchmarkVlmModels, VLM_MODELS, type VlmBenchResult, type VlmModel } from "./vlm-client.ts";

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const IMAGE_PATH = getArg("image", "");
const TIERS = getArg("tiers", "free,cheap,mid").split(",") as VlmModel["tier"][];
const TMP = join(process.cwd(), "test-results", "vlm-bench");

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log(`\n  ${YELLOW}OPENROUTER_API_KEY not set.${RESET}\n`);
    process.exit(1);
  }

  await mkdir(TMP, { recursive: true });

  // Generate or load test image
  let imageBase64: string;
  if (IMAGE_PATH) {
    imageBase64 = (await readFile(IMAGE_PATH)).toString("base64");
  } else {
    // Generate a VRT diff heatmap from our Tailwind fixture
    console.log(`  ${DIM}Generating test heatmap...${RESET}`);
    const { compareScreenshots } = await import("./heatmap.ts");
    const browser = await chromium.launch();

    const before = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await before.setContent('<html><body style="font-family:sans-serif;padding:24px;background:#fff"><h1 style="color:#333">Hello World</h1><p style="color:#666">Some text here with <a href="#" style="color:blue">a link</a></p><div style="display:flex;gap:16px;margin-top:16px"><div style="padding:16px;background:#f0f0f0;border-radius:8px;flex:1">Card A</div><div style="padding:16px;background:#e0e0e0;border-radius:8px;flex:1">Card B</div></div></body></html>');
    const basePath = join(TMP, "baseline.png");
    await before.screenshot({ path: basePath });
    await before.close();

    const after = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await after.setContent('<html><body style="font-family:sans-serif;padding:24px;background:#fff"><h1 style="color:#111;font-size:28px">Hello World</h1><p style="color:#888">Some text here with <a href="#" style="color:red">a link</a></p><div style="display:flex;gap:8px;margin-top:24px"><div style="padding:12px;background:#e8f0fe;border-radius:12px;flex:1">Card A</div><div style="padding:12px;background:#fce8e6;border-radius:12px;flex:1">Card B</div></div></body></html>');
    const curPath = join(TMP, "current.png");
    await after.screenshot({ path: curPath });
    await after.close();
    await browser.close();

    const diff = await compareScreenshots({
      testId: "vlm-test", testTitle: "vlm-test", projectName: "vlm",
      screenshotPath: curPath, baselinePath: basePath, status: "changed",
    }, { outputDir: TMP });

    if (diff?.heatmapPath) {
      imageBase64 = (await readFile(diff.heatmapPath)).toString("base64");
      console.log(`  ${DIM}Heatmap: ${(diff.diffRatio * 100).toFixed(1)}% diff${RESET}`);
    } else {
      imageBase64 = (await readFile(curPath)).toString("base64");
    }
  }

  const prompt = `You are analyzing a VRT (Visual Regression Testing) diff heatmap. The red/pink areas show pixel differences between a baseline and current screenshot.

Identify:
1. What CSS properties changed (color, spacing, font-size, border-radius, etc.)
2. Which elements are affected
3. Severity: is this a regression or intentional change?

Be specific and concise. List each change on its own line.`;

  console.log();
  console.log(`${BOLD}${CYAN}VLM Model Benchmark${RESET}`);
  console.log(`  ${DIM}Tiers: ${TIERS.join(", ")}${RESET}`);
  console.log(`  ${DIM}Models: ${VLM_MODELS.filter((m) => TIERS.includes(m.tier)).length}${RESET}`);
  console.log();

  const results: VlmBenchResult[] = [];

  for (const tier of TIERS) {
    const models = VLM_MODELS.filter((m) => m.tier === tier);
    for (const model of models) {
      process.stdout.write(`  ${model.id.padEnd(50)} `);
      try {
        const client = createVlmClient(model.id);
        if (!client) { console.log(`${RED}no key${RESET}`); continue; }
        const resp = await client.analyzeImage(imageBase64, prompt, { maxTokens: 512 });
        const costStr = resp.costUsd === 0 ? "FREE" : `$${resp.costUsd.toExponential(2)}`;
        console.log(`${GREEN}${resp.latencyMs}ms${RESET} ${costStr.padStart(12)} ${DIM}${resp.content.length}ch ${resp.totalTokens}tok${RESET}`);

        results.push({
          model: model.id,
          tier: model.tier,
          costUsd: resp.costUsd,
          latencyMs: resp.latencyMs,
          responseLength: resp.content.length,
        });

        // Save response
        await writeFile(join(TMP, `${model.id.replace(/\//g, "_")}.txt`), resp.content);
      } catch (e: any) {
        console.log(`${RED}error: ${e.message?.slice(0, 60)}${RESET}`);
        results.push({ model: model.id, tier: model.tier, costUsd: -1, latencyMs: -1, responseLength: 0 });
      }
    }
  }

  // Summary
  console.log();
  console.log(`  ${BOLD}Results${RESET}`);
  console.log(`  ${"Model".padEnd(50)} ${"Latency".padStart(10)} ${"Cost".padStart(12)} ${"Response".padStart(10)}`);
  const successful = results.filter((r) => r.costUsd >= 0).sort((a, b) => a.latencyMs - b.latencyMs);
  for (const r of successful) {
    const cost = r.costUsd === 0 ? "FREE" : `$${r.costUsd.toExponential(2)}`;
    console.log(`  ${r.model.padEnd(50)} ${`${r.latencyMs}ms`.padStart(10)} ${cost.padStart(12)} ${`${r.responseLength}ch`.padStart(10)}`);
  }

  // Save report
  const reportPath = join(TMP, "vlm-bench-report.json");
  await writeFile(reportPath, JSON.stringify({ date: new Date().toISOString(), tiers: TIERS, results }, null, 2));
  console.log(`\n  ${DIM}Report: ${reportPath}${RESET}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
