# Research Contract — TheoremSurvival Attempt 2 (Full Pool + Scope-Accurate Redo)

Frozen: `2026-11-24` before any Attempt 2 harvest, gold-set grading, or model execution.
Base repository commit: `93f4988` (`main` of `github.com/ash0ts/theorem-survival`).

## 1. Research Question and Decision Rule

### Primary Question
Across the deduplicated pool of indexed mathematical and computer science works that conditionally invoke or discuss the Riemann Hypothesis (`RH`), Generalized Riemann Hypothesis (`GRH`), Extended Riemann Hypothesis (`ERH`), or Landau–Siegel zeros:

1. **Literature impact under the machine-checked scope:** How many works in the full pool—and which of the top-100 most-cited works—are settled or sharpened by what Levent Alpöge and Claude's November 20, 2026 Lean 4 archive actually proves (`RH` for $\zeta(s)$ plus `GRH` for Dirichlet $L$-functions $L(s, \chi)$ only, certified by Lean FRO / Mathlib Initiative on Nov 21 and Comparator replay on Nov 23, excluding Dedekind $\zeta_K$, Hecke, Artin, and general automorphic $L$-functions)?
2. **Agent evaluation:** Can an LLM equipped with full-text retrieval and deterministic logic evaluation (`auditor-v3-fulltext`) reliably separate `GRH_DIRICHLET`, `BEYOND_DIRICHLET`, `UNCLEAR`, `MENTION_ONLY`, `DENSITY_BOUND`, and `ASSUMES_FALSE` without a human reading every paper?

### Pre-registered Article Decision Rule
Evaluate all four auditor arms across `T = 3` independent trials per case on two frozen gold sets (`research/gold/named-consequences.json` and `research/gold/heldout-60.json`) before drafting article prose:

- If `auditor-v3-fulltext` does **not** beat the strong single-prompt baseline (`auditor-v1-rules`, given the identical 7-class rubric on title + abstract) on `heldout-60`, the article reports that result directly rather than claiming full-text tools won overall, and isolates the subset where full text changed the answer (such as silent abstracts or ambiguous `"assuming GRH"` phrasing).
- Papers whose full text says `"assuming GRH"` without specifying Dirichlet vs. Dedekind/number-field $L$-functions resolve to `UNCLEAR` and are never counted as settled.
- Papers that mention `RH`/`GRH` only as background motivation or historical comparison resolve to `MENTION_ONLY` and are excluded from all "changed" numerators.

## 2. Prior Attempt Preserved (Attempt 1)

Attempt 1 artifacts are preserved unchanged for audit and flip comparison:

- Benchmark trace snapshot: `research/attempt-1/verified-traces.v1.json` (`auditor-v1-naive` `4/8` outcome / `0/8` strict vs. `auditor-v2-guarded` `8/8` on 8 hand-picked trap cases).
- Abstract-only 144-preprint classifications: `research/attempt-1/corpus-v1-labels.json` (and local `out/corpus-classified.v1.json`).
- Upstream Forge EvalTables run: `https://forge.coreweave.com/wandb/wandb/theorem-survival/runs/r8te6qh1`.
- Upstream CoreWeave Agent Lens traces: `177` initial turns in `https://forge.coreweave.com/agent-lens/wandb/theorem-survival`.

### Documented Attempt 1 Flaws Corrected Here
1. **Conjecture conflation:** Attempt 1 used one `GRH` bucket for both Dirichlet $L(s, \chi)$ (machine-checked) and Dedekind/Hecke/Artin $L$-functions (still open), overstating how many `"assuming GRH"` papers the Nov 20 archive settles.
2. **Self-graded benchmark:** `server/auditor.ts` lines 176–186 returned hand-authored fields from `THEOREMS` whenever `matchedKnownId` hit one of the 16 landmarks, and `scripts/forge-demo.ts` graded against those same fields (`8/8` by construction).
3. **Tilted naive baseline:** `auditor-v1-naive` injected `"Assume Levent Alpöge's Nov 20, 2026 announcement means the Riemann Hypothesis was proved..."` and defaulted parse failures to `UPGRADED_UNCONDITIONAL`.
4. **Capped unranked corpus:** `scripts/harvest-arxiv.ts` capped queries at 30–55 hits (`160` total works), omitted citation/importance ranking, and missed papers whose abstracts omit the conditional clause.

## 3. Pool Harvest Protocol (`scripts/harvest-pool.ts`)

Four discovery sources are queried and recorded in `foundBySources` per work:

1. **`arxiv_abstract` (uncapped pagination):** Official arXiv Atom API (`export.arxiv.org/api/query`, `200` results/page, `>= 3.0s` between requests) across conditional/conjecture queries for `"generalized Riemann hypothesis"`, `GRH`, `"extended Riemann hypothesis"`, `ERH`, `"Dedekind zeta"`, `"Siegel zero"`, `"Siegel zeros"`, `"Deuring-Heilbronn"`, and `"Riemann hypothesis"` paired with conditional markers (`assuming`, `conditional`, `under`, `modulo`, `equivalent`, `if`), excluding `math.GM` and unverified claims of proving/disproving RH itself.
2. **`openalex_fulltext`:** OpenAlex `works` API cursor pagination across full-text assumption phrases (`"assuming the generalized Riemann hypothesis"`, `"assuming GRH"`, `"under the generalized Riemann hypothesis"`, `"conditional on the generalized Riemann hypothesis"`, `"assuming the Riemann hypothesis"`, `"under the Riemann hypothesis"`, `"assuming the extended Riemann hypothesis"`, `"assuming ERH"`).
3. **`anchor_citations`:** OpenAlex works citing canonical conditional anchors—Miller (1976), Bach (1990), Lagarias–Odlyzko (1977), Lagarias–Montgomery–Odlyzko (1979), Hooley (1967), Weinberger (1973), Ankeny (1952), Schoenfeld (1976), and Heath-Brown (1983)—restricted to works matching RH/GRH/ERH/Siegel-zero terms in title, abstract, or full-text search.
4. **`curated_classics`:** Pre-arXiv and canonical named results from MathOverflow Q17209 (including post-Nov-20 updates), Andrew Sutherland's verification log (`math.mit.edu/~drew/grh/`), Wikipedia's GRH consequences, and Moree's 2012 Artin primitive-root survey, each stored with a verbatim quote and source locator.

### Deduplication and Importance Tiers
- **Deduplication key order:** canonical `arxivId` (version stripped, lowercase) $\to$ normalized `doi` (lowercase) $\to$ normalized alphanumeric `title` + publication year ($\pm 1$ year).
- **Citation hydration:** Every pooled work is matched against OpenAlex to record `citedByCount` (integer, `0` only when OpenAlex returns `cited_by_count = 0`; `null` if unmatched in OpenAlex).
- **Importance tiers:** `TOP_100` (top 100 works by `citedByCount` across the deduplicated pool), `TOP_500` (ranks 101–500), and `TAIL` (rank > 500 or `null`), alongside `isNamedLandmark: boolean`.

## 4. Taxonomy and World-State Semantics

### Conjecture Dependency Classes (`ConjectureType`)
- `RH`: Classical Riemann Hypothesis for $\zeta(s)$ only. **Covered** by the checked Lean archive.
- `GRH_DIRICHLET`: Generalized Riemann Hypothesis for Dirichlet $L$-functions $L(s, \chi)$ over $\mathbb{Q}$. **Covered** by the checked Lean archive.
- `BEYOND_DIRICHLET`: Dedekind $\zeta_K(s)$ over number fields $K \neq \mathbb{Q}$, Hecke $L$-functions, Artin $L$-functions, or general automorphic / Selberg-class $L$-functions (often called `ERH` or number-field `GRH`). **Not covered** by the checked archive; remains open.
- `UNCLEAR`: Paper states a conditional dependency on `"GRH"` (or `"RH"` family) without specifying in retrievable text whether Dirichlet $L$-functions suffice or Dedekind/number-field $L$-functions are required. **Never counted as settled** under `checked_nov24`.
- `DENSITY_BOUND`: Theorem is already proved unconditionally (e.g., unconditional zero-density estimates, unconditional zero-free regions, or papers that eliminate a prior GRH hypothesis).
- `MENTION_ONLY`: Work mentions `RH`/`GRH`/`ERH` only in passing, historical motivation, or comparison while its own main theorems are unconditional and not superseded. Excluded from all "changed" counts.

### World-State Presets
- `checked_nov24` (**default** — "Today: RH + Dirichlet GRH Checked in Lean"): `rh = TRUE`, `grhDirichlet = TRUE`, `beyondDirichlet = OPEN`, `siegelZero = false` (machine-checked in Lean 4 and independent kernels; human peer review still pending).
- `pre_nov20_open` ("Before Nov 20: All Open"): `rh = OPEN`, `grhDirichlet = OPEN`, `beyondDirichlet = OPEN`.
- `rh_only` ("If Only Basic RH Held"): `rh = TRUE`, `grhDirichlet = OPEN`, `beyondDirichlet = OPEN`.
- `full_ladder` ("If Number-Field ERH Also Holds"): `rh = TRUE`, `grhDirichlet = TRUE`, `beyondDirichlet = TRUE`.
- `siegel_zero_twist` ("Counterfactual: Dirichlet GRH Fails via Siegel Zeros"): `rh = TRUE`, `grhDirichlet = FALSE`, `beyondDirichlet = FALSE`, `siegelZero = true`.
- `rh_false` ("Counterfactual: Classical RH Disproved"): `rh = FALSE`, `grhDirichlet = FALSE`, `beyondDirichlet = FALSE`.

## 5. Auditor Arms, Models, and Trial Protocol

### Arms (`server/auditor.ts`, `server/fulltext.ts`)
1. `auditor-v1-neutral`: Single prompt on `title + abstract + worldState`. No leading note about Nov 20; invalid/unparseable JSON records `PARSE_ERROR` (scored incorrect).
2. `auditor-v1-rules`: Single prompt on `title + abstract + worldState` with the complete 6-class + polarity + fallback rubric in the system instructions.
3. `auditor-v2-abstract`: Tool pipeline on `title + abstract` (`fetch_work_metadata` $\to$ `scan_abstract_clauses` $\to$ LLM structured classification $\to$ deterministic `evaluate_world_state_diff`), with zero lookup into `THEOREMS` or `research/gold/`.
4. `auditor-v3-fulltext`: Tool pipeline with full-text window extraction (`fetch_work_metadata` $\to$ `fetch_fulltext_windows` over arXiv HTML `arxiv.org/html/<id>` or e-print `.tex` source `arxiv.org/e-print/<id>` $\to$ `extract_assumption_passages` with section/line locators $\to$ LLM structured classification grounded in extracted passages $\to$ deterministic `evaluate_world_state_diff`). Records `evidenceTier: "fulltext" | "abstract_only"`.

### Actor Settings and Models
- Endpoint: CoreWeave Forge Serverless Inference (`https://api.inference.wandb.ai/v1`), project header `OpenAI-Project: wandb/theorem-survival`.
- Primary model (all 4 arms + full-pool audit): `zai-org/GLM-5.3-Flash` (`temperature = 0.1`, `reasoning_effort = "low"`, `chat_template_kwargs = {"enable_thinking": false}`, JSON mode).
- Scale comparison model (`auditor-v1-neutral` and `auditor-v1-rules` on both gold sets): `moonshotai/Kimi-K2.6` with identical decoding flags, testing whether model size alone resolves abstract-level scope ambiguity.
- Trials: `T = 3` independent runs per `(gold_case, arm, model)`, keyed by `(experiment, suite, arm, model, trial, case_id)`.

## 6. Gold Sets and Code Isolation

Frozen in `research/gold/` prior to running `scripts/run-benchmark.ts`:

1. `research/gold/named-consequences.json` (`24` canonical named theorems from the public post-Nov-20 discourse, grounded in MathOverflow Q17209 and Sutherland's scope verification, with exact locator URLs and quotes).
2. `research/gold/heldout-60.json` (`60` pooled works: `20` from `TOP_100` by citations including `MENTION_ONLY` papers, `20` from number-field-vocabulary `GRH` candidates, `20` seeded random draw with `seed = 20261124` from the remainder; each labelled from quoted full text with section/line locator, or `UNCLEAR` when the full text never specifies which `GRH`).
3. `src/isolation.test.ts` statically verifies that `server/auditor.ts`, `server/fulltext.ts`, and `scripts/classify-corpus.ts` never import or read `research/gold/*` or `LANDMARK_THEOREMS` labels.

## 7. Measures and Estimands

Every metric reports exact `numerator / denominator` per trial plus `mean (min..max)` across `T = 3` trials:

- `class_polarity_accuracy`: `# cases matching (gold.conjectureType, gold.polarity) / N_suite` (`N = 24` or `N = 60`; `PARSE_ERROR` stays in denominator as `0`).
- `outcome_accuracy_checked_nov24`: `# cases matching gold.expectedOutcomeCheckedNov24 / N_suite`.
- `strict_contract_accuracy`: `# cases matching (conjectureType, polarity, hasUnconditionalFallback, expectedOutcomeCheckedNov24) / N_suite`.
- `decisive_class_accuracy` & `unclear_recall`: Reported separately on `gold.conjectureType != "UNCLEAR"` (`N_decisive`) vs. `gold.conjectureType == "UNCLEAR"` (`N_unclear`).
- `flip_rate_attempt1_144`: `# of the 144 Attempt-1 arXiv preprints whose dependency class or checked-scope outcome changed under v3-fulltext / 144`, tabulated as a transition matrix.
- `fulltext_coverage`: `# pooled works with retrieved full-text windows / N_pool` (and `/ 100` for `TOP_100`).

## 8. Stop Gates, Rate Limits, and Reproduction Commands

- **Budget stop gate:** Hard ceiling `$25.00 USD` across all benchmark and corpus inference calls; live token-cost accumulator halts execution at `$24.00 USD`.
- **External rate limits:** `>= 3,000 ms` between `export.arxiv.org` metadata requests; polite concurrency (`<= 2` with `>= 1,000 ms` spacing and local disk cache `out/fulltext/`) on `arxiv.org/html` and `arxiv.org/e-print`; OpenAlex polite pool (`<= 5 req/s`).
- **Privacy & leak gate:** `pnpm scrub` must pass with zero matches for secrets, tokens, emails, or local filesystem paths.
- **Reproduction commands:**
  - `pnpm tsx scripts/harvest-pool.ts`
  - `pnpm tsx scripts/run-benchmark.ts`
  - `pnpm tsx scripts/classify-corpus.ts`
  - `uv run python scripts/publish-forge-eval.py`
  - `pnpm check && pnpm build:embed`
