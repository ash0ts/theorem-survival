import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("gold-set and landmark label isolation", () => {
  it("forbids server/* tools and auditor from importing gold labels or LANDMARK_THEOREMS/THEOREMS", () => {
    const serverDir = path.join(ROOT, "server");
    const files = fs
      .readdirSync(serverDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => path.join(serverDir, f));

    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const codeOnly = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(codeOnly, `${path.basename(file)} must not reference research/gold`).not.toMatch(
        /research\/gold|heldout-60|named-consequences|curated-classics/,
      );
      expect(
        codeOnly,
        `${path.basename(file)} must not import THEOREMS or LANDMARK_THEOREMS lookup tables`,
      ).not.toMatch(/\b(LANDMARK_THEOREMS|THEOREMS)\b/);
    }
  });

  it("auditor prompts and server code contain zero held-out paper author hints", () => {
    const serverDir = path.resolve(import.meta.dirname, "../server");
    const files = fs
      .readdirSync(serverDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => path.join(serverDir, f));
    const heldoutAuthorLeakPattern =
      /\b(Rainear|Chamizo|Sgobba|Mesmay|Robichaux|Grenie|Milinovich|Trudgian|Mulmuley|Carneiro|Radziwill|Zentner|Fieker)\b/i;
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(
        src,
        `${path.basename(file)} must not mention held-out paper authors in prompts or heuristics`,
      ).not.toMatch(heldoutAuthorLeakPattern);
    }
  });

  it("verifies heldout-60 is strictly disjoint from named-consequences", () => {
    const namedPath = path.join(ROOT, "research", "gold", "named-consequences.json");
    const heldoutPath = path.join(ROOT, "research", "gold", "heldout-60.json");
    const named = JSON.parse(fs.readFileSync(namedPath, "utf8")) as any[];
    const heldout = JSON.parse(fs.readFileSync(heldoutPath, "utf8")) as any[];

    expect(named.length).toBeGreaterThanOrEqual(20);
    expect(heldout.length).toBe(60);

    const namedArxiv = new Set(
      named.map((x) => x.arxivId?.toLowerCase()).filter(Boolean),
    );
    const namedDoi = new Set(
      named.map((x) => x.doi?.toLowerCase()).filter(Boolean),
    );

    for (const h of heldout) {
      if (h.arxivId) {
        expect(namedArxiv.has(String(h.arxivId).toLowerCase())).toBe(false);
      }
      if (h.doi) {
        expect(namedDoi.has(String(h.doi).toLowerCase())).toBe(false);
      }
      expect(typeof h.goldVerbatimQuote).toBe("string");
      expect(h.goldVerbatimQuote.length).toBeGreaterThan(15);
      expect(typeof h.goldLocator).toBe("string");
      expect(h.goldLocator.length).toBeGreaterThan(2);
    }
  });
});
