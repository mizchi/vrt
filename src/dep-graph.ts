import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, dirname, extname } from "node:path";
import type {
  DepGraph,
  DepNode,
  DepEdge,
  Language,
  AffectedComponent,
} from "./types.ts";

// ---- Language-specific import parsers ----

interface ImportParser {
  language: Language;
  extensions: string[];
  parseImports(content: string, filePath: string): ParsedImport[];
}

interface ParsedImport {
  source: string;
  specifiers: string[];
}

const typescriptParser: ImportParser = {
  language: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  parseImports(content: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    // import { X } from "Y" / import X from "Y" / import "Y"
    const importRe =
      /import\s+(?:(?:(\{[^}]*\})|(\w+))\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(content)) !== null) {
      const specifiers: string[] = [];
      if (m[1]) {
        // named imports: { A, B as C }
        specifiers.push(
          ...m[1]
            .replace(/[{}]/g, "")
            .split(",")
            .map((s) => s.trim().split(/\s+as\s+/)[0])
            .filter(Boolean)
        );
      }
      if (m[2]) {
        specifiers.push(m[2]);
      }
      imports.push({ source: m[3], specifiers });
    }
    // require("Y")
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = requireRe.exec(content)) !== null) {
      imports.push({ source: m[1], specifiers: [] });
    }
    return imports;
  },
};

const moonbitParser: ImportParser = {
  language: "moonbit",
  extensions: [".mbt"],
  parseImports(content: string): ParsedImport[] {
    // MoonBit uses package-level imports in moon.pkg, not file-level
    // For file-level, we detect @pkg.func usage patterns
    const imports: ParsedImport[] = [];
    const pkgRe = /@(\w[\w/]*)\.\w+/g;
    const seen = new Set<string>();
    let m;
    while ((m = pkgRe.exec(content)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        imports.push({ source: `@${m[1]}`, specifiers: [] });
      }
    }
    return imports;
  },
};

const rustParser: ImportParser = {
  language: "rust",
  extensions: [".rs"],
  parseImports(content: string): ParsedImport[] {
    const imports: ParsedImport[] = [];
    const useRe = /use\s+([\w:]+)(?:::\{([^}]+)\})?;/g;
    let m;
    while ((m = useRe.exec(content)) !== null) {
      const specifiers = m[2]
        ? m[2]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      imports.push({ source: m[1], specifiers });
    }
    // mod declarations
    const modRe = /mod\s+(\w+);/g;
    while ((m = modRe.exec(content)) !== null) {
      imports.push({ source: m[1], specifiers: [] });
    }
    return imports;
  },
};

const parsers: ImportParser[] = [typescriptParser, moonbitParser, rustParser];

function getParser(filePath: string): ImportParser | undefined {
  const ext = extname(filePath);
  return parsers.find((p) => p.extensions.includes(ext));
}

// ---- Graph Construction ----

/**
 * Scan source files in the given directory and build a dependency graph.
 */
export async function buildDepGraph(
  rootDir: string,
  opts: { languages?: Language[]; ignore?: string[] } = {}
): Promise<DepGraph> {
  const languages = opts.languages ?? ["typescript"];
  const ignore = opts.ignore ?? ["node_modules", ".git", "dist", "_build", ".jj"];
  const allowedExts = new Set(
    parsers
      .filter((p) => languages.includes(p.language))
      .flatMap((p) => p.extensions)
  );

  const graph: DepGraph = { nodes: new Map(), edges: [] };
  const files: string[] = [];

  // collect files
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (allowedExts.has(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);

  // parse each file
  for (const filePath of files) {
    const parser = getParser(filePath);
    if (!parser) continue;

    const content = await readFile(filePath, "utf-8");
    const relPath = relative(rootDir, filePath);
    const id = relPath;

    // detect exports (TypeScript-specific for now)
    const exports: string[] = [];
    if (parser.language === "typescript") {
      const exportRe = /export\s+(?:default\s+)?(?:function|const|class|type|interface)\s+(\w+)/g;
      let m;
      while ((m = exportRe.exec(content)) !== null) {
        exports.push(m[1]);
      }
    }

    // detect React component heuristic
    const isComponent =
      parser.language === "typescript" &&
      (/\bJSX\.Element\b/.test(content) ||
        /\bReact\.FC\b/.test(content) ||
        /\breturn\s*\(?\s*</.test(content) ||
        filePath.endsWith(".tsx"));

    const node: DepNode = {
      id,
      filePath: resolve(rootDir, relPath),
      language: parser.language,
      exports,
      isComponent,
    };
    graph.nodes.set(id, node);

    // parse imports and create edges
    const imports = parser.parseImports(content, filePath);
    for (const imp of imports) {
      const resolved = resolveImport(imp.source, filePath, rootDir, parser);
      if (resolved) {
        graph.edges.push({
          from: id,
          to: resolved,
          specifiers: imp.specifiers,
        });
      }
    }
  }

  return graph;
}

function resolveImport(
  source: string,
  fromFile: string,
  rootDir: string,
  parser: ImportParser
): string | undefined {
  // skip external packages
  if (
    !source.startsWith(".") &&
    !source.startsWith("/") &&
    !source.startsWith("@")
  ) {
    return undefined;
  }
  // MoonBit package refs are kept as-is
  if (parser.language === "moonbit") {
    return source;
  }

  const dir = dirname(fromFile);
  const candidates = [
    source,
    ...parser.extensions.map((ext) => source + ext),
    ...parser.extensions.map((ext) => join(source, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    const resolved = relative(rootDir, resolve(dir, candidate));
    // We don't do fs check here — just record the edge.
    // Dead edges are pruned when the target node doesn't exist.
    return resolved;
  }
  return undefined;
}

// ---- Affected Component Analysis ----

/**
 * Identify components affected by changed files.
 * BFS traverses the dependency graph in reverse to detect propagation.
 */
export function findAffectedComponents(
  graph: DepGraph,
  changedFiles: string[],
  opts: { maxDepth?: number } = {}
): AffectedComponent[] {
  const maxDepth = opts.maxDepth ?? 10;

  // build reverse adjacency: to → from[]
  const reverseAdj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = reverseAdj.get(edge.to) ?? [];
    list.push(edge.from);
    reverseAdj.set(edge.to, list);
  }

  // BFS from changed files
  const visited = new Map<string, { depth: number; changedDeps: Set<string> }>();
  const queue: Array<{ id: string; depth: number; origin: string }> = [];

  for (const file of changedFiles) {
    if (graph.nodes.has(file)) {
      queue.push({ id: file, depth: 0, origin: file });
      visited.set(file, { depth: 0, changedDeps: new Set([file]) });
    }
  }

  while (queue.length > 0) {
    const { id, depth, origin } = queue.shift()!;
    if (depth >= maxDepth) continue;

    const dependents = reverseAdj.get(id) ?? [];
    for (const dep of dependents) {
      const existing = visited.get(dep);
      if (existing) {
        existing.changedDeps.add(origin);
        continue; // already visited at same or shorter depth
      }
      const entry = { depth: depth + 1, changedDeps: new Set([origin]) };
      visited.set(dep, entry);
      queue.push({ id: dep, depth: depth + 1, origin });
    }
  }

  // filter to components only
  const affected: AffectedComponent[] = [];
  for (const [id, { depth, changedDeps }] of visited) {
    const node = graph.nodes.get(id);
    if (!node || !node.isComponent) continue;
    affected.push({
      node,
      depth,
      changedDependencies: [...changedDeps],
    });
  }

  // sort by depth (closest first)
  affected.sort((a, b) => a.depth - b.depth);
  return affected;
}

/**
 * Return graph statistics.
 */
export function graphStats(graph: DepGraph) {
  const components = [...graph.nodes.values()].filter((n) => n.isComponent);
  const byLanguage = new Map<Language, number>();
  for (const node of graph.nodes.values()) {
    byLanguage.set(node.language, (byLanguage.get(node.language) ?? 0) + 1);
  }
  return {
    totalFiles: graph.nodes.size,
    totalEdges: graph.edges.length,
    components: components.length,
    byLanguage: Object.fromEntries(byLanguage),
  };
}
