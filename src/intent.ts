import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ChangeIntent,
  DiffSemantics,
  FileChange,
  DiffHunk,
  VisualExpectation,
  VrtDiff,
} from "./types.ts";

const execFileAsync = promisify(execFile);

/**
 * Parse git diff and return structured change information.
 */
export async function extractDiffSemantics(
  repoDir: string,
  base: string = "HEAD~1",
  head: string = "HEAD"
): Promise<DiffSemantics> {
  const [diffResult, logResult] = await Promise.all([
    execFileAsync("git", ["diff", "--unified=3", `${base}...${head}`], {
      cwd: repoDir,
      maxBuffer: 10 * 1024 * 1024,
    }),
    execFileAsync("git", ["log", "--format=%s%n%b", "-1", head], {
      cwd: repoDir,
    }),
  ]);

  const filesChanged = parseDiff(diffResult.stdout);
  const commitMessage = logResult.stdout.trim();
  const intent = buildIntent(filesChanged, commitMessage);

  return { filesChanged, commitMessage, intent };
}

/**
 * Parse unified diff into FileChange[].
 */
export function parseDiff(diffText: string): FileChange[] {
  const files: FileChange[] = [];
  const fileSections = diffText.split(/^diff --git /m).slice(1);

  for (const section of fileSections) {
    const headerMatch = section.match(/^a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const path = headerMatch[2];
    let additions = 0;
    let deletions = 0;
    const hunks: DiffHunk[] = [];

    const lines = section.split("\n");

    let currentHunk: DiffHunk | null = null;
    let lineNum = 0;

    for (const line of lines) {
      const hunkMatch = line.match(
        /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/
      );
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk);
        lineNum = parseInt(hunkMatch[2], 10);
        currentHunk = {
          header: line,
          content: "",
          startLine: lineNum,
          endLine: lineNum,
        };
        continue;
      }

      if (currentHunk) {
        currentHunk.content += line + "\n";
        if (line.startsWith("+") && !line.startsWith("+++")) {
          additions++;
          lineNum++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
        } else if (!line.startsWith("\\")) {
          lineNum++;
        }
        currentHunk.endLine = lineNum;
      }
    }
    if (currentHunk) hunks.push(currentHunk);

    files.push({ path, additions, deletions, hunks });
  }

  return files;
}

/**
 * Infer change intent from files and commit message.
 * Lightweight version without LLM. See buildIntentWithLLM for LLM version.
 */
export function buildIntent(
  files: FileChange[],
  commitMessage: string
): ChangeIntent {
  const changeType = inferChangeType(commitMessage);
  const affectedComponents = files
    .filter((f) => isComponentFile(f.path))
    .map((f) => f.path);

  const expectedVisualChanges = inferVisualExpectations(
    files,
    commitMessage,
    changeType
  );

  return {
    summary: commitMessage.split("\n")[0],
    expectedVisualChanges,
    expectedA11yChanges: [],
    affectedComponents,
    changeType,
  };
}

function inferChangeType(
  message: string
): ChangeIntent["changeType"] {
  const lower = message.toLowerCase();
  if (/^fix[:(]|bug\s*fix|hotfix|patch/.test(lower)) return "bugfix";
  if (/^feat[:(]|feature|add\s/.test(lower)) return "feature";
  if (/^refactor[:(]|cleanup|restructure/.test(lower)) return "refactor";
  if (/^style[:(]|css|theme|color|font|layout/.test(lower)) return "style";
  if (/^a11y[:(]|accessibility|aria|wcag|screen.?reader|label/.test(lower)) return "a11y";
  if (/^deps?[:(]|upgrade|bump|update.*dep/.test(lower)) return "deps";
  return "unknown";
}

function isComponentFile(path: string): boolean {
  return /\.(tsx|jsx|vue|svelte|mbt)$/.test(path);
}

/**
 * Infer expected visual changes from file changes (heuristic version).
 */
function inferVisualExpectations(
  files: FileChange[],
  _commitMessage: string,
  changeType: ChangeIntent["changeType"]
): VisualExpectation[] {
  const expectations: VisualExpectation[] = [];

  // refactor/deps: no visual change expected
  if (changeType === "refactor" || changeType === "deps") {
    for (const file of files) {
      if (isComponentFile(file.path)) {
        expectations.push({
          component: file.path,
          description: "No visual change expected (refactor/deps)",
          confidence: 0.7,
        });
      }
    }
    return expectations;
  }

  for (const file of files) {
    if (!isComponentFile(file.path)) continue;

    // Detect CSS/style changes
    const styleChanges = file.hunks.some(
      (h) =>
        /(?:style|css|className|color|font|margin|padding|border|background)/i.test(
          h.content
        )
    );

    if (styleChanges) {
      expectations.push({
        component: file.path,
        description: `Visual style changes in ${file.path}`,
        confidence: 0.8,
      });
    }

    // Detect layout changes
    const layoutChanges = file.hunks.some(
      (h) =>
        /(?:flex|grid|display|position|width|height|overflow)/i.test(h.content)
    );

    if (layoutChanges) {
      expectations.push({
        component: file.path,
        description: `Layout changes in ${file.path}`,
        confidence: 0.8,
      });
    }

    // Detect text/content changes
    const contentChanges = file.hunks.some(
      (h) =>
        /(?:text|label|title|heading|<h[1-6]|<p|<span|innerText)/i.test(
          h.content
        )
    );

    if (contentChanges) {
      expectations.push({
        component: file.path,
        description: `Content/text changes in ${file.path}`,
        confidence: 0.6,
      });
    }
  }

  return expectations;
}

// ---- LLM-assisted intent extraction ----

export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

/**
 * Build Intent from diff and commit message using LLM.
 */
export async function buildIntentWithLLM(
  files: FileChange[],
  commitMessage: string,
  llm: LLMProvider
): Promise<ChangeIntent> {
  const diffSummary = files
    .map((f) => `${f.path} (+${f.additions}/-${f.deletions})`)
    .join("\n");

  const hunkSamples = files
    .flatMap((f) =>
      f.hunks.slice(0, 3).map((h) => `--- ${f.path}\n${h.content.slice(0, 500)}`)
    )
    .join("\n\n");

  const prompt = `Analyze this code change and predict its visual impact.

Commit message: ${commitMessage}

Files changed:
${diffSummary}

Key diff hunks:
${hunkSamples}

Respond in JSON:
{
  "summary": "one-line summary of the change",
  "changeType": "feature|bugfix|refactor|style|deps|unknown",
  "expectedVisualChanges": [
    { "component": "file path", "description": "what visual change is expected", "confidence": 0.0-1.0 }
  ],
  "affectedComponents": ["list of component file paths"]
}`;

  const response = await llm.complete(prompt);
  try {
    const parsed = JSON.parse(response);
    return {
      summary: parsed.summary ?? commitMessage,
      changeType: parsed.changeType ?? "unknown",
      expectedVisualChanges: parsed.expectedVisualChanges ?? [],
      expectedA11yChanges: parsed.expectedA11yChanges ?? [],
      affectedComponents: parsed.affectedComponents ?? [],
    };
  } catch {
    // fallback to heuristic
    return buildIntent(files, commitMessage);
  }
}

// ---- Verdict Construction ----

/**
 * Build a reasoning prompt that validates VRT diff against Intent.
 */
export function buildReasoningPrompt(
  diff: VrtDiff,
  intent: ChangeIntent
): string {
  const matchingExpectations = intent.expectedVisualChanges.filter(
    (e) =>
      diff.snapshot.testTitle.includes(e.component) ||
      e.component.includes(diff.snapshot.testTitle)
  );

  return `You are a visual regression test reviewer.

## Change Intent
Summary: ${intent.summary}
Type: ${intent.changeType}
Expected visual changes:
${intent.expectedVisualChanges.map((e) => `- ${e.component}: ${e.description} (confidence: ${e.confidence})`).join("\n")}

## Visual Diff Detected
Test: ${diff.snapshot.testTitle}
Project: ${diff.snapshot.projectName}
Diff ratio: ${(diff.diffRatio * 100).toFixed(2)}%
Diff pixels: ${diff.diffPixels} / ${diff.totalPixels}
Diff regions: ${diff.regions.length} region(s)
${diff.regions.map((r) => `  - (${r.x},${r.y}) ${r.width}x${r.height}: ${r.diffPixelCount}px`).join("\n")}

## Matching Expectations
${matchingExpectations.length > 0 ? matchingExpectations.map((e) => `- ${e.description}`).join("\n") : "None found"}

## Task
Decide: should this visual diff be APPROVED (matches intent), REJECTED (unexpected regression), or ESCALATED (uncertain, needs human review)?

Respond in JSON:
{
  "decision": "approve|reject|escalate",
  "reasoning": "explanation",
  "confidence": 0.0-1.0
}`;
}
