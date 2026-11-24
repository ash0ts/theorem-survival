/**
 * Step 6: Full-pool theorem dependency audit (`3,800` pooled works).
 *
 * Streams `out/pool-raw.json` through `fetchPaperFullText` (cached under gitignored
 * `out/fulltext/`) and classifies every work with `zai-org/GLM-5.3-Flash`
 * (`auditor-v3-pool`), recording OpenTelemetry GenAI traces to CoreWeave Agent Lens
 * (`wandb/theorem-survival`).
 *
 * Isolation invariant: This script MUST NOT import gold sets (`research/gold/*`)
 * or landmark lookup tables (`THEOREMS`, `LANDMARK_THEOREMS`).
 */
import fs from "node:fs";
import path from "node:path";
import type {
  ConjectureType,
  EvidenceTier,
  HarvestSource,
  ImportanceTier,
  Polarity,
  TopicBucket,
} from "../src/data/theorems";
import { scanTextScopeSignals } from "../server/auditor";
import { fetchPaperFullText } from "../server/fulltext";
import { resolveForgeCredentials } from "../server/credentials";
import {
  chatCompletion,
  parseJsonObjectStrict,
  readSpendLedger,
} from "../server/llm";
import { createTraceRunner } from "../server/tracing";

interface RawPoolWork {
  poolId: string;
  arxivId?: string;
  doi?: string;
  openalexId?: string;
  title: string;
  authors: string;
  year: number;
  publishedDate?: string;
  primaryCategory: string;
  abstractText: string;
  citedByCount: number | null;
  importanceRank: number;
  importanceTier: ImportanceTier;
  foundBySources: HarvestSource[];
  queryTags: string[];
  oaUrl?: string;
  url: string;
  inAttempt1Corpus: boolean;
  isNamedLandmark: boolean;
}

export interface ClassifiedPoolRecord {
  poolId: string;
  workKey: string;
  arxivId?: string;
  doi?: string;
  openalexId?: string;
  oaUrl?: string;
  url: string;
  title: string;
  authors: string;
  year: number;
  yearLabel: string;
  primaryCategory: string;
  topicBucket: TopicBucket;
  shortLabel: string;
  theoremLabel: string;
  conjectureType: ConjectureType;
  polarity: Polarity;
  hasUnconditionalFallback: boolean;
  alreadyUnconditional: boolean;
  plainSummary: string;
  plainImpactUpgrade: string;
  plainFallbackNote: string;
  extractedQuote: string;
  quoteLocator: string;
  evidenceTier: EvidenceTier;
  noFulltext: boolean;
  fulltextFormat: string;
  citedByCount: number | null;
  importanceRank: number;
  importanceTier: ImportanceTier;
  foundBySources: HarvestSource[];
  inAttempt1Corpus: boolean;
  isNamedLandmark: boolean;
  conversationId: string;
  parseError: boolean;
}

const VALID_CONJECTURES = new Set<ConjectureType>([
  "RH",
  "GRH_DIRICHLET",
  "BEYOND_DIRICHLET",
  "UNCLEAR",
  "DENSITY_BOUND",
  "MENTION_ONLY",
]);

const VALID_BUCKETS = new Set<TopicBucket>([
  "Primes & Number Theory",
  "Algorithms & Complexity",
  "Cryptography & Security",
  "Algebra, Knots & Quantum",
]);

const POOL_SYSTEM_PROMPT = `You are TheoremSurvival Auditor v3 (Full-Text Pool Verifier). You audit mathematical and computer-science papers to determine what a machine-checked proof of the classical Riemann Hypothesis (RH) plus the Generalized Riemann Hypothesis for Dirichlet L-functions L(s, chi) over Z/qZ actually settles — and what it leaves open or unchanged.

CONJECTURE TAXONOMY (choose EXACTLY ONE for "conjectureType"):
1. "RH": Paper proves a conditional theorem whose ONLY unproved hypothesis is the classical Riemann Hypothesis for the Riemann zeta function zeta(s) over Q (with NO extra unproved hypotheses such as simplicity of zeros or linear independence of zeros). Elementary integer arithmetic functions like sigma(n), phi(n), or Dedekind's arithmetic function Psi(n) = n * prod_{p|n}(1 + 1/p) on integers/primorials belong to classical "RH", NOT number-field Dedekind zeta.
2. "GRH_DIRICHLET": Paper proves a conditional theorem assuming ONLY the Generalized or Extended Riemann Hypothesis for Dirichlet L-functions L(s, chi) modulo an integer q over Z/qZ (e.g., deterministic primality witness bounds mod n, least quadratic non-residue or primitive root mod p, primes in arithmetic progressions a mod q, circle-method estimates over Dirichlet characters, moments/zeros of primitive Dirichlet L-functions, or counterfactual consequences of exceptional real Landau-Siegel zeros of Dirichlet L-functions).
3. "BEYOND_DIRICHLET": Paper proves a conditional theorem whose hypothesis goes BEYOND classical zeta(s) and Dirichlet L(s, chi):
   - Dedekind zeta functions zeta_K(s) of algebraic number fields K != Q (e.g., Artin primitive-root / near-primitive-root density over Kummer fields, prime-ideal norm bounds, ideal class group generation, Euclidean number fields, discriminant lower bounds, or subexponential/quantum ideal-class-group and ordinary-curve isogeny algorithms).
   - The effective Chebotarev density theorem over Galois extensions — INCLUDING complexity, algebraic-geometry, topology, and cryptography theorems that write "assuming GRH" in the abstract while reducing polynomial systems modulo primes (Hilbert's Nullstellensatz in AM), testing knot or 3-manifold group representations over finite fields, or computing supersingular elliptic-curve endomorphism rings and isogeny paths via quaternion/class-group ideals.
   - Hecke character L-functions, Artin L-functions, or modular / elliptic-curve / Maass / automorphic L-functions.
   - Conditional theorems requiring RH or GRH TOGETHER WITH an extra unproved hypothesis (linear independence of zeros / Grand Simplicity, simplicity of zeros, pair-correlation conjectures, or Generalized Ramanujan Conjecture).
4. "UNCLEAR": Paper genuinely proves a theorem conditional on "GRH" or "ERH", AND the provided text gives insufficient mathematical detail to tell whether Dirichlet L(s, chi) over Z/qZ suffices or number-field / automorphic L-functions are required. Never guess "GRH_DIRICHLET" when "GRH" is genuinely ambiguous in the provided text — choose "UNCLEAR".
5. "DENSITY_BOUND": Paper proves an ALREADY UNCONDITIONAL partial-progress theorem toward RH or GRH (unconditional zero-density bounds, unconditional zero-free regions/strips, explicit prime estimates proved "without RH" from finite zero-free regions, unconditional positive proportion of critical-line zeros, or rigorous numerical verification of zeros up to a finite height T_0).
6. "MENTION_ONLY": Paper's own proved theorems do NOT assume unproved RH, GRH, or ERH:
   - All theorems proved in the paper are unconditional, and RH/GRH/Siegel zeros are mentioned only in historical background, motivation, comparison with prior conditional bounds, remarks, or notes that an earlier draft used GRH.
   - "Riemann hypothesis" refers to the proved Riemann hypothesis / Weil conjectures for curves or varieties over finite fields F_q, OR is a physics/analogy/random-matrix heuristic/survey essay with no conditional theorem proved.

ADDITIONAL FIELDS (return ONLY a single valid JSON object with these exact keys):
- "conjectureType": "RH" | "GRH_DIRICHLET" | "BEYOND_DIRICHLET" | "UNCLEAR" | "DENSITY_BOUND" | "MENTION_ONLY"
- "polarity": "ASSUMES_TRUE" | "ASSUMES_FALSE" ("ASSUMES_FALSE" ONLY when a theorem assumes RH/GRH is FALSE or exceptional Siegel zeros exist infinitely often; if a paper bypasses Siegel zeros to prove an unconditional theorem, use "MENTION_ONLY" + "ASSUMES_TRUE")
- "hasUnconditionalFallback": boolean (true if the paper also proves a weaker/slower unconditional bound OR an unconditional proof/algorithm for the same qualitative problem is established; always true for "DENSITY_BOUND" and "MENTION_ONLY")
- "topicBucket": "Primes & Number Theory" | "Algorithms & Complexity" | "Cryptography & Security" | "Algebra, Knots & Quantum"
- "shortLabel": "3 to 5 plain words naming the paper's topic"
- "theoremLabel": "Theorem/Corollary number if stated in excerpts/abstract (e.g. 'Theorem 1.2'), else 'Main Result'"
- "plainSummary": "One plain-English sentence (12-24 words) explaining what the paper proves or studies without unexplained specialist acronyms."
- "plainImpactUpgrade": "One plain-English sentence (12-22 words) explaining what the checked RH + Dirichlet GRH proof changes (or why it leaves this paper open or unchanged)."
- "plainFallbackNote": "One plain-English sentence stating what unconditional bound or algorithm already exists, or that no unconditional substitute is proved here."
- "extractedQuote": "Verbatim 1-sentence quote copied from the excerpts or abstract supporting your classification."
- "quoteLocator": "Exact section/page/line locator from the excerpts (e.g. 'main.tex :: §Introduction :: L48' or 'PDF Page 2'), or 'Abstract' if abstract-only."`;

function inferDefaultTopic(cat: string, title: string, abstract: string): TopicBucket {
  const txt = `${title} ${abstract}`.toLowerCase();
  if (
    cat === "cs.CR" ||
    /crypt|isogen|lattice|signature|post-quantum|encryption|diffie-hellman|rsa/.test(txt)
  ) {
    return "Cryptography & Security";
  }
  if (
    cat.startsWith("cs.") ||
    /algorithm|polynomial-time|complexity|primality|deterministic|subexponential|turing/.test(txt)
  ) {
    return "Algorithms & Complexity";
  }
  if (
    cat === "math.GT" ||
    cat === "math.CO" ||
    cat === "math.AG" ||
    cat === "math.GR" ||
    cat === "quant-ph" ||
    cat === "math.AT" ||
    /knot|manifold|quantum|graph|combinator|variety|schubert|curve/.test(txt)
  ) {
    return "Algebra, Knots & Quantum";
  }
  return "Primes & Number Theory";
}

function formatYearLabel(year: number, publishedDate?: string): string {
  if (publishedDate && /^\d{4}-\d{2}/.test(publishedDate)) {
    const d = new Date(`${publishedDate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
  }
  return String(year);
}

function priorityScore(w: RawPoolWork): number {
  if (w.importanceTier === "TOP_100") return 1_000_000 + (w.citedByCount ?? 0);
  if (w.inAttempt1Corpus) return 900_000 + (w.citedByCount ?? 0);
  if (w.isNamedLandmark) return 850_000 + (w.citedByCount ?? 0);
  if (w.importanceTier === "TOP_500") return 500_000 + (w.citedByCount ?? 0);
  return w.citedByCount ?? 0;
}

async function main() {
  const creds = resolveForgeCredentials();
  if (!creds) {
    throw new Error("Missing WANDB_API_KEY / ~/.netrc credentials for Forge Serverless Inference.");
  }
  const activeCreds = creds;

  const rawPath = path.resolve(import.meta.dirname, "../out/pool-raw.json");
  const outPath = path.resolve(import.meta.dirname, "../out/pool-classified.json");
  const rawPool: RawPoolWork[] = JSON.parse(fs.readFileSync(rawPath, "utf8"));

  const existingMap = new Map<string, ClassifiedPoolRecord>();
  if (fs.existsSync(outPath)) {
    const prev: ClassifiedPoolRecord[] = JSON.parse(fs.readFileSync(outPath, "utf8"));
    for (const item of prev) {
      if (!item.parseError) existingMap.set(item.poolId, item);
    }
  }

  const todo = rawPool
    .filter((w) => !existingMap.has(w.poolId))
    .sort((a, b) => priorityScore(b) - priorityScore(a));

  const tracer = createTraceRunner({ spanProcessor: "batch" });
  const tracingActive = await tracer.enabled();

  console.log(
    `Auditing pool: total=${rawPool.length}, already_done=${existingMap.size}, remaining=${todo.length} | model=${activeCreds.model} | AgentLens=${tracingActive} (${tracer.project})`,
  );

  if (todo.length === 0) {
    console.log("All 3,800 pooled works already classified.");
    return;
  }

  function saveCheckpoint() {
    const ordered = rawPool
      .map((w) => existingMap.get(w.poolId))
      .filter((x): x is ClassifiedPoolRecord => Boolean(x));
    const tmp = `${outPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(ordered, null, 2));
    fs.renameSync(tmp, outPath);
  }

  // Dual-lane text retrieval feeding an async bounded classification buffer
  type FetchedItem = {
    work: RawPoolWork;
    evidenceTier: EvidenceTier;
    noFulltext: boolean;
    fulltextFormat: string;
    windows: Array<{ locator: string; kind: string; excerpt: string }>;
    bibMatches: string[];
  };

  const readyBuffer: FetchedItem[] = [];
  let fetchersDone = false;
  const MAX_BUFFER = 80;

  const arxivWorks = todo.filter((w) => Boolean(w.arxivId));
  const nonArxivWorks = todo.filter((w) => !w.arxivId);

  let arxivIdx = 0;
  let nonArxivIdx = 0;

  async function pushToBuffer(item: FetchedItem) {
    while (readyBuffer.length >= MAX_BUFFER) {
      await new Promise((r) => setTimeout(r, 80));
    }
    readyBuffer.push(item);
  }

  async function fetchOneWork(work: RawPoolWork): Promise<FetchedItem> {
    if (!work.arxivId && !work.oaUrl) {
      return {
        work,
        evidenceTier: "abstract_only",
        noFulltext: true,
        fulltextFormat: "none",
        windows: [],
        bibMatches: [],
      };
    }
    const doc = await fetchPaperFullText({
      arxivId: work.arxivId,
      doi: work.doi,
      oaUrl: work.oaUrl,
      poolId: work.poolId,
      saveRawText: false,
    });
    const ok = doc.status === "ok" && doc.windows.length > 0;
    return {
      work,
      evidenceTier: ok ? "fulltext" : "abstract_only",
      noFulltext: !ok,
      fulltextFormat: doc.format,
      windows: doc.windows.slice(0, 8),
      bibMatches: doc.bibliographyMatches.slice(0, 6),
    };
  }

  async function arxivFetchWorker() {
    while (arxivIdx < arxivWorks.length) {
      const w = arxivWorks[arxivIdx++];
      const fetched = await fetchOneWork(w);
      await pushToBuffer(fetched);
    }
  }

  async function nonArxivFetchWorker() {
    while (nonArxivIdx < nonArxivWorks.length) {
      const w = nonArxivWorks[nonArxivIdx++];
      const fetched = await fetchOneWork(w);
      await pushToBuffer(fetched);
    }
  }

  let completedNew = 0;
  let parseFallbacks = 0;
  const startMs = Date.now();

  async function classifyOne(item: FetchedItem) {
    const { work, evidenceTier, noFulltext, fulltextFormat, windows, bibMatches } = item;
    const refId = work.arxivId
      ? `arXiv:${work.arxivId}`
      : work.doi
        ? `doi:${work.doi}`
        : work.poolId;
    const convId = `ts-pool-${work.poolId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 84)}`;

    await tracer.run(
      {
        conversationId: convId,
        userMessage: `Audit pool work ${refId} (${work.title}) [evidence=${evidenceTier}]`,
        agentVersion: "auditor-v3-pool",
        model: activeCreds.model,
        attributes: {
          "paper.pool_id": work.poolId,
          "paper.ref": refId,
          "paper.year": work.year,
          "paper.importance_tier": work.importanceTier,
          "paper.cited_by_count": work.citedByCount ?? 0,
          "paper.evidence_tier": evidenceTier,
        },
      },
      async (trace) => {
        const signals = await trace.tool(
          "scan_pool_scope_signals",
          { poolId: work.poolId, evidenceTier },
          (s) =>
            `dirichlet=${String(s.mentionsDirichletExplicit)} dedekindHecke=${String(
              s.mentionsDedekindOrHecke || s.mentionsChebotarevOrArtin,
            )}`,
          () => {
            const combined =
              evidenceTier === "fulltext"
                ? `${work.title}\n${work.abstractText}\n${windows
                    .map((w) => `[${w.locator}] ${w.excerpt}`)
                    .join("\n")}`
                : `${work.title}\n${work.abstractText}`;
            return { ...scanTextScopeSignals(combined, bibMatches) };
          },
        );

        const sections: string[] = [
          `Paper Ref: ${refId}`,
          `Title: ${work.title}`,
          `Authors: ${work.authors} (${work.year})`,
          `Primary Category: ${work.primaryCategory}`,
          `Citations: ${work.citedByCount ?? 0} (${work.importanceTier})`,
          `Harvest Sources: ${work.foundBySources.join(", ")}`,
          `Evidence Tier: ${evidenceTier}`,
          "",
          "Abstract:",
          work.abstractText || "(no abstract in metadata)",
          "",
          `Lexical Signals: ${JSON.stringify(signals)}`,
        ];
        if (evidenceTier === "fulltext") {
          sections.push(
            "",
            `Located Full-Text Excerpts (${fulltextFormat}):`,
            windows.map((w) => `[${w.locator} | ${w.kind}]\n${w.excerpt}`).join("\n\n"),
          );
          if (bibMatches.length > 0) {
            sections.push("", "Bibliography Anchor Matches:", bibMatches.join("\n"));
          }
        } else {
          sections.push(
            "",
            "NOTE: Full text could not be retrieved (abstract_only). If the abstract writes 'GRH' or 'ERH' without enough mathematical context to tell Dirichlet L(s, chi) from number-field / automorphic L-functions, use 'UNCLEAR'.",
          );
        }
        sections.push("", "Return ONLY the JSON object with the exact requested keys.");
        const userPrompt = sections.join("\n");

        const llmRes = await trace.llm(
          activeCreds.model,
          [{ role: "user", parts: [{ type: "text", content: userPrompt }] }],
          [POOL_SYSTEM_PROMPT],
          () =>
            chatCompletion(
              activeCreds,
              [
                { role: "system", content: POOL_SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
              ],
              { temperature: 0.08, maxTokens: 1500 },
            ),
          (r) => ({
            output: r.content,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            responseModel: r.model,
            summary: `${evidenceTier} (${r.outputTokens} tok, ${r.latencyMs}ms)`,
          }),
        );

        const parsed = parseJsonObjectStrict(llmRes.content);
        const rawConj = parsed ? String(parsed.conjectureType ?? "").trim().toUpperCase() : "";
        const isParseErr = !parsed || !VALID_CONJECTURES.has(rawConj as ConjectureType);
        if (isParseErr) parseFallbacks++;

        const conjectureType: ConjectureType = VALID_CONJECTURES.has(rawConj as ConjectureType)
          ? (rawConj as ConjectureType)
          : signals.mentionsGenericGrh || signals.mentionsErh
            ? "UNCLEAR"
            : "MENTION_ONLY";

        const polarity: Polarity =
          parsed?.polarity === "ASSUMES_FALSE" ? "ASSUMES_FALSE" : "ASSUMES_TRUE";
        const alreadyUnconditional =
          conjectureType === "DENSITY_BOUND" || conjectureType === "MENTION_ONLY";
        const hasUnconditionalFallback =
          alreadyUnconditional || Boolean(parsed?.hasUnconditionalFallback);

        const topicBucket: TopicBucket = VALID_BUCKETS.has(parsed?.topicBucket as TopicBucket)
          ? (parsed!.topicBucket as TopicBucket)
          : inferDefaultTopic(work.primaryCategory, work.title, work.abstractText);

        const defaultQuote =
          windows[0]?.excerpt.slice(0, 260) ||
          work.abstractText.slice(0, 260) ||
          work.title;
        const defaultLoc =
          evidenceTier === "fulltext" ? (windows[0]?.locator ?? fulltextFormat) : "Abstract";

        const rec: ClassifiedPoolRecord = {
          poolId: work.poolId,
          workKey: work.poolId,
          arxivId: work.arxivId,
          doi: work.doi,
          openalexId: work.openalexId,
          oaUrl: work.oaUrl,
          url: work.url,
          title: work.title,
          authors: work.authors,
          year: work.year,
          yearLabel: formatYearLabel(work.year, work.publishedDate),
          primaryCategory: work.primaryCategory,
          topicBucket,
          shortLabel:
            typeof parsed?.shortLabel === "string" && parsed.shortLabel.trim()
              ? parsed.shortLabel.trim().slice(0, 64)
              : work.title.split(/\s+/).slice(0, 5).join(" "),
          theoremLabel:
            typeof parsed?.theoremLabel === "string" && parsed.theoremLabel.trim()
              ? parsed.theoremLabel.trim().slice(0, 48)
              : "Main Result",
          conjectureType,
          polarity,
          hasUnconditionalFallback,
          alreadyUnconditional,
          plainSummary:
            typeof parsed?.plainSummary === "string" && parsed.plainSummary.trim()
              ? parsed.plainSummary.trim()
              : work.title,
          plainImpactUpgrade:
            typeof parsed?.plainImpactUpgrade === "string" && parsed.plainImpactUpgrade.trim()
              ? parsed.plainImpactUpgrade.trim()
              : `Evaluated under checked RH + Dirichlet GRH scope (${conjectureType}).`,
          plainFallbackNote:
            typeof parsed?.plainFallbackNote === "string" && parsed.plainFallbackNote.trim()
              ? parsed.plainFallbackNote.trim()
              : hasUnconditionalFallback
                ? "An unconditional bound or algorithm already exists."
                : "No unconditional substitute stated in retrieved text.",
          extractedQuote:
            typeof parsed?.extractedQuote === "string" && parsed.extractedQuote.trim()
              ? parsed.extractedQuote.trim().slice(0, 320)
              : defaultQuote,
          quoteLocator:
            typeof parsed?.quoteLocator === "string" && parsed.quoteLocator.trim()
              ? parsed.quoteLocator.trim().slice(0, 120)
              : defaultLoc,
          evidenceTier,
          noFulltext,
          fulltextFormat,
          citedByCount: work.citedByCount,
          importanceRank: work.importanceRank,
          importanceTier: work.importanceTier,
          foundBySources: work.foundBySources,
          inAttempt1Corpus: work.inAttempt1Corpus,
          isNamedLandmark: work.isNamedLandmark,
          conversationId: convId,
          parseError: isParseErr,
        };

        trace.setAttributes({
          "audit.conjecture_type": rec.conjectureType,
          "audit.polarity": rec.polarity,
          "audit.evidence_tier": rec.evidenceTier,
          "audit.parse_error": isParseErr,
        });
        trace.output(rec.plainImpactUpgrade);

        existingMap.set(work.poolId, rec);
        completedNew++;
        if (completedNew % 50 === 0 || completedNew === todo.length) {
          saveCheckpoint();
          const spend = readSpendLedger().totalEstimatedUsd;
          const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
          console.log(
            `  [pool-audit] ${existingMap.size}/${rawPool.length} done (+${completedNew} new, parseErr=${parseFallbacks}, buf=${readyBuffer.length}, elapsed=${elapsedMin}m, cumSpend=$${spend.toFixed(4)})`,
          );
        }
      },
    );
  }

  async function llmWorker() {
    while (!fetchersDone || readyBuffer.length > 0) {
      const next = readyBuffer.shift();
      if (!next) {
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      try {
        await classifyOne(next);
      } catch (err) {
        console.error(`  [ERROR] ${next.work.poolId}: ${(err as Error).message}`);
        if (String((err as Error).message).includes("Hard spend cap")) {
          saveCheckpoint();
          throw err;
        }
      }
    }
  }

  const fetchPromise = Promise.all([
    Promise.all(Array.from({ length: 2 }, () => arxivFetchWorker())),
    Promise.all(Array.from({ length: 8 }, () => nonArxivFetchWorker())),
  ]).then(() => {
    fetchersDone = true;
  });

  const llmPromise = Promise.all(Array.from({ length: 14 }, () => llmWorker()));

  await Promise.all([fetchPromise, llmPromise]);
  saveCheckpoint();
  await tracer.flush();
  await tracer.shutdown();

  const finalSpend = readSpendLedger().totalEstimatedUsd;
  console.log(
    `\nCompleted full-pool audit: ${existingMap.size}/${rawPool.length} works classified -> ${outPath} (parseFallbacks=${parseFallbacks}, totalSpend=$${finalSpend.toFixed(4)})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
