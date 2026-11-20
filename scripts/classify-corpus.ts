/**
 * Audits all harvested arXiv papers in `out/arxiv-raw.json` through CoreWeave Forge Serverless
 * Inference (`zai-org/GLM-5.3-Flash`) and traces each paper audit to CoreWeave Agent Lens
 * (`wandb/theorem-survival`), producing `out/corpus-classified.json`.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveForgeCredentials } from "../server/credentials";
import { chatCompletion, parseJsonObject } from "../server/llm";
import { createTraceRunner } from "../server/tracing";

interface RawArxivEntry {
  arxivId: string;
  title: string;
  authors: string;
  published: string;
  year: number;
  primaryCategory: string;
  categories: string[];
  abstract: string;
  url: string;
  matchedQuery: string;
}

export interface ClassifiedCorpusEntry {
  arxivId: string;
  url: string;
  title: string;
  authors: string;
  year: number;
  yearLabel: string;
  primaryCategory: string;
  topicBucket:
    | "Primes & Number Theory"
    | "Algorithms & Complexity"
    | "Cryptography & Security"
    | "Algebra, Knots & Quantum";
  shortLabel: string;
  theoremLabel: string;
  conjectureType: "RH" | "GRH" | "ERH" | "DENSITY_BOUND";
  polarity: "ASSUMES_TRUE" | "ASSUMES_FALSE";
  hasUnconditionalFallback: boolean;
  alreadyUnconditional: boolean;
  plainSummary: string;
  plainImpactUpgrade: string;
  plainFallbackNote: string;
  extractedQuote: string;
  conversationId: string;
}

const LANDMARK_ARXIV_IDS = new Set([
  "2610.27830",
  "2511.21970",
  "1805.05988",
  "2405.20552",
  "2608.13637",
  "2508.17701",
  "1902.07894",
  "2009.04919",
  "1602.03604",
  "1804.04116",
  "2509.10455",
  "1402.7358",
]);

const SYSTEM_PROMPT = `You audit real arXiv mathematics and computer science abstracts for a public explorer showing what changes if the Riemann Hypothesis (RH), Generalized RH (GRH), or Extended RH (ERH) is proved.

Return ONLY valid JSON with these exact keys:
{
  "relevant": boolean,
  "conjectureType": "RH" | "GRH" | "ERH" | "DENSITY_BOUND",
  "polarity": "ASSUMES_TRUE" | "ASSUMES_FALSE",
  "hasUnconditionalFallback": boolean,
  "alreadyUnconditional": boolean,
  "topicBucket": "Primes & Number Theory" | "Algorithms & Complexity" | "Cryptography & Security" | "Algebra, Knots & Quantum",
  "shortLabel": "3 to 5 plain words naming the topic",
  "theoremLabel": "Theorem number if mentioned in abstract, else Main Result",
  "plainSummary": "One plain-English sentence (12-24 words) explaining what the paper proves so a software engineer or curious reader understands it immediately without specialist acronyms.",
  "plainImpactUpgrade": "One plain-English sentence (12-22 words) explaining what concretely changes for this result if its assumed conjecture holds.",
  "plainFallbackNote": "One plain-English sentence stating what unconditional result already exists without the conjecture, or saying no unconditional version is proved in the abstract.",
  "extractedQuote": "Verbatim 1-sentence quote copied from the abstract showing the conditional assumption or unconditional removal."
}

Classification rules:
1. Set "relevant": false if the paper claims to prove/disprove RH itself, is a physics analogy with no conditional theorem, or only mentions Riemann surfaces/manifolds/zeta casually without a conditional dependency on RH/GRH/ERH/Siegel zeros.
2. Distinguish conjectures carefully:
   - "RH": classical Riemann zeta(s) only.
   - "GRH": Generalized Riemann Hypothesis, Dirichlet L-functions, primes in arithmetic progressions, or standard CS/crypto "assuming GRH" / "modulo GRH".
   - "ERH": Extended Riemann Hypothesis, Dedekind zeta_K(s), number fields, Artin L-functions, Hecke L-functions, or class groups of general number fields when Dedekind/ERH is specified.
   - "DENSITY_BOUND": paper proves an ALREADY UNCONDITIONAL theorem (e.g. removing a previous GRH assumption or proving an unconditional zero-density bound). Set "alreadyUnconditional": true for these!
3. Set "polarity": "ASSUMES_FALSE" ONLY when the theorem derives consequences from Siegel zeros (Landau-Siegel exceptional zeros), Deuring-Heilbronn phenomenon, or explicitly assumes RH or GRH is FALSE. Note: if a paper rules out Siegel zeros or proves a bound assuming NO Siegel zeros exist, that is "ASSUMES_TRUE" on GRH. Carefully check whether Siegel zeros are ASSUMED TO EXIST ("if Siegel zeros exist" -> ASSUMES_FALSE) vs ASSUMED ABSENT.
4. Set "hasUnconditionalFallback": true if the abstract ALSO proves a weaker/slower unconditional bound alongside the conditional one, OR improves the exponent/runtime of an already-known unconditional problem, OR is alreadyUnconditional.
5. Keep "plainSummary" and "plainImpactUpgrade" crystal clear, concrete, and completely free of unexplained acronyms.`;

function inferDefaultTopic(cat: string, title: string, abstract: string): ClassifiedCorpusEntry["topicBucket"] {
  const txt = `${title} ${abstract}`.toLowerCase();
  if (cat === "cs.CR" || /crypt|isogen|lattice|signature|post-quantum|encryption|diffie-hellman|rsa/.test(txt)) {
    return "Cryptography & Security";
  }
  if (cat.startsWith("cs.") || /algorithm|polynomial-time|complexity|primality|deterministic|subexponential/.test(txt)) {
    return "Algorithms & Complexity";
  }
  if (
    cat === "math.GT" ||
    cat === "math.CO" ||
    cat === "math.AG" ||
    cat === "math.GR" ||
    cat === "quant-ph" ||
    cat === "math.AT" ||
    /knot|quantum|graph|combinator|manifold|variety|group/.test(txt)
  ) {
    return "Algebra, Knots & Quantum";
  }
  return "Primes & Number Theory";
}

function formatMonthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 4);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

async function main() {
  const creds = resolveForgeCredentials();
  if (!creds) {
    throw new Error("Missing WANDB_API_KEY / ~/.netrc credentials for Forge Serverless Inference.");
  }
  const activeCreds = creds;
  const rawPath = path.resolve(import.meta.dirname, "../out/arxiv-raw.json");
  const outPath = path.resolve(import.meta.dirname, "../out/corpus-classified.json");
  const rawList: RawArxivEntry[] = JSON.parse(fs.readFileSync(rawPath, "utf8")).filter(
    (x: RawArxivEntry) => !LANDMARK_ARXIV_IDS.has(x.arxivId),
  );

  // Resume support if partially classified
  const existingMap = new Map<string, ClassifiedCorpusEntry>();
  if (fs.existsSync(outPath)) {
    const prev: ClassifiedCorpusEntry[] = JSON.parse(fs.readFileSync(outPath, "utf8"));
    for (const item of prev) existingMap.set(item.arxivId, item);
  }

  const tracer = createTraceRunner({ spanProcessor: "batch" });
  const tracingActive = await tracer.enabled();
  console.log(
    `Classifying ${rawList.length} arXiv papers via ${creds.provider} (${creds.model}), Agent Lens=${tracingActive} (${tracer.project})...`,
  );

  const results: ClassifiedCorpusEntry[] = [...existingMap.values()];
  const todo = rawList.filter((x) => !existingMap.has(x.arxivId));
  let rejected = 0;
  let completed = 0;

  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < todo.length) {
      const idx = cursor++;
      const entry = todo[idx];
      const convId = `ts-corpus-${entry.arxivId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      const userPrompt = `arXiv ID: ${entry.arxivId}
Primary category: ${entry.primaryCategory}
Published: ${entry.published}
Authors: ${entry.authors}
Title: ${entry.title}
Abstract: ${entry.abstract}`;

      try {
        await tracer.run(
          {
            conversationId: convId,
            userMessage: `Classify conditional RH/GRH/ERH theorem dependency for arXiv:${entry.arxivId} (${entry.title})`,
            agentVersion: "auditor-v2-corpus",
            model: activeCreds.model,
            attributes: {
              "paper.arxiv_id": entry.arxivId,
              "paper.category": entry.primaryCategory,
              "paper.year": entry.year,
            },
          },
          async (trace) => {
            const regexScan = await trace.tool(
              "scan_abstract_markers",
              { arxivId: entry.arxivId, category: entry.primaryCategory },
              (r) => `erh=${r.mentionsErh}, grh=${r.mentionsGrh}, siegel=${r.mentionsSiegel}`,
              () => {
                const text = `${entry.title} ${entry.abstract}`;
                return {
                  mentionsErh: /extended riemann|\berh\b|dedekind zeta|artin l-function|hecke l-function/i.test(text),
                  mentionsGrh: /generalized riemann|generalised riemann|\bgrh\b|dirichlet l-function/i.test(text),
                  mentionsSiegel: /siegel zero|landau-siegel|deuring-heilbronn|riemann hypothesis is false/i.test(text),
                  mentionsUnconditional: /unconditional/i.test(text),
                };
              },
            );

            const chat = await trace.llm(
              activeCreds.model,
              [{ role: "user", parts: [{ type: "text", content: userPrompt }] }],
              [SYSTEM_PROMPT],
              () =>
                chatCompletion(
                  activeCreds,
                  [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                      role: "user",
                      content: `${userPrompt}\n\nDeterministic marker hints: ${JSON.stringify(regexScan)}`,
                    },
                  ],
                  { temperature: 0.05, maxTokens: 650 },
                ),
              (r) => ({
                output: r.content,
                inputTokens: r.inputTokens,
                outputTokens: r.outputTokens,
                responseModel: r.model,
                summary: `${r.latencyMs}ms`,
              }),
            );

            const parsed = parseJsonObject(chat.content);
            const relevant = Boolean(parsed.relevant);
            trace.setAttributes({
              "audit.relevant": relevant,
              "audit.conjecture_type": String(parsed.conjectureType ?? "UNKNOWN"),
              "audit.polarity": String(parsed.polarity ?? "ASSUMES_TRUE"),
            });
            trace.output(chat.content);

            if (!relevant) {
              rejected++;
              return;
            }

            const rawConj = String(parsed.conjectureType ?? "RH").toUpperCase();
            const conjectureType: ClassifiedCorpusEntry["conjectureType"] =
              rawConj === "GRH" || rawConj === "ERH" || rawConj === "DENSITY_BOUND" ? rawConj : "RH";
            const polarity: ClassifiedCorpusEntry["polarity"] =
              parsed.polarity === "ASSUMES_FALSE" ? "ASSUMES_FALSE" : "ASSUMES_TRUE";
            const alreadyUnconditional =
              Boolean(parsed.alreadyUnconditional) || conjectureType === "DENSITY_BOUND";
            const hasUnconditionalFallback =
              alreadyUnconditional || Boolean(parsed.hasUnconditionalFallback);

            const validBuckets = new Set([
              "Primes & Number Theory",
              "Algorithms & Complexity",
              "Cryptography & Security",
              "Algebra, Knots & Quantum",
            ]);
            const topicBucket = validBuckets.has(String(parsed.topicBucket))
              ? (parsed.topicBucket as ClassifiedCorpusEntry["topicBucket"])
              : inferDefaultTopic(entry.primaryCategory, entry.title, entry.abstract);

            const item: ClassifiedCorpusEntry = {
              arxivId: entry.arxivId,
              url: entry.url,
              title: entry.title,
              authors: entry.authors || "arXiv Authors",
              year: entry.year,
              yearLabel: formatMonthYear(entry.published),
              primaryCategory: entry.primaryCategory,
              topicBucket,
              shortLabel: String(parsed.shortLabel || entry.title.slice(0, 38)).trim(),
              theoremLabel: String(parsed.theoremLabel || "Main Result").trim(),
              conjectureType: alreadyUnconditional ? "DENSITY_BOUND" : conjectureType,
              polarity,
              hasUnconditionalFallback,
              alreadyUnconditional,
              plainSummary: String(parsed.plainSummary || entry.abstract.slice(0, 140)).trim(),
              plainImpactUpgrade: String(
                parsed.plainImpactUpgrade ||
                  "Drops its conditional assumption and holds unconditionally once the conjecture is verified.",
              ).trim(),
              plainFallbackNote: String(
                parsed.plainFallbackNote ||
                  "No unconditional version of this specific bound is stated in the abstract.",
              ).trim(),
              extractedQuote: String(parsed.extractedQuote || entry.abstract.split(". ")[0] + ".").trim(),
              conversationId: convId,
            };
            results.push(item);
          },
        );
      } catch (err) {
        console.warn(`  [warn] ${entry.arxivId}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        completed++;
        if (completed % 20 === 0 || completed === todo.length) {
          console.log(`  progress: ${completed}/${todo.length} (kept=${results.length}, rejected=${rejected})`);
          fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await tracer.flush();
  await tracer.shutdown();

  results.sort((a, b) => b.year - a.year || a.arxivId.localeCompare(b.arxivId));
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  const byConj: Record<string, number> = {};
  const byBucket: Record<string, number> = {};
  let assumesFalse = 0;
  for (const r of results) {
    byConj[r.conjectureType] = (byConj[r.conjectureType] ?? 0) + 1;
    byBucket[r.topicBucket] = (byBucket[r.topicBucket] ?? 0) + 1;
    if (r.polarity === "ASSUMES_FALSE") assumesFalse++;
  }
  console.log(`\nDone! Classified ${results.length} verified arXiv papers (rejected ${rejected} non-conditional).`);
  console.log("By conjecture:", byConj);
  console.log("Assumes false / Siegel zeros:", assumesFalse);
  console.log("By topic bucket:", byBucket);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
