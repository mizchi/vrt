/**
 * 最小限の LLM クライアント
 *
 * Anthropic API を直接呼ぶ。ANTHROPIC_API_KEY が必要。
 * なければ null を返す (呼び出し元で fallback)。
 */
import type { LLMProvider } from "./intent.ts";

export function createLLMProvider(): LLMProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  return {
    async complete(prompt: string): Promise<string> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
      }

      const data = await res.json() as { content: Array<{ type: string; text: string }> };
      return data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    },
  };
}
