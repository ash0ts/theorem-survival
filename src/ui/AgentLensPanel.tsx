import { useEffect, useState } from "react";
import { PRESETS, THEOREMS, type PresetId } from "../data/theorems";
import verifiedTraces from "../data/verified-traces.json";
import { EVAL_TABLE_RUN_URL } from "./App";

const CASE_FRIENDLY_LABELS: Record<
  string,
  { shortTitle: string; plainTrap: string }
> = {
  "case-01-visser-rh": {
    shortTitle: "1. Oct 2026 Prime Gaps",
    plainTrap: "True 2-hop upgrade under Basic RH alone (no backup proof existed).",
  },
  "case-02-miller-bach-fallback": {
    shortTitle: "2. Fast Primality (AKS Backup)",
    plainTrap:
      "Naive AI often calls PRIMES-in-P 'newly solved', forgetting AKS (2002) already proved it unconditionally.",
  },
  "case-03-kuperberg-unknot": {
    shortTitle: "3. Knot Recognition (Backup Proof)",
    plainTrap:
      "Naive AI calls Knottedness-in-NP brand new, missing Lackenby's unconditional backup proof.",
  },
  "case-04-schubert-rh-only": {
    shortTitle: "4. Schubert Counting (Needs ERH!)",
    plainTrap:
      "Under Basic RH alone, naive AI falsely marks this proven — overlooking that it actually requires GRH/ERH.",
  },
  "case-05-wesolowski-sqisign": {
    shortTitle: "5. Post-Quantum Crypto (Doesn't Break!)",
    plainTrap:
      "Tests whether AI hallucinates 'crypto is broken' — GRH actually strengthens SQIsign's security proof.",
  },
  "case-06-hooley-weinberger-erh": {
    shortTitle: "6. Artin's Conjecture (Needs ERH!)",
    plainTrap:
      "Even under Friday's RH + GRH claim, Artin's conjecture STILL isn't proved because it needs Extended RH (ERH).",
  },
  "case-07-siegel-twin-primes": {
    shortTitle: "7. Twin Primes (Assumed GRH Was False!)",
    plainTrap:
      "Heath-Brown proved Twin Primes assuming GRH FAILS (Siegel zeros). Proving GRH kills that proof path instead of proving Twin Primes!",
  },
  "case-08-alpoge-furman-simple": {
    shortTitle: "8. Aug 2026 67.25% Simple Zeros",
    plainTrap:
      "Already proven in Lean 4! Subtle catch: RH puts zeros on the line without ruling out duplicate zeros, so 67.25% simplicity still matters.",
  },
};

const TAG_SPECS = [
  {
    name: "rh-grh-erh-conflated",
    plainTitle: "Mixed Up RH vs. GRH vs. ERH",
    dot: "#EF4444",
    summary:
      "Assumed proving basic RH automatically unlocks papers that actually need Generalized RH or Extended RH.",
  },
  {
    name: "missed-unconditional-fallback",
    plainTitle: "Forgot an Existing Backup Proof",
    dot: "#F59E0B",
    summary:
      "Called a speed-up or sharper bound a 'brand-new theorem' when a slower unconditional proof (like AKS primality) already existed.",
  },
  {
    name: "polarity-inversion-miss",
    plainTitle: "Misread an 'If RH Is False' Paper",
    dot: "#8B5CF6",
    summary:
      "Treated a Siegel-zero or ~RH paper as newly proven when proving RH/GRH actually makes its premise impossible.",
  },
  {
    name: "crypto-break-hallucination",
    plainTitle: "False 'Crypto Is Broken' Claim",
    dot: "#EC4899",
    summary:
      "Claimed RH/GRH breaks encryption, when GRH actually strengthens post-quantum security reductions.",
  },
  {
    name: "simplicity-vs-location-blur",
    plainTitle: "Confused Zero Location with Simplicity",
    dot: "#3B82F6",
    summary:
      "Claimed RH makes simple-zero theorems redundant, forgetting RH alone does not forbid double zeros on the line.",
  },
];

function plainVerdict(outcome: string): string {
  if (outcome === "UPGRADED_UNCONDITIONAL") return "Becomes Proven Fact";
  if (outcome === "BOUND_TIGHTENED") return "Gets Faster / Already Proven";
  if (outcome === "STILL_CONDITIONAL") return "Still Unproved";
  if (outcome === "VACUOUS_OR_SUPERSEDED") return "Dead 'What-If' Path";
  if (outcome === "HYPOTHESIS_FALSIFIED") return "Assumption Broken";
  return outcome;
}

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
    cases.find((c) => c.theoremId === focusedTheoremId)?.caseId ?? cases[3].caseId;

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
    const thm = THEOREMS.find((t) => t.id === focusedTheoremId);
    if (thm?.arxivId) setLiveQuery(thm.arxivId);
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
        // Static hosting on GitHub Pages
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCase = cases.find((c) => c.caseId === selectedCaseId) ?? cases[0];
  const v1Right = activeCase.v1.predictedOutcome === activeCase.expectedOutcome;
  const v2Right = activeCase.v2.predictedOutcome === activeCase.expectedOutcome;
  const totalInvocations =
    (verifiedTraces.summary as { totalVerifiedInvocations?: number }).totalVerifiedInvocations ??
    177;

  async function handleRunLiveAudit(e: React.FormEvent) {
    e.preventDefault();
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arxivIdOrQuery: liveQuery.trim(),
          presetId: livePreset,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setLiveResult(data as LiveAuditClientResult);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Plain-English Intro + Live Forge Links */}
      <section className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
              CoreWeave Forge Serverless Inference + CoreWeave Agent Lens
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-950">
              Can AI Read an arXiv Paper and Tell What Actually Changes?
            </h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              Ask a plain LLM prompt whether an RH proof unlocks a paper and it gets tricked nearly
              half the time: it confuses basic <strong>RH</strong> with <strong>GRH</strong> and{" "}
              <strong>ERH</strong>, calls already-proved algorithms &ldquo;brand new,&rdquo; or
              misreads papers that assumed RH was <em>false</em>. Giving the agent four verification
              tools and tracing every step in <strong>CoreWeave Agent Lens</strong> fixes all four
              mistakes across our <strong>{THEOREMS.length}-paper</strong> corpus.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <a
              href={verifiedTraces.agentLensProjectUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 transition"
            >
              Open Agent Lens Project &nearr;
            </a>
            <a
              href={verifiedTraces.agentLensTagsViewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 transition"
            >
              5-Tag Failure View &nearr;
            </a>
            <a
              href={EVAL_TABLE_RUN_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100 transition"
            >
              W&amp;B EvalTable + 160-Paper Run &nearr;
            </a>
          </div>
        </div>

        {/* 3 Plain-English Benchmark Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
            <div className="text-xs font-semibold text-stone-500">
              Tricky Paper Benchmark (Verdict Accuracy)
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950 mt-1">
              4/8 &rarr; <span className="text-emerald-700">8/8</span>
            </div>
            <p className="text-xs text-stone-600 mt-1">
              Naive prompt failed 4 of 8 trap papers; tool-guarded agent got all 8 right.
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
            <div className="text-xs font-semibold text-stone-500">
              Total Audit Speed (8 Benchmark Papers)
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950 mt-1">
              57.4s &rarr; <span className="text-indigo-700">10.4s</span>
            </div>
            <p className="text-xs text-stone-600 mt-1">
              5.5&times; faster on <code className="font-mono text-[11px]">{verifiedTraces.model}</code>{" "}
              once tools check clauses &amp; backup proofs directly.
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
            <div className="text-xs font-semibold text-stone-500">
              Live Traces Logged in CoreWeave Agent Lens
            </div>
            <div className="text-2xl font-bold font-mono text-stone-950 mt-1">
              {totalInvocations} turns
            </div>
            <p className="text-xs text-stone-600 mt-1">
              8 naive + 8 guarded benchmark + 161 arXiv corpus audits in{" "}
              <code className="font-mono text-[11px]">{verifiedTraces.project}</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive 8-Trap Comparison */}
      <section className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-stone-950">
            Inspect 8 Real Trap Papers: Naive AI Prompt vs. Tool-Guarded Agent
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Click any case to compare what each agent concluded — and open the exact trace inside
            CoreWeave Agent Lens.
          </p>
        </div>

        {/* Friendly Case Selector Pills */}
        <div className="flex flex-wrap gap-1.5">
          {cases.map((c) => {
            const friendly = CASE_FRIENDLY_LABELS[c.caseId];
            const naiveFailed = c.v1.predictedOutcome !== c.expectedOutcome;
            const isSelected = c.caseId === activeCase.caseId;
            return (
              <button
                key={c.caseId}
                type="button"
                onClick={() => setSelectedCaseId(c.caseId)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition cursor-pointer inline-flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                }`}
              >
                <span>{friendly?.shortTitle ?? c.arxivOrDoi}</span>
                {naiveFailed && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    Naive AI Fooled
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Trap Header */}
        <div className="rounded-xl bg-stone-100/80 border border-stone-200 p-4 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-stone-950">
              {activeCase.title} ({activeCase.arxivOrDoi})
            </span>
            <span className="text-xs font-mono bg-white border border-stone-200 px-2.5 py-0.5 rounded-md text-stone-700">
              Tested under scenario: <strong>{activeCase.presetLabel}</strong> &middot; Ground truth:{" "}
              <strong>{plainVerdict(activeCase.expectedOutcome)}</strong>
            </span>
          </div>
          <p className="text-xs text-stone-700">
            <strong>Why this paper is a trap: </strong>
            {CASE_FRIENDLY_LABELS[activeCase.caseId]?.plainTrap ?? activeCase.trapFocus}
          </p>
        </div>

        {/* Side-by-Side v1 vs v2 Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* v1 Naive */}
          <div
            className={`rounded-xl border p-4 space-y-3 ${
              v1Right ? "border-stone-200 bg-stone-50/50" : "border-rose-300 bg-rose-50/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Baseline 1 &middot; Naive Prompt
                </span>
                <div className="text-sm font-bold text-stone-900 mt-0.5">
                  Verdict: {plainVerdict(activeCase.v1.predictedOutcome)}{" "}
                  <span
                    className={`ml-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      v1Right
                        ? "bg-amber-100 text-amber-900"
                        : "bg-rose-200 text-rose-950"
                    }`}
                  >
                    {v1Right ? "Right verdict, drifted schema" : "Wrong verdict"}
                  </span>
                </div>
              </div>
              <a
                href={activeCase.v1.agentLensUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-stone-800 hover:bg-stone-100 transition shrink-0"
              >
                Open Trace &nearr;
              </a>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed bg-white rounded-lg border border-stone-200 p-3">
              {activeCase.v1.authorAlert}
            </p>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-stone-500 flex justify-between">
                <span>Steps recorded ({activeCase.v1.spans.length})</span>
                <span className="font-mono">{(activeCase.v1.wallMs / 1000).toFixed(2)}s</span>
              </div>
              {activeCase.v1.spans.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[11px] bg-white border border-stone-200 rounded-md px-2.5 py-1 font-mono"
                >
                  <span className="truncate pr-2">
                    [{s.kind}] {s.name}
                  </span>
                  <span className="text-stone-500 shrink-0">{s.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>

          {/* v2 Guarded */}
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/30 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Baseline 2 &middot; Tool-Guarded Agent
                </span>
                <div className="text-sm font-bold text-stone-900 mt-0.5">
                  Verdict: {plainVerdict(activeCase.v2.predictedOutcome)}{" "}
                  <span className="ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-950">
                    {v2Right ? "Matches Ground Truth" : "Mismatch"}
                  </span>
                </div>
              </div>
              <a
                href={activeCase.v2.agentLensUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 transition shrink-0"
              >
                Open Trace &nearr;
              </a>
            </div>

            <p className="text-xs text-stone-800 leading-relaxed bg-white rounded-lg border border-emerald-200 p-3">
              {activeCase.v2.authorAlert}
            </p>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-stone-600 flex justify-between">
                <span>4 Verification Tools + LLM ({activeCase.v2.spans.length} spans)</span>
                <span className="font-mono">{(activeCase.v2.wallMs / 1000).toFixed(2)}s</span>
              </div>
              {activeCase.v2.spans.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-[11px] bg-white border border-emerald-200/80 rounded-md px-2.5 py-1 font-mono"
                >
                  <span className="truncate pr-2">
                    [{s.kind}] {s.name}
                  </span>
                  <span className="text-stone-500 shrink-0">{s.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5 Automated Failure Tags in Plain English */}
      <section className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-950">
              5 Failure Modes Monitored Automatically in Agent Lens
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Each tag runs an online LLM judge on incoming paper audits in{" "}
              <code className="font-mono text-[11px]">{verifiedTraces.project}</code>.
            </p>
          </div>
          <a
            href={verifiedTraces.agentLensTagsViewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-indigo-700 hover:underline"
          >
            View all 5 tags in Agent Lens &nearr;
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {TAG_SPECS.map((tag) => (
            <a
              key={tag.name}
              href={`${verifiedTraces.agentLensProjectUrl}/conversations?tags=${tag.name}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-indigo-50/50 hover:border-indigo-300 p-3 transition block"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.dot }}
                />
                <span>{tag.plainTitle}</span>
              </div>
              <div className="text-[10px] font-mono text-stone-500 mt-0.5">{tag.name}</div>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">{tag.summary}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Live Paper Auditor */}
      <section className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-950">
              Audit Any arXiv Paper Live
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Fetches any arXiv ID live, checks its conditional clauses on CoreWeave Forge
              Inference, and streams a fresh trace to Agent Lens.
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              serverHealth
                ? "bg-emerald-100 text-emerald-900"
                : "bg-stone-100 text-stone-700"
            }`}
          >
            {serverHealth
              ? `Connected · ${serverHealth.model}`
              : "Static Preview (run pnpm dev locally for live API calls)"}
          </span>
        </div>

        <form onSubmit={handleRunLiveAudit} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <input
            type="text"
            value={liveQuery}
            onChange={(e) => setLiveQuery(e.target.value)}
            placeholder="Enter any arXiv ID (e.g. 2610.27830, 2602.02263, 2112.11412)..."
            className="sm:col-span-5 rounded-xl border border-stone-300 px-3.5 py-2 text-sm font-mono"
          />
          <select
            value={livePreset}
            onChange={(e) => setLivePreset(e.target.value as PresetId)}
            className="sm:col-span-4 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={liveLoading || !serverHealth}
            className="sm:col-span-3 rounded-xl bg-indigo-700 text-white text-xs font-semibold px-4 py-2 hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
          >
            {liveLoading ? "Auditing Paper..." : "Run Live Audit"}
          </button>
        </form>

        {!serverHealth && (
          <p className="text-xs text-stone-500 font-mono bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
            Local live mode: git clone https://github.com/ash0ts/theorem-survival &amp;&amp; cd
            theorem-survival &amp;&amp; WANDB_API_KEY=... pnpm dev
          </p>
        )}

        {liveError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-900">
            {liveError}
          </div>
        )}

        {liveResult && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-stone-950">
                {liveResult.paper.title} ({liveResult.paper.arxivOrDoi}) &rarr;{" "}
                <span className="text-indigo-800">{plainVerdict(liveResult.predictedOutcome)}</span>
              </div>
              {liveResult.agentLensUrl && (
                <a
                  href={liveResult.agentLensUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-700 text-white"
                >
                  View Fresh Trace in Agent Lens &nearr;
                </a>
              )}
            </div>
            <p className="text-xs text-stone-800 leading-relaxed">{liveResult.authorAlert}</p>
          </div>
        )}
      </section>
    </div>
  );
}
