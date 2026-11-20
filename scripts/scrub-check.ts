import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "out",
  ".venv",
  "wandb",
  "weave",
  "__pycache__",
]);

const FORBIDDEN_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "Local macOS user path", regex: /\/Users\/[A-Za-z0-9._-]+/ },
  { name: "Local Linux home path", regex: /\/home\/[A-Za-z0-9._-]+/ },
  { name: "OpenAI secret key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "W&B API key literal", regex: /\bWANDB_API_KEY\s*=\s*["']?[A-Za-z0-9]{20,}/ },
  { name: "W&B v1 API key", regex: /\bwandb_v1_[A-Za-z0-9_-]{20,}/ },
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx|mts|js|mjs|json|jsonl|md|yml|yaml|html|css|sh|py|toml)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function main(): void {
  const issues: string[] = [];
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file);
    if (rel === "scripts/scrub-check.ts" || rel === "pnpm-lock.yaml") continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((lineText, idx) => {
      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.regex.test(lineText)) {
          issues.push(`${rel}:${idx + 1} matched ${pat.name}`);
        }
      }
    });
  }

  if (issues.length > 0) {
    console.error("Scrub check FAILED:");
    for (const issue of issues) {
      console.error(`  - ${issue}`);
    }
    process.exit(1);
  }

  console.log("Scrub check OK: zero secrets or local machine paths found.");
}

main();
