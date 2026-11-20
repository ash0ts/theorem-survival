import type { EvaluatedTheorem, TheoremRecord, TopicBucket } from "../data/theorems";

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
    subtitle: "Knot recognition, Artin's conjecture, number rings & quantum codes",
  },
  {
    bucket: "Cryptography & Security",
    subtitle: "Post-quantum isogeny signatures, lattices & elliptic curves",
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
    conjecture?: "ALL" | "RH" | "GRH" | "ERH" | "ASSUMES_FALSE" | "ALREADY_PROVEN";
  }) => void;
}) {
  const rows = TOPIC_ORDER.map(({ bucket, subtitle }) => {
    const list = theorems.filter((t) => (t.topicBucket ?? "Primes & Number Theory") === bucket);
    let proven = 0;
    let faster = 0;
    let waiting = 0;
    let deadOrBroken = 0;
    for (const t of list) {
      const o = evaluatedById[t.id].outcome;
      if (o === "UPGRADED_UNCONDITIONAL") proven++;
      else if (o === "BOUND_TIGHTENED") faster++;
      else if (o === "STILL_CONDITIONAL") waiting++;
      else deadOrBroken++;
    }
    return {
      bucket,
      subtitle,
      total: list.length,
      proven,
      faster,
      waiting,
      deadOrBroken,
    };
  });

  const erhCount = theorems.filter((t) => t.conjectureType === "ERH").length;
  const assumesFalseCount = theorems.filter((t) => t.polarity === "ASSUMES_FALSE").length;
  const cryptoCount = theorems.filter((t) => t.topicBucket === "Cryptography & Security").length;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left: Clean Topic x Outcome Breakdown across all 160 papers */}
      <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              How {theorems.length} Real Papers Shift by Field
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Click any field to filter the paper list below.
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
            const dPct = r.total ? (r.deadOrBroken / r.total) * 100 : 0;

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
                      {r.total} papers
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                    {r.proven > 0 && (
                      <span className="text-emerald-800">{r.proven} proven</span>
                    )}
                    {r.faster > 0 && (
                      <span className="text-sky-800">{r.faster} faster/known</span>
                    )}
                    {r.waiting > 0 && (
                      <span className="text-amber-800">{r.waiting} still open</span>
                    )}
                    {r.deadOrBroken > 0 && (
                      <span className="text-stone-600">{r.deadOrBroken} retired/broken</span>
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
                      title={`${r.waiting} still waiting on conjecture`}
                    />
                  )}
                  {dPct > 0 && (
                    <div
                      style={{ width: `${dPct}%` }}
                      className="bg-stone-400 h-full transition-all duration-300"
                      title={`${r.deadOrBroken} dead what-if path or broken`}
                    />
                  )}
                </div>
                <p className="text-[11px] text-stone-500 mt-1">{r.subtitle}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap items-center gap-4 text-[11px] text-stone-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
            Becomes Proven Fact
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" />
            Gets Faster / Already Proven
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-400" />
            Still Unproved
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-stone-400" />
            Dead &lsquo;What-If&rsquo; / Broken
          </span>
        </div>
      </div>

      {/* Right: 3 Plain-English FAQ / Myth-Busters with one-click filter jumps */}
      <div className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Three Questions Everyone Asks First
          </h2>
          <p className="text-xs text-stone-500 mt-0.5 mb-3.5">
            Plain-English takeaways from auditing the literature.
          </p>

          <div className="space-y-2.5">
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="text-xs font-bold text-stone-900">
                1. Does proving RH break RSA or internet encryption?
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                <strong className="text-stone-900">No.</strong> RH does not give a fast factoring
                algorithm. In fact, proving <code className="font-mono text-[11px]">GRH</code>{" "}
                <em>strengthens</em> security reductions for post-quantum isogeny signatures like
                SQIsign.
              </p>
              <button
                type="button"
                onClick={() => onQuickJump({ topic: "Cryptography & Security", conjecture: "ALL" })}
                className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                Browse {cryptoCount} cryptography papers &rarr;
              </button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="text-xs font-bold text-stone-900">
                2. Does RH unlock every &ldquo;Assuming GRH / ERH&rdquo; paper?
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                <strong className="text-stone-900">Not automatically.</strong> Basic{" "}
                <code className="font-mono text-[11px]">RH</code> covers prime gaps,{" "}
                <code className="font-mono text-[11px]">GRH</code> covers modular arithmetic &amp; CS
                algorithms, and <code className="font-mono text-[11px]">ERH</code> covers higher
                number fields ({erhCount} papers still waiting under Friday&rsquo;s claim).
              </p>
              <button
                type="button"
                onClick={() => onQuickJump({ topic: "ALL", conjecture: "ERH" })}
                className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                See {erhCount} Extended-RH holdouts &rarr;
              </button>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
              <div className="text-xs font-bold text-stone-900">
                3. Wait — some papers assumed RH or GRH was <em>false</em>?
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                <strong className="text-stone-900">Yes ({assumesFalseCount} papers here).</strong>{" "}
                Mathematicians proved that if rare &ldquo;Siegel zeros&rdquo; violated GRH, the Twin
                Prime Conjecture would follow. If GRH holds, those proof paths evaporate.
              </p>
              <button
                type="button"
                onClick={() => onQuickJump({ topic: "ALL", conjecture: "ASSUMES_FALSE" })}
                className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                See {assumesFalseCount} &ldquo;what-if-false&rdquo; papers &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
