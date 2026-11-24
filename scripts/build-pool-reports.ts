/**
 * Step 6 Post-Audit Synthesizer (`scripts/build-pool-reports.ts`):
 *
 * Reads `out/pool-classified.json` (all 3,800 pooled works) and generates:
 *   1. `research/flip-report-144.json` + `research/flip-report-144.md`
 *      (exact transition matrix & flip examples on the 144 Attempt-1 arXiv preprints)
 *   2. `research/top100-no-fulltext.md`
 *      (every TOP_100 work where open full text was unavailable, for manual verification)
 *   3. `research/pool-audit-summary.json` + `research/pool-audit-summary.md`
 *      (coverage, conjecture breakdown, scenario counts across full pool + TOP_100, and most-cited table)
 *   4. `public/pool-classified.json`, `src/data/top100-embed-corpus.json`,
 *      `src/data/pool-stats.json`, and `out/theorems-full-export.json` (leak-scrubbed)
 */
import fs from "node:fs";
import path from "node:path";
import { ARXIV_CORPUS } from "../src/data/arxiv-corpus";
import { adaptPoolItems, type PoolCorpusItem } from "../src/data/corpus-adapter";
import {
  buildExcludeSetFromLandmarks,
  evaluateTheorem,
  LANDMARK_THEOREMS,
  plainScopeGroup,
  PRESETS,
  type ConjectureType,
  type OutcomeKind,
  type TheoremRecord,
} from "../src/data/theorems";
import type { ClassifiedPoolRecord } from "./classify-corpus";

const ROOT = path.resolve(import.meta.dirname, "..");

const ATTEMPT1_LANDMARK_ARXIV_IDS = new Set([
  "math/0008177",
  "1708.04122",
  "2610.27830",
  "2405.20552",
  "2608.13637",
  "2508.17701",
  "1112.0845",
  "1706.04424",
  "2412.02064",
  "2111.01481",
  "2201.03990",
  "2112.11412",
]);

function scrubPublicString(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,64}(?:\.[A-Za-z0-9-]{1,63})+\b/g, "[email]")
    .replace(/\/Users\/[A-Za-z0-9._-]+/g, "[path]")
    .replace(/\/home\/[A-Za-z0-9._-]+/g, "[path]")
    .trim();
}

function sanitizePoolItem(r: ClassifiedPoolRecord): PoolCorpusItem & {
  poolId: string;
  noFulltext: boolean;
  fulltextFormat: string;
  importanceRank: number;
} {
  const safeUrl =
    r.url && (r.url.startsWith("https://") || r.url.startsWith("http://"))
      ? r.url.replace(/^http:\/\//, "https://")
      : r.arxivId
        ? `https://arxiv.org/abs/${r.arxivId}`
        : r.doi
          ? `https://doi.org/${r.doi}`
          : "https://arxiv.org";

  // Manual Top-100 primary-PDF audit check (Plan Step 6):
  // Koblitz 1987 (doi:10.1090/s0025-5718-1987-0866109-5, 6,681 cites) surveys Hooley/Gupta-Murty/Serre's
  // GRH primitive-point bounds on AMS PDF p. 6 while proving its own Theorem on p. 7 unconditionally
  // from Chebotarev + Serre's open-image theorem. Raw model output stays preserved in out/pool-classified.json.
  const isKoblitz1987 = r.doi?.toLowerCase() === "10.1090/s0025-5718-1987-0866109-5";
  const effectiveConjecture: ConjectureType = isKoblitz1987 ? "MENTION_ONLY" : r.conjectureType;
  const effectiveSummary = isKoblitz1987
    ? "Introduces elliptic curve public-key cryptosystems unconditionally, mentioning Hooley's and Serre's GRH primitive-point bounds only as background motivation."
    : scrubPublicString(r.plainSummary);

  return {
    poolId: r.poolId,
    workKey: r.workKey,
    arxivId: r.arxivId,
    doi: r.doi,
    url: safeUrl,
    title: scrubPublicString(r.title),
    authors: scrubPublicString(r.authors),
    year: r.year,
    yearLabel: r.yearLabel,
    primaryCategory: r.primaryCategory,
    topicBucket: r.topicBucket,
    shortLabel: scrubPublicString(r.shortLabel),
    theoremLabel: scrubPublicString(r.theoremLabel),
    conjectureType: effectiveConjecture,
    polarity: r.polarity,
    hasUnconditionalFallback: r.hasUnconditionalFallback,
    alreadyUnconditional: isKoblitz1987 ? true : r.alreadyUnconditional,
    plainSummary: effectiveSummary,
    plainImpactUpgrade: scrubPublicString(r.plainImpactUpgrade),
    plainFallbackNote: scrubPublicString(r.plainFallbackNote),
    extractedQuote: scrubPublicString(r.extractedQuote).slice(0, 290),
    quoteLocator: scrubPublicString(r.quoteLocator || "Abstract"),
    evidenceTier: r.evidenceTier,
    noFulltext: r.noFulltext,
    fulltextFormat: r.fulltextFormat,
    citedByCount: r.citedByCount,
    importanceRank: r.importanceRank,
    importanceTier: r.importanceTier,
    foundBySources: r.foundBySources,
    isNamedLandmark: r.isNamedLandmark,
    conversationId: r.conversationId,
  };
}

function summarizeOutcomes(records: TheoremRecord[]) {
  const byPreset: Record<string, Record<OutcomeKind, number>> = {};
  for (const p of PRESETS) {
    const counts: Record<OutcomeKind, number> = {
      UPGRADED_UNCONDITIONAL: 0,
      BOUND_TIGHTENED: 0,
      STILL_CONDITIONAL: 0,
      VACUOUS_OR_SUPERSEDED: 0,
      HYPOTHESIS_FALSIFIED: 0,
      MENTION_ONLY_UNCHANGED: 0,
    };
    for (const t of records) {
      const ev = evaluateTheorem(t, p.state);
      counts[ev.outcome]++;
    }
    byPreset[p.id] = counts;
  }
  return byPreset;
}

function main() {
  const poolPath = path.join(ROOT, "out", "pool-classified.json");
  if (!fs.existsSync(poolPath)) {
    throw new Error(`Missing ${poolPath} — run classify-corpus.ts first.`);
  }

  // Also cross-check curated-classics ground-truth overrides for TOP_100 paywalled classics
  // that have no open full text (e.g., Miller 1976, Bach 1990, Robin 1984, Rubinstein-Sarnak 1994,
  // Koblitz 1987, Hooley 1967, Weinberger 1973, Odlyzko) when they appear in curated-classics.json!
  const rawClassified: ClassifiedPoolRecord[] = JSON.parse(fs.readFileSync(poolPath, "utf8"));
  const sanitized = rawClassified.map(sanitizePoolItem);

  // Build unified explorer TheoremRecord list (17 curated landmarks + deduplicated pool)
  const exclude = buildExcludeSetFromLandmarks(LANDMARK_THEOREMS);
  const adaptedPool = adaptPoolItems(sanitized, exclude);
  const fullExplorerTheorems: TheoremRecord[] = [...LANDMARK_THEOREMS, ...adaptedPool];

  // Build deduplicated TOP_100 subset (exact top 100 works in fullExplorerTheorems by citation count)
  const top100Theorems = [...fullExplorerTheorems]
    .sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0))
    .slice(0, 100);
  const top100Keys = new Set(
    top100Theorems.map((t) =>
      t.arxivId
        ? `arxiv:${t.arxivId.toLowerCase()}`
        : t.doi
          ? `doi:${t.doi.toLowerCase()}`
          : `title:${t.title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
    ),
  );
  const top100PoolRaw = sanitized
    .filter((x) => {
      const k = x.arxivId
        ? `arxiv:${x.arxivId.toLowerCase()}`
        : x.doi
          ? `doi:${x.doi.toLowerCase()}`
          : `title:${x.title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      return top100Keys.has(k);
    })
    .sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0));

  // 1. Write Attempt-1 144-paper Flip Report
  const byArxiv = new Map(
    sanitized.filter((x) => x.arxivId).map((x) => [x.arxivId!.toLowerCase(), x]),
  );
  const seen144 = new Set<string>(ATTEMPT1_LANDMARK_ARXIV_IDS);
  const attempt1Preprints = [];
  for (const oldItem of ARXIV_CORPUS) {
    const k = oldItem.arxivId.toLowerCase();
    if (seen144.has(k)) continue;
    seen144.add(k);
    attempt1Preprints.push(oldItem);
  }

  const transitionMatrix: Record<string, Record<ConjectureType, number>> = {};
  const oldClasses = ["RH", "GRH", "ERH", "DENSITY_BOUND"];
  for (const oc of oldClasses) {
    transitionMatrix[oc] = {
      RH: 0,
      GRH_DIRICHLET: 0,
      BEYOND_DIRICHLET: 0,
      UNCLEAR: 0,
      DENSITY_BOUND: 0,
      MENTION_ONLY: 0,
    };
  }

  let flippedClassCount = 0;
  let oldSettledCount = 0;
  let newSettledCount = 0;
  let flippedFromSettledToNonSettled = 0;
  let fulltextAmong144 = 0;
  const notableFlips: Array<{
    arxivId: string;
    title: string;
    authors: string;
    citedByCount: number | null;
    attempt1RawClass: string;
    attempt1EffectiveClass: string;
    attempt2Class: ConjectureType;
    evidenceTier: string;
    quoteLocator: string;
    extractedQuote: string;
  }> = [];

  for (const oldItem of attempt1Preprints) {
    const rawOld = oldItem.conjectureType; // raw RH | GRH | ERH | DENSITY_BOUND (76 GRH!)
    const effOld = oldItem.alreadyUnconditional ? "DENSITY_BOUND" : oldItem.conjectureType;
    const newItem = byArxiv.get(oldItem.arxivId.toLowerCase());
    if (!newItem) continue;
    if (newItem.evidenceTier === "fulltext") fulltextAmong144++;

    const newConj = newItem.conjectureType as ConjectureType;
    transitionMatrix[rawOld][newConj]++;

    // Was it counted as settled by RH+GRH in Attempt 1?
    const wasSettled =
      (effOld === "RH" || effOld === "GRH") && oldItem.polarity === "ASSUMES_TRUE";
    const nowSettled =
      (newConj === "RH" || newConj === "GRH_DIRICHLET") &&
      newItem.polarity === "ASSUMES_TRUE";

    if (wasSettled) oldSettledCount++;
    if (nowSettled) newSettledCount++;
    if (wasSettled && !nowSettled) flippedFromSettledToNonSettled++;

    const mappedSame =
      (rawOld === "RH" && newConj === "RH") ||
      (rawOld === "GRH" && newConj === "GRH_DIRICHLET") ||
      (rawOld === "ERH" && newConj === "BEYOND_DIRICHLET") ||
      (rawOld === "DENSITY_BOUND" && newConj === "DENSITY_BOUND");

    if (!mappedSame) {
      flippedClassCount++;
      notableFlips.push({
        arxivId: oldItem.arxivId,
        title: newItem.title,
        authors: newItem.authors,
        citedByCount: newItem.citedByCount ?? null,
        attempt1RawClass: rawOld,
        attempt1EffectiveClass: effOld,
        attempt2Class: newConj,
        evidenceTier: newItem.evidenceTier ?? "abstract_only",
        quoteLocator: newItem.quoteLocator ?? "Abstract",
        extractedQuote: newItem.extractedQuote,
      });
    }
  }

  notableFlips.sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0));

  const flipJson = {
    generatedAtUtc: new Date().toISOString(),
    attempt1PreprintCount: attempt1Preprints.length,
    fulltextRetrievedCount: fulltextAmong144,
    attempt1RawGrhCount: attempt1Preprints.filter((x) => x.conjectureType === "GRH").length,
    attempt1SettledUnderRhGrh: oldSettledCount,
    attempt2SettledUnderCheckedScope: newSettledCount,
    flippedFromSettledToOpenOrMention: flippedFromSettledToNonSettled,
    totalClassChanged: flippedClassCount,
    transitionMatrixRawAttempt1ToAttempt2: transitionMatrix,
    topFlipsByCitations: notableFlips.slice(0, 25),
  };

  fs.mkdirSync(path.join(ROOT, "research"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "research", "flip-report-144.json"),
    JSON.stringify(flipJson, null, 2) + "\n",
  );

  const flipMd = [
    "# Attempt-1 `144`-Preprint Flip Report (Abstract-Only `v1` vs. Full-Text `v3`)",
    "",
    `- **Attempt-1 non-landmark arXiv preprints:** \`${attempt1Preprints.length}\` (\`${fulltextAmong144} / ${attempt1Preprints.length}\` re-audited from full text)`,
    `- **Attempt-1 raw \`GRH\` labels:** \`${flipJson.attempt1RawGrhCount} / ${attempt1Preprints.length}\``,
    `- **Preprints whose dependency class changed:** **\`${flippedClassCount} / ${attempt1Preprints.length}\`** (\`${((flippedClassCount / attempt1Preprints.length) * 100).toFixed(1)}%\`)`,
    `- **Counted as settled (` + "`ASSUMES_TRUE` on `RH`/`GRH`" + `) in Attempt 1:** \`${oldSettledCount} / ${attempt1Preprints.length}\``,
    `- **Actually settled by checked \`RH + Dirichlet GRH\` in Attempt 2:** \`${newSettledCount} / ${attempt1Preprints.length}\` (**\`${flippedFromSettledToNonSettled}\` papers removed from settled count**)`,
    "",
    "## Transition Matrix (Attempt-1 Raw Label -> Attempt-2 Full-Text Label)",
    "",
    "| Attempt-1 Raw Label | `RH` | `GRH_DIRICHLET` | `BEYOND_DIRICHLET` | `UNCLEAR` | `DENSITY_BOUND` | `MENTION_ONLY` | Row Total |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...oldClasses.map((oc) => {
      const r = transitionMatrix[oc];
      const tot =
        r.RH +
        r.GRH_DIRICHLET +
        r.BEYOND_DIRICHLET +
        r.UNCLEAR +
        r.DENSITY_BOUND +
        r.MENTION_ONLY;
      return `| \`${oc}\` | ${r.RH} | ${r.GRH_DIRICHLET} | ${r.BEYOND_DIRICHLET} | ${r.UNCLEAR} | ${r.DENSITY_BOUND} | ${r.MENTION_ONLY} | **${tot}** |`;
    }),
    "",
    "## Top Flipped Preprints by Citations",
    "",
    "| arXiv ID | Cites | Attempt 1 | Attempt 2 | Locator | Title |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...notableFlips
      .slice(0, 20)
      .map(
        (f) =>
          `| \`${f.arxivId}\` | ${f.citedByCount ?? 0} | \`${f.attempt1RawClass}\` | \`${f.attempt2Class}\` | ${f.quoteLocator.replace(/\|/g, "/")} | ${f.title.replace(/\|/g, "/")} |`,
      ),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "research", "flip-report-144.md"), flipMd);

  // 2. Write TOP_100 no_fulltext report for manual verification (over deduplicated Top 100)
  const top100NoFt = top100Theorems.filter((t) => t.evidenceTier === "abstract_only");
  const top100NoFtMd = [
    "# Top-100 Most-Cited Works Without Open Full Text (`no_fulltext`)",
    "",
    `- **Top-100 full-text or primary-source verified:** \`${100 - top100NoFt.length} / 100\``,
    `- **Top-100 abstract-only (\`no_fulltext\`):** \`${top100NoFt.length} / 100\``,
    "",
    "| Rank | Cites | Year | Authors | Title | Ref | Assigned Class | Polarity |",
    "| ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ...top100NoFt.map((t) => {
      const rk = top100Theorems.indexOf(t) + 1;
      return `| ${rk} | ${t.citedByCount ?? 0} | ${t.yearLabel} | ${t.authors.replace(/\|/g, "/")} | ${t.title.replace(/\|/g, "/")} | \`${t.arxivOrDoi}\` | \`${t.conjectureType}\` | \`${t.polarity}\` |`;
    }),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "research", "top100-no-fulltext.md"), top100NoFtMd);

  // 3. Full explorer & TOP_100 summary counts
  const fullByConj: Record<ConjectureType, number> = {
    RH: 0,
    GRH_DIRICHLET: 0,
    BEYOND_DIRICHLET: 0,
    UNCLEAR: 0,
    DENSITY_BOUND: 0,
    MENTION_ONLY: 0,
  };
  const fullByScopeGroup: Record<string, number> = {
    COVERED: 0,
    BEYOND: 0,
    UNCLEAR: 0,
    ALREADY_PROVEN: 0,
    MENTION_ONLY: 0,
  };
  const fullByTopic: Record<string, number> = {};
  let fulltextCountExplorer = 0;
  let curatedCountExplorer = 0;
  let abstractOnlyCountExplorer = 0;

  for (const t of fullExplorerTheorems) {
    fullByConj[t.conjectureType]++;
    fullByScopeGroup[plainScopeGroup(t)]++;
    const tb = t.topicBucket ?? "Primes & Number Theory";
    fullByTopic[tb] = (fullByTopic[tb] ?? 0) + 1;
    if (t.evidenceTier === "fulltext") fulltextCountExplorer++;
    else if (t.evidenceTier === "curated_primary") curatedCountExplorer++;
    else abstractOnlyCountExplorer++;
  }

  const top100ByConj: Record<ConjectureType, number> = {
    RH: 0,
    GRH_DIRICHLET: 0,
    BEYOND_DIRICHLET: 0,
    UNCLEAR: 0,
    DENSITY_BOUND: 0,
    MENTION_ONLY: 0,
  };
  for (const t of top100Theorems) {
    top100ByConj[t.conjectureType]++;
  }

  const explorerPresets = summarizeOutcomes(fullExplorerTheorems);
  const top100Presets = summarizeOutcomes(top100Theorems);

  const poolSummary = {
    generatedAtUtc: new Date().toISOString(),
    rawPoolCount: sanitized.length,
    rawPoolFulltextCount: sanitized.filter((x) => !x.noFulltext).length,
    rawPoolAbstractOnlyCount: sanitized.filter((x) => x.noFulltext).length,
    explorerTotalCount: fullExplorerTheorems.length,
    explorerLandmarksCount: LANDMARK_THEOREMS.length,
    explorerEvidenceBreakdown: {
      fulltext: fulltextCountExplorer,
      curatedPrimary: curatedCountExplorer,
      abstractOnly: abstractOnlyCountExplorer,
    },
    explorerByConjecture: fullByConj,
    explorerByScopeGroup: fullByScopeGroup,
    explorerByTopic: fullByTopic,
    explorerScenarioOutcomes: explorerPresets,
    top100EvidenceBreakdown: {
      fulltext: 100 - top100NoFt.length,
      abstractOnly: top100NoFt.length,
    },
    top100ByConjecture: top100ByConj,
    top100ScenarioOutcomes: top100Presets,
    top25MostCited: top100Theorems.slice(0, 25).map((t) => ({
      title: t.title,
      authors: t.authors,
      yearLabel: t.yearLabel,
      arxivOrDoi: t.arxivOrDoi,
      citedByCount: t.citedByCount,
      conjectureType: t.conjectureType,
      polarity: t.polarity,
      evidenceTier: t.evidenceTier,
      checkedNov24Outcome: evaluateTheorem(t, PRESETS[0].state).outcome,
      checkedNov24Badge: evaluateTheorem(t, PRESETS[0].state).badgeLabel,
    })),
  };

  fs.writeFileSync(
    path.join(ROOT, "research", "pool-audit-summary.json"),
    JSON.stringify(poolSummary, null, 2) + "\n",
  );

  const checkedAll = explorerPresets.checked_nov24;
  const checkedTop = top100Presets.checked_nov24;
  const poolMd = [
    "# Full-Pool Audit Summary (`auditor-v3-pool`)",
    "",
    `- **Raw deduplicated pool:** \`${sanitized.length}\` works (\`${poolSummary.rawPoolFulltextCount}\` full-text windows retrieved, \`${poolSummary.rawPoolAbstractOnlyCount}\` abstract-only)`,
    `- **Explorer total (\`17\` curated landmarks + deduplicated pool):** \`${fullExplorerTheorems.length}\` works`,
    `- **Checked scope (\`RH + Dirichlet GRH\`, full explorer \`N = ${fullExplorerTheorems.length}\`):**`,
    `  - Newly unconditional (\`UPGRADED_UNCONDITIONAL\`): \`${checkedAll.UPGRADED_UNCONDITIONAL}\``,
    `  - Faster / tighter or already proven (\`BOUND_TIGHTENED\`): \`${checkedAll.BOUND_TIGHTENED}\``,
    `  - Still conditional (\`STILL_CONDITIONAL\` — \`BEYOND_DIRICHLET\` + \`UNCLEAR\`): \`${checkedAll.STILL_CONDITIONAL}\``,
    `  - Retired counterfactuals (\`VACUOUS_OR_SUPERSEDED\`): \`${checkedAll.VACUOUS_OR_SUPERSEDED}\``,
    `  - Passing mentions unchanged (\`MENTION_ONLY_UNCHANGED\`): \`${checkedAll.MENTION_ONLY_UNCHANGED}\``,
    `- **Top-100 most-cited works (\`N = 100\`):**`,
    `  - Newly unconditional: \`${checkedTop.UPGRADED_UNCONDITIONAL}\` | Faster/already proven: \`${checkedTop.BOUND_TIGHTENED}\` | Still conditional: \`${checkedTop.STILL_CONDITIONAL}\` | Retired: \`${checkedTop.VACUOUS_OR_SUPERSEDED}\` | Mention-only: \`${checkedTop.MENTION_ONLY_UNCHANGED}\``,
    "",
    "## Conjecture Breakdown",
    "",
    "| Conjecture Class | Full Explorer (`N = " +
      fullExplorerTheorems.length +
      "`) | Top 100 (`N = 100`) |",
    "| --- | ---: | ---: |",
    ...(["RH", "GRH_DIRICHLET", "BEYOND_DIRICHLET", "UNCLEAR", "DENSITY_BOUND", "MENTION_ONLY"] as const).map(
      (c) => `| \`${c}\` | ${fullByConj[c]} | ${top100ByConj[c]} |`,
    ),
    "",
    "## Top 25 Most-Cited Papers in the Pool",
    "",
    "| Cites | Year | Authors | Title | Class | Checked Verdict |",
    "| ---: | ---: | --- | --- | --- | --- |",
    ...poolSummary.top25MostCited.map(
      (r) =>
        `| ${r.citedByCount ?? 0} | ${r.yearLabel} | ${r.authors.replace(/\|/g, "/")} | ${r.title.replace(/\|/g, "/")} | \`${r.conjectureType}\` | ${r.checkedNov24Badge} |`,
    ),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "research", "pool-audit-summary.md"), poolMd);

  // 4. Write public/pool-classified.json (sorted by citedByCount desc for explorer),
  //    src/data/top100-embed-corpus.json, src/data/pool-stats.json, and out/theorems-full-export.json
  const sortedForExplorer = [...sanitized].sort(
    (a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0) || b.year - a.year,
  );
  fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "public", "pool-classified.json"),
    JSON.stringify(sortedForExplorer),
  );

  fs.writeFileSync(
    path.join(ROOT, "src", "data", "top100-embed-corpus.json"),
    JSON.stringify(top100PoolRaw, null, 2) + "\n",
  );

  const evalRunPath = path.join(ROOT, "out", "forge-eval-run.json");
  const evalRunUrl = fs.existsSync(evalRunPath)
    ? (JSON.parse(fs.readFileSync(evalRunPath, "utf8")).forgeUrl as string)
    : "https://forge.coreweave.com/wandb/wandb/theorem-survival";

  fs.writeFileSync(
    path.join(ROOT, "src", "data", "pool-stats.json"),
    JSON.stringify(
      {
        rawPoolCount: sanitized.length,
        explorerTotalCount: fullExplorerTheorems.length,
        fulltextCount: poolSummary.rawPoolFulltextCount,
        abstractOnlyCount: poolSummary.rawPoolAbstractOnlyCount,
        evalRunUrl,
        byConjecture: fullByConj,
        byScopeGroup: fullByScopeGroup,
        checkedNov24Outcomes: checkedAll,
        top100CheckedOutcomes: checkedTop,
      },
      null,
      2,
    ) + "\n",
  );

  const fullExport = fullExplorerTheorems.map((t) => ({
    id: t.id,
    arxivOrDoi: t.arxivOrDoi,
    yearLabel: t.yearLabel,
    citedByCount: t.citedByCount ?? 0,
    importanceTier: t.importanceTier ?? "TAIL",
    evidenceTier: t.evidenceTier ?? "abstract_only",
    quoteLocator: t.quoteLocator ?? "Abstract",
    topicBucket: t.topicBucket ?? "Primes & Number Theory",
    conjectureType: t.conjectureType,
    polarity: t.polarity,
    checkedNov24Outcome: evaluateTheorem(t, PRESETS[0].state).outcome,
    plainSummary: t.plainSummary ?? t.title,
    title: t.title,
    authors: t.authors,
    url: t.url,
    agentLensUrl: t.agentLensUrl ?? "https://forge.coreweave.com/agent-lens/wandb/theorem-survival",
  }));
  fs.writeFileSync(
    path.join(ROOT, "out", "theorems-full-export.json"),
    JSON.stringify(fullExport, null, 2) + "\n",
  );

  console.log(
    `Built reports: explorerTotal=${fullExplorerTheorems.length}, flip144=${flippedClassCount}/${attempt1Preprints.length}, top100NoFt=${top100NoFt.length}/100`,
  );
}

main();
