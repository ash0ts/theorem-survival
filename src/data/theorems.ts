import { adaptCorpusItems, AGENT_LENS_CONV_BASE } from "./corpus-adapter";

export type TruthState = "OPEN" | "TRUE" | "FALSE";
export type ConjectureType = "RH" | "GRH" | "ERH" | "DENSITY_BOUND";
export type Polarity = "ASSUMES_TRUE" | "ASSUMES_FALSE";
export type Severity = "CORE_BLOCKER" | "SHARPENS_BOUND";
export type ArxivCategory = "math.NT" | "cs.CC" | "cs.CR";
export type TopicBucket =
  | "Primes & Number Theory"
  | "Algorithms & Complexity"
  | "Cryptography & Security"
  | "Algebra, Knots & Quantum";

export type PresetId =
  | "nov20_live"
  | "rh_only"
  | "alpoge_rh_grh"
  | "full_rh_grh_erh"
  | "siegel_zero_twist"
  | "rh_false";

export type OutcomeKind =
  | "UPGRADED_UNCONDITIONAL"
  | "BOUND_TIGHTENED"
  | "STILL_CONDITIONAL"
  | "VACUOUS_OR_SUPERSEDED"
  | "HYPOTHESIS_FALSIFIED";

export interface WorldState {
  rh: TruthState;
  grh: TruthState;
  erh: TruthState;
  siegelZero: boolean;
  guthMaynard2024: boolean;
  alpogeFurman2026: boolean;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: number;
}

export interface TheoremRecord {
  id: string;
  shortNodeTitle: string;
  arxivId?: string;
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

export const PRESETS: Array<{
  id: PresetId;
  label: string;
  shortLabel: string;
  description: string;
  state: WorldState;
}> = [
  {
    id: "nov20_live",
    label: "Today: Proof Still Checking",
    shortLabel: "Today (Still Checking)",
    description:
      "Right now on Nov 20, 2026: Alpöge and Claude's 14-part Lean 4 archive compiled its target statements against Mathlib, while the full Lean proof replay is still running. Nothing new is unlocked yet.",
    state: {
      rh: "OPEN",
      grh: "OPEN",
      erh: "OPEN",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "rh_only",
    label: "If Only Basic RH Holds",
    shortLabel: "Basic RH Only",
    description:
      "Suppose only the original 1859 Riemann Hypothesis verifies. Prime-counting and prime-gap theorems become proven facts, while computer science and cryptography papers needing GRH stay unproved.",
    state: {
      rh: "TRUE",
      grh: "OPEN",
      erh: "OPEN",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "alpoge_rh_grh",
    label: "If Nov 20 Claim Holds (RH + GRH)",
    shortLabel: "Nov 20 Claim (RH + GRH)",
    description:
      "Matches Alpöge's Friday announcement: both RH and Generalized RH (GRH) verify. Unlocks prime theory, fast deterministic algorithms, and post-quantum crypto security proofs — while Extended RH (ERH) papers still wait.",
    state: {
      rh: "TRUE",
      grh: "TRUE",
      erh: "OPEN",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "full_rh_grh_erh",
    label: "If All Three Hold (RH + GRH + ERH)",
    shortLabel: "All Three (RH + GRH + ERH)",
    description:
      "Original RH, Generalized RH, and Extended RH all hold. Unlocks higher algebra, number fields, and Artin's primitive-root conjecture as well.",
    state: {
      rh: "TRUE",
      grh: "TRUE",
      erh: "TRUE",
      siegelZero: false,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "siegel_zero_twist",
    label: "Plot Twist: GRH Fails (Siegel Zeros)",
    shortLabel: "What If GRH Fails?",
    description:
      "Basic RH holds, while Generalized RH fails via rare 'Siegel zeros'. Computer-science GRH proofs break — and 15 counterfactual papers (including the Twin Prime Conjecture!) suddenly become proven.",
    state: {
      rh: "TRUE",
      grh: "FALSE",
      erh: "FALSE",
      siegelZero: true,
      guthMaynard2024: true,
      alpogeFurman2026: true,
    },
  },
  {
    id: "rh_false",
    label: "What If RH Is Disproved?",
    shortLabel: "If RH Fails",
    description:
      "Suppose an off-line zero disproves RH (and therefore GRH and ERH too). Conditional upgrades fail or fall back to slower backup proofs, while unconditional 2024–2026 bounds survive intact.",
    state: {
      rh: "FALSE",
      grh: "FALSE",
      erh: "FALSE",
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
  key: "rh" | "grh" | "erh" | "partial";
}> = [
  {
    id: "ROOT_RH",
    shortTitle: "RH · Original (1859)",
    subtitle: "Prime counting & prime gaps",
    key: "rh",
  },
  {
    id: "ROOT_GRH",
    shortTitle: "GRH · Generalized",
    subtitle: "Fast CS algorithms & crypto",
    key: "grh",
  },
  {
    id: "ROOT_ERH",
    shortTitle: "ERH · Extended",
    subtitle: "Higher number fields & algebra",
    key: "erh",
  },
  {
    id: "ROOT_PARTIAL",
    shortTitle: "Already Proven Bounds",
    subtitle: "No conjecture needed",
    key: "partial",
  },
];

const RAW_LANDMARK_THEOREMS: TheoremRecord[] = [
  {
    id: "P01",
    shortNodeTitle: "Schoenfeld · Explicit pi(x)",
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
      "Upgrade ready: Corollary 1 drops its RH hypothesis. Square-root prime-counting error sqrt(x) log(x) / (8 pi) for all x >= 2657 becomes an unconditional constant.",
    authorAlertOpen:
      "Blocked on classical RH. Until Lean Comparator finishes replaying Alpöge's zeta(s) proof terms, explicit prime tables above 10^19 must keep the RH caveat.",
    authorAlertFalsifiedOrVacuous:
      "RH falsified: square-root error O(x^{1/2} log x) fails at sup Re(rho) > 1/2. Revert downstream explicit bounds to Mossinghoff-Trudgian zero-free regions.",
    agentTrapNote: "Has unconditional de la Vallée Poussin / Mossinghoff-Trudgian fallback; RH sharpens the error term rather than proving the Prime Number Theorem.",
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
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Lagarias 2002, Equivalent to RH]",
      "  RH holds iff for every integer n >= 1,",
      "  \\sigma(n) \\le H_n + \\exp(H_n)\\log(H_n).",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Lagarias Inequality — Unconditional]",
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
      "Hop-2 upgrade (via Schoenfeld P01): Lagarias's harmonic divisor inequality sigma(n) <= H_n + exp(H_n) log(H_n) flips from open equivalence to unconditional theorem for every n >= 1.",
    authorAlertOpen:
      "Exact biconditional with RH. Verified numerically up to colossal bounds, yet universally open until RH is confirmed.",
    authorAlertFalsifiedOrVacuous:
      "Because Theorem 1.1 is an iff equivalence, falsifying RH immediately implies infinitely many counterexample integers n violate Lagarias's divisor bound.",
    agentTrapNote: "Exact iff equivalence with classical RH; needs RH only (not GRH).",
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
      "Upgrade ready: Theorem 1.1 drops its RH assumption, slashing the proven worst-case prime-gap exponent from x^{0.525} down to (22/25) x^{0.5} log x for all primes >= 3.",
    authorAlertOpen:
      "Blocked on RH. Upstream citation dependency for effective short-interval prime theorems such as Visser (arXiv:2610.27830).",
    authorAlertFalsifiedOrVacuous:
      "RH falsified: explicit (22/25) sqrt(p_n) log p_n prime-gap bound loses its proof; worst-case prime gaps revert to Baker-Harman-Pintz x^{0.525}.",
    agentTrapNote: "Sharpens Baker-Harman-Pintz x^{0.525} unconditional bound; also note RH still leaves Cramér's O((log p_n)^2) conjecture open!",
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
      "Author alert for Matt Visser (uploaded 31 days ago, Hop 2 via 1708.04122): Theorems 1-3 upgrade to unconditional, making Baker-Harman-Pintz explicitly effective at x >= 3.5e90.",
    authorAlertOpen:
      "Fresh Oct 2026 preprint waiting directly on RH via Carneiro-Milinovich-Soundararajan (Hop 1).",
    authorAlertFalsifiedOrVacuous:
      "Without RH, the CMS crossover calculation at x_* = 3.48e90 breaks; Baker-Harman-Pintz remains ineffective.",
    agentTrapNote: "2-hop transitive RH dependency via 1708.04122; no unconditional explicit cutoff exists for BHP.",
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
      "Unconditionally proven (v2 Apr 2026). Stands as the strongest unconditional bound on potential off-line zeros while Alpöge's Lean archive is audited.",
    authorAlertFalsifiedOrVacuous:
      "Critical survival shield: because Guth-Maynard is unconditional, Theorem 1.2 still caps how many off-line counterexamples can exist up to height T.",
    agentTrapNote: "Already unconditional; Theorem 1.2 zero-density is superseded by RH, whereas Theorem 1.1 large-value Dirichlet polynomial bound stays useful.",
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
      "Subtle distinction: RH upgrades the critical-line fraction from 67.25% to 100%, yet RH alone permits double zeros on Re(s)=1/2 — so this paper's >= 67.25% simplicity theorem (and Lamzouri 2609.02882) still does real work.",
    authorAlertOpen:
      "Already passed Lean 4 Comparator in Aug 2026 (anthropics/formal-math/zeta23). Precursor to the Nov 20 full RH claim.",
    authorAlertFalsifiedOrVacuous:
      "Even if the Nov 20 full RH archive fails verification, August's Lean-verified 67.25% theorem remains unconditionally valid.",
    agentTrapNote: "TRAP (`simplicity-vs-location-blur`): Classical RH places all zeros on Re(s)=1/2, NOT simple multiplicity 1! So >= 67.25% simplicity is NOT superseded by RH alone.",
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
    confidenceScore: 0.96,
    latexBefore: [
      "\\begin{theorem}[Suzuki 2025 — Conditional Bridge]",
      "  Assume RH. Then GRH mod q is equivalent to the vertical zeta-zero",
      "  asymptotic Z(x; t, a/q_1) = main_term + O(x^\\varepsilon).",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Suzuki 2025 — Unconditional Bridge to GRH]",
      "  GRH mod q is unconditionally equivalent to the vertical zeta-zero",
      "  asymptotic Z(x; t, a/q_1) = main_term + O(x^\\varepsilon).",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Bridge Inactive]",
      "  % Off-line zeta zeros break the clean ordinate phase sum in (1.4).",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Upgrade ready under RH alone: Theorem 1 becomes an unconditional bridge reducing Dirichlet GRH mod q to vertical spacing sums of zeta(s) zeros.",
    authorAlertOpen: "Waiting on classical RH.",
    authorAlertFalsifiedOrVacuous:
      "Off-line zeros of zeta(s) invalidate the single-line ordinate representation in Theorem 1.",
    agentTrapNote: "Theorem 1 only assumes classical RH to establish an equivalence with GRH; Theorem 2 additionally assumes GRH.",
  },
  {
    id: "P08",
    shortNodeTitle: "Miller-Bach · Fast Primality",
    arxivOrDoi: "doi:10.1090/S0025-5718-1990-1023756-8",
    url: "https://doi.org/10.1090/S0025-5718-1990-1023756-8",
    title: "Explicit bounds for primality testing and related problems",
    authors: "Gary L. Miller (1976), Eric Bach (1990)",
    yearLabel: "1990",
    category: "cs.CC",
    theoremLabel: "Theorem 2 & Miller Det. Test",
    conjectureType: "GRH",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "AKS (2002) already proved PRIMES in P unconditionally in O~(log^6 n), and randomized Miller-Rabin runs in O~(k log^2 n); GRH upgrades deterministic 2(ln n)^2 Miller testing to O~(log^4 n).",
    hopDepth: 1,
    upstreamIds: ["ROOT_GRH"],
    extractedQuote:
      "If the GRH/ERH for quadratic Dirichlet characters holds, a composite number m has a strong compositeness witness at most 2 (log m)^2.",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Miller 1976 / Bach 1990 — Conditional on Quadratic GRH]",
      "  Assuming GRH, testing bases a <= 2(\\ln n)^2 deterministically",
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
      "Requires GRH (not classical RH alone): Under Alpöge's RH+GRH claim, deterministic Miller primality testing up to 2(ln n)^2 becomes unconditionally sound in O~(log^4 n).",
    authorAlertOpen:
      "Still conditional if only classical RH holds; needs quadratic Dirichlet GRH.",
    authorAlertFalsifiedOrVacuous:
      "GRH falsified: deterministic witness cutoff 2(ln n)^2 loses its proof, while PRIMES in P survives unconditionally via AKS (2002).",
    agentTrapNote: "TRAP (`rh-grh-erh-conflated` + `missed-unconditional-fallback`): Needs quadratic Dirichlet GRH (not classical RH), and PRIMES in P is already unconditional via AKS 2002.",
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
    theoremLabel: "Theorem 1.1",
    conjectureType: "GRH",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Scraper trap: Marc Lackenby (arXiv:1604.03778, pub. 2021) already proved Knottedness in NP unconditionally via Thurston norm! GRH only keeps Kuperberg's algebraic SL(2, F_p) witness route unconditional.",
    hopDepth: 1,
    upstreamIds: ["ROOT_GRH"],
    extractedQuote:
      "Let K subset S^3 be a knot described by a knot diagram... Then the assertion that K is knotted is in NP, assuming the generalized Riemann hypothesis (GRH).",
    confidenceScore: 0.97,
    latexBefore: [
      "\\begin{theorem}[Kuperberg 2014 — Superseded on Class Membership]",
      "  Assuming GRH, Knottedness \\in \\mathsf{NP} via short SL(2, \\mathbb{F}_p) certificates.",
      "  % Note: Lackenby (1604.03778) already proved Knottedness in NP unconditionally!",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Short Finite-Field Witness Route Unconditional]",
      "  Kuperberg's polynomial-bit prime p SL(2, \\mathbb{F}_p) non-abelian representation",
      "  certificate now holds unconditionally alongside Lackenby's topological proof.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: Lackenby 2016/2021 — Unknot in NP cap coNP]",
      "  Knottedness \\in \\mathsf{NP} remains unconditionally true via normal surfaces.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Fallback check: Knottedness in NP was ALREADY made unconditional by Lackenby (arXiv:1604.03778), so GRH = True upgrades Kuperberg's short SL(2, F_p) prime-modulus certificate bound rather than the complexity class itself.",
    authorAlertOpen:
      "Class membership already unconditional via Lackenby (2016); Kuperberg's algebraic prime-bound route waits on GRH.",
    authorAlertFalsifiedOrVacuous:
      "Even if GRH fails, Unknottedness in NP intersect coNP survives unconditionally via Lackenby (1604.03778).",
    agentTrapNote: "TRAP (`missed-unconditional-fallback` + `rh-grh-erh-conflated`): Needs GRH (effective Chebotarev), AND Lackenby (1604.03778) already proved Knottedness in NP unconditionally!",
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
    conjectureType: "GRH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "TORUS-KNOT in NP is unconditional (Thm 4.3), whereas TORUS-KNOT in coNP, SATELLITE-KNOT in NP, and HYPERBOLIC-KNOT in coNP still have NO unconditional proof.",
    hopDepth: 2,
    upstreamIds: ["P09"],
    extractedQuote:
      "Theorem 1.1: The torus knot recognition problem is in NP intersect co-NP, assuming GRH... Theorem 1.3: The satellite knot recognition problem is in NP, assuming GRH.",
    confidenceScore: 0.98,
    latexBefore: [
      "\\begin{theorem}[Baldwin-Sivek 2017 — Blocked on GRH]",
      "  Assuming GRH: TorusKnot \\in \\mathsf{NP}\\cap\\mathsf{coNP},",
      "  SatelliteKnot \\in \\mathsf{NP}, and HyperbolicKnot \\in \\mathsf{coNP}.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Baldwin-Sivek 2017 — Upgraded Unconditional]",
      "  Unconditionally: TorusKnot \\in \\mathsf{NP}\\cap\\mathsf{coNP},",
      "  SatelliteKnot \\in \\mathsf{NP}, and HyperbolicKnot \\in \\mathsf{coNP}.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Partial Survival: Only TorusKnot in NP]",
      "  % coNP certificate for non-torus knots and NP satellite witness break without GRH.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Hop-2 complexity unlock: Unlike Kuperberg (which Lackenby bypassed), Baldwin & Sivek's coNP torus-knot, NP satellite-knot, and coNP hyperbolic-knot theorems genuinely unlock under GRH = True.",
    authorAlertOpen: "Still conditional on GRH (classical RH alone is not enough).",
    authorAlertFalsifiedOrVacuous:
      "Without GRH, only TorusKnot in NP (Thm 4.3) stands; coNP membership loses its short prime certificate.",
    agentTrapNote: "Requires GRH; unlike Unknot in NP cap coNP, TorusKnot in coNP and SatelliteKnot in NP have no unconditional Lackenby bypass.",
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
    conjectureType: "ERH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Without ERH/GRH (via Parametric Hilbert's Nullstellensatz), it was open whether Schubert coefficient vanishing {c^w_{u,v} =? 0} even lies inside the Polynomial Hierarchy PH.",
    hopDepth: 2,
    upstreamIds: ["P14", "P08"],
    extractedQuote:
      "Theorem 1.4: SchubertVanishing is in coAM assuming GRH [authors note ERH suffices]. Notably, SchubertVanishing is in the polynomial hierarchy PH.",
    confidenceScore: 0.97,
    latexBefore: [
      "\\begin{theorem}[Pak-Robichaux 2024/2026 — Conditional on ERH]",
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
      "  % Without ERH / effective Chebotarev, PH membership for {c^w_{u,v} = 0} is open.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Combinatorics/complexity upgrade once ERH clears: Schubert coefficient vanishing enters coAM (and therefore the Polynomial Hierarchy PH) unconditionally across types A, B, C, D.",
    authorAlertOpen:
      "Fine-print alert on Alpöge's Nov 20 note: Pak-Robichaux traces its Nullstellensatz prime-ideal step to Dedekind ERH, which Alpöge said he expects 'with more time' beyond Dirichlet GRH.",
    authorAlertFalsifiedOrVacuous:
      "If ERH fails, Parametric Nullstellensatz prime bounds lose polynomial bit-length, leaving SchubertVanishing outside proven PH.",
    agentTrapNote: "TRAP (`rh-grh-erh-conflated`): Abstract writes 'GRH', Section 1.4 notes Dedekind ERH is the actual analytic input via Koiran / Rojas Parametric Nullstellensatz.",
  },
  {
    id: "P12",
    shortNodeTitle: "Wesolowski · SQIsign Security",
    arxivId: "2111.01481",
    arxivOrDoi: "arXiv:2111.01481",
    url: "https://arxiv.org/abs/2111.01481",
    title: "The supersingular isogeny path and endomorphism ring problems are equivalent",
    authors: "Benjamin Wesolowski",
    yearLabel: "FOCS 2021",
    category: "cs.CR",
    theoremLabel: "Main Theorem (FOCS 2021)",
    conjectureType: "GRH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "No unconditional poly-time reduction exists between l-IsogenyPath and EndRing; NIST post-quantum signature candidate SQIsign relies on this reduction for rigorous security & signing guarantees.",
    hopDepth: 2,
    upstreamIds: ["P13"],
    extractedQuote:
      "We prove that the path-finding problem in l-isogeny graphs and the endomorphism ring problem for supersingular elliptic curves are equivalent under reductions of polynomial expected time, assuming GRH.",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{theorem}[Wesolowski, FOCS 2021 — Conditional on GRH]",
      "  Assuming GRH (Hecke/Dirichlet L-functions), \\ell\\text{-IsogenyPath} \\equiv_{\\mathrm{PPT}} \\mathsf{EndRing}.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Wesolowski, FOCS 2021 — Unconditional Crypto Reduction]",
      "  \\ell\\text{-IsogenyPath} \\equiv_{\\mathrm{PPT}} \\mathsf{EndRing} unconditionally;",
      "  SQIsign's foundational hardness equivalence drops its GRH caveat.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Crypto Reduction Degrades to Heuristic]",
      "  % Quaternion path-finding loses proven expected polynomial runtime.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Contrary to 'RH breaks crypto' memes: GRH = True STRENGTHENS post-quantum isogeny cryptography! Wesolowski's FOCS 2021 security equivalence behind SQIsign upgrades from GRH-conditional to unconditional.",
    authorAlertOpen:
      "Waiting on GRH. Classical RH for zeta(s) is insufficient because quaternion ideal norm representation needs L-functions of quadratic characters.",
    authorAlertFalsifiedOrVacuous:
      "If GRH fails, rigorous polynomial-time quaternion path-finding in Wesolowski's reduction reverts to heuristic status (like original KLPT).",
    agentTrapNote: "TRAP (`crypto-break-hallucination` + `rh-grh-erh-conflated`): Needs GRH (not RH), and proving GRH STRENGTHENS post-quantum SQIsign security reductions rather than breaking crypto!",
  },
  {
    id: "P13",
    shortNodeTitle: "Jao-MV · GRH Expander Graphs",
    arxivOrDoi: "doi:10.1007/s00145-008-9029-4",
    url: "https://doi.org/10.1007/s00145-008-9029-4",
    title: "Expander graphs based on GRH with an application to elliptic curve cryptography",
    authors: "David Jao, Stephen D. Miller, Ramarathnam Venkatesan",
    yearLabel: "2009",
    category: "cs.CR",
    theoremLabel: "Theorem 1.1 & Theorem 1.6",
    conjectureType: "GRH",
    polarity: "ASSUMES_TRUE",
    severity: "SHARPENS_BOUND",
    hasUnconditionalFallback: true,
    fallbackSummary:
      "Under weaker Generalized Lindelöf Hypothesis, random-walk ECDLP class-equivalence reduction degrades from polynomial time to subexponential time.",
    hopDepth: 1,
    upstreamIds: ["ROOT_GRH"],
    extractedQuote:
      "Assuming GRH for the characters of G, the Cayley graph Cay(G, S_x) of small prime degree isogenies achieves nontrivial eigenvalue bound O(n x^{1/2} log(xq)).",
    confidenceScore: 0.96,
    latexBefore: [
      "\\begin{theorem}[Jao-Miller-Venkatesan 2009 — GRH Graphs]",
      "  Assuming GRH, small-prime isogeny Cayley walks mix in poly(log q) steps.",
      "\\end{theorem}",
    ],
    latexAfterUpgrade: [
      "\\begin{theorem}[Jao-Miller-Venkatesan 2009 — Unconditional Mixing]",
      "  Small-prime ray-class and ordinary isogeny Cayley graphs are rapid expanders.",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Fallback: Subexponential Mixing]",
      "  % Poly-logarithmic spectral gap unproved without GRH.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Upgrade ready under GRH: Poly-logarithmic mixing of small-prime isogeny walks and ECDLP random-walk reductions become unconditional.",
    authorAlertOpen: "Blocked on GRH for ray-class characters.",
    authorAlertFalsifiedOrVacuous:
      "Without GRH, spectral gap bounds degrade, slowing rigorous isogeny random-walk reductions.",
    agentTrapNote: "Requires ray-class GRH; strengthens elliptic-curve random-walk reductions rather than breaking ECDLP.",
  },
  {
    id: "P14",
    shortNodeTitle: "Hooley-Weinberger · Artin & PID",
    arxivOrDoi: "doi:10.1515/crll.1967.225.209",
    url: "https://doi.org/10.1515/crll.1967.225.209",
    title: "On Artin's conjecture (Hooley 1967) & Euclidean rings of algebraic integers (Weinberger 1973)",
    authors: "Christopher Hooley; Peter J. Weinberger",
    yearLabel: "1967 / 1973",
    category: "math.NT",
    theoremLabel: "Main Thm (Artin) & PID => Euclidean",
    conjectureType: "ERH",
    polarity: "ASSUMES_TRUE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "Heath-Brown (1986) proved Artin's conjecture holds for all except at most 2 primes, yet NOT A SINGLE specific integer a (like a = 2) is unconditionally known! Murty-Harper proved PID => Euclidean only for unit rank >= 4.",
    hopDepth: 1,
    upstreamIds: ["ROOT_ERH"],
    extractedQuote:
      "Subject to the Riemann hypothesis for Dedekind zeta-functions of Kummer fields Q(zeta_q, a^{1/q}), N_a(x) ~ A(a) pi(x); and every PID O_K with infinitely many units is Euclidean.",
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
      "  % Still cannot prove a = 2 is a primitive root infinitely often without ERH!",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Historic landmark unlocked ONLY when Dedekind ERH holds: Artin's constant 0.3739558... works for a = 2, and Z[sqrt(14)] is unconditionally Euclidean.",
    authorAlertOpen:
      "STILL BLOCKED even if Alpöge's Nov 20 RH + Dirichlet GRH archive passes! Both Hooley and Weinberger require ERH for non-abelian Kummer Dedekind zeta functions.",
    authorAlertFalsifiedOrVacuous:
      "Without ERH, we still cannot prove that 2 is a primitive root for infinitely many primes (only that at most two primes among {2, 3, 5} can fail).",
    agentTrapNote: "TRAP (`rh-grh-erh-conflated`): Needs Dedekind ERH over non-abelian Kummer fields Q(zeta_q, a^{1/q}), NOT abelian Dirichlet GRH!",
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
      "  % Conclusion h(-D)->infty holds directly via Hecke's RH/GRH branch & Siegel (1935).",
      "\\end{theorem}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{theorem}[Deuring-Mordell Active! Off-Line Zero Forces Zero Repulsion]",
      "  Because RH is FALSE, the off-line zeta zero repels L(1, \\chi_{-D}) upward,",
      "  forcing h(-D) \\to \\infty directly.",
      "\\end{theorem}",
    ],
    authorAlertUpgrade:
      "Dead-branch retirement (ASSUMES_FALSE): Under RH = True, Deuring's '~RH => h(-D) -> infinity' implication becomes vacuously true. Nothing breaks because Hecke + Siegel already cover h(-D) -> infinity.",
    authorAlertOpen: "Historical 'heads I win, tails you lose' theorem: assumes RH is FALSE.",
    authorAlertFalsifiedOrVacuous:
      "ASSUMES_FALSE activated! If RH is false, Deuring-Mordell's off-line zero repulsion switches from hypothetical curiosity to a live analytic mechanism.",
    agentTrapNote: "TRAP (`polarity-inversion-miss`): Assumes RH is FALSE; proving RH makes Deuring's implication vacuous while Siegel (1935) preserves h(-D) -> infinity.",
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
    conjectureType: "GRH",
    polarity: "ASSUMES_FALSE",
    severity: "CORE_BLOCKER",
    hasUnconditionalFallback: false,
    fallbackSummary:
      "No unconditional proof of Twin Primes exists (current unconditional record is infinitely many prime gaps <= 246 via Maynard-Tao / Polymath8b).",
    hopDepth: 2,
    upstreamIds: ["P15", "ROOT_GRH"],
    extractedQuote:
      "Heath-Brown proved in 1983 that if there are infinitely many Siegel zeros [violating GRH near s = 1], then there are infinitely many twin primes.",
    confidenceScore: 0.99,
    latexBefore: [
      "\\begin{corollary}[Heath-Brown 1983 / Matomäki-Merikoski 2021 — ASSUMES_FALSE]",
      "  Assume GRH fails via infinitely many exceptional Siegel zeros \\beta_0 = 1 - 1/(\\eta\\log q).",
      "  Then \\sum_{n \\le X} \\Lambda(n)\\Lambda(n+2) = X\\mathfrak{S}_2 + o(X) (Twin Primes holds).",
      "\\end{corollary}",
    ],
    latexAfterUpgrade: [
      "\\begin{corollary}[VACUOUS DEAD BRANCH — Siegel Zeros Ruled Out]",
      "  % GRH = True proves NO Siegel zeros exist (beta_0 = 1/2).",
      "  % This conditional proof of Twin Primes evaporates; Twin Primes remains OPEN!",
      "\\end{corollary}",
    ],
    latexAfterFallbackOrVacuous: [
      "\\begin{corollary}[TWIN PRIME CONJECTURE PROVED UNCONDITIONALLY]",
      "  Exceptional Siegel zeros exist (\\neg\\mathrm{GRH}), forcing twin-prime",
      "  asymptotics \\sum_{n \\le X} \\Lambda(n)\\Lambda(n+2) \\sim X\\mathfrak{S}_2!",
      "\\end{corollary}",
    ],
    authorAlertUpgrade:
      "Proving GRH = True kills the Siegel-zero route to the Twin Prime Conjecture! Corollary 1.1 becomes vacuously true with an empty hypothesis, leaving Twin Primes open at gap <= 246.",
    authorAlertOpen:
      "Conditional on GRH failing via infinitely many Landau-Siegel real zeros near s = 1.",
    authorAlertFalsifiedOrVacuous:
      "Plot twist in Siegel-zero mode: If GRH fails via infinitely many Siegel zeros, Heath-Brown (1983) and Matomäki-Merikoski (2021) immediately prove the Twin Prime Conjecture unconditionally.",
    agentTrapNote: "TRAP (`polarity-inversion-miss`): Assumes GRH FAILS via Siegel zeros! Proving GRH makes this branch VACUOUS and does NOT prove Twin Primes!",
  },
];

const LANDMARK_ENRICHMENTS: Record<
  string,
  {
    topicBucket: TopicBucket;
    yearNumeric: number;
    plainSummary: string;
    agentLensConvId?: string;
  }
> = {
  P01: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 1976,
    plainSummary:
      "Pins down the exact Prime Number Theorem error to roughly the square root of x for every number x ≥ 2,657.",
  },
  P02: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2002,
    plainSummary:
      "Rewrites the Riemann Hypothesis as an elementary inequality on the sum of divisors of n for every integer n ≥ 1.",
  },
  P03: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2019,
    plainSummary:
      "Tightens the largest possible gap between consecutive primes to at most (4/π + ε) √p log p using Fourier optimization.",
  },
  P04: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2026,
    plainSummary:
      "Guarantees a prime number inside every short interval [x, x + x^0.525] once x ≥ 3.5 × 10^90 (published Oct 2026).",
    agentLensConvId: "ts-v2-case-01-visser-rh-2026-11-20-17-25-08",
  },
  P05: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2024,
    plainSummary:
      "Already proven without RH: breaks a 50-year barrier capping how many hypothetical off-line zeta zeros could exist.",
  },
  P06: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2026,
    plainSummary:
      "Already verified in Lean 4 with Claude (Aug 2026): proves at least 67.25% of zeta zeros are both simple (no duplicates) and on the critical line.",
    agentLensConvId: "ts-v2-case-08-alpoge-furman-simple-2026-11-20-17-25-08",
  },
  P07: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2025,
    plainSummary:
      "Shows that if basic RH holds, testing Generalized RH for modular arithmetic reduces to checking spacing sums of ordinary zeta zeros.",
  },
  P08: {
    topicBucket: "Algorithms & Complexity",
    yearNumeric: 1990,
    plainSummary:
      "Makes deterministic primality testing fast (~log⁴ n) by guaranteeing a small compositeness witness below 2(ln n)², improving on slower unconditional AKS.",
    agentLensConvId: "ts-v2-case-02-miller-bach-fallback-2026-11-20-17-25-08",
  },
  P09: {
    topicBucket: "Algebra, Knots & Quantum",
    yearNumeric: 2014,
    plainSummary:
      "Proves a short certificate always exists when a tangled 3D loop IS knotted (putting knottedness in coNP, alongside unconditional NP).",
    agentLensConvId: "ts-v2-case-03-kuperberg-unknot-2026-11-20-17-25-08",
  },
  P10: {
    topicBucket: "Algebra, Knots & Quantum",
    yearNumeric: 2018,
    plainSummary:
      "Uses Kuperberg's GRH certificate to show recognizing torus knots has short verifiable proofs in both yes and no directions (NP ∩ coNP).",
  },
  P11: {
    topicBucket: "Algorithms & Complexity",
    yearNumeric: 2024,
    plainSummary:
      "Places a classic algebraic-combinatorics counting question (whether a Schubert coefficient is zero) low in the complexity hierarchy (AM ∩ coAM).",
    agentLensConvId: "ts-v2-case-04-schubert-rh-only-2026-11-20-17-25-08",
  },
  P12: {
    topicBucket: "Cryptography & Security",
    yearNumeric: 2022,
    plainSummary:
      "Proves the mathematical equivalence backing post-quantum SQIsign digital signatures (strengthens post-quantum security proofs — does NOT break RSA or ECC).",
    agentLensConvId: "ts-v2-case-05-wesolowski-sqisign-2026-11-20-17-25-08",
  },
  P13: {
    topicBucket: "Cryptography & Security",
    yearNumeric: 2009,
    plainSummary:
      "Proves short walks on elliptic-curve isogeny graphs mix rapidly like random expanders — a core building block for isogeny cryptography.",
  },
  P14: {
    topicBucket: "Algebra, Knots & Quantum",
    yearNumeric: 1973,
    plainSummary:
      "Proves Artin's primitive-root conjecture and Euclidean division in higher number rings — requires Extended RH (ERH), so RH + GRH alone isn't enough!",
    agentLensConvId: "ts-v2-case-06-hooley-weinberger-erh-2026-11-20-17-25-08",
  },
  P15: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 1934,
    plainSummary:
      "Famous 'heads I win, tails you lose' theorem: assumed RH was FALSE to prove class numbers grow to infinity (later proved unconditionally anyway).",
  },
  P16: {
    topicBucket: "Primes & Number Theory",
    yearNumeric: 2021,
    plainSummary:
      "Wild counterfactual: proves that if GRH FAILS via exceptional 'Siegel zeros', then the Twin Prime Conjecture is immediately true!",
    agentLensConvId: "ts-v2-case-07-siegel-twin-primes-2026-11-20-17-25-08",
  },
};

export const LANDMARK_THEOREMS: TheoremRecord[] = RAW_LANDMARK_THEOREMS.map((t) => {
  const extra = LANDMARK_ENRICHMENTS[t.id];
  const arxivMatch = t.url.match(/arxiv\.org\/abs\/([^?\s]+)$/i);
  return {
    ...t,
    arxivId: t.arxivId ?? arxivMatch?.[1],
    topicBucket: extra?.topicBucket ?? "Primes & Number Theory",
    yearNumeric: extra?.yearNumeric ?? 2020,
    plainSummary: extra?.plainSummary ?? t.title,
    isFeatured: true,
    agentLensUrl: extra?.agentLensConvId
      ? `${AGENT_LENS_CONV_BASE}/${extra.agentLensConvId}`
      : "https://forge.coreweave.com/agent-lens/wandb/theorem-survival",
  };
});

const _seenArxivIds = new Set<string>(
  LANDMARK_THEOREMS.map((t) => t.arxivId).filter((x): x is string => Boolean(x)),
);

export const THEOREMS: TheoremRecord[] = [
  ...LANDMARK_THEOREMS,
  ...adaptCorpusItems(_seenArxivIds),
];

export function normalizeWorldState(
  prev: WorldState,
  field: "rh" | "grh" | "erh",
  nextVal: TruthState,
): WorldState {
  const next: WorldState = { ...prev, [field]: nextVal };
  if (field === "rh" && nextVal === "FALSE") {
    next.grh = "FALSE";
    next.erh = "FALSE";
    next.siegelZero = false;
  }
  if ((field === "grh" || field === "erh") && nextVal === "TRUE") {
    if (next.rh === "FALSE") {
      next.rh = "TRUE";
    }
    if (field === "grh") {
      next.siegelZero = false;
    }
  }
  if (field === "grh" && nextVal !== "FALSE") {
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

export function evaluateTheorem(t: TheoremRecord, ws: WorldState): EvaluatedTheorem {
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

  const truth: TruthState =
    t.conjectureType === "RH"
      ? ws.rh
      : t.conjectureType === "GRH"
        ? ws.grh
        : ws.erh;

  if (truth === "OPEN") {
    const diff = buildDiff(t.latexBefore, t.latexBefore);
    return {
      outcome: "STILL_CONDITIONAL",
      badgeLabel:
        t.polarity === "ASSUMES_FALSE"
          ? `Only If ${t.conjectureType} Fails`
          : `Still Needs ${t.conjectureType}`,
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
          badgeLabel: "Becomes Proven",
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

  if (t.conjectureType === "GRH" && !ws.siegelZero) {
    const noteLines = [
      "\\begin{corollary}[Still Unactivated — Needs Siegel Zeros, Not Just ~RH]",
      "  % An off-line zero of zeta(s) falsifies GRH globally, yet Siegel-zero theorems",
      "  % specifically require real exceptional zeros beta_0 -> 1^- of L(s, chi).",
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
