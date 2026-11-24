import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildExcludeSetFromLandmarks,
  EMBED_SEED_THEOREMS,
  evaluateTheorem,
  LANDMARK_THEOREMS,
  outcomeStyle,
  PLAIN_SCOPE_LABELS,
  plainScopeGroup,
  PRESETS,
  resolvePresetId,
  type OutcomeKind,
  type PlainScopeGroup,
  type TheoremRecord,
  type TopicBucket,
  type TruthState,
  type WorldState,
} from "../data/theorems";
import { adaptPoolItems, type PoolCorpusItem } from "../data/corpus-adapter";
import poolStats from "../data/pool-stats.json";
import { ImpactOverview } from "./ImpactOverview";
import { PaperRowDetail } from "./PaperRowDetail";
import { AgentLensPanel } from "./AgentLensPanel";

type ActiveTab = "explorer" | "agent-lens";
type ScopeGroupFilter = "ALL" | PlainScopeGroup | "ASSUMES_FALSE";
type SortMode = "citations" | "year_desc" | "landmarks_first";

const PUBLIC_APP_URL = "https://ash0ts.github.io/theorem-survival/";
const PAGE_STEP = 80;

const TOPIC_OPTIONS: Array<"ALL" | TopicBucket> = [
  "ALL",
  "Primes & Number Theory",
  "Algorithms & Complexity",
  "Algebra, Knots & Quantum",
  "Cryptography & Security",
];

const SCOPE_GROUP_PILLS: Array<{ id: ScopeGroupFilter; label: string }> = [
  { id: "ALL", label: "All groups" },
  { id: "COVERED", label: PLAIN_SCOPE_LABELS.COVERED },
  { id: "BEYOND", label: PLAIN_SCOPE_LABELS.BEYOND },
  { id: "UNCLEAR", label: PLAIN_SCOPE_LABELS.UNCLEAR },
  { id: "MENTION_ONLY", label: PLAIN_SCOPE_LABELS.MENTION_ONLY },
  { id: "ALREADY_PROVEN", label: PLAIN_SCOPE_LABELS.ALREADY_PROVEN },
];

function parseInitialUrl(): {
  presetId: string;
  selectedId: string | null;
  tab: ActiveTab;
  isEmbed: boolean;
} {
  if (typeof window === "undefined") {
    return { presetId: "checked_nov24", selectedId: null, tab: "explorer", isEmbed: false };
  }
  const params = new URLSearchParams(window.location.search);
  const resolvedPreset = resolvePresetId(params.get("preset") ?? "checked_nov24");
  const preset = PRESETS.find((p) => p.id === resolvedPreset) ? resolvedPreset : "checked_nov24";
  const thm = params.get("thm");
  const tab: ActiveTab = params.get("tab") === "agent-lens" ? "agent-lens" : "explorer";
  const isEmbed =
    params.get("embed") === "1" ||
    Boolean((window as unknown as { __THEOREM_SURVIVAL_EMBED__?: boolean }).__THEOREM_SURVIVAL_EMBED__);
  return {
    presetId: preset,
    selectedId: thm || null,
    tab,
    isEmbed,
  };
}

function scopeBadgeStyle(group: PlainScopeGroup): string {
  switch (group) {
    case "COVERED":
      return "bg-emerald-50 text-emerald-900 border-emerald-200";
    case "BEYOND":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "UNCLEAR":
      return "bg-orange-50 text-orange-900 border-orange-200";
    case "ALREADY_PROVEN":
      return "bg-sky-50 text-sky-900 border-sky-200";
    case "MENTION_ONLY":
      return "bg-stone-100 text-stone-700 border-stone-200";
  }
}

export function App() {
  const initial = useMemo(() => parseInitialUrl(), []);
  const isEmbed = initial.isEmbed;

  const [allTheorems, setAllTheorems] = useState<TheoremRecord[]>(EMBED_SEED_THEOREMS);
  const [poolLoaded, setPoolLoaded] = useState<boolean>(isEmbed);
  const [poolLoading, setPoolLoading] = useState<boolean>(!isEmbed);

  const [activeTab, setActiveTab] = useState<ActiveTab>(initial.tab);
  const [activePresetId, setActivePresetId] = useState<string>(initial.presetId);
  const [world, setWorld] = useState<WorldState>(
    () => PRESETS.find((p) => p.id === initial.presetId)?.state ?? PRESETS[0].state,
  );

  const [expandedId, setExpandedId] = useState<string | null>(
    initial.selectedId ?? (initial.isEmbed ? null : "P02"),
  );
  const [agentLensTargetId, setAgentLensTargetId] = useState<string>("P12");
  const [topicFilter, setTopicFilter] = useState<"ALL" | TopicBucket>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | OutcomeKind>("ALL");
  const [scopeGroupFilter, setScopeGroupFilter] = useState<ScopeGroupFilter>("ALL");
  const [top100Only, setTop100Only] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<SortMode>("citations");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showCustomSwitches, setShowCustomSwitches] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(PAGE_STEP);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Lazy-fetch full 3,800-paper pool on full-screen view so initial bundle stays tiny and instant
  useEffect(() => {
    if (isEmbed) return;
    let cancelled = false;
    setPoolLoading(true);
    const baseUrl =
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
    const poolUrl = `${baseUrl}pool-classified.json`;
    fetch(poolUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((items: PoolCorpusItem[]) => {
        if (cancelled || !Array.isArray(items) || items.length === 0) return;
        const exclude = buildExcludeSetFromLandmarks(LANDMARK_THEOREMS);
        const adapted = adaptPoolItems(items, exclude, "S", 1);
        setAllTheorems([...LANDMARK_THEOREMS, ...adapted]);
        setPoolLoaded(true);
        setPoolLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setPoolLoaded(true);
          setPoolLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isEmbed]);

  useEffect(() => {
    if (typeof window === "undefined" || isEmbed) return;
    const url = new URL(window.location.href);
    if (activePresetId !== "custom") {
      url.searchParams.set("preset", activePresetId);
    } else {
      url.searchParams.delete("preset");
    }
    if (expandedId) url.searchParams.set("thm", expandedId);
    else url.searchParams.delete("thm");

    if (activeTab === "agent-lens") url.searchParams.set("tab", "agent-lens");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  }, [activePresetId, expandedId, activeTab, isEmbed]);

  // Reset visible window whenever filters or sort change
  useEffect(() => {
    setVisibleLimit(PAGE_STEP);
  }, [topicFilter, outcomeFilter, scopeGroupFilter, top100Only, sortMode, searchQuery]);

  function applyPreset(presetId: string) {
    const found = PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(found.id);
    setWorld({ ...found.state });
  }

  function updateConjecture(key: "rh" | "grhDirichlet" | "beyondDirichlet", val: TruthState) {
    setActivePresetId("custom");
    setWorld((prev) => ({ ...prev, [key]: val }));
  }

  const allTheoremsById = useMemo(() => {
    const m: Record<string, TheoremRecord> = {};
    for (const t of allTheorems) m[t.id] = t;
    return m;
  }, [allTheorems]);

  const evaluatedById = useMemo(() => {
    const map: Record<string, ReturnType<typeof evaluateTheorem>> = {};
    for (const t of allTheorems) {
      map[t.id] = evaluateTheorem(t, world);
    }
    return map;
  }, [allTheorems, world]);

  const counts = useMemo(() => {
    const c: Record<OutcomeKind, number> = {
      UPGRADED_UNCONDITIONAL: 0,
      BOUND_TIGHTENED: 0,
      STILL_CONDITIONAL: 0,
      VACUOUS_OR_SUPERSEDED: 0,
      HYPOTHESIS_FALSIFIED: 0,
      MENTION_ONLY_UNCHANGED: 0,
    };
    for (const t of allTheorems) {
      c[evaluatedById[t.id].outcome] += 1;
    }
    return c;
  }, [allTheorems, evaluatedById]);

  const filteredTheorems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allTheorems.filter((t) => {
      if (topicFilter !== "ALL" && t.topicBucket !== topicFilter) return false;
      if (outcomeFilter !== "ALL" && evaluatedById[t.id].outcome !== outcomeFilter) return false;
      if (top100Only && t.importanceTier !== "TOP_100" && !t.isNamedLandmark) return false;
      if (scopeGroupFilter === "ASSUMES_FALSE" && t.polarity !== "ASSUMES_FALSE") return false;
      if (
        scopeGroupFilter !== "ALL" &&
        scopeGroupFilter !== "ASSUMES_FALSE" &&
        plainScopeGroup(t) !== scopeGroupFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.shortNodeTitle.toLowerCase().includes(q) ||
        (t.plainSummary ?? "").toLowerCase().includes(q) ||
        t.authors.toLowerCase().includes(q) ||
        t.arxivOrDoi.toLowerCase().includes(q) ||
        t.extractedQuote.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      const ya = a.yearNumeric ?? (Number.parseInt(a.yearLabel, 10) || 0);
      const yb = b.yearNumeric ?? (Number.parseInt(b.yearLabel, 10) || 0);
      if (sortMode === "citations") {
        const cb = b.citedByCount ?? 0;
        const ca = a.citedByCount ?? 0;
        if (cb !== ca) return cb - ca;
        if (Boolean(b.isNamedLandmark) !== Boolean(a.isNamedLandmark)) {
          return b.isNamedLandmark ? 1 : -1;
        }
        return yb - ya;
      }
      if (sortMode === "year_desc") {
        if (yb !== ya) return yb - ya;
        return (b.citedByCount ?? 0) - (a.citedByCount ?? 0);
      }
      // landmarks_first
      if (Boolean(b.isNamedLandmark) !== Boolean(a.isNamedLandmark)) {
        return b.isNamedLandmark ? 1 : -1;
      }
      return (b.citedByCount ?? 0) - (a.citedByCount ?? 0);
    });
    return list;
  }, [
    allTheorems,
    topicFilter,
    outcomeFilter,
    scopeGroupFilter,
    top100Only,
    sortMode,
    searchQuery,
    evaluatedById,
  ]);

  // Windowed scroll observer
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || visibleLimit >= filteredTheorems.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleLimit((prev) => Math.min(filteredTheorems.length, prev + 100));
        }
      },
      { rootMargin: "320px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visibleLimit, filteredTheorems.length]);

  const visibleTheorems = useMemo(
    () => filteredTheorems.slice(0, visibleLimit),
    [filteredTheorems, visibleLimit],
  );

  function jumpToPaper(id: string) {
    setActiveTab("explorer");
    setTopicFilter("ALL");
    setOutcomeFilter("ALL");
    setScopeGroupFilter("ALL");
    setTop100Only(false);
    setSearchQuery("");
    setExpandedId(id);
    const idx = allTheorems.findIndex((t) => t.id === id);
    if (idx >= 0) setVisibleLimit(Math.max(PAGE_STEP, idx + 40));
    setTimeout(() => {
      document.getElementById(`paper-row-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 60);
  }

  const activePreset = PRESETS.find((p) => p.id === activePresetId);
  const fullPoolTotal = poolStats.explorerTotalCount || 3805;

  return (
    <div className={`bg-[#f7f6f2] text-stone-900 font-sans ${isEmbed ? "min-h-0" : "min-h-screen"}`}>
      {/* Header */}
      {isEmbed ? (
        <header className="border-b border-stone-200 bg-white/95 backdrop-blur-xs sticky top-0 z-20">
          <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
              <span className="text-sm font-bold tracking-tight text-stone-950">
                Theorem Survival Explorer
              </span>
              <span className="text-xs text-stone-500 hidden sm:inline">
                &middot; Top 100 Most-Cited + Landmarks (from{" "}
                {fullPoolTotal.toLocaleString()} audited works)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("explorer")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                    activeTab === "explorer"
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Top 100 Explorer
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("agent-lens")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                    activeTab === "agent-lens"
                      ? "bg-white text-indigo-900 shadow-2xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Benchmark &amp; Traces
                </button>
              </div>
              <a
                href={PUBLIC_APP_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-stone-900 text-white hover:bg-stone-700 transition"
              >
                All {fullPoolTotal.toLocaleString()} Papers &#8599;
              </a>
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-stone-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Checked Lean 4 Scope &middot; {allTheorems.length.toLocaleString()} Audited Works
                  {poolLoading ? " (loading full pool...)" : ""}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-950">
                Which Papers Actually Changed When the Riemann Hypothesis Was Checked?
              </h1>
              <p className="text-sm text-stone-600 mt-0.5 max-w-2xl">
                The certified Lean 4 proof covers classical RH and Dirichlet GRH —{" "}
                <strong>not</strong> number-field GRH (Dedekind, Hecke, Artin). Ranked by citations
                with located quotes from full text where open.
              </p>
            </div>

            <div className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1 self-start">
              <button
                type="button"
                onClick={() => setActiveTab("explorer")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  activeTab === "explorer"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Explore {allTheorems.length.toLocaleString()} Papers
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("agent-lens")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  activeTab === "agent-lens"
                    ? "bg-white text-indigo-900 shadow-xs"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Benchmark &amp; Agent Lens
              </button>
            </div>
          </div>
        </header>
      )}

      <main
        className={
          isEmbed
            ? "px-4 py-4 space-y-4"
            : "max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6"
        }
      >
        {activeTab === "agent-lens" ? (
          <AgentLensPanel
            initialPaperId={agentLensTargetId}
            onJumpToPaperInExplorer={jumpToPaper}
          />
        ) : (
          <>
            {/* Scenario Bar */}
            <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-500 mr-1">
                    Scenario:
                  </span>
                  {PRESETS.map((p) => {
                    const active = activePresetId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                          active
                            ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                            : "bg-stone-50 text-stone-700 border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setShowCustomSwitches((v) => !v)}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900 underline cursor-pointer"
                >
                  {showCustomSwitches ? "Hide individual switches" : "Customize switches"}
                </button>
              </div>

              {activePreset ? (
                <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200/80 rounded-lg px-3 py-2">
                  <strong>{activePreset.label}:</strong> {activePreset.description}
                </p>
              ) : (
                <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200/80 rounded-lg px-3 py-2">
                  <strong>Custom scenario:</strong> Toggling individual mathematical switches below.
                </p>
              )}

              {showCustomSwitches && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <SwitchPill
                    title="Riemann Hypothesis (RH)"
                    subtitle="Zeros of classical zeta(s) — machine-checked"
                    value={world.rh}
                    onChange={(v) => updateConjecture("rh", v)}
                  />
                  <SwitchPill
                    title="Dirichlet GRH"
                    subtitle="Dirichlet L(s, chi) — machine-checked"
                    value={world.grhDirichlet}
                    onChange={(v) => updateConjecture("grhDirichlet", v)}
                  />
                  <SwitchPill
                    title="Number-Field / Automorphic GRH"
                    subtitle="Dedekind, Hecke, Artin — NOT checked"
                    value={world.beyondDirichlet}
                    onChange={(v) => updateConjecture("beyondDirichlet", v)}
                  />
                </div>
              )}

              {/* 5-Bucket Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                <SummaryScoreCard
                  label="Becomes Proven"
                  sub="Assumption drops cleanly"
                  count={counts.UPGRADED_UNCONDITIONAL}
                  active={outcomeFilter === "UPGRADED_UNCONDITIONAL"}
                  colorClass="border-emerald-200 bg-emerald-50/60 text-emerald-950"
                  onClick={() =>
                    setOutcomeFilter((f) =>
                      f === "UPGRADED_UNCONDITIONAL" ? "ALL" : "UPGRADED_UNCONDITIONAL",
                    )
                  }
                />
                <SummaryScoreCard
                  label="Faster / Known"
                  sub="Sharper bound or unconditional"
                  count={counts.BOUND_TIGHTENED}
                  active={outcomeFilter === "BOUND_TIGHTENED"}
                  colorClass="border-sky-200 bg-sky-50/60 text-sky-950"
                  onClick={() =>
                    setOutcomeFilter((f) =>
                      f === "BOUND_TIGHTENED" ? "ALL" : "BOUND_TIGHTENED",
                    )
                  }
                />
                <SummaryScoreCard
                  label="Still Open"
                  sub="Needs number-field or unclear GRH"
                  count={counts.STILL_CONDITIONAL}
                  active={outcomeFilter === "STILL_CONDITIONAL"}
                  colorClass="border-amber-200 bg-amber-50/60 text-amber-950"
                  onClick={() =>
                    setOutcomeFilter((f) =>
                      f === "STILL_CONDITIONAL" ? "ALL" : "STILL_CONDITIONAL",
                    )
                  }
                />
                <SummaryScoreCard
                  label="Retired 'If-False'"
                  sub="Siegel-zero or disproven branch"
                  count={counts.VACUOUS_OR_SUPERSEDED + counts.HYPOTHESIS_FALSIFIED}
                  active={outcomeFilter === "VACUOUS_OR_SUPERSEDED"}
                  colorClass="border-rose-200 bg-rose-50/60 text-rose-950"
                  onClick={() =>
                    setOutcomeFilter((f) =>
                      f === "VACUOUS_OR_SUPERSEDED" ? "ALL" : "VACUOUS_OR_SUPERSEDED",
                    )
                  }
                />
                <SummaryScoreCard
                  label="Only Mentions It"
                  sub="Excluded from changed counts"
                  count={counts.MENTION_ONLY_UNCHANGED}
                  active={outcomeFilter === "MENTION_ONLY_UNCHANGED"}
                  colorClass="border-stone-200 bg-stone-100/80 text-stone-800"
                  onClick={() =>
                    setOutcomeFilter((f) =>
                      f === "MENTION_ONLY_UNCHANGED" ? "ALL" : "MENTION_ONLY_UNCHANGED",
                    )
                  }
                />
              </div>
            </section>

            {/* Topic Breakdown & 3 Catches (full mode) */}
            {!isEmbed && (
              <ImpactOverview
                theorems={allTheorems}
                evaluatedById={evaluatedById}
                selectedTopic={topicFilter}
                onSelectTopic={setTopicFilter}
                onQuickJump={({ topic, scopeGroup }) => {
                  if (topic) setTopicFilter(topic);
                  if (scopeGroup) setScopeGroupFilter(scopeGroup);
                  document
                    .getElementById("paper-directory")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            )}

            {/* Paper Directory */}
            <section
              id="paper-directory"
              className="bg-white border border-stone-200 rounded-2xl shadow-xs overflow-hidden"
            >
              {/* Filter + Sort Toolbar */}
              <div className="p-4 sm:p-5 border-b border-stone-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-stone-900">
                      Paper-by-Paper Verdict ({filteredTheorems.length.toLocaleString()} of{" "}
                      {allTheorems.length.toLocaleString()})
                    </h2>
                    <p className="text-xs text-stone-500">
                      {isEmbed
                        ? `Showing the Top 100 most-cited + landmark works here; open full screen to search all ${fullPoolTotal.toLocaleString()} works.`
                        : "Sorted by citation impact by default. Click any row for full statement diff and links."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Sort papers"
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value as SortMode)}
                      className="text-xs font-medium px-2.5 py-2 rounded-lg border border-stone-300 bg-stone-50 text-stone-800"
                    >
                      <option value="citations">Sort: Most Cited</option>
                      <option value="landmarks_first">Sort: Landmarks First</option>
                      <option value="year_desc">Sort: Newest Year</option>
                    </select>

                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, author, arXiv ID, quote..."
                      className="w-full sm:w-64 text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-none focus:border-stone-600"
                    />
                  </div>
                </div>

                {/* Plain-Word Scope Group Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTop100Only((v) => !v)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition cursor-pointer ${
                      top100Only
                        ? "bg-indigo-700 text-white border-indigo-700"
                        : "bg-indigo-50/70 text-indigo-900 border-indigo-200 hover:border-indigo-400"
                    }`}
                  >
                    Most Cited (Top 100)
                  </button>

                  {SCOPE_GROUP_PILLS.map((pill) => {
                    const active = scopeGroupFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setScopeGroupFilter(pill.id)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full border transition cursor-pointer ${
                          active
                            ? "bg-stone-900 text-white border-stone-900"
                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>

                {/* Field Pills + Reset */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {TOPIC_OPTIONS.map((t) => {
                    const active = topicFilter === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTopicFilter(t)}
                        className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition cursor-pointer ${
                          active
                            ? "bg-stone-800 text-white border-stone-800"
                            : "bg-stone-50 text-stone-600 border-stone-200 hover:border-stone-400"
                        }`}
                      >
                        {t === "ALL" ? "All Fields" : t}
                      </button>
                    );
                  })}

                  {(topicFilter !== "ALL" ||
                    outcomeFilter !== "ALL" ||
                    scopeGroupFilter !== "ALL" ||
                    top100Only ||
                    searchQuery.trim() !== "") && (
                    <button
                      type="button"
                      onClick={() => {
                        setTopicFilter("ALL");
                        setOutcomeFilter("ALL");
                        setScopeGroupFilter("ALL");
                        setTop100Only(false);
                        setSearchQuery("");
                      }}
                      className="ml-auto text-xs font-semibold text-indigo-700 hover:underline cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {/* Rows (Windowed for 3,800+ papers) */}
              <div
                className={
                  isEmbed
                    ? "divide-y divide-stone-200 max-h-[500px] overflow-y-auto"
                    : "divide-y divide-stone-200"
                }
              >
                {filteredTheorems.length === 0 && (
                  <div className="p-8 text-center text-sm text-stone-500">
                    No papers match those filters. Try clearing one of the filter pills above.
                  </div>
                )}

                {visibleTheorems.map((t) => {
                  const ev = evaluatedById[t.id];
                  const style = outcomeStyle(ev.outcome);
                  const isOpen = expandedId === t.id;
                  const group = plainScopeGroup(t);
                  const isFulltext =
                    t.evidenceTier === "fulltext" || t.evidenceTier === "curated_primary";

                  return (
                    <div key={t.id} id={`paper-row-${t.id}`} className="transition">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : t.id)}
                        className={`w-full text-left px-4 sm:px-5 py-3.5 hover:bg-stone-50/90 transition flex flex-col md:flex-row md:items-center justify-between gap-2.5 cursor-pointer ${
                          isOpen ? "bg-stone-50" : "bg-white"
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${style.badge}`}
                            >
                              {style.shortLabel}
                            </span>
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${scopeBadgeStyle(group)}`}
                            >
                              {PLAIN_SCOPE_LABELS[group]}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isFulltext
                                  ? "bg-emerald-50/70 text-emerald-900 border-emerald-200"
                                  : "bg-stone-100 text-stone-600 border-stone-200"
                              }`}
                            >
                              {t.evidenceTier === "curated_primary"
                                ? "Primary source"
                                : isFulltext
                                  ? "Full text"
                                  : "Abstract only"}
                            </span>
                            {t.machineCheckedLean?.verified && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-700 text-white">
                                Machine-checked in Lean 4
                              </span>
                            )}
                            {typeof t.citedByCount === "number" && t.citedByCount > 0 && (
                              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                                {t.citedByCount.toLocaleString()} cites
                              </span>
                            )}
                            {t.polarity === "ASSUMES_FALSE" && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm bg-rose-100 text-rose-900">
                                Assumes False
                              </span>
                            )}
                          </div>

                          <div className="text-sm font-semibold text-stone-900 leading-snug">
                            {t.plainSummary ?? t.title}
                          </div>

                          <div className="text-xs text-stone-500 truncate">
                            <span className="font-medium text-stone-700">{t.title}</span> &middot;{" "}
                            {t.authors} ({t.yearLabel}) &middot;{" "}
                            <span className="font-mono">{t.arxivOrDoi}</span>
                          </div>

                          {t.extractedQuote && (
                            <div className="text-[11px] text-stone-600 italic line-clamp-1 pt-0.5">
                              &ldquo;{t.extractedQuote}&rdquo;
                              {t.quoteLocator ? (
                                <span className="not-italic font-mono text-[10px] text-stone-400 ml-1.5">
                                  [{t.quoteLocator}]
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                          <span className="text-xs font-medium text-stone-500">
                            {isOpen ? "Hide details" : "Evidence & diff"}
                          </span>
                          <span
                            className={`text-stone-400 transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          >
                            &#9662;
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <PaperRowDetail
                          theorem={t}
                          evaluated={ev}
                          allTheoremsById={allTheoremsById}
                          onSelectPaper={jumpToPaper}
                          onOpenInAgentLensTab={(pid) => {
                            setAgentLensTargetId(pid);
                            setActiveTab("agent-lens");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Windowed Load-More Footer */}
              {visibleLimit < filteredTheorems.length && (
                <div
                  ref={loadMoreRef}
                  className="px-4 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600"
                >
                  <span>
                    Showing {visibleTheorems.length.toLocaleString()} of{" "}
                    {filteredTheorems.length.toLocaleString()} matching works
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleLimit((prev) => Math.min(filteredTheorems.length, prev + 200))
                    }
                    className="font-semibold text-indigo-700 hover:underline cursor-pointer"
                  >
                    Show 200 more &darr;
                  </button>
                </div>
              )}

              {isEmbed && (
                <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600">
                  <span>
                    Compact view: Top 100 most-cited + 17 landmarks out of{" "}
                    <strong>{fullPoolTotal.toLocaleString()}</strong> audited works.
                  </span>
                  <a
                    href={PUBLIC_APP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    Browse all {fullPoolTotal.toLocaleString()} papers &#8599;
                  </a>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {!isEmbed && (
        <footer className="border-t border-stone-200 bg-white mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
            <div>
              Pool harvested from arXiv abstracts, OpenAlex full-text assumption search, anchor
              citations, and curated classics ({poolLoaded ? allTheorems.length.toLocaleString() : "..."}{" "}
              works). Citation counts come from OpenAlex and run conservative in pure math.
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://math.mit.edu/~drew/grh/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-stone-700 hover:underline"
              >
                Sutherland Lean Verification &#8599;
              </a>
              <a
                href="https://forge.coreweave.com/agent-lens/wandb/theorem-survival"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-indigo-700 hover:underline"
              >
                CoreWeave Agent Lens &#8599;
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

function SummaryScoreCard({
  label,
  sub,
  count,
  active,
  colorClass,
  onClick,
}: {
  label: string;
  sub: string;
  count: number;
  active: boolean;
  colorClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition cursor-pointer ${colorClass} ${
        active ? "ring-2 ring-stone-900 shadow-xs" : "hover:brightness-97"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold font-mono">{count.toLocaleString()}</span>
        {active && <span className="text-[10px] font-bold uppercase">Filtered</span>}
      </div>
      <div className="text-xs font-bold mt-0.5">{label}</div>
      <div className="text-[11px] opacity-80">{sub}</div>
    </button>
  );
}

function SwitchPill({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle: string;
  value: TruthState;
  onChange: (v: TruthState) => void;
}) {
  const opts: TruthState[] = ["TRUE", "OPEN", "FALSE"];
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 flex items-center justify-between gap-2">
      <div>
        <div className="text-xs font-bold text-stone-900">{title}</div>
        <div className="text-[11px] text-stone-500">{subtitle}</div>
      </div>
      <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 shrink-0">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`px-2 py-1 text-[11px] font-mono font-semibold rounded-md transition cursor-pointer ${
              value === o
                ? o === "TRUE"
                  ? "bg-emerald-600 text-white"
                  : o === "FALSE"
                    ? "bg-rose-600 text-white"
                    : "bg-stone-800 text-white"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
