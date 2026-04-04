/**
 * VLM (Vision Language Model) クライアント
 *
 * OpenRouter API 経由で画像認識 + reasoning を行う。
 * モデルごとのコスト追跡と、コスパ評価機能付き。
 *
 * Usage:
 *   const vlm = createVlmClient();
 *   const result = await vlm.analyzeImage(pngBuffer, "What CSS differences do you see?");
 */
import { readFile } from "node:fs/promises";

// ---- Types ----

export interface VlmModel {
  id: string;
  promptCostPer1k: number;  // $/1K tokens
  completionCostPer1k: number;
  contextLength: number;
  tier: "free" | "cheap" | "mid" | "premium";
}

export interface VlmResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface VlmClient {
  model: VlmModel;
  analyzeImage(imageBase64: string, prompt: string, options?: { maxTokens?: number }): Promise<VlmResponse>;
  analyzeImageFile(imagePath: string, prompt: string, options?: { maxTokens?: number }): Promise<VlmResponse>;
  analyzeDiff(baselineBase64: string, currentBase64: string, prompt: string, options?: { maxTokens?: number }): Promise<VlmResponse>;
}

export interface VlmBenchResult {
  model: string;
  tier: string;
  costUsd: number;
  latencyMs: number;
  responseLength: number;
  /** 0-10 quality score (manual or auto-eval) */
  qualityScore?: number;
  costEfficiency?: number;  // qualityScore / costUsd
}

// ---- Model registry ----

export const VLM_MODELS: VlmModel[] = [
  // Free tier
  { id: "google/gemma-3-27b-it:free", promptCostPer1k: 0, completionCostPer1k: 0, contextLength: 131072, tier: "free" },
  { id: "google/gemma-3-12b-it:free", promptCostPer1k: 0, completionCostPer1k: 0, contextLength: 32768, tier: "free" },
  { id: "google/gemma-3n-e4b-it:free", promptCostPer1k: 0, completionCostPer1k: 0, contextLength: 8192, tier: "free" },

  // Cheap tier ($0-$0.0001/1K)
  { id: "meta-llama/llama-3.2-11b-vision-instruct", promptCostPer1k: 4.9e-8, completionCostPer1k: 4.9e-8, contextLength: 131072, tier: "cheap" },
  { id: "qwen/qwen3-vl-8b-instruct", promptCostPer1k: 8e-8, completionCostPer1k: 5e-7, contextLength: 131072, tier: "cheap" },
  { id: "amazon/nova-lite-v1", promptCostPer1k: 6e-8, completionCostPer1k: 2.4e-7, contextLength: 300000, tier: "cheap" },
  { id: "bytedance/ui-tars-1.5-7b", promptCostPer1k: 1e-7, completionCostPer1k: 2e-7, contextLength: 128000, tier: "cheap" },

  // Mid tier ($0.0001-$0.001/1K)
  { id: "qwen/qwen3-vl-32b-instruct", promptCostPer1k: 1e-7, completionCostPer1k: 4.2e-7, contextLength: 131072, tier: "mid" },
  { id: "google/gemini-2.0-flash-001", promptCostPer1k: 1e-7, completionCostPer1k: 4e-7, contextLength: 1048576, tier: "mid" },
  { id: "anthropic/claude-3.5-haiku", promptCostPer1k: 8e-7, completionCostPer1k: 4e-6, contextLength: 200000, tier: "mid" },

  // Premium tier (>$0.001/1K)
  { id: "anthropic/claude-sonnet-4", promptCostPer1k: 3e-6, completionCostPer1k: 1.5e-5, contextLength: 200000, tier: "premium" },
  { id: "openai/gpt-4o", promptCostPer1k: 2.5e-6, completionCostPer1k: 1e-5, contextLength: 128000, tier: "premium" },
];

export function getModelByTier(tier: VlmModel["tier"]): VlmModel {
  const model = VLM_MODELS.find((m) => m.tier === tier);
  if (!model) throw new Error(`No model found for tier: ${tier}`);
  return model;
}

export function getModelById(id: string): VlmModel | undefined {
  return VLM_MODELS.find((m) => m.id === id);
}

// ---- Client ----

export function createVlmClient(
  modelOrTier: string = "free",
  apiKey?: string,
): VlmClient | null {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const model = getModelById(modelOrTier) ?? getModelByTier(modelOrTier as VlmModel["tier"]);

  async function callOpenRouter(
    messages: Array<{ role: string; content: any }>,
    maxTokens: number,
  ): Promise<VlmResponse> {
    const start = Date.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": "https://github.com/mizchi/vrt-harness",
        "X-Title": "vrt-harness",
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: maxTokens,
        messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter API error: ${res.status} ${text}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const latencyMs = Date.now() - start;
    const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const costUsd = (usage.prompt_tokens / 1000) * model.promptCostPer1k +
                    (usage.completion_tokens / 1000) * model.completionCostPer1k;

    return {
      content: data.choices[0]?.message?.content ?? "",
      model: model.id,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      costUsd,
      latencyMs,
    };
  }

  return {
    model,

    async analyzeImage(imageBase64: string, prompt: string, options?: { maxTokens?: number }): Promise<VlmResponse> {
      return callOpenRouter([{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
          { type: "text", text: prompt },
        ],
      }], options?.maxTokens ?? 1024);
    },

    async analyzeImageFile(imagePath: string, prompt: string, options?: { maxTokens?: number }): Promise<VlmResponse> {
      const buf = await readFile(imagePath);
      return this.analyzeImage(buf.toString("base64"), prompt, options);
    },

    async analyzeDiff(baselineBase64: string, currentBase64: string, prompt: string, options?: { maxTokens?: number }): Promise<VlmResponse> {
      return callOpenRouter([{
        role: "user",
        content: [
          { type: "text", text: "Baseline screenshot:" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${baselineBase64}` } },
          { type: "text", text: "Current screenshot:" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${currentBase64}` } },
          { type: "text", text: prompt },
        ],
      }], options?.maxTokens ?? 1024);
    },
  };
}

// ---- Model benchmark ----

export async function benchmarkVlmModels(
  imageBase64: string,
  prompt: string,
  tiers: VlmModel["tier"][] = ["free", "cheap", "mid"],
  apiKey?: string,
): Promise<VlmBenchResult[]> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) return [];

  const results: VlmBenchResult[] = [];

  for (const tier of tiers) {
    const models = VLM_MODELS.filter((m) => m.tier === tier);
    for (const model of models) {
      try {
        const client = createVlmClient(model.id, key);
        if (!client) continue;
        const resp = await client.analyzeImage(imageBase64, prompt, { maxTokens: 512 });
        results.push({
          model: model.id,
          tier: model.tier,
          costUsd: resp.costUsd,
          latencyMs: resp.latencyMs,
          responseLength: resp.content.length,
        });
      } catch (e) {
        results.push({
          model: model.id,
          tier: model.tier,
          costUsd: -1,
          latencyMs: -1,
          responseLength: 0,
        });
      }
    }
  }

  return results;
}
