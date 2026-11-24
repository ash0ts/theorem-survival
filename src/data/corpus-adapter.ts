import { ARXIV_CORPUS } from "./arxiv-corpus";
import type {
  ArxivCategory,
  ConjectureType,
  EvidenceTier,
  HarvestSource,
  ImportanceTier,
  Polarity,
  TheoremRecord,
  TopicBucket,
} from "./theorems";

export const AGENT_LENS_CONV_BASE =
  "https://forge.coreweave.com/agent-lens/wandb/theorem-survival/conversations";

export interface PoolCorpusItem {
  workKey?: string;
  arxivId?: string;
  doi?: string;
  url: string;
  title: string;
  authors: string;
  year: number;
  yearLabel: string;
  primaryCategory: string;
  topicBucket: TopicBucket;
  shortLabel: string;
  theoremLabel: string;
  conjectureType: ConjectureType | "GRH" | "ERH";
  polarity: Polarity;
  hasUnconditionalFallback: boolean;
  alreadyUnconditional: boolean;
  plainSummary: string;
  plainImpactUpgrade: string;
  plainFallbackNote: string;
  extractedQuote: string;
  quoteLocator?: string;
  evidenceTier?: EvidenceTier;
  citedByCount?: number | null;
  importanceTier?: ImportanceTier;
  foundBySources?: HarvestSource[];
  isNamedLandmark?: boolean;
  conversationId?: string;
}

const FEATURED_CORPUS_ARXIV_IDS = new Set([
  "2609.30306", // 120-State Turing Machine halting iff RH is false
  "2602.02263", // Quantum sampling secure supersingular elliptic curves
  "2611.02280", // Deterministic polynomial-time primality testing
  "2502.17010", // Unconditional foundations for supersingular isogeny crypto
  "2601.21901", // Euclid-Mullin prime sequences under ERH
  "2111.14054", // Prime tuples and Siegel zeros
  "1012.4019",  // Childs-Jao-Soukharev quantum subexponential isogenies
]);

function mapCategory(primaryCat: string, bucket: TopicBucket): ArxivCategory {
  if (primaryCat === "cs.CR" || bucket === "Cryptography & Security") return "cs.CR";
  if (primaryCat.startsWith("cs.") || bucket === "Algorithms & Complexity") return "cs.CC";
  return "math.NT";
}

export function normalizeConjectureType(
  raw: PoolCorpusItem["conjectureType"],
  alreadyUnconditional: boolean,
): ConjectureType {
  if (alreadyUnconditional && raw !== "MENTION_ONLY") return "DENSITY_BOUND";
  if (raw === "RH") return "RH";
  if (raw === "GRH_DIRICHLET") return "GRH_DIRICHLET";
  if (raw === "BEYOND_DIRICHLET" || raw === "ERH") return "BEYOND_DIRICHLET";
  if (raw === "UNCLEAR" || raw === "GRH") return "UNCLEAR";
  if (raw === "MENTION_ONLY") return "MENTION_ONLY";
  return "DENSITY_BOUND";
}

export function conjPlainName(c: ConjectureType): string {
  switch (c) {
    case "RH":
      return "the classical Riemann Hypothesis (RH)";
    case "GRH_DIRICHLET":
      return "Dirichlet Generalized RH (modular arithmetic, covered by the checked proof)";
    case "BEYOND_DIRICHLET":
      return "number-field / Dedekind or Hecke GRH/ERH (not covered by the checked proof)";
    case "UNCLEAR":
      return "Generalized RH (paper does not specify Dirichlet vs. number-field L-functions)";
    case "MENTION_ONLY":
      return "no conjecture (mentions RH/GRH only in passing)";
    case "DENSITY_BOUND":
      return "established unconditional bounds";
  }
}

export function rootIdForConjecture(c: ConjectureType): string {
  switch (c) {
    case "RH":
      return "ROOT_RH";
    case "GRH_DIRICHLET":
      return "ROOT_GRH_DIRICHLET";
    case "BEYOND_DIRICHLET":
      return "ROOT_BEYOND_DIRICHLET";
    case "UNCLEAR":
      return "ROOT_UNCLEAR";
    case "MENTION_ONLY":
      return "ROOT_MENTION";
    case "DENSITY_BOUND":
      return "ROOT_PARTIAL";
  }
}

export function adaptPoolItems(
  items: PoolCorpusItem[],
  excludeKeys: Set<string>,
  idPrefix = "A",
  startSeq = 1,
): TheoremRecord[] {
  const out: TheoremRecord[] = [];
  let seq = startSeq;

  for (const item of items) {
    const cleanArxiv = item.arxivId?.toLowerCase().trim();
    const cleanDoi = item.doi?.toLowerCase().trim();
    if (cleanArxiv && excludeKeys.has(`arxiv:${cleanArxiv}`)) continue;
    if (cleanDoi && excludeKeys.has(`doi:${cleanDoi}`)) continue;
    const titleKey = `title:${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    if (excludeKeys.has(titleKey)) continue;

    if (cleanArxiv) excludeKeys.add(`arxiv:${cleanArxiv}`);
    if (cleanDoi) excludeKeys.add(`doi:${cleanDoi}`);
    excludeKeys.add(titleKey);

    const id = `${idPrefix}${String(seq++).padStart(4, "0")}`;
    const conjectureType = normalizeConjectureType(item.conjectureType, item.alreadyUnconditional);
    const conjLabel = conjPlainName(conjectureType);
    const rootId = rootIdForConjecture(conjectureType);
    const refLabel = item.arxivId
      ? `arXiv:${item.arxivId}`
      : item.doi
        ? `doi:${item.doi}`
        : item.workKey ?? id;

    const firstAuthor = (item.authors || "Authors").split(",")[0].trim();

    const latexBefore =
      conjectureType === "MENTION_ONLY"
        ? [
            `% ${refLabel} (${item.yearLabel}) — Mentions RH/GRH in Passing Only`,
            `\\begin{theorem}[${firstAuthor} · ${item.theoremLabel} (Unconditional)]`,
            `  ${item.plainSummary}`,
            `\\end{theorem}`,
          ]
        : conjectureType === "DENSITY_BOUND"
          ? [
              `% ${refLabel} (${item.yearLabel}) — Already Unconditional`,
              `\\begin{theorem}[${firstAuthor} · ${item.theoremLabel}]`,
              `  ${item.plainSummary}`,
              `\\end{theorem}`,
            ]
          : item.polarity === "ASSUMES_FALSE"
            ? [
                `% ${refLabel} (${item.yearLabel}) — Assumes ${conjectureType} Fails`,
                `\\begin{theorem}[${firstAuthor} · Conditional on \\neg ${conjectureType}]`,
                `  \\text{Assume ${conjectureType} fails (e.g. exceptional Siegel zeros exist).}`,
                `  ${item.plainSummary}`,
                `\\end{theorem}`,
              ]
            : [
                `% ${refLabel} (${item.yearLabel}) — Conditional on ${conjectureType}`,
                `\\begin{theorem}[${firstAuthor} · Conditional on ${conjectureType}]`,
                `  \\text{Assuming ${conjLabel}:}`,
                `  ${item.plainSummary}`,
                `\\end{theorem}`,
              ];

    const latexAfterUpgrade =
      conjectureType === "MENTION_ONLY" || conjectureType === "DENSITY_BOUND" || conjectureType === "UNCLEAR"
        ? latexBefore
        : item.polarity === "ASSUMES_FALSE"
          ? [
              `% ${conjectureType} = True rules out the counterfactual premise`,
              `\\begin{theorem}[Vacuous Hypothesis — Premise Ruled Out]`,
              `  % Explored what happens if ${conjectureType} failed; premise never occurs.`,
              `\\end{theorem}`,
            ]
          : [
              `% Upgraded: conditional hypothesis removed`,
              `\\begin{theorem}[${firstAuthor} · Unconditional Theorem]`,
              `  ${item.plainImpactUpgrade}`,
              `\\end{theorem}`,
            ];

    const latexAfterFallbackOrVacuous =
      item.polarity === "ASSUMES_FALSE"
        ? [
            `% Counterfactual branch activated`,
            `\\begin{theorem}[Counterfactual Branch Live]`,
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
              `  % Requires ${conjLabel}; no unconditional substitute stated.`,
              `\\end{theorem}`,
            ];

    const quoteTrimmed =
      item.extractedQuote.length > 290
        ? `${item.extractedQuote.slice(0, 287).trim()}...`
        : item.extractedQuote;

    out.push({
      id,
      shortNodeTitle: item.shortLabel,
      arxivId: item.arxivId,
      doi: item.doi,
      arxivOrDoi: refLabel,
      url: item.url,
      title: item.title,
      authors: item.authors,
      yearLabel: item.yearLabel,
      yearNumeric: item.year,
      category: mapCategory(item.primaryCategory, item.topicBucket),
      primarySubcategory: item.primaryCategory,
      topicBucket: item.topicBucket,
      plainSummary: item.plainSummary,
      isFeatured:
        Boolean(item.isNamedLandmark) ||
        (item.arxivId ? FEATURED_CORPUS_ARXIV_IDS.has(item.arxivId) : false),
      isNamedLandmark: Boolean(item.isNamedLandmark),
      citedByCount: item.citedByCount ?? null,
      importanceTier: item.importanceTier ?? "TAIL",
      foundBySources: item.foundBySources ?? ["arxiv_abstract"],
      evidenceTier: item.evidenceTier ?? "abstract_only",
      quoteLocator: item.quoteLocator ?? "Abstract",
      agentLensUrl: item.conversationId
        ? `${AGENT_LENS_CONV_BASE}/${item.conversationId}`
        : "https://forge.coreweave.com/agent-lens/wandb/theorem-survival",
      theoremLabel: item.theoremLabel,
      conjectureType,
      polarity: item.polarity,
      severity: item.hasUnconditionalFallback ? "SHARPENS_BOUND" : "CORE_BLOCKER",
      hasUnconditionalFallback: item.hasUnconditionalFallback,
      fallbackSummary: item.plainFallbackNote,
      hopDepth: 1,
      upstreamIds: [rootId],
      extractedQuote: quoteTrimmed,
      confidenceScore: item.evidenceTier === "fulltext" ? 0.95 : 0.86,
      latexBefore,
      latexAfterUpgrade,
      latexAfterFallbackOrVacuous,
      authorAlertUpgrade:
        conjectureType === "MENTION_ONLY"
          ? "Mentions RH/GRH only for background context; the paper's own theorem is already unconditional and unchanged."
          : conjectureType === "UNCLEAR"
            ? "Paper writes 'GRH' without specifying Dirichlet vs. Dedekind/number-field L-functions in the retrieved text, so it is held out of settled counts until checked by hand."
            : item.polarity === "ASSUMES_FALSE"
              ? `Explored what would happen if ${conjectureType} failed (such as Siegel zeros existing). Once ${conjectureType} holds, that premise never occurs.`
              : item.plainImpactUpgrade,
      authorAlertOpen:
        conjectureType === "MENTION_ONLY"
          ? "Mentions RH/GRH in passing; main theorem does not depend on it."
          : conjectureType === "DENSITY_BOUND"
            ? "Already proved unconditionally — does not wait on any Riemann Hypothesis proof."
            : conjectureType === "UNCLEAR"
              ? "Paper says 'GRH' without stating whether Dirichlet L-functions suffice or number-field Dedekind zeta functions are required."
              : item.polarity === "ASSUMES_FALSE"
                ? `A 'what-if' theorem that only activates if ${conjLabel} turns out to be false.`
                : `Conditional on ${conjLabel}.${item.hasUnconditionalFallback ? ` Without it: ${item.plainFallbackNote}` : ""}`,
      authorAlertFalsifiedOrVacuous:
        item.polarity === "ASSUMES_FALSE"
          ? `Counterfactual activates: because ${conjLabel} fails in this scenario, this paper's conclusion holds.`
          : item.hasUnconditionalFallback
            ? `Conditional upgrade fails, reverting to the unconditional baseline: ${item.plainFallbackNote}`
            : `Blocked: relies on ${conjLabel}, with no unconditional backup version stated.`,
      agentTrapNote:
        conjectureType === "MENTION_ONLY"
          ? "Mention-only trap: full-text keyword search matched RH/GRH, but the paper's theorems are unconditional."
          : conjectureType === "DENSITY_BOUND"
            ? "Already unconditional — naive scrapers mislabel this as newly proved by RH."
            : conjectureType === "UNCLEAR"
              ? "Ambiguous 'GRH' trap: text writes 'GRH' without disambiguating Dirichlet L(s, chi) from Dedekind zeta_K(s)."
              : item.polarity === "ASSUMES_FALSE"
                ? `Polarity trap: assumes ${conjectureType} fails, so proving it retires this route.`
                : conjectureType === "BEYOND_DIRICHLET"
                  ? "Scope trap: requires Dedekind, Hecke, Artin, or automorphic L-functions beyond Dirichlet GRH, so the checked Nov 20 archive does not settle it."
                  : item.hasUnconditionalFallback
                    ? "Fallback trap: sharpens a runtime or error bound where a weaker unconditional proof already exists."
                    : `Direct ${conjectureType} dependency.`,
    });
  }

  return out;
}

export function adaptCorpusItems(excludeKeys: Set<string>): TheoremRecord[] {
  return adaptPoolItems(ARXIV_CORPUS as unknown as PoolCorpusItem[], excludeKeys);
}
