/**
 * `pnpm demo`: Runs `auditor-v1-naive` vs `auditor-v2-guarded` against 8 real theorem cases
 * using CoreWeave Forge Serverless Inference (`zai-org/GLM-5.3-Flash`), streams OpenTelemetry
 * GenAI conversations + tool spans to CoreWeave Agent Lens (`wandb/theorem-survival`),
 * verifies upstream ingest on `https://trace.wandb.ai`, and writes `src/data/verified-traces.json`.
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateTheorem, PRESETS, THEOREMS, type PresetId } from "../src/data/theorems";
import { runTheoremAudit, type AuditResponse } from "../server/auditor";
import { resolveForgeCredentials, resolveForgeProject, resolveWandbKey } from "../server/credentials";
import { AGENT_NAME, createTraceRunner } from "../server/tracing";

interface BenchmarkCase {
  caseId: string;
  theoremId: string;
  presetId: PresetId;
  trapFocus: string;
}

const CASES: BenchmarkCase[] = [
  {
    caseId: "case-01-visser-rh",
    theoremId: "P04",
    presetId: "rh_only",
    trapFocus: "2-hop transitive RH upgrade on Oct 2026 short-interval primes (2610.27830)",
  },
  {
    caseId: "case-02-sqisign-rh-only",
    theoremId: "P12",
    presetId: "rh_only",
    trapFocus: "rh-grh-erh-conflated & crypto-break-hallucination: RH alone does NOT unlock SQIsign (needs GRH)",
  },
  {
    caseId: "case-03-kuperberg-fallback",
    theoremId: "P09",
    presetId: "alpoge_rh_grh",
    trapFocus: "missed-unconditional-fallback: Lackenby (1604.03778) already proved Knottedness in NP unconditionally",
  },
  {
    caseId: "case-04-schubert-erh-gap",
    theoremId: "P11",
    presetId: "alpoge_rh_grh",
    trapFocus: "rh-grh-erh-conflated: SchubertVanishing (2412.02064) traces to Dedekind ERH, still open in RH+GRH preset",
  },
  {
    caseId: "case-05-siegel-twins-vacuous",
    theoremId: "P16",
    presetId: "alpoge_rh_grh",
    trapFocus: "polarity-inversion-miss: GRH=True kills Siegel zeros, making Twin Primes proof route VACUOUS (not proven)",
  },
  {
    caseId: "case-06-alpoge-simplicity",
    theoremId: "P06",
    presetId: "rh_only",
    trapFocus: "simplicity-vs-location-blur: RH puts 100% of zeros on Re(s)=1/2 without proving multiplicity 1 (>=67.25% stays live)",
  },
  {
    caseId: "case-07-artin-erh-gap",
    theoremId: "P14",
    presetId: "alpoge_rh_grh",
    trapFocus: "rh-grh-erh-conflated: Hooley Artin primitive roots & Weinberger PID=>Euclidean still wait on Kummer Dedekind ERH",
  },
  {
    caseId: "case-08-lagarias-iff",
    theoremId: "P02",
    presetId: "rh_only",
    trapFocus: "Exact biconditional RH equivalence (math/0008177) upgrades immediately under classical RH alone",
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

  console.log(`\nRunning TheoremSurvival Agent Lens benchmark (${CASES.length} cases x 2 agent versions)`);
  console.log(`  Project:    ${project}`);
  console.log(`  Model:      ${creds ? `${creds.model} (${creds.provider})` : "deterministic (--no-llm)"}`);
  console.log(`  Agent Lens: ${tracingOn ? `https://forge.coreweave.com/agent-lens/${project}` : "disabled"}\n`);

  const pairedResults: Array<{
    caseId: string;
    theoremId: string;
    arxivOrDoi: string;
    title: string;
    presetId: PresetId;
    presetLabel: string;
    trapFocus: string;
    expectedOutcome: string;
    expectedConjecture: string;
    expectedPolarity: string;
    expectedFallback: boolean;
    v1: {
      conversationId: string;
      agentLensUrl: string | null;
      predictedOutcome: string;
      conjectureType: string;
      polarity: string;
      hasFallback: boolean;
      exactMatch: boolean;
      authorAlert: string;
      totalTokens: number;
      wallMs: number;
      spans: AuditResponse["spans"];
    };
    v2: {
      conversationId: string;
      agentLensUrl: string | null;
      predictedOutcome: string;
      conjectureType: string;
      polarity: string;
      hasFallback: boolean;
      exactMatch: boolean;
      authorAlert: string;
      totalTokens: number;
      wallMs: number;
      spans: AuditResponse["spans"];
    };
  }> = [];

  for (const c of CASES) {
    const thm = THEOREMS.find((t) => t.id === c.theoremId)!;
    const preset = PRESETS.find((p) => p.id === c.presetId)!;
    const expected = evaluateTheorem(thm, preset.state);

    const v1ConvId = `ts-v1-${c.caseId}-${runStamp}`;
    const v2ConvId = `ts-v2-${c.caseId}-${runStamp}`;

    const [v1Res, v2Res] = await Promise.all([
      runTheoremAudit(
        {
          query: thm.arxivId ?? thm.id,
          presetId: c.presetId,
          agentVersion: "auditor-v1-naive",
          conversationId: v1ConvId,
          noLlm,
        },
        { creds, tracer },
      ),
      runTheoremAudit(
        {
          query: thm.arxivId ?? thm.id,
          presetId: c.presetId,
          agentVersion: "auditor-v2-guarded",
          conversationId: v2ConvId,
          noLlm,
        },
        { creds, tracer },
      ),
    ]);

    const v1Dep = v1Res.extraction.dependencies[0];
    const v2Dep = v2Res.extraction.dependencies[0];

    const v1Match =
      v1Res.predictedOutcome === expected.outcome &&
      v1Dep.conjecture_type === thm.conjectureType &&
      v1Dep.assumption_polarity === thm.polarity &&
      v1Dep.has_unconditional_fallback === thm.hasUnconditionalFallback;

    const v2Match =
      v2Res.predictedOutcome === expected.outcome &&
      v2Dep.conjecture_type === thm.conjectureType &&
      v2Dep.assumption_polarity === thm.polarity &&
      v2Dep.has_unconditional_fallback === thm.hasUnconditionalFallback;

    console.log(
      `  [${c.theoremId}] ${thm.shortNodeTitle.padEnd(30)} | expected=${expected.outcome.padEnd(22)} | v1=${v1Match ? "PASS" : "MISS"} (${v1Res.predictedOutcome}) | v2=${v2Match ? "PASS" : "MISS"} (${v2Res.predictedOutcome})`,
    );

    pairedResults.push({
      caseId: c.caseId,
      theoremId: c.theoremId,
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
        conversationId: v2Res.conversationId,
        agentLensUrl: v2Res.agentLensUrl,
        predictedOutcome: v2Res.predictedOutcome,
        conjectureType: v2Dep.conjecture_type,
        polarity: v2Dep.assumption_polarity,
        hasFallback: v2Dep.has_unconditional_fallback,
        exactMatch: v2Match,
        authorAlert: v2Res.authorAlert,
        totalTokens: v2Res.totalTokens,
        wallMs: v2Res.wallMs,
        spans: v2Res.spans,
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
  const v2Correct = pairedResults.filter((r) => r.v2.exactMatch).length;

  const snapshot = {
    generatedAtUtc: new Date().toISOString(),
    project,
    agentName: AGENT_NAME,
    agentLensProjectUrl: `https://forge.coreweave.com/agent-lens/${project}`,
    agentLensTagsViewUrl: `https://forge.coreweave.com/agent-lens/${project}/conversations?tags=rh-grh-erh-conflated,missed-unconditional-fallback,polarity-inversion-miss,crypto-break-hallucination,simplicity-vs-location-blur`,
    model: creds?.model ?? "deterministic-rule-engine",
    summary: {
      cases: pairedResults.length,
      v1ExactMatches: v1Correct,
      v2ExactMatches: v2Correct,
      v1Accuracy: Number((v1Correct / pairedResults.length).toFixed(3)),
      v2Accuracy: Number((v2Correct / pairedResults.length).toFixed(3)),
      verifiedAgentVersions: verifiedVersions,
    },
    cases: pairedResults,
  };

  if (!noLlm) {
    const outPath = path.resolve(import.meta.dirname, "../src/data/verified-traces.json");
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
    console.log(`\nWrote verified Agent Lens trace snapshot -> src/data/verified-traces.json`);
  }

  console.log(`\nSummary: auditor-v1-naive ${v1Correct}/${pairedResults.length} exact | auditor-v2-guarded ${v2Correct}/${pairedResults.length} exact`);
  if (verifiedVersions.length > 0) {
    console.log(`Verified upstream on trace.wandb.ai (${project}):`);
    for (const v of verifiedVersions) {
      console.log(`  - ${v.agent_version}: ${v.invocation_count} traced invocations`);
    }
  }
  console.log(`Open Agent Lens: https://forge.coreweave.com/agent-lens/${project}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
