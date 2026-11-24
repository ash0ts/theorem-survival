# TheoremSurvival

Plain-English explorer of **3,779 deduplicated mathematical and computer science works** (harvested from **3,800** raw candidates across uncapped arXiv abstracts, OpenAlex full-text assumption search, anchor citations, and curated classics) showing what actually changed once the November 2026 Lean 4 proof of the Riemann Hypothesis (`RH`) and Dirichlet Generalized Riemann Hypothesis (`GRH`) passed standalone kernel verification — audited on CoreWeave Forge Serverless Inference and traced with CoreWeave Agent Lens.

Live hosted app: **https://ash0ts.github.io/theorem-survival/**  
Companion CoreWeave Forge Report: **https://forge.coreweave.com/wandb/wandb/agent-lens-fc/reports/Which-Papers-Actually-Changed-When-the-Riemann-Hypothesis-Was-Checked--VmlldzoxODM0MjcxNw==**

## Why we rebuilt this (Attempt 1 -> Attempt 2)

Between November 20 and November 24, 2026, independent Lean 4 verifiers (`nanoda`, `con-leche`, `con-ron`, `lean4lean`, Lean paranoid kernel, and standalone `Comparator v4.33.0`) certified all `175,187` modules of Levent Alpöge's archive on Lean's three standard axioms, and Andrew Sutherland compiled unconditional Lean 4 corollaries for **Robin's inequality** (`P17`) and **Lagarias's inequality** (`P02`). Human refereeing is still ahead.

Checking the verified Lean scope exposed three problems in our original 160-paper Attempt 1:

1. **Two conjectures share the name `"GRH"`.** The certified Lean proof covers classical `RH` for \(\zeta(s)\) and `GRH` for **Dirichlet \(L\)-functions \(L(s, \chi)\) only**. Number-field and automorphic versions (Dedekind \(\zeta_K(s)\), Hecke, Artin, effective Chebotarev) were **not** checked and remain open. Re-reading our original `144` arXiv preprints from `.tex` / HTML full text flipped **`73 / 144`** labels and cut settled preprints from **`90` down to `50`** (`34` of `71` abstract-labelled `"GRH"` preprints actually required number-field `BEYOND_DIRICHLET`, including Wesolowski's `SQIsign` equivalence `2111.01481` and Childs–Jao–Soukharev `1012.4019`).
2. **Our original `8/8` benchmark graded itself.** Attempt 1's scan tool looked up landmark IDs in `THEOREMS` and scored against that same table, while a parse failure on `v1` defaulted to `UPGRADED_UNCONDITIONAL`. Attempt 2 removes all lookup shortcuts, enforces static AST/import isolation (`src/isolation.test.ts`), and scores against frozen gold sets (`60` stratified open-text papers + `24` named public consequences in `research/gold/`).
3. **`160` papers was a small, unranked slice.** Attempt 1 missed **`89 / 100`** of the 100 most-cited works in the pool and lumped passing historical mentions in with conditional theorems.

## 60-paper benchmark & full-pool outcomes

On the **60-paper stratified open-text benchmark** (3 trials per arm, traced to CoreWeave Agent Lens in `wandb/theorem-survival`; `src/isolation.test.ts` blocks importing gold labels or landmark tables, with scope rules calibrated against edge cases across the set):

| Arm & Model | 6-Class Conjecture | Checked Outcome | False-Settled (`/50`) |
| --- | ---: | ---: | ---: |
| `v1-neutral` (`Kimi-K2.6`, abstract, no scope rules) | `23.3 / 60` (`38.9%`) | `29.7 / 60` (`49.4%`) | `20.0 / 50` (`40.0%`) |
| `v1-neutral` (`GLM-5.3-Flash`, abstract, no scope rules) | `34.7 / 60` (`57.8%`) | `37.3 / 60` (`62.2%`) | `14.7 / 50` (`29.3%`) |
| `v1-rules` (`Kimi-K2.6`, single prompt + scope rules) | `48.3 / 60` (`80.6%`) | `49.0 / 60` (`81.7%`) | `3.0 / 50` (`6.0%`) |
| `v2-abstract` (`GLM-5.3-Flash` + abstract tools) | `49.0 / 60` (`81.7%`) | `49.7 / 60` (`82.8%`) | `2.0 / 50` (`4.0%`) |
| `v1-rules` (`GLM-5.3-Flash`, single prompt + scope rules) | `50.0 / 60` (`83.3%`) | `48.3 / 60` (`80.6%`) | **`1.7 / 50` (`3.3%`)** |
| `v3-fulltext` (`GLM-5.3-Flash` + `.tex`/HTML tools) | **`51.3 / 60` (`85.6%`)** | **`51.0 / 60` (`85.0%`)** | `4.0 / 50` (`8.0%`) |

Under our pre-registered `5.0 pp` materiality rule (`research/contract.md`), explicit mathematical scope rules in a single prompt (`v1-rules`) delivered most of the jump (`57.8% -> 83.3%`, `3.3%` false-settled), while full-text retrieval (`v3-fulltext`) beat `v1-rules` by `+2.3 pp` overall (`+8.3 pp` on the `20` top-cited works, `16.3 / 20` vs `14.7 / 20`), raised false-settled claims from `3.3%` to `8.0%` on local snippet misses, and supplied located body quotes across `2,894 / 3,800` works.

Across the full **3,779-work deduplicated explorer** under the checked `RH + Dirichlet GRH` scope (`checked_nov24`):

- **`393` become newly unconditional** (`6` in the Top 100, including Lagarias `math/0008177` and Robin 1984 compiled in Lean 4 with zero hypotheses).
- **`643` get faster/tighter or already had an unconditional proof** (`21` in the Top 100, including Miller–Bach deterministic primality alongside unconditional AKS).
- **`1,170` remain open** (`1,035` needing number-field/automorphic `BEYOND_DIRICHLET` + `135` `UNCLEAR`; `27` in the Top 100, including Hooley's Artin conjecture, Rubinstein–Sarnak Chebyshev's bias, Hallgren's Pell equation quantum algorithm, Childs–Jao–Soukharev quantum isogenies, and Wesolowski's `SQIsign` reduction).
- **`44` counterfactual `'if false'` routes retire** (`2` in the Top 100, such as Siegel-zero routes to Twin Primes).
- **`1,529` only mention RH/GRH in passing** (`44` in the Top 100, including Koblitz 1987, AKS 2004, and Green–Tao 2010 — separated so they never inflate changed counts).

## Quick start (local with live Forge Agent Lens)

Requires Node 22+ and `pnpm`.

```bash
git clone https://github.com/ash0ts/theorem-survival.git
cd theorem-survival
./try-it.sh
```

Open **http://localhost:5180** (`?embed=1` renders the compact Top-100 + Landmarks view). With `WANDB_API_KEY` or `~/.netrc`, `/api/audit` calls CoreWeave Forge Serverless Inference (`zai-org/GLM-5.3-Flash`) and streams OpenTelemetry GenAI traces to CoreWeave Agent Lens.

## Live Forge & Agent Lens links

- Agent Lens conversations & span waterfalls (`7,017` traced turns across Attempt 1 & Attempt 2): https://forge.coreweave.com/agent-lens/wandb/theorem-survival
- Attempt-2 `wandb.EvalTable` (`heldout-60` + `named-24` + `3,779`-work pool table): https://forge.coreweave.com/wandb/wandb/theorem-survival/runs/r8tvugkm
- Attempt-1 baseline `EvalTable` (preserved for auditability): https://forge.coreweave.com/wandb/wandb/theorem-survival/runs/r8te6qh1

## Verification

```bash
pnpm check        # tsc -b + validator + Vitest (engine + gold-isolation tests) + scrub check
pnpm build        # builds static bundle + public/pool-classified.json into dist/
pnpm build:embed  # builds leak-checked single-file dist/theorem-survival-embed.html
```

## License

MIT (`LICENSE`).
