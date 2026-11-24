import { useState } from "react";
import type { EvaluatedTheorem, TheoremRecord } from "../data/theorems";

function evidenceBadgeInfo(tier: TheoremRecord["evidenceTier"]): {
  label: string;
  className: string;
} {
  if (tier === "fulltext") {
    return {
      label: "Full-text verified",
      className: "bg-emerald-50 text-emerald-900 border-emerald-200",
    };
  }
  if (tier === "curated_primary") {
    return {
      label: "Primary-source verified",
      className: "bg-indigo-50 text-indigo-900 border-indigo-200",
    };
  }
  return {
    label: "Abstract only",
    className: "bg-amber-50 text-amber-900 border-amber-200",
  };
}

export function PaperRowDetail({
  theorem,
  evaluated,
  allTheoremsById,
  onSelectPaper,
  onOpenInAgentLensTab,
}: {
  theorem: TheoremRecord;
  evaluated: EvaluatedTheorem;
  allTheoremsById: Record<string, TheoremRecord>;
  onSelectPaper: (id: string) => void;
  onOpenInAgentLensTab: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const evBadge = evidenceBadgeInfo(theorem.evidenceTier);

  function copyPaperLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("thm", theorem.id);
    navigator.clipboard?.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const upstreamPapers = theorem.upstreamIds
    .map((uid) => allTheoremsById[uid])
    .filter((x): x is TheoremRecord => Boolean(x));

  return (
    <div className="bg-stone-50/90 border-t border-stone-200 px-4 py-4 sm:px-6 space-y-4">
      {/* Machine-Checked Lean 4 Banner for Lagarias & Robin */}
      {theorem.machineCheckedLean?.verified && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
          <div>
            <strong>Machine-checked in Lean 4 with zero hypotheses: </strong>
            {theorem.machineCheckedLean.note}
          </div>
          <a
            href={theorem.machineCheckedLean.verifierUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold underline hover:text-emerald-800 shrink-0"
          >
            Andrew Sutherland&rsquo;s verification page &#8599;
          </a>
        </div>
      )}

      {/* Action Links Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200/80">
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
          <span className="font-mono font-semibold text-stone-800">{theorem.arxivOrDoi}</span>
          <span>&middot;</span>
          <span>{theorem.theoremLabel}</span>
          <span
            className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${evBadge.className}`}
          >
            {evBadge.label}
          </span>
          {typeof theorem.citedByCount === "number" && theorem.citedByCount > 0 && (
            <span className="font-mono text-[11px] bg-stone-200/70 px-1.5 py-0.5 rounded-sm text-stone-800">
              {theorem.citedByCount.toLocaleString()} citations
            </span>
          )}
          {theorem.primarySubcategory && (
            <span className="font-mono text-[11px] bg-stone-200/70 px-1.5 py-0.5 rounded-sm">
              {theorem.primarySubcategory}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={theorem.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition"
          >
            Read Paper ({theorem.url.includes("arxiv.org") ? "arXiv" : "DOI"}) &#8599;
          </a>
          {theorem.agentLensUrl && (
            <a
              href={theorem.agentLensUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 transition"
            >
              CoreWeave Agent Lens Trace &#8599;
            </a>
          )}
          <button
            type="button"
            onClick={() => onOpenInAgentLensTab(theorem.id)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white text-stone-700 border border-stone-300 hover:bg-stone-100 transition cursor-pointer"
          >
            Test in AI Auditor
          </button>
          <button
            type="button"
            onClick={copyPaperLink}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white text-stone-700 border border-stone-300 hover:bg-stone-100 transition cursor-pointer"
          >
            {copied ? "Link Copied!" : "Share This Paper"}
          </button>
        </div>
      </div>

      {/* Plain-English Evidence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-stone-200 p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1">
            What Changes in This Scenario
          </div>
          <p className="text-xs text-stone-800 leading-relaxed">{evaluated.headline}</p>
          {upstreamPapers.length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-100 text-[11px] text-stone-600">
              Builds directly on:{" "}
              {upstreamPapers.map((up) => (
                <button
                  key={up.id}
                  type="button"
                  onClick={() => onSelectPaper(up.id)}
                  className="font-semibold text-indigo-700 hover:underline mr-2 cursor-pointer"
                >
                  {up.shortNodeTitle} ({up.arxivOrDoi})
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1">
            Existing Backup Without Conjecture
          </div>
          <p className="text-xs text-stone-800 leading-relaxed">{theorem.fallbackSummary}</p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-3.5">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
              Supporting Quote
            </span>
            {theorem.quoteLocator && (
              <span className="font-mono text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-sm truncate max-w-[180px]">
                {theorem.quoteLocator}
              </span>
            )}
          </div>
          <blockquote className="text-xs italic text-stone-700 leading-relaxed">
            &ldquo;{theorem.extractedQuote}&rdquo;
          </blockquote>
        </div>
      </div>

      {/* Compact Statement Diff */}
      <div className="rounded-xl border border-stone-800 bg-stone-950 overflow-hidden">
        <div className="px-3.5 py-2 bg-stone-900 border-b border-stone-800 flex items-center justify-between text-[11px] text-stone-400 font-mono">
          <span>Statement Before vs. After ({theorem.arxivOrDoi})</span>
          <span>
            {evaluated.deletions > 0 || evaluated.additions > 0 ? (
              <>
                <span className="text-rose-400">-{evaluated.deletions}</span>{" "}
                <span className="text-emerald-400">+{evaluated.additions}</span>
              </>
            ) : (
              "unchanged in this scenario"
            )}
          </span>
        </div>
        <pre className="p-3.5 text-xs font-mono leading-relaxed overflow-x-auto text-stone-200">
          {evaluated.diffLines.map((line, i) => (
            <div
              key={i}
              className={
                line.type === "removed"
                  ? "bg-rose-950/60 text-rose-200 px-2 -mx-2"
                  : line.type === "added"
                    ? "bg-emerald-950/60 text-emerald-200 px-2 -mx-2"
                    : "text-stone-300"
              }
            >
              <span className="select-none inline-block w-5 text-stone-500">
                {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
              </span>
              {line.content}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
