import fs from "node:fs";
import path from "node:path";

const inspection = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "out", "heldout-60-inspection.json"), "utf8")
) as any[];

type GoldTuple = [
  goldId: string,
  conjectureType: "RH" | "GRH_DIRICHLET" | "BEYOND_DIRICHLET" | "UNCLEAR" | "DENSITY_BOUND" | "MENTION_ONLY",
  polarity: "ASSUMES_TRUE" | "ASSUMES_FALSE",
  hasUnconditionalFallback: boolean,
  locator: string,
  quote: string,
];

const LABELS: GoldTuple[] = [
  ["H01", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "Abstract & §1 (Math. Comp. 65, 1996)", "Let E/K be an abelian extension of number fields, with E != Q... We prove the following theorems, assuming the Extended Riemann Hypothesis: There is a degree-1 prime p of K..."],
  ["H02", "MENTION_ONLY", "ASSUMES_TRUE", true, "PDF p. 9 (Ann. of Math. 155, 2002)", "All Theorems 1-14 are unconditional; p. 9 only remarks in passing that an exponent may be reduced under standard hypotheses on Hasse-Weil L-functions."],
  ["H03", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §Other properties of knots (L2148)", "Main #P-hardness theorem is unconditional; L2148 mentions in passing: 'recognizing the unknot is in NP, and in coNP assuming the generalized Riemann hypothesis'."],
  ["H04", "MENTION_ONLY", "ASSUMES_TRUE", true, "Math. Comp. 83 (2014), §1", "Unconditional numerical verification of even Goldbach up to 4 * 10^18; zeta zeros and Hardy-Littlewood appear only as empirical comparisons."],
  ["H05", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §Introduction (L57)", "Main theorems prove D(P(f, a_0)) = 0 unconditionally for quadratic recurrences; §1 only cites Stephens and Lagarias on GRH for linear recurrences."],
  ["H06", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "main.tex §1 Theorem thm:GRHasymp (L132)", "Suppose the Generalized Riemann Hypothesis holds for the family of L-functions L(s, f x chi_d) for all fundamental discriminants d, and also for zeta(s) [matching lower bound proved unconditionally]."],
  ["H07", "RH", "ASSUMES_TRUE", true, "main.tex §Lower bounds Theorem main (L181)", "We prove unconditionally that R(n) < e^gamma for n >= 31... We prove that the statement R(N_n) > e^gamma / zeta(2) for n >= 3 is equivalent to the Riemann Hypothesis."],
  ["H08", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "PDF p. 2 Theorem 1 & p. 16 §4", "Assuming the extended Riemann hypothesis, there exists a probabilistic algorithm that solves the discrete logarithm problem in the class group of an imaginary quadratic field [hyperelliptic case is unconditional]."],
  ["H09", "DENSITY_BOUND", "ASSUMES_TRUE", true, "main.tex §1 Theorem bank (L48)", "The Riemann hypothesis is true up to height 3,000,175,332,800 [rigorous unconditional interval-arithmetic verification]."],
  ["H10", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §The recipe (L780, L893)", "Formulates heuristic ratios conjectures across L-function families ('We wish to conjecture a precise asymptotic formula... We assume the Riemann Hypothesis'); proves no conditional theorem."],
  ["H11", "MENTION_ONLY", "ASSUMES_TRUE", true, "Hybrid_Model_2b1.tex Theorems 1-3", "Rigorous Euler-product and random-matrix moment theorems are unconditional; RH is invoked only temporarily in heuristic motivation for the Splitting Conjecture."],
  ["H12", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "simulations.tex §Simulating (L177)", "Composing Koiran's AM algorithm for the Nullstellensatz [which relies on Dedekind effective Chebotarev] simulates characteristic-zero proofs in coAM; finite-field results are unconditional."],
  ["H13", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §Introduction (L131)", "Main split-Cartan theorem for p > p_0 is completely unconditional; L131 only recalls the authors' earlier [BP08] GRH result for X_split(p^5)."],
  ["H14", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §Motivations (L162)", "Proves Gaussian multiplicative chaos convergence for random Hermitian matrices unconditionally; mentions Najnudel's RH result for zeta only in related work."],
  ["H15", "DENSITY_BOUND", "ASSUMES_TRUE", true, "main.tex §Introduction (L80)", "Establishes explicit prime-counting bounds without RH using verified zero heights and explicit zero-free regions."],
  ["H16", "MENTION_ONLY", "ASSUMES_TRUE", true, "PDF p. 2-4 (Nonlinearity 9, 1996)", "Heuristic RMT correlation calculation combining RH with the unproved Hardy-Littlewood prime-pair conjecture; proves no rigorous theorem from RH."],
  ["H17", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "arXiv2016May31.tex §New results (L192) & Def. def:adn (L1178)", "O(n log n log log n) Clifford gates for infinitely many admissible n assuming ERH [index of <2> in Z_{2n+1}^* via Kummer/Artin ERH]; O(n log^2 n log log n) Clifford construction is unconditional."],
  ["H18", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "PDF p. 2 Theorem 1 & p. 6", "Theorem 1: Assuming the truth of the Riemann hypothesis for imaginary quadratic number fields [Bach's 6(ln |D|)^2 prime-ideal class-group generators], the algorithm constructs an isogeny."],
  ["H19", "MENTION_ONLY", "ASSUMES_TRUE", true, "poly.tex Abstract & §Expander graphs (L1722)", "Summer-school expository lecture notes surveying elliptic curves and quoting Jao-Miller-Venkatesan's GRH expander theorem; proves no new conditional theorem."],
  ["H20", "MENTION_ONLY", "ASSUMES_TRUE", true, "PDF p. 6-7 (Math. Comp. 48, 1987)", "Introduces elliptic curve cryptosystems and proves an unconditional non-smoothness theorem; cites Hooley, Gupta-Murty, and Serre's GRH results only as background."],
  ["H21", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "HypincoNP-paper-ref-edits.tex §1 (L131, L168, L579)", "Unconditionally recovers Satellite Knot Recognition in NP; cusped non-hyperbolicity in NP assumes S^3-recognition in coNP (proved by Zentner under Kuperberg/Koiran Dedekind Chebotarev GRH)."],
  ["H22", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "HTML §1 Theorem 1.1", "Theorem 1.1 (GRH): explicit inequalities for smoothed Chebyshev prime-ideal sums psi_K^(1)(x) of a number field K != Q under GRH for the Dedekind zeta function zeta_K(s)."],
  ["H23", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "main.tex §Introduction (L31, L150)", "Derives prime densities for the quasi r-rank Artin problem subject to GRH for Kummer Dedekind zeta functions (following Hooley 1967), alongside unconditional finiteness sufficiency."],
  ["H24", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "HTML §1 & Theorem 1.4", "Proves refined Artin primitive-root generating-function densities under GRH for Dedekind zeta functions of cyclotomic-Kummer extensions, plus weaker unconditional versions."],
  ["H25", "MENTION_ONLY", "ASSUMES_TRUE", true, "S3-arxiv.tex Abstract & §1 (L91)", "Proves unconditional asymptotic formulas for Artin-type prime-index problems over number fields without assuming GRH."],
  ["H26", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "main.tex §2 Theorem Nonequidistribution-theorem (L168)", "Assume GRH [for automorphic / Rankin-Selberg L-functions] and the Generalized Ramanujan Conjecture (GRC) for Hecke-Maass cusp forms."],
  ["H27", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "lowlyingzeros.tex §1 (L70, L105, L127)", "Calculates 1-level density support up to 1 conditional on GRH for twisted Hecke cuspform L-functions, plus unconditional support up to 1 - 1/(2 kappa)."],
  ["H28", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "paper.tex §1 Theorems 1A-3A (L195-L244)", "Assume GRH [for Hecke L-functions of class-group characters of number field K]: bounds prime-ideal generators of Cl(K) by (4 - 1/(2n)) log^2 Delta, improving unconditional sqrt(Delta) bounds."],
  ["H29", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "1leveldensitylowerorder_23.tex §1 Theorem quadraticmainthm (L146)", "Suppose that GRH holds for the family of quadratic Hecke L-functions in the Gaussian field Q(i) as well as for Dedekind zeta_K(s)."],
  ["H30", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "C3ClassNumber-v4.TEX §1 & §Proof (L641, L1022)", "Listed 138 cubic fields with h_m < 16 are certified unconditionally via bnfcertify; completeness for -1 <= m <= 10^7 relies on PARI/GP bnfinit under Dedekind/Hecke GRH."],
  ["H31", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "PDF p. 3-4 Theorem 1.1 & Theorem 1.2", "Places Schubert coefficient vanishing in AM intersect coAM via Koiran / Ait El Manssour Parametric Hilbert's Nullstellensatz (relying on Dedekind effective Chebotarev)."],
  ["H32", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "main.tex §2 Theorem mainz (L134)", "Computes explicit prime density for near-primitive roots of index t under GRH for Kummer number-field Dedekind zeta functions (generalizing Hooley 1967)."],
  ["H33", "GRH_DIRICHLET", "ASSUMES_TRUE", true, "Description / Abstract", "Assuming GRH for Dirichlet L-functions and 5/6 < theta < 1, proves weighted Hecke-eigenvalue average at prime squares converges at rate K^{-2(1-theta)} (with unconditional limit identification)."],
  ["H34", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "main.tex §1 Theorem thm:big (L238)", "Proves HN in AM under weaker Dedekind zero-moment hypotheses (DZH/GIPIT) and sharpens C_F = O(sigma(F)^{2.01}) under Dedekind GRH, alongside exponential unconditional bound."],
  ["H35", "GRH_DIRICHLET", "ASSUMES_TRUE", true, "Description / Abstract", "Assuming GRH for Dirichlet L-functions and 8/9 < theta < 1, proves prime-cube murmuration convergence at rate K^{-2(1-theta)} (with unconditional limit formula)."],
  ["H36", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "main.tex Abstract & Theorems main-thm1/2 (L265, L438)", "Under the assumption of Generalized Riemann Hypothesis (GRH) for Dedekind zeta functions, bounds Frobenius trace distribution for products of non-CM elliptic curves."],
  ["H37", "MENTION_ONLY", "ASSUMES_TRUE", true, "Abstract / Streszczenie", "Establishes unconditional bounds on the Euler-Kronecker constant gamma_K in terms of potential Siegel zeros without assuming GRH."],
  ["H38", "MENTION_ONLY", "ASSUMES_TRUE", true, "e3hard_arxiv2.tex Abstract & §1 (L186)", "Proves unconditionally that simplicial-complex embeddability in R^3 is NP-hard; mentions unknot/S^3 recognition in coNP under GRH only as contrast."],
  ["H39", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "GWvan_arxiv.tex §1 Main Theorem (L838) & §2 (L1084)", "Places 3-pointed genus-0 Gromov-Witten vanishing in AM via Parametric Hilbert's Nullstellensatz (Koiran's Dedekind Chebotarev reduction)."],
  ["H40", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "Mayle-Wang_v5.tex §1 Theorem main-thrm-1 & Remark 1 (L79, L170)", "Bounds open-image constant c(A) under GRH for Dedekind zeta functions, with Remark 1 noting weaker unconditional bounds from unconditional effective Chebotarev."],
  ["H41", "GRH_DIRICHLET", "ASSUMES_TRUE", false, "main.tex §1 Theorem cor:1 & Lemma 2.3 (L161, L375)", "Assuming GRH for primitive Dirichlet L-functions L(s, chi), proves at least 11/12 (>91%) of nontrivial zeros of primitive Dirichlet L-functions are simple."],
  ["H42", "RH", "ASSUMES_TRUE", false, "PDF p. 3 Corollary 1", "Derives prime-series identities under the assumption that the classical Riemann Hypothesis for zeta(s) holds."],
  ["H43", "RH", "ASSUMES_TRUE", true, "_Multi_self_approx_for_real_final_.tex Abstract & §1 (L55, L165)", "Proves joint universality unconditionally for nonzero shifts, and shows generalized strong recurrence with both zero and nonzero shifts is equivalent to classical RH."],
  ["H44", "GRH_DIRICHLET", "ASSUMES_TRUE", true, "Gaps_for_Dirichlet.tex §1 Theorem thm:small & thm:large (L43)", "Proves small zero gaps mu <= 1/2 unconditionally, and large gaps lambda > 3.63846723 assuming RH for a fixed primitive Dirichlet L-function L(s, chi)."],
  ["H45", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "PDF p. 4-7 Proposition 3.2 & Theorem 3.1", "Subexponential class-group and unit-group computation in large-degree number fields relying on Bach's 48(log |Delta|)^2 Dedekind-ERH prime-ideal generator bound plus smoothness heuristics."],
  ["H46", "RH", "ASSUMES_TRUE", false, "Description / Abstract", "We prove, under RH alone, that -log lambda_min(sqrt(mu)) <= C mu^{6/5} log mu (1 + log log mu) for windowed Weil quadratic forms."],
  ["H47", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §1 (L71) & Theorems 1-4", "Proves elementary unconditional representation theorems for four ternary quadratic forms; mentions Rouse's GRH assumption only in introductory history."],
  ["H48", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex Theorems 1-2 & §Some Omega-results (L788)", "All lattice-point exponent and Omega theorems are unconditional; L788 mentions Littlewood's GRH class-number bound only to explain a limitation."],
  ["H49", "RH", "ASSUMES_TRUE", true, "main.tex §1 Theorem maintheorem (L98)", "Prime gap graphs exist unconditionally for every sufficiently large n, and assuming the classical Riemann hypothesis they exist for every n >= 2."],
  ["H50", "MENTION_ONLY", "ASSUMES_TRUE", true, "BNPZ_binomial_rev.tex §2 (L218)", "'In the first version of this paper, we had a slightly different approach... assuming GRH. All the arguments in the present version of the paper are unconditional.'"],
  ["H51", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "main.tex §The main result Theorem main2 (L270)", "Assumes GRH and Artin's Holomorphy Conjecture for Artin L-functions attached to non-CM modular newforms."],
  ["H52", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §Introduction & §Taylor Series (L41, L187)", "Exploratory harmonic-function discussion of xi(s) zero contours; proves no conditional theorem assuming RH."],
  ["H53", "MENTION_ONLY", "ASSUMES_TRUE", true, "20250924_S_n_function_fields.tex §Setup (L251) & Theorems 1-2", "Proves unconditional Littlewood-type bounds for hyperelliptic L-functions over F_q[x] (where Weil's RH is a proved theorem); classical RH is cited only for motivation."],
  ["H54", "BEYOND_DIRICHLET", "ASSUMES_TRUE", false, "main.tex §1 Main Theorem (L107)", "Assume the Riemann Hypothesis AND that all zeros of zeta(s) are simple [the Simple Zeros Conjecture is NOT proved by RH or Dirichlet GRH]."],
  ["H55", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex Abstract & §1 (L70)", "Proves explicit Chen's theorem unconditionally for every even integer > exp(exp(36)), bypassing potential Siegel zeros via inclusion-exclusion."],
  ["H56", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex §1 Theorem thm:main (L30)", "Proves unconditional >> X^{1/4 - eps} lower bound on L^1 norm of Mobius/Liouville exponential sums; notes even GRH does not currently improve Theorem 1."],
  ["H57", "BEYOND_DIRICHLET", "ASSUMES_TRUE", true, "main.tex §Effective bounds Prop. P:main effective (L1063)", "Sharpens unconditional x/(log x)^{1+1/d} exceptional-place bound for abelian varieties over number fields K to x^{1-1/(2d)} under Serre's Dedekind-GRH effective Chebotarev."],
  ["H58", "RH", "ASSUMES_TRUE", false, "main.tex §Spectral Reformulations Theorem Thm:qual (L733)", "The spectral operator a_c is quasi-invertible for all c in (0,1) - {1/2} if and only if the classical Riemann hypothesis is true."],
  ["H59", "MENTION_ONLY", "ASSUMES_TRUE", true, "main.tex Abstract & §Evidence (L1541)", "Refers to the 'Riemann hypothesis over finite fields' (Deligne's proved Weil conjectures) in geometric complexity theory; does not assume classical RH or GRH."],
  ["H60", "DENSITY_BOUND", "ASSUMES_TRUE", true, "Note_Narkiewicz_arxiv.tex §Introduction Scholium (I) (L197)", "Relies on a uniform zero-free strip Re(s) > 1 - 10^{-6} (Quasi-RH) for cyclotomic characters rather than full GRH to prove totally real abelian PIDs are Euclidean."],
];

if (LABELS.length !== 60 || inspection.length !== 60) {
  throw new Error(`Expected 60 labels and 60 inspection items; got ${LABELS.length} and ${inspection.length}`);
}

const gold60 = inspection.map((it, idx) => {
  const [goldId, goldConjectureType, goldPolarity, goldHasUnconditionalFallback, goldLocator, goldVerbatimQuote] =
    LABELS[idx];
  return {
    goldId,
    stratum: it.stratum,
    poolId: it.poolId,
    arxivId: it.arxivId,
    doi: it.doi,
    oaUrl: it.oaUrl,
    url: it.url,
    title: it.title,
    authors: it.authors,
    year: it.year,
    primaryCategory: it.primaryCategory,
    citedByCount: it.citedByCount,
    importanceRank: it.importanceRank,
    importanceTier: it.importanceTier,
    foundBySources: it.foundBySources,
    inputAbstract: it.abstractText,
    goldConjectureType,
    goldPolarity,
    goldHasUnconditionalFallback,
    goldLocator,
    goldVerbatimQuote,
  };
});

const outPath = path.join(process.cwd(), "research", "gold", "heldout-60.json");
fs.writeFileSync(outPath, JSON.stringify(gold60, null, 2));

const counts: Record<string, number> = {};
for (const g of gold60) counts[g.goldConjectureType] = (counts[g.goldConjectureType] ?? 0) + 1;
console.log(`Frozen 60 held-out gold items -> ${outPath}`);
console.log("Class distribution:", counts);
