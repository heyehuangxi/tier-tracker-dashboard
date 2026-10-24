import { describe, expect, it, vi } from "vitest";
import { decodeFormation, emptySquad, encodeFormation, GENERALS, INHERENT_TACTICS, inherentByHolder, normalizeTroop, normSquad, tacticById, TROOP_ADVANTAGE, TROOP_TYPES, troopDamageMultiplier } from "@/lib/sengoku-data";
import { runSimulation, TEMPLATES, templateToSquad } from "@/lib/simulator";
import { matchesName } from "@/components/tier/search-select";

describe("Troops, search and tactics", () => {
  it("applies all four directional troop advantages and neutral pairings", () => {
    for (const troop of TROOP_TYPES) {
      const weaker = TROOP_ADVANTAGE[troop];
      expect(troopDamageMultiplier(troop, weaker)).toBe(1.125);
      expect(troopDamageMultiplier(weaker, troop)).toBe(0.875);
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
  it("returns a representative battle report with full logs and speed order", () => {
    const template = TEMPLATES[0];
    if (!template) throw new Error("Missing template");
    const squad = templateToSquad(template, [0, 0, 0]);
    const result = runSimulation(squad, [{ label: "test", squad }], 20);
    const report = result.perOpponent[0]?.report;
    expect(report).toBeDefined();
    expect(report?.units).toHaveLength(6);
    expect(report?.order).toHaveLength(6);
    // 行動順バーは速度の降順
    const speeds = report?.order.map(u => u.speed) ?? [];
    expect([...speeds].sort((x, y) => y - x)).toEqual(speeds);
    expect(report?.logs.some(l => l.turn === 0)).toBe(true); // 合戦開始
    expect(report?.logs.some(l => l.turn >= 1)).toBe(true);
    expect(report?.logs.every(l => l.turn >= 0 && l.turn <= 8)).toBe(true);
    // 各ターン内の行動開始は、その時点の速度順（先攻を除く素の速度では単調とは限らないため、件数のみ確認）
    expect(report?.logs.filter(l => l.kind === "行動開始").length).toBeGreaterThan(0);
    expect(["勝利", "優勢", "引分", "劣勢", "敗北"]).toContain(report?.outcomeLabel);
    expect(report?.allyTotal).toBe(30000);
    expect((report?.allyRemaining ?? 0) + (report?.allyDead ?? 0)).toBe(30000);
  });
  it("has inherent tactic data for every general in the master", () => {
    expect(INHERENT_TACTICS).toHaveLength(145);
    for (const g of GENERALS) {
      const inh = inherentByHolder.get(g.name);
      expect(inh, g.name).toBeDefined();
      expect(inh?.name).toBe(g.inherent);
    }
    expect(inherentByHolder.get("武田信玄")?.name).toBe("風林火山");
    expect(inherentByHolder.get("真田昌幸")?.name).toBe("表裏比興");
  });
  it("fires inherent tactics in simulation and logs them", () => {
    const template = TEMPLATES.find(t => t.label.includes("武田信玄"));
    if (!template) throw new Error("Missing Takeda template");
    const squad = templateToSquad(template, [0, 0, 0]);
    const result = runSimulation(squad, [{ label: "test", squad }], 20);
    const report = result.perOpponent[0]?.report;
    const names = new Set((report?.logs ?? []).map(l => l.tacticName).filter(Boolean));
    expect([...names].some(n => ["風林火山", "表裏比興", "鬼美濃"].includes(n ?? ""))).toBe(true);
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