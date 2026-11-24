# Attempt 2 Benchmark Summary (Frozen Gold Sets, 3 Trials / Arm)

- **Generated (UTC):** 2026-11-24T11:46:13.618Z
- **Agent Lens Project:** `wandb/theorem-survival` (`theorem-survival-auditor`)
- **Cumulative Spend:** $1.9521 across 3,024 LLM calls (cap: $25.00)
- **Pre-registered decision check (`heldout-60`):** `v3-fulltext` vs `v1-rules` (GLM-5.3-Flash): **+2.3 pp** on 6-class conjecture accuracy (51.33/60 vs 50/60), **+4.4 pp** on checked-scope outcome (51/60 vs 48.33/60).

## 1. Held-Out Stratified Benchmark (`heldout-60`, N = 60 per trial, 50 non-settled)

| Arm + Model | 6-Class Conjecture (mean / 60) | Per-Trial Conjecture (`T1, T2, T3`) | Checked Outcome (mean / 60) | False-Settled Claims (mean / 50) | Parse Errors (`/180`) | p50 / p95 (ms) |
| --- | ---: | :---: | ---: | ---: | ---: | ---: |
| v1-neutral (GLM-5.3-Flash, abstract) | **34.67 / 60** (57.8%) | `34, 34, 36` | **37.33 / 60** (62.2%) | 14.67 / 50 (29.3%) | 2 | 1288 / 2980 |
| v1-neutral (Kimi-K2.6, abstract) | **23.33 / 60** (38.9%) | `26, 23, 21` | **29.67 / 60** (49.4%) | 20 / 50 (40%) | 0 | 1668 / 11844 |
| v1-rules (GLM-5.3-Flash, abstract + rules) | **50 / 60** (83.3%) | `52, 49, 49` | **48.33 / 60** (80.6%) | 1.67 / 50 (3.3%) | 0 | 1356 / 3317 |
| v1-rules (Kimi-K2.6, abstract + rules) | **48.33 / 60** (80.6%) | `48, 49, 48` | **49 / 60** (81.7%) | 3 / 50 (6%) | 0 | 1464 / 4241 |
| v2-abstract (GLM-5.3-Flash + abstract tools) | **49 / 60** (81.7%) | `48, 50, 49` | **49.67 / 60** (82.8%) | 2 / 50 (4%) | 1 | 1307 / 3496 |
| v3-fulltext (GLM-5.3-Flash + full-text tools) | **51.33 / 60** (85.6%) | `52, 51, 51` | **51 / 60** (85%) | 4 / 50 (8%) | 0 | 1388 / 2924 |

## 2. Named Public Consequences (`named-24`, N = 24 per trial, 14 non-settled)

| Arm + Model | 6-Class Conjecture (mean / 24) | Per-Trial Conjecture (`T1, T2, T3`) | Checked Outcome (mean / 24) | False-Settled Claims (mean / 14) | Parse Errors (`/72`) |
| --- | ---: | :---: | ---: | ---: | ---: |
| v1-neutral (GLM-5.3-Flash, abstract) | **17.67 / 24** (73.6%) | `18, 17, 18` | **12 / 24** (50%) | 6.33 / 14 (45.2%) | 0 |
| v1-neutral (Kimi-K2.6, abstract) | **16.67 / 24** (69.4%) | `17, 17, 16` | **17 / 24** (70.8%) | 6.33 / 14 (45.2%) | 0 |
| v1-rules (GLM-5.3-Flash, abstract + rules) | **24 / 24** (100%) | `24, 24, 24` | **22.67 / 24** (94.4%) | 0 / 14 (0%) | 0 |
| v1-rules (Kimi-K2.6, abstract + rules) | **23 / 24** (95.8%) | `23, 23, 23` | **21.33 / 24** (88.9%) | 1 / 14 (7.1%) | 0 |
| v2-abstract (GLM-5.3-Flash + abstract tools) | **24 / 24** (100%) | `24, 24, 24` | **22 / 24** (91.7%) | 0 / 14 (0%) | 0 |
| v3-fulltext (GLM-5.3-Flash + full-text tools) | **24 / 24** (100%) | `24, 24, 24` | **22.67 / 24** (94.4%) | 0 / 14 (0%) | 0 |

## 3. Held-Out Breakdown by Stratum (Mean 6-Class Conjecture Exact / 20)

| Stratum | `v1-neutral-glm` | `v1-neutral-kimi` | `v1-rules-glm` | `v1-rules-kimi` | `v2-abstract-glm` | `v3-fulltext-glm` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `TOP_100` | 13.67 / 20 | 5.67 / 20 | 14.67 / 20 | 15 / 20 | 16 / 20 | 16.33 / 20 |
| `NUMBER_FIELD_GRH` | 7.67 / 20 | 7.67 / 20 | 17.33 / 20 | 18.33 / 20 | 16.67 / 20 | 18 / 20 |
| `REST_STRATIFIED` | 13.33 / 20 | 10 / 20 | 18 / 20 | 15 / 20 | 16.33 / 20 | 17 / 20 |
