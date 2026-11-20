import { describe, expect, it } from "vitest";
import {
  evaluateTheorem,
  normalizeWorldState,
  PRESETS,
  THEOREMS,
} from "./data/theorems";

describe("TheoremSurvival world-state engine", () => {
  const byId = Object.fromEntries(THEOREMS.map((t) => [t.id, t]));

  it("keeps all 14 conditional theorems waiting when Lean Comparator is still running", () => {
    const liveState = PRESETS.find((p) => p.id === "nov20_live")!.state;
    const outcomes = THEOREMS.map((t) => evaluateTheorem(t, liveState).outcome);
    expect(outcomes.filter((o) => o === "STILL_CONDITIONAL")).toHaveLength(14);
    expect(outcomes.filter((o) => o === "BOUND_TIGHTENED")).toHaveLength(2);
    expect(outcomes.filter((o) => o === "UPGRADED_UNCONDITIONAL")).toHaveLength(0);
  });

  it("distinguishes RH, GRH, and ERH under Alpoge's Nov 20 RH + GRH claim", () => {
    const claimState = PRESETS.find((p) => p.id === "alpoge_rh_grh")!.state;

    // Classical RH unlocks Visser (P04) and Lagarias (P02)
    expect(evaluateTheorem(byId.P04, claimState).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(evaluateTheorem(byId.P02, claimState).outcome).toBe("UPGRADED_UNCONDITIONAL");

    // Dirichlet GRH unlocks SQIsign equivalence (P12) and tightens Kuperberg (P09, Lackenby fallback)
    expect(evaluateTheorem(byId.P12, claimState).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(evaluateTheorem(byId.P09, claimState).outcome).toBe("BOUND_TIGHTENED");

    // Dedekind ERH theorems (Artin P14, SchubertVanishing P11) stay conditional!
    expect(evaluateTheorem(byId.P14, claimState).outcome).toBe("STILL_CONDITIONAL");
    expect(evaluateTheorem(byId.P11, claimState).outcome).toBe("STILL_CONDITIONAL");

    // Siegel-zero Twin Primes route (P16) becomes vacuous when GRH = TRUE
    expect(evaluateTheorem(byId.P16, claimState).outcome).toBe("VACUOUS_OR_SUPERSEDED");
  });

  it("preserves Alpoge-Furman >=67.25% simplicity under RH = TRUE", () => {
    const rhOnly = PRESETS.find((p) => p.id === "rh_only")!.state;
    expect(evaluateTheorem(byId.P06, rhOnly).outcome).toBe("BOUND_TIGHTENED");
    expect(evaluateTheorem(byId.P05, rhOnly).outcome).toBe("VACUOUS_OR_SUPERSEDED");
  });

  it("upgrades Twin Primes to unconditional under the Siegel-zero twist (RH True, GRH False)", () => {
    const siegelState = PRESETS.find((p) => p.id === "siegel_zero_twist")!.state;
    expect(evaluateTheorem(byId.P16, siegelState).outcome).toBe("UPGRADED_UNCONDITIONAL");
    expect(evaluateTheorem(byId.P12, siegelState).outcome).toBe("HYPOTHESIS_FALSIFIED");
  });

  it("enforces logical containment when classical RH is set to FALSE", () => {
    const full = PRESETS.find((p) => p.id === "full_rh_grh_erh")!.state;
    const next = normalizeWorldState(full, "rh", "FALSE");
    expect(next.rh).toBe("FALSE");
    expect(next.grh).toBe("FALSE");
    expect(next.erh).toBe("FALSE");
  });
});
