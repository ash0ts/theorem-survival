# TheoremSurvival

Plain-English explorer of **160 real arXiv and landmark papers** showing what changes if the Riemann Hypothesis (`RH`), Generalized RH (`GRH`), or Extended RH (`ERH`) is proved, audited on CoreWeave Forge Serverless Inference and traced with CoreWeave Agent Lens.

Live hosted app: **https://ash0ts.github.io/theorem-survival/**  
Companion CoreWeave Forge Report: **https://forge.coreweave.com/wandb/wandb/agent-lens-fc/reports/Which-Papers-Actually-Change-If-the-Riemann-Hypothesis-Holds--VmlldzoxODM0MjcxNw==**

## Why we built this

On November 20, 2026, Levent Alpöge posted a four-page note and a 14-part Lean 4 archive claiming an AI-assisted proof with Claude of both the Riemann Hypothesis (`RH`) and the Generalized Riemann Hypothesis (`GRH`), with the Extended Riemann Hypothesis (`ERH`) expected later. By `15:07 UTC`, an independent check had confirmed the archive hash and compiled the challenge statement against `Mathlib`, while the full Lean `Comparator` proof-term replay remained in progress.

Whenever `RH` trends, social threads flatten all conditional mathematics into one switch. In practice, conditional papers across `math.NT`, `cs.CC`, and `cs.CR` split into distinct outcomes depending on which conjecture holds:

1. Theorems blocked solely on classical `RH` for \(\zeta(s)\), such as Matt Visser's October 2026 explicit cutoff \(x \ge 3.5 \times 10^{90}\) for primes in \([x, x + x^{21/40}]\) (`arXiv:2610.27830`, citing Carneiro–Milinovich–Soundararajan `1708.04122`) and Lagarias's harmonic divisor bound (`math/0008177`).
2. Algorithms and security reductions that stay conditional under `RH` alone and need Dirichlet `GRH`, including Benjamin Wesolowski's FOCS 2021 equivalence behind post-quantum signature scheme `SQIsign` (`2111.01481`), Baldwin and Sivek's torus/satellite knot complexity theorems (`1706.04424`), and Miller–Bach deterministic \(\tilde{O}((\log n)^4)\) primality testing.
3. Algebraic and combinatorics results that still wait on Dedekind `ERH` over general number fields even if `RH` and Dirichlet `GRH` pass, including Hooley's proof of Artin's primitive root conjecture, Weinberger's theorem that PID number rings with infinite units are Euclidean, and Pak and Robichaux's `SchubertVanishing` \(\in \mathsf{coAM}\) (`2412.02064`).
4. Results that already have an unconditional proof or fallback bound (`SHARPENS_BOUND`), such as Kuperberg's `Knottedness` \(\in \mathsf{NP}\) modulo `GRH` (`1112.0845`, later proved unconditionally by Lackenby `1604.03778`) and Alpöge–Furman's August 2026 Lean-verified theorem that \(\ge 67.25\%\) of \(\zeta(s)\) zeros are simple and on the critical line (`2608.13637`, whose simplicity bound is not superseded by `RH` alone).
5. `ASSUMES_FALSE` branches (`¬RH` or Landau–Siegel zeros violating `GRH`), including Heath-Brown (1983) and Matomäki–Merikoski (`2112.11412`), where proving `GRH = True` rules out Siegel zeros and retires that conditional route to the Twin Prime Conjecture as vacuous.

Every state in the app is synced into the URL query string (`?preset=alpoge_rh_grh&thm=P04`), so clicking **Copy Share Link** in the header shares the exact world-state and `.tex` theorem diff you are viewing.

## Quick start (local with live Forge Agent Lens)

Requires Node 22+ and `pnpm`.

```bash
git clone https://github.com/ash0ts/theorem-survival.git
cd theorem-survival
./try-it.sh
```

Open **http://localhost:5180**. Without credentials, the simulator and deterministic auditor run offline. If you have run `wandb login` (`~/.netrc`) or exported `WANDB_API_KEY`, Vite mounts `/api/audit` locally so auditing any arXiv ID calls CoreWeave Forge Serverless Inference (`zai-org/GLM-5.3-Flash`) and streams OpenTelemetry GenAI traces straight to CoreWeave Agent Lens.

## CoreWeave Forge Agent Lens component

When we asked a bare model (`auditor-v1-naive`) to classify 8 conditional papers directly from their arXiv abstracts under a target world-state, it got **4 of 8** outcome verdicts wrong (`50%` outcome accuracy, `0/8` strict schema + fallback match, `57.4s` wall time):

- On Kuperberg (`1112.0845`), `v1` missed Lackenby's unconditional proof (`1604.03778`) and called `Knottedness` \(\in \mathsf{NP}\) newly unlocked.
- On Pak–Robichaux (`2412.02064`) and Hooley/Weinberger, `v1` conflated abelian Dirichlet `GRH` with Kummer Dedekind `ERH` and marked both unconditional even when `ERH` was still open.
- On Alpöge–Furman (`2608.13637`), `v1` missed the distinction between critical-line location (`RH`) and simple-zero multiplicity.

In `auditor-v2-guarded` (`server/auditor.ts`, traced via `@coreweave/forge-sdk/agentlens/tracing` in `server/tracing.ts`), each turn runs four traced tool spans (`fetch_arxiv_metadata`, `scan_conditional_clauses`, `traverse_citation_hops`, `evaluate_world_state_diff`) before synthesis, reaching **8 of 8** exact matches in `10.4s` (`5.5x` faster). We then audited the full harvested arXiv corpus (`auditor-v2-corpus`, 161 preprints across `math.NT`, `cs.CC`, `cs.CR`, `cs.DS`, `math.CO`, `math.GT`, `quant-ph`) into the same Agent Lens project (**177** verified invocations total).

Live Forge links from the committed benchmark (`src/data/verified-traces.json`):

- Agent Lens conversations & span waterfalls (177 turns): https://forge.coreweave.com/agent-lens/wandb/theorem-survival
- Online 5-tag LLM judge view (`rh-grh-erh-conflated`, `missed-unconditional-fallback`, `polarity-inversion-miss`, `crypto-break-hallucination`, `simplicity-vs-location-blur`): https://forge.coreweave.com/agent-lens/wandb/theorem-survival/conversations?tags=rh-grh-erh-conflated,missed-unconditional-fallback,polarity-inversion-miss,crypto-break-hallucination,simplicity-vs-location-blur
- Paired `v1` vs `v2` `wandb.EvalTable` + 160-paper corpus run: https://forge.coreweave.com/wandb/wandb/theorem-survival/runs/r8te6qh1

Re-run the live Agent Lens benchmark, sync online judge tags, or republish the `EvalTable`:

```bash
pnpm demo                                                   # runs 8 cases x 2 versions on Forge Inference & verifies on trace.wandb.ai
pnpm demo --no-llm                                          # offline deterministic verification (runs in CI)
pnpm tags                                                   # syncs agentlens/tags.json to CoreWeave Agent Lens
uv run --with wandb python scripts/publish-forge-eval.py    # logs paired wandb.EvalTable
```

## Verification

```bash
pnpm check     # tsc -b + corpus/trace validator + Vitest + secret/local-path scrub
pnpm build     # builds static bundle into dist/
```

## License

MIT (`LICENSE`).
