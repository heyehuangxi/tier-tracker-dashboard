import { describe, expect, it, vi } from "vitest";
import { activeTraitNames, decodeFormation, emptySquad, encodeFormation, GENERALS, INHERENT_TACTICS, inherentByHolder, normalizeTroop, normSquad, portraitUrlForName, tacticById, traitFor, TRAITS, TROOP_ADVANTAGE, TROOP_TYPES, troopDamageMultiplier, type Squad } from "@/lib/sengoku-data";
import { parseTactic, runSimulation, squadTraitEffects, TEMPLATES, templateToSquad } from "@/lib/simulator";
import { candidateKey, generateRandomSquad, outcomeScore, tacticTroopCompatible } from "@/lib/explore";
import { ALL_GENERAL_IDS, ALL_TACTIC_IDS, decodeOwned, encodeOwned, GENERALS as ALL_GENERALS, TACTICS as ALL_TACTICS, MAX_COST } from "@/lib/sengoku-data";
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
  it("implements Date Masamune sui stacks and Honganji Kennyo ikki", () => {
    const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
    const masamune: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-伊達政宗", "g-伊達晴宗", "g-伊達輝宗"] };
    const r1 = runSimulation(masamune, [{ label: "weak", squad: weak }], 20);
    const logs1 = r1.perOpponent[0]?.report?.logs ?? [];
    expect(logs1.some(l => l.effects.includes("粋消費"))).toBe(true);
    expect(logs1.some(l => l.tacticName === "伊達の粋" && (l.damage ?? 0) > 0)).toBe(true);
    const kennyo: Squad = { ...emptySquad(), generals: ["g-本願寺顕如", "g-鈴木佐大夫", "g-雑賀孫市"] };
    const squad2: Squad = GENERALS.some(g => g.id === "g-雑賀孫市") ? kennyo : { ...emptySquad(), generals: ["g-本願寺顕如", "g-鈴木佐大夫", "g-下間頼廉"] };
    const r2 = runSimulation(squad2, [{ label: "weak", squad: weak }], 20);
    const logs2 = r2.perOpponent[0]?.report?.logs ?? [];
    expect(logs2.some(l => l.effects.includes("一揆発動") || l.effects.includes("一揆状態"))).toBe(true);
    expect(logs2.some(l => l.tacticName === "一揆" && (l.damage ?? 0) > 0)).toBe(true);
  });
  it("wires rank traits from the trait dataset into the simulator", () => {
    expect(TRAITS).toHaveLength(165);
    // 全武将の特性（無凸〜5凸）が表記ゆれ吸収込みで全て引ける
    for (const g of GENERALS) for (const name of activeTraitNames(g, 5)) expect(traitFor(name), `${g.name}:${name}`).toBeDefined();
    // 凸数での解放: 上杉謙信は無凸=義の将、3凸で破敵Ⅱ、5凸で馬術Ⅱ
    const kenshin = GENERALS.find(g => g.name === "上杉謙信")!;
    expect(activeTraitNames(kenshin, 0)).toEqual(["義の将"]);
    expect(activeTraitNames(kenshin, 3)).toContain("破敵Ⅱ");
    expect(activeTraitNames(kenshin, 5)).toContain("馬術Ⅱ");
    // 人は城（武田信玄1凸）: 部隊全員の統率が+5%される
    const squad = (r: number): Squad => ({ ...emptySquad(), troop: "騎兵", generals: ["g-武田信玄", "g-馬場信春", "g-山本勘助"], ranks: [r, 0, 0] });
    const at0 = squadTraitEffects(squad(0)), at1 = squadTraitEffects(squad(1));
    for (let i = 0; i < 3; i++) expect((at1[i]?.stats[0] ?? 0)).toBeGreaterThan(at0[i]?.stats[0] ?? 0);
    expect(at1[0]?.traits).toContain("人は城");
    // 三矢家訓（毛利元就1凸）: 3名のメイン属性が全て異なる場合、それぞれ+8
    const mainOf = (id: string) => { const g = GENERALS.find(x => x.id === id)!; return [0, 1, 2].reduce((b, k) => ((g.stats[k] ?? 0) > (g.stats[b] ?? 0) ? k : b), 0); };
    const mori = "g-毛利元就";
    const others = [0, 1, 2].filter(i => i !== mainOf(mori)).map(i => GENERALS.find(g => g.id !== mori && mainOf(g.id) === i)!.id);
    const trio = (r: number): Squad => ({ ...emptySquad(), generals: [mori, others[0]!, others[1]!], ranks: [r, 0, 0] });
    const t0 = squadTraitEffects(trio(0)), t1 = squadTraitEffects(trio(1));
    for (let i = 0; i < 3; i++) { const mi = mainOf(trio(1).generals[i]!); expect((t1[i]?.stats[mi] ?? 0) - (t0[i]?.stats[mi] ?? 0)).toBe(8); }
    // 高凸でもシミュレーションが完走する
    const hi = templateToSquad(TEMPLATES[0]!, [5, 5, 5]);
    expect(runSimulation(hi, [{ label: "x", squad: hi }], 5).perOpponent[0]?.report).toBeDefined();
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
  it("resolves general portrait URLs from the SLGSIM mapping", () => {
    expect(portraitUrlForName("織田信長")).toBe("https://slgsim.com/images/hero/zhitianxinchang.png");
    expect(portraitUrlForName("竹中半兵衛")).toBe("https://slgsim.com/images/hero/zhuzhongbanbingwei.png");
    // マスター表記（瑞溪院）は先方の表記（瑞渓院）に吸収される
    expect(portraitUrlForName("瑞溪院")).toBe("https://slgsim.com/images/hero/ruixiyuan.png");
    // 先方に画像がない武将と未登録の名前は undefined（UIは頭文字アイコンにフォールバック）
    expect(portraitUrlForName("松平信康")).toBeUndefined();
    expect(portraitUrlForName("存在しない武将")).toBeUndefined();
    // マスター武将の大半に写真が引けること
    const covered = GENERALS.filter(g => portraitUrlForName(g.name)).length;
    expect(covered).toBeGreaterThanOrEqual(130);
  });
  it("generates valid random squads for exploration within the cost cap", () => {
    let seed = 42;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const keys = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const q = generateRandomSquad(ALL_GENERALS, ALL_TACTICS, rand);
      expect(q).not.toBeNull();
      if (!q) break;
      const gs = q.generals.filter(Boolean);
      expect(gs).toHaveLength(3);
      expect(new Set(gs).size).toBe(3);
      expect(gs.reduce((a, id) => a + (ALL_GENERALS.find(g => g.id === id)?.cost ?? 99), 0)).toBeLessThanOrEqual(MAX_COST);
      const ts = q.tactics.filter(Boolean);
      expect(ts).toHaveLength(6);
      expect(new Set(ts).size).toBe(6);
      expect(q.ranks).toEqual([0, 0, 0]);
      keys.add(candidateKey(q));
    }
    expect(keys.size).toBeGreaterThan(20); // 毎回ほぼ別編成になること
    const ranked = generateRandomSquad(ALL_GENERALS, ALL_TACTICS, rand, 3);
    expect(ranked?.ranks).toEqual([3, 3, 3]);
    expect(ranked?.alloc?.every(a => a.reduce((x, y) => x + y, 0) === 80)).toBe(true); // 3凸 = 50+30pt
    expect(generateRandomSquad(ALL_GENERALS.slice(0, 2), ALL_TACTICS, rand)).toBeNull();
    expect(outcomeScore([10, 0, 0, 0, 0], 10)).toBe(1);
    expect(outcomeScore([0, 0, 0, 0, 10], 10)).toBe(0);
    expect(outcomeScore([0, 0, 10, 0, 0], 10)).toBe(0.5);
    const anyTactic = ALL_TACTICS[0]!;
    expect(tacticTroopCompatible({ ...anyTactic, troop: "全兵種" }, "騎兵")).toBe(true);
    expect(tacticTroopCompatible({ ...anyTactic, troop: "騎馬" }, "騎兵")).toBe(true);
    expect(tacticTroopCompatible({ ...anyTactic, troop: "弓兵" }, "騎兵")).toBe(false);
  });
  it("provides all-id lists for the owned-by-default holdings initialisation", () => {
    expect(ALL_GENERAL_IDS).toHaveLength(ALL_GENERALS.length);
    expect(new Set(ALL_GENERAL_IDS).size).toBe(ALL_GENERALS.length);
    expect(ALL_TACTIC_IDS).toHaveLength(ALL_TACTICS.length);
    expect(new Set(ALL_TACTIC_IDS).size).toBe(ALL_TACTICS.length);
    expect(ALL_GENERAL_IDS.every(id => ALL_GENERALS.some(g => g.id === id))).toBe(true);
  });
  it("round-trips owned lists through import links", () => {
    const g = [ALL_GENERALS[0]!.id, ALL_GENERALS[5]!.id, ALL_GENERALS[140]!.id];
    const t = [ALL_TACTICS[0]!.id, ALL_TACTICS[120]!.id];
    const decoded = decodeOwned(encodeOwned(g, t));
    expect(decoded?.g).toEqual(g);
    expect(decoded?.t).toEqual(t);
    expect(decodeOwned(encodeOwned([], []))).toEqual({ g: [], t: [] });
    expect(decodeOwned(encodeOwned(ALL_GENERAL_IDS, ALL_TACTIC_IDS))?.g).toHaveLength(ALL_GENERALS.length);
    expect(decodeOwned("garbage")).toBeNull();
    expect(decodeOwned("1AAAA")).toBeNull();
  });
});