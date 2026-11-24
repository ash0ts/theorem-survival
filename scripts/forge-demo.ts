/**
 * `pnpm demo`: Runs `auditor-v1-neutral` vs `auditor-v3-fulltext` against the 8 hand-picked
 * showcase theorem cases (reported separately from the frozen 84-case gold benchmark per
 * `research/contract.md`), streams OpenTelemetry GenAI conversations + tool spans to
 * CoreWeave Agent Lens (`wandb/theorem-survival`), verifies upstream ingest on
 * `https://trace.wandb.ai`, and writes `src/data/verified-traces.json`.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateTheorem, PRESETS, THEOREMS, type PresetId } from "../src/data/theorems";
import { runTheoremAudit } from "../server/auditor";
import {
  resolveForgeCredentials,
  resolveForgeProject,
  resolveWandbKey,
} from "../server/credentials";
import { AGENT_NAME, createTraceRunner } from "../server/tracing";

interface DemoCase {
  caseId: string;
  theoremId: string;
  presetId: PresetId;
  trapFocus: string;
}

const CASES: DemoCase[] = [
  {
    caseId: "case-01-visser-rh",
    theoremId: "P04",
    presetId: "rh_only",
    trapFocus: "2-hop classical RH upgrade on Oct 2026 short-interval primes (2610.27830)",
  },
  {
    caseId: "case-02-sqisign-beyond-dirichlet",
    theoremId: "P12",
    presetId: "checked_nov24",
    trapFocus:
      "Abstract says 'Assuming GRH', but §3 invokes Lagarias-Odlyzko effective Chebotarev (BEYOND_DIRICHLET, still open)",
  },
  {
    caseId: "case-03-kuperberg-chebotarev",
    theoremId: "P09",
    presetId: "checked_nov24",
    trapFocus:
      "Abstract says 'Assuming GRH', but proof invokes Koiran/Chebotarev (BEYOND_DIRICHLET) and Lackenby already proved NP unconditionally",
  },
  {
    caseId: "case-04-schubert-chebotarev",
    theoremId: "P11",
    presetId: "checked_nov24",
    trapFocus:
      "Pak-Robichaux Schubert vanishing (2412.02064) relies on Koiran's effective Chebotarev step (BEYOND_DIRICHLET, still open)",
  },
  {
    caseId: "case-05-siegel-twins-vacuous",
    theoremId: "P16",
    presetId: "checked_nov24",
    trapFocus:
      "Heath-Brown (1983): Dirichlet GRH = True rules out Siegel zeros, making this counterfactual Twin Primes route VACUOUS",
  },
  {
    caseId: "case-06-alpoge-simplicity",
    theoremId: "P06",
    presetId: "checked_nov24",
    trapFocus:
      "Simplicity vs location: checked RH places zeros on Re(s)=1/2 without proving multiplicity 1",
  },
  {
    caseId: "case-07-artin-dedekind-open",
    theoremId: "P14",
    presetId: "checked_nov24",
    trapFocus:
      "Hooley's Artin primitive-root proof needs Dedekind zeta GRH over Kummer fields Q(zeta_q, a^{1/q}) — NOT covered by Dirichlet GRH",
  },
  {
    caseId: "case-08-lagarias-lean-checked",
    theoremId: "P02",
    presetId: "checked_nov24",
    trapFocus:
      "Lagarias's elementary inequality (math/0008177) is equivalent to classical RH and now compiled unconditionally in Lean 4",
  },
];

async function verifyAgentVersions(project: string, key: string) {
  const basic = Buffer.from(`api:${key}`).toString("base64");
  for (let attempt = 0; attempt < 5; attempt++) {
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
        if (data.versions && data.versions.length > 0) {
          return data.versions;
        }
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

async function main() {
  const noLlm = process.argv.includes("--no-llm");
  const creds = noLlm ? null : resolveForgeCredentials();
  const key = resolveWandbKey();
  const project = resolveForgeProject();

  if (!noLlm && !creds) {
    console.error("No Forge / W&B credentials found. Run `wandb login` or pass `--no-llm`.");
    process.exit(2);
  }

  const tracer = createTraceRunner({
    project,
    spanProcessor: "simple",
    enabled: !noLlm && Boolean(key),
  });
  const tracingOn = await tracer.enabled();
  const runStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  console.log(
    `\nRunning TheoremSurvival Hand-Picked Demo Showcase (${CASES.length} cases: auditor-v1-neutral vs auditor-v3-fulltext)`,
  );
  console.log(`  Project:    ${project}`);
  console.log(
    `  Model:      ${creds ? `${creds.model} (${creds.provider})` : "deterministic (--no-llm)"}`,
  );
  console.log(
    `  Agent Lens: ${tracingOn ? `https://forge.coreweave.com/agent-lens/${project}` : "disabled"}\n`,
  );

  const pairedResults = [];

  for (const c of CASES) {
    const thm = THEOREMS.find((t) => t.id === c.theoremId)!;
    const preset = PRESETS.find((p) => p.id === c.presetId)!;
    const expected = evaluateTheorem(thm, preset.state);

    const v1ConvId = `ts-demo2-v1-${c.caseId}-${runStamp}`;
    const v3ConvId = `ts-demo2-v3-${c.caseId}-${runStamp}`;

    const paperInput = {
      id: thm.id,
      arxivId: thm.arxivId,
      doi: thm.doi,
      title: thm.title,
      authors: thm.authors,
      year: thm.yearLabel,
      category: thm.category,
      abstractText: thm.extractedQuote,
      url: thm.url,
    };

    const [v1Res, v3Res] = await Promise.all([
      runTheoremAudit(
        {
          query: thm.arxivId ?? thm.id,
          paperInput: thm.arxivId ? undefined : paperInput,
          presetId: c.presetId,
          agentVersion: "auditor-v1-neutral",
          conversationId: v1ConvId,
          noLlm,
        },
        { creds, tracer },
      ),
      runTheoremAudit(
        {
          query: thm.arxivId ?? thm.id,
          paperInput: thm.arxivId ? undefined : paperInput,
          presetId: c.presetId,
          agentVersion: "auditor-v3-fulltext",
          conversationId: v3ConvId,
          noLlm,
        },
        { creds, tracer },
      ),
    ]);

    const v1Dep = v1Res.extraction.dependencies[0];
    const v3Dep = v3Res.extraction.dependencies[0];

    const v1Match =
      v1Res.predictedOutcome === expected.outcome &&
      v1Dep.conjecture_type === thm.conjectureType;

    const v3Match =
      v3Res.predictedOutcome === expected.outcome &&
      v3Dep.conjecture_type === thm.conjectureType;

    console.log(
      `  [${c.theoremId}] ${thm.shortNodeTitle.padEnd(30)} | expected=${expected.outcome.padEnd(22)} (${thm.conjectureType.padEnd(16)}) | v1-neutral=${v1Match ? "PASS" : "MISS"} (${v1Dep.conjecture_type} -> ${v1Res.predictedOutcome}) | v3-fulltext=${v3Match ? "PASS" : "MISS"} (${v3Dep.conjecture_type} -> ${v3Res.predictedOutcome})`,
    );

    pairedResults.push({
      caseId: c.caseId,
      theoremId: thm.id,
      arxivOrDoi: thm.arxivOrDoi,
      title: thm.title,
      presetId: c.presetId,
      presetLabel: preset.shortLabel,
      trapFocus: c.trapFocus,
      expectedOutcome: expected.outcome,
      expectedConjecture: thm.conjectureType,
      expectedPolarity: thm.polarity,
      expectedFallback: thm.hasUnconditionalFallback,
      v1: {
        conversationId: v1Res.conversationId,
        agentLensUrl: v1Res.agentLensUrl,
        predictedOutcome: v1Res.predictedOutcome,
        conjectureType: v1Dep.conjecture_type,
        polarity: v1Dep.assumption_polarity,
        hasFallback: v1Dep.has_unconditional_fallback,
        exactMatch: v1Match,
        authorAlert: v1Res.authorAlert,
        totalTokens: v1Res.totalTokens,
        wallMs: v1Res.wallMs,
        spans: v1Res.spans,
      },
      v2: {
        conversationId: v3Res.conversationId,
        agentLensUrl: v3Res.agentLensUrl,
        predictedOutcome: v3Res.predictedOutcome,
        conjectureType: v3Dep.conjecture_type,
        polarity: v3Dep.assumption_polarity,
        hasFallback: v3Dep.has_unconditional_fallback,
        exactMatch: v3Match,
        authorAlert: v3Res.authorAlert,
        totalTokens: v3Res.totalTokens,
        wallMs: v3Res.wallMs,
        spans: v3Res.spans,
      },
    });
  }

  await tracer.flush();
  await tracer.shutdown();

  let verifiedVersions: Array<{ agent_version: string; invocation_count: number }> = [];
  if (tracingOn && key) {
    verifiedVersions = await verifyAgentVersions(project, key);
  }

  const v1Correct = pairedResults.filter((r) => r.v1.exactMatch).length;
  const v3Correct = pairedResults.filter((r) => r.v2.exactMatch).length;

  const benchmarkSummaryPath = path.resolve(
    import.meta.dirname,
    "../research/benchmark-summary.json",
  );
  const heldoutSummary = fs.existsSync(benchmarkSummaryPath)
    ? JSON.parse(fs.readFileSync(benchmarkSummaryPath, "utf8"))
    : null;

  const snapshot = {
    generatedAtUtc: new Date().toISOString(),
    datasetScope: "handpicked_demo_8",
    datasetNote:
      "Hand-picked 8-paper showcase for UI trace inspection (no label lookup). Primary evaluation is the frozen 60-paper stratified held-out benchmark and 24 named public results in research/benchmark-summary.json.",
    project,
    agentName: AGENT_NAME,
    agentLensProjectUrl: `https://forge.coreweave.com/agent-lens/${project}`,
    agentLensTagsViewUrl: `https://forge.coreweave.com/agent-lens/${project}/conversations`,
    model: creds?.model ?? "deterministic-rule-engine",
    heldoutBenchmark: heldoutSummary
      ? {
          generatedAtUtc: heldoutSummary.generatedAtUtc,
          heldout60Arms: heldoutSummary.heldout60,
          named24Arms: heldoutSummary.named24,
          decisionDeltaConjecturePct: heldoutSummary.decisionCheck?.deltaConjecturePct ?? null,
          decisionDeltaOutcomePct: heldoutSummary.decisionCheck?.deltaOutcomePct ?? null,
        }
      : null,
    summary: {
      cases: pairedResults.length,
      v1ExactMatches: v1Correct,
      v2ExactMatches: v3Correct,
      v1Accuracy: Number((v1Correct / pairedResults.length).toFixed(3)),
      v2Accuracy: Number((v3Correct / pairedResults.length).toFixed(3)),
      verifiedAgentVersions: verifiedVersions,
    },
    cases: pairedResults,
  };

  if (!noLlm) {
    const outPath = path.resolve(import.meta.dirname, "../src/data/verified-traces.json");
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    console.log(`\nWrote verified Agent Lens trace snapshot -> src/data/verified-traces.json`);
  }

  console.log(
    `\nDemo Showcase Summary: auditor-v1-neutral ${v1Correct}/${pairedResults.length} | auditor-v3-fulltext ${v3Correct}/${pairedResults.length}`,
  );
  if (verifiedVersions.length > 0) {
    console.log(`Verified upstream on trace.wandb.ai (${project}):`);
    for (const v of verifiedVersions) {
      console.log(`  - ${v.agent_version}: ${v.invocation_count} traced invocations`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
