import { describe, expect, it, vi } from "vitest";
import { activeTraitNames, applyAlloc, decodeFormation, emptySquad, encodeFormation, GENERALS, INHERENT_TACTICS, inherentByHolder, normalizeTroop, normSquad, pointsFor, portraitUrlForName, tacticById, traitFor, TRAITS, TROOP_ADVANTAGE, TROOP_TYPES, troopDamageMultiplier, troopLevelFor, type Squad } from "@/lib/sengoku-data";
import { parseTactic, RANGE23_P3, rollRange23, runSimulation, squadTraitEffects, TEMPLATES, templateToSquad } from "@/lib/simulator";
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
    expect(TEMPLATES).toHaveLength(16);
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
  it("parses 時は今's shared-rate pick-one damage-over-time states", () => {
    const eff = inherentByHolder.get("明智光秀")?.effect ?? "";
    const spec = parseTactic("時は今", "能動", "70%", eff, "S", { inherent: true });
    // 率は一括表記（ダメージ率56%）。状態は対象ごとに未付与を優先して1種だけ付与され、3ターン持続する
    expect(spec.dotPickOne).toBe(true);
    expect(spec.dots.map(d => d.kind).sort()).toEqual(["水攻め", "消沈", "火傷", "潰走", "中毒"].sort());
    expect(spec.dots.every(d => d.rate === 56)).toBe(true);
    expect(spec.dots.find(d => d.kind === "潰走")?.type).toBe("兵刃");
    expect(spec.duration).toBe(3);
    expect(spec.targets).toBe(2);
  });
  it("rolls '2〜3名' target counts at 65% / 35% per activation (user specification 2026-11-11)", () => {
    const eff = (holder: string) => inherentByHolder.get(holder)?.effect ?? "";
    // 範囲表記の印付け: 敵対象（旋乾転坤・梟雄の計）。基礎値は2のままで、実際の数は発動ごとに抽選する
    const senkan = parseTactic("旋乾転坤", "指揮", "100%", eff("島津貴久"), "S", { inherent: true });
    expect(senkan.targetsRange).toBe(true);
    expect(senkan.targets).toBe(2);
    expect(parseTactic("梟雄の計", "能動", "35%", eff("松永久秀"), "S", { inherent: true }).targetsRange).toBe(true);
    // 回復対象の範囲表記（一心一徳: 自軍複数（2～3名）を回復）
    expect(parseTactic("一心一徳", "受動", "100%", eff("毛利隆元"), "S", { inherent: true }).healRange).toBe(true);
    // 固定数・単体の戦法には印が付かない
    expect(parseTactic("時は今", "能動", "70%", eff("明智光秀"), "S", { inherent: true }).targetsRange).toBe(false);
    expect(RANGE23_P3).toBe(0.35);
    // 分布: シード付き乱数で 3名の割合が 35% の近傍（±3pt）に収まる
    let seed = 42;
    vi.spyOn(Math, "random").mockImplementation(() => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; });
    try {
      const N = 20000; let threes = 0;
      for (let i = 0; i < N; i++) if (rollRange23() === 3) threes++;
      expect(threes / N).toBeGreaterThan(0.32);
      expect(threes / N).toBeLessThan(0.38);
    } finally { vi.restoreAllMocks(); }
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
    expect(TRAITS).toHaveLength(168);
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
    expect(kichiwako.rengeki).toBeCloseTo(0.4); // 2026-11-11のバランス調整で50%→40%（対象は自軍全体に拡大）
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
  it("gates turn-specific tactics to their stated turn instead of firing every turn", () => {
    const shichu = tacticById.get("t-死中求活");
    if (!shichu) throw new Error("Missing tactic");
    const parsed = parseTactic(shichu.name, shichu.kind, shichu.rate, shichu.effect, shichu.grade);
    // 「5ターン目に敵全体へ兵刃ダメージ」は5ターン目（index 4）だけ
    expect(parsed.onceTurn).toBe(4);
    const ichinen = tacticById.get("t-一念乱志");
    if (!ichinen) throw new Error("Missing tactic");
    const parsed2 = parseTactic(ichinen.name, ichinen.kind, ichinen.rate, ichinen.effect, ichinen.grade);
    // 「3ターン目以降」は3ターン目（index 2）から
    expect(parsed2.fromTurn).toBe(2);
  });
  it("keeps Furinkazan squads within a sane win-rate band (flag rotation, not every-turn firing)", () => {
    const opps = TEMPLATES.map((t, i) => ({ label: `T${i + 1}`, squad: templateToSquad(t, [0, 0, 0]) }));
    const takeda = templateToSquad(TEMPLATES[4]!, [0, 0, 0]);
    const r = runSimulation(takeda, opps, 50);
    const winRate = (r.counts[0] ?? 0) / r.total;
    // 修正前は 85.9%（全旗効果が毎ターン同時発動）。旗ローテーションでは過半数を超えない
    expect(winRate).toBeLessThan(0.6);
    expect(winRate).toBeGreaterThan(0.02);
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
  it("keeps the user-supplied activation rates for the 45 tactics filled in on 2026-11-11", () => {
    // 2026-11-11 にユーザーが実ゲームから提供した発動率。マスター編集で「—」へ
    // 逆戻りしたり値が書き換わったりしたらここで落とす。
    const SUPPLIED_RATES: Record<string, string> = {
      "威風凜々": "35%", "陣形崩し": "35%", "奇謀独断": "35%", "金鼓連天": "40%", "剛毅果断": "40%",
      "大智不智": "30%", "五里霧中": "35%", "前後挟撃": "35%", "静動自在": "30%", "離心の計": "35%",
      "自立の志": "40%", "専横専断": "40%", "電光石火": "40%", "金城湯池": "40%", "乗勝追撃": "30%",
      "理非曲直": "35%", "戦意崩壊": "35%", "境目奮戦": "35%", "機に乗ず": "35%", "攻守兼備": "40%",
      "殿軍奮戦": "55%", "先制先登": "35%", "鬼玄蕃": "30%", "先陣の勇": "35%", "岐阜侍従": "35%",
      "甲州流軍学": "35%", "奮戦": "35%", "忠勤励行": "35%", "援護射撃": "40%", "不意打ち": "45%",
      "生死一顧": "50%", "弓調馬服": "40%", "融通自在": "45%", "秋水一色": "35%", "妖怪退治": "35%",
      "闇討ち": "45%", "敵陣攪乱": "35%", "驍勇善戦": "35%", "一六勝負": "40%", "家中整序": "35%",
      "破天の轟": "35%", "一刀両断": "30%", "回山倒海": "35%", "一触即発": "40%", "槍の鈴": "35%",
    };
    expect(Object.keys(SUPPLIED_RATES)).toHaveLength(45);
    for (const [name, rate] of Object.entries(SUPPLIED_RATES)) {
      const t = ALL_TACTICS.find(x => x.name === name);
      expect(t, name).toBeDefined();
      expect(t!.rate, name).toBe(rate);
    }
  });
  it("scopes damage buffs and reductions to the clause's target category", () => {
    const P = (name: string) => { const t = ALL_TACTICS.find(x => x.name === name); const inh = INHERENT_TACTICS.find(x => x.name === name); const src = t ?? inh!; return parseTactic(src.name, src.kind, src.rate, src.effect, "S", { inherent: !t }); };
    // 計略与ダメージ上昇は計略だけに効く（全ダメージに漏れない）
    expect(P("秋水一色").typeBuffs).toContainEqual({ type: "計略", delta: 0.2 });
    expect(P("秋水一色").dmgBuff).toBe(0);
    // 通常攻撃与ダメージ上昇は通常攻撃だけに効く
    expect(P("一力当先").naBuff).toBe(0.5);
    expect(P("一力当先").dmgBuff).toBe(0);
    // 能動戦法与ダメージ上昇・突撃被ダメージ低下はその種別だけに効く
    expect(P("金鼓連天").kindBuffs).toContainEqual({ kind: "能動", delta: 0.48, inherentOnly: false });
    expect(P("金鼓連天").kindTaken).toContainEqual({ kind: "突撃", delta: 0.25 });
    expect(P("金鼓連天").takenDown).toBe(0);
    // 固有能動戦法限定バフ
    expect(P("奇策制勝").kindBuffs).toContainEqual({ kind: "能動", delta: 0.28, inherentOnly: true });
  });
  it("marks reactive (counter) tactics so they never fire proactively, and commander-sniping tactics as leader-targeted", () => {
    const P = (name: string) => { const t = ALL_TACTICS.find(x => x.name === name); const inh = INHERENT_TACTICS.find(x => x.name === name); const src = t ?? inh!; return parseTactic(src.name, src.kind, src.rate, src.effect, "S", { inherent: !t }); };
    for (const n of ["古今独歩", "洞察反撃", "剛毅木訥", "月華鶴影", "百万一心", "耐苦鍛錬"]) expect(P(n).reactive, n).toBe(true);
    expect(P("風林火山").reactive).toBe(false);
    expect(P("離心の計").targetLeader).toBe(true);
    expect(P("闇討ち").targetLeader).toBe(true);
    // 対象数は敵側の範囲表記を優先する（自軍複数を敵の対象数に数えない）
    expect(P("忠勤励行").targets).toBe(1);
    expect(P("比翼連理").targets).toBe(2);
  });
});
describe("Troop level （兵種レベル）", () => {
  const squadWith = (troop: "騎兵" | "足軽" | "鉄砲", generals: (string | null)[], ranks: number[]): Squad => ({ ...emptySquad(), troop, generals, ranks });
  it("sums level traits from all generals and applies the taisho cap bonus", () => {
    // 柿崎景家（素: 騎兵大将 +3・上限+1）+ 柴田勝家（1凸: 馬術Ⅲ +3）+ 佐久間盛政（素: 馬術Ⅱ +2）= 8 / 上限12
    const r = troopLevelFor(squadWith("騎兵", ["g-柿崎景家", "g-柴田勝家", "g-佐久間盛政"], [0, 1, 0]));
    expect(r).toEqual({ troop: "騎兵", level: 8, cap: 12 });
  });
  it("only counts traits unlocked at the general's rank", () => {
    expect(troopLevelFor(squadWith("騎兵", ["g-柴田勝家", null, null], [0, 0, 0])).level).toBe(0);
    expect(troopLevelFor(squadWith("騎兵", ["g-柴田勝家", null, null], [1, 0, 0])).level).toBe(3);
  });
  it("applies multi-troop traits to each listed troop only", () => {
    // 前田慶次（1凸: 馬槍術Ⅱ = 騎兵・足軽 +2）
    expect(troopLevelFor(squadWith("騎兵", ["g-前田慶次", null, null], [1, 0, 0])).level).toBe(2);
    expect(troopLevelFor(squadWith("足軽", ["g-前田慶次", null, null], [1, 0, 0])).level).toBe(2);
    expect(troopLevelFor(squadWith("鉄砲", ["g-前田慶次", null, null], [1, 0, 0])).level).toBe(0);
  });
  it("handles the 『レベルがN増加』 wording （昇り龍）", () => {
    // 伊達政宗（1凸: 昇り龍 = 騎兵・鉄砲レベルが3増加）
    expect(troopLevelFor(squadWith("騎兵", ["g-伊達政宗", null, null], [1, 0, 0])).level).toBe(3);
    expect(troopLevelFor(squadWith("鉄砲", ["g-伊達政宗", null, null], [1, 0, 0])).level).toBe(3);
  });
  it("applies +2% per troop level to all stats in simulation", () => {
    // 柴田勝家（1凸・馬術Ⅲで騎兵Lv3 = +6%）。足軽では対象特性がないため補正なし
    const ash = squadTraitEffects(squadWith("足軽", ["g-柴田勝家", null, null], [1, 0, 0]))[0]!;
    const cav = squadTraitEffects(squadWith("騎兵", ["g-柴田勝家", null, null], [1, 0, 0]))[0]!;
    expect(ash.stats).toEqual([162, 208, 138, 167]);
    expect(cav.stats).toEqual([172, 220, 146, 177]); // 各属性を ×1.06 して四捨五入
  });
  it("adds the facility (barracks) level on top of trait levels, still capped", () => {
    expect(troopLevelFor({ ...emptySquad(), troop: "騎兵", facLv: 6 }).level).toBe(6);
    // 特性8 + 施設6 = 14 だが、大将ありの上限12で止まる
    const r = troopLevelFor({ ...emptySquad(), troop: "騎兵", generals: ["g-柿崎景家", "g-柴田勝家", "g-佐久間盛政"], ranks: [0, 1, 0], facLv: 6 });
    expect(r).toEqual({ troop: "騎兵", level: 12, cap: 12 });
    // 共有リンクの往復でも施設レベルと開始兵力が保持され、範囲外は丸められる
    const rt = decodeFormation(encodeFormation({ mode: "free", squads: [{ ...emptySquad(), facLv: 6, startTroops: 22785 }] }))?.squads[0];
    expect(rt?.facLv).toBe(6);
    expect(rt?.startTroops).toBe(22785);
    expect(normSquad({ generals: [], tactics: [], facLv: 99, startTroops: 99999 }).facLv).toBe(10);
    expect(normSquad({ generals: [], tactics: [], facLv: 99, startTroops: 99999 }).startTroops).toBe(30000);
  });
  it("honors the squad alloc base for free/coexist formations (100) and defaults to 50", () => {
    expect(pointsFor(0)).toBe(50);
    expect(pointsFor(5)).toBe(100);
    expect(pointsFor(0, 100)).toBe(100);
    expect(pointsFor(5, 100)).toBe(150);
    const big = [[40, 30, 20, 10], [0, 0, 0, 0], [0, 0, 0, 0]];
    // 初期値100の部隊では合計100の分配がそのまま残る
    const withBase = normSquad({ ...emptySquad(), alloc: big, allocBase: 100 });
    expect(withBase.alloc?.[0]).toEqual([40, 30, 20, 10]);
    expect(withBase.allocBase).toBe(100);
    // 未指定（従来部隊）は初期値50で丸められる
    const withoutBase = normSquad({ ...emptySquad(), alloc: big });
    expect((withoutBase.alloc?.[0] ?? []).reduce((a, b) => a + b, 0)).toBe(50);
    expect(withoutBase.allocBase).toBeUndefined();
    // 範囲外の初期値は無効として既定50扱い
    expect(normSquad({ ...emptySquad(), allocBase: 99999 }).allocBase).toBeUndefined();
    // 共有リンクの往復でも初期値が保持される
    const rt = decodeFormation(encodeFormation({ mode: "free", squads: [{ ...emptySquad(), alloc: big, allocBase: 100 }] }))?.squads[0];
    expect(rt?.allocBase).toBe(100);
    expect(rt?.alloc?.[0]).toEqual([40, 30, 20, 10]);
  });
  it("uses the squad's starting troops in the battle report totals", () => {
    const squad = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], startTroops: 22785 };
    const result = runSimulation(squad, [{ label: "test", squad: emptySquad() }], 20);
    const report = result.perOpponent[0]?.report;
    expect(report?.allyTotal).toBe(22785);
    expect(report?.enemyTotal).toBe(30000);
    expect((report?.allyRemaining ?? 0) + (report?.allyDead ?? 0)).toBe(22785);
  });
  it("handles 七十二の計 as a counted passive, not an every-turn AoE", () => {
    const parsed = parseTactic("七十二の計", "受動", "-", "奇策50%・奇策ダメージ率30%増加。7回発動後、敵全体に計略ダメージ（60%〜120%）。", "S");
    expect(parsed.kishaku).toBe(0.5); // 奇策+50%はバフとして効く
    // どの代表試行でも、七十二の計のダメージ発生回数は「7回ごとの発動」分だけに限られる（旧仕様は毎ターン全体）
    const t72 = TEMPLATES.find(t => t.members.some(m => m.tactics.includes("七十二の計")));
    const t0 = TEMPLATES[0];
    if (!t72 || !t0) throw new Error("Missing template");
    const s72 = templateToSquad(t72, [0, 0, 0]);
    const s0 = templateToSquad(t0, [0, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const rep = runSimulation(s72, [{ label: "t", squad: s0 }], 20).perOpponent[0]?.report;
      const hits = rep?.logs.filter(l => l.tacticName === "七十二の計" && l.actorSide === "自軍" && (l.damage ?? 0) > 0).length ?? 0;
      expect(hits).toBeLessThanOrEqual(9); // 最大でも 発動3回 × 3名
    }
  });
  it("carries troop and troop level into the battle report and opening log", () => {
    const squad = squadWith("騎兵", ["g-柿崎景家", "g-柴田勝家", "g-佐久間盛政"], [0, 1, 0]);
    const result = runSimulation(squad, [{ label: "test", squad }], 20);
    const report = result.perOpponent[0]?.report;
    expect(report?.allyTroop).toBe("騎兵");
    expect(report?.allyTroopLevel).toBe(8);
    expect(report?.enemyTroopLevel).toBe(8);
    expect(report?.logs.some(l => l.turn === 0 && l.segments.some(s => s.text.includes("騎兵Lv8")))).toBe(true);
  });
});

describe("Reactive healing （反応回復）", () => {
  it("parses Oni-Mino style on-hit healing as a trigger, not a per-turn heal", () => {
    const parsed = parseTactic("鬼美濃", "受動", "100%", "ダメージを受けると、35%の確率で自身の弱体化効果を浄化し、自身の兵力を回復（回復率112%、統率依存）", "S");
    expect(parsed.reactHeal).toEqual({ chance: 0.35, rate: 112, statIdx: 0 });
    expect(parsed.heal).toBe(0);
  });
  it("parses heal target, count and dependency stat from the tactic text", () => {
    const echigo = parseTactic("越後二天", "突撃", "90%", "通常攻撃後、対象に兵刃ダメージ（ダメージ率108%）を与え、さらに40%の確率で1ターン間、無策状態を付与する。目標がすでに無策状態の場合、自身の兵力を回復（回復率78%、武勇依存）。", "S");
    expect(echigo.healSelf).toBe(true);
    expect(echigo.healStatIdx).toBe(1); // 武勇依存
    const kaiten = parseTactic("回天転運", "能動", "40%", "最も兵力損失が多い自軍単体の弱体化効果を2つ浄化し、兵力を回復（130%〜260%）。", "S");
    expect(kaiten.healSelf).toBe(false);
    expect(kaiten.healCount).toBe(1);
    expect(kaiten.healStatIdx).toBe(2); // 無指定は知略
    const all = parseTactic("テスト全体", "能動", "40%", "自軍全体の兵力を回復（回復率96%、知略依存）", "S");
    expect(all.healCount).toBe(3);
    const multi = parseTactic("テスト複数", "能動", "40%", "自軍複数（2名）を回復し（回復率76%、知略依存）", "S");
    expect(multi.healCount).toBe(2);
  });
  it("parses Hizen-no-Kuma style on-hit counter damage as a trigger, not an active nuke", () => {
    const parsed = parseTactic("肥前の熊", "受動", "100%", "3ターン目終了まで、自身の被ダメージが24%低下（統率依存）。自身が兵刃ダメージを受けるたびに、30%の確率（統率依存、戦闘不能の友軍武将が増えるほど低下）で敵軍複数（2名）に兵刃ダメージ（ダメージ率70%、さらに統率依存）", "S");
    expect(parsed.reactDmg).toEqual({ onType: "兵刃", chance: 0.3, type: "兵刃", rate: 70, targets: 2 });
    expect(parsed.dmg).toEqual([]);
  });
  it("parses Engo-Shageki as a guard grant instead of a regular attack", () => {
    const parsed = parseTactic("援護射撃", "能動", "40%", "1ターンの間、友軍単体が30%の回避を獲得。また、対象が初めてダメージを受けた際に自身が攻撃者に兵刃ダメージ（ダメージ率162%、武勇と統率依存）", "S");
    expect(parsed.guardRate).toBe(162);
    expect(parsed.dmg).toEqual([]);
    expect(parsed.reactive).toBe(false);
  });
  it("Fuuji (sealed normal attacks) blocks only normal attacks, not active tactics", () => {
    const foe = { ...emptySquad(), generals: ["g-明智光秀", "g-北条氏康", "g-武田信玄"], tactics: ["t-嚢沙之計", null, null, null, null, null] };
    const withSeal = { ...emptySquad(), generals: ["g-本願寺顕如", "g-長宗我部元親", "g-島津貴久"], tactics: [null, null, "t-一刀両断", "t-気炎万丈", null, null] };
    const noSeal = { ...emptySquad(), generals: ["g-本願寺顕如", "g-長宗我部元親", "g-島津貴久"], tactics: [null, null, "t-一刀両断", null, null, null] };
    const count = (ally: typeof withSeal) => {
      let tactics = 0, nas = 0;
      for (let i = 0; i < 60; i++) {
        const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
        for (const l of rep?.logs ?? []) {
          if (l.actor !== "明智光秀" || l.turn > 3) continue;
          if (l.kind === "戦法") tactics++;
          if (l.kind === "通常攻撃") nas++;
        }
      }
      return { tactics, nas };
    };
    const sealed = count(withSeal), control = count(noSeal);
    expect(sealed.tactics).toBeGreaterThan(control.tactics * 0.6); // 能動は封撃でも止まらない
    expect(sealed.nas).toBeLessThan(control.nas); // 通常攻撃は減る
  });
  it("parses pick-one control tactics", () => {
    const P = (name: string) => { const t = ALL_TACTICS.find(x => x.name === name); const inh = INHERENT_TACTICS.find(x => x.name === name); const src = t ?? inh!; return parseTactic(src.name, src.kind, src.rate, src.effect, "S", { inherent: !t }); };
    expect(P("風姿綽約").ctrlPickOne).toBe(true);
    expect(P("津田流砲術").ctrlPickOne).toBe(true);
    expect(P("罵詈雑言").ctrlPickOne).toBe(false);
  });
  it("Echigo-ryu Gungaku grants no enemy control (its control names are resistances)", () => {
    const squad = { ...emptySquad(), generals: ["g-上杉謙信", "g-真田昌幸", "g-宇佐美定満"] };
    const foe = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"] };
    for (let i = 0; i < 5; i++) {
      const rep = runSimulation(squad, [{ label: "t", squad: foe }], 20).perOpponent[0]?.report;
      expect(rep?.logs.some(l => l.tacticName === "越後流軍学")).toBe(false);
    }
  });
  it("parses Bari-Zougen taunt with its turn limit", () => {
    const parsed = parseTactic("罵詈雑言", "指揮", "100%", "3ターン目まで、敵軍複数に挑発を付与し、自身の通常・突撃被ダメージが25%〜50%低下。", "S");
    expect(parsed.taunt).toBe(true);
    expect(parsed.targets).toBe(2);
    expect(parsed.auraUntil).toBe(2);
  });
  it("taunt draws enemy normal attacks onto the taunt holder", () => {
    const ally = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"] };
    const foe = { ...emptySquad(), generals: ["g-武田信玄", "g-馬場信春", "g-真田昌幸"], tactics: [null, null, "t-罵詈雑言", null, null, null] };
    let onHolder = 0, total = 0;
    for (let i = 0; i < 60; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      for (const l of rep?.logs ?? []) if (l.kind === "通常攻撃" && l.actorSide === "自軍") { total++; if (l.target === "馬場信春") onHolder++; }
    }
    expect(total).toBeGreaterThan(100);
    expect(onHolder / total).toBeGreaterThan(0.45);
  });
  it("Takumokucho's blade hit is dealt by the highest-Wuyou ally, not Yamamoto Kansuke", () => {
    const squad = { ...emptySquad(), generals: ["g-武田信玄", "g-山本勘助", "g-北条氏康"] };
    const foe = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"] };
    let bladeActor = "";
    for (let i = 0; i < 40 && !bladeActor; i++) {
      const rep = runSimulation(squad, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      const hit = rep?.logs.find(l => l.tacticName === "啄木鳥" && (l.damage ?? 0) > 0 && l.actor !== "山本勘助");
      if (hit) bladeActor = hit.actor;
    }
    expect(bladeActor).not.toBe("");
    expect(bladeActor).not.toBe("山本勘助");
  });
  it("Houen no Utsuwa grants +5% Chiryaku to the squad, not its 50% proc chance", () => {
    const sq = { ...emptySquad(), generals: ["g-黒田官兵衛", "g-立花誾千代", "g-北条氏康"] };
    const eff = squadTraitEffects(sq);
    // 黒田官兵衛の素の知略229 → +5% = 240（+50%なら344になる）
    expect(eff[0]?.stats[2]).toBe(240);
    expect(eff[1]?.stats[2]).toBe(143);
  });
  it("template squads use the specified alloc weights and facility level 5", () => {
    const t1 = templateToSquad(TEMPLATES[0]!, [0, 0, 0]);
    expect(t1.facLv).toBe(5);
    expect(t1.alloc).toEqual([[0, 0, 50, 0], [0, 0, 50, 0], [50, 0, 0, 0]]);
    const t5 = templateToSquad(TEMPLATES[4]!, [0, 0, 0]);
    expect(t5.alloc?.[0]).toEqual([0, 20, 30, 0]); // 武田信玄: 武勇4割・知略6割
    expect(t5.alloc?.[1]).toEqual([50, 0, 0, 0]); // 馬場信春: 統率全振り
  });
  it("remaining template alloc weights (Kansuke 3:7, Masamune 5.5:4.5)", () => {
    const t8 = templateToSquad(TEMPLATES[7]!, [0, 0, 0]);
    expect(t8.alloc?.[2]).toEqual([0, 0, 35, 15]); // 山本勘助: 知略35・速度15
    const t11 = templateToSquad(TEMPLATES[10]!, [0, 0, 0]);
    expect(t11.alloc?.[0]?.reduce((a, b) => a + b, 0)).toBe(50); // 伊達政宗
    expect(t11.alloc?.[0]?.[2]).toBeGreaterThan(t11.alloc?.[0]?.[1] ?? 0);
  });
  it("Uesugi cavalry template acts in the order Sadamitsu, Kageie, Kenshin", () => {
    const t16 = TEMPLATES[TEMPLATES.length - 1]!;
    expect(t16.label).toContain("上杉/騎兵");
    const sq = templateToSquad(t16, [0, 0, 0]);
    expect(sq.alloc).toEqual([[0, 44, 0, 6], [0, 50, 0, 0], [0, 0, 11, 39]]);
    const eff = squadTraitEffects(sq);
    expect(eff[2]?.stats[3]).toBeGreaterThan(eff[0]?.stats[3] ?? 0);
    expect(eff[0]?.stats[3]).toBeGreaterThan(eff[1]?.stats[3] ?? 0);
  });
  it("Rikiryoku Doshin heals self plus one ally (自身と友軍単体)", () => {
    const s = parseTactic("戮力同心", "指揮", "100%", "毎ターン17%〜34%の確率で自身と友軍単体の兵力を回復（回復率41%〜82%）。");
    expect(s.healSelf).toBe(true);
    expect(s.healPlusOne).toBe(true);
    expect(s.heal).toBe(82);
  });
  it("troop-evolution （兵種） auras apply at battle start (Echigo Senshugumi speed)", () => {
    const withT = { ...emptySquad(), generals: ["g-上杉謙信", "g-真田昌幸", "g-宇佐美定満"], tactics: ["t-死中求活", "t-越後先手組", null, null, null, null] };
    const without = { ...emptySquad(), generals: ["g-上杉謙信", "g-真田昌幸", "g-宇佐美定満"], tactics: ["t-死中求活", null, null, null, null, null] };
    const a = squadTraitEffects(withT); const b = squadTraitEffects(without);
    for (let i = 0; i < 3; i++) expect((a[i]?.stats[3] ?? 0) - (b[i]?.stats[3] ?? 0)).toBe(24);
  });
  it("Honda Tadakatsu deals much more with Joshou Tsuigeki chained off his Kokondoppo counters", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"] };
    const mk = (rush: boolean) => ({ ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", rush ? "t-乗勝追撃" : null, "t-威風凛々", "t-所領役帳", "t-荷駄崩し"] });
    const avgDealt = (foe: ReturnType<typeof mk>) => {
      let sum = 0; const N = 40;
      for (let i = 0; i < N; i++) {
        const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
        sum += rep?.units.find(u => u.name === "本多忠勝")?.dealt ?? 0;
      }
      return sum / N;
    };
    expect(avgDealt(mk(true))).toBeGreaterThan(avgDealt(mk(false)) * 1.3);
  });
  it("heals Baba Nobuharu through his inherent Oni-Mino when he is hit", () => {
    const squad = { ...emptySquad(), generals: ["g-馬場信春", "g-山本勘助", "g-武田信玄"] };
    const foe = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"] };
    let total = 0;
    for (let i = 0; i < 5; i++) {
      const rep = runSimulation(squad, [{ label: "t", squad: foe }], 20).perOpponent[0]?.report;
      total += rep?.logs.filter(l => l.tacticName === "鬼美濃").reduce((s, l) => s + (l.heal ?? 0), 0) ?? 0;
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe("2026-11-10 parse fixes （援護・一領具足・千成瓢箪・嚢沙之計ほか）", () => {
  it("parses 千成瓢箪 as a 76% heal of 2 allies with a 35% all-ally chance (not an inner proc gate)", () => {
    const s = parseTactic("千成瓢箪", "指揮", "100%", "毎ターン自軍複数（2名）を回復し（回復率76%、知略依存）、35%の確率で自軍全体を回復", "S", { inherent: true });
    expect(s.heal).toBe(76);
    expect(s.healCount).toBe(2);
    expect(s.healAllChance).toBeCloseTo(0.35);
    expect(s.inner).toBe(1);
  });
  it("千成瓢箪 actually heals in battle", () => {
    const ally = { ...emptySquad(), generals: ["g-豊臣秀吉", "g-黒田官兵衛", "g-ねね"] };
    const foe = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"] };
    let healed = 0;
    for (let i = 0; i < 30; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      healed += rep?.logs.filter(l => l.tacticName === "千成瓢箪").reduce((s2, l) => s2 + (l.heal ?? 0), 0) ?? 0;
    }
    expect(healed).toBeGreaterThan(0);
  });
  it("parses 嚢沙之計's ranged water DoT at max rate and its 計略被ダメージ上昇 grant", () => {
    const s = parseTactic("嚢沙之計", "能動", "30%", "2ターンの間、敵軍複数に水攻め（毎ターン51%〜102%）と計略被ダメージ15%〜30%上昇を付与。", "S");
    expect(s.dots).toEqual([{ kind: "水攻め", rate: 102, type: "計略" }]);
    expect(s.grantTaken).toEqual([{ type: "計略", delta: 0.3 }]);
    expect(s.duration).toBe(2);
  });
  it("parses 戦意崩壊's stat drop and its 鉄壁 for the squad leader", () => {
    const s = parseTactic("戦意崩壊", "突撃", "—", "通常攻撃後、対象の統率・知略を65低下させ、自軍大将に鉄壁を2回付与。", "S");
    expect(s.downStats).toEqual([{ idx: 0, amount: 65 }, { idx: 2, amount: 65 }]);
    expect(s.teppeki).toBe(2);
    expect(s.teppekiToLeader).toBe(true);
  });
  it("parses 一上一下's self active-rate bonus at the range maximum", () => {
    expect(parseTactic("一上一下", "受動", "100%", "戦闘中、自身の能動戦法発動率が6%〜12%増加。", "A").actSelf).toBeCloseTo(0.12);
    expect(parseTactic("一上一下", "受動", "100%", "戦闘中、自身の能動戦法の発動確率が12%増加", "S", { inherent: true }).actSelf).toBeCloseTo(0.12);
  });
  it("parses 一領具足's early-turn damage reduction and 備兵 flag", () => {
    const s = parseTactic("一領具足", "指揮", "100%", "最初の2ターン、自軍全体の兵力損害を6%〜12%軽減＋3〜4ターン目に備兵を獲得。", "S");
    expect(s.earlyTaken).toEqual({ delta: 0.12, turns: 2, statIdx: 1 }); // 軽減は武勇依存（statIdx 1＝武勇でスケーリング）
    expect(s.bihei).toBe(true);
  });
  it("一領具足 grants 備兵 during battle (turns 3-4)", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"] };
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-一領具足", "t-三河武士", "t-乗勝追撃", "t-理非曲直", "t-荷駄崩し", "t-帰還の凱歌"], ranks: [2, 1, 1], facLv: 5 };
    let grants = 0;
    for (let i = 0; i < 30; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      grants += rep?.logs.filter(l => l.tacticName === "一領具足" && l.effects.includes("備兵")).length ?? 0;
    }
    expect(grants).toBeGreaterThan(0);
  });
  it("parses 文武両道's stacking stat buff (per master text: 計略→武勇, 兵刃→知略)", () => {
    const s = parseTactic("文武両道", "受動", "100%", "計略ダメージで武勇が、兵刃ダメージで知略が毎回30増加（最大5回）", "S");
    expect(s.dmgStack).toEqual({ per: 30, max: 5 });
  });
  it("文武両道 raises its holder's damage output over a battle", () => {
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"] };
    const mkSq = (bunbu: boolean) => ({ ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", null, bunbu ? "t-文武両道" : null, "t-乱世の華", "t-乗勝追撃", "t-一力当先"] });
    const avgDealt = (sq: ReturnType<typeof mkSq>) => {
      let sum = 0; const N = 60;
      for (let i = 0; i < N; i++) {
        const rep = runSimulation(sq, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
        sum += rep?.units.find(u => u.name === "武田信玄")?.dealt ?? 0;
      }
      return sum / N;
    };
    expect(avgDealt(mkSq(true))).toBeGreaterThan(avgDealt(mkSq(false)) * 1.05);
  });
  it("parses 越後流軍学's +20% self active rate through the generic actSelf path", () => {
    const s = parseTactic("越後流軍学", "指揮", "100%", "戦闘中、自身の能動戦法の発動率が20%上昇。能動戦法発動時、50%（知略依存）の確率で自軍全体に封撃、無策、威圧、疲弊のいずれかに対する耐性を付与（2ターン持続。未獲得耐性を優先）", "S", { inherent: true });
    expect(s.actSelf).toBeCloseTo(0.2);
  });
  it("三河魂's 援護 makes the highest-武勇 ally cover normal attacks aimed at the leader", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"] };
    const covers: { actor: string; target: string | undefined }[] = [];
    for (let i = 0; i < 40; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      for (const l of rep?.logs ?? []) if (l.effects.includes("援護")) covers.push({ actor: l.actor, target: l.target });
    }
    expect(covers.length).toBeGreaterThan(0);
    for (const c of covers) { expect(["本多忠勝", "本多正信"]).toContain(c.actor); expect(c.target).toBe("徳川家康"); }
    // 武勇が最も高い忠勝が生存している間は彼が肩代わりするため、忠勝のカバーが過半を占める
    expect(covers.filter(c => c.actor === "本多忠勝").length).toBeGreaterThan(covers.length / 2);
  });
  it("no 援護 is granted when the 三河魂 holder is not the leader", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-本多忠勝", "g-徳川家康", "g-本多正信"], tactics: ["t-乗勝追撃", "t-威風凜々", "t-戮力同心", "t-三河武士", "t-所領役帳", "t-荷駄崩し"] };
    let covers = 0;
    for (let i = 0; i < 40; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      covers += rep?.logs.filter(l => l.effects.includes("援護")).length ?? 0;
    }
    expect(covers).toBe(0);
  });
  it("会盟の陣 raises the leader's active firing rate when all three factions differ", () => {
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"] };
    const mkSq = (kaimei: boolean) => ({ ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", kaimei ? "t-会盟の陣" : null, null, null, null, null], ranks: [0, 1, 0] });
    const countFirings = (sq: ReturnType<typeof mkSq>) => {
      let n = 0;
      for (let i = 0; i < 150; i++) {
        const rep = runSimulation(sq, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
        n += rep?.logs.filter(l => l.tacticName === "相模の獅子").length ?? 0;
      }
      return n;
    };
    expect(countFirings(mkSq(true))).toBeGreaterThan(countFirings(mkSq(false)) * 1.12);
  });
  it("会盟の陣's 副将強化 buffs both adjutants every turn (turn 1: equal troops, earlier slot counts as higher)", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"] };
    const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
    const t1 = (rep?.logs ?? []).filter(l => l.turn === 1 && l.tacticName === "会盟の陣" && l.effects.includes("副将強化"));
    expect(t1.length).toBe(2);
    // 開始時は両副将とも同兵力 → スロット順で先の信玄が高兵力扱い、甲斐が低兵力扱い。大将は対象外
    expect(t1.find(l => l.actor === "武田信玄")?.effects).toContain("兵力高");
    expect(t1.find(l => l.actor === "成田甲斐")?.effects).toContain("兵力低");
    expect(t1.some(l => l.actor === "北条氏康")).toBe(false);
  });
  it("会盟の陣's 副将強化 is re-evaluated each turn from current troops (ranking can swap mid-battle)", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"], ranks: [2, 1, 1], facLv: 5, startTroops: 21697 };
    let kaiHigh = 0, kaiLow = 0, bothSameTag = 0, total = 0;
    for (let i = 0; i < 60; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      const byTurn = new Map<number, { actor: string; tag: string }[]>();
      for (const l of rep?.logs ?? []) {
        if (l.tacticName !== "会盟の陣" || !l.effects.includes("副将強化")) continue;
        const tag = l.effects.includes("兵力高") ? "高" : "低";
        const arr = byTurn.get(l.turn) ?? []; arr.push({ actor: l.actor, tag }); byTurn.set(l.turn, arr);
        if (l.turn >= 2 && l.actor === "成田甲斐") { total++; if (tag === "高") kaiHigh++; else kaiLow++; }
      }
      for (const arr of byTurn.values()) if (arr.length === 2 && arr[0]?.tag === arr[1]?.tag) bothSameTag++;
    }
    expect(bothSameTag).toBe(0); // 同じターンに両副将へ同じ区分は付かない
    expect(kaiHigh).toBeGreaterThan(0); // 甲斐が兵力高になるターンが実在する＝毎ターン再評価されている
    expect(kaiLow).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(20);
  });
  it("会盟の陣's 副将強化 is not granted when two members share a faction", () => {
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"] };
    // 氏康と綱成が同じ北条勢力 → 全員異勢力の条件を満たさない
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-北条綱成"], tactics: ["t-回天転運", "t-会盟の陣", null, null, null, null], ranks: [0, 1, 0] };
    let grants = 0;
    for (let i = 0; i < 30; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      grants += rep?.logs.filter(l => l.tacticName === "会盟の陣" && l.effects.includes("副将強化")).length ?? 0;
    }
    expect(grants).toBe(0);
  });
});

describe("2026-11-10 追加修正2（三河武士「不屈」・一領具足の武勇依存）", () => {
  it("parses 三河武士's 不屈 flag and its squad 統率 aura", () => {
    const s = parseTactic("三河武士", "兵種", "100%", "足軽が進化。自軍全体の統率が8〜16増加。攻撃受領時に不屈発動・回復。", "S");
    expect(s.fukutsu).toBe(true);
    expect(s.upStats).toEqual([{ idx: 0, amount: 16 }]);
    expect(s.upAll).toBe(true);
  });
  it("三河武士's 統率 aura is scaled by Ieyasu's own 統率 when he equips it (全文の家康装備時スケーリング)", () => {
    const mkSq = (holderIsIeyasu: boolean) => ({
      ...emptySquad(), troop: "足軽" as const,
      generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"],
      tactics: holderIsIeyasu
        ? ["t-三河武士", "t-戮力同心", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"]
        : ["t-戮力同心", "t-一領具足", "t-三河武士", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"],
      ranks: [0, 0, 0], facLv: 0,
    });
    const tongOf = (sq: ReturnType<typeof mkSq>, name: string) => squadTraitEffects(sq).find(x => x.name === name)?.stats[0] ?? 0;
    // 家康の統率231 → 16×(1+231/1000)≈19.7→+20。他武将が持てば平坦+16。差は正信の統率でちょうど4になる
    expect(tongOf(mkSq(true), "本多正信") - tongOf(mkSq(false), "本多正信")).toBe(4);
  });
  it("不屈 fires at the start of the next turn (never on turn 1), at most 4 times, and the 4th activation deals damage instead of healing", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const foe = { ...emptySquad(), troop: "足軽" as const, generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"], tactics: ["t-戮力同心", "t-三河武士", "t-乗勝追撃", "t-威風凜々", "t-所領役帳", "t-荷駄崩し"] };
    let totalActs = 0, damageActs = 0, healEvents = 0;
    for (let i = 0; i < 40; i++) {
      const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
      const acts = (rep?.logs ?? []).filter(l => l.tacticName === "三河武士" && l.effects.includes("不屈"));
      expect(acts.length).toBeLessThanOrEqual(4); // 打ち止め: 1戦で最大4回
      expect(acts.filter(l => !l.effects.includes("ダメージ")).length).toBeLessThanOrEqual(3); // 回復は最大3回（4回目はダメージ）
      for (const a of acts) {
        expect(a.turn).toBeGreaterThanOrEqual(2); // 閾値到達の翌ターン開始時に発動するので、1ターン目には出ない
        totalActs++;
        if (a.effects.includes("ダメージ")) damageActs++;
      }
      healEvents += (rep?.logs ?? []).filter(l => l.tacticName === "不屈" && (l.heal ?? 0) > 0).length;
    }
    expect(totalActs).toBeGreaterThan(40); // ほぼ毎戦発動する
    expect(healEvents).toBeGreaterThan(0); // 実際に自軍全体が回復している
    expect(damageActs).toBeGreaterThan(0); // 4回目のダメージ化が起きる戦闘がある
  });
  it("一領具足's damage reduction scales with the holder's 武勇 (deterministic first-hit comparison)", () => {
    const ally = { ...emptySquad(), troop: "騎兵" as const, generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    // 所持者は正信で固定し、武勇への能力配分だけを変える（他の条件は完全同一）。
    // 武勇43 → 軽減 12%×1.043≈12.5%、武勇143（+100配分）→ 12%×1.143≈13.7%
    const mkFoe = (buyuAlloc: number) => ({
      ...emptySquad(), troop: "足軽" as const,
      generals: ["g-徳川家康", "g-本多忠勝", "g-本多正信"],
      tactics: ["t-三河武士", "t-戮力同心", "t-乗勝追撃", "t-威風凜々", "t-一領具足", "t-荷駄崩し"],
      ranks: [0, 0, 5],
      alloc: [[0, 0, 0, 0], [0, 0, 0, 0], [0, buyuAlloc, 0, 0]],
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.6);
    try {
      const firstHit = (foe: ReturnType<typeof mkFoe>) => {
        const rep = runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report;
        return rep?.logs.find(l => (l.damage ?? 0) > 0 && l.targetSide === "敵軍");
      };
      const hi = firstHit(mkFoe(100)); // 武勇が高い所持者 → 軽減が大きい → 最初の被ダメージが小さい
      const lo = firstHit(mkFoe(0));
      expect(hi?.target).toBe(lo?.target); // 乱数固定なので最初の一撃の対象・条件は同一
      expect(hi?.damage ?? 0).toBeLessThan(lo?.damage ?? 0);
    } finally { random.mockRestore(); }
  });
});

describe("2026-11-11 fix wave (audit-driven parse fixes)", () => {
  const P = (name: string) => { const t = ALL_TACTICS.find(x => x.name === name); const inh = INHERENT_TACTICS.find(x => x.name === name); const src = t ?? inh!; return parseTactic(src.name, src.kind, src.rate, src.effect, "S", { inherent: !t }); };
  const PI = (name: string) => { const inh = INHERENT_TACTICS.find(x => x.name === name)!; return parseTactic(inh.name, inh.kind, inh.rate, inh.effect, "S", { inherent: true }); };
  const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
  const reports = (ally: Squad, foe: Squad, n: number) => Array.from({ length: n }, () => runSimulation(ally, [{ label: "t", squad: foe }], 1).perOpponent[0]?.report).filter(Boolean);

  it("一力当先: 乱舞 is a 70% splash rate, not a probability (naBuff stays 50%)", () => {
    const s = P("一力当先");
    expect(s.ranbu).toBeCloseTo(0.7);
    expect(s.naBuff).toBe(0.5);
    expect(P("七本槍筆頭").ranbu).toBeCloseTo(0.92);
  });
  it("一力当先: normal attacks splash the target's squadmates in battle", () => {
    const ally: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const logs = reports(ally, weak, 30).flatMap(r => r!.logs);
    expect(logs.some(l => l.tacticName === "乱舞" && l.actor === "成田甲斐" && (l.damage ?? 0) > 0)).toBe(true);
  });
  it("回天転運: 「2つ浄化」now parses and the cleanse fires in battle", () => {
    expect(P("回天転運").cleanse).toBe(2);
    const ally: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"], ranks: [0, 1, 0] };
    const logs = reports(ally, weak, 30).flatMap(r => r!.logs);
    expect(logs.some(l => l.tacticName === "回天転運" && l.effects.includes("浄化"))).toBe(true);
  });
  it("離反・心攻: 数値先行記法を優先し、句を跨いだ誤読をしない", () => {
    expect(P("信義貫徹").grant.離反).toBe(15); // was 156 (clause-crossing)
    expect(PI("鬼玄蕃").grant.離反).toBe(18); // was 118 (damage rate)
    expect(P("勇志不抜").grant.離反).toBe(24); // was 50 (fallback)
    expect(P("末世の道者").grant.心攻).toBe(14); // was 10 (武勇低下の数値)
    expect(P("積水成淵").grant.心攻).toBe(22);
    expect(P("尼御台").grant).toEqual({ 離反: 24, 心攻: 24 });
  });
  it("休養・回生: 後方の回復率を読む。一心一徳は直接回復も潰れない", () => {
    expect(PI("非常の器").grant.休養).toBe(66);
    expect(P("懐柔").grant.休養).toBe(88);
    const isshin = P("一心一徳");
    expect(isshin.grant.休養).toBe(76);
    expect(isshin.heal).toBe(60);
    expect(P("股肱之臣").grant.回生).toBe(54);
  });
  it("会心: 範囲記法（A%〜B%）を最大値で読む", () => {
    expect(P("勇猛無比").crit).toBeCloseTo(0.25);
    expect(P("血戦奮闘").crit).toBeCloseTo(0.4);
    expect(P("赤備え隊").crit).toBeCloseTo(0.35);
    expect(P("驍勇善戦").crit).toBeCloseTo(0.4);
    expect(P("雷神切り").crit).toBeCloseTo(0.5);
  });
  it("連撃: 「連撃（70%）」「連撃を付与」を読む。自己反動は selfDmgDown に分離", () => {
    expect(P("全力戦闘").rengeki).toBeCloseTo(0.7);
    const funsen = P("奮戦");
    expect(funsen.rengeki).toBe(1);
    expect(funsen.selfDmgDown).toBeCloseTo(0.15);
    expect(funsen.dmgDown).toBe(0);
    const gyomoku = P("魚目混珠");
    expect(gyomoku.selfDmgDown).toBeCloseTo(0.5);
    expect(gyomoku.dmgDown).toBe(0);
  });
  it("与ダメージ低下: が型・範囲型を読む。種別限定（突撃戦法）は汎用に漏らさない", () => {
    expect(P("離心の計").dmgDown).toBeCloseTo(0.5);
    expect(P("鉄砲猛撃").dmgDown).toBeCloseTo(0.12);
    expect(PI("無刀取り").dmgDown).toBeCloseTo(0.15);
    expect(PI("楼岸一番").dmgDown).toBeCloseTo(0.3);
    expect(PI("剛の武者").dmgDown).toBeCloseTo(0.9);
    expect(PI("傲岸不遜").dmgDown).toBe(0); // 「突撃戦法与ダメージが30%低下」は種別限定のため対象外
  });
  it("種別が武勇・知略の高い方で決まるダメージ（flexDmg）", () => {
    expect(PI("楼岸一番").flexDmg).toBe(188);
    expect(P("捨て身の采配").flexDmg).toBe(156);
    expect(P("捨て身の采配").dmg).toEqual([]);
  });
  it("回復: 「回復する（回復率N%）」型と総回復率を読む", () => {
    expect(PI("一舟軒").heal).toBe(152);
    expect(P("剛毅木訥").heal).toBe(86);
    expect(P("疾風迅雷").heal).toBe(96);
    expect(PI("無刀取り").heal).toBe(128);
    expect(PI("懐刀の謀臣").heal).toBe(138);
    expect(PI("先陣鼓舞").dmg).toEqual([{ type: "兵刃", rate: 242 }]); // 「ダメージ （」の空白
  });
  it("継続ダメージ: 持続ダメージ型・括弧内範囲型・消滅・並記を読む", () => {
    expect(P("紅蓮の炎").dots).toEqual([{ kind: "火傷", rate: 74, type: "計略" }]);
    expect(P("破天の轟").dots).toEqual([{ kind: "火傷", rate: 105, type: "計略" }]);
    expect(P("大智不智").dots).toEqual([{ kind: "消沈", rate: 104, type: "計略" }]); // 状態名はゲーム内全文で「消沈」（2026-11-11 スクリーンショットで確定。旧マスターの「消滅」は誤記）
    expect(P("積水成淵").dots).toEqual([{ kind: "水攻め", rate: 88, type: "計略" }]); // 全角％
    expect(PI("梟雄の計").dots).toEqual(expect.arrayContaining([{ kind: "中毒", rate: 96, type: "計略" }, { kind: "火傷", rate: 96, type: "計略" }]));
  });
  it("持続ターン: 準備ターンを拾わない。回復不可は healCut=1 として読む", () => {
    expect(P("五里霧中").duration).toBe(2);
    expect(P("水攻干計").duration).toBe(2);
    expect(P("水攻干計").healCut).toBe(1);
    expect(P("陣形崩し").duration).toBe(2);
    expect(PI("笹の才蔵").duration).toBe(3);
    expect(PI("笹の才蔵").healCut).toBe(1);
    expect(P("不意打ち").duration).toBe(2);
  });
  it("ステータス増減: 範囲型の低下・素の範囲増加・を増加を読む", () => {
    expect(P("機に乗ず").downStats).toEqual([{ idx: 1, amount: 140 }, { idx: 2, amount: 140 }]);
    expect(P("母衣武者").upStats).toEqual([{ idx: 3, amount: 20 }]);
    // 監査の偽陽性ガード: 範囲固定値は以前から正しく読めていた
    expect(P("三河武士").upStats).toEqual([{ idx: 0, amount: 16 }]);
    expect(P("戦意崩壊").downStats).toEqual([{ idx: 0, amount: 65 }, { idx: 2, amount: 65 }]);
    expect(PI("一触即発").downStats).toEqual([{ idx: 0, amount: 140 }]);
  });
  it("発動率バフ: 突撃版・固有能動限定版・友軍単体・大将分を読む", () => {
    expect(P("独立独歩").actSelfRush).toBeCloseTo(0.17);
    expect(P("一行三昧").actSelf).toBeCloseTo(0.14); // マスター表記「能動戦」（法なし）
    expect(P("疑心暗鬼").actSelfInherent).toBeCloseTo(0.12);
    expect(P("融通自在").actAlly).toEqual({ delta: 0.12, inherentOnly: false });
    expect(PI("仏の高力").actAlly).toEqual({ delta: 0.09, inherentOnly: false });
    expect(PI("先陣鼓舞").actAlly).toEqual({ delta: 0.16, inherentOnly: true });
    expect(PI("松柏之操").actLeader).toBeCloseTo(0.15);
  });
  it("制御の付与確率: 文面の確率を読む（気炎万丈85%）。括弧内の持続抽選は読まない", () => {
    expect(P("気炎万丈").ctrlChance).toBeCloseTo(0.85);
    expect(PI("不意打ち").ctrlChance).toBe(1); // ゲーム内全文で確定: 付与に独立した確率はなく発動確率45%が関門。65%は「2ターンの間」の持続抽選（2026-11-11 スクリーンショット）
    expect(PI("地黄八幡").ctrlChance).toBeCloseTo(0.36);
  });
  it("戦意消沈: 「1ターン目と3ターン目」を列挙として読み、両ターンに発動する", () => {
    expect(P("戦意消沈").onceTurns).toEqual([0, 2]);
    const ally: Squad = { ...emptySquad(), generals: ["g-三好実休", "g-武田信玄", "g-北条氏康"], tactics: ["t-戦意消沈", null, null, null, null, null] };
    const logs = reports(ally, weak, 40).flatMap(r => r!.logs).filter(l => l.tacticName === "戦意消沈");
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every(l => l.turn === 1 || l.turn === 3)).toBe(true);
    expect(logs.some(l => l.turn === 1 && l.effects.includes("疲弊"))).toBe(true);
  });
  it("反応ダメージ: 通常攻撃への反撃（ダメージ率N%）を読む", () => {
    expect(PI("不屈の精神").reactDmg).toEqual({ onType: "兵刃", chance: 1, type: "兵刃", rate: 148, targets: 1, naOnly: true });
    expect(PI("腹中鱗甲").reactDmg?.rate).toBe(52);
    expect(P("大太刀力士隊").reactDmg?.rate).toBe(100);
  });
  it("三方挟撃: 発動率40%・速度-60・次ターン開始時の味方一斉攻撃174%", () => {
    const s = P("三方挟撃");
    expect(s.prob).toBeCloseTo(0.4);
    expect(s.dmg).toEqual([]);
    expect(s.flexDmg).toBe(0);
    expect(s.allyStrike).toBeCloseTo(1.74);
    expect(s.downStats).toEqual([{ idx: 3, amount: 60 }]);
    expect(s.duration).toBe(1);
    const ally: Squad = { ...emptySquad(), troop: "足軽", generals: ["g-武田信玄", "g-馬場信春", "g-山本勘助"], tactics: [null, null, "t-三方挟撃", null, null, null] };
    const logs = reports(ally, weak, 40).flatMap(r => r!.logs);
    // 一斉攻撃は信春以外の味方が担い手になる
    expect(logs.some(l => l.tacticName === "三方挟撃" && l.actor !== "馬場信春" && (l.damage ?? 0) > 0)).toBe(true);
  });
  it("新規武将4名: マスター登録・能力（Wiki Lv50を四捨五入）・特性解決・編成可能", () => {
    expect(GENERALS).toHaveLength(145);
    const byName = (n: string) => GENERALS.find(g => g.name === n)!;
    expect(byName("お江")).toMatchObject({ faction: "徳川", cost: 6, inherent: "風姿綽約" });
    expect(byName("お江").stats).toEqual([154, 65, 169, 71]);
    expect(byName("お初")).toMatchObject({ faction: "豊臣", cost: 6, inherent: "同気連枝" });
    expect(byName("お初").stats).toEqual([143, 63, 171, 68]);
    expect(byName("柳生宗厳")).toMatchObject({ faction: "徳川", cost: 7, inherent: "無刀取り" });
    expect(byName("柳生宗厳").stats).toEqual([134, 205, 127, 147]);
    expect(byName("上泉信綱")).toMatchObject({ faction: "上杉", cost: 7, inherent: "まろばし" });
    expect(byName("上泉信綱").stats).toEqual([133, 219, 140, 122]);
    for (const n of ["剣豪", "無形の位", "懸待表裡", "花枝招展", "手足之愛"]) expect(traitFor(n), n).toBeDefined();
    expect(activeTraitNames(byName("お初"), 5)).toEqual(expect.arrayContaining(["手足之愛", "弓槍術Ⅱ", "攻勢Ⅱ"]));
    expect(activeTraitNames(byName("上泉信綱"), 5)).toContain("血気Ⅰ");
    expect(normSquad({ ...emptySquad(), generals: ["g-お初", "g-お江", "g-上泉信綱"] }).generals).toEqual(["g-お初", "g-お江", "g-上泉信綱"]);
  });
});

describe("2026-11-11 screenshot wave （全文スクリーンショット: 竜騎兵・奇策制勝・所領役帳・鉄砲僧兵・持続修正）", () => {
  const P = (name: string) => { const t = ALL_TACTICS.find(x => x.name === name); const inh = INHERENT_TACTICS.find(x => x.name === name); const src = t ?? inh!; return parseTactic(src.name, src.kind, src.rate, src.effect, "S", { inherent: !t }); };
  const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };

  it("5凸特性名: お江・お初=知恵Ⅱ、柳生宗厳=武威Ⅰ（特性マスターに実在する）", () => {
    const byName = (n: string) => GENERALS.find(g => g.name === n)!;
    expect(activeTraitNames(byName("お江"), 5)).toContain("知恵Ⅱ");
    expect(activeTraitNames(byName("お初"), 5)).toContain("知恵Ⅱ");
    expect(activeTraitNames(byName("柳生宗厳"), 5)).toContain("武威Ⅰ");
    expect(traitFor("知恵Ⅱ")).toBeDefined();
    expect(traitFor("武威Ⅰ")).toBeDefined();
  });

  it("全文パース: 竜騎兵は専用フラグ、奇策制勝は心攻+4%/最大4重ね、所領役帳は回生66%・確率50%", () => {
    expect(P("竜騎兵").ryukihei).toBe(true);
    expect(P("一刀両断").ryukihei).toBe(false);
    const kisaku = P("奇策制勝");
    expect(kisaku.grant.心攻).toBe(4); // 旧フォールバックの固定20ではない
    expect(kisaku.kindBuffs).toContainEqual({ kind: "能動", delta: 0.28, inherentOnly: true });
    const shoryo = P("所領役帳");
    expect(shoryo.heal).toBe(212);
    expect(shoryo.grant.回生).toBe(66);
    expect(shoryo.rebirthChance).toBeCloseTo(0.5);
    const sohei = P("鉄砲僧兵");
    expect(sohei.grant.休養).toBe(48); // 旧フォールバック50ではない
    expect(sohei.upAll).toBe(true); // 「自軍全体の統率と知略」全文どおり部隊全体
    expect(sohei.upStats).toEqual(expect.arrayContaining([{ idx: 0, amount: 12 }, { idx: 2, amount: 12 }]));
  });

  it("全文パース: 持続・確率・ステータス修正（瞬息万変/沈魚落雁/先陣の勇/不意打ち/破天の轟/大智不智）", () => {
    expect(P("瞬息万変").duration).toBe(1); // 混乱1ターン（旧デフォルト2は誤り）
    expect(P("瞬息万変").dmg).toEqual([{ type: "計略", rate: 162 }]);
    const chingyo = P("沈魚落雁");
    expect(chingyo.duration).toBe(1);
    expect(chingyo.ctrlChance).toBeCloseTo(0.36);
    expect(chingyo.ctrlPickOne).toBe(true);
    expect(chingyo.reactive).toBe(true);
    const senjin = P("先陣の勇");
    expect(senjin.duration).toBe(1); // 威圧1ターン
    expect(senjin.ctrlChance).toBeCloseTo(0.35);
    expect(senjin.upStats).toEqual([{ idx: 3, amount: 20 }]); // 自身の速度+20
    const fuiuchi = P("不意打ち");
    expect(fuiuchi.ctrlChance).toBe(1); // 付与に独立確率はなく発動率45%が関門
    expect(fuiuchi.durRoll).toBe(true); // 持続は35%で1ターン・65%で2ターン
    expect(fuiuchi.prepTurns).toBe(1);
    expect(fuiuchi.ctrlPickOne).toBe(true);
    const haten = P("破天の轟");
    expect(haten.downStats).toEqual([{ idx: 0, amount: 20 }]); // 統率-20
    expect(haten.dots).toEqual([{ kind: "火傷", rate: 105, type: "計略" }]);
    expect(haten.duration).toBe(2);
    const daichi = P("大智不智");
    expect(daichi.duration).toBe(2);
    expect(daichi.dots).toEqual([{ kind: "消沈", rate: 104, type: "計略" }]);
    expect(daichi.grantTaken).toEqual([{ type: "兵刃", delta: 0.2 }]);
  });

  it("竜騎兵: 弾丸は戦闘開始時0発で、1ターン目は装填のみ・2ターン目以降に発射してダメージを与える", () => {
    const squad: Squad = { ...emptySquad(), troop: "鉄砲", generals: ["g-伊達政宗", "g-伊達輝宗", "g-伊達晴宗"], tactics: ["t-竜騎兵", null, null, null, null, null] };
    let shots = 0;
    for (let i = 0; i < 10; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      const hits = (rep?.logs ?? []).filter(l => l.tacticName === "竜騎兵");
      // 弾丸は初期0発なので、1ターン目（turn=1）に発射ログは絶対に現れない
      expect(hits.every(l => l.turn >= 2)).toBe(true);
      shots += hits.filter(l => (l.damage ?? 0) > 0).length;
    }
    expect(shots).toBeGreaterThan(10); // 10戦で十分な発射数（装填→発射のサイクルが回っている）
  });

  it("不意打ち: 発動した戦闘では対象に制御が必ず付く（独立した付与抽選はない）", () => {
    const holder: Squad = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-不意打ち", null, null, null, null, null] };
    let fired = 0, controlled = 0;
    for (let i = 0; i < 60; i++) {
      const rep = runSimulation(holder, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      const logs = rep?.logs ?? [];
      const f = logs.filter(l => l.tacticName === "不意打ち" && l.kind === "戦法");
      if (!f.length) continue;
      fired++;
      // 発動ログと同ターンに、対象への制御付与（戦法ログの effects か制御ログ）が伴う
      const turn = f[0]!.turn;
      if (logs.some(l => l.turn === turn && l.tacticName === "不意打ち" && (l.effects.includes("無策") || l.effects.includes("封撃")))) controlled++;
    }
    expect(fired).toBeGreaterThan(5);
    expect(controlled).toBe(fired); // 発動すれば必ず付与される（旧仕様は50%で外れた）
  });

  it("奇策制勝: 装備すると固有能動の与ダメージが伸びる（+28%バフ＋心攻スタックが生きている）", () => {
    const base: Squad = { ...emptySquad(), generals: ["g-真田昌幸", "g-真田信幸", "g-真田信繁"] };
    const withK: Squad = { ...base, tactics: ["t-奇策制勝", null, null, null, null, null] };
    const dealt = (sq: Squad) => {
      let total = 0;
      for (let i = 0; i < 40; i++) {
        const rep = runSimulation(sq, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
        total += rep?.units.find(u => u.name === "真田昌幸")?.dealt ?? 0;
      }
      return total;
    };
    // 昌幸の固有「表裏比興」は能動55%。奇策制勝の固有能動+28%と、発動成功ごとの心攻スタック（+4%×最大4）で総与ダメが明確に増える
    expect(dealt(withK)).toBeGreaterThan(dealt(base) * 1.05);
  });

  it("鉄砲僧兵: 休養の回復は1/2/5/6ターン目だけに現れる", () => {
    const squad: Squad = { ...emptySquad(), troop: "鉄砲", generals: ["g-本願寺顕如", "g-長宗我部元親", "g-島津貴久"], tactics: ["t-鉄砲僧兵", null, null, null, null, null] };
    const turns = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      for (const l of rep?.logs ?? []) if (l.tacticName === "鉄砲僧兵・休養") turns.add(l.turn);
    }
    expect(turns.size).toBeGreaterThan(0);
    for (const t of turns) expect([1, 2, 5, 6]).toContain(t); // ログの turn は1始まり
  });

  it("沈魚落雁: 通常攻撃を受けた側が攻撃者に制御を付与する（反応制御）", () => {
    const holder: Squad = { ...emptySquad(), generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-沈魚落雁", null, null, null, null, null] };
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      const rep = runSimulation(holder, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      if ((rep?.logs ?? []).some(l => l.kind === "制御" && l.tacticName === "沈魚落雁" && l.actor === "北条氏康")) seen = true;
    }
    expect(seen).toBe(true);
  });
});

describe("2026-11-11 screenshot wave 2 （三河弓兵隊の回生・三河武士全文・攻守兼備・3凸特性・残件2件）", () => {
  const P = (name: string) => { const t = ALL_TACTICS.find(x => x.name === name); const inh = INHERENT_TACTICS.find(x => x.name === name); const src = t ?? inh!; return parseTactic(src.name, src.kind, src.rate, src.effect, "S", { inherent: !t }); };
  const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };

  it("三河弓兵隊: 全文パース（回生は回復率65%・発動確率35%に分離、統率+20は自軍全体）", () => {
    const s = P("三河弓兵隊");
    expect(s.grant.回生).toBe(65); // 旧フォールバック50ではない
    expect(s.rebirthChance).toBeCloseTo(0.35); // 酒井忠次装備時の上乗せは文面に数値が無く、35%で平坦に読む
    expect(s.upStats).toEqual([{ idx: 0, amount: 20 }]);
    expect(s.upAll).toBe(true); // 全文「自軍全体の統率が10〜20増加」（旧略記では所持者だけに付いていた）
  });

  it("三河弓兵隊: 回生の回復は1〜3ターン目だけに現れ、4ターン目以降は現れない", () => {
    const squad: Squad = { ...emptySquad(), troop: "弓兵", generals: ["g-豊臣秀吉", "g-ねね", "g-福島正則"], tactics: ["t-三河弓兵隊", null, null, null, null, null] };
    const foe: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-北条氏康", "g-武田信玄", "g-成田甲斐"], tactics: ["t-回天転運", "t-会盟の陣", "t-文武両道", "t-乱世の華", "t-乗勝追撃", "t-一力当先"] };
    let heals = 0;
    for (let i = 0; i < 20; i++) {
      const rep = runSimulation(squad, [{ label: "foe", squad: foe }], 1).perOpponent[0]?.report;
      for (const l of rep?.logs ?? []) if (l.tacticName === "回生" && (l.heal ?? 0) > 0) { heals++; expect(l.turn).toBeLessThanOrEqual(3); }
    }
    expect(heals).toBeGreaterThan(5); // 3ターン目までの被ダメージで実際に回復が起きている
  });

  it("三河武士: 全文でも不屈の数値は従来どおり（統率+16・不屈フラグ。回復は汎用 heal ではなく専用処理）", () => {
    const s = P("三河武士");
    expect(s.upStats).toEqual([{ idx: 0, amount: 16 }]);
    expect(s.upAll).toBe(true);
    expect(s.fukutsu).toBe(true);
  });

  it("攻守兼備: ダメージ率184%を種別フレックスとして読む（伝授・固有とも）", () => {
    expect(P("攻守兼備").flexDmg).toBe(184); // 伝授版は文面に種別表記が無く、ユーザー回答（2026-11-11）の種別ルールで読む
    expect(P("攻守兼備").dmg).toEqual([]);
    const inh = INHERENT_TACTICS.find(x => x.name === "攻守兼備")!;
    // 固有版（脇坂安治）は全文に「ダメージタイプは武勇と知略の高い方」と種別ルール自体が書かれている
    expect(parseTactic(inh.name, inh.kind, inh.rate, inh.effect, "S", { inherent: true }).flexDmg).toBe(184);
  });

  it("攻守兼備: 種別は所持者の武勇と知略の高い方で決まる（初回ヒットの平均ダメージで判定）", () => {
    // 敵は統率と知略がほぼ等しい3名にそろえて防御側の差を消す。攻撃側の属性差で種別が判定できる
    const foe: Squad = { ...emptySquad(), generals: ["g-北条氏康", "g-安東愛季", "g-里見義堯"] };
    const firstHits = (sq: Squad) => {
      const dmg: number[] = [];
      for (let i = 0; i < 80 && dmg.length < 40; i++) {
        const rep = runSimulation(sq, [{ label: "foe", squad: foe }], 1).perOpponent[0]?.report;
        const hit = (rep?.logs ?? []).find(l => l.tacticName === "攻守兼備" && (l.damage ?? 0) > 0);
        if (hit?.damage) dmg.push(hit.damage);
      }
      return dmg;
    };
    // 武勇型（本多忠勝: 武勇229・知略116）— 兵刃で計算されれば大きく、計略なら小さい
    const bu: Squad = { ...emptySquad(), generals: ["g-本多忠勝", "g-徳川家康", "g-酒井忠次"], tactics: ["t-攻守兼備", null, null, null, null, null] };
    const buHits = firstHits(bu);
    expect(buHits.length).toBeGreaterThanOrEqual(20);
    expect(buHits.reduce((x, y) => x + y, 0) / buHits.length).toBeGreaterThan(980);
    // 知略型（黒田官兵衛: 知略229・武勇113）— 計略で計算されれば大きく、兵刃なら小さい
    const chi: Squad = { ...emptySquad(), generals: ["g-黒田官兵衛", "g-豊臣秀吉", "g-竹中半兵衛"], tactics: ["t-攻守兼備", null, null, null, null, null] };
    const chiHits = firstHits(chi);
    expect(chiHits.length).toBeGreaterThanOrEqual(20);
    expect(chiHits.reduce((x, y) => x + y, 0) / chiHits.length).toBeGreaterThan(980);
  });

  it("3凸特性名: 蜂須賀家政=砲術Ⅱ（鉄砲Lv+2）、吉川広家=弓術Ⅰ（弓兵Lv+1）が兵種レベルに効く", () => {
    const byName = (n: string) => GENERALS.find(g => g.name === n)!;
    expect(activeTraitNames(byName("蜂須賀家政"), 3)).toContain("砲術Ⅱ");
    expect(activeTraitNames(byName("吉川広家"), 3)).toContain("弓術Ⅰ");
    expect(activeTraitNames(byName("蜂須賀家政"), 1)).not.toContain("砲術Ⅱ"); // 3凸までは解放されない
    expect(traitFor("砲術Ⅱ")?.effect).toContain("鉄砲レベル+2");
    expect(traitFor("弓術Ⅰ")?.effect).toContain("弓兵レベル+1");
    const gun: Squad = { ...emptySquad(), troop: "鉄砲", generals: ["g-蜂須賀家政", "g-豊臣秀吉", "g-ねね"], ranks: [3, 0, 0] };
    expect(troopLevelFor(gun).level).toBe(2);
    const bow: Squad = { ...emptySquad(), troop: "弓兵", generals: ["g-吉川広家", "g-毛利元就", "g-毛利輝元"], ranks: [3, 0, 0] };
    expect(troopLevelFor(bow).level).toBe(1);
  });

  it("瞬息万変: 混乱の付与確率は確定（全文に確率表記なし。汎用デフォルト50%ではない）", () => {
    expect(P("瞬息万変").ctrlChance).toBe(1);
  });

  it("先陣の勇: 威圧は1ターンのまま、自身の速度+20だけ2ターン続く", () => {
    const s = P("先陣の勇");
    expect(s.duration).toBe(1); // 威圧の持続
    expect(s.upSelfDur).toBe(2); // 自身の速度+20の持続は文面どおり2ターン
    expect(s.upStats).toEqual([{ idx: 3, amount: 20 }]);
    // 行動開始ログの実効速度で確認: 発動の翌ターンも所持者の速度が+20されている（従来は共有持続で1ターンで切れた）
    const holder: Squad = { ...emptySquad(), generals: ["g-鈴木佐大夫", "g-北条氏康", "g-武田信玄"], tactics: ["t-先陣の勇", null, null, null, null, null] };
    let verified = 0;
    for (let i = 0; i < 80 && verified < 2; i++) {
      const rep = runSimulation(holder, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      const logs = rep?.logs ?? [];
      const fired = logs.find(l => l.tacticName === "先陣の勇" && l.kind === "戦法" && l.actorSide === "自軍");
      if (!fired || fired.turn >= 7) continue;
      const base = logs.find(l => l.kind === "行動開始" && l.turn === 1 && l.actor === "鈴木佐大夫" && l.actorSide === "自軍");
      const next = logs.find(l => l.kind === "行動開始" && l.turn === fired.turn + 1 && l.actor === "鈴木佐大夫" && l.actorSide === "自軍");
      if (base && next && next.actorSpeed === base.actorSpeed + 20) verified++;
    }
    expect(verified).toBeGreaterThan(0);
  });
});

describe("2026-11-12 公式バランス調整（2026-11-11アップデート）の反映", () => {
  const effOf = (name: string) => tacticById.get(`t-${name}`)?.effect ?? "";
  const inhOf = (holder: string) => INHERENT_TACTICS.find(t => t.holder === holder);
  const parseInh = (holder: string) => { const t = inhOf(holder)!; return parseTactic(t.name, t.kind, t.rate, t.effect, "S", { inherent: true, rateOverride: 1 }); };

  it("智者楽水: 被ダメージ低下は22%で、兵刃・計略の両方に適用される", () => {
    const s = parseTactic("知者楽水", "指揮", "100%", effOf("知者楽水"), "S");
    expect(s.typeTaken).toContainEqual({ type: "兵刃", delta: 0.22 });
    expect(s.typeTaken).toContainEqual({ type: "計略", delta: 0.22 });
    expect(s.auraUntil).toBe(2); // 3ターン目まで
  });

  it("深慮遠謀: 与ダメージ低下30%が、3ターン目まで実際に戦闘へ適用される", () => {
    const s = parseTactic("深慮遠謀", "指揮", "100%", effOf("深慮遠謀"), "S");
    expect(s.dmgDown).toBeCloseTo(0.3);
    expect(s.auraUntil).toBe(2);
    const mine: Squad = {
      ...emptySquad(), troop: "鉄砲", facLv: 5,
      generals: ["g-明智光秀", "g-真田昌幸", "g-帰蝶"],
      tactics: ["t-七十二の計", "t-奇策制勝", "t-回天転運", "t-深慮遠謀", "t-恵風和雨", "t-瞬息万変"],
      alloc: [[0, 0, 50, 0], [0, 0, 50, 0], [0, 0, 50, 0]],
    };
    const res = runSimulation(mine, [{ label: "tpl", squad: templateToSquad(TEMPLATES[0]!, [0, 0, 0]) }], 20);
    const logs = res.perOpponent[0]?.report?.logs ?? [];
    expect(logs.some(l => l.tacticName === "深慮遠謀" && l.effects.includes("与ダメージ低下"))).toBe(true);
  });

  it("武田之赤備: 突撃の発動確率30%・ダメージ率152%、大将時は発動確率が+12%される", () => {
    const s = parseInh("山県昌景");
    expect(s.inner).toBeCloseTo(0.3);
    expect(s.dmg).toEqual([{ type: "兵刃", rate: 152 }]);
    expect(s.crit).toBeCloseTo(0.2);
    // 乱数を0.35固定にすると、基礎30%では発動せず、大将技で0.42まで上がった場合だけ発動する
    const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
    vi.spyOn(Math, "random").mockImplementation(() => 0.35);
    try {
      const asLeader: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-山県昌景", "g-武田信玄", "g-馬場信春"] };
      const asSub: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-武田信玄", "g-山県昌景", "g-馬場信春"] };
      const logsL = runSimulation(asLeader, [{ label: "weak", squad: weak }], 5).perOpponent[0]?.report?.logs ?? [];
      const logsS = runSimulation(asSub, [{ label: "weak", squad: weak }], 5).perOpponent[0]?.report?.logs ?? [];
      expect(logsL.some(l => l.tacticName === "武田之赤備" && l.actorSide === "自軍")).toBe(true);
      expect(logsS.some(l => l.tacticName === "武田之赤備" && l.actorSide === "自軍")).toBe(false);
    } finally { vi.restoreAllMocks(); }
  });

  it("鬼若子: 連撃40%が自軍全体に付与され、統率+18・4ターン目まで", () => {
    const s = parseInh("長宗我部元親");
    expect(s.rengeki).toBeCloseTo(0.4);
    expect(s.upAll).toBe(true);
    expect(s.upStats).toContainEqual({ idx: 0, amount: 18 });
    expect(s.auraUntil).toBe(3); // 4ターン目まで
  });

  it("新生: 回復率70%（知略依存）が専用フィールドに入り、大将時は無条件に回復する", () => {
    const s = parseInh("織田信長");
    expect(s.shinsei).toBe(70);
    expect(s.healStatIdx).toBe(2); // 知略依存
    expect(s.dmgBuff).toBeCloseTo(0.14);
    const foe = templateToSquad(TEMPLATES.find(t => t.label.includes("徳川"))!, [0, 0, 0]);
    // 大将（無条件）: 被弾した戦闘では自身を回復する戦報が大半を占めるはず
    const leaderSquad: Squad = { ...emptySquad(), generals: ["g-織田信長", "g-柴田勝家", "g-前田利家"] };
    let leaderHealed = 0;
    for (let i = 0; i < 30; i++) {
      const rep = runSimulation(leaderSquad, [{ label: "tokugawa", squad: foe }], 20).perOpponent[0]?.report;
      if ((rep?.units.find(u => u.name === "織田信長")?.healed ?? 0) > 0) leaderHealed++;
    }
    expect(leaderHealed).toBeGreaterThanOrEqual(10);
    // 副将（条件つき）: 敵軍総兵力が70%を下回った後の行動から回復する。ラッチが壊れていれば30戦すべて0になる
    // （テンプレート相手では大将死亡で戦闘が終わりやすく条件成立後の行動が回らないため、確実に総兵力が崩れる弱編成で検証する）
    const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
    const subSquad: Squad = { ...emptySquad(), generals: ["g-上杉謙信", "g-織田信長", "g-本多忠勝"] };
    let subHealed = 0;
    for (let i = 0; i < 30; i++) {
      const rep = runSimulation(subSquad, [{ label: "weak", squad: weak }], 20).perOpponent[0]?.report;
      if ((rep?.units.find(u => u.name === "織田信長")?.healed ?? 0) > 0) subHealed++;
    }
    expect(subHealed).toBeGreaterThanOrEqual(10);
  });

  it("天下御免: 追加ダメージ率208%、前田慶次 の統率が成長1.66換算の145になる", () => {
    const s = parseInh("前田慶次");
    expect(s.dmg).toEqual([{ type: "兵刃", rate: 208 }]);
    expect(s.ctrlKinds).toContain("混乱");
    // 統率成長 1.28→1.66: Lv1=64（64+1.28×49=126.72→127で整合）から再計算し 64+1.66×49=145.34→145
    expect(GENERALS.find(g => g.name === "前田慶次")?.stats[0]).toBe(145);
  });
});

describe("2026-11-12 上杉テンプレ診断の反映（縦横馳突・越後二天・越後先手組・軍神・勇猛無比・萎縮ほか）", () => {
  const effOf = (name: string) => tacticById.get(`t-${name}`)?.effect ?? "";
  const parseTac = (name: string) => { const t = tacticById.get(`t-${name}`)!; return parseTactic(t.name, t.kind, t.rate, t.effect, t.grade); };
  const parseInh = (holder: string) => { const t = INHERENT_TACTICS.find(x => x.holder === holder)!; return parseTactic(t.name, t.kind, t.rate, t.effect, "S", { inherent: true, rateOverride: 1 }); };
  const weakIds = GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id);
  const weak: Squad = { ...emptySquad(), generals: weakIds };
  const zeroRandom = () => vi.spyOn(Math, "random").mockImplementation(() => 0);
  const lcgRandom = (seed0: number) => { let seed = seed0; return vi.spyOn(Math, "random").mockImplementation(() => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }); };

  it("縦横馳突: 連撃が復活し、「封撃耐性」は敵への封撃付与ではなく自身の耐性として読まれる", () => {
    const s = parseTac("縦横馳突");
    expect(s.rengeki).toBe(1);
    expect(s.ctrl).toBe(false);
    expect(s.ctrlKinds).toEqual([]);
    expect(s.ctrlResistKinds).toEqual(["封撃"]);
  });

  it("縦横馳突: 発動したターンの通常攻撃が2回になる（連撃）", () => {
    zeroRandom();
    try {
      const base: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-柿崎景家", weakIds[1]!, weakIds[2]!], tactics: [null, null, null, null, null, null], alloc: [[0, 0, 0, 50], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const withTac: Squad = { ...base, tactics: ["t-縦横馳突", null, null, null, null, null] };
      const naCount = (q: Squad) => (runSimulation(q, [{ label: "weak", squad: weak }], 5).perOpponent[0]?.report?.logs ?? []).filter(l => l.turn === 1 && l.kind === "通常攻撃" && l.actor === "柿崎景家").length;
      expect(naCount(withTac)).toBe(2);
      expect(naCount(base)).toBe(1);
    } finally { vi.restoreAllMocks(); }
  });

  it("越後二天: 追加打撃50%・条件つき回復78%が専用フィールドに入り、本体は重複排除で1ヒットのまま", () => {
    const s = parseInh("柿崎景家");
    expect(s.dmg).toEqual([{ type: "兵刃", rate: 108 }]);
    expect(s.nitenExtra).toBeCloseTo(0.5);
    expect(s.nitenHeal).toBe(78);
    expect(s.ctrlKinds).toContain("無策");
    expect(s.ctrlChance).toBeCloseTo(0.4);
  });

  it("越後二天: 大将時は追加打撃が発生し、1ターン目に本体＋追加の2件のダメージが出る", () => {
    zeroRandom();
    try {
      const q: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-柿崎景家", weakIds[1]!, weakIds[2]!], tactics: [null, null, null, null, null, null], alloc: [[0, 0, 0, 50], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const logs = runSimulation(q, [{ label: "weak", squad: weak }], 5).perOpponent[0]?.report?.logs ?? [];
      expect(logs.filter(l => l.turn === 1 && l.tacticName === "越後二天" && (l.damage ?? 0) > 0).length).toBeGreaterThanOrEqual(2);
    } finally { vi.restoreAllMocks(); }
  });

  it("越後二天: 回復は通常攻撃の対象がすでに無策状態の場合だけ発動する", () => {
    zeroRandom();
    try {
      // 槍弾正（固有＋装備）で敵大将へ無策を2重に付与すると、大将の行動で1つ消費されてもう1つが残る。
      // その状態で景家の二天が通常攻撃すると、対象が無策済みのため回復が発動する
      const foe: Squad = { ...emptySquad(), generals: ["g-武田信玄", weakIds[1]!, weakIds[2]!] };
      const withMusaku: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-柿崎景家", "g-保科正俊", "g-甘粕景持"], tactics: [null, null, null, null, "t-槍弾正", null], alloc: [[0, 0, 0, 0], [0, 0, 0, 120], [0, 0, 0, 120]] };
      const control: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-柿崎景家", weakIds[0]!, weakIds[2]!], tactics: [null, null, null, null, null, null] };
      const healedOf = (q: Squad) => runSimulation(q, [{ label: "foe", squad: foe }], 5).perOpponent[0]?.report?.units.find(u => u.name === "柿崎景家")?.healed ?? 0;
      expect(healedOf(withMusaku)).toBeGreaterThan(0);
      // 無策の供給源が無い編成では、二天自身の無策（持続1ターン）は次の発動まで残らないため回復は一切起きない
      expect(healedOf(control)).toBe(0);
    } finally { vi.restoreAllMocks(); }
  });

  it("越後先手組: 2ターン目から毎ターン回復が発動し、1ターン目には発動しない", () => {
    const s = parseTac("越後先手組");
    expect(s.senteHeal).toEqual({ chance: 0.35, rate: 78 });
    lcgRandom(987654321);
    try {
      const tpl = TEMPLATES.find(t => t.label.includes("上杉/騎兵"))!;
      const q = templateToSquad(tpl, [0, 0, 0]);
      let battlesWithHeal = 0;
      const N = 30;
      for (let i = 0; i < N; i++) {
        const logs = runSimulation(q, [{ label: "weak", squad: weak }], 20).perOpponent[0]?.report?.logs ?? [];
        const heals = logs.filter(l => l.tacticName === "越後先手組" && (l.heal ?? 0) > 0);
        if (heals.length) battlesWithHeal++;
        // ターン開始時の回復は2ターン目（表示ターン2）以降だけ
        expect(heals.every(l => l.turn >= 2)).toBe(true);
      }
      expect(battlesWithHeal).toBeGreaterThanOrEqual(N / 2);
    } finally { vi.restoreAllMocks(); }
  });

  it("軍神「溜め」: 上昇率が武勇依存で平坦な+10%/スタックを超え、+160%を超えない", () => {
    lcgRandom(24681357);
    try {
      const q: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-上杉謙信", "g-柿崎景家", "g-宇佐美定満"] };
      let found: { stacks: number; pct: number } | undefined;
      for (let i = 0; i < 30 && !found; i++) {
        const logs = runSimulation(q, [{ label: "weak", squad: weak }], 20).perOpponent[0]?.report?.logs ?? [];
        for (const l of logs) {
          const m = l.effects[0]?.match(/^溜め×(\d+)$/);
          const pm = l.segments.map(sg => sg.text).join("").match(/通常攻撃ダメージ\+(\d+)%/);
          if (m && pm) { found = { stacks: Number(m[1]), pct: Number(pm[1]) }; break; }
        }
      }
      expect(found).toBeDefined();
      // 謙信の実効武勇では1スタック≈+12%以上になる（従来の平坦+10%ではない）ことと、上限+160%の確認
      expect(found!.pct).toBeGreaterThan(found!.stacks * 10);
      expect(found!.pct).toBeLessThanOrEqual(160);
    } finally { vi.restoreAllMocks(); }
  });

  it("勇猛無比: Wiki値でダメージ率136%・会心25%、追加会心（65%で+15%）が句ごとに読まれる", () => {
    const s = parseTac("勇猛無比");
    expect(s.dmg).toEqual([{ type: "兵刃", rate: 136 }]);
    expect(s.crit).toBeCloseTo(0.25);
    expect(s.critExtra).toEqual({ chance: 0.65, rate: 0.15 });
  });

  it("追い崩し: 萎縮が確定付与として読まれ、萎縮した敵の指揮戦法（伊達の粋）が止まる", () => {
    const s = parseTac("追い崩し");
    expect(s.ctrl).toBe(true);
    expect(s.ctrlKinds).toEqual(["萎縮"]);
    expect(s.ctrlChance).toBe(1);
    zeroRandom();
    try {
      const foe: Squad = { ...emptySquad(), generals: ["g-伊達政宗", weakIds[1]!, weakIds[2]!] };
      const withOi: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-宇佐美定満", weakIds[1]!, weakIds[2]!], tactics: ["t-追い崩し", null, null, null, null, null], alloc: [[0, 0, 0, 100], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const control: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-宇佐美定満", weakIds[1]!, weakIds[2]!], tactics: [null, null, null, null, null, null], alloc: [[0, 0, 0, 100], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const suiHits = (q: Squad) => (runSimulation(q, [{ label: "foe", squad: foe }], 5).perOpponent[0]?.report?.logs ?? []).filter(l => l.tacticName === "伊達の粋" && (l.damage ?? 0) > 0).length;
      // 定満が毎ターン先手で萎縮を付け直すため、政宗は戦闘を通して粋を消費できない
      expect(suiHits(withOi)).toBe(0);
      expect(suiHits(control)).toBeGreaterThan(0);
    } finally { vi.restoreAllMocks(); }
  });

  it("萎縮: 対象の指揮オーラ（鬼若子の連撃）が止まり、味方の通常攻撃が1回だけになる", () => {
    zeroRandom();
    try {
      const foe: Squad = { ...emptySquad(), generals: ["g-長宗我部元親", "g-柴田勝家", "g-前田利家"] };
      const withOi: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-宇佐美定満", weakIds[1]!, weakIds[2]!], tactics: ["t-追い崩し", null, null, null, null, null], alloc: [[0, 0, 0, 100], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const control: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-宇佐美定満", weakIds[1]!, weakIds[2]!], tactics: [null, null, null, null, null, null], alloc: [[0, 0, 0, 100], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const naCount = (q: Squad, name: string) => (runSimulation(q, [{ label: "foe", squad: foe }], 5).perOpponent[0]?.report?.logs ?? []).filter(l => l.turn === 1 && l.kind === "通常攻撃" && l.actor === name).length;
      // 鬼若子の連撃（確率40%）は乱数0では常時発動するが、元親が萎縮している間はオーラごと止まる
      expect(naCount(withOi, "柴田勝家")).toBe(1);
      expect(naCount(control, "柴田勝家")).toBe(2);
      expect(naCount(withOi, "前田利家")).toBe(1);
      expect(naCount(control, "前田利家")).toBe(2);
    } finally { vi.restoreAllMocks(); }
  });

  it("越後流軍学: 能動発動時に自軍全体へ制御耐性が付与され、敵の封撃（家中整序）が無効化される", () => {
    const s = parseInh("宇佐美定満");
    expect(s.resistGrant).toEqual({ chance: 0.5, kinds: ["封撃", "無策", "威圧", "疲弊"], dur: 2 });
    expect(s.actSelf).toBeCloseTo(0.2);
    zeroRandom();
    try {
      const foe: Squad = { ...emptySquad(), generals: [weakIds[0]!, weakIds[1]!, weakIds[2]!], tactics: ["t-家中整序", null, null, null, null, null] };
      const withSad: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-宇佐美定満", weakIds[1]!, weakIds[2]!], tactics: ["t-直諫敢行", "t-追い崩し", null, null, null, null], alloc: [[0, 0, 0, 100], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const control: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-甘粕景持", weakIds[1]!, weakIds[2]!], tactics: ["t-直諫敢行", "t-追い崩し", null, null, null, null], alloc: [[0, 0, 0, 100], [0, 0, 0, 0], [0, 0, 0, 0]] };
      const kajLogs = (q: Squad) => (runSimulation(q, [{ label: "foe", squad: foe }], 5).perOpponent[0]?.report?.logs ?? []).filter(l => l.tacticName === "家中整序");
      // 定満が先手で直諫敢行を発動 → 耐性付与（抽選は封撃に固定される）→ 家中整序の封撃が無効化される
      expect(kajLogs(withSad).some(l => l.effects.includes("制御無効"))).toBe(true);
      const ctrl = kajLogs(control);
      expect(ctrl.some(l => l.effects.includes("制御無効"))).toBe(false);
      expect(ctrl.some(l => l.effects.includes("封撃"))).toBe(true);
    } finally { vi.restoreAllMocks(); }
  });

  it("義の将: 混乱への耐性として働き、敵陣攪乱の混乱が上杉謙信に付かない（数値が無いため50%の暫定近似）", () => {
    zeroRandom();
    try {
      const foe: Squad = { ...emptySquad(), generals: [weakIds[0]!, weakIds[1]!, weakIds[2]!], tactics: ["t-敵陣攪乱", null, null, null, null, null] };
      const kenshin: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-上杉謙信", weakIds[1]!, weakIds[2]!] };
      // 対照は無策を付与しない武将にする（柿崎景家だと二天の無策で敵陣攪乱自体が封じられてしまう）
      const control: Squad = { ...emptySquad(), troop: "騎兵", generals: ["g-甘粕景持", weakIds[1]!, weakIds[2]!] };
      const logsK = runSimulation(kenshin, [{ label: "foe", squad: foe }], 5).perOpponent[0]?.report?.logs ?? [];
      // 1ターン目、敵陣攪乱は大将の謙信を狙い、義の将の耐性で無効化される
      expect(logsK.some(l => l.turn === 1 && l.tacticName === "敵陣攪乱" && l.effects.includes("制御無効"))).toBe(true);
      const logsS = runSimulation(control, [{ label: "foe", squad: foe }], 5).perOpponent[0]?.report?.logs ?? [];
      // 耐性の無い武将には混乱がそのまま付く
      expect(logsS.some(l => l.turn === 1 && l.tacticName === "敵陣攪乱" && l.effects.includes("混乱"))).toBe(true);
      expect(logsS.some(l => l.tacticName === "敵陣攪乱" && l.effects.includes("制御無効"))).toBe(false);
    } finally { vi.restoreAllMocks(); }
  });

  it("直諫敢行: 対象は自軍複数（2名）として読まれ、被ダメージ低下24%は従来どおり", () => {
    const s = parseTac("直諫敢行");
    expect(s.allyTargets).toBe(2);
    expect(s.takenDown).toBeCloseTo(0.24);
    expect(effOf("直諫敢行")).toContain("最大2回まで重ねがけ可能");
  });
});

describe("2026-11-13 診断反映（比翼連理・水の如し・電光雷轟・海道一・自軍大将への付与）", () => {
  const weak: Squad = { ...emptySquad(), generals: GENERALS.filter(g => g.rarity === 4).slice(0, 3).map(g => g.id) };
  const parseInh = (holder: string) => { const t = INHERENT_TACTICS.find(x => x.holder === holder)!; return parseTactic(t.name, t.kind, t.rate, t.effect, "S", { inherent: true, rateOverride: 1 }); };

  it("比翼連理: 蓄積率75%・ダメージ率92%・発動80%が専用フィールドに入る", () => {
    const s = parseInh("ねね");
    expect(s.hiyokuAccum).toBeCloseTo(0.75);
    expect(s.hiyokuRate).toBe(92);
    expect(s.inner).toBeCloseTo(0.8);
  });

  it("比翼連理: 自軍の回復が蓄積され、大将の行動終了時にダメージへ変換される", () => {
    const squad: Squad = { ...emptySquad(), troop: "弓兵", generals: ["g-黒田官兵衛", "g-ねね", "g-豊臣秀吉"] };
    let seen = false;
    for (let i = 0; i < 30 && !seen; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      if ((rep?.logs ?? []).some(l => l.tacticName === "比翼連理" && (l.damage ?? 0) > 0 && l.actor === "ねね")) seen = true;
    }
    expect(seen).toBe(true);
  });

  it("水の如し: 発動確率はダメージ句の60%（奇策句の48%ではない）で、ヒット数は1〜2回", () => {
    const s = parseInh("黒田官兵衛");
    expect(s.inner).toBeCloseTo(0.6);
    expect(s.hitMin).toBe(1);
    expect(s.hitMax).toBe(2);
    expect(s.dmg).toEqual([{ type: "計略", rate: 88 }]);
  });

  it("水の如し: 1ターンに2ヒット出る戦闘がある（1〜2回の複数ヒット）", () => {
    const squad: Squad = { ...emptySquad(), troop: "弓兵", generals: ["g-黒田官兵衛", "g-ねね", "g-豊臣秀吉"] };
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      const byTurn = new Map<number, number>();
      for (const l of rep?.logs ?? []) if (l.tacticName === "水の如し" && l.actor === "黒田官兵衛" && (l.damage ?? 0) > 0) byTurn.set(l.turn, (byTurn.get(l.turn) ?? 0) + 1);
      if ([...byTurn.values()].some(n => n >= 2)) seen = true;
    }
    expect(seen).toBe(true);
  });

  it("電光雷轟: 雷鳴52%が専用フィールドに入り、汎用ダメージには残らない", () => {
    const s = parseInh("立花道雪");
    expect(s.raimei).toBe(52);
    expect(s.dmg).toEqual([]);
    expect(s.ctrlKinds).toContain("麻痺");
  });

  it("電光雷轟: 麻痺付与が出て、麻痺状態中の対象には雷鳴（全体・兵刃）が発動する", () => {
    const squad: Squad = { ...emptySquad(), troop: "足軽", generals: ["g-立花誾千代", "g-立花道雪", "g-北条氏康"] };
    let mahi = false, raimei = false;
    for (let i = 0; i < 60 && !(mahi && raimei); i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      for (const l of rep?.logs ?? []) {
        if (l.tacticName === "電光雷轟" && l.effects.includes("麻痺")) mahi = true;
        if (l.tacticName === "雷鳴" && (l.damage ?? 0) > 0) raimei = true;
      }
    }
    expect(mahi).toBe(true);
    expect(raimei).toBe(true);
  });

  it("海道一: 射撃2回が専用フィールドに入る", () => {
    const s = parseInh("今川義元");
    expect(s.shots).toBe(2);
    expect(s.dmg).toEqual([{ type: "兵刃", rate: 134 }, { type: "計略", rate: 134 }]);
  });

  it("海道一: 1回の発動で3ヒット以上（兵刃・計略×2射）出る戦闘がある", () => {
    const squad: Squad = { ...emptySquad(), troop: "弓兵", generals: ["g-今川義元", "g-寿桂尼", "g-立花道雪"] };
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      const byTurn = new Map<number, number>();
      for (const l of rep?.logs ?? []) if (l.tacticName === "海道一" && l.actor === "今川義元" && (l.damage ?? 0) > 0) byTurn.set(l.turn, (byTurn.get(l.turn) ?? 0) + 1);
      if ([...byTurn.values()].some(n => n >= 3)) seen = true;
    }
    expect(seen).toBe(true);
  });

  it("尼御台: 付与先・期間・依存が専用フィールドに入る（洞察2ターン目まで→離反・心攻は終了後4ターン）", () => {
    const s = parseInh("寿桂尼");
    expect(s.leaderInsightUntil).toBe(1);
    expect(s.leaderTaken).toEqual({ delta: 0.18, statIdx: 2, untilTurn: 1 });
    expect(s.grantToLeader).toEqual({ fromTurn: 2, untilTurn: 5, statIdx: 2 });
    expect(s.grant).toEqual({ 離反: 24, 心攻: 24 });
  });

  it("尼御台: 離反・心攻の吸収回復は所持者ではなく大将に、表示3ターン目以降だけ現れる", () => {
    const squad: Squad = { ...emptySquad(), troop: "弓兵", generals: ["g-今川義元", "g-寿桂尼", "g-立花道雪"] };
    let seen = false;
    for (let i = 0; i < 40; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      for (const l of rep?.logs ?? []) {
        if ((l.tacticName === "離反" || l.tacticName === "心攻") && (l.heal ?? 0) > 0) {
          expect(l.actor).toBe("今川義元");
          expect(l.turn).toBeGreaterThanOrEqual(3);
          seen = true;
        }
      }
    }
    expect(seen).toBe(true);
  });

  it("自軍大将への付与の点検: 戦意崩壊の鉄壁2回は大将宛てとして従来どおり読まれる（相違なし）", () => {
    const t = tacticById.get("t-戦意崩壊")!;
    const s = parseTactic(t.name, t.kind, t.rate, t.effect, t.grade);
    expect(s.teppeki).toBe(2);
    expect(s.teppekiToLeader).toBe(true);
  });

  it("種子島銃: 大将の固有発動率+15%と連動ダメージ152%・2名が専用フィールドに入る", () => {
    const s = parseInh("種子島時堯");
    expect(s.leaderCdBuff).toBeCloseTo(0.15);
    expect(s.cdRider).toEqual({ rate: 152, targets: 2 });
  });

  it("種子島銃: 大将のクールタイム付き固有が発動すると、所持者の連動ダメージが出る", () => {
    const squad: Squad = { ...emptySquad(), troop: "足軽", generals: ["g-柴田勝家", "g-種子島時堯", "g-北条氏康"] };
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      const rep = runSimulation(squad, [{ label: "weak", squad: weak }], 1).perOpponent[0]?.report;
      if ((rep?.logs ?? []).some(l => l.tacticName === "種子島銃" && (l.damage ?? 0) > 0 && l.actor === "種子島時堯")) seen = true;
    }
    expect(seen).toBe(true);
  });

  it("耐苦鍛錬: 自軍大将への援護は3ターン目まで（内部ターン2）として読まれる", () => {
    const s = parseInh("千坂景親");
    expect(s.leaderCoverUntil).toBe(2);
  });
});

describe("Attribute point sliders", () => {
  it("moves only the touched attribute and borrows from the others at the cap", () => {
    expect(applyAlloc([0, 0, 0, 0], 2, 45, 100)).toEqual([0, 0, 45, 0]);
    expect(applyAlloc([10, 10, 10, 10], 0, 100, 100)).toEqual([100, 0, 0, 0]);
    expect(applyAlloc([50, 50, 0, 0], 3, 50, 100)).toEqual([0, 50, 0, 50]);
    expect(applyAlloc([100, 0, 0, 0], 1, 1, 100)).toEqual([99, 1, 0, 0]);
    expect(applyAlloc([0, 0, 0, 0], 0, 250, 100)).toEqual([100, 0, 0, 0]);
    expect(applyAlloc([10, 0, 0, 0], 0, -5, 100)).toEqual([0, 0, 0, 0]);
    expect(applyAlloc([33, 33, 34, 0], 1, 100, 100).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
