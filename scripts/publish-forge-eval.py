#!/usr/bin/env python3
"""Publish the Attempt-2 Held-Out Benchmark EvalTables + Full ~3,800-Paper Pool Table to CoreWeave Forge (`wandb/theorem-survival`), then verify by upstream readback."""
from __future__ import annotations

import json
import os
from pathlib import Path

import wandb

ROOT = Path(__file__).resolve().parent.parent
BENCH_SUMMARY_PATH = ROOT / "research" / "benchmark-summary.json"
BENCH_TRIALS_PATH = ROOT / "out" / "benchmark-trials.json"
POOL_SUMMARY_PATH = ROOT / "research" / "pool-audit-summary.json"
FLIP_PATH = ROOT / "research" / "flip-report-144.json"
CORPUS_EXPORT_PATH = ROOT / "out" / "theorems-full-export.json"
OUT_RECEIPT_PATH = ROOT / "out" / "forge-eval-run.json"

INPUT_COLS = [
    "gold_id",
    "stratum",
    "title",
    "gold_conjecture",
    "gold_polarity",
    "expected_outcome",
]
OUTPUT_COLS = [
    "v1_neutral_conjecture",
    "v1_neutral_outcome",
    "v1_neutral_trace",
    "v1_rules_conjecture",
    "v1_rules_outcome",
    "v1_rules_trace",
    "v1_rules_kimi_conjecture",
    "v1_rules_kimi_outcome",
    "v2_abstract_conjecture",
    "v2_abstract_outcome",
    "v3_fulltext_conjecture",
    "v3_fulltext_outcome",
    "v3_fulltext_trace",
]
SCORE_COLS = [
    "v1_neutral_conj_ok",
    "v1_neutral_out_ok",
    "v1_rules_conj_ok",
    "v1_rules_out_ok",
    "v1_rules_kimi_conj_ok",
    "v2_abstract_conj_ok",
    "v3_fulltext_conj_ok",
    "v3_fulltext_out_ok",
]


def build_eval_rows(trials_by_key: dict, dataset_name: str, gold_ids: list[str]) -> list[list]:
    rows = []
    for gid in gold_ids:
        t_neu = trials_by_key[f"v1-neutral-glm::T1::{gid}"]
        t_rul = trials_by_key[f"v1-rules-glm::T1::{gid}"]
        t_kim = trials_by_key[f"v1-rules-kimi::T1::{gid}"]
        t_v2 = trials_by_key[f"v2-abstract-glm::T1::{gid}"]
        t_v3 = trials_by_key[f"v3-fulltext-glm::T1::{gid}"]
        if t_neu["dataset"] != dataset_name:
            continue
        rows.append(
            [
                gid,
                t_neu["stratum"],
                t_neu["title"],
                t_neu["goldConjecture"],
                t_neu["goldPolarity"],
                t_neu["expectedOutcome"],
                t_neu["predictedConjecture"],
                t_neu["predictedOutcome"],
                t_neu["agentLensUrl"] or "",
                t_rul["predictedConjecture"],
                t_rul["predictedOutcome"],
                t_rul["agentLensUrl"] or "",
                t_kim["predictedConjecture"],
                t_kim["predictedOutcome"],
                t_v2["predictedConjecture"],
                t_v2["predictedOutcome"],
                t_v3["predictedConjecture"],
                t_v3["predictedOutcome"],
                t_v3["agentLensUrl"] or "",
                bool(t_neu["conjectureExact"]),
                bool(t_neu["outcomeMatch"]),
                bool(t_rul["conjectureExact"]),
                bool(t_rul["outcomeMatch"]),
                bool(t_kim["conjectureExact"]),
                bool(t_v2["conjectureExact"]),
                bool(t_v3["conjectureExact"]),
                bool(t_v3["outcomeMatch"]),
            ]
        )
    return rows


def main() -> None:
    bench_summary = json.loads(BENCH_SUMMARY_PATH.read_text(encoding="utf-8"))
    trials_by_key = json.loads(BENCH_TRIALS_PATH.read_text(encoding="utf-8"))
    pool_summary = json.loads(POOL_SUMMARY_PATH.read_text(encoding="utf-8"))
    flip_summary = json.loads(FLIP_PATH.read_text(encoding="utf-8"))
    corpus_rows = json.loads(CORPUS_EXPORT_PATH.read_text(encoding="utf-8"))

    project_slug = os.environ.get("FORGE_PROJECT", bench_summary["project"])
    entity, project = project_slug.split("/", 1)

    heldout_ids = [f"H{i:02d}" for i in range(1, 61)]
    named_ids = [f"NC{i:02d}" for i in range(1, 25)]

    heldout_rows = build_eval_rows(trials_by_key, "heldout_60", heldout_ids)
    named_rows = build_eval_rows(trials_by_key, "named_24", named_ids)

    run = wandb.init(
        entity=entity,
        project=project,
        name=f"attempt2-heldout60-and-{len(corpus_rows)}-paper-pool",
        job_type="eval-table-v2",
        config={
            "primary_model": "zai-org/GLM-5.3-Flash",
            "scale_comparison_model": "moonshotai/Kimi-K2.6",
            "trials_per_arm": 3,
            "heldout_cases": len(heldout_rows),
            "named_cases": len(named_rows),
            "raw_pool_works": pool_summary["rawPoolCount"],
            "explorer_papers": len(corpus_rows),
            "generated_at_utc": pool_summary["generatedAtUtc"],
        },
    )

    run_id = run.id
    forge_run_url = f"https://forge.coreweave.com/wandb/{entity}/{project}/runs/{run_id}"

    try:
        heldout_eval = wandb.EvalTable(
            columns=INPUT_COLS + OUTPUT_COLS + SCORE_COLS,
            data=heldout_rows,
            input_columns=INPUT_COLS,
            output_columns=OUTPUT_COLS,
            score_columns=SCORE_COLS,
        )
        named_eval = wandb.EvalTable(
            columns=INPUT_COLS + OUTPUT_COLS + SCORE_COLS,
            data=named_rows,
            input_columns=INPUT_COLS,
            output_columns=OUTPUT_COLS,
            score_columns=SCORE_COLS,
        )
        pool_table = wandb.Table(
            columns=[
                "id",
                "arxiv_or_doi",
                "year",
                "cited_by_count",
                "importance_tier",
                "evidence_tier",
                "quote_locator",
                "topic_bucket",
                "conjecture_type",
                "polarity",
                "checked_nov24_outcome",
                "plain_summary",
                "title",
                "paper_url",
                "agent_lens_url",
            ],
            data=[
                [
                    r["id"],
                    r["arxivOrDoi"],
                    r["yearLabel"],
                    int(r["citedByCount"] or 0),
                    r["importanceTier"],
                    r["evidenceTier"],
                    r["quoteLocator"],
                    r["topicBucket"],
                    r["conjectureType"],
                    r["polarity"],
                    r["checkedNov24Outcome"],
                    r["plainSummary"],
                    r["title"],
                    r["url"],
                    r["agentLensUrl"],
                ]
                for r in corpus_rows
            ],
        )

        run.log(
            {
                "benchmark/heldout_60_arms": heldout_eval,
                "benchmark/named_24_arms": named_eval,
                "corpus/full_pool_papers": pool_table,
            }
        )

        by_arm_h60 = {x["configId"]: x for x in bench_summary["heldout60"]}
        run.summary.update(
            {
                "pool/raw_deduplicated_works": pool_summary["rawPoolCount"],
                "pool/explorer_total_works": pool_summary["explorerTotalCount"],
                "pool/fulltext_works": pool_summary["rawPoolFulltextCount"],
                "pool/abstract_only_works": pool_summary["rawPoolAbstractOnlyCount"],
                "flip_144/class_changed": flip_summary["totalClassChanged"],
                "flip_144/removed_from_settled": flip_summary["flippedFromSettledToOpenOrMention"],
                "heldout60/v1_neutral_glm_conjecture_pct": by_arm_h60["v1-neutral-glm"]["meanConjecturePct"],
                "heldout60/v1_neutral_kimi_conjecture_pct": by_arm_h60["v1-neutral-kimi"]["meanConjecturePct"],
                "heldout60/v1_rules_glm_conjecture_pct": by_arm_h60["v1-rules-glm"]["meanConjecturePct"],
                "heldout60/v1_rules_kimi_conjecture_pct": by_arm_h60["v1-rules-kimi"]["meanConjecturePct"],
                "heldout60/v2_abstract_glm_conjecture_pct": by_arm_h60["v2-abstract-glm"]["meanConjecturePct"],
                "heldout60/v3_fulltext_glm_conjecture_pct": by_arm_h60["v3-fulltext-glm"]["meanConjecturePct"],
                "heldout60/delta_v3_vs_v1_rules_conjecture_pp": bench_summary["decisionRuleEvaluation"]["deltaConjecturePoints"],
                "heldout60/delta_v3_vs_v1_rules_outcome_pp": bench_summary["decisionRuleEvaluation"]["deltaOutcomePoints"],
                "agent_lens_url": f"https://forge.coreweave.com/agent-lens/{project_slug}",
            }
        )
        print(f"Published Attempt-2 EvalTables + Pool Table: {forge_run_url}")
    finally:
        run.finish()

    # Upstream verification via wandb.Api() readback
    api = wandb.Api()
    verified_run = api.run(f"{entity}/{project}/{run_id}")
    receipt = {
        "runId": run_id,
        "wandbUrl": verified_run.url,
        "forgeUrl": forge_run_url,
        "state": verified_run.state,
        "verifiedSummary": {
            k: verified_run.summary.get(k)
            for k in [
                "pool/raw_deduplicated_works",
                "pool/explorer_total_works",
                "pool/fulltext_works",
                "flip_144/class_changed",
                "heldout60/v1_neutral_glm_conjecture_pct",
                "heldout60/v1_rules_glm_conjecture_pct",
                "heldout60/v3_fulltext_glm_conjecture_pct",
                "heldout60/delta_v3_vs_v1_rules_conjecture_pp",
            ]
        },
    }
    OUT_RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("Verified upstream via wandb.Api():", json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
