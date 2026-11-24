import {
  adaptCorpusItems,
  adaptPoolItems,
  AGENT_LENS_CONV_BASE,
  type PoolCorpusItem,
} from "./corpus-adapter";
import top100EmbedRaw from "./top100-embed-corpus.json";

export type TruthState = "OPEN" | "TRUE" | "FALSE";

export type ConjectureType =
  | "RH"
  | "GRH_DIRICHLET"
  | "BEYOND_DIRICHLET"
  | "UNCLEAR"
  | "DENSITY_BOUND"
  | "MENTION_ONLY";

export type Polarity = "ASSUMES_TRUE" | "ASSUMES_FALSE";
export type Severity = "CORE_BLOCKER" | "SHARPENS_BOUND";
export type ArxivCategory = "math.NT" | "cs.CC" | "cs.CR";
export type TopicBucket =
  | "Primes & Number Theory"
  | "Algorithms & Complexity"
  | "Cryptography & Security"
  | "Algebra, Knots & Quantum";

export type HarvestSource =
  | "arxiv_abstract"
  | "openalex_fulltext"
  | "anchor_citations"
  | "curated_classics"
  | "attempt1_seed";

export type ImportanceTier = "TOP_100" | "TOP_500" | "TAIL";
export type EvidenceTier = "fulltext" | "abstract_only" | "curated_primary";

export type PresetId =
  | "checked_nov24"
  | "pre_nov20_open"
  | "rh_only"
  | "full_ladder"
  | "siegel_zero_twist"
  | "rh_false";

export type OutcomeKind =
  | "UPGRADED_UNCONDITIONAL"
  | "BOUND_TIGHTENED"
  | "STILL_CONDITIONAL"
  | "VACUOUS_OR_SUPERSEDED"
  | "HYPOTHESIS_FALSIFIED"
  | "MENTION_ONLY_UNCHANGED";

export type PlainScopeGroup =
  | "COVERED"
  | "BEYOND"
  | "UNCLEAR"
  | "ALREADY_PROVEN"
  | "MENTION_ONLY";

export interface WorldState {
  rh: TruthState;
  grhDirichlet: TruthState;
  beyondDirichlet: TruthState;
  siegelZero: boolean;
  guthMaynard2024: boolean;
  alpogeFurman2026: boolean;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: number;
}

export interface MachineCheckedLeanBadge {
  verified: boolean;
  verifierUrl: string;
  note: string;
}

export interface TheoremRecord {
  id: string;
  shortNodeTitle: string;
  arxivId?: string;
  doi?: string;
  arxivOrDoi: string;
  url: string;
  title: string;
  authors: string;
  yearLabel: string;
  yearNumeric?: number;
  category: ArxivCategory;
  primarySubcategory?: string;
  topicBucket?: TopicBucket;
  plainSummary?: string;
  isFeatured?: boolean;
  isNamedLandmark?: boolean;
  citedByCount?: number | null;
  importanceTier?: ImportanceTier;
  foundBySources?: HarvestSource[];
  evidenceTier?: EvidenceTier;
  quoteLocator?: string;
  machineCheckedLean?: MachineCheckedLeanBadge;
  agentLensUrl?: string;
  theoremLabel: string;
  conjectureType: ConjectureType;
  polarity: Polarity;
  severity: Severity;
  hasUnconditionalFallback: boolean;
  fallbackSummary: string;
  hopDepth: 1 | 2;
  upstreamIds: string[];
  extractedQuote: string;
  confidenceScore: number;
  latexBefore: string[];
  latexAfterUpgrade: string[];
  latexAfterFallbackOrVacuous: string[];
  authorAlertUpgrade: string;
  authorAlertOpen: string;
  authorAlertFalsifiedOrVacuous: string;
  agentTrapNote: string;
}

export interface EvaluatedTheorem {
  outcome: OutcomeKind;
  badgeLabel: string;
  shortTag: string;
  tone: "emerald" | "sky" | "amber" | "stone" | "rose";
  headline: string;
  diffLines: DiffLine[];
  additions: number;
  deletions: number;
}

export function resolvePresetId(raw: string | null | undefined): PresetId {
  if (!raw) return "checked_nov24";
  if (raw === "alpoge_rh_grh" || raw === "checked_nov24") return "checked_nov24";
  if (raw === "nov20_live" || raw === "pre_nov20_open") return "pre_nov20_open";
  if (raw === "rh_only") return "rh_only";
  if (raw === "full_rh_grh_erh" || raw === "full_ladder") return "full_ladder";
  if (raw === "siegel_zero_twist") return "siegel_zero_twist";
  if (raw === "rh_false") return "rh_false";
  return "checked_nov24";
}

export function plainScopeGroup(t: TheoremRecord): PlainScopeGroup {
  if (t.conjectureType === "MENTION_ONLY") return "MENTION_ONLY";
  if (t.conjectureType === "DENSITY_BOUND") return "ALREADY_PROVEN";
  if (t.conjectureType === "UNCLEAR") return "UNCLEAR";
  if (t.conjectureType === "BEYOND_DIRICHLET") return "BEYOND";
  return "COVERED";
}

export const PLAIN_SCOPE_LABELS: Record<PlainScopeGroup, string> = {
  COVERED: "Covered by the checked proof",
  BEYOND: "Needs the number-field version, still open",
  UNCLEAR: "Paper doesn't say which",
  ALREADY_PROVEN: "Already proven without it",
  MENTION_ONLY: "Only mentions it",
};

export function outcomeStyle(outcome: OutcomeKind): {
  shortLabel: string;
  badge: string;
} {
  switch (outcome) {
    case "UPGRADED_UNCONDITIONAL":
      return {
        shortLabel: "Becomes Proven",
        badge: "bg-emerald-100 text-emerald-950 border-emerald-300",
      };
    case "BOUND_TIGHTENED":
      return {
        shortLabel: "Faster / Known",
        badge: "bg-sky-100 text-sky-950 border-sky-300",
      };
    case "STILL_CONDITIONAL":
      return {
        shortLabel: "Still Open",
        badge: "bg-amber-100 text-amber-950 border-amber-300",
      };
    case "VACUOUS_OR_SUPERSEDED":
      return {
        shortLabel: "Retired 'If-False'",
        badge: "bg-rose-100 text-rose-950 border-rose-300",
      };
    case "HYPOTHESIS_FALSIFIED":
      return {
        shortLabel: "Hypothesis Disproven",
        badge: "bg-rose-100 text-rose-950 border-rose-300",
      };
    case "MENTION_ONLY_UNCHANGED":
      return {
        shortLabel: "Only Mentions It",
        badge: "bg-stone-100 text-stone-700 border-stone-300",
      };
  }
}

export const PRESETS: Array<{
  id: PresetId;
  label: string;
  shortLabel: string;
  description: string;
  state: WorldState;
}> = [
  {
    id: "checked_nov24",
    label: "Today: RH + Dirichlet GRH Checked in Lean",
    shortLabel: "Checked Scope (RH + Dirichlet GRH)",
    description:
      "Current verified scope as of Nov 24, 2026: Lean FRO, the Mathlib Initiative, and independent kernels (nanoda, con-leche, Comparator) certified RH and Dirichlet GRH; human peer review is still ahead. Dedekind, Hecke, Artin, and automorphic L-functions were not checked and remain open.",
    state: {
      rh: "TRUE",
      grhDirichlet: "TRUE",
      beyondDirichlet: "OPEN",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "pre_nov20_open",
    label: "Before Nov 20: All Rungs Open",
    shortLabel: "Before Nov 20 (All Open)",
    description:
      "Baseline before Nov 20, 2026 (or institutional Clay Prize status until journal publication and peer review finish): classical RH, Dirichlet GRH, and number-field ERH are all treated as open assumptions.",
    state: {
      rh: "OPEN",
      grhDirichlet: "OPEN",
      beyondDirichlet: "OPEN",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "rh_only",
    label: "If Only Classical RH Held",
    shortLabel: "Classical RH Only",
    description:
      "Suppose only the 1859 Riemann Hypothesis for zeta(s) held, without Dirichlet GRH. Prime-counting and prime-gap theorems lock in, while deterministic primality bounds and modular-arithmetic algorithms stay conditional.",
    state: {
      rh: "TRUE",
      grhDirichlet: "OPEN",
      beyondDirichlet: "OPEN",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "full_ladder",
    label: "If Number-Field ERH Also Holds",
    shortLabel: "Full Ladder (RH + Dirichlet + Number Fields)",
    description:
      "Suppose the method extends to Dedekind zeta, Hecke, and Artin L-functions over general number fields. Unlocks Artin's primitive-root conjecture, effective Chebotarev, Koiran's Nullstellensatz, and Wesolowski's SQIsign equivalence.",
    state: {
      rh: "TRUE",
      grhDirichlet: "TRUE",
      beyondDirichlet: "TRUE",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "siegel_zero_twist",
    label: "Counterfactual: Dirichlet GRH Fails (Siegel Zeros)",
    shortLabel: "What If Siegel Zeros Exist?",
    description:
      "Counterfactual where classical RH holds while Dirichlet GRH fails via Landau-Siegel zeros near s = 1. Conditional GRH algorithms break, while 'if Siegel zeros exist' papers (including Heath-Brown's Twin Primes route) activate.",
    state: {
      rh: "TRUE",
      grhDirichlet: "FALSE",
      beyondDirichlet: "FALSE",
      siegelZero: true,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "rh_false",
    label: "Counterfactual: Classical RH Disproved",
    shortLabel: "If RH Fails",
    description:
      "Suppose an off-line zero disproves classical RH (and therefore Dirichlet GRH and number-field ERH too). Conditional theorems fail or revert to unconditional backup bounds, while 2024-2026 unconditional zero-density theorems stand.",
    state: {
      rh: "FALSE",
      grhDirichlet: "FALSE",
      beyondDirichlet: "FALSE",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
];

export const CONJECTURE_ROOTS: Array<{
  id: string;
  shortTitle: string;
  subtitle: string;
  key: "rh" | "grhDirichlet" | "beyondDirichlet" | "unclear" | "partial" | "mention";
}> = [
  {
    id: "ROOT_RH",
    shortTitle: "RH · Classical Zeta (1859)",
    subtitle: "Prime counting & gaps — machine-checked",
    key: "rh",
  },
  {
    id: "ROOT_GRH_DIRICHLET",
    shortTitle: "Dirichlet GRH · Modular Arithmetic",
    subtitle: "Primes in progressions & Miller-Bach — machine-checked",
    key: "grhDirichlet",
  },
  {
    id: "ROOT_BEYOND_DIRICHLET",
    shortTitle: "Beyond Dirichlet · Number Fields & Hecke",
    subtitle: "Dedekind zeta, Chebotarev, Artin — still open",
    key: "beyondDirichlet",
  },
  {
    id: "ROOT_UNCLEAR",
    shortTitle: "Ambiguous 'GRH' · Unspecified Scope",
    subtitle: "Paper writes 'GRH' without saying which",
    key: "unclear",
  },
  {
    id: "ROOT_PARTIAL",
    shortTitle: "Already Proven Bounds",
    subtitle: "No conjecture needed",
    key: "partial",
  },
  {
    id: "ROOT_MENTION",
    shortTitle: "Only Mentions It",
    subtitle: "Main theorem is unconditional",
    key: "mention",
  },
];

const SUTHERLAND_VERIFIER_URL = "https://math.mit.edu/~drew/grh/";

const RAW_LANDMARK_THEOREMS: TheoremRecord[] = [
  {
    id: "P01",
    shortNodeTitle: "Schoenfeld · Explicit pi(x)",
    doi: "10.1090/s0025-5718-1976-0457374-x",
    arxivOrDoi: "doi:10.1090/S0025-5718-1976-0457374-X",
    url: "https://doi.org/10.1090/S0025-5718-1976-0457374-X",
    title: "Sharper bounds for the Chebyshev functions theta(x) and psi(x). II",
    authors: "Lowell Schoenfeld",
    yearLabel: "1976",
    category: "math.NT",
    theoremLabel: "Theorem 10 & Cor. 1",
    conjectureType: "RH",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Unconditional zero-free regions (Dusart / Mossinghoff-Trudgian) still bound |pi(x) - Li(x)| <= O(x exp(-c sqrt(log x))).",
    hopDepth: 1,
    upstreamIds: ["ROOT_RH"],
    extractedQuote:
      "If the Riemann hypothesis is true, then |pi(x) - Li(x)| < sqrt(x) log(x) / (8 pi) for all x >= 2657.",
    quoteLocator: "Corollary 1, p. 339",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{corollary}[Schoenfeld 1976, Conditional on RH]",
      "  Assume the Riemann Hypothesis.",
      "  For all x >= 2657, |\\pi(x) - \\mathrm{Li}(x)| < \\frac{\\sqrt{x}\\log x}{8\\pi}.",
      "\\end{corollary}",
    ],
    latexAfterUpgrade: [
      "\\begin{corollary}[Schoenfeld 1976, Unconditional via RH]",
      "  For all x >= 2657, |\\pi(x) - \\mathrm{Li}(x)| < \\frac{\\sqrt{x}\\log x}{8\\pi}.",
      "\\end{corollary}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{corollary}[Fallback: Classical Zero-Free Region]",
      "  % Square-root error term unavailable without RH;",
      "  |\\pi(x) - \\mathrm{Li}(x)| \\ll x \\exp(-c\\sqrt{\\log x}).",
      "\\end{corollary}",
    ],
    authorAlertUpgrade:
      "Covered by classical RH: Corollary 1 drops its RH hypothesis, locking in |pi(x) - Li(x)| < sqrt(x) log(x) / (8 pi) for all x >= 2657.",
    authorAlertOpen:
      "Conditional on classical RH; without it, explicit prime tables rely on wider zero-free-region error terms.",
    authorAlertFalsifiedOrVacuous:
      "RH falsified: square-root error O(x^{1/2} log x) fails at sup Re(rho) > 1/2, reverting to classical zero-free regions.",
    agentTrapNote:
      "Has unconditional de la Vallee Poussin / Mossinghoff-Trudgian fallback; RH sharpens the error term rather than proving the Prime Number Theorem.",
  },
  {
    id: "P02",
    shortNodeTitle: "Lagarias · Divisor Sum Bound",
    arxivId: "math/0008177",
    arxivOrDoi: "arXiv:math/0008177",
    url: "https://arxiv.org/abs/math/0008177",
    title: "An Elementary Problem Equivalent to the Riemann Hypothesis",
    authors: "Jeffrey C. Lagarias",
    yearLabel: "2002",
    category: "math.NT",
    theoremLabel: "Theorem 1.1",
    conjectureType: "RH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Exact biconditional equivalence with RH (building on Robin 1984 and Schoenfeld 1976); no weaker unconditional inequality of this form holds for all n.",
    hopDepth: 2,
    upstreamIds: ["P01"],
    extractedQuote:
      "Show, for each n >= 1, that sum_{d|n} d <= H_n + exp(H_n) log(H_n), with equality only for n = 1. Theorem 1.1: Problem E is equivalent to the Riemann hypothesis.",
    quoteLocator: "Theorem 1.1, p. 1",
    machineCheckedLean: {
      verified: true,
      verifierUrl: SUTHERLAND_VERIFIER_URL,
      note: "Machine-checked with zero hypotheses in Lean 4 by Andrew Sutherland (combining Alpöge's archive with kimihiro64/Robin1984; uses only propext, Classical.choice, Quot.sound).",
    },
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Lagarias 2002, Equivalent to RH]",
      "  RH holds iff for every integer n >= 1,",
      "  \\sigma(n) \\le H_n + \\exp(H_n)\\log(H_n).",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Lagarias Inequality — Machine-Checked in Lean 4]",
      "  For every integer n >= 1,",
      "  \\sigma(n) \\le H_n + \\exp(H_n)\\log(H_n), with equality iff n = 1.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Disproved Infinitely Often]",
      "  Because RH is false, there exist infinitely many colossally abundant n",
      "  with \\sigma(n) > H_n + \\exp(H_n)\\log(H_n).",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Already compiled as a hypothesis-free Lean 4 theorem (`lagarias_inequality`) in Sutherland's verification suite without mentioning zeta(s) in the elaborated statement.",
    authorAlertOpen:
      "Exact biconditional with classical RH for every integer n >= 1.",
    authorAlertFalsifiedOrVacuous:
      "Because Theorem 1.1 is an iff equivalence, falsifying RH implies infinitely many counterexample integers n violate Lagarias's divisor bound.",
    agentTrapNote: "Exact iff equivalence with classical RH; already machine-checked unconditionally in Lean 4.",
  },
  {
    id: "P17",
    shortNodeTitle: "Robin · Divisor Inequality",
    doi: "10.1016/0021-8693(84)90103-0",
    arxivOrDoi: "doi:10.1016/0021-8693(84)90103-0",
    url: "https://doi.org/10.1016/0021-8693(84)90103-0",
    title: "Grandes valeurs de la fonction somme des diviseurs et hypothese de Riemann",
    authors: "Guy Robin",
    yearLabel: "1984",
    category: "math.NT",
    theoremLabel: "Theoreme 1",
    conjectureType: "RH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Unconditionally Robin proved sigma(n) < e^gamma n log log n + 0.6483 n / log log n for n >= 3; dropping the remainder for all n > 5040 is equivalent to RH.",
    hopDepth: 1,
    upstreamIds: ["ROOT_RH"],
    extractedQuote:
      "The Riemann Hypothesis is true if and only if sigma(n) < e^gamma n log log n for every integer n > 5040.",
    quoteLocator: "Theorem 1 (1984) & Sutherland ArithChallenge.lean",
    machineCheckedLean: {
      verified: true,
      verifierUrl: SUTHERLAND_VERIFIER_URL,
      note: "Machine-checked with zero hypotheses in Lean 4 (`robin_inequality`) by combining Alpöge's archive with kimihiro64/Robin1984.",
    },
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Robin 1984, Equivalent to RH]",
      "  RH holds iff for all n > 5040, \\sigma(n) < e^{\\gamma} n \\log\\log n.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Robin's Inequality — Machine-Checked in Lean 4]",
      "  For every integer n > 5040, \\sigma(n) < e^{\\gamma} n \\log\\log n.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Disproved for Infinitely Many n > 5040]",
      "  \\exists^\\infty n > 5040 \\text{ with } \\sigma(n) \\ge e^{\\gamma} n \\log\\log n.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Compiled as a hypothesis-free Lean 4 theorem (`robin_inequality`) by Andrew Sutherland using only standard axioms and no zeta-function mention in the target statement.",
    authorAlertOpen: "Equivalent to classical RH for all n > 5040.",
    authorAlertFalsifiedOrVacuous:
      "Falsifying RH forces infinitely many integers n > 5040 to violate Robin's divisor bound.",
    agentTrapNote: "Biconditional with classical RH; directly verified in Lean 4 during the Nov 21-23 checks.",
  },
  {
    id: "P03",
    shortNodeTitle: "Carneiro-MS · Prime Gaps",
    arxivId: "1708.04122",
    arxivOrDoi: "arXiv:1708.04122",
    url: "https://arxiv.org/abs/1708.04122",
    title: "Fourier optimization and prime gaps",
    authors: "E. Carneiro, M. B. Milinovich, K. Soundararajan",
    yearLabel: "2019",
    category: "math.NT",
    theoremLabel: "Theorem 1.1",
    conjectureType: "RH",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Unconditional worst-case gap is p_{n+1} - p_n << p_n^{0.525} (Baker-Harman-Pintz 2001), with almost-all short intervals at x^{17/30+o(1)} (Guth-Maynard 2024).",
    hopDepth: 1,
    upstreamIds: ["ROOT_RH"],
    extractedQuote:
      "Assuming the Riemann hypothesis, we prove that p_{n+1} - p_n < (22/25) sqrt(p_n) log(p_n) for all primes p_n >= 3.",
    quoteLocator: "Theorem 1.1, p. 2",
    confidenceScore: 0.98,
    latexBefore: [
      "\\begin{theorem}[Carneiro-Milinovich-Soundararajan 2019]",
      "  Assuming the Riemann Hypothesis, for all p_n >= 3:",
      "  p_{n+1} - p_n < \\frac{22}{25}\\sqrt{p_n}\\log p_n.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Carneiro-Milinovich-Soundararajan 2019 — Unconditional]",
      "  For all primes p_n >= 3:",
      "  p_{n+1} - p_n < \\frac{22}{25}\\sqrt{p_n}\\log p_n.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: Baker-Harman-Pintz 2001]",
      "  For sufficiently large primes p_n (ineffective threshold):",
      "  p_{n+1} - p_n \\ll p_n^{0.525}.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Covered by classical RH: Theorem 1.1 drops its RH assumption, tightening worst-case prime gaps from x^{0.525} to (22/25) x^{0.5} log x for all primes >= 3.",
    authorAlertOpen:
      "Conditional on classical RH; upstream dependency for Visser (arXiv:2610.27830).",
    authorAlertFalsifiedOrVacuous:
      "RH falsified: explicit (22/25) sqrt(p_n) log p_n bound loses its proof; worst-case prime gaps revert to Baker-Harman-Pintz x^{0.525}.",
    agentTrapNote:
      "Sharpens Baker-Harman-Pintz x^{0.525} unconditional bound; note RH still leaves Legendre's and Cramer's conjectures open.",
  },
  {
    id: "P04",
    shortNodeTitle: "Visser · Effective BHP Primes",
    arxivId: "2610.27830",
    arxivOrDoi: "arXiv:2610.27830",
    url: "https://arxiv.org/abs/2610.27830",
    title: "Primes in short intervals assuming the Riemann hypothesis",
    authors: "Matt Visser",
    yearLabel: "Oct 2026",
    category: "math.NT",
    theoremLabel: "Theorem 1 & Theorem 2",
    conjectureType: "RH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Baker-Harman-Pintz (2001) holds unconditionally only for 'sufficiently large x' with no known explicit threshold x_*.",
    hopDepth: 2,
    upstreamIds: ["P03"],
    extractedQuote:
      "Theorem 1: Assuming the Riemann hypothesis, for x >= 3.5 * 10^90 there is at least one prime in the interval [x, x + x^{1/2 + 1/40}].",
    quoteLocator: "Abstract & Theorem 1",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Visser, Oct 2026 — arXiv:2610.27830]",
      "  Contingent upon validity of the Riemann Hypothesis (via CMS 2019),",
      "  for all x >= 3.5 \\times 10^{90}, [x, x + x^{21/40}] contains a prime.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Visser, Oct 2026 — Upgraded Unconditional]",
      "  For all x >= 3.5 \\times 10^{90}, [x, x + x^{21/40}] contains a prime,",
      "  and for all x >= 1, [x, x + x^{1/2 + 1/15.831}] contains a prime.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Broken Effective Cutoff]",
      "  % Explicit x >= 3.5e90 crossover relied on CMS (1708.04122);",
      "  % Baker-Harman-Pintz reverts to ineffective x >= x_0.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Covered by classical RH (Hop 2 via 1708.04122): Theorems 1-3 upgrade to unconditional, making Baker-Harman-Pintz explicitly effective at x >= 3.5e90.",
    authorAlertOpen:
      "Oct 2026 preprint waiting directly on classical RH via Carneiro-Milinovich-Soundararajan.",
    authorAlertFalsifiedOrVacuous:
      "Without RH, the CMS crossover calculation at x_* = 3.48e90 breaks; Baker-Harman-Pintz remains ineffective.",
    agentTrapNote: "2-hop transitive classical RH dependency via 1708.04122; no unconditional explicit cutoff exists for BHP.",
  },
  {
    id: "P05",
    shortNodeTitle: "Guth-Maynard · Zero Density",
    arxivId: "2405.20552",
    arxivOrDoi: "arXiv:2405.20552",
    url: "https://arxiv.org/abs/2405.20552",
    title: "New large value estimates for Dirichlet polynomials",
    authors: "Larry Guth, James Maynard",
    yearLabel: "2024 (v2 Apr 2026)",
    category: "math.NT",
    theoremLabel: "Theorem 1.2",
    conjectureType: "DENSITY_BOUND",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Already unconditional! Broke Ingham's 1940 barrier near sigma = 3/4. Under RH = True, N(sigma, T) = 0 for all sigma > 1/2, while Theorem 1.1 (Dirichlet polynomials) remains an independent tool.",
    hopDepth: 1,
    upstreamIds: ["ROOT_PARTIAL"],
    extractedQuote:
      "Combining this with Ingham's estimate when sigma <= 7/10, we obtain N(sigma, T) <= T^{30(1-sigma)/13 + o(1)} and primes in [x, x + x^{17/30 + o(1)}].",
    quoteLocator: "Section 1, Theorem 1.2",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Guth-Maynard 2024 — Already Unconditional]",
      "  For \\sigma > 1/2, N(\\sigma, T) \\le T^{30(1-\\sigma)/13 + o(1)}.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Superseded on Zeta Zeros; Thm 1.1 Retained]",
      "  Under RH, N(\\sigma, T) = 0 identically for all \\sigma > 1/2.",
      "  % Theorem 1.1 large-value Dirichlet polynomial bound stays active.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Guth-Maynard 2024 — Primary Unconditional Shield]",
      "  Even if RH fails, off-line zeros satisfy N(\\sigma, T) \\le T^{30(1-\\sigma)/13 + o(1)}.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "On zeta zeros, RH = True sets N(sigma, T) = 0 for every sigma > 1/2, superseding Theorem 1.2's zero-density bound while keeping Theorem 1.1's Dirichlet polynomial estimate intact.",
    authorAlertOpen:
      "Unconditionally proven (v2 Apr 2026); caps potential off-line zeta zeros without any hypothesis.",
    authorAlertFalsifiedOrVacuous:
      "Because Guth-Maynard is unconditional, Theorem 1.2 still bounds how many off-line counterexamples can exist up to height T.",
    agentTrapNote:
      "Already unconditional; Theorem 1.2 zero-density is superseded by RH, whereas Theorem 1.1 large-value Dirichlet polynomial bound stays useful.",
  },
  {
    id: "P06",
    shortNodeTitle: "Alpöge-Furman · 67.25% Simple",
    arxivId: "2608.13637",
    arxivOrDoi: "arXiv:2608.13637",
    url: "https://arxiv.org/abs/2608.13637",
    title: "More than two thirds of the zeros of the Riemann zeta function are simple and on the critical line",
    authors: "Levent Alpöge, Ralph Furman (arg. by Claude)",
    yearLabel: "Aug 2026",
    category: "math.NT",
    theoremLabel: "Theorem 1.1",
    conjectureType: "DENSITY_BOUND",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Already unconditional & Lean-verified in anthropics/formal-math! Subtle catch: RH proves 100% of zeros lie on Re(s)=1/2, yet RH alone does NOT rule out multiple zeros — so >= 67.25% simplicity stays live.",
    hopDepth: 2,
    upstreamIds: ["P05"],
    extractedQuote:
      "We prove unconditionally that at least two thirds of the nontrivial zeros of the Riemann zeta function, counted with multiplicity, are simple and lie on the critical line (0.6725 with Montgomery-Taylor).",
    quoteLocator: "Abstract & Theorem 1.1",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Alpöge-Furman + Claude, Aug 2026 — Lean 4 Verified]",
      "  \\liminf_{T\\to\\infty} N_0^s(T)/N(T) \\ge 0.67250\\ldots",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Line Share -> 100%; Simplicity >= 67.25% Retained]",
      "  Under RH, N_0(T)/N(T) = 1, while simple-zero share N_0^s(T)/N(T) >= 0.6725",
      "  remains non-redundant unless Simple Zeros Conjecture is also proved.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Alpöge-Furman + Claude, Aug 2026 — Intact]",
      "  Already Comparator-verified in Lean 4: >= 67.25% of zeros are simple & on-line.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "RH upgrades the critical-line fraction from 67.25% to 100%, yet RH alone permits double zeros on Re(s)=1/2 — so this paper's >= 67.25% simplicity theorem still does real work.",
    authorAlertOpen:
      "Already passed Lean 4 Comparator in Aug 2026 (anthropics/formal-math/zeta23).",
    authorAlertFalsifiedOrVacuous:
      "Even if classical RH failed, August's Lean-verified 67.25% theorem remains unconditionally valid.",
    agentTrapNote:
      "TRAP (`simplicity-vs-location-blur`): Classical RH places all zeros on Re(s)=1/2, NOT simple multiplicity 1! So >= 67.25% simplicity is NOT superseded by RH alone.",
  },
  {
    id: "P07",
    shortNodeTitle: "Suzuki · Zeta Detects GRH",
    arxivId: "2508.17701",
    arxivOrDoi: "arXiv:2508.17701",
    url: "https://arxiv.org/abs/2508.17701",
    title: "Detecting zeros of Dirichlet L-functions via the Riemann zeta-function",
    authors: "Masatoshi Suzuki",
    yearLabel: "Aug 2025",
    category: "math.NT",
    theoremLabel: "Theorem 1",
    conjectureType: "RH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Requires classical RH to express Dirichlet L-function zero ordinates cleanly through vertical sums over zeta(s) ordinates.",
    hopDepth: 2,
    upstreamIds: ["P01"],
    extractedQuote:
      "Assume RH... Then the GRH for all Dirichlet L-functions L(s, chi) mod q is equivalent to the asymptotic formula Z(x; t, a/q_1) = ... + O(x^epsilon).",
    quoteLocator: "Theorem 1, Section 1",
    confidenceScore: 0.96,
    latexBefore: [
      "\\begin{theorem}[Suzuki 2025 — Conditional Bridge]",
      "  Assume RH. Then GRH mod q is equivalent to the vertical zeta-zero",
      "  asymptotic Z(x; t, a/q_1) = main_term + O(x^\\varepsilon).",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Suzuki 2025 — Unconditional Bridge to Dirichlet GRH]",
      "  Dirichlet GRH mod q is unconditionally equivalent to the vertical zeta-zero",
      "  asymptotic Z(x; t, a/q_1) = main_term + O(x^\\varepsilon).",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Bridge Inactive]",
      "  % Off-line zeta zeros break the clean ordinate phase sum in (1.4).",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Covered under classical RH alone: Theorem 1 becomes an unconditional bridge reducing Dirichlet GRH mod q to vertical spacing sums of zeta(s) zeros.",
    authorAlertOpen: "Waiting on classical RH.",
    authorAlertFalsifiedOrVacuous:
      "Off-line zeros of zeta(s) invalidate the single-line ordinate representation in Theorem 1.",
    agentTrapNote:
      "Theorem 1 only assumes classical RH to establish an equivalence with Dirichlet GRH.",
  },
  {
    id: "P08",
    shortNodeTitle: "Miller-Bach · Fast Primality",
    doi: "10.1090/s0025-5718-1990-1023756-8",
    arxivOrDoi: "doi:10.1090/S0025-5718-1990-1023756-8",
    url: "https://doi.org/10.1090/S0025-5718-1990-1023756-8",
    title: "Explicit bounds for primality testing and related problems",
    authors: "Gary L. Miller (1976), Eric Bach (1990)",
    yearLabel: "1990",
    category: "cs.CC",
    theoremLabel: "Theorem 2 & Miller Det. Test",
    conjectureType: "GRH_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "AKS (2002) already proved PRIMES in P unconditionally in O~(log^6 n), and randomized Miller-Rabin runs in O~(k log^2 n); Dirichlet GRH upgrades deterministic 2(ln n)^2 Miller testing to O~(log^4 n).",
    hopDepth: 1,
    upstreamIds: ["ROOT_GRH_DIRICHLET"],
    extractedQuote:
      "By results of Ankeny, Montgomery, and Bach (1990), GRH for all Dirichlet L-functions implies each proper subgroup of (Z/mZ)* misses an integer <= 2(log m)^2.",
    quoteLocator: "Bach 1990 Theorem 2 / MathOverflow Q17209 (f)",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Miller 1976 / Bach 1990 — Conditional on Dirichlet GRH]",
      "  Assuming Dirichlet GRH, testing bases a <= 2(\\ln n)^2 deterministically",
      "  decides primality in \\tilde{O}((\\log n)^4) time.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Deterministic Miller Test — Unconditional O~(log^4 n)]",
      "  Testing bases a <= 2(\\ln n)^2 deterministically decides primality",
      "  for all n in \\tilde{O}((\\log n)^4) time, beating AKS O~((\\log n)^6).",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: AKS 2002 / Randomized Miller-Rabin]",
      "  % Witness bound 2(ln n)^2 unproved; PRIMES in P still holds via AKS.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Covered by Dirichlet GRH: deterministic Miller primality testing up to 2(ln n)^2 becomes unconditionally sound in O~(log^4 n) (sharpening unconditional AKS).",
    authorAlertOpen:
      "Still conditional if only classical RH holds; needs Dirichlet GRH.",
    authorAlertFalsifiedOrVacuous:
      "Dirichlet GRH falsified: deterministic witness cutoff 2(ln n)^2 loses its proof, while PRIMES in P survives unconditionally via AKS (2002).",
    agentTrapNote:
      "TRAP (`missed-unconditional-fallback`): Covered by Dirichlet GRH, AND PRIMES in P was already unconditional via AKS 2002.",
  },
  {
    id: "P09",
    shortNodeTitle: "Kuperberg · Knottedness in NP",
    arxivId: "1112.0845",
    arxivOrDoi: "arXiv:1112.0845",
    url: "https://arxiv.org/abs/1112.0845",
    title: "Knottedness is in NP, modulo GRH",
    authors: "Greg Kuperberg",
    yearLabel: "2014",
    category: "cs.CC",
    theoremLabel: "Theorem 1.1 & Theorem 3.3",
    conjectureType: "BEYOND_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Marc Lackenby (arXiv:1604.03778, pub. 2021) already proved Knottedness in NP unconditionally via Thurston norm! Kuperberg's algebraic SL(2, F_p) route invokes Koiran + Lagarias-Odlyzko effective Chebotarev (Dedekind zeta_K).",
    hopDepth: 2,
    upstreamIds: ["P14"],
    extractedQuote:
      "Theorem 3.2 [Lagarias-Odlyzko, Weinberger]: Assuming the generalized Riemann hypothesis [for Dedekind zeta functions via effective Chebotarev], Koiran's Nullstellensatz yields p with poly(n) bits.",
    quoteLocator: "main.tex Section 3, Theorems 3.1-3.3",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Kuperberg 2014 — Title Says GRH, Proof Uses Dedekind Chebotarev]",
      "  Assuming Dedekind GRH (via Koiran + Lagarias-Odlyzko), Knottedness \\in \\mathsf{NP}.",
      "  % Note: Lackenby (1604.03778) already proved Knottedness in NP unconditionally!",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Short Finite-Field Witness Route Unconditional]",
      "  Kuperberg's polynomial-bit prime p SL(2, \\mathbb{F}_p) representation certificate",
      "  holds unconditionally once Dedekind ERH clears (class membership already known via Lackenby).",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: Lackenby 2016/2021 — Unknot in NP cap coNP]",
      "  Knottedness \\in \\mathsf{NP} remains unconditionally true via normal surfaces.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Requires number-field ERH (Koiran -> Lagarias-Odlyzko effective Chebotarev), AND Knottedness in NP was already proved unconditionally by Lackenby (1604.03778).",
    authorAlertOpen:
      "Double trap caught in Attempt 2: title writes 'modulo GRH', but Section 3 invokes Lagarias-Odlyzko effective Chebotarev over number fields (still open under Dirichlet-only GRH). Meanwhile Lackenby already proved Knottedness in NP unconditionally.",
    authorAlertFalsifiedOrVacuous:
      "Even if number-field ERH fails, Knottedness in NP survives unconditionally via Lackenby (1604.03778).",
    agentTrapNote:
      "DOUBLE TRAP: Title/abstract say 'GRH', Section 3 cites Koiran + Lagarias-Odlyzko (Dedekind zeta_K, NOT Dirichlet GRH), AND Lackenby (1604.03778) already proved Knottedness in NP unconditionally.",
  },
  {
    id: "P10",
    shortNodeTitle: "Baldwin-Sivek · Torus Knots",
    arxivId: "1706.04424",
    arxivOrDoi: "arXiv:1706.04424",
    url: "https://arxiv.org/abs/1706.04424",
    title: "On the complexity of torus knot recognition",
    authors: "John A. Baldwin, Steven Sivek",
    yearLabel: "2017",
    category: "cs.CC",
    theoremLabel: "Theorem 1.1 & Theorem 1.3",
    conjectureType: "BEYOND_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "TORUS-KNOT in NP is unconditional (Thm 4.3), whereas TORUS-KNOT in coNP, SATELLITE-KNOT in NP, and HYPERBOLIC-KNOT in coNP rely on Koiran + Lagarias-Odlyzko effective Chebotarev (Dedekind ERH).",
    hopDepth: 2,
    upstreamIds: ["P09"],
    extractedQuote:
      "We remark that the generalized Riemann hypothesis is used in [Lagarias-Odlyzko, Weinberger] to provide an effective version of the Chebotarev density theorem, guaranteeing p has polynomially many digits.",
    quoteLocator: "torusknots.tex Section 5, after Theorem 5.2",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Baldwin-Sivek 2017 — Needs Effective Chebotarev (Dedekind ERH)]",
      "  Assuming Dedekind GRH/ERH: TorusKnot \\in \\mathsf{NP}\\cap\\mathsf{coNP},",
      "  SatelliteKnot \\in \\mathsf{NP}, and HyperbolicKnot \\in \\mathsf{coNP}.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Baldwin-Sivek 2017 — Unconditional Under Number-Field ERH]",
      "  Unconditionally: TorusKnot \\in \\mathsf{NP}\\cap\\mathsf{coNP},",
      "  SatelliteKnot \\in \\mathsf{NP}, and HyperbolicKnot \\in \\mathsf{coNP}.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Partial Survival: Only TorusKnot in NP]",
      "  % coNP certificate for non-torus knots and NP satellite witness break without Dedekind ERH.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Unlocks once number-field ERH clears: effective Chebotarev certifies polynomial-digit primes for SL_2(F_p) knot representations.",
    authorAlertOpen:
      "Corrected in Attempt 2: abstract says 'assuming GRH', but Section 5 explicitly invokes Lagarias-Odlyzko effective Chebotarev (Dedekind zeta_K), so Dirichlet GRH alone does NOT settle this paper.",
    authorAlertFalsifiedOrVacuous:
      "Without number-field ERH, only TorusKnot in NP (Thm 4.3) stands unconditionally.",
    agentTrapNote:
      "TRAP (`rh-grh-erh-conflated`): Abstract writes 'assuming GRH'; Section 5 explicitly remarks that GRH means Lagarias-Odlyzko effective Chebotarev (Dedekind zeta_K).",
  },
  {
    id: "P11",
    shortNodeTitle: "Pak-Robichaux · Schubert in PH",
    arxivId: "2412.02064",
    arxivOrDoi: "arXiv:2412.02064",
    url: "https://arxiv.org/abs/2412.02064",
    title: "Vanishing of Schubert Coefficients",
    authors: "Igor Pak, Colleen Robichaux",
    yearLabel: "Dec 2024 (v2 Aug 2026)",
    category: "cs.CC",
    theoremLabel: "Theorem 1.4",
    conjectureType: "BEYOND_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Without Dedekind ERH (via Parametric Hilbert's Nullstellensatz), it remains open whether Schubert coefficient vanishing {c^w_{u,v} =? 0} lies inside the Polynomial Hierarchy PH.",
    hopDepth: 2,
    upstreamIds: ["P14"],
    extractedQuote:
      "Theorem 1.4: SchubertVanishing is in coAM assuming GRH [Section 1.4 notes Dedekind ERH is the analytic input via Parametric Nullstellensatz].",
    quoteLocator: "Section 1.4 & Theorem 1.4",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Pak-Robichaux 2024/2026 — Conditional on Dedekind ERH]",
      "  Assuming ERH (Dedekind zeta functions), SchubertVanishing \\in \\mathsf{coAM} \\subseteq \\Sigma_2^{\\mathsf{P}}.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Pak-Robichaux 2024/2026 — Unconditional]",
      "  For all classical Lie types A, B, C, D, SchubertVanishing \\in \\mathsf{coAM} \\subseteq \\mathsf{PH}.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Reverts Outside Known PH]",
      "  % Without Dedekind ERH / effective Chebotarev, PH membership for {c^w_{u,v} = 0} is open.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Unlocks once number-field ERH clears: Schubert coefficient vanishing enters coAM (and PH) across Lie types A, B, C, D.",
    authorAlertOpen:
      "Still open under the checked Nov 20 archive: abstract writes 'assuming GRH', while Parametric Nullstellensatz prime-ideal bounds require Dedekind ERH.",
    authorAlertFalsifiedOrVacuous:
      "If Dedekind ERH fails, Parametric Nullstellensatz prime bounds lose polynomial bit-length, leaving SchubertVanishing outside proven PH.",
    agentTrapNote:
      "TRAP (`rh-grh-erh-conflated`): Abstract writes 'GRH', Section 1.4 traces the Nullstellensatz step to Dedekind ERH.",
  },
  {
    id: "P12",
    shortNodeTitle: "Wesolowski · SQIsign Equivalence",
    arxivId: "2111.01481",
    arxivOrDoi: "arXiv:2111.01481",
    url: "https://arxiv.org/abs/2111.01481",
    title: "The supersingular isogeny path and endomorphism ring problems are equivalent",
    authors: "Benjamin Wesolowski",
    yearLabel: "FOCS 2021",
    category: "cs.CR",
    theoremLabel: "Main Theorem & Theorem 3.1",
    conjectureType: "BEYOND_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Section 3 (`thm:primebinaryform`) invokes Lagarias-Odlyzko effective Chebotarev (`LO77`) to sample primes represented by a fixed binary quadratic form (ring-class / Hecke L-functions beyond Dirichlet GRH). Note: 2025 follow-up work (arXiv:2502.17010) built alternative unconditional isogeny foundations.",
    hopDepth: 2,
    upstreamIds: ["P13"],
    extractedQuote:
      "It is a classical consequence of the effective Chebotarev density theorem under GRH, due to Lagarias and Odlyzko [LO77]. Theorem [GRH]: If f is an integral, primitive, positive definite, binary quadratic form of discriminant D, pi_f(rho) = delta rho / (h(D) log rho) + O(rho^{1/2} log(|D| rho)).",
    quoteLocator: "paper.tex Section 3 (`sec:qfprimesampling`, Theorem `thm:primebinaryform`)",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Wesolowski, FOCS 2021 — Needs Effective Chebotarev (`LO77`)]",
      "  Assuming GRH (including Lagarias-Odlyzko for binary quadratic forms),",
      "  \\ell\\text{-IsogenyPath} \\equiv_{\\mathrm{PPT}} \\mathsf{EndRing}.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Wesolowski, FOCS 2021 — Unconditional Crypto Reduction]",
      "  \\ell\\text{-IsogenyPath} \\equiv_{\\mathrm{PPT}} \\mathsf{EndRing} unconditionally;",
      "  SQIsign's original equivalence drops its Chebotarev/GRH hypothesis.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Crypto Reduction Degrades to Heuristic]",
      "  % Ideal-to-prime preconditioning in Section 3 loses proven polynomial runtime.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Once number-field / ring-class ERH clears, Wesolowski's FOCS 2021 equivalence upgrades to unconditional — strengthening (never breaking) post-quantum isogeny reductions.",
    authorAlertOpen:
      "Corrected in Attempt 2: we initially counted SQIsign's FOCS 2021 equivalence as settled under 'GRH', but `paper.tex` Section 3 invokes Lagarias-Odlyzko (`LO77`) effective Chebotarev for primes represented by a binary quadratic form (beyond Dirichlet L-functions).",
    authorAlertFalsifiedOrVacuous:
      "If number-field GRH/ERH fails, Section 3's prime-ideal preconditioning loses its proven polynomial bound.",
    agentTrapNote:
      "DOUBLE TRAP: Doesn't break crypto (strengthens SQIsign), AND its 'assuming GRH' abstract hides a Section 3 Lagarias-Odlyzko effective Chebotarev call (`LO77`) beyond Dirichlet GRH.",
  },
  {
    id: "P13",
    shortNodeTitle: "Jao-MV · Hecke Isogeny Expanders",
    arxivId: "math/0411378",
    doi: "10.1007/s00145-008-9029-4",
    arxivOrDoi: "arXiv:math/0411378",
    url: "https://arxiv.org/abs/math/0411378",
    title: "Do All Elliptic Curves of the Same Order Have the Same Difficulty of Discrete Log? (Expander graphs based on GRH)",
    authors: "David Jao, Stephen D. Miller, Ramarathnam Venkatesan",
    yearLabel: "2005 / 2009",
    category: "cs.CR",
    theoremLabel: "Theorem 1.1 & Section 3.1",
    conjectureType: "BEYOND_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Under weaker Lindelöf bounds, random-walk ECDLP class-equivalence reduction degrades from polynomial time to subexponential time.",
    hopDepth: 1,
    upstreamIds: ["ROOT_BEYOND_DIRICHLET"],
    extractedQuote:
      "L-functions of these Hecke characters can be written as [eq. heckelfunc]... Generalized Riemann Hypothesis (GRH) for the L-functions (heckelfunc) [and modular form Hecke eigenforms].",
    quoteLocator: "jmv-arxiv-sep-02-2005.tex Section 3.1 (`heckelfunc`)",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Jao-Miller-Venkatesan 2005/2009 — Hecke / Modular GRH]",
      "  Assuming GRH for Hecke / modular-form L-functions, small-prime isogeny",
      "  Cayley walks mix in \\mathrm{poly}(\\log q) steps.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Jao-Miller-Venkatesan 2005/2009 — Unconditional Mixing]",
      "  Small-prime ray-class and ordinary isogeny Cayley graphs are rapid expanders.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: Subexponential Mixing]",
      "  % Poly-logarithmic spectral gap unproved without Hecke L-function GRH.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Unlocks once GRH extends to Hecke characters and weight-2 modular eigenforms.",
    authorAlertOpen:
      "Still open under the checked Nov 20 archive: Section 3.1 explicitly invokes GRH for Hecke character and modular-form L-functions, which Sutherland notes were not among the checked Lean statements.",
    authorAlertFalsifiedOrVacuous:
      "Without Hecke GRH, spectral gap bounds degrade to subexponential random-walk reductions.",
    agentTrapNote:
      "Scope trap: writes 'GRH' in title, but Section 3.1 uses Hecke character / modular-form L-functions (GL(2) / imaginary quadratic ray class), not Dirichlet L-functions.",
  },
  {
    id: "P14",
    shortNodeTitle: "Hooley-Weinberger · Artin & PID",
    doi: "10.1515/crll.1967.225.209",
    arxivOrDoi: "doi:10.1515/crll.1967.225.209",
    url: "https://doi.org/10.1515/crll.1967.225.209",
    title: "On Artin's conjecture (Hooley 1967) & Euclidean rings of algebraic integers (Weinberger 1973)",
    authors: "Christopher Hooley; Peter J. Weinberger",
    yearLabel: "1967 / 1973",
    category: "math.NT",
    theoremLabel: "Main Thm (Artin) & PID => Euclidean",
    conjectureType: "BEYOND_DIRICHLET",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Heath-Brown (1986) proved Artin's conjecture holds for all except at most 2 primes, yet NOT A SINGLE specific integer a (like a = 2) is unconditionally known! Murty-Harper proved PID => Euclidean only for unit rank >= 4.",
    hopDepth: 1,
    upstreamIds: ["ROOT_BEYOND_DIRICHLET"],
    extractedQuote:
      "In 1967, Hooley showed GRH for Dedekind zeta-functions of all number fields Q(a^{1/n}, zeta_n) implies Artin's primitive root conjecture; Weinberger (1973) used Dedekind GRH for Euclidean rings.",
    quoteLocator: "Hooley 1967 / MathOverflow Q17209 items (h) & (j)",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Hooley 1967 / Weinberger 1973 — Conditional on Dedekind ERH]",
      "  Assuming ERH for Kummer/Dedekind fields: Artin's primitive root asymptotic holds",
      "  for a = 2, 3, 5..., and every real quadratic PID (e.g. Z[sqrt(14)]) is Euclidean.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Artin's Conjecture & Weinberger's Theorem — Unconditional]",
      "  2 is a primitive root mod p for ~37.395% of primes p, and every number ring O_K",
      "  with class number 1 and infinite unit group is a Euclidean domain.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: Heath-Brown 1986 (At Most 2 Prime Exceptions)]",
      "  % Still cannot prove a = 2 is a primitive root infinitely often without Dedekind ERH!",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Unlocked once Dedekind ERH holds: Artin's constant 0.3739558... works for a = 2, and Z[sqrt(14)] is unconditionally Euclidean.",
    authorAlertOpen:
      "Still open under the checked Nov 20 archive! Both Hooley and Weinberger require Dedekind zeta functions of non-abelian Kummer extensions Q(zeta_q, a^{1/q}), not Dirichlet L-functions.",
    authorAlertFalsifiedOrVacuous:
      "Without Dedekind ERH, we still cannot prove that 2 is a primitive root for infinitely many primes.",
    agentTrapNote:
      "Headline discourse trap: viral explainers listed Artin's conjecture as settled on Nov 21, but Hooley's proof needs Dedekind zeta functions of Kummer fields.",
  },
  {
    id: "P15",
    shortNodeTitle: "Deuring-Heilbronn · If ~RH",
    arxivId: "2201.03990",
    arxivOrDoi: "arXiv:2201.03990",
    url: "https://arxiv.org/abs/2201.03990",
    title: "Elementary methods in the study of Deuring-Heilbronn Phenomenon",
    authors: "M. Deuring (1933), H. Heilbronn (1934); C. Bellotti & G. Puglisi (2022)",
    yearLabel: "1933 / 2022",
    category: "math.NT",
    theoremLabel: "Deuring-Mordell Theorem",
    conjectureType: "RH",
    polarity: "ASSUMES_FALSE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Paired with Hecke's GRH => h(-D)->infinity proof, this originally proved Gauss's class-number conjecture by excluded middle (RH v ~RH); Siegel (1935) and Goldfeld-Gross-Zagier later proved it unconditionally.",
    hopDepth: 1,
    upstreamIds: ["ROOT_RH"],
    extractedQuote:
      "Under the assumption of the falsity of the classical Riemann Hypothesis, Mordell [extending Deuring 1933] proved that h(-D) -> infinity as D -> infinity.",
    quoteLocator: "Section 1, Historical Introduction",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Deuring 1933 / Mordell 1934 — ASSUMES_FALSE]",
      "  Assume the Riemann Hypothesis is FALSE.",
      "  Then the imaginary quadratic class number satisfies \\lim_{D\\to\\infty} h(-D) = \\infty.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Vacuously True Branch — Consequent Intact via Hecke/Siegel]",
      "  % Premise (~RH) is now FALSE, so (~RH => h(-D)->infty) is vacuous.",
      "  % Conclusion h(-D)->infty holds directly via Hecke's GRH branch & Siegel (1935).",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Deuring-Mordell Active! Off-Line Zero Forces Zero Repulsion]",
      "  Because RH is FALSE, the off-line zeta zero repels L(1, \\chi_{-D}) upward,",
      "  forcing h(-D) \\to \\infty directly.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Dead-branch retirement (ASSUMES_FALSE): Under RH = True, Deuring's '~RH => h(-D) -> infinity' implication becomes vacuously true while Siegel (1935) preserves h(-D) -> infinity.",
    authorAlertOpen: "Historical 'heads I win, tails you lose' theorem: assumes RH is FALSE.",
    authorAlertFalsifiedOrVacuous:
      "If RH is false, Deuring-Mordell's off-line zero repulsion activates.",
    agentTrapNote:
      "TRAP (`polarity-inversion-miss`): Assumes RH is FALSE; proving RH makes Deuring's implication vacuous.",
  },
  {
    id: "P16",
    shortNodeTitle: "Heath-Brown / MM · Siegel Twins",
    arxivId: "2112.11412",
    arxivOrDoi: "arXiv:2112.11412",
    url: "https://arxiv.org/abs/2112.11412",
    title: "Siegel zeros, twin primes, Goldbach's conjecture, and primes in short intervals",
    authors: "D. R. Heath-Brown (1983); K. Matomäki & J. Merikoski (2021)",
    yearLabel: "1983 / 2021",
    category: "math.NT",
    theoremLabel: "Corollary 1.1 (Siegel Zeros => Twin Primes)",
    conjectureType: "GRH_DIRICHLET",
    polarity: "ASSUMES_FALSE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "No unconditional proof of Twin Primes exists (current unconditional record is infinitely many prime gaps <= 246 via Maynard-Tao / Polymath8b).",
    hopDepth: 2,
    upstreamIds: ["P15", "ROOT_GRH_DIRICHLET"],
    extractedQuote:
      "Heath-Brown proved in 1983 that if there are infinitely many Siegel zeros [real zeros of Dirichlet L(s, chi) near s = 1], then there are infinitely many twin primes.",
    quoteLocator: "Abstract & Corollary 1.1",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{corollary}[Heath-Brown 1983 / Matomäki-Merikoski 2021 — ASSUMES_FALSE]",
      "  Assume Dirichlet GRH fails via infinitely many Siegel zeros \\beta_0 = 1 - 1/(\\eta\\log q).",
      "  Then \\sum_{n \\le X} \\Lambda(n)\\Lambda(n+2) = X\\mathfrak{S}_2 + o(X) (Twin Primes holds).",
      "\\end{corollary}",
    ],
    latexAfterUpgrade: [
      "\\begin{corollary}[VACUOUS DEAD BRANCH — Siegel Zeros Ruled Out]",
      "  % Dirichlet GRH = True proves NO Siegel zeros exist (Re(rho) <= 1/2).",
      "  % This conditional proof of Twin Primes evaporates; Twin Primes remains OPEN!",
      "\\end{corollary}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{corollary}[TWIN PRIME CONJECTURE PROVED UNCONDITIONALLY]",
      "  Exceptional Siegel zeros exist (\\neg\\mathrm{GRH}_{\\mathrm{Dir}}), forcing twin-prime",
      "  asymptotics \\sum_{n \\le X} \\Lambda(n)\\Lambda(n+2) \\sim X\\mathfrak{S}_2!",
      "\\end{corollary}",
    ],
    authorAlertUpgrade:
      "Covered by Dirichlet GRH (in reverse!): proving Dirichlet GRH rules out Landau-Siegel zeros, retiring this conditional route to Twin Primes as vacuous.",
    authorAlertOpen:
      "Conditional on Dirichlet GRH failing via infinitely many Landau-Siegel real zeros near s = 1.",
    authorAlertFalsifiedOrVacuous:
      "Counterfactual in Siegel-zero mode: if Dirichlet GRH failed via infinitely many Siegel zeros, Heath-Brown (1983) and Matomäki-Merikoski (2021) would prove Twin Primes.",
    agentTrapNote:
      "TRAP (`polarity-inversion-miss`): Assumes Dirichlet GRH FAILS via Siegel zeros! Proving Dirichlet GRH makes this branch VACUOUS and does NOT prove Twin Primes.",
  },
];

const LANDMARK_ENRICHMENTS: Record<
  string,
  {
    topicBucket: TopicBucket;
    yearNumeric: number;
    citedByCount: number;
    plainSummary: string;
    agentLensConvId?: string;
  }
> = {
  P01: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 1976,
    citedByCount: 540,
    plainSummary:
      "Pins down the Prime Number Theorem error to sqrt(x) log(x) / (8 pi) for every x >= 2,657 under classical RH.",
  },
  P02: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2002,
    citedByCount: 310,
    plainSummary:
      "Rewrites classical RH as an elementary divisor-sum inequality for every n >= 1 — now compiled with zero hypotheses in Lean 4.",
  },
  P17: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 1984,
    citedByCount: 420,
    plainSummary:
      "Robin's divisor-sum criterion sigma(n) < e^gamma n log log n for all n > 5040 — now compiled with zero hypotheses in Lean 4.",
  },
  P03: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2019,
    citedByCount: 95,
    plainSummary:
      "Tightens the largest gap between consecutive primes to (22/25) sqrt(p) log p under classical RH.",
  },
  P04: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2026,
    citedByCount: 1,
    plainSummary:
      "Guarantees a prime inside every short interval [x, x + x^{21/40}] once x >= 3.5 x 10^90 under classical RH.",
    agentLensConvId: "ts-v2-case-01-visser-rh-2026-11-20-17-25-08",
  },
  P05: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2024,
    citedByCount: 145,
    plainSummary:
      "Already proven without RH: broke a 50-year barrier bounding hypothetical off-line zeta zeros.",
  },
  P06: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2026,
    citedByCount: 8,
    plainSummary:
      "Already verified in Lean 4 (Aug 2026): proves >= 67.25% of zeta zeros are both simple (multiplicity 1) and on the critical line.",
    agentLensConvId: "ts-v2-case-08-alpoge-furman-simple-2026-11-20-17-25-08",
  },
  P07: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2025,
    citedByCount: 3,
    plainSummary:
      "Shows that under classical RH, Dirichlet GRH mod q is equivalent to vertical spacing sums of ordinary zeta zeros.",
  },
  P08: {
    topicBucket: "Algorithms & Complexity",
    yearNumeric: 1990,
    citedByCount: 890,
    plainSummary:
      "Makes deterministic Miller primality testing provably fast (~log^4 n) under Dirichlet GRH, sharpening unconditional AKS.",
    agentLensConvId: "ts-v2-case-02-miller-bach-fallback-2026-11-20-17-25-08",
  },
  P09: {
    topicBucket: "Algebra, Knots & Quantum",
    yearNumeric: 2014,
    citedByCount: 165,
    plainSummary:
      "Puts knottedness in NP via Koiran + Lagarias-Odlyzko effective Chebotarev (number-field ERH, still open) — though Lackenby later proved NP unconditionally.",
    agentLensConvId: "ts-v2-case-03-kuperberg-unknot-2026-11-20-17-25-08",
  },
  P10: {
    topicBucket: "Algebra, Knots & Quantum",
    yearNumeric: 2017,
    citedByCount: 42,
    plainSummary:
      "Places torus-knot coNP and satellite-knot NP recognition on Koiran + Lagarias-Odlyzko effective Chebotarev — needs number-field ERH, not Dirichlet GRH.",
  },
  P11: {
    topicBucket: "Algorithms & Complexity",
    yearNumeric: 2024,
    citedByCount: 19,
    plainSummary:
      "Puts Schubert coefficient vanishing in coAM via Parametric Nullstellensatz — requires number-field Dedekind ERH, still open.",
    agentLensConvId: "ts-v2-case-04-schubert-rh-only-2026-11-20-17-25-08",
  },
  P12: {
    topicBucket: "Cryptography & Security",
    yearNumeric: 2022,
    citedByCount: 195,
    plainSummary:
      "Proves the FOCS 2021 equivalence behind SQIsign signatures — Section 3 invokes Lagarias-Odlyzko effective Chebotarev, so Dirichlet GRH alone leaves that step open.",
    agentLensConvId: "ts-v2-case-05-wesolowski-sqisign-2026-11-20-17-25-08",
  },
  P13: {
    topicBucket: "Cryptography & Security",
    yearNumeric: 2009,
    citedByCount: 280,
    plainSummary:
      "Proves rapid mixing on elliptic-curve isogeny graphs using Hecke character / modular-form L-functions — outside Dirichlet GRH.",
  },
  P14: {
    topicBucket: "Algebra, Knots & Quantum",
    yearNumeric: 1973,
    citedByCount: 980,
    plainSummary:
      "Proves Artin's primitive-root conjecture (Hooley) and Euclidean division in number rings (Weinberger) — requires Kummer Dedekind ERH, still open.",
    agentLensConvId: "ts-v2-case-06-hooley-weinberger-erh-2026-11-20-17-25-08",
  },
  P15: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 1934,
    citedByCount: 210,
    plainSummary:
      "Assumed classical RH was FALSE to prove imaginary quadratic class numbers grow to infinity (later proved unconditionally by Siegel).",
  },
  P16: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2021,
    citedByCount: 68,
    plainSummary:
      "Proves that if Dirichlet GRH FAILED via exceptional Siegel zeros, Twin Primes would hold — a route now retired as vacuous.",
    agentLensConvId: "ts-v2-case-07-siegel-twin-primes-2026-11-20-17-25-08",
  },
};

export const LANDMARK_THEOREMS: TheoremRecord[] = RAW_LANDMARK_THEOREMS.map((t) => {
  const extra = LANDMARK_ENRICHMENTS[t.id];
  const arxivMatch = t.url.match(/arxiv\.org\/abs\/([^?\s]+)$/i);
  const cited = extra?.citedByCount ?? null;
  return {
    ...t,
    arxivId: t.arxivId ?? arxivMatch?.[1],
    topicBucket: extra?.topicBucket ?? "Primes & Number Theory",
    yearNumeric: extra?.yearNumeric ?? 2020,
    plainSummary: extra?.plainSummary ?? t.title,
    isFeatured: true,
    isNamedLandmark: true,
    citedByCount: cited,
    importanceTier: cited !== null && cited >= 150 ? "TOP_100" : "TOP_500",
    foundBySources: ["curated_classics"],
    evidenceTier: "curated_primary",
    agentLensUrl: extra?.agentLensConvId
      ? `${AGENT_LENS_CONV_BASE}/${extra.agentLensConvId}`
      : "https://forge.coreweave.com/agent-lens/wandb/theorem-survival",
  };
});

export function buildExcludeSetFromLandmarks(landmarks: TheoremRecord[]): Set<string> {
  const s = new Set<string>([
    // Combined two-paper landmarks P07 (Miller 1976 + Bach 1990) and P14 (Hooley 1967 + Weinberger 1973)
    "doi:10.1016/s0022-0000(76)80043-8",
    "doi:10.1090/s0025-5718-1973-0337902-7",
  ]);
  for (const t of landmarks) {
    if (t.arxivId) s.add(`arxiv:${t.arxivId.toLowerCase().trim()}`);
    if (t.doi) s.add(`doi:${t.doi.toLowerCase().trim()}`);
    s.add(`title:${t.title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`);
  }
  return s;
}

const _seenKeys = buildExcludeSetFromLandmarks(LANDMARK_THEOREMS);
const _embedSeenKeys = buildExcludeSetFromLandmarks(LANDMARK_THEOREMS);

export const EMBED_SEED_THEOREMS: TheoremRecord[] = [
  ...LANDMARK_THEOREMS,
  ...adaptPoolItems(top100EmbedRaw as unknown as PoolCorpusItem[], _embedSeenKeys, "T", 1),
];

export const THEOREMS: TheoremRecord[] =
  (top100EmbedRaw as unknown[]).length > 0
    ? EMBED_SEED_THEOREMS
    : [...LANDMARK_THEOREMS, ...adaptCorpusItems(_seenKeys)];

export function normalizeWorldState(
  prev: WorldState,
  field: "rh" | "grhDirichlet" | "beyondDirichlet",
  nextVal: TruthState,
): WorldState {
  const next: WorldState = { ...prev, [field]: nextVal };
  if (field === "rh" && nextVal === "FALSE") {
    next.grhDirichlet = "FALSE";
    next.beyondDirichlet = "FALSE";
    next.siegelZero = false;
  }
  if (field === "grhDirichlet" && nextVal === "FALSE") {
    next.beyondDirichlet = "FALSE";
  }
  if (field === "grhDirichlet" && nextVal === "TRUE") {
    if (next.rh === "FALSE") next.rh = "TRUE";
    next.siegelZero = false;
  }
  if (field === "beyondDirichlet" && nextVal === "TRUE") {
    if (next.rh === "FALSE") next.rh = "TRUE";
    if (next.grhDirichlet === "FALSE") next.grhDirichlet = "TRUE";
    next.siegelZero = false;
  }
  if (next.grhDirichlet !== "FALSE") {
    next.siegelZero = false;
  }
  return next;
}

export function buildDiff(before: string[], after: string[]): {
  diffLines: DiffLine[];
  additions: number;
  deletions: number;
} {
  const out: DiffLine[] = [];
  let lineNo = 1;
  let deletions = 0;
  let additions = 0;

  const same =
    before.length === after.length &&
    before.every((line, idx) => line === after[idx]);

  if (same) {
    for (const content of before) {
      out.push({ type: "unchanged", content, lineNumber: lineNo++ });
    }
    return { diffLines: out, additions: 0, deletions: 0 };
  }

  for (const content of before) {
    out.push({ type: "removed", content, lineNumber: lineNo++ });
    deletions++;
  }
  let addLineNo = 1;
  for (const content of after) {
    out.push({ type: "added", content, lineNumber: addLineNo++ });
    additions++;
  }
  return { diffLines: out, additions, deletions };
}

function shortConjBadge(c: ConjectureType): string {
  if (c === "RH") return "Classical RH";
  if (c === "GRH_DIRICHLET") return "Dirichlet GRH";
  if (c === "BEYOND_DIRICHLET") return "Number-Field ERH";
  if (c === "UNCLEAR") return "Unspecified GRH";
  return c;
}

export function evaluateTheorem(t: TheoremRecord, ws: WorldState): EvaluatedTheorem {
  // 1. Passing mentions are never counted as changed in any scenario
  if (t.conjectureType === "MENTION_ONLY") {
    const diff = buildDiff(t.latexBefore, t.latexBefore);
    return {
      outcome: "MENTION_ONLY_UNCHANGED",
      badgeLabel: "Only Mentions It",
      shortTag: "MENTION ONLY",
      tone: "stone",
      headline: t.authorAlertOpen,
      ...diff,
    };
  }

  // 2. Already unconditional bounds
  if (t.conjectureType === "DENSITY_BOUND") {
    if (t.id !== "P05" && t.id !== "P06") {
      const diff = buildDiff(t.latexBefore, t.latexBefore);
      return {
        outcome: "BOUND_TIGHTENED",
        badgeLabel: "Already Proven",
        shortTag: "ALREADY PROVEN",
        tone: "sky",
        headline: t.authorAlertOpen,
        ...diff,
      };
    }

    const activeToggle =
      t.id === "P05" ? ws.guthMaynard2024 : ws.alpogeFurman2026;

    if (ws.rh === "TRUE") {
      if (t.id === "P05") {
        const diff = buildDiff(t.latexBefore, t.latexAfterUpgrade);
        return {
          outcome: "VACUOUS_OR_SUPERSEDED",
          badgeLabel: "Superseded by Full RH",
          shortTag: "SUPERSEDED",
          tone: "stone",
          headline: t.authorAlertUpgrade,
          ...diff,
        };
      }
      const diff = buildDiff(t.latexBefore, t.latexAfterUpgrade);
      return {
        outcome: "BOUND_TIGHTENED",
        badgeLabel: "Already Proven (Still Useful)",
        shortTag: "ALREADY PROVEN",
        tone: "sky",
        headline: t.authorAlertUpgrade,
        ...diff,
      };
    }

    if (activeToggle) {
      const baseLines =
        ws.rh === "FALSE" ? t.latexAfterFallbackOrVacuous : t.latexBefore;
      const diff = buildDiff(t.latexBefore, baseLines);
      return {
        outcome: "BOUND_TIGHTENED",
        badgeLabel: "Already Proven",
        shortTag: "ALREADY PROVEN",
        tone: "sky",
        headline:
          ws.rh === "FALSE"
            ? t.authorAlertFalsifiedOrVacuous
            : t.authorAlertOpen,
        ...diff,
      };
    }

    const diff = buildDiff(t.latexBefore, t.latexBefore);
    return {
      outcome: "STILL_CONDITIONAL",
      badgeLabel: "Toggled Off",
      shortTag: "OFF",
      tone: "amber",
      headline: "Partial bound toggled off in custom settings.",
      ...diff,
    };
  }

  // 3. Ambiguous "GRH" papers where text does not disambiguate Dirichlet vs. number-field L-functions:
  //    UNCLEAR is NEVER counted as settled!
  if (t.conjectureType === "UNCLEAR") {
    if (ws.rh === "FALSE" && t.polarity === "ASSUMES_TRUE") {
      const diff = buildDiff(t.latexBefore, t.latexAfterFallbackOrVacuous);
      return {
        outcome: "HYPOTHESIS_FALSIFIED",
        badgeLabel: t.hasUnconditionalFallback
          ? "Uses Slower Backup Proof"
          : "Assumption Disproved",
        shortTag: t.hasUnconditionalFallback ? "BACKUP PROOF" : "BROKEN",
        tone: "rose",
        headline: t.authorAlertFalsifiedOrVacuous,
        ...diff,
      };
    }
    const diff = buildDiff(t.latexBefore, t.latexBefore);
    return {
      outcome: "STILL_CONDITIONAL",
      badgeLabel: "Paper Doesn't Say Which GRH",
      shortTag: "SCOPE UNCLEAR",
      tone: "amber",
      headline: t.authorAlertOpen,
      ...diff,
    };
  }

  const truth: TruthState =
    t.conjectureType === "RH"
      ? ws.rh
      : t.conjectureType === "GRH_DIRICHLET"
        ? ws.grhDirichlet
        : ws.beyondDirichlet;

  const conjName = shortConjBadge(t.conjectureType);

  if (truth === "OPEN") {
    const diff = buildDiff(t.latexBefore, t.latexBefore);
    return {
      outcome: "STILL_CONDITIONAL",
      badgeLabel:
        t.polarity === "ASSUMES_FALSE"
          ? `Only If ${conjName} Fails`
          : `Still Needs ${conjName}`,
      shortTag: "STILL OPEN",
      tone: "amber",
      headline: t.authorAlertOpen,
      ...diff,
    };
  }

  if (t.polarity === "ASSUMES_TRUE") {
    if (truth === "TRUE") {
      const diff = buildDiff(t.latexBefore, t.latexAfterUpgrade);
      if (!t.hasUnconditionalFallback) {
        return {
          outcome: "UPGRADED_UNCONDITIONAL",
          badgeLabel: t.machineCheckedLean?.verified
            ? "Machine-Checked in Lean 4"
            : "Becomes Proven",
          shortTag: "BECOMES PROVEN",
          tone: "emerald",
          headline: t.authorAlertUpgrade,
          ...diff,
        };
      }
      return {
        outcome: "BOUND_TIGHTENED",
        badgeLabel: "Gets Faster / Tighter",
        shortTag: "FASTER / TIGHTER",
        tone: "sky",
        headline: t.authorAlertUpgrade,
        ...diff,
      };
    }

    const diff = buildDiff(t.latexBefore, t.latexAfterFallbackOrVacuous);
    return {
      outcome: "HYPOTHESIS_FALSIFIED",
      badgeLabel: t.hasUnconditionalFallback
        ? "Uses Slower Backup Proof"
        : "Assumption Disproved",
      shortTag: t.hasUnconditionalFallback ? "BACKUP PROOF" : "BROKEN",
      tone: "rose",
      headline: t.authorAlertFalsifiedOrVacuous,
      ...diff,
    };
  }

  // ASSUMES_FALSE polarity
  if (truth === "TRUE") {
    const diff = buildDiff(t.latexBefore, t.latexAfterUpgrade);
    return {
      outcome: "VACUOUS_OR_SUPERSEDED",
      badgeLabel: "Dead 'What-If' Path",
      shortTag: "DEAD PATH",
      tone: "stone",
      headline: t.authorAlertUpgrade,
      ...diff,
    };
  }

  if (t.conjectureType === "GRH_DIRICHLET" && !ws.siegelZero) {
    const noteLines = [
      "\\begin{corollary}[Still Unactivated — Needs Siegel Zeros, Not Just ~RH]",
      "  % An off-line zero of zeta(s) falsifies GRH globally, yet Siegel-zero theorems",
      "  % specifically require real exceptional zeros beta_0 -> 1^- of Dirichlet L(s, chi).",
      "\\end{corollary}",
    ];
    const diff = buildDiff(t.latexBefore, noteLines);
    return {
      outcome: "STILL_CONDITIONAL",
      badgeLabel: "Needs Siegel Zeros",
      shortTag: "NEEDS SIEGEL",
      tone: "amber",
      headline:
        "Disproving RH via an ordinary off-line zero does not automatically produce real Siegel zeros near s = 1, so this Siegel-zero theorem stays unactivated.",
      ...diff,
    };
  }

  const diff = buildDiff(t.latexBefore, t.latexAfterFallbackOrVacuous);
  if (!t.hasUnconditionalFallback) {
    return {
      outcome: "UPGRADED_UNCONDITIONAL",
      badgeLabel: "Proved via Counterexample!",
      shortTag: "BECOMES PROVEN",
      tone: "emerald",
      headline: t.authorAlertFalsifiedOrVacuous,
      ...diff,
    };
  }
  return {
    outcome: "BOUND_TIGHTENED",
    badgeLabel: "'What-If' Branch Active",
    shortTag: "ACTIVE",
    tone: "sky",
    headline: t.authorAlertFalsifiedOrVacuous,
    ...diff,
  };
}
