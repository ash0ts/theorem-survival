/**
 * Step 5 Benchmark Runner (`scripts/run-benchmark.ts`):
 * Evaluates 6 arm-model configurations x 3 trials across BOTH frozen gold sets:
 *   - research/gold/named-consequences.json (24 named public results)
 *   - research/gold/heldout-60.json         (60 stratified held-out papers, seed=20261124)
 *
 * Streams every audit turn to CoreWeave Agent Lens (`wandb/theorem-survival`),
 * checkpoints every completed trial in `out/benchmark-trials.json`, and writes
 * `research/benchmark-summary.json` + `research/benchmark-summary.md`.
 */
import fs from "node:fs";
import path from "node:path";
import namedGold from "../research/gold/named-consequences.json";
import heldoutGold from "../research/gold/heldout-60.json";
import {
  evaluateTheorem,
  PRESETS,
  type ConjectureType,
  type OutcomeKind,
  type Polarity,
  type TheoremRecord,
} from "../src/data/theorems";
import { runTheoremAudit, type AuditorArm } from "../server/auditor";
import {
  resolveForgeCredentials,
  resolveForgeProject,
  resolveWandbKey,
} from "../server/credentials";
import { fetchPaperFullText } from "../server/fulltext";
import { readSpendLedger } from "../server/llm";
import { AGENT_NAME, createTraceRunner } from "../server/tracing";

interface ArmModelSpec {
  configId: string;
  label: string;
  arm: AuditorArm;
  model: string;
  agentVersionTag: string;
  concurrency: number;
}

const ARM_CONFIGS: ArmModelSpec[] = [
  {
    configId: "v1-neutral-glm",
    label: "v1-neutral (GLM-5.3-Flash, abstract)",
    arm: "auditor-v1-neutral",
    model: "zai-org/GLM-5.3-Flash",
    agentVersionTag: "bench-v1-neutral-glm",
    concurrency: 12,
  },
  {
    configId: "v1-neutral-kimi",
    label: "v1-neutral (Kimi-K2.6, abstract)",
    arm: "auditor-v1-neutral",
    model: "moonshotai/Kimi-K2.6",
    agentVersionTag: "bench-v1-neutral-kimi",
    concurrency: 8,
  },
  {
    configId: "v1-rules-glm",
    label: "v1-rules (GLM-5.3-Flash, abstract + rules)",
    arm: "auditor-v1-rules",
    model: "zai-org/GLM-5.3-Flash",
    agentVersionTag: "bench-v1-rules-glm",
    concurrency: 12,
  },
  {
    configId: "v1-rules-kimi",
    label: "v1-rules (Kimi-K2.6, abstract + rules)",
    arm: "auditor-v1-rules",
    model: "moonshotai/Kimi-K2.6",
    agentVersionTag: "bench-v1-rules-kimi",
    concurrency: 8,
  },
  {
    configId: "v2-abstract-glm",
    label: "v2-abstract (GLM-5.3-Flash + abstract tools)",
    arm: "auditor-v2-abstract",
    model: "zai-org/GLM-5.3-Flash",
    agentVersionTag: "bench-v2-abstract-glm",
    concurrency: 12,
  },
  {
    configId: "v3-fulltext-glm",
    label: "v3-fulltext (GLM-5.3-Flash + full-text tools)",
    arm: "auditor-v3-fulltext",
    model: "zai-org/GLM-5.3-Flash",
    agentVersionTag: "bench-v3-fulltext-glm",
    concurrency: 12,
  },
];

const TRIALS = 3;

interface UnifiedGoldCase {
  dataset: "named_24" | "heldout_60";
  stratum: string;
  goldId: string;
  title: string;
  authors: string;
  year: number;
  category: string;
  arxivId?: string;
  doi?: string;
  oaUrl?: string;
  url: string;
  inputAbstract: string;
  goldConjectureType: ConjectureType;
  goldPolarity: Polarity;
  goldHasUnconditionalFallback: boolean;
  expectedOutcomeCheckedNov24: OutcomeKind;
}

export interface TrialRecord {
  key: string;
  configId: string;
  arm: AuditorArm;
  model: string;
  agentVersionTag: string;
  trial: number;
  dataset: "named_24" | "heldout_60";
  stratum: string;
  goldId: string;
  title: string;
  conversationId: string;
  agentLensUrl: string | null;
  evidenceTier: string;
  parseError: boolean;
  predictedConjecture: string;
  predictedPolarity: string;
  predictedFallback: boolean;
  predictedOutcome: string;
  goldConjecture: ConjectureType;
  goldPolarity: Polarity;
  goldFallback: boolean;
  expectedOutcome: OutcomeKind;
  conjectureExact: boolean;
  settledBinaryMatch: boolean;
  falseSettledClaim: boolean;
  outcomeMatch: boolean;
  tupleExactMatch: boolean;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  wallMs: number;
  extractedQuote: string;
  quoteLocator?: string;
}

function isSettledByCheckedProof(c: string, polarity = "ASSUMES_TRUE"): boolean {
  if (polarity !== "ASSUMES_TRUE") return false;
  return c === "RH" || c === "GRH_DIRICHLET";
}

function computeExpectedOutcome(
  goldConj: ConjectureType,
  goldPolarity: Polarity,
  goldFallback: boolean,
): OutcomeKind {
  const checkedState = PRESETS.find((p) => p.id === "checked_nov24")!.state;
  const dummy: TheoremRecord = {
    id: "GOLD",
    shortNodeTitle: "Gold",
    arxivOrDoi: "GOLD",
    url: "",
    title: "Gold",
    authors: "",
    yearLabel: "2026",
    category: "math.NT",
    theoremLabel: "Main",
    conjectureType: goldConj,
    polarity: goldPolarity,
    severity: goldFallback ? "SHARPENS_BOUND" : "CORE_BLOCKER",
    hasUnconditionalFallback: goldFallback,
    fallbackSummary: "",
    hopDepth: 1,
    upstreamIds: [],
    extractedQuote: "",
    confidenceScore: 1,
    latexBefore: ["a"],
    latexAfterUpgrade: ["b"],
    latexAfterFallbackOrVacuous: ["c"],
    authorAlertUpgrade: "",
    authorAlertOpen: "",
    authorAlertFalsifiedOrVacuous: "",
    agentTrapNote: "",
  };
  return evaluateTheorem(dummy, checkedState).outcome;
}

function buildGoldCases(): UnifiedGoldCase[] {
  const out: UnifiedGoldCase[] = [];
  for (const n of namedGold as any[]) {
    out.push({
      dataset: "named_24",
      stratum: "NAMED_PUBLIC",
      goldId: n.goldId,
      title: n.title,
      authors: n.authors,
      year: n.year,
      category: "math.NT",
      arxivId: n.arxivId,
      doi: n.doi,
      oaUrl: n.oaUrl,
      url: n.arxivId
        ? `https://arxiv.org/abs/${n.arxivId}`
        : n.doi
          ? `https://doi.org/${n.doi}`
          : "",
      inputAbstract: n.inputAbstract,
      goldConjectureType: n.goldConjectureType,
      goldPolarity: n.goldPolarity,
      goldHasUnconditionalFallback: n.goldHasUnconditionalFallback,
      expectedOutcomeCheckedNov24: computeExpectedOutcome(
        n.goldConjectureType,
        n.goldPolarity,
        n.goldHasUnconditionalFallback,
      ),
    });
  }
  for (const h of heldoutGold as any[]) {
    out.push({
      dataset: "heldout_60",
      stratum: h.stratum,
      goldId: h.goldId,
      title: h.title,
      authors: h.authors,
      year: h.year,
      category: h.primaryCategory ?? "math.NT",
      arxivId: h.arxivId,
      doi: h.doi,
      oaUrl: h.oaUrl,
      url: h.url,
      inputAbstract: h.inputAbstract,
      goldConjectureType: h.goldConjectureType,
      goldPolarity: h.goldPolarity,
      goldHasUnconditionalFallback: h.goldHasUnconditionalFallback,
      expectedOutcomeCheckedNov24: computeExpectedOutcome(
        h.goldConjectureType,
        h.goldPolarity,
        h.goldHasUnconditionalFallback,
      ),
    });
  }
  return out;
}

function percentile(sortedVals: number[], p: number): number {
  if (sortedVals.length === 0) return 0;
  const idx = Math.min(
    sortedVals.length - 1,
    Math.max(0, Math.floor((p / 100) * sortedVals.length)),
  );
  return sortedVals[idx];
}

async function verifyUpstreamAgentVersions(project: string, key: string) {
  const basic = Buffer.from(`api:${key}`).toString("base64");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://trace.wandb.ai/agents/agent-versions/query", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: project,
          agent_name: AGENT_NAME,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          versions?: Array<{ agent_version: string; invocation_count: number }>;
        };
        if (data.versions?.length) return data.versions;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

async function main() {
  const creds = resolveForgeCredentials();
  const key = resolveWandbKey();
  const project = resolveForgeProject();
  if (!creds) {
    throw new Error("Missing Forge Serverless Inference credentials.");
  }

  const cases = buildGoldCases();
  console.log(`Loaded ${cases.length} frozen gold cases (24 named + 60 held-out).`);

  // Warm full-text cache for named-consequences (heldout-60 is already cached!)
  console.log("Pre-warming full-text cache for named-consequences...");
  for (const c of cases.filter((x) => x.dataset === "named_24")) {
    await fetchPaperFullText({
      arxivId: c.arxivId,
      doi: c.doi,
      oaUrl: c.oaUrl,
      poolId: c.goldId,
    });
  }

  const trialsPath = path.join(process.cwd(), "out", "benchmark-trials.json");
  const existing: Record<string, TrialRecord> = fs.existsSync(trialsPath)
    ? JSON.parse(fs.readFileSync(trialsPath, "utf8"))
    : {};

  const tracer = createTraceRunner({
    project,
    spanProcessor: "batch",
    enabled: Boolean(key),
  });
  const tracingOn = await tracer.enabled();
  console.log(
    `Tracing=${tracingOn} -> https://forge.coreweave.com/agent-lens/${project}\n`,
  );

  for (const cfg of ARM_CONFIGS) {
    const workQueue: { goldCase: UnifiedGoldCase; trial: number; key: string }[] = [];
    for (let trial = 1; trial <= TRIALS; trial++) {
      for (const gc of cases) {
        const k = `${cfg.configId}::T${trial}::${gc.goldId}`;
        if (!existing[k]) {
          workQueue.push({ goldCase: gc, trial, key: k });
        }
      }
    }

    console.log(
      `=== [${cfg.configId}] ${cfg.label} | remaining=${workQueue.length}/${cases.length * TRIALS} ===`,
    );

    let cursor = 0;
    let doneInArm = 0;

    async function worker() {
      while (cursor < workQueue.length) {
        const item = workQueue[cursor++];
        const gc = item.goldCase;
        const convId = `ts-bench2-${cfg.configId}-t${item.trial}-${gc.goldId.toLowerCase()}`;

        const res = await runTheoremAudit(
          {
            query: gc.arxivId ?? gc.goldId,
            paperInput: {
              id: gc.goldId,
              arxivId: gc.arxivId,
              doi: gc.doi,
              oaUrl: gc.oaUrl,
              title: gc.title,
              authors: gc.authors,
              year: gc.year,
              category: gc.category,
              abstractText: gc.inputAbstract,
              url: gc.url,
            },
            presetId: "checked_nov24",
            agentVersion: cfg.arm,
            agentVersionTagOverride: cfg.agentVersionTag,
            modelOverride: cfg.model,
            conversationId: convId,
          },
          { creds, tracer },
        );

        const dep = res.extraction.dependencies[0];
        const predConj = dep.conjecture_type;
        const predPol = dep.assumption_polarity;
        const predFb = dep.has_unconditional_fallback;
        const predOut = res.predictedOutcome;

        const goldSettled = isSettledByCheckedProof(gc.goldConjectureType, gc.goldPolarity);
        const predSettled =
          !res.parseError && isSettledByCheckedProof(predConj, predPol);

        const rec: TrialRecord = {
          key: item.key,
          configId: cfg.configId,
          arm: cfg.arm,
          model: cfg.model,
          agentVersionTag: cfg.agentVersionTag,
          trial: item.trial,
          dataset: gc.dataset,
          stratum: gc.stratum,
          goldId: gc.goldId,
          title: gc.title,
          conversationId: res.conversationId,
          agentLensUrl: res.agentLensUrl,
          evidenceTier: res.evidenceTier,
          parseError: res.parseError,
          predictedConjecture: predConj,
          predictedPolarity: predPol,
          predictedFallback: predFb,
          predictedOutcome: predOut,
          goldConjecture: gc.goldConjectureType,
          goldPolarity: gc.goldPolarity,
          goldFallback: gc.goldHasUnconditionalFallback,
          expectedOutcome: gc.expectedOutcomeCheckedNov24,
          conjectureExact: !res.parseError && predConj === gc.goldConjectureType,
          settledBinaryMatch: !res.parseError && predSettled === goldSettled,
          falseSettledClaim: !goldSettled && predSettled,
          outcomeMatch: !res.parseError && predOut === gc.expectedOutcomeCheckedNov24,
          tupleExactMatch:
            !res.parseError &&
            predConj === gc.goldConjectureType &&
            predPol === gc.goldPolarity &&
            predFb === gc.goldHasUnconditionalFallback &&
            predOut === gc.expectedOutcomeCheckedNov24,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          estimatedUsd: res.estimatedUsd,
          wallMs: res.wallMs,
          extractedQuote: dep.extracted_quote,
          quoteLocator: dep.quote_locator,
        };

        existing[item.key] = rec;
        doneInArm += 1;
        if (doneInArm % 25 === 0 || doneInArm === workQueue.length) {
          fs.writeFileSync(trialsPath, JSON.stringify(existing, null, 2));
          const ledger = readSpendLedger();
          console.log(
            `  [${cfg.configId}] ${doneInArm}/${workQueue.length} done (cumSpend=$${ledger.totalEstimatedUsd.toFixed(4)})`,
          );
        }
      }
    }

    if (workQueue.length > 0) {
      await Promise.all(Array.from({ length: cfg.concurrency }, () => worker()));
      fs.writeFileSync(trialsPath, JSON.stringify(existing, null, 2));
      await tracer.flush();
    }
  }

  await tracer.flush();
  await tracer.shutdown();

  const allRecords = Object.values(existing);
  const upstreamVersions = key ? await verifyUpstreamAgentVersions(project, key) : [];

  function summarizeSubset(datasetFilter: "heldout_60" | "named_24") {
    const denomPerTrial = datasetFilter === "heldout_60" ? 60 : 24;
    const nonSettledPerTrial = cases.filter(
      (c) =>
        c.dataset === datasetFilter &&
        !isSettledByCheckedProof(c.goldConjectureType, c.goldPolarity),
    ).length;

    return ARM_CONFIGS.map((cfg) => {
      const rows = allRecords.filter(
        (r) => r.configId === cfg.configId && r.dataset === datasetFilter,
      );
      const perTrial = [1, 2, 3].map((t) => {
        const tr = rows.filter((r) => r.trial === t);
        const conjHits = tr.filter((r) => r.conjectureExact).length;
        const settledHits = tr.filter((r) => r.settledBinaryMatch).length;
        const falseSettled = tr.filter((r) => r.falseSettledClaim).length;
        const outcomeHits = tr.filter((r) => r.outcomeMatch).length;
        const tupleHits = tr.filter((r) => r.tupleExactMatch).length;
        const parseErrs = tr.filter((r) => r.parseError).length;
        return {
          trial: t,
          n: tr.length,
          conjectureExact: conjHits,
          settledBinaryMatch: settledHits,
          falseSettledClaims: falseSettled,
          falseSettledDenom: nonSettledPerTrial,
          outcomeMatch: outcomeHits,
          tupleExactMatch: tupleHits,
          parseErrors: parseErrs,
        };
      });

      const walls = rows.map((r) => r.wallMs).sort((a, b) => a - b);
      const meanConj =
        perTrial.reduce((s, x) => s + x.conjectureExact, 0) / TRIALS;
      const meanSettled =
        perTrial.reduce((s, x) => s + x.settledBinaryMatch, 0) / TRIALS;
      const meanFalseSettled =
        perTrial.reduce((s, x) => s + x.falseSettledClaims, 0) / TRIALS;
      const meanOutcome =
        perTrial.reduce((s, x) => s + x.outcomeMatch, 0) / TRIALS;
      const meanTuple =
        perTrial.reduce((s, x) => s + x.tupleExactMatch, 0) / TRIALS;
      const totalParseErrs = perTrial.reduce((s, x) => s + x.parseErrors, 0);

      return {
        configId: cfg.configId,
        label: cfg.label,
        arm: cfg.arm,
        model: cfg.model,
        agentVersionTag: cfg.agentVersionTag,
        denomPerTrial,
        nonSettledPerTrial,
        meanConjectureExact: Number(meanConj.toFixed(2)),
        meanConjecturePct: Number(((100 * meanConj) / denomPerTrial).toFixed(1)),
        meanSettledBinary: Number(meanSettled.toFixed(2)),
        meanSettledBinaryPct: Number(((100 * meanSettled) / denomPerTrial).toFixed(1)),
        meanFalseSettledClaims: Number(meanFalseSettled.toFixed(2)),
        meanFalseSettledPct: Number(
          ((100 * meanFalseSettled) / nonSettledPerTrial).toFixed(1),
        ),
        meanOutcomeMatch: Number(meanOutcome.toFixed(2)),
        meanOutcomePct: Number(((100 * meanOutcome) / denomPerTrial).toFixed(1)),
        meanTupleExact: Number(meanTuple.toFixed(2)),
        totalParseErrorsAcross3Trials: totalParseErrs,
        p50WallMs: percentile(walls, 50),
        p95WallMs: percentile(walls, 95),
        totalInputTokens: rows.reduce((s, r) => s + r.inputTokens, 0),
        totalOutputTokens: rows.reduce((s, r) => s + r.outputTokens, 0),
        totalEstimatedUsd: Number(
          rows.reduce((s, r) => s + r.estimatedUsd, 0).toFixed(4),
        ),
        perTrial,
      };
    });
  }

  const heldoutSummary = summarizeSubset("heldout_60");
  const namedSummary = summarizeSubset("named_24");

  // Also break down heldout-60 by stratum (TOP_100, NUMBER_FIELD_GRH, REST_STRATIFIED)
  const strata = ["TOP_100", "NUMBER_FIELD_GRH", "REST_STRATIFIED"];
  const stratumBreakdown = strata.map((st) => {
    const nSt = cases.filter((c) => c.dataset === "heldout_60" && c.stratum === st).length;
    return {
      stratum: st,
      nPerTrial: nSt,
      arms: ARM_CONFIGS.map((cfg) => {
        const rows = allRecords.filter(
          (r) =>
            r.configId === cfg.configId &&
            r.dataset === "heldout_60" &&
            r.stratum === st,
        );
        const conjMean = rows.filter((r) => r.conjectureExact).length / TRIALS;
        const outMean = rows.filter((r) => r.outcomeMatch).length / TRIALS;
        const falseSettledMean = rows.filter((r) => r.falseSettledClaim).length / TRIALS;
        return {
          configId: cfg.configId,
          meanConjectureExact: Number(conjMean.toFixed(2)),
          meanOutcomeMatch: Number(outMean.toFixed(2)),
          meanFalseSettled: Number(falseSettledMean.toFixed(2)),
        };
      }),
    };
  });

  const spend = readSpendLedger();
  const v3Held = heldoutSummary.find((x) => x.configId === "v3-fulltext-glm")!;
  const v1RulesHeld = heldoutSummary.find((x) => x.configId === "v1-rules-glm")!;
  const deltaConjPct = Number(
    (v3Held.meanConjecturePct - v1RulesHeld.meanConjecturePct).toFixed(1),
  );
  const deltaOutPct = Number(
    (v3Held.meanOutcomePct - v1RulesHeld.meanOutcomePct).toFixed(1),
  );

  const summaryPayload = {
    generatedAtUtc: new Date().toISOString(),
    project,
    agentName: AGENT_NAME,
    trialsPerCase: TRIALS,
    decisionRuleEvaluation: {
      v3FullTextConjecturePct: v3Held.meanConjecturePct,
      v1RulesGlmConjecturePct: v1RulesHeld.meanConjecturePct,
      deltaConjecturePoints: deltaConjPct,
      v3FullTextOutcomePct: v3Held.meanOutcomePct,
      v1RulesGlmOutcomePct: v1RulesHeld.meanOutcomePct,
      deltaOutcomePoints: deltaOutPct,
      beats5PointThresholdOnConjecture: deltaConjPct >= 5.0,
      beats5PointThresholdOnOutcome: deltaOutPct >= 5.0,
    },
    spendLedger: spend,
    upstreamAgentVersions: upstreamVersions,
    heldout60: heldoutSummary,
    named24: namedSummary,
    heldoutStrata: stratumBreakdown,
  };

  const jsonOut = path.join(process.cwd(), "research", "benchmark-summary.json");
  fs.writeFileSync(jsonOut, JSON.stringify(summaryPayload, null, 2));

  const mdLines = [
    "# Attempt 2 Benchmark Summary (Frozen Gold Sets, 3 Trials / Arm)",
    "",
    `- **Generated (UTC):** ${summaryPayload.generatedAtUtc}`,
    `- **Agent Lens Project:** \`${project}\` (\`${AGENT_NAME}\`)`,
    `- **Cumulative Spend:** $${spend.totalEstimatedUsd.toFixed(4)} across ${spend.totalCalls.toLocaleString()} LLM calls (cap: $25.00)`,
    `- **Pre-registered decision check (\`heldout-60\`):** \`v3-fulltext\` vs \`v1-rules\` (GLM-5.3-Flash): **${deltaConjPct >= 0 ? "+" : ""}${deltaConjPct} pp** on 6-class conjecture accuracy (${v3Held.meanConjectureExact}/60 vs ${v1RulesHeld.meanConjectureExact}/60), **${deltaOutPct >= 0 ? "+" : ""}${deltaOutPct} pp** on checked-scope outcome (${v3Held.meanOutcomeMatch}/60 vs ${v1RulesHeld.meanOutcomeMatch}/60).`,
    "",
    "## 1. Held-Out Stratified Benchmark (`heldout-60`, N = 60 per trial, 50 non-settled)",
    "",
    "| Arm + Model | 6-Class Conjecture (mean / 60) | Per-Trial Conjecture (`T1, T2, T3`) | Checked Outcome (mean / 60) | False-Settled Claims (mean / 50) | Parse Errors (`/180`) | p50 / p95 (ms) |",
    "| --- | ---: | :---: | ---: | ---: | ---: | ---: |",
    ...heldoutSummary.map(
      (s) =>
        `| ${s.label} | **${s.meanConjectureExact} / 60** (${s.meanConjecturePct}%) | \`${s.perTrial.map((p) => p.conjectureExact).join(", ")}\` | **${s.meanOutcomeMatch} / 60** (${s.meanOutcomePct}%) | ${s.meanFalseSettledClaims} / 50 (${s.meanFalseSettledPct}%) | ${s.totalParseErrorsAcross3Trials} | ${s.p50WallMs} / ${s.p95WallMs} |`,
    ),
    "",
    "## 2. Named Public Consequences (`named-24`, N = 24 per trial, 14 non-settled)",
    "",
    "| Arm + Model | 6-Class Conjecture (mean / 24) | Per-Trial Conjecture (`T1, T2, T3`) | Checked Outcome (mean / 24) | False-Settled Claims (mean / 14) | Parse Errors (`/72`) |",
    "| --- | ---: | :---: | ---: | ---: | ---: |",
    ...namedSummary.map(
      (s) =>
        `| ${s.label} | **${s.meanConjectureExact} / 24** (${s.meanConjecturePct}%) | \`${s.perTrial.map((p) => p.conjectureExact).join(", ")}\` | **${s.meanOutcomeMatch} / 24** (${s.meanOutcomePct}%) | ${s.meanFalseSettledClaims} / 14 (${s.meanFalseSettledPct}%) | ${s.totalParseErrorsAcross3Trials} |`,
    ),
    "",
    "## 3. Held-Out Breakdown by Stratum (Mean 6-Class Conjecture Exact / 20)",
    "",
    "| Stratum | `v1-neutral-glm` | `v1-neutral-kimi` | `v1-rules-glm` | `v1-rules-kimi` | `v2-abstract-glm` | `v3-fulltext-glm` |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...stratumBreakdown.map((st) => {
      const cells = st.arms.map((a) => `${a.meanConjectureExact} / ${st.nPerTrial}`);
      return `| \`${st.stratum}\` | ${cells.join(" | ")} |`;
    }),
    "",
  ];

  const mdOut = path.join(process.cwd(), "research", "benchmark-summary.md");
  fs.writeFileSync(mdOut, mdLines.join("\n"));
  console.log(`\nWrote ${jsonOut} and ${mdOut}\n`);
  console.log(mdLines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
