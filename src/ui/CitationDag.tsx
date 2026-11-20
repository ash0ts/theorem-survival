import { useMemo } from "react";
import {
  CONJECTURE_ROOTS,
  THEOREMS,
  type EvaluatedTheorem,
  type TheoremRecord,
  type WorldState,
} from "../data/theorems";

interface NodeBox {
  id: string;
  rank: 0 | 1 | 2;
  x: number;
  y: number;
}

const TONE_HEX: Record<EvaluatedTheorem["tone"], string> = {
  emerald: "#059669",
  sky: "#0284C7",
  amber: "#D97706",
  stone: "#78716C",
  rose: "#E11D48",
};

export function CitationDag({
  worldState,
  evaluatedById,
  selectedId,
  onSelect,
}: {
  worldState: WorldState;
  evaluatedById: Record<string, EvaluatedTheorem>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const nodeWidth = 232;
  const nodeHeight = 52;
  const rankGap = 64;
  const nodeGap = 10;
  const padX = 20;
  const headerHeight = 34;

  const { boxes, edges, totalWidth, totalHeight, colX } = useMemo(() => {
    const rank1 = THEOREMS.filter((t) => t.hopDepth === 1);
    const rank2 = THEOREMS.filter((t) => t.hopDepth === 2);

    const maxRows = Math.max(CONJECTURE_ROOTS.length, rank1.length, rank2.length);
    const bodyHeight = maxRows * nodeHeight + (maxRows - 1) * nodeGap;
    const height = headerHeight + bodyHeight + 20;
    const x0 = padX;
    const x1 = padX + nodeWidth + rankGap;
    const x2 = x1 + nodeWidth + rankGap;
    const width = x2 + nodeWidth + padX;

    function columnBoxes(ids: string[], rank: 0 | 1 | 2, colLeft: number): NodeBox[] {
      const colHeight = ids.length * nodeHeight + (ids.length - 1) * nodeGap;
      const offsetY = headerHeight + Math.round((bodyHeight - colHeight) / 2);
      return ids.map((id, idx) => ({
        id,
        rank,
        x: colLeft,
        y: offsetY + idx * (nodeHeight + nodeGap),
      }));
    }

    const allBoxes = [
      ...columnBoxes(
        CONJECTURE_ROOTS.map((r) => r.id),
        0,
        x0,
      ),
      ...columnBoxes(
        rank1.map((t) => t.id),
        1,
        x1,
      ),
      ...columnBoxes(
        rank2.map((t) => t.id),
        2,
        x2,
      ),
    ];

    const byId = new Map(allBoxes.map((b) => [b.id, b]));
    const edgeList: Array<{
      from: string;
      to: string;
      sx: number;
      sy: number;
      tx: number;
      ty: number;
      negated: boolean;
    }> = [];

    for (const t of THEOREMS) {
      const target = byId.get(t.id);
      if (!target) continue;
      for (const up of t.upstreamIds) {
        const src = byId.get(up);
        if (!src) continue;
        edgeList.push({
          from: up,
          to: t.id,
          sx: src.x + nodeWidth,
          sy: src.y + nodeHeight / 2,
          tx: target.x,
          ty: target.y + nodeHeight / 2,
          negated:
            t.polarity === "ASSUMES_FALSE" &&
            (up === "ROOT_RH" || up === "ROOT_GRH"),
        });
      }
    }

    return {
      boxes: allBoxes,
      edges: edgeList,
      totalWidth: width,
      totalHeight: height,
      colX: [x0, x1, x2],
    };
  }, []);

  const theoremMap = useMemo(
    () => new Map<string, TheoremRecord>(THEOREMS.map((t) => [t.id, t])),
    [],
  );
  const rootMap = useMemo(
    () => new Map(CONJECTURE_ROOTS.map((r) => [r.id, r])),
    [],
  );

  function rootVisual(key: "rh" | "grh" | "erh" | "partial") {
    if (key === "partial") {
      const on = worldState.guthMaynard2024 || worldState.alpogeFurman2026;
      return { dot: on ? "#0284C7" : "#78716C", tag: on ? "PROVEN" : "OFF" };
    }
    const v = worldState[key];
    if (v === "TRUE") return { dot: "#059669", tag: "TRUE" };
    if (v === "FALSE") return { dot: "#E11D48", tag: "FALSE" };
    return { dot: "#D97706", tag: "OPEN" };
  }

  const colHeaders = [
    "Rank 0 · Conjecture Roots",
    "Hop 1 · Direct Conditional Theorems",
    "Hop 2 · Transitive Dependents",
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-300 bg-white">
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        role="img"
        aria-label="Transitive citation and conjecture dependency graph across 16 theorems"
        className="block min-w-[840px]"
      >
        {colX.map((x, idx) => (
          <text
            key={colHeaders[idx]}
            x={x}
            y={22}
            fill="#57534E"
            fontSize={11}
            fontWeight={600}
            letterSpacing="0.02em"
          >
            {colHeaders[idx]}
          </text>
        ))}

        {edges.map((e, i) => {
          const dx = Math.max(28, (e.tx - e.sx) * 0.48);
          const d = `M ${e.sx} ${e.sy} C ${e.sx + dx} ${e.sy}, ${e.tx - dx} ${e.ty}, ${e.tx} ${e.ty}`;
          const active = e.to === selectedId || e.from === selectedId;
          return (
            <path
              key={`${e.from}-${e.to}-${i}`}
              d={d}
              fill="none"
              stroke={active ? "#1C1917" : "#D6D3D1"}
              strokeWidth={active ? 2.1 : 1.25}
              strokeDasharray={e.negated ? "5 3" : undefined}
            />
          );
        })}

        {boxes.map((box) => {
          const root = rootMap.get(box.id);
          if (root) {
            const rv = rootVisual(root.key);
            return (
              <g key={box.id} transform={`translate(${box.x}, ${box.y})`}>
                <rect
                  width={nodeWidth}
                  height={nodeHeight}
                  rx={6}
                  fill="#F5F5F4"
                  stroke="#A8A29E"
                  strokeWidth={1.25}
                />
                <circle cx={12} cy={18} r={4} fill={rv.dot} />
                <text x={22} y={21} fill="#1C1917" fontSize={12} fontWeight={600}>
                  {root.shortTitle}
                </text>
                <text
                  x={nodeWidth - 10}
                  y={21}
                  textAnchor="end"
                  fill="#44403C"
                  fontSize={10}
                  fontWeight={700}
                >
                  {rv.tag}
                </text>
                <text x={12} y={39} fill="#57534E" fontSize={11}>
                  {root.subtitle}
                </text>
              </g>
            );
          }

          const thm = theoremMap.get(box.id);
          const ev = evaluatedById[box.id];
          if (!thm || !ev) return null;

          const selected = box.id === selectedId;
          const dot = TONE_HEX[ev.tone];
          const pol = thm.polarity === "ASSUMES_FALSE" ? "~" : "";
          const conjShort =
            thm.conjectureType === "DENSITY_BOUND" ? "BOUND" : `${pol}${thm.conjectureType}`;

          return (
            <g
              key={box.id}
              transform={`translate(${box.x}, ${box.y})`}
              onClick={() => onSelect(box.id)}
              className="cursor-pointer"
            >
              <rect
                width={nodeWidth}
                height={nodeHeight}
                rx={6}
                fill={selected ? "#FEF3C7" : "#FAFAF9"}
                stroke={selected ? "#1C1917" : "#D6D3D1"}
                strokeWidth={selected ? 2 : 1}
              />
              <circle cx={12} cy={17} r={4} fill={dot} />
              <text x={21} y={20} fill="#57534E" fontSize={10.5} fontWeight={500}>
                {`${thm.id} · ${thm.category} · ${conjShort}`}
              </text>
              <text
                x={nodeWidth - 9}
                y={20}
                textAnchor="end"
                fill="#292524"
                fontSize={9.5}
                fontWeight={700}
              >
                {ev.shortTag}
              </text>
              <text x={12} y={39} fill="#1C1917" fontSize={12} fontWeight={600}>
                {thm.shortNodeTitle}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
