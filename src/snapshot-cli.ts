export interface SnapshotFailureOptions {
  failOnDiff?: boolean;
  failOnNewBaseline?: boolean;
  maxDiffRatio?: number;
}

export interface SnapshotFailureResult {
  exitCode: number;
  reasons: string[];
}

export interface SnapshotSummaryEntry {
  label: string;
  viewport: string;
  isNew: boolean;
  diffRatio?: number;
}

export interface SnapshotRouteConfig {
  path: string;
  label?: string;
}

export interface SnapshotConfig {
  baseUrl?: string;
  routes?: SnapshotRouteConfig[];
  outputDir?: string;
  threshold?: number;
  failOnDiff?: boolean;
  failOnNewBaseline?: boolean;
  maxDiffRatio?: number;
  mask?: string[];
}

export interface ParsedSnapshotCliOptions {
  mode: "capture" | "approve";
  urls: string[];
  labels: string[];
  outputDir: string;
  threshold: number;
  failOnDiff: boolean;
  failOnNewBaseline: boolean;
  maxDiffRatio?: number;
  maskSelectors: string[];
}

function sanitizeLabelPart(value: string): string {
  return value
    .trim()
    .replace(/%/g, "_")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function defaultPort(protocol: string): string {
  if (protocol === "https:") return "443";
  return "80";
}

export function urlToSnapshotLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = sanitizeLabelPart(parsed.pathname.replace(/\.html$/i, "").replace(/\//g, "_")) || "root";
    const base = sanitizeLabelPart(parsed.hostname) || "page";
    const port = parsed.port || defaultPort(parsed.protocol);

    const queryPairs = Array.from(parsed.searchParams.entries())
      .map(([key, value]) => [sanitizeLabelPart(key), sanitizeLabelPart(value)] as const)
      .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));

    const querySuffix = queryPairs.length > 0
      ? `__query_${queryPairs.map(([key, value]) => `${key}_${value || "empty"}`).join("__")}`
      : "";

    const hashPart = sanitizeLabelPart(parsed.hash.replace(/^#\/?/, ""));
    const hashSuffix = hashPart ? `__hash_${hashPart}` : "";

    return `${base}_${port}_${path}${querySuffix}${hashSuffix}`;
  } catch {
    return "page";
  }
}

export function resolveSnapshotLabels(urls: string[], explicitLabels: string[]): string[] {
  if (explicitLabels.length === 0) {
    return urls.map((url) => urlToSnapshotLabel(url));
  }

  if (urls.length === 1 && explicitLabels.length === 1) {
    return explicitLabels;
  }

  if (explicitLabels.length !== urls.length) {
    throw new Error("--label must be provided either once for a single URL or once per URL");
  }

  return explicitLabels;
}

export function parseSnapshotConfig(raw: string): SnapshotConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid snapshot config JSON: ${String(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Snapshot config must be an object");
  }

  const record = parsed as Record<string, unknown>;
  const routes = record.routes == null ? undefined : parseSnapshotRoutes(record.routes);
  const mask = record.mask == null ? undefined : parseStringArray(record.mask, "snapshot config mask must be a string array");
  const threshold = record.threshold == null ? undefined : parseRatio(record.threshold, "snapshot config threshold must be between 0 and 1");
  const maxDiffRatio = record.maxDiffRatio == null
    ? undefined
    : parseNonNegativeNumber(record.maxDiffRatio, "snapshot config maxDiffRatio must be a non-negative number");

  return {
    baseUrl: record.baseUrl == null ? undefined : parseString(record.baseUrl, "snapshot config baseUrl must be a non-empty string"),
    routes,
    outputDir: record.outputDir == null ? undefined : parseString(record.outputDir, "snapshot config outputDir must be a non-empty string"),
    threshold,
    failOnDiff: record.failOnDiff == null ? undefined : parseBoolean(record.failOnDiff, "snapshot config failOnDiff must be a boolean"),
    failOnNewBaseline: record.failOnNewBaseline == null
      ? undefined
      : parseBoolean(record.failOnNewBaseline, "snapshot config failOnNewBaseline must be a boolean"),
    maxDiffRatio,
    mask,
  };
}

export function parseSnapshotCliArgs(
  cliArgs: string[],
  config: SnapshotConfig = {},
  cwd = process.cwd(),
): ParsedSnapshotCliOptions {
  const positional: string[] = [];
  const explicitLabels: string[] = [];
  const maskSelectors: string[] = [];
  let outputDir = config.outputDir ?? `${cwd}/test-results/snapshots`;
  let threshold = config.threshold ?? 0.1;
  let failOnDiff = config.failOnDiff ?? false;
  let failOnNewBaseline = config.failOnNewBaseline ?? false;
  let maxDiffRatio = config.maxDiffRatio;

  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i]!;
    switch (arg) {
      case "--output":
      case "--output-dir": {
        const value = cliArgs[++i];
        if (!value) throw new Error(`Missing value for ${arg}`);
        outputDir = value;
        break;
      }
      case "--label": {
        const value = cliArgs[++i];
        if (!value) throw new Error("Missing value for --label");
        explicitLabels.push(value);
        break;
      }
      case "--threshold": {
        const value = cliArgs[++i];
        threshold = parseRatio(value == null ? value : Number(value), "Invalid --threshold value");
        break;
      }
      case "--fail-on-diff":
        failOnDiff = true;
        break;
      case "--fail-on-new-baseline":
        failOnNewBaseline = true;
        break;
      case "--max-diff-ratio": {
        const value = cliArgs[++i];
        maxDiffRatio = parseNonNegativeNumber(value == null ? value : Number(value), "Invalid --max-diff-ratio value");
        break;
      }
      case "--mask": {
        const value = cliArgs[++i];
        if (!value) throw new Error("Missing value for --mask");
        for (const selector of value.split(",")) {
          const trimmed = selector.trim();
          if (trimmed) maskSelectors.push(trimmed);
        }
        break;
      }
      case "--config": {
        i++;
        break;
      }
      case "--help":
      case "-h":
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
        break;
    }
  }

  if (positional[0] === "approve") {
    if (positional.length > 1) {
      throw new Error("`vrt snapshot approve` does not accept positional URLs");
    }
    return {
      mode: "approve",
      urls: [],
      labels: explicitLabels,
      outputDir,
      threshold,
      failOnDiff,
      failOnNewBaseline,
      maxDiffRatio,
      maskSelectors: maskSelectors.length > 0 ? maskSelectors : (config.mask ?? []),
    };
  }

  const configuredUrls = positional.length > 0
    ? positional
    : resolveSnapshotConfigUrls(config);

  const configuredLabels = positional.length > 0
    ? []
    : (config.routes ?? []).map((route) => route.label);

  const labels = explicitLabels.length > 0
    ? resolveSnapshotLabels(configuredUrls, explicitLabels)
    : configuredUrls.map((url, index) => configuredLabels[index] ?? urlToSnapshotLabel(url));

  return {
    mode: "capture",
    urls: configuredUrls,
    labels,
    outputDir,
    threshold,
    failOnDiff,
    failOnNewBaseline,
    maxDiffRatio,
    maskSelectors: maskSelectors.length > 0 ? maskSelectors : (config.mask ?? []),
  };
}

export function determineSnapshotExitCode(
  results: SnapshotSummaryEntry[],
  options: SnapshotFailureOptions,
): SnapshotFailureResult {
  const reasons: string[] = [];

  if (options.failOnNewBaseline && results.some((result) => result.isNew)) {
    reasons.push("New baseline detected while --fail-on-new-baseline is enabled");
  }

  if (options.failOnDiff && results.some((result) => !result.isNew && (result.diffRatio ?? 0) > 0)) {
    reasons.push("Diff detected while --fail-on-diff is enabled");
  }

  if (options.maxDiffRatio !== undefined) {
    const exceeded = results.find((result) => !result.isNew && (result.diffRatio ?? 0) > options.maxDiffRatio!);
    if (exceeded) {
      reasons.push(
        `Max diff ratio exceeded: ${exceeded.label} ${exceeded.viewport} is ${((exceeded.diffRatio ?? 0) * 100).toFixed(2)}%`,
      );
    }
  }

  return {
    exitCode: reasons.length > 0 ? 1 : 0,
    reasons,
  };
}

function parseSnapshotRoutes(value: unknown): SnapshotRouteConfig[] {
  if (!Array.isArray(value)) {
    throw new Error("snapshot config routes must be an array");
  }

  return value.map((entry, index) => {
    if (typeof entry === "string" && entry.trim() !== "") {
      return { path: entry };
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`snapshot config route at index ${index} must be a string or object`);
    }
    const record = entry as Record<string, unknown>;
    const path = record.path ?? record.url;
    return {
      path: parseString(path, `snapshot config route at index ${index} must have a path`),
      label: record.label == null ? undefined : parseString(record.label, `snapshot config route at index ${index} has an invalid label`),
    };
  });
}

function resolveSnapshotConfigUrls(config: SnapshotConfig): string[] {
  const routes = config.routes ?? [];
  return routes.map((route) => {
    if (/^https?:\/\//i.test(route.path)) {
      return route.path;
    }
    if (!config.baseUrl) {
      throw new Error("baseUrl is required when snapshot routes are relative");
    }
    return new URL(route.path, config.baseUrl).toString();
  });
}

function parseString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }
  return value;
}

function parseBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }
  return value;
}

function parseStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(message);
  }
  return value;
}

function parseRatio(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(message);
  }
  return value;
}

function parseNonNegativeNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(message);
  }
  return value;
}
