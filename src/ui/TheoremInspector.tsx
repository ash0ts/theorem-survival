import { useState } from "react";
import type { EvaluatedTheorem, TheoremRecord } from "../data/theorems";

const BADGE_CLASSES: Record<EvaluatedTheorem["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-900 border-emerald-300",
  sky: "bg-sky-50 text-sky-900 border-sky-300",
  amber: "bg-amber-50 text-amber-900 border-amber-300",
  stone: "bg-stone-100 text-stone-800 border-stone-300",
  rose: "bg-rose-50 text-rose-900 border-rose-300",
};

export function TheoremInspector({
  theorem,
  evaluated,
  tracedAgentLensUrl,
  onJumpToAgentLens,
}: {
  theorem: TheoremRecord;
  evaluated: EvaluatedTheorem;
  tracedAgentLensUrl?: string | null;
  onJumpToAgentLens?: () => void;
}) {
  const [showJson, setShowJson] = useState(false);

  const jsonContract = JSON.stringify(
    {
      has_conditional_dependency: theorem.conjectureType !== "DENSITY_BOUND",
      dependencies: [
        {
          theorem_label: theorem.theoremLabel,
          conjecture_type: theorem.conjectureType,
          assumption_polarity: theorem.polarity,
          dependency_severity: theorem.severity,
          has_unconditional_fallback: theorem.hasUnconditionalFallback,
          extracted_quote: theorem.extractedQuote,
          remediation_note: evaluated.headline,
        },
      ],
    },
    null,
    2,
  );

  return (
    <section className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-stone-600">
            <span>{theorem.id}</span>
            <span>·</span>
            <span>{theorem.category}</span>
            <span>·</span>
            <span>Hop {theorem.hopDepth}</span>
            <span>·</span>
            <a
              href={theorem.url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-stone-400 hover:text-stone-950"
            >
              {theorem.arxivOrDoi} ↗
            </a>
          </div>
          <h3 className="mt-1 text-base font-semibold text-stone-900">
            {theorem.authors} ({theorem.yearLabel}) — {theorem.title}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold ${BADGE_CLASSES[evaluated.tone]}`}
          >
            {theorem.theoremLabel} · {evaluated.badgeLabel}
          </span>
          {onJumpToAgentLens && (
            <button
              type="button"
              onClick={onJumpToAgentLens}
              className="rounded border border-stone-800 bg-stone-900 px-2.5 py-1 text-xs font-medium text-stone-50 hover:bg-stone-800 cursor-pointer"
            >
              Inspect Agent Lens Trace
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 rounded border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-800">
        <span className="font-semibold text-stone-950">Actionable status: </span>
        {evaluated.headline}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded border border-stone-300 bg-stone-950 text-stone-100">
            <div className="flex items-center justify-between border-b border-stone-800 px-3 py-1.5 text-xs font-mono text-stone-400">
              <span>{theorem.id.toLowerCase()}_theorem_statement.tex</span>
              <span>
                {evaluated.additions > 0 || evaluated.deletions > 0 ? (
                  <>
                    <span className="text-emerald-400">+{evaluated.additions}</span>{" "}
                    <span className="text-rose-400">-{evaluated.deletions}</span>
                  </>
                ) : (
                  <span>unchanged</span>
                )}
              </span>
            </div>
            <div className="overflow-x-auto py-2 font-mono text-xs leading-5">
              {evaluated.diffLines.map((line, idx) => {
                const rowClass =
                  line.type === "added"
                    ? "bg-emerald-950/70 text-emerald-200 border-l-2 border-emerald-400"
                    : line.type === "removed"
                      ? "bg-rose-950/70 text-rose-200 border-l-2 border-rose-400"
                      : "text-stone-300 border-l-2 border-transparent";
                const prefix =
                  line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
                return (
                  <div key={idx} className={`px-3 py-0.5 whitespace-pre ${rowClass}`}>
                    <span className="mr-3 inline-block w-4 select-none text-right text-stone-500">
                      {line.lineNumber}
                    </span>
                    <span className="mr-2 select-none opacity-75">{prefix}</span>
                    <span>{line.content}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 text-sm lg:col-span-5">
          <div className="space-y-2.5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Extracted Conditional Quote
              </div>
              <p className="mt-0.5 text-stone-700 italic">&ldquo;{theorem.extractedQuote}&rdquo;</p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Unconditional Fallback Check ({theorem.hasUnconditionalFallback ? "Exists" : "None"})
              </div>
              <p className="mt-0.5 text-stone-700">{theorem.fallbackSummary}</p>
            </div>
            {tracedAgentLensUrl && (
              <div className="pt-1">
                <a
                  href={tracedAgentLensUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-sky-800 underline hover:text-sky-950"
                >
                  Open verified OTLP conversation in CoreWeave Agent Lens ↗
                </a>
              </div>
            )}
          </div>

          <div className="border-t border-stone-200 pt-2">
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="text-xs font-mono font-medium text-stone-700 underline hover:text-stone-950 cursor-pointer"
            >
              {showJson ? "Hide" : "Show"} structured LLM JSON contract (conf{" "}
              {theorem.confidenceScore.toFixed(2)})
            </button>
            {showJson && (
              <pre className="mt-2 max-h-56 overflow-auto rounded border border-stone-200 bg-stone-100 p-2.5 text-[11px] leading-4 text-stone-800">
                {jsonContract}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
