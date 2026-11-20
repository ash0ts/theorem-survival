import { ARXIV_CORPUS, type ArxivCorpusItem } from "./arxiv-corpus";
import type { ArxivCategory, TheoremRecord, TopicBucket } from "./theorems";

export const AGENT_LENS_CONV_BASE =
  "https://forge.coreweave.com/agent-lens/wandb/theorem-survival/conversations";

const FEATURED_CORPUS_ARXIV_IDS = new Set([
  "2609.30306", // 120-State Turing Machine halting iff RH is false
  "2602.02263", // Quantum sampling secure supersingular elliptic curves under GRH
  "2611.02280", // Deterministic polynomial-time primality testing
  "2502.17010", // Unconditional foundations for supersingular isogeny crypto
  "2601.21901", // Euclid-Mullin prime sequences under ERH
  "2111.14054", // Prime tuples and Siegel zeros
  "1205.5653",  // Deterministic polynomial factoring under GRH
  "1001.4829",  // Graph evasiveness and prime distribution
]);

function mapCategory(primaryCat: string, bucket: TopicBucket): ArxivCategory {
  if (primaryCat === "cs.CR" || bucket === "Cryptography & Security") return "cs.CR";
  if (primaryCat.startsWith("cs.") || bucket === "Algorithms & Complexity") return "cs.CC";
  return "math.NT";
}

function conjPlainName(c: ArxivCorpusItem["conjectureType"]): string {
  if (c === "RH") return "the Riemann Hypothesis (RH)";
  if (c === "GRH") return "the Generalized Riemann Hypothesis (GRH)";
  if (c === "ERH") return "the Extended Riemann Hypothesis (ERH)";
  return "established unconditional bounds";
}

export function adaptCorpusItems(excludeArxivIds: Set<string>): TheoremRecord[] {
  const out: TheoremRecord[] = [];
  let seq = 1;

  for (const item of ARXIV_CORPUS) {
    if (excludeArxivIds.has(item.arxivId)) continue;
    excludeArxivIds.add(item.arxivId);

    const id = `A${String(seq++).padStart(3, "0")}`;
    const conjLabel = conjPlainName(item.conjectureType);
    const rootId =
      item.conjectureType === "RH"
        ? "ROOT_RH"
        : item.conjectureType === "GRH"
          ? "ROOT_GRH"
          : item.conjectureType === "ERH"
            ? "ROOT_ERH"
            : "P05";

    const latexBefore = item.alreadyUnconditional
      ? [
          `% arXiv:${item.arxivId} (${item.yearLabel}) — Already Unconditional`,
          `\\begin{theorem}[${item.authors.split(",")[0]} · ${item.theoremLabel}]`,
          `  ${item.plainSummary}`,
          `\\end{theorem}`,
        ]
      : item.polarity === "ASSUMES_FALSE"
        ? [
            `% arXiv:${item.arxivId} (${item.yearLabel}) — Assumes ${item.conjectureType} Fails`,
            `\\begin{theorem}[${item.authors.split(",")[0]} · Conditional on \\neg ${item.conjectureType}]`,
            `  \\text{Assume ${item.conjectureType} fails (e.g. exceptional Siegel zeros exist).}`,
            `  ${item.plainSummary}`,
            `\\end{theorem}`,
          ]
        : [
            `% arXiv:${item.arxivId} (${item.yearLabel}) — Conditional on ${item.conjectureType}`,
            `\\begin{theorem}[${item.authors.split(",")[0]} · Conditional on ${item.conjectureType}]`,
            `  \\text{Assuming ${conjLabel}:}`,
            `  ${item.plainSummary}`,
            `\\end{theorem}`,
          ];

    const latexAfterUpgrade = item.alreadyUnconditional
      ? latexBefore
      : item.polarity === "ASSUMES_FALSE"
        ? [
            `% ${item.conjectureType} = True rules out the counterfactual premise`,
            `\\begin{theorem}[Vacuous Hypothesis — Premise Ruled Out by ${item.conjectureType}]`,
            `  % This paper explored what happens if ${item.conjectureType} failed;`,
            `  % under ${item.conjectureType} = True, its premise never occurs.`,
            `\\end{theorem}`,
          ]
        : [
            `% Upgraded: conditional '${item.conjectureType}' hypothesis removed`,
            `\\begin{theorem}[${item.authors.split(",")[0]} · Unconditional Theorem]`,
            `  ${item.plainImpactUpgrade}`,
            `\\end{theorem}`,
          ];

    const latexAfterFallbackOrVacuous =
      item.polarity === "ASSUMES_FALSE"
        ? [
            `% Counterfactual branch activated!`,
            `\\begin{theorem}[Counterfactual Branch Live under \\neg ${item.conjectureType}]`,
            `  ${item.plainSummary}`,
            `\\end{theorem}`,
          ]
        : item.hasUnconditionalFallback
          ? [
              `% Reverts to unconditional baseline`,
              `\\begin{theorem}[Unconditional Backup Bound Retained]`,
              `  ${item.plainFallbackNote}`,
              `\\end{theorem}`,
            ]
          : [
              `% Conditional premise falsified with no backup proof in paper`,
              `\\begin{theorem}[Blocked — Conditional Hypothesis Fails]`,
              `  % Requires ${conjLabel}; no unconditional substitute stated in paper.`,
              `\\end{theorem}`,
            ];

    out.push({
      id,
      shortNodeTitle: item.shortLabel,
      arxivId: item.arxivId,
      arxivOrDoi: `arXiv:${item.arxivId}`,
      url: item.url,
      title: item.title,
      authors: item.authors,
      yearLabel: item.yearLabel,
      yearNumeric: item.year,
      category: mapCategory(item.primaryCategory, item.topicBucket),
      primarySubcategory: item.primaryCategory,
      topicBucket: item.topicBucket,
      plainSummary: item.plainSummary,
      isFeatured: FEATURED_CORPUS_ARXIV_IDS.has(item.arxivId),
      agentLensUrl: `${AGENT_LENS_CONV_BASE}/${item.conversationId}`,
      theoremLabel: item.theoremLabel,
      conjectureType: item.conjectureType,
      polarity: item.polarity,
      severity: item.hasUnconditionalFallback ? "SHARPENS_BOUND" : "CORE_BLOCKER",
      hasUnconditionalFallback: item.hasUnconditionalFallback,
      fallbackSummary: item.plainFallbackNote,
      hopDepth: 1,
      upstreamIds: [rootId],
      extractedQuote:
        item.extractedQuote.length > 290
          ? `${item.extractedQuote.slice(0, 287).trim()}...`
          : item.extractedQuote,
      confidenceScore: 0.94,
      latexBefore,
      latexAfterUpgrade,
      latexAfterFallbackOrVacuous,
      authorAlertUpgrade:
        item.polarity === "ASSUMES_FALSE"
          ? `Explored what would happen if ${item.conjectureType} failed (such as Siegel zeros existing). If ${item.conjectureType} holds, that 'what-if' premise never happens.`
          : item.plainImpactUpgrade,
      authorAlertOpen: item.alreadyUnconditional
        ? "Already proved unconditionally — does not have to wait for any Riemann Hypothesis proof."
        : item.polarity === "ASSUMES_FALSE"
          ? `A 'what-if' theorem that only kicks in if ${item.conjectureType} turns out to be false.`
          : `Currently conditional on ${conjLabel}.${item.hasUnconditionalFallback ? ` Without it: ${item.plainFallbackNote}` : ""}`,
      authorAlertFalsifiedOrVacuous:
        item.polarity === "ASSUMES_FALSE"
          ? `Counterfactual activates! Because ${item.conjectureType} fails in this scenario, this paper's conclusion becomes an unconditional theorem.`
          : item.hasUnconditionalFallback
            ? `Conditional upgrade fails, so we fall back to the existing unconditional result: ${item.plainFallbackNote}`
            : `Blocked: relies on ${conjLabel}, with no unconditional backup version in this paper.`,
      agentTrapNote: item.alreadyUnconditional
        ? "Already unconditional — naive keyword scrapers falsely label this 'upgraded by RH'."
        : item.polarity === "ASSUMES_FALSE"
          ? `Polarity trap: assumes ${item.conjectureType} is FALSE (or Siegel zeros exist), so proving ${item.conjectureType} retires this branch instead of activating it.`
          : item.conjectureType === "ERH"
            ? "Scope trap: requires Extended RH (Dedekind/Artin L-functions), so proving classical RH or Dirichlet GRH alone is not enough."
            : item.hasUnconditionalFallback
              ? "Fallback trap: sharpens a runtime or error bound where a weaker unconditional proof already exists."
              : `Direct ${item.conjectureType} dependency.`,
    });
  }

  return out;
}
