import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adaptPoolItems, type PoolCorpusItem } from "./data/corpus-adapter";
import {
  buildExcludeSetFromLandmarks,
  EMBED_SEED_THEOREMS,
  evaluateTheorem,
  LANDMARK_THEOREMS,
  normalizeWorldState,
  plainScopeGroup,
  PRESETS,
  resolvePresetId,
  THEOREMS,
  type TheoremRecord,
} from "./data/theorems";

describe("TheoremSurvival Attempt 2 world-state engine", () => {
  const byId = Object.fromEntries(THEOREMS.map((t) => [t.id, t]));

  it("loads embed Top-100 seed and full 3,779-paper pool with valid URLs and summaries", () => {
    expect(EMBED_SEED_THEOREMS.length).toBeGreaterThanOrEqual(100);
    for (const t of EMBED_SEED_THEOREMS) {
      expect(t.plainSummary && t.plainSummary.length).toBeGreaterThan(20);
      expect(t.url.startsWith("https://")).toBe(true);
    }

    const poolJsonPath = path.resolve(import.meta.dirname, "..", "public", "pool-classified.json");
    const rawPool = JSON.parse(fs.readFileSync(poolJsonPath, "utf8")) as PoolCorpusItem[];
    const fullList = [
      ...LANDMARK_THEOREMS,
      ...adaptPoolItems(rawPool, buildExcludeSetFromLandmarks(LANDMARK_THEOREMS)),
    ];
    expect(fullList.length).toBeGreaterThanOrEqual(3700);
    for (const t of fullList) {
      expect(t.url.startsWith("https://")).toBe(true);
    }
  });

  it("defaults to checked_nov24 and preserves legacy preset URL aliases", () => {
    expect(PRESETS[0].id).toBe("checked_nov24");
    expect(resolvePresetId("alpoge_rh_grh")).toBe("checked_nov24");
    expect(resolvePresetId("nov20_live")).toBe("pre_nov20_open");
    expect(resolvePresetId("full_rh_grh_erh")).toBe("full_ladder");
  });

  it("keeps all conditional theorems waiting under pre_nov20_open", () => {
    const preOpen = PRESETS.find((p) => p.id === "pre_nov20_open")!.state;
    const landmarkOutcomes = LANDMARK_THEOREMS.map((t) => evaluateTheorem(t, preOpen).outcome);
    expect(landmarkOutcomes.filter((o) => o === "STILL_CONDITIONAL")).toHaveLength(15);
    expect(landmarkOutcomes.filter((o) => o === "BOUND_TIGHTENED")).toHaveLength(2);
  });

  it("separates GRH_DIRICHLET from BEYOND_DIRICHLET under the checked Nov 24 scope", () => {
    const checked = PRESETS.find((p) => p.id === "checked_nov24")!.state;

    // Classical RH unlocks Visser (P04), Lagarias (P02), and Robin (P17)
    expect(evaluateTheorem(byId.P04, checked).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(evaluateTheorem(byId.P02, checked).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(evaluateTheorem(byId.P17, checked).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(byId.P02.machineCheckedLean?.verified).toBe(true);
    expect(byId.P17.machineCheckedLean?.verified).toBe(true);

    // Dirichlet GRH sharpens Miller-Bach deterministic primality (P08)
    expect(evaluateTheorem(byId.P08, checked).outcome).toBe("BOUND_TIGHTENED");

    // Number-field / Hecke / Chebotarev papers (Kuperberg P09, Baldwin-Sivek P10, Pak-Robichaux P11,
    // Wesolowski SQIsign P12, Jao-Miller-Venkatesan P13, Hooley-Weinberger P14) stay STILL_CONDITIONAL!
    for (const id of ["P09", "P10", "P11", "P12", "P13", "P14"]) {
      expect(evaluateTheorem(byId[id], checked).outcome).toBe("STILL_CONDITIONAL");
      expect(plainScopeGroup(byId[id])).toBe("BEYOND");
    }

    // Siegel-zero Twin Primes route (P16) becomes vacuous when Dirichlet GRH = TRUE
    expect(evaluateTheorem(byId.P16, checked).outcome).toBe("VACUOUS_OR_SUPERSEDED");
  });

  it("never counts UNCLEAR as settled and excludes MENTION_ONLY from changed outcomes", () => {
    const checked = PRESETS.find((p) => p.id === "checked_nov24")!.state;
    const full = PRESETS.find((p) => p.id === "full_ladder")!.state;

    const unclearSample: TheoremRecord = {
      ...byId.P08,
      id: "TEST_UNCLEAR",
      conjectureType: "UNCLEAR",
      hasUnconditionalFallback: false,
    };
    expect(evaluateTheorem(unclearSample, checked).outcome).toBe("STILL_CONDITIONAL");
    expect(evaluateTheorem(unclearSample, full).outcome).toBe("STILL_CONDITIONAL");
    expect(plainScopeGroup(unclearSample)).toBe("UNCLEAR");

    const mentionSample: TheoremRecord = {
      ...byId.P08,
      id: "TEST_MENTION",
      conjectureType: "MENTION_ONLY",
    };
    expect(evaluateTheorem(mentionSample, checked).outcome).toBe("MENTION_ONLY_UNCHANGED");
    expect(evaluateTheorem(mentionSample, full).outcome).toBe("MENTION_ONLY_UNCHANGED");
    expect(plainScopeGroup(mentionSample)).toBe("MENTION_ONLY");
  });

  it("preserves Alpoge-Furman >=67.25% simplicity under RH = TRUE", () => {
    const rhOnly = PRESETS.find((p) => p.id === "rh_only")!.state;
    expect(evaluateTheorem(byId.P06, rhOnly).outcome).toBe("BOUND_TIGHTENED");
    expect(evaluateTheorem(byId.P05, rhOnly).outcome).toBe("VACUOUS_OR_SUPERSEDED");
  });

  it("upgrades Twin Primes under the Siegel-zero twist and enforces containment on RH = FALSE", () => {
    const siegelState = PRESETS.find((p) => p.id === "siegel_zero_twist")!.state;
    expect(evaluateTheorem(byId.P16, siegelState).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(evaluateTheorem(byId.P08, siegelState).outcome).toBe("HYPOTHESIS_FALSIFIED");

    const full = PRESETS.find((p) => p.id === "full_ladder")!.state;
    const next = normalizeWorldState(full, "rh", "FALSE");
    expect(next.rh).toBe("FALSE");
    expect(next.grhDirichlet).toBe("FALSE");
    expect(next.beyondDirichlet).toBe("FALSE");
  });
});
