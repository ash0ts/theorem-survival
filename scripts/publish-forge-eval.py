#!/usr/bin/env python3
"""Log the paired auditor-v1-naive vs auditor-v2-guarded EvalTable to CoreWeave Forge (wandb/theorem-survival)."""
from __future__ import annotations

import json
import os
from pathlib import Path

import wandb

ROOT = Path(__file__).resolve().parent.parent
TRACES_PATH = ROOT / "src" / "data" / "verified-traces.json"

INPUT_COLS = [
    "case_id",
    "theorem_id",
    "arxiv_or_doi",
    "preset",
    "trap_focus",
    "expected_outcome",
]
OUTPUT_COLS = [
    "v1_outcome",
    "v1_author_alert",
    "v1_agent_lens_url",
    "v2_outcome",
    "v2_author_alert",
    "v2_agent_lens_url",
]
SCORE_COLS = [
    "v1_outcome_match",
    "v1_exact_schema_match",
    "v2_outcome_match",
    "v2_exact_schema_match",
    "v1_wall_ms",
    "v2_wall_ms",
]


def main() -> None:
    snapshot = json.loads(TRACES_PATH.read_text(encoding="utf-8"))
    project_slug = os.environ.get("FORGE_PROJECT", snapshot["project"])
    entity, project = project_slug.split("/", 1)

    rows = []
    for c in snapshot["cases"]:
        v1 = c["v1"]
        v2 = c["v2"]
        v1_out_ok = v1["predictedOutcome"] == c["expectedOutcome"]
        v2_out_ok = v2["predictedOutcome"] == c["expectedOutcome"]
        rows.append(
            [
                c["caseId"],
                c["theoremId"],
                c["arxivOrDoi"],
                c["presetLabel"],
                c["trapFocus"],
                c["expectedOutcome"],
                v1["predictedOutcome"],
                v1["authorAlert"],
                v1["agentLensUrl"] or "",
                v2["predictedOutcome"],
                v2["authorAlert"],
                v2["agentLensUrl"] or "",
                v1_out_ok,
                bool(v1["exactMatch"]),
                v2_out_ok,
                bool(v2["exactMatch"]),
                int(v1["wallMs"]),
                int(v2["wallMs"]),
            ]
        )

    run = wandb.init(
        entity=entity,
        project=project,
        name="auditor-v1-vs-v2-eval",
        job_type="eval-table",
        config={
            "model": snapshot["model"],
            "agent_name": snapshot["agentName"],
            "cases": len(rows),
            "generated_at_utc": snapshot["generatedAtUtc"],
        },
    )
    try:
        eval_table = wandb.EvalTable(
            columns=INPUT_COLS + OUTPUT_COLS + SCORE_COLS,
            data=rows,
            input_columns=INPUT_COLS,
            output_columns=OUTPUT_COLS,
            score_columns=SCORE_COLS,
        )
        run.log({"auditor/v1_vs_v2": eval_table})

        v1_outcome_acc = sum(1 for r in rows if r[12]) / len(rows)
        v2_outcome_acc = sum(1 for r in rows if r[14]) / len(rows)
        run.summary.update(
            {
                "v1/outcome_accuracy": v1_outcome_acc,
                "v1/exact_schema_accuracy": snapshot["summary"]["v1Accuracy"],
                "v2/outcome_accuracy": v2_outcome_acc,
                "v2/exact_schema_accuracy": snapshot["summary"]["v2Accuracy"],
                "v1/total_wall_ms": sum(r[16] for r in rows),
                "v2/total_wall_ms": sum(r[17] for r in rows),
                "agent_lens_url": snapshot["agentLensProjectUrl"],
            }
        )
        print(f"Published EvalTable run: {run.url}")
    finally:
        run.finish()


if __name__ == "__main__":
    main()
