import { CONJECTURE_ROOTS, PRESETS, THEOREMS } from "../src/data/theorems";
import verifiedTraces from "../src/data/verified-traces.json";

const validNodeIds = new Set([
  ...CONJECTURE_ROOTS.map((r) => r.id),
  ...THEOREMS.map((t) => t.id),
]);

const seenIds = new Set<string>();
for (const t of THEOREMS) {
  if (seenIds.has(t.id)) {
    throw new Error(`Duplicate theorem ID: ${t.id}`);
  }
  seenIds.add(t.id);

  if (!t.url.startsWith("https://arxiv.org/abs/") && !t.url.startsWith("https://doi.org/")) {
    throw new Error(`Invalid URL on ${t.id}: ${t.url}`);
  }
  if (t.extractedQuote.length > 300) {
    throw new Error(`extractedQuote exceeds 300 chars on ${t.id}`);
  }
  for (const up of t.upstreamIds) {
    if (!validNodeIds.has(up)) {
      throw new Error(`Unknown upstream node ${up} on ${t.id}`);
    }
  }
}

if (PRESETS.length < 6) {
  throw new Error("Expected 6 world-state presets.");
}

if (verifiedTraces.cases.length !== 8) {
  throw new Error(`Expected 8 verified Agent Lens cases, found ${verifiedTraces.cases.length}`);
}

for (const c of verifiedTraces.cases) {
  if (!c.v2.exactMatch) {
    throw new Error(`Expected auditor-v2-guarded exactMatch on ${c.caseId}`);
  }
  if (!c.v2.agentLensUrl?.startsWith("https://forge.coreweave.com/agent-lens/")) {
    throw new Error(`Missing Agent Lens URL on ${c.caseId}`);
  }
}

console.log(
  `Validated ${THEOREMS.length} theorems, ${PRESETS.length} presets, and ${verifiedTraces.cases.length} paired Agent Lens trace receipts.`,
);
