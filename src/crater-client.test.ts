import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CraterClient } from "./crater-client.ts";

describe("CraterClient.captureComputedStyles", () => {
  it("parses JSON-serialized snapshots returned by script.evaluate", async () => {
    const client = new CraterClient("ws://unused");
    const evaluateCalls: string[] = [];

    (client as unknown as { evaluate: (expression: string) => Promise<unknown> }).evaluate = async (expression) => {
      evaluateCalls.push(expression);
      return JSON.stringify({
        ".card": { color: "rgb(255, 0, 0)" },
        "#hero::before": { content: '"badge"' },
      });
    };

    const snapshot = await client.captureComputedStyles(["color", "content"]);

    assert.equal(snapshot.get(".card")?.color, "rgb(255, 0, 0)");
    assert.equal(snapshot.get("#hero::before")?.content, '"badge"');
    assert.match(evaluateCalls[0] ?? "", /JSON\.stringify/);
  });

  it("drops crater snapshots when every property is empty", async () => {
    const client = new CraterClient("ws://unused");

    (client as unknown as { evaluate: () => Promise<unknown> }).evaluate = async () => JSON.stringify({
      ".card": { color: "", display: "" },
    });

    const snapshot = await client.captureComputedStyles(["color", "display"]);

    assert.equal(snapshot.size, 0);
  });
});
