#!/usr/bin/env node
/**
 * Reset CSS fixture 生成
 *
 * 共通の HTML コンテンツに異なる reset CSS を適用した HTML ファイルを生成する。
 * reset CSS は CDN から取得してインライン化する。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";

const DIR = dirname(new URL(import.meta.url).pathname);

const RESETS: Record<string, { name: string; url: string }> = {
  "no-reset": {
    name: "No Reset (browser defaults)",
    url: "",
  },
  "normalize": {
    name: "normalize.css v8.0.1",
    url: "https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.css",
  },
  "modern-normalize": {
    name: "modern-normalize v3.0.1",
    url: "https://cdn.jsdelivr.net/npm/modern-normalize@3.0.1/modern-normalize.css",
  },
  "destyle": {
    name: "destyle.css v4.0.1",
    url: "https://cdn.jsdelivr.net/npm/destyle.css@4.0.1/destyle.min.css",
  },
};

// 共通のアプリケーション CSS (reset の上に載せる)
const APP_CSS = `
/* Application styles — same across all resets */
body { font-family: system-ui, sans-serif; line-height: 1.6; color: #1e293b; max-width: 720px; margin: 0 auto; padding: 24px 16px; }
header { border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
header nav { display: flex; gap: 16px; }
header a { color: #2563eb; text-decoration: none; font-weight: 500; }
header a:hover { text-decoration: underline; }
main { display: flex; flex-direction: column; gap: 32px; }
article { border-bottom: 1px solid #f1f5f9; padding-bottom: 24px; }
h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
h2 { font-size: 20px; font-weight: 600; margin-bottom: 12px; }
p { margin-bottom: 8px; }
a { color: #2563eb; }
code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; overflow-x: auto; margin: 8px 0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid #cbd5e1; padding-left: 16px; color: #64748b; margin: 8px 0; }
ul, ol { padding-left: 24px; margin: 8px 0; }
li { margin: 4px 0; }
form > div { margin-bottom: 16px; }
label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px; }
input[type="text"], input[type="email"], textarea, select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; }
textarea { resize: vertical; }
button { padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; }
button[type="submit"] { background: #2563eb; color: white; border: none; }
button[type="button"] { background: white; color: #374151; border: 1px solid #d1d5db; }
button[type="reset"] { background: white; color: #dc2626; border: 1px solid #fecaca; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
th { font-weight: 600; font-size: 13px; color: #64748b; text-transform: uppercase; }
img { max-width: 100%; height: auto; border-radius: 8px; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
details { margin: 8px 0; }
summary { cursor: pointer; font-weight: 500; }
footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px; }
footer nav { margin-top: 8px; }
footer a { color: #64748b; text-decoration: none; }

@media (max-width: 640px) {
  body { padding: 16px; }
  h1 { font-size: 24px; }
  header nav { flex-wrap: wrap; gap: 8px; }
  table { font-size: 13px; }
  th, td { padding: 6px 8px; }
}
`;

async function fetchCss(url: string): Promise<string> {
  if (!url) return "";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function main() {
  const content = await readFile(join(DIR, "content.html"), "utf-8");

  for (const [id, reset] of Object.entries(RESETS)) {
    console.log(`Generating ${id}...`);
    let resetCss = "";
    try {
      resetCss = await fetchCss(reset.url);
    } catch (e) {
      console.warn(`  Warning: ${e}`);
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset CSS: ${reset.name}</title>
<style id="target-css">
/* Reset: ${reset.name} */
${resetCss}

${APP_CSS}
</style>
</head>
<body>
${content}
</body>
</html>
`;
    await writeFile(join(DIR, `${id}.html`), html);
    console.log(`  → ${id}.html (${resetCss.length} bytes reset CSS)`);
  }

  console.log("Done.");
}

main().catch(console.error);
