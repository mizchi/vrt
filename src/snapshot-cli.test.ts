import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSnapshotCliArgs,
  parseSnapshotConfig,
  determineSnapshotExitCode,
  resolveSnapshotLabels,
  urlToSnapshotLabel,
} from "./snapshot-cli.ts";

describe("urlToSnapshotLabel", () => {
  it("includes canonicalized query params in the default label", () => {
    assert.equal(
      urlToSnapshotLabel("http://localhost:3000/?severity=critical&view=list"),
      "localhost_3000_root__query_severity_critical__view_list",
    );
  });

  it("normalizes query param order so equivalent URLs map to the same label", () => {
    const a = urlToSnapshotLabel("http://localhost:3000/issues?view=list&severity=critical");
    const b = urlToSnapshotLabel("http://localhost:3000/issues?severity=critical&view=list");

    assert.equal(a, b);
  });

  it("includes hash fragments so hash-routed pages do not collide", () => {
    assert.equal(
      urlToSnapshotLabel("http://localhost:3000/#/settings/profile"),
      "localhost_3000_root__hash_settings_profile",
    );
  });
});

describe("resolveSnapshotLabels", () => {
  it("uses an explicit label for a single URL", () => {
    assert.deepEqual(
      resolveSnapshotLabels(["http://localhost:3000/"], ["home"]),
      ["home"],
    );
  });

  it("supports one explicit label per URL", () => {
    assert.deepEqual(
      resolveSnapshotLabels(
        ["http://localhost:3000/", "http://localhost:3000/issues?severity=critical"],
        ["home", "critical-issues"],
      ),
      ["home", "critical-issues"],
    );
  });

  it("rejects mismatched label counts", () => {
    assert.throws(
      () => resolveSnapshotLabels(
        ["http://localhost:3000/", "http://localhost:3000/issues"],
        ["home"],
      ),
      /--label must be provided either once for a single URL or once per URL/i,
    );
  });
});

describe("determineSnapshotExitCode", () => {
  it("does not fail by default", () => {
    const result = determineSnapshotExitCode(
      [{ label: "home", viewport: "desktop", isNew: false, diffRatio: 0.12 }],
      {},
    );

    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.reasons, []);
  });

  it("fails when diff is detected under --fail-on-diff", () => {
    const result = determineSnapshotExitCode(
      [{ label: "home", viewport: "desktop", isNew: false, diffRatio: 0.12 }],
      { failOnDiff: true },
    );

    assert.equal(result.exitCode, 1);
    assert.match(result.reasons[0] ?? "", /diff detected/i);
  });

  it("fails when a new baseline is created under --fail-on-new-baseline", () => {
    const result = determineSnapshotExitCode(
      [{ label: "home", viewport: "desktop", isNew: true }],
      { failOnNewBaseline: true },
    );

    assert.equal(result.exitCode, 1);
    assert.match(result.reasons[0] ?? "", /new baseline/i);
  });

  it("fails when diff ratio exceeds the configured threshold", () => {
    const result = determineSnapshotExitCode(
      [
        { label: "home", viewport: "desktop", isNew: false, diffRatio: 0.009 },
        { label: "home", viewport: "mobile", isNew: false, diffRatio: 0.025 },
      ],
      { maxDiffRatio: 0.01 },
    );

    assert.equal(result.exitCode, 1);
    assert.match(result.reasons[0] ?? "", /max diff ratio/i);
  });

  it("accepts ratios up to the configured threshold", () => {
    const result = determineSnapshotExitCode(
      [{ label: "home", viewport: "desktop", isNew: false, diffRatio: 0.01 }],
      { maxDiffRatio: 0.01 },
    );

    assert.equal(result.exitCode, 0);
  });
});

describe("parseSnapshotConfig", () => {
  it("parses baseUrl, routes, outputDir, and threshold from JSON", () => {
    const config = parseSnapshotConfig(`{
      "baseUrl": "http://localhost:3000",
      "routes": [
        "/",
        { "path": "/issues?severity=critical", "label": "critical-issues" }
      ],
      "outputDir": "artifacts/snapshots",
      "threshold": 0.2,
      "mask": [".hero", ".badge"],
      "failOnDiff": true,
      "maxDiffRatio": 0.01
    }`);

    assert.equal(config.baseUrl, "http://localhost:3000");
    assert.equal(config.outputDir, "artifacts/snapshots");
    assert.equal(config.threshold, 0.2);
    assert.equal(config.failOnDiff, true);
    assert.equal(config.maxDiffRatio, 0.01);
    assert.deepEqual(config.mask, [".hero", ".badge"]);
    assert.deepEqual(config.routes, [
      { path: "/" },
      { path: "/issues?severity=critical", label: "critical-issues" },
    ]);
  });
});

describe("parseSnapshotCliArgs", () => {
  it("uses config routes when URLs are omitted", () => {
    const options = parseSnapshotCliArgs([], {
      baseUrl: "http://localhost:3000",
      routes: [
        { path: "/", label: undefined },
        { path: "/issues?severity=critical", label: "critical-issues" },
      ],
      outputDir: "artifacts/snapshots",
      threshold: 0.2,
      failOnDiff: true,
      failOnNewBaseline: false,
      maxDiffRatio: 0.01,
      mask: [".hero"],
    });

    assert.equal(options.mode, "capture");
    assert.deepEqual(options.urls, [
      "http://localhost:3000/",
      "http://localhost:3000/issues?severity=critical",
    ]);
    assert.deepEqual(options.labels, [
      "localhost_3000_root",
      "critical-issues",
    ]);
    assert.equal(options.outputDir, "artifacts/snapshots");
    assert.equal(options.threshold, 0.2);
    assert.equal(options.failOnDiff, true);
    assert.equal(options.maxDiffRatio, 0.01);
    assert.deepEqual(options.maskSelectors, [".hero"]);
  });

  it("lets CLI URLs and flags override config defaults", () => {
    const options = parseSnapshotCliArgs([
      "http://localhost:4100/",
      "--label", "home",
      "--output", "tmp/out",
      "--threshold", "0.3",
      "--fail-on-new-baseline",
      "--mask", ".runtime-mask",
    ], {
      baseUrl: "http://localhost:3000",
      routes: [{ path: "/ignored", label: "ignored" }],
      outputDir: "artifacts/snapshots",
      threshold: 0.2,
      failOnDiff: true,
      failOnNewBaseline: false,
      mask: [".config-mask"],
    });

    assert.equal(options.mode, "capture");
    assert.deepEqual(options.urls, ["http://localhost:4100/"]);
    assert.deepEqual(options.labels, ["home"]);
    assert.equal(options.outputDir, "tmp/out");
    assert.equal(options.threshold, 0.3);
    assert.equal(options.failOnDiff, true);
    assert.equal(options.failOnNewBaseline, true);
    assert.deepEqual(options.maskSelectors, [".runtime-mask"]);
  });

  it("supports snapshot approve with config-derived outputDir", () => {
    const options = parseSnapshotCliArgs(["approve"], {
      outputDir: "artifacts/snapshots",
    });

    assert.equal(options.mode, "approve");
    assert.equal(options.outputDir, "artifacts/snapshots");
  });

  it("rejects relative routes without baseUrl", () => {
    assert.throws(
      () => parseSnapshotCliArgs([], {
        routes: [{ path: "/issues", label: undefined }],
      }),
      /baseUrl is required when snapshot routes are relative/i,
    );
  });
});
