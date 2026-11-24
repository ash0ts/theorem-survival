import fs from "node:fs";
import path from "node:path";
import { fetchPaperFullText } from "../server/fulltext";
import namedConsequences from "../research/gold/named-consequences.json";
import { LANDMARK_THEOREMS } from "../src/data/theorems";
import type { PoolRawEntry } from "./harvest-pool";

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 120);
}

const NUMBER_FIELD_CANDIDATE_RE =
  /\b(number field|galois|class group|class number|elliptic curve|isogen|ideal|discriminant|chebotarev|artin|dedekind|hecke|modular form|knot|3-manifold|ring of integers|quaternion|frobenius|hilbert|nullstellensatz)\b/i;

const GENERIC_GRH_RE = /\b(GRH|generalized riemann hypothesis|extended riemann hypothesis|ERH)\b/i;

async function main() {
  const pool: PoolRawEntry[] = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "out", "pool-raw.json"), "utf8")
  );

  // Build strict exclusion set from named-consequences (24) + LANDMARK_THEOREMS (17)
  const excludedArxiv = new Set<string>();
  const excludedDoi = new Set<string>();
  const excludedTitles = new Set<string>();

  for (const nc of namedConsequences as any[]) {
    if (nc.arxivId) excludedArxiv.add(String(nc.arxivId).toLowerCase());
    if (nc.doi) excludedDoi.add(String(nc.doi).toLowerCase());
    excludedTitles.add(normTitle(nc.title));
  }
  for (const lm of LANDMARK_THEOREMS) {
    if (lm.arxivId) excludedArxiv.add(lm.arxivId.toLowerCase());
    if (lm.doi) excludedDoi.add(lm.doi.toLowerCase());
    excludedTitles.add(normTitle(lm.title));
  }

  const eligible = pool.filter((p) => {
    if (p.isNamedLandmark) return false;
    if (p.arxivId && excludedArxiv.has(p.arxivId.toLowerCase())) return false;
    if (p.doi && excludedDoi.has(p.doi.toLowerCase())) return false;
    if (excludedTitles.has(normTitle(p.title))) return false;
    if (!p.abstractText || p.abstractText.length < 60) return false;
    return true;
  });

  const rng = mulberry32(20261124);
  const chosenIds = new Set<string>();

  async function takeWithFullText(
    candidates: PoolRawEntry[],
    stratum: "TOP_100" | "NUMBER_FIELD_GRH" | "REST_STRATIFIED",
    targetCount: number
  ) {
    const out: any[] = [];
    let skippedNoFullText = 0;
    for (const c of candidates) {
      if (out.length >= targetCount) break;
      if (chosenIds.has(c.poolId)) continue;
      const doc = await fetchPaperFullText({
        arxivId: c.arxivId,
        doi: c.doi,
        oaUrl: c.oaUrl,
        poolId: c.poolId,
      });
      if (doc.status !== "ok" || doc.windows.length === 0) {
        skippedNoFullText += 1;
        continue;
      }
      chosenIds.add(c.poolId);
      out.push({
        stratum,
        poolId: c.poolId,
        arxivId: c.arxivId,
        doi: c.doi,
        oaUrl: c.oaUrl,
        url: c.url,
        title: c.title,
        authors: c.authors,
        year: c.year,
        primaryCategory: c.primaryCategory,
        citedByCount: c.citedByCount,
        importanceRank: c.importanceRank,
        importanceTier: c.importanceTier,
        foundBySources: c.foundBySources,
        abstractText: c.abstractText,
        fullTextFormat: doc.format,
        fullTextSourceUrl: doc.sourceUrl,
        windows: doc.windows.slice(0, 8),
        bibliographyMatches: doc.bibliographyMatches,
      });
      console.log(
        `  [${stratum} ${out.length}/${targetCount}] rank=${c.importanceRank} cites=${c.citedByCount} (${doc.format}) ${c.title.slice(0, 68)}`
      );
    }
    console.log(`  -> [${stratum}] selected=${out.length}, skipped_no_open_fulltext=${skippedNoFullText}`);
    return out;
  }

  // Stratum 1: 20 from TOP_100 (or highest-ranked eligible if <20 TOP_100 have open fulltext + abstract)
  const topCandidates = seededShuffle(
    eligible.filter((p) => p.importanceRank <= 120),
    rng
  );
  const stratumA = await takeWithFullText(topCandidates, "TOP_100", 20);

  // Stratum 2: 20 flagged number-field / algebraic / Chebotarev GRH candidates
  const nfCandidates = seededShuffle(
    eligible.filter(
      (p) =>
        !chosenIds.has(p.poolId) &&
        GENERIC_GRH_RE.test(`${p.title} ${p.abstractText}`) &&
        NUMBER_FIELD_CANDIDATE_RE.test(`${p.title} ${p.abstractText}`)
    ),
    rng
  );
  const stratumB = await takeWithFullText(nfCandidates, "NUMBER_FIELD_GRH", 20);

  // Stratum 3: 20 seeded uniform draw across the rest of the pool (including OpenAlex fulltext-only hits)
  const restCandidates = seededShuffle(
    eligible.filter((p) => !chosenIds.has(p.poolId)),
    rng
  );
  const stratumC = await takeWithFullText(restCandidates, "REST_STRATIFIED", 20);

  const combined = [...stratumA, ...stratumB, ...stratumC];
  const outPath = path.join(process.cwd(), "out", "heldout-60-inspection.json");
  fs.writeFileSync(outPath, JSON.stringify(combined, null, 2));
  console.log(`\nWrote ${combined.length} held-out candidates with full-text windows -> ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
