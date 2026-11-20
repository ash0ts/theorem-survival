# CoreWeave Agent Lens Tags for `theorem-survival-auditor`

Project: `https://forge.coreweave.com/agent-lens/wandb/theorem-survival`

When an LLM reads a number-theory or theoretical-CS abstract and predicts what happens if the Riemann Hypothesis is proved, five domain errors show up repeatedly. In `auditor-v1-naive`, the model only sees the paper abstract and target world-state. In `auditor-v2-guarded`, four deterministic tools (`fetch_arxiv_metadata`, `scan_conditional_clauses`, `traverse_citation_hops`, `evaluate_world_state_diff`) inspect the conjecture hierarchy, assumption polarity, and known unconditional fallbacks before the model writes its structured `TheoremSurvival` verdict.

`pnpm tags` registers these five online LLM-judge criteria in CoreWeave Agent Lens so every new `/api/audit` turn is automatically scored within minutes:

1. `rh-grh-erh-conflated` — Treating classical `RH` for \(\zeta(s)\) as enough for a result that requires Dirichlet `GRH` (`SQIsign`, deterministic Miller primality, torus/satellite knots) or Dedekind `ERH` (Hooley's Artin conjecture, Weinberger's Euclidean number rings, `SchubertVanishing` in \(\mathsf{PH}\)).
2. `missed-unconditional-fallback` — Calling a result brand-new without noting an existing unconditional proof or bound (Lackenby `1604.03778` for `Knottedness` in \(\mathsf{NP}\), AKS `math/0208045` for `PRIMES` in \(\mathsf{P}\), Baker–Harman–Pintz for prime gaps).
3. `polarity-inversion-miss` — Misreading `ASSUMES_FALSE` theorems (`¬RH` or Siegel-zero `¬GRH`, such as Deuring–Heilbronn `2201.03990` or Matomäki–Merikoski `2112.11412` on Twin Primes) as proven rather than vacuous when `RH`/`GRH` holds.
4. `crypto-break-hallucination` — Repeating the viral myth that proving `RH` or `GRH` breaks RSA or post-quantum crypto, when `GRH` actually upgrades `SQIsign`'s hardness equivalence (`2111.01481`) to unconditional.
5. `simplicity-vs-location-blur` — Claiming `RH` completely obsoletes Alpöge–Furman (`2608.13637`, \(\ge 67.25\%\) simple and critical-line zeros), forgetting that `RH` puts zeros on \(\Re(s)=1/2\) without forbidding double zeros.
