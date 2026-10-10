import { describe, expect, it, vi } from "vitest";
import { decodeFormation, emptySquad, encodeFormation, normalizeTroop, normSquad, tacticById, TROOP_ADVANTAGE, TROOP_TYPES, troopDamageMultiplier } from "@/lib/sengoku-data";
import { runSimulation, TEMPLATES, templateToSquad } from "@/lib/simulator";
import { matchesName } from "@/components/tier/search-select";

describe("Troops, search and tactics", () => {
  it("applies all four directional troop advantages and neutral pairings", () => {
    for (const troop of TROOP_TYPES) {
      const weaker = TROOP_ADVANTAGE[troop];
      expect(troopDamageMultiplier(troop, weaker)).toBe(1.15);
      expect(troopDamageMultiplier(weaker, troop)).toBe(0.85);
      expect(troopDamageMultiplier(troop, troop)).toBe(1);
    }
    expect(troopDamageMultiplier("騎兵", "鉄砲")).toBe(1);
    expect(troopDamageMultiplier("弓兵", "足軽")).toBe(1);
  });
  it("preserves troop in shared formations and normalizes legacy data", () => {
    const squad = { ...emptySquad(), troop: "騎兵" as const };
    expect(decodeFormation(encodeFormation({ mode: "free", squads: [squad] }))?.squads[0]?.troop).toBe("騎兵");
    expect(normSquad({ generals: [], tactics: [] }).troop).toBe("足軽");
    expect(normalizeTroop("unknown")).toBe("足軽");
  });
  it("finds names from a single character", () => {
    expect(matchesName("戦意消沈", "意")).toBe(true);
    expect(matchesName("戦意崩壊", "意")).toBe(true);
    expect(matchesName("織田信長", "信")).toBe(true);
    expect(matchesName("戦意消沈", "荷")).toBe(false);
  });
  it("removes お初 and retains the new tactic with exact data", () => {
    expect(TEMPLATES).toHaveLength(15);
    expect(TEMPLATES.flatMap(t => t.members).some(m => m.name === "お初")).toBe(false);
    expect(tacticById.get("t-荷駄崩し")).toMatchObject({ grade: "S", kind: "能動", rate: "40%" });
    expect(tacticById.get("t-荷駄崩し")?.effect).toContain("64%→128%");
    for (const template of TEMPLATES) expect(templateToSquad(template, [0, 0, 0]).troop).toBe(template.troop);
  });
  it("changes actual simulated damage when troop matchups change", () => {
    const template = TEMPLATES[0];
    if (!template) throw new Error("Missing template");
    const squad = templateToSquad(template, [0, 0, 0]);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.6);
    try {
      const favorable = runSimulation({ ...squad, troop: "騎兵" }, [{ label: "test", squad: { ...squad, troop: "弓兵" } }], 10);
      const unfavorable = runSimulation({ ...squad, troop: "弓兵" }, [{ label: "test", squad: { ...squad, troop: "騎兵" } }], 10);
      expect(favorable.total).toBe(10);
      expect(favorable.metrics[8]).toBeGreaterThan(unfavorable.metrics[8] ?? 0);
    } finally { random.mockRestore(); }
  });
});