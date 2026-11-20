import { useEffect, useMemo, useState } from "react";
import {
  evaluateTheorem,
  normalizeWorldState,
  PRESETS,
  THEOREMS,
  type PresetId,
  type TopicBucket,
  type TruthState,
  type WorldState,
} from "../data/theorems";
import verifiedTraces from "../data/verified-traces.json";
import { AgentLensPanel } from "./AgentLensPanel";
import { ImpactOverview } from "./ImpactOverview";
import { PaperRowDetail } from "./PaperRowDetail";

type ViewTab = "simulator" | "agent-lens";
type OutcomeFilter = "ALL" | "PROVEN" | "FASTER" | "WAITING" | "DEAD_OR_BROKEN";
type ConjectureFilter = "ALL" | "RH" | "GRH" | "ERH" | "ASSUMES_FALSE" | "ALREADY_PROVEN";
type ShelfFilter = "ALL" | "FEATURED" | "RECENT_2025_2026";

export const EVAL_TABLE_RUN_URL =
  "https://forge.coreweave.com/wandb/wandb/theorem-survival/runs/r8te6qh1";

function isEmbeddedContext(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as unknown as { __THEOREM_SURVIVAL_EMBED__?: boolean }).__THEOREM_SURVIVAL_EMBED__) {
    return true;
  }
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  if (new URLSearchParams(window.location.search).get("embed") === "1") return true;
  return window.location.protocol !== "http:" && window.location.protocol !== "https:";
}

function parseInitialUrl() {
  const params = new URLSearchParams(
    typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")
      ? window.location.search
      : "",
  );
  const tab: ViewTab = params.get("tab") === "agent-lens" ? "agent-lens" : "simulator";
  const presetParam = params.get("preset") as PresetId | null;
  const matchedPreset = PRESETS.find((p) => p.id === presetParam) ?? PRESETS[2];
  const thmParam = params.get("thm");
  const matchedThm = THEOREMS.find((t) => t.id === thmParam)?.id ?? null;

  const ws: WorldState = { ...matchedPreset.state };
  const rhParam = params.get("rh") as TruthState | null;
  const grhParam = params.get("grh") as TruthState | null;
  const erhParam = params.get("erh") as TruthState | null;
  if (rhParam === "OPEN" || rhParam === "TRUE" || rhParam === "FALSE") ws.rh = rhParam;
  if (grhParam === "OPEN" || grhParam === "TRUE" || grhParam === "FALSE") ws.grh = grhParam;
  if (erhParam === "OPEN" || erhParam === "TRUE" || erhParam === "FALSE") ws.erh = erhParam;
  if (params.get("siegel") === "1") ws.siegelZero = true;

  return { tab, presetId: matchedPreset.id, worldState: ws, expandedId: matchedThm };
}

function assumptionBadgeText(
  conjectureType: string,
  polarity: string,
): { label: string; style: string } {
  if (conjectureType === "DENSITY_BOUND") {
    return {
      label: "No Conjecture Needed",
      style: "bg-sky-50 text-sky-800 border-sky-200",
    };
  }
  if (polarity === "ASSUMES_FALSE") {
    return {
      label: `Assumes ${conjectureType} Is False`,
      style: "bg-purple-50 text-purple-800 border-purple-200",
    };
  }
  if (conjectureType === "RH") {
    return {
      label: "Needs Basic RH",
      style: "bg-stone-100 text-stone-800 border-stone-300",
    };
  }
  if (conjectureType === "GRH") {
    return {
      label: "Needs GRH",
      style: "bg-indigo-50 text-indigo-800 border-indigo-200",
    };
  }
  return {
    label: "Needs Extended RH (ERH)",
    style: "bg-amber-50 text-amber-900 border-amber-300",
  };
}

function outcomeBadgeStyle(tone: "emerald" | "sky" | "amber" | "stone" | "rose"): string {
  if (tone === "emerald") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (tone === "sky") return "bg-sky-100 text-sky-900 border-sky-300";
  if (tone === "amber") return "bg-amber-100 text-amber-900 border-amber-300";
  if (tone === "rose") return "bg-rose-100 text-rose-900 border-rose-300";
  return "bg-stone-200 text-stone-800 border-stone-300";
}

export function App() {
  const initial = useMemo(() => parseInitialUrl(), []);
  const [tab, setTab] = useState<ViewTab>(initial.tab);
  const [presetId, setPresetId] = useState<PresetId>(initial.presetId);
  const [worldState, setWorldState] = useState<WorldState>(initial.worldState);
  const [expandedId, setExpandedId] = useState<string | null>(initial.expandedId);
  const [focusedForAudit, setFocusedForAudit] = useState<string>(initial.expandedId ?? "P04");

  const [shelfFilter, setShelfFilter] = useState<ShelfFilter>("ALL");
  const [topicFilter, setTopicFilter] = useState<"ALL" | TopicBucket>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("ALL");
  const [conjectureFilter, setConjectureFilter] = useState<ConjectureFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showCustomSwitches, setShowCustomSwitches] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const theoremsById = useMemo(
    () => Object.fromEntries(THEOREMS.map((t) => [t.id, t])),
    [],
  );

  const activePreset = useMemo(
    () =>
      PRESETS.find(
        (p) =>
          p.state.rh === worldState.rh &&
          p.state.grh === worldState.grh &&
          p.state.erh === worldState.erh &&
          p.state.siegelZero === worldState.siegelZero,
      ) ?? null,
    [worldState],
  );

  const isEmbed = useMemo(() => isEmbeddedContext(), []);

  useEffect(() => {
    if (isEmbed) return;
    const params = new URLSearchParams();
    if (tab !== "simulator") params.set("tab", tab);
    if (activePreset) {
      params.set("preset", activePreset.id);
    } else {
      params.set("rh", worldState.rh);
      params.set("grh", worldState.grh);
      params.set("erh", worldState.erh);
      if (worldState.siegelZero) params.set("siegel", "1");
    }
    if (expandedId) params.set("thm", expandedId);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    try {
      window.history.replaceState(null, "", nextUrl);
    } catch {
      // Sandboxed iframe environment
    }
  }, [isEmbed, tab, activePreset, worldState, expandedId]);

  useEffect(() => {
    function onPopState() {
      const next = parseInitialUrl();
      setTab(next.tab);
      setPresetId(next.presetId);
      setWorldState(next.worldState);
      setExpandedId(next.expandedId);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const evaluatedById = useMemo(() => {
    const out: Record<string, ReturnType<typeof evaluateTheorem>> = {};
    for (const t of THEOREMS) {
      out[t.id] = evaluateTheorem(t, worldState);
    }
    return out;
  }, [worldState]);

  const counts = useMemo(() => {
    let proven = 0;
    let faster = 0;
    let waiting = 0;
    let deadOrBroken = 0;
    for (const t of THEOREMS) {
      const o = evaluatedById[t.id].outcome;
      if (o === "UPGRADED_UNCONDITIONAL") proven++;
      else if (o === "BOUND_TIGHTENED") faster++;
      else if (o === "STILL_CONDITIONAL") waiting++;
      else deadOrBroken++;
    }
    return { proven, faster, waiting, deadOrBroken };
  }, [evaluatedById]);

  const featuredCount = useMemo(
    () => THEOREMS.filter((t) => t.isFeatured).length,
    [],
  );
  const recentCount = useMemo(
    () => THEOREMS.filter((t) => (t.yearNumeric ?? 0) >= 2025).length,
    [],
  );

  const filteredTheorems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = THEOREMS.filter((t) => {
      if (shelfFilter === "FEATURED" && !t.isFeatured) return false;
      if (shelfFilter === "RECENT_2025_2026" && (t.yearNumeric ?? 0) < 2025) return false;
      if (topicFilter !== "ALL" && (t.topicBucket ?? "Primes & Number Theory") !== topicFilter) {
        return false;
      }

      const o = evaluatedById[t.id].outcome;
      if (outcomeFilter === "PROVEN" && o !== "UPGRADED_UNCONDITIONAL") return false;
      if (outcomeFilter === "FASTER" && o !== "BOUND_TIGHTENED") return false;
      if (outcomeFilter === "WAITING" && o !== "STILL_CONDITIONAL") return false;
      if (
        outcomeFilter === "DEAD_OR_BROKEN" &&
        o !== "VACUOUS_OR_SUPERSEDED" &&
        o !== "HYPOTHESIS_FALSIFIED"
      ) {
        return false;
      }

      if (conjectureFilter === "RH" && (t.conjectureType !== "RH" || t.polarity !== "ASSUMES_TRUE")) {
        return false;
      }
      if (conjectureFilter === "GRH" && (t.conjectureType !== "GRH" || t.polarity !== "ASSUMES_TRUE")) {
        return false;
      }
      if (conjectureFilter === "ERH" && (t.conjectureType !== "ERH" || t.polarity !== "ASSUMES_TRUE")) {
        return false;
      }
      if (conjectureFilter === "ASSUMES_FALSE" && t.polarity !== "ASSUMES_FALSE") {
        return false;
      }
      if (conjectureFilter === "ALREADY_PROVEN" && t.conjectureType !== "DENSITY_BOUND") {
        return false;
      }

      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.plainSummary ?? "").toLowerCase().includes(q) ||
        t.authors.toLowerCase().includes(q) ||
        t.arxivOrDoi.toLowerCase().includes(q) ||
        t.shortNodeTitle.toLowerCase().includes(q)
      );
    });

    // Put featured landmarks first so newcomers immediately see iconic examples, then newest papers
    return matches.sort((a, b) => {
      if (Boolean(a.isFeatured) !== Boolean(b.isFeatured)) {
        return a.isFeatured ? -1 : 1;
      }
      return (b.yearNumeric ?? 0) - (a.yearNumeric ?? 0);
    });
  }, [shelfFilter, topicFilter, outcomeFilter, conjectureFilter, searchQuery, evaluatedById]);

  const hasActiveFilters =
    shelfFilter !== "ALL" ||
    topicFilter !== "ALL" ||
    outcomeFilter !== "ALL" ||
    conjectureFilter !== "ALL" ||
    searchQuery.trim() !== "";

  const visibleTheorems = filteredTheorems;

  function applyPreset(id: PresetId) {
    const found = PRESETS.find((p) => p.id === id);
    if (!found) return;
    setPresetId(id);
    setWorldState({ ...found.state });
  }

  function handleCopyShareUrl() {
    const shareTarget = isEmbed
      ? `https://ash0ts.github.io/theorem-survival/${activePreset ? `?preset=${activePreset.id}` : ""}`
      : window.location.href;
    try {
      navigator.clipboard?.writeText(shareTarget);
    } catch {
      // Clipboard blocked in sandboxed iframe
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  }

  function resetAllFilters() {
    setShelfFilter("ALL");
    setTopicFilter("ALL");
    setOutcomeFilter("ALL");
    setConjectureFilter("ALL");
    setSearchQuery("");
  }

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-stone-900">
      {/* Top Orientation Header + Live Links Bar */}
      <header className="bg-white border-b border-stone-200">
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 ${isEmbed ? "py-3 space-y-2.5" : "py-5 space-y-4"}`}>
          {isEmbed ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                Interactive Explorer &middot; {THEOREMS.length} Real arXiv &amp; Landmark Papers
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`https://ash0ts.github.io/theorem-survival/${activePreset ? `?preset=${activePreset.id}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition"
                >
                  Open Full-Screen &#8599;
                </a>
                <a
                  href={verifiedTraces.agentLensProjectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 transition"
                >
                  Agent Lens &#8599;
                </a>
                <a
                  href={EVAL_TABLE_RUN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100 transition"
                >
                  EvalTable &#8599;
                </a>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 mb-2.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  Live Explorer &middot; {THEOREMS.length} Real arXiv &amp; Landmark Papers
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-950">
                  If the Riemann Hypothesis Is Proved, What Actually Changes?
                </h1>
                <p className="text-sm sm:text-base text-stone-600 mt-2 leading-relaxed">
                  On Nov 20, 2026, Levent Alpöge and Claude posted a 14-part Lean 4 archive claiming to
                  prove both the original <strong>Riemann Hypothesis (RH)</strong> and its{" "}
                  <strong>Generalized</strong> cousin (<strong>GRH</strong>), while Lean&rsquo;s proof
                  checker is still replaying it. Pick a scenario below to see which of{" "}
                  <strong>{THEOREMS.length} real papers</strong> become proven facts, which just get
                  faster, which still aren&rsquo;t proved yet, and which weirdly evaporate.
                </p>
              </div>

              {/* Preserved Quick Links Bar */}
              <div className="flex flex-wrap items-center gap-2 lg:justify-end shrink-0">
                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-stone-900 text-white hover:bg-stone-700 transition cursor-pointer"
                >
                  {copiedLink ? "Copied Link!" : "Copy Share Link"}
                </button>
                <a
                  href="https://forge.coreweave.com/wandb/wandb/agent-lens-fc/reports/Which-Papers-Actually-Change-If-the-Riemann-Hypothesis-Holds--VmlldzoxODM0MjcxNw=="
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-950 border border-emerald-200 hover:bg-emerald-100 transition"
                >
                  Forge Report &#8599;
                </a>
                <a
                  href="https://github.com/ash0ts/theorem-survival"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-stone-100 text-stone-800 border border-stone-300 hover:bg-stone-200 transition"
                >
                  GitHub &#8599;
                </a>
                <a
                  href={verifiedTraces.agentLensProjectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 hover:bg-indigo-100 transition"
                >
                  CoreWeave Agent Lens &#8599;
                </a>
                <a
                  href={verifiedTraces.agentLensTagsViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-stone-700 border border-stone-300 hover:bg-stone-100 transition"
                >
                  5-Tag Judge View &#8599;
                </a>
                <a
                  href={EVAL_TABLE_RUN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100 transition"
                >
                  Forge EvalTable &#8599;
                </a>
              </div>
            </div>
          )}

          {/* Primary Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setTab("simulator")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                tab === "simulator"
                  ? "bg-stone-900 text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
            >
              1. Explore {THEOREMS.length} Papers
            </button>
            <button
              type="button"
              onClick={() => setTab("agent-lens")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer inline-flex items-center gap-2 ${
                tab === "agent-lens"
                  ? "bg-indigo-700 text-white"
                  : "bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
              }`}
            >
              <span>2. How AI Audited Them (CoreWeave Agent Lens)</span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.5 rounded-sm ${
                  tab === "agent-lens" ? "bg-indigo-600 text-white" : "bg-indigo-200/70 text-indigo-950"
                }`}
              >
                4/8 &rarr; 8/8
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {tab === "agent-lens" ? (
          <AgentLensPanel
            focusedTheoremId={focusedForAudit}
            activePresetId={activePreset?.id ?? presetId}
          />
        ) : (
          <>
            {/* Plain-English Scenario Picker + 3-Flavour Decoder */}
            <section className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-stone-900">
                    Step 1: Choose a Scenario to Simulate
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    &ldquo;The Riemann Hypothesis&rdquo; is actually a ladder of three nested
                    conjectures — proving the first rung does not automatically prove the higher ones.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomSwitches((v) => !v)}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900 underline self-start md:self-auto cursor-pointer"
                >
                  {showCustomSwitches ? "Hide individual switches" : "Customize individual switches"}
                </button>
              </div>

              {/* 3-Rung Plain-English Key */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-stone-900">1. Basic RH (1859)</span>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      Prime counting &amp; gaps between primes
                    </p>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm ${
                      worldState.rh === "TRUE"
                        ? "bg-emerald-100 text-emerald-900"
                        : worldState.rh === "FALSE"
                          ? "bg-rose-100 text-rose-900"
                          : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {worldState.rh}
                  </span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-stone-900">2. Generalized RH (GRH)</span>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      Fast CS algorithms &amp; crypto proofs <em>(claimed Friday)</em>
                    </p>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm ${
                      worldState.grh === "TRUE"
                        ? "bg-emerald-100 text-emerald-900"
                        : worldState.grh === "FALSE"
                          ? "bg-rose-100 text-rose-900"
                          : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {worldState.grh}
                  </span>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-stone-900">3. Extended RH (ERH)</span>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      Higher number systems &amp; algebra <em>(not claimed yet)</em>
                    </p>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm ${
                      worldState.erh === "TRUE"
                        ? "bg-emerald-100 text-emerald-900"
                        : worldState.erh === "FALSE"
                          ? "bg-rose-100 text-rose-900"
                          : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {worldState.erh}
                  </span>
                </div>
              </div>

              {/* Clean Scenario Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PRESETS.map((p) => {
                  const isActive = activePreset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={`text-left rounded-xl border px-3.5 py-2.5 transition cursor-pointer ${
                        isActive
                          ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                          : "bg-white text-stone-800 border-stone-200 hover:border-stone-400 hover:bg-stone-50"
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between gap-2">
                        <span>{p.label}</span>
                        {p.id === "alpoge_rh_grh" && (
                          <span
                            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                              isActive
                                ? "bg-emerald-500/25 text-emerald-200"
                                : "bg-indigo-50 text-indigo-800"
                            }`}
                          >
                            Nov 20 News
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Plain-English Explanation of Selected Scenario */}
              <div className="rounded-xl bg-stone-100/80 border border-stone-200 px-4 py-2.5 text-xs text-stone-700 leading-relaxed">
                <strong className="text-stone-900">Active scenario: </strong>
                {activePreset
                  ? activePreset.description
                  : `Custom combination: RH = ${worldState.rh}, GRH = ${worldState.grh}, ERH = ${worldState.erh}${worldState.siegelZero ? " (with Siegel zeros)" : ""}.`}
              </div>

              {/* Optional Custom Individual Switches (Tucked cleanly away by default) */}
              {showCustomSwitches && (
                <div className="pt-3 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  {(["rh", "grh", "erh"] as const).map((key) => (
                    <label key={key} className="block">
                      <span className="font-semibold text-stone-700 uppercase block mb-1">
                        {key.toUpperCase()} Truth State
                      </span>
                      <select
                        value={worldState[key]}
                        onChange={(e) =>
                          setWorldState((prev) =>
                            normalizeWorldState(prev, key, e.target.value as TruthState),
                          )
                        }
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-xs"
                      >
                        <option value="OPEN">OPEN (Unverified)</option>
                        <option value="TRUE">TRUE (Proven)</option>
                        <option value="FALSE">FALSE (Disproved)</option>
                      </select>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      checked={worldState.siegelZero}
                      disabled={worldState.grh !== "FALSE"}
                      onChange={(e) =>
                        setWorldState((prev) => ({ ...prev, siegelZero: e.target.checked }))
                      }
                    />
                    <span className="text-stone-700">
                      Include Siegel zeros (requires GRH = FALSE)
                    </span>
                  </label>
                </div>
              )}
            </section>

            {/* 4 Plain-English Outcome Summary Cards (Click to Filter!) */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setOutcomeFilter(outcomeFilter === "PROVEN" ? "ALL" : "PROVEN")}
                className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
                  outcomeFilter === "PROVEN"
                    ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-300"
                    : "bg-white border-stone-200 hover:border-emerald-300"
                }`}
              >
                <div className="text-xs font-bold text-emerald-800">Becomes Proven Fact</div>
                <div className="text-3xl font-bold text-stone-950 font-mono mt-1">
                  {counts.proven}
                </div>
                <p className="text-xs text-stone-600 mt-1 leading-snug">
                  Had no backup proof — now holds outright.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setOutcomeFilter(outcomeFilter === "FASTER" ? "ALL" : "FASTER")}
                className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
                  outcomeFilter === "FASTER"
                    ? "bg-sky-50 border-sky-500 ring-2 ring-sky-300"
                    : "bg-white border-stone-200 hover:border-sky-300"
                }`}
              >
                <div className="text-xs font-bold text-sky-800">Gets Faster / Already Proven</div>
                <div className="text-3xl font-bold text-stone-950 font-mono mt-1">
                  {counts.faster}
                </div>
                <p className="text-xs text-stone-600 mt-1 leading-snug">
                  Sharpens a slower backup bound, or needed no conjecture.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setOutcomeFilter(outcomeFilter === "WAITING" ? "ALL" : "WAITING")}
                className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
                  outcomeFilter === "WAITING"
                    ? "bg-amber-50 border-amber-500 ring-2 ring-amber-300"
                    : "bg-white border-stone-200 hover:border-amber-300"
                }`}
              >
                <div className="text-xs font-bold text-amber-800">Still Unproved</div>
                <div className="text-3xl font-bold text-stone-950 font-mono mt-1">
                  {counts.waiting}
                </div>
                <p className="text-xs text-stone-600 mt-1 leading-snug">
                  Needs a stronger conjecture (like GRH or ERH) still open here.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setOutcomeFilter(outcomeFilter === "DEAD_OR_BROKEN" ? "ALL" : "DEAD_OR_BROKEN")
                }
                className={`text-left rounded-2xl border p-4 transition cursor-pointer ${
                  outcomeFilter === "DEAD_OR_BROKEN"
                    ? "bg-stone-100 border-stone-500 ring-2 ring-stone-300"
                    : "bg-white border-stone-200 hover:border-stone-400"
                }`}
              >
                <div className="text-xs font-bold text-stone-700">
                  Dead &lsquo;What-If&rsquo; / Broken
                </div>
                <div className="text-3xl font-bold text-stone-950 font-mono mt-1">
                  {counts.deadOrBroken}
                </div>
                <p className="text-xs text-stone-600 mt-1 leading-snug">
                  Assumed RH/GRH was false (e.g. Siegel zeros), or premise fails.
                </p>
              </button>
            </section>

            {/* Visual Overview + 3 Plain-English FAQ Jump Cards */}
            <ImpactOverview
              theorems={THEOREMS}
              evaluatedById={evaluatedById}
              selectedTopic={topicFilter}
              onSelectTopic={(t) => setTopicFilter(t)}
              onQuickJump={({ topic, conjecture }) => {
                setShelfFilter("ALL");
                setOutcomeFilter("ALL");
                if (topic) setTopicFilter(topic);
                if (conjecture) setConjectureFilter(conjecture);
                document.getElementById("paper-explorer")?.scrollIntoView({ behavior: "smooth" });
              }}
            />

            {/* Main 160-Paper Explorer */}
            <section
              id="paper-explorer"
              className="bg-white border border-stone-200 rounded-2xl shadow-xs"
            >
              {/* Sticky Filter & Search Header */}
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs rounded-t-2xl p-5 border-b border-stone-200 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-stone-950">
                      Paper-by-Paper Impact ({filteredTheorems.length} of {THEOREMS.length} shown)
                    </h2>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Every paper has a plain-English summary, direct arXiv/DOI link, and live
                      CoreWeave Agent Lens audit trace. Click any paper to inspect its exact quote.
                    </p>
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-stone-100 text-stone-800 hover:bg-stone-200 self-start sm:self-auto cursor-pointer"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>

                {/* Search + Conjecture Select */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                  <div className="md:col-span-7">
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search 160 papers by topic, plain-English summary, author, or arXiv ID (e.g. 'primality', 'isogeny', 'twin primes', 'knot')..."
                      className="w-full rounded-xl border border-stone-300 bg-stone-50/60 px-3.5 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:bg-white focus:border-stone-500"
                    />
                  </div>
                  <div className="md:col-span-5 flex flex-wrap sm:flex-nowrap gap-2">
                    <select
                      aria-label="Filter by assumption"
                      value={conjectureFilter}
                      onChange={(e) => setConjectureFilter(e.target.value as ConjectureFilter)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800"
                    >
                      <option value="ALL">Any Assumption ({THEOREMS.length})</option>
                      <option value="RH">Needs Basic RH</option>
                      <option value="GRH">Needs Generalized RH (GRH)</option>
                      <option value="ERH">Needs Extended RH (ERH)</option>
                      <option value="ASSUMES_FALSE">Assumes RH/GRH Is False (Siegel Zeros)</option>
                      <option value="ALREADY_PROVEN">Already Proven Unconditionally</option>
                    </select>
                  </div>
                </div>

                {/* Quick Shelf + Topic Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setShelfFilter("ALL")}
                    className={`px-3 py-1.5 rounded-full font-semibold transition cursor-pointer ${
                      shelfFilter === "ALL"
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    All Papers ({THEOREMS.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShelfFilter(shelfFilter === "FEATURED" ? "ALL" : "FEATURED")
                    }
                    className={`px-3 py-1.5 rounded-full font-semibold transition cursor-pointer ${
                      shelfFilter === "FEATURED"
                        ? "bg-indigo-700 text-white"
                        : "bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                    }`}
                  >
                    &#9733; Famous &amp; Surprising ({featuredCount})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShelfFilter(
                        shelfFilter === "RECENT_2025_2026" ? "ALL" : "RECENT_2025_2026",
                      )
                    }
                    className={`px-3 py-1.5 rounded-full font-semibold transition cursor-pointer ${
                      shelfFilter === "RECENT_2025_2026"
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    2025–2026 Preprints ({recentCount})
                  </button>

                  <span className="mx-1 text-stone-300">|</span>

                  {(
                    [
                      "Primes & Number Theory",
                      "Algorithms & Complexity",
                      "Algebra, Knots & Quantum",
                      "Cryptography & Security",
                    ] as TopicBucket[]
                  ).map((bucket) => (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => setTopicFilter(topicFilter === bucket ? "ALL" : bucket)}
                      className={`px-2.5 py-1.5 rounded-full font-medium transition cursor-pointer ${
                        topicFilter === bucket
                          ? "bg-stone-800 text-white"
                          : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      }`}
                    >
                      {bucket}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paper List */}
              {visibleTheorems.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-sm font-semibold text-stone-800">
                    No papers match that filter combination.
                  </p>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-xs font-semibold text-indigo-700 underline cursor-pointer"
                  >
                    Reset filters to show all {THEOREMS.length} papers
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-200">
                  {visibleTheorems.map((t) => {
                    const ev = evaluatedById[t.id];
                    const isExpanded = expandedId === t.id;
                    const assumption = assumptionBadgeText(t.conjectureType, t.polarity);

                    return (
                      <div key={t.id} className="transition hover:bg-stone-50/60">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setExpandedId(isExpanded ? null : t.id);
                            }
                          }}
                          className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-start justify-between gap-3 cursor-pointer"
                        >
                          {/* Left + Center: Plain-English Summary First, Then Paper Metadata */}
                          <div className="space-y-1.5 max-w-4xl">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full border ${outcomeBadgeStyle(ev.tone)}`}
                              >
                                {ev.badgeLabel}
                              </span>
                              <span
                                className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${assumption.style}`}
                              >
                                {assumption.label}
                              </span>
                              <span className="text-[11px] font-medium text-stone-500">
                                {t.topicBucket ?? "Primes & Number Theory"}
                              </span>
                              {t.isFeatured && (
                                <span className="text-[11px] font-semibold text-indigo-700">
                                  &#9733; Landmark
                                </span>
                              )}
                            </div>

                            {/* Plain-English 1-liner: the main thing humans read! */}
                            <p className="text-sm sm:text-[15px] font-semibold text-stone-950 leading-snug">
                              {t.plainSummary ?? t.title}
                            </p>

                            {/* Formal Paper Title + Authors + Year */}
                            <p className="text-xs text-stone-500 leading-relaxed">
                              <span className="font-medium text-stone-700">{t.title}</span> &middot;{" "}
                              {t.authors} ({t.yearLabel})
                            </p>
                          </div>

                          {/* Right: Direct Paper + Agent Lens Links + Expand Toggle */}
                          <div
                            className="flex flex-wrap items-center gap-1.5 shrink-0 lg:pt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-mono font-medium px-2.5 py-1 rounded-md bg-stone-100 text-stone-800 border border-stone-200 hover:bg-stone-200 transition"
                              title={`Open ${t.arxivOrDoi}`}
                            >
                              {t.arxivId ? `arXiv:${t.arxivId}` : "DOI"} &#8599;
                            </a>
                            {t.agentLensUrl && (
                              <a
                                href={t.agentLensUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-50/80 text-indigo-800 border border-indigo-200/80 hover:bg-indigo-100 transition"
                                title="Open audit trace in CoreWeave Agent Lens"
                              >
                                Agent Lens &#8599;
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : t.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition cursor-pointer"
                            >
                              {isExpanded ? "Close ▴" : "Details ▾"}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <PaperRowDetail
                            theorem={t}
                            evaluated={ev}
                            allTheoremsById={theoremsById}
                            onSelectPaper={(id) => setExpandedId(id)}
                            onOpenInAgentLensTab={(id) => {
                              setFocusedForAudit(id);
                              setTab("agent-lens");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
