import { useEffect, useMemo, useState } from "react";
import {
  evaluateTheorem,
  normalizeWorldState,
  PRESETS,
  THEOREMS,
  type ArxivCategory,
  type PresetId,
  type TruthState,
  type WorldState,
} from "../data/theorems";
import verifiedTraces from "../data/verified-traces.json";
import { AgentLensPanel } from "./AgentLensPanel";
import { CitationDag } from "./CitationDag";
import { TheoremInspector } from "./TheoremInspector";

type ViewTab = "simulator" | "agent-lens";

function parseInitialUrl() {
  const params = new URLSearchParams(window.location.search);
  const tab: ViewTab = params.get("tab") === "agent-lens" ? "agent-lens" : "simulator";
  const presetParam = params.get("preset") as PresetId | null;
  const matchedPreset = PRESETS.find((p) => p.id === presetParam) ?? PRESETS[2];
  const thmParam = params.get("thm");
  const matchedThm = THEOREMS.find((t) => t.id === thmParam)?.id ?? "P04";

  const ws: WorldState = { ...matchedPreset.state };
  const rhParam = params.get("rh") as TruthState | null;
  const grhParam = params.get("grh") as TruthState | null;
  const erhParam = params.get("erh") as TruthState | null;
  if (rhParam === "OPEN" || rhParam === "TRUE" || rhParam === "FALSE") ws.rh = rhParam;
  if (grhParam === "OPEN" || grhParam === "TRUE" || grhParam === "FALSE") ws.grh = grhParam;
  if (erhParam === "OPEN" || erhParam === "TRUE" || erhParam === "FALSE") ws.erh = erhParam;
  if (params.get("siegel") === "1") ws.siegelZero = true;

  return { tab, presetId: matchedPreset.id, worldState: ws, selectedId: matchedThm };
}

export function App() {
  const initial = useMemo(() => parseInitialUrl(), []);
  const [tab, setTab] = useState<ViewTab>(initial.tab);
  const [presetId, setPresetId] = useState<PresetId>(initial.presetId);
  const [worldState, setWorldState] = useState<WorldState>(initial.worldState);
  const [selectedId, setSelectedId] = useState<string>(initial.selectedId);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | ArxivCategory>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<
    "ALL" | "UNLOCKED" | "CONDITIONAL" | "DEAD_OR_FALSE"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedState, setCopiedState] = useState<"none" | "link" | "card">("none");

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

  // Sync investigation state into URL so links are directly shareable
  useEffect(() => {
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
    params.set("thm", selectedId);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", nextUrl);
  }, [tab, activePreset, worldState, selectedId]);

  // Support browser back/forward navigation
  useEffect(() => {
    function onPopState() {
      const next = parseInitialUrl();
      setTab(next.tab);
      setPresetId(next.presetId);
      setWorldState(next.worldState);
      setSelectedId(next.selectedId);
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
    let upgraded = 0;
    let tightened = 0;
    let conditional = 0;
    let vacuous = 0;
    let falsified = 0;
    for (const t of THEOREMS) {
      const o = evaluatedById[t.id].outcome;
      if (o === "UPGRADED_UNCONDITIONAL") upgraded++;
      else if (o === "BOUND_TIGHTENED") tightened++;
      else if (o === "STILL_CONDITIONAL") conditional++;
      else if (o === "VACUOUS_OR_SUPERSEDED") vacuous++;
      else if (o === "HYPOTHESIS_FALSIFIED") falsified++;
    }
    return { upgraded, tightened, conditional, vacuous, falsified };
  }, [evaluatedById]);

  const filteredTheorems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return THEOREMS.filter((t) => {
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      const o = evaluatedById[t.id].outcome;
      if (
        outcomeFilter === "UNLOCKED" &&
        o !== "UPGRADED_UNCONDITIONAL" &&
        o !== "BOUND_TIGHTENED"
      ) {
        return false;
      }
      if (outcomeFilter === "CONDITIONAL" && o !== "STILL_CONDITIONAL") return false;
      if (
        outcomeFilter === "DEAD_OR_FALSE" &&
        o !== "VACUOUS_OR_SUPERSEDED" &&
        o !== "HYPOTHESIS_FALSIFIED" &&
        t.polarity !== "ASSUMES_FALSE"
      ) {
        return false;
      }
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.authors.toLowerCase().includes(q) ||
        t.arxivOrDoi.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.theoremLabel.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, outcomeFilter, searchQuery, evaluatedById]);

  const selectedTheorem = THEOREMS.find((t) => t.id === selectedId) ?? THEOREMS[3];
  const selectedEval = evaluatedById[selectedTheorem.id];
  const matchedTrace = verifiedTraces.cases.find(
    (c) => c.theoremId === selectedTheorem.id,
  );

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopiedState("link");
    setTimeout(() => setCopiedState("none"), 2000);
  }

  async function copySummaryCard() {
    const stateName = activePreset
      ? activePreset.label
      : `RH=${worldState.rh}, GRH=${worldState.grh}, ERH=${worldState.erh}`;
    const snippet = [
      `TheoremSurvival [${stateName}]`,
      `Corpus scoreboard (n=16): ${counts.upgraded} new unconditional theorems · ${counts.tightened} bounds tightened · ${counts.conditional} still conditional · ${counts.vacuous} vacuous branches`,
      `Selected (${selectedTheorem.id} · ${selectedTheorem.arxivOrDoi}): ${selectedTheorem.authors} (${selectedTheorem.yearLabel}) — ${selectedEval.badgeLabel}`,
      `${selectedEval.headline}`,
      window.location.href,
    ].join("\n");
    await navigator.clipboard.writeText(snippet);
    setCopiedState("card");
    setTimeout(() => setCopiedState("none"), 2000);
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-stone-600">
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-950">
                  Nov 20, 2026 · Lean Comparator Live Watch
                </span>
                <span>math.NT · cs.CC · cs.CR</span>
              </div>
              <h1 className="mt-1.5 text-xl font-bold tracking-tight text-stone-950 sm:text-2xl">
                TheoremSurvival
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-stone-600">
                Riemann Hypothesis world-state simulator, citation dependency DAG, and{" "}
                <a
                  href={verifiedTraces.agentLensProjectUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-stone-900 underline decoration-stone-400 hover:decoration-stone-900"
                >
                  CoreWeave Forge Agent Lens
                </a>{" "}
                theorem auditor.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyShareLink}
                className="rounded border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100 cursor-pointer"
              >
                {copiedState === "link" ? "Copied Share URL" : "Copy Share Link"}
              </button>
              <button
                type="button"
                onClick={copySummaryCard}
                className="rounded border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100 cursor-pointer"
              >
                {copiedState === "card" ? "Copied Summary" : "Copy Text Card"}
              </button>
              <a
                href="https://github.com/ash0ts/theorem-survival"
                target="_blank"
                rel="noreferrer"
                className="rounded border border-stone-900 bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-50 hover:bg-stone-800"
              >
                GitHub Repo ↗
              </a>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
            <nav className="flex gap-1.5" aria-label="Primary views">
              <button
                type="button"
                onClick={() => setTab("simulator")}
                className={`rounded px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  tab === "simulator"
                    ? "bg-stone-900 text-stone-50"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                1. World-State Simulator &amp; DAG (16)
              </button>
              <button
                type="button"
                onClick={() => setTab("agent-lens")}
                className={`rounded px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  tab === "agent-lens"
                    ? "bg-stone-900 text-stone-50"
                    : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                }`}
              >
                2. CoreWeave Forge Agent Lens (8 Paired Audits)
              </button>
            </nav>

            <span className="text-xs font-mono text-stone-500">
              Archive hash + Mathlib statement compiled 15:07 UTC · Proof-term replay pending
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {tab === "agent-lens" ? (
          <AgentLensPanel
            focusedTheoremId={selectedTheorem.id}
            activePresetId={activePreset?.id ?? presetId}
          />
        ) : (
          <div className="space-y-6">
            {/* World-state controls */}
            <section className="rounded-lg border border-stone-300 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  World-State Presets:
                </span>
                {PRESETS.map((p) => {
                  const isCurrent = activePreset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPresetId(p.id);
                        setWorldState(p.state);
                      }}
                      className={`rounded border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                        isCurrent
                          ? "border-stone-900 bg-stone-900 text-stone-50"
                          : "border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2.5 text-xs text-stone-600">
                {activePreset
                  ? activePreset.description
                  : "Custom world-state active. Setting classical RH = False automatically sets GRH = False and ERH = False because zeta(s) is the trivial-character case of both."}
              </p>

              <div className="mt-3.5 grid grid-cols-1 gap-3 border-t border-stone-200 pt-3.5 sm:grid-cols-3">
                {(
                  [
                    { field: "rh", label: "RH · Riemann zeta(s)" },
                    { field: "grh", label: "GRH · Dirichlet L(s, chi)" },
                    { field: "erh", label: "ERH · Dedekind zeta_K(s)" },
                  ] as const
                ).map((item) => (
                  <label key={item.field} className="block">
                    <span className="block text-xs font-semibold text-stone-700">
                      {item.label}
                    </span>
                    <select
                      value={worldState[item.field]}
                      onChange={(e) =>
                        setWorldState((prev) =>
                          normalizeWorldState(prev, item.field, e.target.value as TruthState),
                        )
                      }
                      className="mt-1 w-full rounded border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-mono text-stone-900"
                    >
                      <option value="OPEN">OPEN (Unverified)</option>
                      <option value="TRUE">TRUE (Proven)</option>
                      <option value="FALSE">FALSE (Counterexample)</option>
                    </select>
                  </label>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-stone-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={worldState.guthMaynard2024}
                    onChange={(e) =>
                      setWorldState((prev) => ({
                        ...prev,
                        guthMaynard2024: e.target.checked,
                      }))
                    }
                    className="accent-stone-900"
                  />
                  <span>
                    Guth-Maynard 2024 zero-density (<code className="font-mono">2405.20552</code>)
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={worldState.alpogeFurman2026}
                    onChange={(e) =>
                      setWorldState((prev) => ({
                        ...prev,
                        alpogeFurman2026: e.target.checked,
                      }))
                    }
                    className="accent-stone-900"
                  />
                  <span>
                    Alpöge-Furman 67.25% simple (<code className="font-mono">2608.13637</code>)
                  </span>
                </label>

                {worldState.grh === "FALSE" && (
                  <label className="inline-flex items-center gap-2 font-medium text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={worldState.siegelZero}
                      onChange={(e) =>
                        setWorldState((prev) => ({
                          ...prev,
                          siegelZero: e.target.checked,
                        }))
                      }
                      className="accent-amber-700"
                    />
                    <span>Exceptional Landau-Siegel real zeros exist</span>
                  </label>
                )}
              </div>
            </section>

            {/* Scoreboard + Segmented Bar */}
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-lg border border-stone-300 bg-white p-3">
                  <div className="font-mono text-2xl font-bold text-emerald-700">
                    {counts.upgraded}
                  </div>
                  <div className="text-xs text-stone-600">New unconditional theorems</div>
                </div>
                <div className="rounded-lg border border-stone-300 bg-white p-3">
                  <div className="font-mono text-2xl font-bold text-sky-700">
                    {counts.tightened}
                  </div>
                  <div className="text-xs text-stone-600">Bounds tightened / baselines</div>
                </div>
                <div className="rounded-lg border border-stone-300 bg-white p-3">
                  <div className="font-mono text-2xl font-bold text-amber-700">
                    {counts.conditional}
                  </div>
                  <div className="text-xs text-stone-600">Still conditional</div>
                </div>
                <div className="rounded-lg border border-stone-300 bg-white p-3">
                  <div className="font-mono text-2xl font-bold text-stone-600">
                    {counts.vacuous}
                  </div>
                  <div className="text-xs text-stone-600">Vacuous / superseded</div>
                </div>
                <div className="rounded-lg border border-stone-300 bg-white p-3">
                  <div className="font-mono text-2xl font-bold text-rose-700">
                    {counts.falsified}
                  </div>
                  <div className="text-xs text-stone-600">Hypothesis falsified</div>
                </div>
              </div>

              <div
                className="flex h-3 w-full overflow-hidden rounded-full border border-stone-300 bg-stone-200"
                role="img"
                aria-label="Proportional breakdown of 16 theorems in active world-state"
              >
                {counts.upgraded > 0 && (
                  <div
                    style={{ width: `${(counts.upgraded / THEOREMS.length) * 100}%` }}
                    className="bg-emerald-600"
                    title={`New unconditional theorems: ${counts.upgraded}`}
                  />
                )}
                {counts.tightened > 0 && (
                  <div
                    style={{ width: `${(counts.tightened / THEOREMS.length) * 100}%` }}
                    className="bg-sky-600"
                    title={`Bounds tightened / proven baselines: ${counts.tightened}`}
                  />
                )}
                {counts.conditional > 0 && (
                  <div
                    style={{ width: `${(counts.conditional / THEOREMS.length) * 100}%` }}
                    className="bg-amber-500"
                    title={`Still conditional: ${counts.conditional}`}
                  />
                )}
                {counts.vacuous > 0 && (
                  <div
                    style={{ width: `${(counts.vacuous / THEOREMS.length) * 100}%` }}
                    className="bg-stone-500"
                    title={`Vacuous / superseded: ${counts.vacuous}`}
                  />
                )}
                {counts.falsified > 0 && (
                  <div
                    style={{ width: `${(counts.falsified / THEOREMS.length) * 100}%` }}
                    className="bg-rose-600"
                    title={`Hypothesis falsified: ${counts.falsified}`}
                  />
                )}
              </div>
            </section>

            {/* Citation DAG */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-stone-900">
                  Transitive Citation &amp; Conjecture Dependency Graph
                </h2>
                <span className="text-xs text-stone-500">
                  Click any node to inspect its LaTeX theorem diff · Dashed lines mark ~RH / ~GRH
                  (ASSUMES_FALSE)
                </span>
              </div>
              <CitationDag
                worldState={worldState}
                evaluatedById={evaluatedById}
                selectedId={selectedTheorem.id}
                onSelect={setSelectedId}
              />
            </section>

            {/* Selected Theorem Diff & Alert Inspector */}
            <TheoremInspector
              theorem={selectedTheorem}
              evaluated={selectedEval}
              tracedAgentLensUrl={matchedTrace?.v2.agentLensUrl}
              onJumpToAgentLens={
                matchedTrace ? () => setTab("agent-lens") : undefined
              }
            />

            {/* Searchable Ledger */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-stone-900">
                  Indexed Theorem Survival Ledger ({filteredTheorems.length} of {THEOREMS.length})
                </h2>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search arXiv ID, author, theorem..."
                  aria-label="Search theorems"
                  className="w-full rounded border border-stone-300 bg-white px-3 py-1.5 text-xs font-mono text-stone-900 sm:w-64"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(["ALL", "math.NT", "cs.CC", "cs.CR"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`rounded border px-2.5 py-1 text-xs font-mono cursor-pointer ${
                        categoryFilter === cat
                          ? "border-stone-900 bg-stone-900 text-stone-50"
                          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {cat === "ALL" ? "All fields (16)" : cat}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { id: "ALL", label: "All outcomes" },
                      { id: "UNLOCKED", label: "Upgraded / Tightened" },
                      { id: "CONDITIONAL", label: "Still conditional" },
                      { id: "DEAD_OR_FALSE", label: "~RH / Vacuous / Falsified" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setOutcomeFilter(f.id)}
                      className={`rounded border px-2.5 py-1 text-xs cursor-pointer ${
                        outcomeFilter === f.id
                          ? "border-stone-900 bg-stone-900 text-stone-50"
                          : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-stone-300 bg-white">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-100 text-stone-600">
                      <th className="px-3 py-2.5 font-semibold">Paper &amp; Theorem</th>
                      <th className="px-3 py-2.5 font-semibold">Field</th>
                      <th className="px-3 py-2.5 font-semibold">Assumption</th>
                      <th className="px-3 py-2.5 font-semibold text-center">Fallback?</th>
                      <th className="px-3 py-2.5 font-semibold text-center">Hop</th>
                      <th className="px-3 py-2.5 font-semibold">Live Status</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredTheorems.map((t) => {
                      const ev = evaluatedById[t.id];
                      const pol = t.polarity === "ASSUMES_FALSE" ? "~" : "";
                      const conj =
                        t.conjectureType === "DENSITY_BOUND"
                          ? "2024-26 Bound"
                          : `${pol}${t.conjectureType}`;
                      const isSel = t.id === selectedTheorem.id;
                      const dotColor =
                        ev.tone === "emerald"
                          ? "#059669"
                          : ev.tone === "sky"
                            ? "#0284C7"
                            : ev.tone === "amber"
                              ? "#D97706"
                              : ev.tone === "rose"
                                ? "#E11D48"
                                : "#78716C";
                      return (
                        <tr
                          key={t.id}
                          className={isSel ? "bg-amber-50/60" : "hover:bg-stone-50"}
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-stone-900">
                              <span className="mr-1.5 font-mono text-stone-500">{t.id}</span>
                              {t.authors} ({t.yearLabel}) · {t.theoremLabel}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                              <span>{t.title}</span>
                              <a
                                href={t.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-stone-700 underline hover:text-stone-950"
                              >
                                {t.arxivOrDoi} ↗
                              </a>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-stone-700">{t.category}</td>
                          <td className="px-3 py-2.5 font-mono text-stone-800">{conj}</td>
                          <td className="px-3 py-2.5 text-center text-stone-600">
                            {t.hasUnconditionalFallback ? "Yes" : "No"}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-stone-600">
                            {t.hopDepth}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 font-medium text-stone-900">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: dotColor }}
                              />
                              {ev.badgeLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedId(t.id)}
                              className={`rounded border px-2.5 py-1 font-medium cursor-pointer ${
                                isSel
                                  ? "border-stone-900 bg-stone-900 text-stone-50"
                                  : "border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
                              }`}
                            >
                              {isSel ? "Selected" : "Inspect"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
