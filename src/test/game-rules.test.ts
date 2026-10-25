import { describe, expect, it, vi } from "vitest";
import { decodeFormation, emptySquad, encodeFormation, GENERALS, INHERENT_TACTICS, inherentByHolder, normalizeTroop, normSquad, tacticById, TROOP_ADVANTAGE, TROOP_TYPES, troopDamageMultiplier, type Squad } from "@/lib/sengoku-data";
import { parseTactic, runSimulation, TEMPLATES, templateToSquad } from "@/lib/simulator";
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
  it("handles 軍神 tame stacks instead of a permanent damage buff", () => {
    const eff = inherentByHolder.get("上杉謙信")?.effect ?? "";
    const spec = parseTactic("軍神", "受動", "100%", eff, "S", { inherent: true });
    // 「最大時160%上昇」を常時バフとして誤読しない（溜めはスタック機構で処理する）
    expect(spec.dmgBuff).toBe(0);
    expect(spec.dmg).toHaveLength(0);
    // 謙信を大将にすると大将技で毎ターン溜めが貯まるため、戦報に溜め消費が必ず現れる
    const allies: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-上杉謙信", "g-柿崎景家", "g-甘粕景持"] };
    const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
    const result = runSimulation(allies, [{ label: "weak", squad: weak }], 20);
    const logs = result.perOpponent[0]?.report?.logs ?? [];
    expect(logs.some(l => l.actor === "上杉謙信" && l.effects.some(e => e.startsWith("溜め×")))).toBe(true);
  });
  it("implements ranbu splash on normal attacks, excluding gunshin", () => {
    const eff = (holder: string) => inherentByHolder.get(holder)?.effect ?? "";
    expect(parseTactic("七本槍筆頭", "受動", "100%", eff("福島正則"), "S", { inherent: true }).ranbu).toBeCloseTo(0.92);
    expect(parseTactic("掃疑平乱", "能動", "30%", eff("伊達晴宗"), "S", { inherent: true }).ranbu).toBeCloseTo(0.78);
    expect(parseTactic("軍神", "受動", "100%", eff("上杉謙信"), "S", { inherent: true }).ranbu).toBe(0);
    const squad: Squad = { ...emptySquad(), generals: ["g-福島正則", "g-前田利家", "g-加藤清正"] };
    const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
    const result = runSimulation(squad, [{ label: "weak", squad: weak }], 20);
    const logs = result.perOpponent[0]?.report?.logs ?? [];
    expect(logs.some(l => l.tacticName === "乱舞" && l.actor === "福島正則")).toBe(true);
  });
  it("parses generic mechanics from inherent tactic effects", () => {
    const eff = (holder: string) => inherentByHolder.get(holder)?.effect ?? "";
    const kitakawa = parseTactic("相模の獅子", "能動", "45%", eff("北条氏康"), "S", { inherent: true });
    expect(kitakawa.teppeki).toBe(2);
    expect(kitakawa.teppekiChance).toBeCloseTo(0.85);
    const kichiwako = parseTactic("鬼若子", "指揮", "100%", eff("長宗我部元親"), "S", { inherent: true });
    expect(kichiwako.rengeki).toBeCloseTo(0.5);
    expect(kichiwako.upStats).toContainEqual({ idx: 0, amount: 18 });
    const hachiku = parseTactic("破竹の勢い", "受動", "100%", eff("加藤清正"), "S", { inherent: true });
    expect(hachiku.crit).toBeCloseTo(0.7);
    const sanza = parseTactic("攻めの三左", "能動", "45%", eff("森可成"), "S", { inherent: true });
    expect(sanza.dots).toContainEqual({ kind: "潰走", rate: 72, type: "兵刃" });
    const shibata = parseTactic("かかれ柴田", "能動", "50%", eff("柴田勝家"), "S", { inherent: true });
    expect(shibata.cleanse).toBe(2);
    expect(shibata.dmg[0]?.rate).toBe(154);
    const ittetsu = parseTactic("一徹の意志", "能動", "40%", eff("稲葉一鉄"), "S", { inherent: true });
    expect(ittetsu.taunt).toBe(true);
    expect(ittetsu.upStats).toContainEqual({ idx: 0, amount: 150 });
    const keika = parseTactic("警戒周到", "指揮", "100%", eff("三枝昌貞"), "A", { inherent: true });
    expect(keika.takenDown).toBeCloseTo(0.22);
    expect(keika.auraUntil).toBe(3);
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