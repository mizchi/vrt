/**
 * `vlmkit-anim facts <dir>`: a fact sheet from a directory's import graph.
 *
 * The `repo` generator reads `package.json` files and knows only which package depends on which; inside one
 * package the truth is the import statements. This walks a source tree, takes the entries at `depth` under it
 * as the modules (a directory is one module, a file is one), resolves every relative import to the module it
 * lands in, and writes the cross-module edges as `"a->b"` dependencies. A map drawn by hand from reading the
 * code is then checked against the code rather than against the writer's memory of it (v18).
 *
 * Only relative imports are followed — a bare specifier is a package, and the workspace map covers those.
 * Test files are skipped unless asked for: they import everything and would make every module depend on
 * every other.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { EXPECT_FORMAT, type Expectation } from "../expect.ts";

export interface ImportFactsOptions {
  /** How many path segments under `dir` name a module. 1: the top-level entries. Default 1. */
  depth?: number;
  /** Include `*.test.*`, `*.spec.*` and `__tests__/` files. Default false. */
  tests?: boolean;
  /** Directory names never entered. Default node_modules, dist, build, coverage, .git. */
  ignore?: string[];
}

export interface ImportFacts {
  expectation: Expectation;
  /** Files read. */
  files: number;
  /** Import statements followed to a file inside `dir`. */
  imports: number;
  /** module → the files it holds. */
  members: Record<string, string[]>;
}

const SOURCE = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const DEFAULT_IGNORE = ["node_modules", "dist", "build", "coverage", ".git"];
const IS_TEST = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|[\\/])__tests__[\\/]/;

/** Every `from "…"`, `import("…")`, `require("…")` and `export … from "…"` specifier in a source text. */
export function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"'\n]+)["']/g;
  for (const m of source.matchAll(re)) out.push(m[1]);
  return out;
}

function walk(dir: string, ignore: Set<string>, tests: boolean, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (ignore.has(name)) continue;
      if (!tests && name === "__tests__") continue;
      walk(p, ignore, tests, out);
    } else if (SOURCE.has(extname(name)) && !name.endsWith(".d.ts") && (tests || !IS_TEST.test(p))) out.push(p);
  }
}

/** The file a relative specifier resolves to, trying the extensions a TypeScript or Node import may omit. */
function resolveImport(fromFile: string, spec: string): string | undefined {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base];
  // `./x.js` written for a `./x.ts` source (Node16 resolution) and `./x` for any of them.
  const stripped = base.replace(/\.[cm]?js$/, "");
  for (const ext of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]) candidates.push(`${stripped}${ext}`, `${base}${ext}`);
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) candidates.push(join(base, `index${ext}`));
  return candidates.find((c) => existsSync(c) && statSync(c).isFile());
}

/** The module an absolute file under `root` belongs to at `depth`, or undefined outside `root`. */
export function moduleOf(root: string, file: string, depth: number): string | undefined {
  const rel = relative(root, file);
  if (!rel || rel.startsWith("..") || rel.split(sep).length === 0) return undefined;
  const parts = rel.split(sep);
  const take = parts.slice(0, Math.min(depth, parts.length));
  // A file's own name, without its extension, when the depth reaches it.
  if (take.length === parts.length) take[take.length - 1] = basename(take[take.length - 1], extname(take[take.length - 1]));
  return take.join("/");
}

export function importFacts(dir: string, opts: ImportFactsOptions = {}): ImportFacts {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${dir} is not a directory`);
  const depth = Math.max(1, opts.depth ?? 1);
  const ignore = new Set([...DEFAULT_IGNORE, ...(opts.ignore ?? [])]);
  const files: string[] = [];
  walk(root, ignore, opts.tests === true, files);
  const members: Record<string, string[]> = {};
  const deps = new Set<string>();
  let imports = 0;
  for (const f of files) {
    const from = moduleOf(root, f, depth)!;
    (members[from] ??= []).push(relative(root, f).split(sep).join("/"));
    for (const spec of importSpecifiers(readFileSync(f, "utf8"))) {
      if (!spec.startsWith(".")) continue;
      const target = resolveImport(f, spec);
      if (!target) continue;
      const to = moduleOf(root, target, depth);
      if (!to) continue; // outside the directory: not this map's business
      imports++;
      if (to !== from) deps.add(`${from}->${to}`);
    }
  }
  const modules = Object.keys(members).sort();
  const expectation: Expectation = { format: EXPECT_FORMAT, modules, deps: [...deps].sort() };
  return { expectation, files: files.length, imports, members };
}
