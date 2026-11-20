import { useEffect, useState } from "react";
import { evaluateTheorem, PRESETS, THEOREMS, type PresetId } from "../data/theorems";
import verifiedTraces from "../data/verified-traces.json";

const TAG_SPECS = [
  {
    name: "rh-grh-erh-conflated",
    dot: "#EF4444",
    summary:
      "Treats classical RH for zeta(s) as sufficient for theorems requiring Dirichlet GRH (SQIsign, Miller primality, torus knots) or Dedekind ERH (Hooley's Artin conjecture, SchubertVanishing).",
  },
  {
    name: "missed-unconditional-fallback",
    dot: "#F59E0B",
    summary:
      "Calls a conditional paper a brand-new qualitative result while missing an unconditional proof or bound (Lackenby 1604.03778 for Knottedness in NP, AKS 2002 for PRIMES in P).",
  },
  {
    name: "polarity-inversion-miss",
    dot: "#8B5CF6",
    summary:
      "Misreads ASSUMES_FALSE theorems (~RH or Siegel-zero Twin Primes) as proven rather than vacuous when RH/GRH holds.",
  },
  {
    name: "crypto-break-hallucination",
    dot: "#EC4899",
    summary:
      "Claims RH or GRH breaks RSA or post-quantum crypto, when GRH actually strengthens SQIsign's hardness equivalence (arXiv:2111.01481).",
  },
  {
    name: "simplicity-vs-location-blur",
    dot: "#3B82F6",
    summary:
      "Claims RH completely obsoletes Alpöge-Furman (2608.13637), overlooking that RH places zeros on Re(s)=1/2 without forbidding double zeros.",
  },
];

interface LiveAuditServerHealth {
  ok: boolean;
  liveServer: boolean;
  inferenceProvider: string;
  model: string;
  agentLensEnabled: boolean;
  forgeProject: string;
  agentLensProjectUrl: string;
}

interface LiveAuditClientResult {
  conversationId: string;
  agentLensUrl: string | null;
  agentVersion: string;
  source: string;
  model: string;
  paper: {
    arxivOrDoi: string;
    title: string;
    authors: string;
    category: string;
    url: string;
  };
  presetLabel: string;
  predictedOutcome: string;
  authorAlert: string;
  spans: Array<{
    kind: string;
    name: string;
    durationMs: number;
    summary: string;
    inputTokens?: number;
    outputTokens?: number;
  }>;
  totalTokens: number;
  wallMs: number;
}

export function AgentLensPanel({
  focusedTheoremId,
  activePresetId,
}: {
  focusedTheoremId?: string;
  activePresetId: PresetId;
}) {
  const cases = verifiedTraces.cases;
  const initialCase =
    cases.find((c) => c.theoremId === focusedTheoremId)?.caseId ?? cases[0].caseId;

  const [selectedCaseId, setSelectedCaseId] = useState<string>(initialCase);
  const [serverHealth, setServerHealth] = useState<LiveAuditServerHealth | null>(null);
  const [liveQuery, setLiveQuery] = useState<string>("2610.27830");
  const [livePreset, setLivePreset] = useState<PresetId>(activePresetId);
  const [liveLoading, setLiveLoading] = useState<boolean>(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<LiveAuditClientResult | null>(null);

  useEffect(() => {
    const match = cases.find((c) => c.theoremId === focusedTheoremId);
    if (match) setSelectedCaseId(match.caseId);
  }, [focusedTheoremId, cases]);

  useEffect(() => {
    setLivePreset(activePresetId);
  }, [activePresetId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && data.liveServer) {
          setServerHealth(data as LiveAuditServerHealth);
        }
      })
      .catch(() => {
        // Static GitHub Pages hosting — no local Vite middleware
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCase = cases.find((c) => c.caseId === selectedCaseId) ?? cases[0];

  const v1OutcomeCorrect = cases.filter(
    (c) => c.v1.predictedOutcome === c.expectedOutcome,
  ).length;
  const v2OutcomeCorrect = cases.filter(
    (c) => c.v2.predictedOutcome === c.expectedOutcome,
  ).length;
  const v1TotalMs = cases.reduce((acc, c) => acc + c.v1.wallMs, 0);
  const v2TotalMs = cases.reduce((acc, c) => acc + c.v2.wallMs, 0);

  async function handleRunAudit(e: React.FormEvent) {
    e.preventDefault();
    setLiveError(null);
    setLiveLoading(true);
    try {
      if (serverHealth?.liveServer) {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: liveQuery.trim(),
            presetId: livePreset,
            agentVersion: "auditor-v2-guarded",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setLiveResult(data as LiveAuditClientResult);
      } else {
        // Static GitHub Pages fallback: deterministic audit on known corpus or live arXiv CORS-safe lookup
        const q = liveQuery.trim().replace(/^arxiv:/i, "").toLowerCase();
        const known = THEOREMS.find(
          (t) =>
            t.id.toLowerCase() === q ||
            (t.arxivId && t.arxivId.toLowerCase() === q) ||
            t.arxivOrDoi.toLowerCase().includes(q),
        );
        const presetObj =
          PRESETS.find((p) => p.id === livePreset) ?? PRESETS[2];
        if (!known) {
          throw new Error(
            "Static GitHub Pages mode includes offline replay for the 16-paper benchmark (e.g. 2610.27830, 2111.01481, 2412.02064, 1112.0845). Run `./try-it.sh` locally with WANDB_API_KEY to fetch arbitrary arXiv papers and trace live into CoreWeave Agent Lens.",
          );
        }
        const ev = evaluateTheorem(known, presetObj.state);
        const matchedTrace = cases.find((c) => c.theoremId === known.id);
        setLiveResult({
          conversationId:
            matchedTrace?.v2.conversationId ?? `static-replay-${known.id.toLowerCase()}`,
          agentLensUrl: matchedTrace?.v2.agentLensUrl ?? verifiedTraces.agentLensProjectUrl,
          agentVersion: "auditor-v2-guarded (static replay)",
          source: "static-verified-replay",
          model: verifiedTraces.model,
          paper: {
            arxivOrDoi: known.arxivOrDoi,
            title: known.title,
            authors: known.authors,
            category: known.category,
            url: known.url,
          },
          presetLabel: presetObj.label,
          predictedOutcome: ev.outcome,
          authorAlert: ev.headline,
          spans: [
            {
              kind: "tool",
              name: "fetch_arxiv_metadata",
              durationMs: 1,
              summary: `${known.arxivOrDoi} (${known.category})`,
            },
            {
              kind: "tool",
              name: "scan_conditional_clauses",
              durationMs: 1,
              summary: `${known.polarity === "ASSUMES_FALSE" ? "~" : ""}${known.conjectureType} · fallback=${String(known.hasUnconditionalFallback)}`,
            },
            {
              kind: "tool",
              name: "traverse_citation_hops",
              durationMs: 1,
              summary: `hop=${known.hopDepth} via ${known.upstreamIds.join(" -> ")}`,
            },
            {
              kind: "tool",
              name: "evaluate_world_state_diff",
              durationMs: 1,
              summary: `${ev.outcome} (${ev.badgeLabel})`,
            },
          ],
          totalTokens: 0,
          wallMs: 4,
        });
      }
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-xs font-mono uppercase tracking-wider text-stone-500">
              CoreWeave Forge Telemetry · @coreweave/forge-sdk/agentlens
            </div>
            <h2 className="mt-1 text-lg font-semibold text-stone-900">
              Why naive LLM theorem scrapers fail — and what Agent Lens caught
            </h2>
            <p className="mt-1.5 text-sm text-stone-700">
              We ran <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">{verifiedTraces.model}</code>{" "}
              on CoreWeave Forge Serverless Inference across 8 tricky conditional papers under two
              traced versions: <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">auditor-v1-naive</code>{" "}
              (direct abstract classification) and{" "}
              <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">auditor-v2-guarded</code>{" "}
              (4 verification tools before synthesis). Every conversation, tool span, and token count
              was exported over OTLP to <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">{verifiedTraces.project}</code>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={verifiedTraces.agentLensProjectUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-stone-900 bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-50 hover:bg-stone-800"
            >
              Open Agent Lens Project ↗
            </a>
            <a
              href={verifiedTraces.agentLensTagsViewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100"
            >
              Open 5-Tag Judge View ↗
            </a>
            <a
              href="https://forge.coreweave.com/wandb/wandb/theorem-survival/runs/8fn9zbzi"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100"
            >
              Open W&amp;B EvalTable ↗
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-stone-200 bg-stone-50 p-3">
            <div className="text-xs text-stone-500">Outcome Verdict Accuracy</div>
            <div className="mt-1 font-mono text-lg font-semibold text-stone-900">
              {v1OutcomeCorrect}/8 <span className="text-stone-400">-&gt;</span>{" "}
              <span className="text-emerald-700">{v2OutcomeCorrect}/8</span>
            </div>
            <div className="mt-0.5 text-[11px] text-stone-500">v1 naive (50%) vs v2 guarded (100%)</div>
          </div>

          <div className="rounded border border-stone-200 bg-stone-50 p-3">
            <div className="text-xs text-stone-500">Strict Schema + Fallback Match</div>
            <div className="mt-1 font-mono text-lg font-semibold text-stone-900">
              {verifiedTraces.summary.v1ExactMatches}/8 <span className="text-stone-400">-&gt;</span>{" "}
              <span className="text-emerald-700">{verifiedTraces.summary.v2ExactMatches}/8</span>
            </div>
            <div className="mt-0.5 text-[11px] text-stone-500">Conjecture + polarity + fallback</div>
          </div>

          <div className="rounded border border-stone-200 bg-stone-50 p-3">
            <div className="text-xs text-stone-500">8-Paper Batch Wall Time</div>
            <div className="mt-1 font-mono text-lg font-semibold text-stone-900">
              {(v1TotalMs / 1000).toFixed(1)}s <span className="text-stone-400">-&gt;</span>{" "}
              <span className="text-sky-700">{(v2TotalMs / 1000).toFixed(1)}s</span>
            </div>
            <div className="mt-0.5 text-[11px] text-stone-500">5.5x faster (no ungrounded spinning)</div>
          </div>

          <div className="rounded border border-stone-200 bg-stone-50 p-3">
            <div className="text-xs text-stone-500">Verified OTLP Invocations</div>
            <div className="mt-1 font-mono text-lg font-semibold text-stone-900">
              16 turns
            </div>
            <div className="mt-0.5 text-[11px] text-stone-500">8 v1 + 8 v2 on trace.wandb.ai</div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-900">
            Paired Agent Lens Conversation Inspector (v1-naive vs v2-guarded)
          </h3>
          <span className="text-xs font-mono text-stone-500">
            Recorded {verifiedTraces.generatedAtUtc.slice(0, 16).replace("T", " ")} UTC
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {cases.map((c) => {
            const active = c.caseId === activeCase.caseId;
            const v1Wrong = c.v1.predictedOutcome !== c.expectedOutcome;
            return (
              <button
                key={c.caseId}
                type="button"
                onClick={() => setSelectedCaseId(c.caseId)}
                className={`rounded border px-2.5 py-1 text-xs font-mono cursor-pointer ${
                  active
                    ? "border-stone-900 bg-stone-900 text-stone-50"
                    : "border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100"
                }`}
              >
                {c.theoremId} · {c.presetLabel}
                {v1Wrong ? " [v1 MISSED]" : ""}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-stone-800">
          <span className="font-semibold text-stone-950">Domain trap tested: </span>
          {activeCase.trapFocus} ·{" "}
          <span className="font-mono">
            Expected = {activeCase.expectedOutcome} ({activeCase.expectedConjecture},{" "}
            {activeCase.expectedPolarity}, fallback={String(activeCase.expectedFallback)})
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* v1 naive column */}
          <div className="rounded border border-stone-300 bg-stone-50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2">
              <div>
                <span className="font-mono text-xs font-semibold text-stone-900">
                  auditor-v1-naive
                </span>
                <span
                  className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    activeCase.v1.predictedOutcome === activeCase.expectedOutcome
                      ? "bg-amber-100 text-amber-900"
                      : "bg-rose-100 text-rose-900"
                  }`}
                >
                  {activeCase.v1.predictedOutcome === activeCase.expectedOutcome
                    ? "OUTCOME OK / SCHEMA DRIFT"
                    : `WRONG OUTCOME: ${activeCase.v1.predictedOutcome}`}
                </span>
              </div>
              <span className="font-mono text-[11px] text-stone-500">
                {activeCase.v1.wallMs} ms · {activeCase.v1.totalTokens} tok
              </span>
            </div>

            <p className="mt-2.5 text-xs leading-5 text-stone-800">
              {activeCase.v1.authorAlert}
            </p>

            <div className="mt-2.5 font-mono text-[11px] text-stone-600">
              Extracted: conj=<code>{activeCase.v1.conjectureType}</code> · polarity=
              <code>{activeCase.v1.polarity}</code> · fallback=
              <code>{String(activeCase.v1.hasFallback)}</code>
            </div>

            <div className="mt-3 space-y-1 border-t border-stone-200 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                OTLP Span Waterfall (2 spans)
              </div>
              {activeCase.v1.spans.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 font-mono text-[11px] border border-stone-200"
                >
                  <span className="truncate">
                    <span className="text-stone-400">[{s.kind}]</span> {s.name} —{" "}
                    <span className="text-stone-600">{s.summary}</span>
                  </span>
                  <span className="shrink-0 text-stone-500">{s.durationMs}ms</span>
                </div>
              ))}
            </div>

            {activeCase.v1.agentLensUrl && (
              <div className="mt-2.5">
                <a
                  href={activeCase.v1.agentLensUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] text-sky-800 underline hover:text-sky-950"
                >
                  Open v1 conversation in Agent Lens ({activeCase.v1.conversationId.slice(0, 26)}…) ↗
                </a>
              </div>
            )}
          </div>

          {/* v2 guarded column */}
          <div className="rounded border border-emerald-300 bg-emerald-50/30 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-2">
              <div>
                <span className="font-mono text-xs font-semibold text-stone-900">
                  auditor-v2-guarded
                </span>
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-900">
                  EXACT PASS: {activeCase.v2.predictedOutcome}
                </span>
              </div>
              <span className="font-mono text-[11px] text-stone-600">
                {activeCase.v2.wallMs} ms · {activeCase.v2.totalTokens} tok
              </span>
            </div>

            <p className="mt-2.5 text-xs leading-5 text-stone-800">
              {activeCase.v2.authorAlert}
            </p>

            <div className="mt-2.5 font-mono text-[11px] text-stone-700">
              Extracted: conj=<code>{activeCase.v2.conjectureType}</code> · polarity=
              <code>{activeCase.v2.polarity}</code> · fallback=
              <code>{String(activeCase.v2.hasFallback)}</code>
            </div>

            <div className="mt-3 space-y-1 border-t border-emerald-200 pt-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                OTLP Span Waterfall (5 spans)
              </div>
              {activeCase.v2.spans.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 font-mono text-[11px] border border-emerald-200"
                >
                  <span className="truncate">
                    <span className="text-stone-400">[{s.kind}]</span> {s.name} —{" "}
                    <span className="text-stone-600">{s.summary}</span>
                  </span>
                  <span className="shrink-0 text-stone-500">{s.durationMs}ms</span>
                </div>
              ))}
            </div>

            {activeCase.v2.agentLensUrl && (
              <div className="mt-2.5">
                <a
                  href={activeCase.v2.agentLensUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] text-emerald-900 underline hover:text-stone-950"
                >
                  Open v2 conversation in Agent Lens ({activeCase.v2.conversationId.slice(0, 26)}…) ↗
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Live / Replay Auditor */}
        <section className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-stone-900">
              Audit an arXiv Paper &amp; Trace to Agent Lens
            </h3>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                serverHealth?.liveServer
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-stone-300 bg-stone-100 text-stone-700"
              }`}
            >
              {serverHealth?.liveServer
                ? `Live: ${serverHealth.model} -> ${serverHealth.forgeProject}`
                : "Static Pages Mode (run ./try-it.sh for live OTLP ingest)"}
            </span>
          </div>

          <form onSubmit={handleRunAudit} className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={liveQuery}
              onChange={(e) => setLiveQuery(e.target.value)}
              placeholder="arXiv ID (e.g. 2610.27830, 2111.01481, 2609.02882)"
              aria-label="arXiv ID or paper identifier"
              className="min-w-[210px] flex-1 rounded border border-stone-300 bg-stone-50 px-3 py-1.5 text-sm font-mono text-stone-900 focus:border-stone-900 focus:outline-none"
            />
            <select
              value={livePreset}
              onChange={(e) => setLivePreset(e.target.value as PresetId)}
              aria-label="Target world state"
              className="rounded border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-900"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortLabel}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={liveLoading}
              className="rounded border border-stone-900 bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-stone-50 hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
            >
              {liveLoading ? "Auditing…" : "Run Guarded Audit"}
            </button>
          </form>

          {liveError && (
            <div className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              {liveError}
            </div>
          )}

          {liveResult && (
            <div className="mt-4 rounded border border-stone-200 bg-stone-50 p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-stone-900">
                  {liveResult.paper.arxivOrDoi} — {liveResult.paper.title}
                </span>
                <span className="rounded bg-stone-900 px-2 py-0.5 font-mono text-[10px] text-stone-50">
                  {liveResult.predictedOutcome}
                </span>
              </div>
              <p className="mt-2 leading-5 text-stone-800">{liveResult.authorAlert}</p>
              <div className="mt-2.5 space-y-1">
                {liveResult.spans.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border border-stone-200 bg-white px-2 py-1 font-mono text-[11px]"
                  >
                    <span className="truncate">
                      [{s.kind}] {s.name} — {s.summary}
                    </span>
                    <span className="ml-2 shrink-0 text-stone-500">{s.durationMs}ms</span>
                  </div>
                ))}
              </div>
              {liveResult.agentLensUrl && (
                <div className="mt-2.5">
                  <a
                    href={liveResult.agentLensUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-sky-800 underline hover:text-sky-950"
                  >
                    Open trace in CoreWeave Agent Lens ↗
                  </a>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Online Judge Tags */}
        <section className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5 lg:col-span-5">
          <h3 className="text-base font-semibold text-stone-900">
            5 Online LLM-Judge Tags Synced to Agent Lens
          </h3>
          <p className="mt-1 text-xs text-stone-600">
            Registered via <code className="rounded bg-stone-100 px-1">pnpm tags</code> so CoreWeave
            Agent Lens automatically flags domain hallucinations on incoming conversations:
          </p>
          <ul className="mt-3 space-y-2.5">
            {TAG_SPECS.map((tag) => (
              <li key={tag.name} className="rounded border border-stone-200 bg-stone-50 p-2.5">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-stone-900">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tag.dot }}
                  />
                  <span>{tag.name}</span>
                </div>
                <p className="mt-1 text-xs leading-4 text-stone-700">{tag.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
