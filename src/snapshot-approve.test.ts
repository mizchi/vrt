import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { approveSnapshotsFromReport } from "./snapshot-approve.ts";

describe("approveSnapshotsFromReport", () => {
  it("promotes all current screenshots to baseline paths from the report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vrt-snapshot-approve-"));
    const currentDesktop = join(dir, "home-desktop-current.png");
    const baselineDesktop = join(dir, "home-desktop-baseline.png");
    const currentMobile = join(dir, "home-mobile-current.png");
    const baselineMobile = join(dir, "home-mobile-baseline.png");
    const reportPath = join(dir, "snapshot-report.json");

    await writeFile(currentDesktop, "desktop-current", "utf-8");
    await writeFile(baselineDesktop, "desktop-old", "utf-8");
    await writeFile(currentMobile, "mobile-current", "utf-8");
    await writeFile(baselineMobile, "mobile-old", "utf-8");
    await writeFile(reportPath, JSON.stringify({
      results: [
        {
          label: "home",
          viewport: "desktop",
          screenshotPath: currentDesktop,
          baselinePath: baselineDesktop,
          isNew: false,
        },
        {
          label: "home",
          viewport: "mobile",
          screenshotPath: currentMobile,
          baselinePath: baselineMobile,
          isNew: false,
        },
      ],
    }), "utf-8");

    const result = await approveSnapshotsFromReport(reportPath, []);

    assert.equal(result.updated, 2);
    assert.deepEqual(result.labels, ["home"]);
    assert.equal(await readFile(baselineDesktop, "utf-8"), "desktop-current");
    assert.equal(await readFile(baselineMobile, "utf-8"), "mobile-current");
  });

  it("filters by label when requested", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vrt-snapshot-approve-"));
    const currentHome = join(dir, "home-desktop-current.png");
    const baselineHome = join(dir, "home-desktop-baseline.png");
    const currentIssues = join(dir, "critical-issues-desktop-current.png");
    const baselineIssues = join(dir, "critical-issues-desktop-baseline.png");
    const reportPath = join(dir, "snapshot-report.json");

    await writeFile(currentHome, "home-current", "utf-8");
    await writeFile(baselineHome, "home-old", "utf-8");
    await writeFile(currentIssues, "issues-current", "utf-8");
    await writeFile(baselineIssues, "issues-old", "utf-8");
    await writeFile(reportPath, JSON.stringify({
      results: [
        {
          label: "home",
          viewport: "desktop",
          screenshotPath: currentHome,
          baselinePath: baselineHome,
          isNew: false,
        },
        {
          label: "critical-issues",
          viewport: "desktop",
          screenshotPath: currentIssues,
          baselinePath: baselineIssues,
          isNew: false,
        },
      ],
    }), "utf-8");

    const result = await approveSnapshotsFromReport(reportPath, ["critical-issues"]);

    assert.equal(result.updated, 1);
    assert.deepEqual(result.labels, ["critical-issues"]);
    assert.equal(await readFile(baselineHome, "utf-8"), "home-old");
    assert.equal(await readFile(baselineIssues, "utf-8"), "issues-current");
  });

  it("derives a baseline path when the report entry omits it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vrt-snapshot-approve-"));
    const currentDesktop = join(dir, "home-desktop-current.png");
    const reportPath = join(dir, "snapshot-report.json");

    await writeFile(currentDesktop, "desktop-current", "utf-8");
    await writeFile(reportPath, JSON.stringify({
      results: [
        {
          label: "home",
          viewport: "desktop",
          screenshotPath: currentDesktop,
          isNew: true,
        },
      ],
    }), "utf-8");

    const result = await approveSnapshotsFromReport(reportPath, []);

    assert.equal(result.updated, 1);
    assert.equal(
      await readFile(join(dir, "home-desktop-baseline.png"), "utf-8"),
      "desktop-current",
    );
  });

  it("fails when the requested label does not exist in the report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vrt-snapshot-approve-"));
    const currentDesktop = join(dir, "home-desktop-current.png");
    const baselineDesktop = join(dir, "home-desktop-baseline.png");
    const reportPath = join(dir, "snapshot-report.json");

    await writeFile(currentDesktop, "desktop-current", "utf-8");
    await writeFile(baselineDesktop, "desktop-old", "utf-8");
    await writeFile(reportPath, JSON.stringify({
      results: [
        {
          label: "home",
          viewport: "desktop",
          screenshotPath: currentDesktop,
          baselinePath: baselineDesktop,
          isNew: false,
        },
      ],
    }), "utf-8");

    await assert.rejects(
      () => approveSnapshotsFromReport(reportPath, ["unknown"]),
      /No snapshot results matched --label filters: unknown/,
    );
  });
});
