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

  if (!/^https:\/\//.test(t.url)) {
    throw new Error(`Invalid URL on ${t.id}: ${t.url}`);
  }
  if (t.extractedQuote.length > 360) {
    throw new Error(`extractedQuote exceeds 360 chars on ${t.id}`);
  }
  for (const up of t.upstreamIds) {
    if (!validNodeIds.has(up)) {
      throw new Error(`Unknown upstream node ${up} on ${t.id}`);
    }
  }
}

if (PRESETS.length < 6) {
  throw new Error("Expected at least 6 world-state presets.");
}

const records = verifiedTraces.cases ?? [];
if (records.length !== 8) {
  throw new Error(`Expected 8 verified Agent Lens demo cases, found ${records.length}`);
}

for (const c of records) {
  if (!c.v2.agentLensUrl?.startsWith("https://forge.coreweave.com/agent-lens/")) {
    throw new Error(`Missing Agent Lens URL on ${c.caseId}`);
  }
}

const heldoutArms = verifiedTraces.heldoutBenchmark?.heldout60Arms ?? [];
if (heldoutArms.length !== 6) {
  throw new Error(`Expected 6 held-out benchmark arms, found ${heldoutArms.length}`);
}

console.log(
  `Validated ${THEOREMS.length} seed theorems, ${PRESETS.length} presets, ${heldoutArms.length} held-out benchmark arms, and ${records.length} paired Agent Lens trace receipts.`,
);
