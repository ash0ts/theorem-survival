/**
 * Build a single self-contained HTML file (`dist/theorem-survival-embed.html`)
 * for inline embedding inside a CoreWeave Forge Report via `wandb.Html(..., inject=False)`.
 *
 * - Inlines Tailwind CSS + React + all 160 paper records + 177 trace verification receipts
 * - Sets `window.__THEOREM_SURVIVAL_EMBED__ = true` for compact embedded chrome and zero relative `/api/*` calls
 * - Runs strict leak assertions on the final HTML string before writing
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const repoRoot = resolve(import.meta.dirname, "..");

const LEAK_PATTERNS: Record<string, RegExp> = {
  email: /[\w.+-]+@[\w-]+\.[\w.]+/,
  localMacPath: /\/Users\/[A-Za-z0-9._-]+/,
  localLinuxPath: /\/home\/[A-Za-z0-9._-]+/,
  openaiSecret: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  githubToken: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  wandbKeyAssignment: /\bWANDB_API_KEY\s*=\s*["']?[A-Za-z0-9]{20,}/,
  wandbV1Key: /\bwandb_v1_[A-Za-z0-9_-]{20,}/,
};

async function main() {
  const outArgIdx = process.argv.indexOf("--out");
  const outPath =
    outArgIdx >= 0 && process.argv[outArgIdx + 1]
      ? resolve(process.argv[outArgIdx + 1])
      : join(repoRoot, "dist", "theorem-survival-embed.html");

  const result = await build({
    root: repoRoot,
    configFile: false,
    logLevel: "warn",
    plugins: [react(), tailwindcss()],
    build: {
      write: false,
      sourcemap: false,
      target: "es2022",
      assetsInlineLimit: 300_000,
      rollupOptions: {
        input: resolve(repoRoot, "index.html"),
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });

  const outputs = Array.isArray(result)
    ? result.flatMap((r) => ("output" in r ? r.output : []))
    : "output" in result
      ? result.output
      : [];
  const jsChunks = outputs.filter(
    (o): o is Extract<(typeof outputs)[number], { type: "chunk" }> => o.type === "chunk" && o.isEntry,
  );
  const cssAssets = outputs.filter(
    (o): o is Extract<(typeof outputs)[number], { type: "asset" }> =>
      o.type === "asset" && o.fileName.endsWith(".css"),
  );
  if (jsChunks.length !== 1) {
    throw new Error(`Expected 1 inlined JS chunk, got ${jsChunks.length}`);
  }

  const rawJs = jsChunks[0].code.replace(/<\/script/gi, "<\\/script");
  const cssCode = cssAssets
    .map((a) => (typeof a.source === "string" ? a.source : Buffer.from(a.source).toString("utf8")))
    .join("\n");

  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    "font-src data:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>TheoremSurvival · Interactive 160-Paper Explorer</title>
<style>
${cssCode}
</style>
</head>
<body class="bg-[#FAF9F5] text-stone-900 antialiased selection:bg-amber-200 selection:text-stone-950">
<div id="root"></div>
<script>window.__THEOREM_SURVIVAL_EMBED__ = true;</script>
<script type="module">
${rawJs}
</script>
</body>
</html>
`;

  // Note: allow public `github.com` / `forge.coreweave.com` / `arxiv.org` URLs, reject emails/secrets/local paths.
  // Check email carefully (exclude CSS `@media` / `@keyframes` / `@layer` / `@property` / `@supports` which don't have dots in domain, or package strings).
  for (const [name, re] of Object.entries(LEAK_PATTERNS)) {
    const m = html.match(re);
    if (m) {
      throw new Error(`Final HTML failed leak check (${name}): ${m[0]}`);
    }
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  console.log(
    `wrote ${outPath} (${(Buffer.byteLength(html, "utf8") / 1024).toFixed(1)} KB, leak-checked)`,
  );
}

await main();
