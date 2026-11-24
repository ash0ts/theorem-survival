import { useState } from "react";
import verifiedTraces from "../data/verified-traces.json";
import poolStats from "../data/pool-stats.json";
import { PRESETS, THEOREMS, outcomeStyle } from "../data/theorems";

const AGENT_LENS_PROJECT_URL = verifiedTraces.agentLensProjectUrl;
const AGENT_LENS_CONV_URL = verifiedTraces.agentLensTagsViewUrl;

interface TraceSpan {
  kind: string;
  name: string;
  durationMs: number;
  summary: string;
  inputTokens?: number;
  outputTokens?: number;
}

interface TraceArm {
  conversationId: string;
  agentLensUrl: string;
  predictedOutcome: string;
  conjectureType: string;
  polarity: string;
  hasFallback: boolean;
  exactMatch: boolean;
  authorAlert: string;
  totalTokens: number;
  wallMs: number;
  spans: TraceSpan[];
}

interface VerifiedCase {
  caseId: string;
  theoremId: string;
  arxivOrDoi: string;
  title: string;
  presetId: string;
  presetLabel: string;
  trapFocus: string;
  expectedOutcome: string;
  v1: TraceArm;
  v2: TraceArm;
}

interface LiveAuditResponse {
  ok: boolean;
  paper: { id: string; title: string; authors: string; year: number; url: string };
  preset: { id: string; label: string };
  predictedOutcome: string;
  predictedConjecture: string;
  predictedPolarity: string;
  predictedFallback: boolean;
  extractedQuote: string;
  authorAlert: string;
  diffLines: Array<{ type: "context" | "removed" | "added"; content: string }>;
  wallMs: number;
  totalTokens: number;
  conversationId: string;
  agentLensUrl: string;
  spans: TraceSpan[];
  error?: string;
}

export function AgentLensPanel({
  initialPaperId,
  onJumpToPaperInExplorer,
}: {
  initialPaperId?: string;
  onJumpToPaperInExplorer: (id: string) => void;
}) {
  const cases = verifiedTraces.cases as VerifiedCase[];
  const heldoutArms = verifiedTraces.heldoutBenchmark?.heldout60Arms ?? [];
  const [selectedCaseIdx, setSelectedCaseIdx] = useState(0);
  const selected = cases[selectedCaseIdx];

  const [liveInput, setLiveInput] = useState(initialPaperId || "2111.01481");
  const [livePreset, setLivePreset] = useState("checked_nov24");
  const [liveArm, setLiveArm] = useState<"auditor-v3-fulltext" | "auditor-v1-neutral">(
    "auditor-v3-fulltext",
  );
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveResult, setLiveResult] = useState<LiveAuditResponse | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  async function runLiveAudit() {
    setLiveLoading(true);
    setLiveError(null);
    setLiveResult(null);
    try {
      const resp = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperIdOrArxiv: liveInput.trim(),
          presetId: livePreset,
          arm: liveArm,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      setLiveResult(json);
    } catch (err) {
      setLiveError(
        err instanceof Error && err.message.includes("Failed to fetch")
          ? "Live API runs locally (`pnpm dev:full` with `WANDB_API_KEY`). Static GitHub Pages serves the pre-computed full-pool corpus and verified Agent Lens trace links."
          : String(err),
      );
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Honest Attempt-2 Benchmark Banner */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full mb-2">
              CoreWeave Agent Lens + Forge Inference + W&amp;B EvalTable
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Held-Out Benchmark &amp; Full-Pool Audit (Zero Label Lookup)
            </h2>
            <p className="text-sm text-stone-600 mt-1.5 leading-relaxed">
              Every tool call has gold-label imports blocked by static tests. On{" "}
              <strong>60 stratified held-out papers</strong> (3 trials per arm), an unguided prompt
              falsely marks <strong>29.3%</strong> of non-settled papers as settled by the checked
              proof (and a larger model without rules does worse at <strong>40.0%</strong>). Adding
              explicit mathematical scope rules lifts conjecture accuracy from{" "}
              <strong>57.8% &rarr; 83.3%</strong>; fetching `.tex` / HTML full-text windows nudges
              it to <strong>85.6%</strong> while grounding silent abstracts in located body quotes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={AGENT_LENS_PROJECT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition"
            >
              Open CoreWeave Agent Lens &#8599;
            </a>
            <a
              href={AGENT_LENS_CONV_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 transition"
            >
              Traced Conversations &#8599;
            </a>
            <a
              href={poolStats.evalRunUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100 transition"
            >
              W&amp;B EvalTable Run &#8599;
            </a>
          </div>
        </div>

        {/* Held-Out 6-Arm Comparison Table */}
        {heldoutArms.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">Auditor Arm (3 trials &times; 60 held-out)</th>
                  <th className="px-3 py-2.5 font-semibold">Conjecture (6-way)</th>
                  <th className="px-3 py-2.5 font-semibold">Checked Outcome</th>
                  <th className="px-3 py-2.5 font-semibold">False-Settled (/50)</th>
                  <th className="px-3 py-2.5 font-semibold">Agent Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {heldoutArms.map((a) => (
                  <tr
                    key={a.configId}
                    className={
                      a.configId === "v3-fulltext-glm"
                        ? "bg-emerald-50/40 font-medium"
                        : "bg-white"
                    }
                  >
                    <td className="px-3.5 py-2 text-stone-900">{a.label}</td>
                    <td className="px-3 py-2 font-mono">
                      {a.meanConjectureExact.toFixed(1)}/60 ({a.meanConjecturePct.toFixed(1)}%)
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {a.meanOutcomeMatch.toFixed(1)}/60 ({a.meanOutcomePct.toFixed(1)}%)
                    </td>
                    <td className="px-3 py-2 font-mono">
                      <span
                        className={
                          a.meanFalseSettledClaims > 5
                            ? "text-rose-700 font-semibold"
                            : "text-emerald-800"
                        }
                      >
                        {a.meanFalseSettledClaims.toFixed(1)}/50 ({a.meanFalseSettledPct.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-stone-500">
                      {a.agentVersionTag}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Hand-Picked 8-Case Trace Inspector (Explicitly Labelled) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-900">
              Inspect Real Agent Lens Traces (8 Hand-Picked Edge Cases, No Label Lookup)
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Click any case to compare <code className="font-mono">v1-neutral</code> (abstract
              only) against <code className="font-mono">v3-fulltext</code> (arXiv `.tex` / HTML
              body windows + deterministic evaluator).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onJumpToPaperInExplorer(selected.theoremId)}
            className="text-xs font-semibold text-indigo-700 hover:underline cursor-pointer"
          >
            View {selected.arxivOrDoi} in Explorer &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {cases.map((c, idx) => {
            const active = idx === selectedCaseIdx;
            return (
              <button
                key={c.caseId}
                type="button"
                onClick={() => setSelectedCaseIdx(idx)}
                className={`text-left rounded-xl border p-3 transition cursor-pointer ${
                  active
                    ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                    : "bg-stone-50 text-stone-800 border-stone-200 hover:border-stone-400"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[11px] font-mono mb-1">
                  <span className={active ? "text-stone-300" : "text-stone-500"}>
                    {c.arxivOrDoi}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={`px-1.5 py-0.5 rounded-sm font-sans font-semibold ${
                        c.v1.exactMatch
                          ? "bg-emerald-500/20 text-emerald-300"
                          : active
                            ? "bg-rose-500/30 text-rose-200"
                            : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      v1 {c.v1.exactMatch ? "OK" : "MISS"}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-sm font-sans font-semibold ${
                        c.v2.exactMatch
                          ? active
                            ? "bg-emerald-500/30 text-emerald-200"
                            : "bg-emerald-100 text-emerald-800"
                          : active
                            ? "bg-amber-500/30 text-amber-200"
                            : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      v3 {c.v2.exactMatch ? "OK" : "MISS"}
                    </span>
                  </span>
                </div>
                <div className="text-xs font-semibold line-clamp-1">{c.title}</div>
                <div
                  className={`text-[11px] mt-0.5 line-clamp-1 ${
                    active ? "text-stone-300" : "text-stone-500"
                  }`}
                >
                  {c.trapFocus}
                </div>
              </button>
            );
          })}
        </div>

        {/* Side-by-side v1-neutral vs v3-fulltext comparison */}
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-stone-200">
            <div>
              <div className="text-sm font-bold text-stone-900">{selected.title}</div>
              <div className="text-xs text-stone-600 mt-0.5">
                Scenario: <strong>{selected.presetLabel}</strong> &middot; Edge case:{" "}
                <span className="text-stone-800 font-medium">{selected.trapFocus}</span> &middot;
                Ground truth:{" "}
                <span
                  className={`inline-block font-semibold px-2 py-0.5 rounded-full text-[11px] border ${
                    outcomeStyle(selected.expectedOutcome as never).badge
                  }`}
                >
                  {outcomeStyle(selected.expectedOutcome as never).shortLabel} (
                  {selected.expectedOutcome})
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ArmComparisonCard
              title="v1-neutral — Single Prompt on Abstract"
              arm={selected.v1}
              expectedOutcome={selected.expectedOutcome}
            />
            <ArmComparisonCard
              title="v3-fulltext — Full-Text Windows + Scope Tools"
              arm={selected.v2}
              expectedOutcome={selected.expectedOutcome}
            />
          </div>
        </div>
      </section>

      {/* Live Paper Auditor (works when local backend is running) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-stone-900">
            Run Live AI Auditor &amp; Stream New Spans to CoreWeave Agent Lens
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Enter any paper ID (<code className="font-mono">P09</code>,{" "}
            <code className="font-mono">P12</code>) or arXiv ID (e.g.{" "}
            <code className="font-mono">2111.01481</code> or{" "}
            <code className="font-mono">1012.4019</code>) when running{" "}
            <code className="font-mono">pnpm dev:full</code> locally.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Paper or arXiv ID
            </label>
            <input
              type="text"
              value={liveInput}
              onChange={(e) => setLiveInput(e.target.value)}
              list="theorem-preset-ids"
              placeholder="e.g. 2111.01481 or 1012.4019"
              className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-none focus:border-stone-600"
            />
            <datalist id="theorem-preset-ids">
              {THEOREMS.slice(0, 40).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.arxivOrDoi} — {t.shortNodeTitle}
                </option>
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">
              Proof Scenario
            </label>
            <select
              value={livePreset}
              onChange={(e) => setLivePreset(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-stone-600 mb-1">Agent Arm</label>
            <select
              value={liveArm}
              onChange={(e) =>
                setLiveArm(e.target.value as "auditor-v3-fulltext" | "auditor-v1-neutral")
              }
              className="w-full text-sm px-3 py-2 rounded-lg border border-stone-300 bg-white"
            >
              <option value="auditor-v3-fulltext">v3-fulltext (Tools)</option>
              <option value="auditor-v1-neutral">v1-neutral (Baseline)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={runLiveAudit}
              disabled={liveLoading}
              className="w-full text-sm font-semibold px-4 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-700 disabled:opacity-50 transition cursor-pointer"
            >
              {liveLoading ? "Auditing..." : "Audit Live"}
            </button>
          </div>
        </div>

        {liveError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
            {liveError}
          </div>
        )}

        {liveResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-stone-900">{liveResult.paper.title}</div>
                <div className="text-xs text-stone-600">
                  Predicted:{" "}
                  <strong className="font-mono">{liveResult.predictedOutcome}</strong> &middot;{" "}
                  Conjecture: <span className="font-mono">{liveResult.predictedConjecture}</span>{" "}
                  &middot; {liveResult.wallMs}ms &middot; {liveResult.totalTokens} tokens
                </div>
              </div>
              <a
                href={liveResult.agentLensUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                Open Live Trace in CoreWeave Agent Lens &#8599;
              </a>
            </div>
            <p className="text-xs text-stone-800">{liveResult.authorAlert}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ArmComparisonCard({
  title,
  arm,
  expectedOutcome,
}: {
  title: string;
  arm: TraceArm;
  expectedOutcome: string;
}) {
  const matched = arm.predictedOutcome === expectedOutcome;
  return (
    <div
      className={`rounded-xl border p-4 bg-white flex flex-col justify-between ${
        matched ? "border-emerald-300" : "border-rose-300"
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold text-stone-900">{title}</span>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              matched
                ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                : "bg-rose-100 text-rose-900 border border-rose-200"
            }`}
          >
            {matched ? "Matches Ground Truth" : "Wrong Verdict"}
          </span>
        </div>

        <div className="text-xs text-stone-700 space-y-1 mb-3">
          <div>
            Verdict: <span className="font-mono font-semibold">{arm.predictedOutcome}</span>
          </div>
          <div className="text-[11px] text-stone-500 font-mono">
            conjecture={arm.conjectureType} &middot; polarity={arm.polarity} &middot; backup=
            {String(arm.hasFallback)}
          </div>
          <p className="text-xs text-stone-600 pt-1 leading-relaxed">{arm.authorAlert}</p>
        </div>

        <div className="space-y-1.5 border-t border-stone-100 pt-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
            Traced Span Waterfall ({arm.wallMs}ms &middot; {arm.totalTokens} tok)
          </div>
          {arm.spans.map((sp, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-[11px] bg-stone-50 rounded-md px-2.5 py-1.5 border border-stone-200/70"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-xs shrink-0 ${
                    sp.kind === "llm"
                      ? "bg-purple-100 text-purple-900"
                      : "bg-sky-100 text-sky-900"
                  }`}
                >
                  {sp.kind.toUpperCase()}
                </span>
                <span className="font-mono font-semibold text-stone-800 truncate">{sp.name}</span>
                <span className="text-stone-500 truncate hidden sm:inline">&mdash; {sp.summary}</span>
              </div>
              <span className="font-mono text-stone-500 shrink-0">{sp.durationMs}ms</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-[11px]">
        <span className="font-mono text-stone-400 truncate max-w-[210px]">
          {arm.conversationId}
        </span>
        <a
          href={arm.agentLensUrl}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-indigo-700 hover:underline shrink-0"
        >
          Inspect in Agent Lens &#8599;
        </a>
      </div>
    </div>
  );
}
