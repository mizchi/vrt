import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function readPackageJson() {
  const packagePath = resolve(import.meta.dirname!, "..", "package.json");
  const raw = await readFile(packagePath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("package manifest for publishable CLI", () => {
  it("points the CLI bin to built JavaScript", async () => {
    const pkg = await readPackageJson();
    assert.deepEqual(pkg.bin, { vrt: "./dist/vrt.mjs" });
  });

  it("declares a build script and supported Node runtime", async () => {
    const pkg = await readPackageJson();
    const scripts = pkg.scripts as Record<string, string> | undefined;
    const engines = pkg.engines as Record<string, string> | undefined;

    assert.equal(typeof scripts?.build, "string");
    assert.match(scripts!.build, /\btsdown\b/);
    assert.deepEqual(engines, { node: ">=24" });
  });

  it("runs TypeScript entrypoints without experimental strip flags on Node 24", async () => {
    const pkg = await readPackageJson();
    const scripts = pkg.scripts as Record<string, string> | undefined;

    assert.ok(scripts, "package.json should define scripts");
    for (const [name, command] of Object.entries(scripts)) {
      assert.doesNotMatch(command, /--experimental-strip-types/, `script ${name} should not need experimental strip flags`);
    }
  });

  it("exports the published client entrypoint", async () => {
    const pkg = await readPackageJson();
    assert.deepEqual(pkg.exports, {
      "./client": {
        types: "./dist/client.d.mts",
        import: "./dist/client.mjs",
      },
    });
  });

  it("ships only runtime files needed for npm consumers", async () => {
    const pkg = await readPackageJson();
    const files = pkg.files as string[] | undefined;

    assert.ok(files, "package.json should define files");
    assert.ok(files.includes("dist"), "dist should be published");
    assert.ok(files.includes("README.md"), "README should be published");
  });
});
