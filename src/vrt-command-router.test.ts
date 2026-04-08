import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRootUsage, resolveRootCommand } from "./vrt-command-router.ts";

describe("resolveRootCommand", () => {
  it("routes workflow commands under an explicit namespace", () => {
    const route = resolveRootCommand(["workflow", "verify"]);
    assert.equal(route.kind, "workflow");
    assert.deepEqual(route.argv, ["verify"]);
  });

  it("supports short aliases for workflow commands that do not collide", () => {
    const route = resolveRootCommand(["verify"]);
    assert.equal(route.kind, "workflow");
    assert.deepEqual(route.argv, ["verify"]);
  });

  it("keeps detection report and workflow report distinct", () => {
    const detection = resolveRootCommand(["report"]);
    const workflow = resolveRootCommand(["workflow", "report"]);

    assert.equal(detection.kind, "module");
    assert.equal(detection.modulePath, "./detection-report.ts");
    assert.equal(workflow.kind, "workflow");
    assert.deepEqual(workflow.argv, ["report"]);
  });

  it("routes api commands under the api namespace", () => {
    const route = resolveRootCommand(["api", "serve", "--port", "4567"]);
    assert.equal(route.kind, "module");
    assert.equal(route.modulePath, "./api-server.ts");
    assert.deepEqual(route.argv, ["--port", "4567"]);
  });

  it("keeps serve and status aliases for backward compatibility", () => {
    const serve = resolveRootCommand(["serve", "--port", "4567"]);
    const status = resolveRootCommand(["status", "--url", "http://localhost:4567"]);

    assert.equal(serve.kind, "module");
    assert.equal(serve.modulePath, "./api-server.ts");
    assert.deepEqual(serve.argv, ["--port", "4567"]);

    assert.equal(status.kind, "status");
    assert.deepEqual(status.argv, ["--url", "http://localhost:4567"]);
  });

  it("returns usage when workflow namespace is missing a subcommand", () => {
    const route = resolveRootCommand(["workflow"]);
    assert.equal(route.kind, "usage");
    assert.equal(route.exitCode, 1);
    assert.match(route.message, /workflow <command>/);
  });
});

describe("formatRootUsage", () => {
  it("documents grouped command categories", () => {
    const usage = formatRootUsage();
    assert.match(usage, /Workflow Commands:/);
    assert.match(usage, /API Commands:/);
    assert.match(usage, /workflow verify/);
    assert.match(usage, /api serve/);
  });
});
