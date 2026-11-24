import type {
  EvaluatedTheorem,
  PlainScopeGroup,
  TheoremRecord,
  TopicBucket,
} from "../data/theorems";

const TOPIC_ORDER: Array<{
  bucket: TopicBucket;
  subtitle: string;
}> = [
  {
    bucket: "Primes & Number Theory",
    subtitle: "Prime gaps, prime counting, L-functions & Siegel zeros",
  },
  {
    bucket: "Algorithms & Complexity",
    subtitle: "Primality testing, factoring, polynomial & graph algorithms",
  },
  {
    bucket: "Algebra, Knots & Quantum",
    subtitle: "Knot recognition, Artin's conjecture, number rings & quantum algorithms",
  },
  {
    bucket: "Cryptography & Security",
    subtitle: "Post-quantum isogeny signatures, class groups & elliptic curves",
  },
];

export function ImpactOverview({
  theorems,
  evaluatedById,
  selectedTopic,
  onSelectTopic,
  onQuickJump,
}: {
  theorems: TheoremRecord[];
  evaluatedById: Record<string, EvaluatedTheorem>;
  selectedTopic: "ALL" | TopicBucket;
  onSelectTopic: (topic: "ALL" | TopicBucket) => void;
  onQuickJump: (filter: {
    topic?: "ALL" | TopicBucket;
    scopeGroup?: "ALL" | PlainScopeGroup | "ASSUMES_FALSE";
  }) => void;
}) {
  const rows = TOPIC_ORDER.map(({ bucket, subtitle }) => {
    const list = theorems.filter((t) => (t.topicBucket ?? "Primes & Number Theory") === bucket);
    let proven = 0;
    let faster = 0;
    let waiting = 0;
    let retiredOrBroken = 0;
    let mentionOnly = 0;
    for (const t of list) {
      const o = evaluatedById[t.id].outcome;
      if (o === "UPGRADED_UNCONDITIONAL") proven++;
      else if (o === "BOUND_TIGHTENED") faster++;
      else if (o === "STILL_CONDITIONAL") waiting++;
      else if (o === "MENTION_ONLY_UNCHANGED") mentionOnly++;
      else retiredOrBroken++;
    }
    return {
      bucket,
      subtitle,
      total: list.length,
      proven,
      faster,
      waiting,
      retiredOrBroken,
      mentionOnly,
    };
  });

  const beyondCount = theorems.filter((t) => t.conjectureType === "BEYOND_DIRICHLET").length;
  const mentionCount = theorems.filter((t) => t.conjectureType === "MENTION_ONLY").length;
  const cryptoCount = theorems.filter((t) => t.topicBucket === "Cryptography & Security").length;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left: Clean Topic x Outcome Breakdown */}
      <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              How {theorems.length.toLocaleString()} Audited Works Shift by Field
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Passing mentions are separated in light gray so they never inflate &ldquo;settled&rdquo; counts.
            </p>
          </div>
          {selectedTopic !== "ALL" && (
            <button
              type="button"
              onClick={() => onSelectTopic("ALL")}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
            >
              Show all fields
            </button>
          )}
        </div>

        <div className="space-y-3">
          {rows.map((r) => {
            const isSelected = selectedTopic === r.bucket;
            const pPct = r.total ? (r.proven / r.total) * 100 : 0;
            const fPct = r.total ? (r.faster / r.total) * 100 : 0;
            const wPct = r.total ? (r.waiting / r.total) * 100 : 0;
            const dPct = r.total ? (r.retiredOrBroken / r.total) * 100 : 0;
            const mPct = r.total ? (r.mentionOnly / r.total) * 100 : 0;

            return (
              <button
                key={r.bucket}
                type="button"
                onClick={() => onSelectTopic(isSelected ? "ALL" : r.bucket)}
                className={`w-full text-left rounded-xl border p-3 transition cursor-pointer ${
                  isSelected
                    ? "bg-indigo-50/60 border-indigo-400 ring-1 ring-indigo-300"
                    : "bg-stone-50/70 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                  <div>
                    <span className="text-sm font-semibold text-stone-900">{r.bucket}</span>
                    <span className="ml-2 text-xs text-stone-500 font-mono">
                      {r.total.toLocaleString()} works
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                    {r.proven > 0 && <span className="text-emerald-800">{r.proven} proven</span>}
                    {r.faster > 0 && <span className="text-sky-800">{r.faster} faster/known</span>}
                    {r.waiting > 0 && <span className="text-amber-800">{r.waiting} still open</span>}
                    {r.retiredOrBroken > 0 && (
                      <span className="text-rose-800">{r.retiredOrBroken} retired</span>
                    )}
                    {r.mentionOnly > 0 && (
                      <span className="text-stone-500">{r.mentionOnly} mention only</span>
                    )}
                  </div>
                </div>

                <div className="h-2.5 w-full rounded-full bg-stone-200 overflow-hidden flex">
                  {pPct > 0 && (
                    <div
                      style={{ width: `${pPct}%` }}
                      className="bg-emerald-500 h-full transition-all duration-300"
                      title={`${r.proven} become proven`}
                    />
                  )}
                  {fPct > 0 && (
                    <div
                      style={{ width: `${fPct}%` }}
                      className="bg-sky-500 h-full transition-all duration-300"
                      title={`${r.faster} get faster/tighter or already proven`}
                    />
                  )}
                  {wPct > 0 && (
                    <div
                      style={{ width: `${wPct}%` }}
                      className="bg-amber-400 h-full transition-all duration-300"
                      title={`${r.waiting} still open (number-field or unspecified GRH)`}
                    />
                  )}
                  {dPct > 0 && (
                    <div
                      style={{ width: `${dPct}%` }}
                      className="bg-rose-400 h-full transition-all duration-300"
                      title={`${r.retiredOrBroken} retired 'if false' or broken`}
                    />
                  )}
                  {mPct > 0 && (
                    <div
                      style={{ width: `${mPct}%` }}
                      className="bg-stone-300 h-full transition-all duration-300"
                      title={`${r.mentionOnly} only mention RH/GRH in passing`}
                    />
                  )}
                </div>
                <p className="text-[11px] text-stone-500 mt-1">{r.subtitle}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap items-center gap-3.5 text-[11px] text-stone-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
            Becomes Proven
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" />
            Faster / Already Proven
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-400" />
            Still Open (Number-Field / Unclear)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-400" />
            Retired &lsquo;If-False&rsquo;
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-stone-300" />
            Only Mentions It
          </span>
        </div>
      </div>

      {/* Right: 3 Plain-English Scope & Discourse Jump Cards */}
      <div className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Three Catches in the Checked Proof
          </h2>
          <p className="text-xs text-stone-500 mt-0.5 mb-3.5">
            What full-text verification revealed across the pool.
          </p>

          <div className="space-y-2.5">
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="text-xs font-bold text-stone-900">
                1. Two different conjectures share the name &ldquo;GRH&rdquo;
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                The certified Lean proof covers primes in modular patterns (
                <strong>Dirichlet GRH</strong>). Number-field versions (Dedekind, Hecke, Artin,
                effective Chebotarev) were <em>not</em> checked — leaving{" "}
                <strong>{beyondCount.toLocaleString()}</strong> papers still open, even when their
                abstracts casually write &ldquo;assuming GRH.&rdquo;
              </p>
              <button
                type="button"
                onClick={() => onQuickJump({ topic: "ALL", scopeGroup: "BEYOND" })}
                className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                See {beyondCount.toLocaleString()} number-field holdouts &rarr;
              </button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="text-xs font-bold text-stone-900">
                2. What happens to cryptography and quantum isogenies?
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                RSA is untouched, and post-quantum isogeny papers like{" "}
                <strong>Wesolowski&rsquo;s SQIsign reduction</strong> and{" "}
                <strong>Childs–Jao–Soukharev</strong> actually invoke number-field Chebotarev or
                Hecke bounds — so they remain conditional today.
              </p>
              <button
                type="button"
                onClick={() => onQuickJump({ topic: "Cryptography & Security", scopeGroup: "ALL" })}
                className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                Browse {cryptoCount.toLocaleString()} cryptography papers &rarr;
              </button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="text-xs font-bold text-stone-900">
                3. Why are Green–Tao, Koblitz, and AKS listed as unchanged?
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Full-text search surfaces famous unconditional papers that mention RH or GRH in
                historical remarks (<strong>{mentionCount.toLocaleString()}</strong> here). Giving
                them their own bucket keeps passing mentions out of every &ldquo;changed&rdquo; count.
              </p>
              <button
                type="button"
                onClick={() => onQuickJump({ topic: "ALL", scopeGroup: "MENTION_ONLY" })}
                className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                See {mentionCount.toLocaleString()} passing-mention papers &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
