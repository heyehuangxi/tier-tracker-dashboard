// Tier測定 戦闘シミュレーター（ブラウザ内で完結する簡易モデル）
import { generalById, tacticById, inherentByHolder, traitFor, activeTraitNames, STAT_NAMES, pointsFor, effectiveFaction, hasFactionBonus, buffed, normalizeTroop, troopDamageMultiplier, type TroopType, type Squad, type Stats } from "./sengoku-data";

export type TemplateMember = { name: string; tactics: [string, string]; alloc: string[] };
export type Template = { label: string; troop: TroopType; members: TemplateMember[] };

const ALIAS: Record<string, string> = { 勇猛無前: "勇猛無比", 三河弓兵: "三河弓兵隊" };
const RAW = `豊臣/弓|黒田官兵衛:七十二の計,紅蓮の炎:知略|豊臣秀吉:知者楽水,回天転運:知略|ねね:罵詈雑言,沈魚落雁:統率,魅力
群雄/足軽|立花誾千代:御旗楯無,五里霧中:武勇|立花道雪:勇猛無前,霹靂一撃:武勇|北条氏康:三河武士,一領具足:統率
織田/鉄砲|明智光秀:七十二の計,奇策制勝:知略|真田昌幸:回天転運,深慮遠謀:知略|帰蝶:恵風和雨,瞬息万変:知略
徳川/足軽|徳川家康:一領具足,三河武士:統率|本多忠勝:乗勝追撃,威風凜々:武勇|本多正信:荷駄崩し,所領役帳:知略
武田/騎兵|武田信玄:乱世の華,文武両道:知略|馬場信春:戮力同心,知者楽水:統率|真田昌幸:草木皆兵,瞬息万変:知略
混合/騎兵|北条綱成:運勝の鼻,疑心暗鬼:速度,武勇|柿崎景家:縦横馳突,千軍辟易:速度,武勇|本多正信:会盟の陣,回天転運:知略
豊臣/弓|豊臣秀吉:三河弓兵,回天転運:知略|福島正則:縦横馳突,一力当先:武勇|ねね:罵詈雑言,沈魚落雁:統率
武田/騎兵|武田信玄:乱世の華,文武両道:知略|馬場信春:戮力同心,知者楽水:統率|山本勘助:一行三昧,回天転運:速度,知略
織田/鉄砲|明智光秀:七十二の計,奇策制勝:知略|真田昌幸:回天転運,深慮遠謀:速度,知略|帰蝶:瞬息万変,恵風和雨:知略
群雄/弓|北条綱成:運勝の鼻,千軍辟易:速度,武勇|真田昌幸:瞬息万変,深慮遠謀:知略|北条氏康:甲斐弓騎兵,回天転運:速度,知略
群雄/鉄砲|伊達政宗:攻其不備,竜騎兵:武勇,知略|真田昌幸:深慮遠謀,草木皆兵:知略|三好実休:回天転運,瞬息万変:知略
群雄/鉄砲|伊達政宗:攻其不備,竜騎兵:武勇,知略|真田昌幸:回天転運,瞬息万変:知略|北条氏康:戮力同心,知者楽水:統率
群雄/鉄砲|真田昌幸:回天転運,瞬息万変:知略|伊達政宗:攻其不備,竜騎兵:武勇,知略|帰蝶:恵風和雨,会盟の陣:知略
群雄/鉄砲|本願寺顕如:七十二の計,紅蓮の炎:知略|真田昌幸:深慮遠謀,草木皆兵:知略|三好実休:回天転運,瞬息万変:知略
上杉/足軽|柿崎景家:縦横馳突,乗勝追撃:武勇|長野業正:戮力同心,三河武士:統率|宇佐美定満:直諫敢行,追い崩し:知略`;

export const TEMPLATES: Template[] = RAW.split("\n").map(line => {
  const [head = "", ...ms] = line.split("|");
  const rawTroop = head.split("/")[1];
  const troop = normalizeTroop(rawTroop === "弓" ? "弓兵" : rawTroop);
  const members = ms.map(m => { const [name = "", t = "", a = ""] = m.split(":"); const [t1 = "", t2 = ""] = t.split(","); return { name, tactics: [ALIAS[t1] ?? t1, ALIAS[t2] ?? t2] as [string, string], alloc: a.split(",") }; });
  return { label: `[${head}] ${members.map(m => m.name).join("・")}`, troop, members };
});

export const TEMPLATE_RANKS = [0, 1, 3, 5] as const;

/** 凸数に応じた合計ポイントを指定ステータスへ均等配分（魅力など対象外は除外） */
export function autoAlloc(alloc: string[], rank: number): number[] {
  const idx = alloc.map(a => STAT_NAMES.indexOf(a as never)).filter(i => i >= 0);
  const out = [0, 0, 0, 0]; if (!idx.length) return out;
  const total = pointsFor(rank); const each = Math.floor(total / idx.length);
  idx.forEach((i, k) => { out[i] = (out[i] ?? 0) + each + (k === 0 ? total - each * idx.length : 0); });
  return out;
}

export function templateToSquad(t: Template, ranks: number[]): Squad {
  return {
    troop: t.troop,
    generals: t.members.map(m => (generalById.has(`g-${m.name}`) ? `g-${m.name}` : null)),
    tactics: t.members.flatMap(m => m.tactics.map(n => (tacticById.has(`t-${n}`) ? `t-${n}` : null))),
    ranks: [0, 1, 2].map(i => ranks[i] ?? 0),
    alloc: t.members.map((m, i) => autoAlloc(m.alloc, ranks[i] ?? 0)),
  };
}

// ---- 戦闘モデル ----
// 公式: 兵刃ダメージ = (1.37×(武勇−相手統率) + 0.037×現在兵数 + 175) × (1+バフ−デバフ) × 兵種相性 × 乱数(±3%)
// 戦法ダメージ = 基礎ダメージ × ダメージ率%（最大レベル値）。計略は知略−相手知略で同じ式を使う（暫定）。
const MAX_TROOPS = 10000;
const HEAL_TABLE: [number, number][] = [[1000, 1.0], [1500, 1.5], [2000, 1.94], [3000, 2.56], [4000, 2.95], [5000, 3.3], [6000, 3.56], [7000, 3.79], [8000, 3.98], [9000, 4.14], [10000, 4.3]];
/** 残存兵数に応じた回復倍率（線形補間） */
export function healMultiplier(troops: number): number {
  if (troops <= 1000) return Math.max(0, troops / 1000);
  for (let i = 1; i < HEAL_TABLE.length; i++) {
    const [x1, y1] = HEAL_TABLE[i]!; const [x0, y0] = HEAL_TABLE[i - 1]!;
    if (troops <= x1) return y0 + (y1 - y0) * (troops - x0) / (x1 - x0);
  }
  return 4.3;
}
/** 基礎回復量 = 兵数倍率 × 回復率% × 100 × 知略補正 × 被回復補正 */
export function healAmount(casterTroops: number, ratePct: number, int: number, healCut = 0): number {
  return healMultiplier(casterTroops) * ratePct * (1 + int / 1000) * (1 - healCut);
}
export function weaponBase(atkWu: number, defTong: number, troops: number, multiplier: number, buff = 0, rand = 1): number {
  return Math.max(0, (1.37 * (atkWu - defTong) + (0.037 * troops + 175)) * (1 + buff) * multiplier * rand);
}

type DmgKind = "兵刃" | "計略";
type StatModSpec = { idx: number; amount: number };
type DotSpec = { kind: string; rate: number; type: DmgKind };
type TSpec = { name: string; grade: string; kind: string; prob: number; inner: number; dmg: { type: DmgKind; rate: number }[]; targets: number; heal: number; healAll: boolean; grant: Partial<Record<"回生" | "休養" | "離反" | "心攻", number>>; prepare: boolean; ctrl: boolean; healCut: number; downStats: StatModSpec[]; upStats: StatModSpec[]; upAll: boolean; dmgBuff: number; typeBuffs: { type: DmgKind; delta: number }[]; kindBuffs: { kind: string; delta: number; inherentOnly: boolean }[]; naBuff: number; dmgDown: number; ctrlKinds: string[]; priority: boolean; duration: number; prepTurns: number; cooldown: boolean; inherent: boolean; crit: number; kishaku: number; rengeki: number; evade: number; takenDown: number; typeTaken: { type: DmgKind; delta: number }[]; kindTaken: { kind: string; delta: number }[]; naTaken: number; dots: DotSpec[]; dotChance: number; taunt: boolean; cleanse: number; teppeki: number; teppekiChance: number; auraUntil: number; ranbu: number; onceTurn?: number | undefined; fromTurn?: number | undefined; reactive: boolean; targetLeader: boolean };
export type { TSpec };
const maxPct = (re: RegExp, e: string) => { const m = e.match(re); return m ? Number(m[m.length - 1]) : 0; };
const STAT_IDX: Record<string, number> = { 統率: 0, 武勇: 1, 知略: 2, 速度: 3 };
/** 効果文からステータス増減を最大レベル値で抽出する（「統率・知略を低下（24〜48）」「統率が150上昇」「統率が140減少」等の型に対応。％表記は対象外） */
function statChanges(e: string, verb: "低下" | "増加"): StatModSpec[] {
  const out = new Map<number, number>();
  const names = "((?:統率|武勇|知略|速度)(?:[・と](?:統率|武勇|知略|速度))*)";
  const res = verb === "低下"
    ? [new RegExp(`${names}を低下（(?:[\\d.]+)〜([\\d.]+)）`, "g"), new RegExp(`${names}が([\\d.]+)減少`, "g"), new RegExp(`${names}を(?:\\d+ターンの間、)?([\\d.]+)減少`, "g")]
    : [new RegExp(`${names}が(?:[\\d.]+)〜([\\d.]+)(?!%)増加`, "g"), new RegExp(`${names}が([\\d.]+)(?:（[^）]*）)?(?:増加|上昇)`, "g")];
  for (const re of res) for (const m of e.matchAll(re)) {
    const amount = Number(m[2]);
    for (const name of (m[1] ?? "").split(/[・と]/)) { const idx = STAT_IDX[name]; if (idx !== undefined && Number.isFinite(amount)) out.set(idx, Math.max(out.get(idx) ?? 0, amount)); }
  }
  return [...out].map(([idx, amount]) => ({ idx, amount }));
}
export function parseTactic(name: string, kind: string, rate: string, e: string, grade = "A", opts: { rateOverride?: number; prepTurns?: number; inherent?: boolean } = {}): TSpec {
  const rp = Number(rate.replace("%", ""));
  const prob = opts.rateOverride ?? (kind === "能動" || kind === "突撃" ? (Number.isFinite(rp) && rp > 0 ? rp / 100 : 0.35) : 1);
  const dmg: TSpec["dmg"] = [];
  for (const m of e.matchAll(/(兵刃|計略)ダメージ（(?:ダメージ率)?(?:[\d.]+%[〜→])?([\d.]+)%/g)) dmg.push({ type: m[1] as DmgKind, rate: Number(m[2]) });
  const heal = maxPct(/回復(?:率)?[（(](?:毎ターン)?(?:回復率)?(?:[\d.]+%[〜→])?([\d.]+)%/, e);
  const grant: TSpec["grant"] = {};
  if (/休養/.test(e)) grant.休養 = maxPct(/休養[（(](?:毎ターン)?(?:回復率)?(?:[\d.]+%[〜→])?([\d.]+)%/, e) || 50;
  if (/回生/.test(e)) grant.回生 = 50;
  if (/離反/.test(e)) grant.離反 = maxPct(/離反[^%]*?(?:[\d.]+%[〜→])?([\d.]+)%/, e) || 20;
  if (/心攻/.test(e)) grant.心攻 = maxPct(/心攻[^%]*?(?:[\d.]+%[〜→])?([\d.]+)%/, e) || 20;
  const innerM = e.match(/(?:[\d.]+%[〜→])?([\d.]+)%の確率/);
  const ctrlKinds = ["麻痺", "混乱", "封撃", "無策", "威圧", "疲弊"].filter(k => e.includes(k));
  const durM = e.match(/(\d+)ターン/);
  // --- 汎用機構のパース（会心・奇策・連撃・回避・被ダメージ軽減・継続ダメージ・挑発・浄化・鉄壁） ---
  const critM = e.match(/([\d.]+)%の会心/);
  const crit = critM ? Number(critM[1]) / 100 : /会心を獲得/.test(e) ? 0.3 : 0;
  const kishakuM = e.match(/奇策を([\d.]+)%獲得/) ?? e.match(/([\d.]+)%の奇策/);
  const kishaku = kishakuM ? Number(kishakuM[1]) / 100 : 0;
  const rengekiM = e.match(/([\d.]+)%の連撃/);
  const rengeki = rengekiM ? Number(rengekiM[1]) / 100 : /連撃を獲得|連撃（1ターンに2回通常攻撃）/.test(e) ? 1 : 0;
  const ranbuM = e.match(/([\d.]+)%の乱舞/);
  const ranbu = ranbuM ? Number(ranbuM[1]) / 100 : /乱舞を獲得/.test(e) ? 1 : 0;
  const evadeM = e.match(/([\d.]+)%の回避/);
  const evade = evadeM ? Number(evadeM[1]) / 100 : 0;
  const takenDownLegacy = Math.max(maxPct(/被ダメージが(?:[\d.]+%[〜→])?([\d.]+)%低下/, e), maxPct(/被ダメージを(?:[\d.]+%[〜→])?([\d.]+)%(?:低下|低減)/, e)) / 100;
  // 与ダメージバフは適用範囲（通常攻撃/能動/突撃/固有能動/兵刃/計略）ごとに振り分ける。範囲なしは全体バフ
  let dmgBuff = name === "軍神" ? 0 : 0;
  const typeBuffs: { type: DmgKind; delta: number }[] = [];
  const kindBuffs: { kind: string; delta: number; inherentOnly: boolean }[] = [];
  let naBuff = 0;
  for (const m of e.matchAll(/(通常攻撃|固有能動戦法|能動戦法|突撃戦法|能動|突撃|兵刃|計略)?の?与ダメージが?(?:[\d.]+%[〜→])?([\d.]+)%(?:（[^）]*）)?(?:上昇|増加)/g)) {
    const v = Number(m[2]) / 100; const sc = m[1];
    if (name === "軍神") continue;
    if (!sc) dmgBuff = Math.max(dmgBuff, v);
    else if (sc === "通常攻撃") naBuff = Math.max(naBuff, v);
    else if (sc === "兵刃" || sc === "計略") { const ex = typeBuffs.find(x => x.type === sc); if (ex) ex.delta = Math.max(ex.delta, v); else typeBuffs.push({ type: sc as DmgKind, delta: v }); }
    else kindBuffs.push({ kind: sc === "突撃" || sc === "突撃戦法" ? "突撃" : "能動", delta: v, inherentOnly: sc === "固有能動戦法" });
  }
  // 被ダメージ軽減も範囲（通常攻撃/能動/突撃/兵刃/計略）ごとに振り分ける
  let takenDown = 0; const typeTaken: { type: DmgKind; delta: number }[] = []; const kindTaken: { kind: string; delta: number }[] = []; let naTaken = 0;
  const takenSpans: [number, number][] = [];
  for (const m of e.matchAll(/通常・突撃被ダメージが?(?:[\d.]+%[〜→])?([\d.]+)%低下/g)) { const v = Number(m[1]) / 100; naTaken = Math.max(naTaken, v); kindTaken.push({ kind: "突撃", delta: v }); takenSpans.push([m.index, m.index + m[0].length]); }
  for (const re of [/(通常攻撃|能動戦法|突撃戦法|能動|突撃|兵刃|計略)?被ダメージが?(?:[\d.]+%[〜→])?([\d.]+)%低下/g, /(通常攻撃|能動戦法|突撃戦法|能動|突撃|兵刃|計略)?被ダメージを(?:[\d.]+%[〜→])?([\d.]+)%(?:低下|低減)/g]) {
    for (const m of e.matchAll(re)) {
      if (takenSpans.some(([a, b]) => m.index >= a && m.index < b)) continue;
      const v = Number(m[2]) / 100; const sc = m[1];
      if (!sc) takenDown = Math.max(takenDown, v);
      else if (sc === "通常攻撃") naTaken = Math.max(naTaken, v);
      else if (sc === "兵刃" || sc === "計略") { const ex = typeTaken.find(x => x.type === sc); if (ex) ex.delta = Math.max(ex.delta, v); else typeTaken.push({ type: sc as DmgKind, delta: v }); }
      else kindTaken.push({ kind: sc === "突撃" || sc === "突撃戦法" ? "突撃" : "能動", delta: v });
    }
  }
  if (!takenDown && !typeTaken.length && !kindTaken.length && !naTaken) takenDown = takenDownLegacy;
  const dots: DotSpec[] = [];
  const dotSeen = new Set<string>();
  for (const re of [/(潰走|火傷|水攻め|中毒|消沈)（[^）]*?ダメージ率([\d.]+)%/g, /(潰走|火傷|水攻め|中毒|消沈)を付与（ダメージ率([\d.]+)%/g]) {
    for (const m of e.matchAll(re)) { const k = m[1]!; if (!dotSeen.has(k)) { dotSeen.add(k); dots.push({ kind: k, rate: Number(m[2]), type: k === "潰走" ? "兵刃" : "計略" }); } }
  }
  const dotChanceM = e.match(/([\d.]+)%の確率で[^。]*付与/);
  const dotChance = dots.length && dotChanceM ? Number(dotChanceM[1]) / 100 : 1;
  const taunt = /挑発|牽制/.test(e);
  const cleanseM = e.match(/弱体化効果を(\d+)個浄化/);
  const cleanse = cleanseM ? Number(cleanseM[1]) : /弱体化効果を浄化/.test(e) ? 1 : 0;
  const teppekiMatch = e.match(/(\d+)回、([\d.]+)%の鉄壁/) ?? e.match(/(\d+)回の鉄壁/) ?? e.match(/(\d+)回分の鉄壁/);
  const teppeki = teppekiMatch ? Number(teppekiMatch[1]) : 0;
  const teppekiChance = teppekiMatch?.[2] ? Number(teppekiMatch[2]) / 100 : teppeki && /確率/.test(e) ? (innerM ? Number(innerM[1]) / 100 : 1) : 1;
  const auraM = e.match(/(\d+)ターン目(?:終了)?まで/);
  const auraUntil = auraM ? Number(auraM[1]) - 1 : 99;
  // 「Nターン目に〜」はそのターンだけの効果、「Nターン目以降/から〜」はそのターンから有効（指揮・受動の毎ターン発動と区別する）
  const onceMatches = [...e.matchAll(/(\d+)ターン目に/g)];
  const onceTurn = onceMatches.length === 1 ? Number(onceMatches[0]![1]) - 1 : undefined;
  const fromM = e.match(/(\d+)ターン目(?:以降|から)/);
  const fromTurn = fromM ? Number(fromM[1]) - 1 : undefined;
  // 反応型（攻撃を受けた際に攻撃者へ反撃する等）は能動的に発動しない。古今独歩は damage 側で専用処理する
  const reactive = ((/(通常攻撃|ダメージ)を受け(る|た)(際|場合|時|と)/.test(e) || /(通常攻撃|ダメージ|兵刃ダメージ|計略ダメージ)を受けるたびに/.test(e)) && /(攻撃者に|与えてきた|反撃)/.test(e)) || /を受けた際、自身が/.test(e) || (/発動するたびに/.test(e) && dmg.length > 0) || name === "耐苦鍛錬";
  const targetLeader = /敵軍大将に/.test(e) && dmg.length > 0;
  // 対象数は敵側の範囲表記を優先する（自軍複数などの味方範囲を敵対象数に数えない）
  const targets = /敵軍全体|敵全体/.test(e) ? 3 : /敵軍複数|敵複数/.test(e) ? 2 : /敵軍単体|敵単体/.test(e) ? 1 : /全体/.test(e) ? 3 : /複数/.test(e) ? 2 : 1;
  return { name, grade, kind, prob, inner: innerM ? Number(innerM[1]) / 100 : 1, dmg, targets, heal: grant.休養 ? 0 : heal, healAll: /自軍(複数|全体)/.test(e), grant, prepare: /準備後/.test(e), ctrl: ctrlKinds.length > 0, healCut: name === "荷駄崩し" ? 0.5 : maxPct(/受ける回復効果が(?:[\d.]+%[〜→])?([\d.]+)%低下/, e) / 100, downStats: statChanges(e, "低下"), upStats: statChanges(e, "増加"), upAll: /(自軍|友軍)(全体|複数)/.test(e), dmgBuff, typeBuffs, kindBuffs, naBuff, dmgDown: maxPct(/与ダメージを(?:[\d.]+%[〜→])?([\d.]+)%低下/, e) / 100, ctrlKinds, priority: /先攻/.test(e), duration: durM ? Math.max(1, Math.min(3, Number(durM[1]))) : 2, prepTurns: opts.prepTurns ?? (e.match(/(\d+)ターンの準備後/) ? Number(e.match(/(\d+)ターンの準備後/)![1]) : /準備後/.test(e) ? 1 : 0), cooldown: /再発動不可|クールタイム/.test(e), inherent: opts.inherent ?? false, crit, kishaku, rengeki, evade, takenDown, typeTaken, kindTaken, naTaken, dots, dotChance, taunt, cleanse, teppeki, teppekiChance, auraUntil, ranbu, onceTurn, fromTurn, reactive, targetLeader };
}

type Status = { rate: number; until: number };
type StatMod = { idx: number; delta: number; until: number };
type RateMod = { rate: number; type: DmgKind | "両方"; until: number };
type DotState = { kind: string; rate: number; type: DmgKind; until: number; src: Unit; mine: boolean; ignoreDef?: boolean };
type Unit = { name: string; side: "自軍" | "敵軍"; slot: number; st: Stats; troops: number; max: number; specs: TSpec[]; status: Partial<Record<"回生" | "休養" | "離反" | "心攻", Status>>; healCutUntil: number; healCut: number; stunned: boolean; pending: { s: TSpec; delay: number }[]; mods: StatMod[]; dmgMods: { delta: number; until: number }[]; ctrls: { kind: string; until: number }[]; priorityUntil: number; dealtBy: number; healedBy: number; cooldownUntil: Map<string, number>; critMods: RateMod[]; rengekiMods: { rate: number; until: number }[]; evadeMods: { rate: number; until: number }[]; takenMods: { delta: number; until: number }[]; dots: DotState[]; taunt: { src: Unit; until: number } | null; teppeki: number; tame: number; gunshin: boolean; isLeader: boolean; ranbuMods: { rate: number; until: number }[]; sui: number; suiBoosts: number; suiHitsB: number; suiHitsS: number; hasSui: boolean; ikkiActive: boolean; ikkiChance: number; hasIkki: boolean; traits: string[]; traitSet: Set<string>; typeDmgMods: { type: DmgKind; delta: number; until: number }[]; typeTakenMods: { type: DmgKind; delta: number; until: number }[]; critDmgMods: { type: DmgKind | "両方"; delta: number; until: number }[]; bonusCrit: { b: number; s: number; dmgB: number; dmgS: number }; shieldNext: number; ctrlResists: { rate: number; left: number; untilTurn: number }[]; naEvade: number; targetWeight: number; tacticTargetWeight: number; wasHitTurn: number; dealtTurn: number; nextDmg: { delta: number; left: number }; actProbMods: { kind: string; inherent: boolean | null; delta: number; notHitOnly: boolean; untilTurn: number }[]; counters: Record<string, number>; naDmgBonus: number; naBuffMods: { delta: number; until: number }[]; kindDmgMods: { kind: string; delta: number; until: number; inherentOnly: boolean }[]; kindTakenMods: { kind: string; delta: number; until: number }[]; naTakenMods: { delta: number; until: number }[] };
const FALLBACK: Stats = [160, 150, 160, 100];
function buildUnits(q: Squad): Unit[] {
  const bonus = hasFactionBonus(q.generals);
  void effectiveFaction;
  const units = [0, 1, 2].map(i => {
    const id = q.generals[i]; const g = id ? generalById.get(id) : undefined;
    const base = g?.stats ?? FALLBACK; const al = q.alloc?.[i] ?? [0, 0, 0, 0];
    const st = base.map((v, k) => buffed(v + (al[k] ?? 0), bonus)) as Stats;
    const equipped = [q.tactics[i * 2], q.tactics[i * 2 + 1]].map(id => (id ? tacticById.get(id) : undefined)).filter(Boolean).map(t => parseTactic(t!.name, t!.kind, t!.rate, t!.effect, t!.grade));
    // 固有戦法（所持武将の固有をマスターから取得し、発動率・準備ターンは提供データの列を正とする）
    const specs: TSpec[] = [...equipped];
    const inh = g ? inherentByHolder.get(g.name) : undefined;
    if (inh) {
      const ratePct = Number(inh.rate.replace("%", ""));
      const spec = parseTactic(inh.name, inh.kind, inh.rate, inh.effect, inh.grade, { rateOverride: inh.rate === "-" ? 1 : Number.isFinite(ratePct) ? ratePct / 100 : 1, prepTurns: inh.prep, inherent: true });
      if (i === 0 && inh.leader) {
        // 大将技の簡易反映: ダメージ率上昇と対象数固定のみ
        const boost = inh.leader.match(/ダメージ率が([\d.]+)%上昇/);
        if (boost) for (const d of spec.dmg) d.rate = Math.round(d.rate * (1 + Number(boost[1]) / 100));
        if (/攻撃対象数が3名に固定/.test(inh.leader)) spec.targets = 3;
      }
      // 風林火山は汎用パースでは全旗効果が毎ターン同時発動になってしまうため、専用処理（2ターンごとの旗ローテーション）に委ねる
      if (inh.name === "風林火山") { spec.dmg = []; spec.dmgBuff = 0; spec.takenDown = 0; spec.typeBuffs = []; spec.typeTaken = []; }
      // 表裏比興: 192%は「対象が既に混乱状態の場合」、90%と回復90%は混乱中の対象の行動への反応という条件付き。
      // 汎用パースでは全てが毎回同時発動になってしまうため、無条件の142%＋混乱だけを残す
      if (inh.name === "表裏比興") { spec.dmg = spec.dmg.filter(d => d.rate === 142); spec.heal = 0; }
      // 風流武者: 回復と計略バフは「自身が能動/突撃を発動した回数」による条件付き。汎用パースでは毎ターン発動になるため外す
      if (inh.name === "風流武者") { spec.heal = 0; spec.typeBuffs = []; }
      specs.unshift(spec);
    }
    const u: Unit = { name: g?.name ?? `武将${i + 1}`, side: "自軍", slot: i, st, troops: MAX_TROOPS, max: MAX_TROOPS, specs, status: {}, healCutUntil: -1, healCut: 0, stunned: false, pending: [], mods: [], dmgMods: [], ctrls: [], priorityUntil: -1, dealtBy: 0, healedBy: 0, cooldownUntil: new Map(), critMods: [], rengekiMods: [], evadeMods: [], takenMods: [], dots: [], taunt: null, teppeki: 0, tame: 0, gunshin: inh?.name === "軍神", isLeader: i === 0, ranbuMods: [], sui: inh?.name === "伊達の粋" ? 5 : 0, suiBoosts: 0, suiHitsB: 0, suiHitsS: 0, hasSui: inh?.name === "伊達の粋", ikkiActive: false, ikkiChance: 0.3, hasIkki: inh?.name === "一切皆空", traits: g ? activeTraitNames(g, q.ranks?.[i] ?? 0) : [], traitSet: new Set(g ? activeTraitNames(g, q.ranks?.[i] ?? 0) : []), typeDmgMods: [], typeTakenMods: [], critDmgMods: [], bonusCrit: { b: 0, s: 0, dmgB: 0, dmgS: 0 }, shieldNext: 0, ctrlResists: [], naEvade: 0, targetWeight: 1, tacticTargetWeight: 1, wasHitTurn: -1, dealtTurn: -1, nextDmg: { delta: 0, left: 0 }, actProbMods: [], counters: {}, naDmgBonus: 0, naBuffMods: [], kindDmgMods: [], kindTakenMods: [], naTakenMods: [] };
    // 風林火山: 戦闘開始時の旗は自身の最も高い属性で決まる（速度=風0・知略=林1・武勇=火2・統率=山3）
    if (inh?.name === "風林火山") { const toFlag = [3, 2, 1, 0]; let best = 0; st.forEach((v, k) => { if (v > (st[best] ?? 0)) best = k; }); u.counters["furin"] = toFlag[best]!; }
    // 受動・指揮・兵種の付与系（休養・離反・心攻など）は戦闘開始から常時
    // 古今独歩の離反は反撃が当たるたびに4%ずつ重なる専用処理のため、ここでは付与しない
    for (const s of specs) if (s.prob >= 1 && s.kind !== "突撃" && s.kind !== "能動") for (const [k, v] of Object.entries(s.grant)) if (k !== "回生" && !(s.name === "古今独歩" && k === "離反")) u.status[k as keyof Unit["status"]] = { rate: v!, until: 99 };
    return u;
  });
  // 指揮・受動の常時効果（オーラ）: ステータス上昇・与ダメージ上昇・被ダメージ軽減・会心・連撃・回避を戦闘開始から適用
  for (const u of units) for (const s of u.specs) {
    if ((s.kind !== "指揮" && s.kind !== "受動") || s.prob < 1) continue;
    const scope = s.upAll ? units : [u];
    for (const t of scope) {
      for (const up of s.upStats) t.mods.push({ idx: up.idx, delta: up.amount, until: s.auraUntil });
      if (s.dmgBuff) t.dmgMods.push({ delta: s.dmgBuff, until: s.auraUntil });
      for (const tb of s.typeBuffs) t.typeDmgMods.push({ type: tb.type, delta: tb.delta, until: s.auraUntil });
      for (const kb of s.kindBuffs) t.kindDmgMods.push({ kind: kb.kind, delta: kb.delta, until: s.auraUntil, inherentOnly: kb.inherentOnly });
      // 槍の又左の通常攻撃バフは「鉄壁を2回獲得ごと」という条件付きのため、常時付与はしない
      if (s.naBuff && s.name !== "槍の又左") t.naBuffMods.push({ delta: s.naBuff, until: s.auraUntil });
      if (s.takenDown) t.takenMods.push({ delta: s.takenDown, until: s.auraUntil });
      for (const tt of s.typeTaken) t.typeTakenMods.push({ type: tt.type, delta: tt.delta, until: s.auraUntil });
      for (const kt of s.kindTaken) t.kindTakenMods.push({ kind: kt.kind, delta: kt.delta, until: s.auraUntil });
      if (s.naTaken) t.naTakenMods.push({ delta: s.naTaken, until: s.auraUntil });
      if (s.crit) t.critMods.push({ rate: s.crit, type: "兵刃", until: s.auraUntil });
      if (s.kishaku) t.critMods.push({ rate: s.kishaku, type: "計略", until: s.auraUntil });
      if (s.rengeki) t.rengekiMods.push({ rate: s.rengeki, until: s.auraUntil });
      if (s.evade) t.evadeMods.push({ rate: s.evade, until: s.auraUntil });
      if (s.ranbu && !t.gunshin) t.ranbuMods.push({ rate: s.ranbu, until: s.auraUntil }); // 軍神は乱舞獲得不可
    }
  }
  // ---- 特性（凸数で解放）: 名称→効果をデータセットから引き、戦闘に効く汎用パターンを適用する ----
  const mainIdxOf = (u: Unit) => { let best = 0; for (let k = 1; k < 3; k++) if ((u.st[k] ?? 0) > (u.st[best] ?? 0)) best = k; return best; };
  const firstPct = (e: string) => { const m = e.match(/([\d.]+)[%％]/); return m ? Number(m[1]) / 100 : 0; };
  for (const u of units) {
    for (const name of u.traits) {
      const tr = traitFor(name); if (!tr) continue;
      const e = tr.effect;
      const v = firstPct(e);
      if (/自軍全体/.test(e)) {
        // 三河武士・求道は条件付きのため汎用適用から除外（フック側で処理／近似対象外）
        if (name === "三河武士" || name === "求道") continue;
        // 部隊全体に効く特性（攻勢・守勢・固守・堅固・猛攻・謀攻・人は城など）
        const statM = e.match(/自軍全体の(統率|武勇|知略|速度)/);
        if (statM) { const idx = STAT_IDX[statM[1]!]!; for (const t of units) t.mods.push({ idx, delta: Math.round((t.st[idx] ?? 0) * v), until: 99 }); continue; }
        for (const t of units) {
          if (e.includes("与ダメージ")) { if (e.includes("兵刃")) t.typeDmgMods.push({ type: "兵刃", delta: v, until: 99 }); else if (e.includes("計略")) t.typeDmgMods.push({ type: "計略", delta: v, until: 99 }); else t.dmgMods.push({ delta: v, until: 99 }); }
          else if (e.includes("被ダメージ") || e.includes("被兵刃") || e.includes("被計略")) { if (e.includes("兵刃")) t.typeTakenMods.push({ type: "兵刃", delta: v, until: 99 }); else if (e.includes("計略")) t.typeTakenMods.push({ type: "計略", delta: v, until: 99 }); else t.takenMods.push({ delta: v, until: 99 }); }
        }
        continue;
      }
      // 自身に効く汎用特性
      const statSelf = e.match(/^(統率|武勇|知略|速度)\+/);
      if (statSelf && v) { const idx = STAT_IDX[statSelf[1]!]!; u.mods.push({ idx, delta: Math.round((u.st[idx] ?? 0) * v), until: 99 }); continue; }
      if (e.includes("の会心と奇策")) { u.critMods.push({ rate: v, type: "両方", until: 99 }); continue; }
      if (e.includes("の会心") && name !== "姫武者" && name !== "猪武者") { u.critMods.push({ rate: v, type: "兵刃", until: 99 }); continue; }
      if (e.includes("の奇策")) { u.critMods.push({ rate: v, type: "計略", until: 99 }); continue; }
      if (e.includes("会心と奇策ダメージ")) { u.critDmgMods.push({ type: "両方", delta: v, until: 99 }); continue; }
      if (e.includes("会心ダメージ")) { u.critDmgMods.push({ type: "兵刃", delta: v, until: 99 }); continue; }
      if (e.includes("奇策ダメージ")) { u.critDmgMods.push({ type: "計略", delta: v, until: 99 }); continue; }
      if (name.startsWith("奮戦")) { u.actProbMods.push({ kind: "能動", inherent: false, delta: v, notHitOnly: true, untilTurn: 99 }); continue; }
      if (name.startsWith("威勢")) { u.actProbMods.push({ kind: "能動", inherent: true, delta: v, notHitOnly: true, untilTurn: 99 }); continue; }
      if (name.startsWith("攻陣")) { u.actProbMods.push({ kind: "突撃", inherent: true, delta: v, notHitOnly: true, untilTurn: 99 }); continue; }
      if (name.startsWith("猛闘")) { u.actProbMods.push({ kind: "突撃", inherent: false, delta: v, notHitOnly: true, untilTurn: 99 }); continue; }
      if (e.includes("兵刃与ダメージ")) { u.typeDmgMods.push({ type: "兵刃", delta: v, until: 99 }); continue; }
      if (e.includes("計略与ダメージ")) { u.typeDmgMods.push({ type: "計略", delta: v, until: 99 }); continue; }
      if (e.includes("兵刃被ダメージ")) { u.typeTakenMods.push({ type: "兵刃", delta: v, until: 99 }); continue; }
      if (e.includes("計略被ダメージ")) { u.typeTakenMods.push({ type: "計略", delta: v, until: 99 }); continue; }
      if (/与ダメージ(?:が)?\+?[\d.]+%/.test(e) && name !== "瓶割り") { u.dmgMods.push({ delta: v, until: 99 }); continue; }
      if (e.includes("被ダメージ") && name !== "越後の龍" && name !== "虚実") { u.takenMods.push({ delta: name === "鳳凰" ? -v : v, until: 99 }); continue; }
      if (name.startsWith("剛猛")) { u.targetWeight = name.endsWith("Ⅰ") ? 1.25 : name.endsWith("Ⅱ") ? 1.5 : 2; continue; }
      if (name.startsWith("忍耐")) { u.targetWeight = name.endsWith("Ⅰ") ? 0.75 : name.endsWith("Ⅱ") ? 0.5 : 0.25; continue; }
      if (name === "威迫Ⅱ") { u.tacticTargetWeight = 1.5; continue; }
      if (name === "清濁併呑") { u.naEvade = v; continue; }
      if (name === "傾奇者") { u.ctrlResists.push({ rate: 0.12 + 0.01 * u.specs.filter(s => !s.inherent).length, left: 999, untilTurn: 99 }); continue; }
      if (name === "先駆け") { u.ctrlResists.push({ rate: 0.4, left: 2, untilTurn: 2 }); continue; }
      if (name === "物外軒") { u.actProbMods.push({ kind: "能動", inherent: null, delta: v, notHitOnly: false, untilTurn: 3 }, { kind: "突撃", inherent: null, delta: v, notHitOnly: false, untilTurn: 3 }); continue; }
    }
  }
  // 部隊単位の金帯特性
  if (units.some(u => u.traitSet.has("三矢家訓"))) {
    const mains = units.map(mainIdxOf);
    if (new Set(mains).size === 3) units.forEach((u, i) => u.mods.push({ idx: mains[i]!, delta: 8, until: 99 }));
  }
  if (units.some(u => u.traitSet.has("上下一心"))) for (const u of units) u.ctrlResists.push({ rate: 0.3, left: 1, untilTurn: 0 });
  if (units.some(u => u.traitSet.has("四州の雄"))) for (const u of units) u.naDmgBonus += 0.06; // 自軍全体の通常攻撃ダメージ+6%（駐屯中12%は対象外）
  return units;
}

export type BattleStat = { outcome: 0 | 1 | 2 | 3 | 4; dealt: number; taken: number; peak: number; hits: number; healed: number; ctrls: number };

/** テスト・検証用: 編成の各武将について、特性込みの戦闘開始時ステータスと有効特性を返す */
export function squadTraitEffects(squad: Squad): { name: string; traits: string[]; stats: number[] }[] {
  return buildUnits(squad).map(u => ({ name: u.name, traits: u.traits, stats: [0, 1, 2, 3].map(i => Math.round((u.st[i] ?? 0) + u.mods.filter(m => m.idx === i).reduce((s, m) => s + m.delta, 0))) }));
}

// ---- 詳細戦報（ゲーム内再現型ログ） ----
export type LogTone = "ally" | "enemy" | "damage" | "heal" | "effect" | "plain";
export type LogSegment = { text: string; tone: LogTone };
export type BattleLogEntry = {
  turn: number; // 0=合戦開始、1〜8=ターン番号（表示用に1始まり）
  kind: "開始" | "行動開始" | "戦法" | "通常攻撃" | "回復" | "制御" | "状態";
  actor: string; actorSide: "自軍" | "敵軍"; actorTroops: number; actorSpeed: number; kills: number; healedByActor: number;
  tacticName?: string | undefined; tacticGrade?: string | undefined; tacticKind?: string | undefined;
  target?: string | undefined; targetSide?: "自軍" | "敵軍" | undefined;
  damage?: number | undefined; heal?: number | undefined; targetTroopsAfter?: number | undefined;
  effects: string[];
  segments: LogSegment[];
};
export type BattleUnitSummary = { name: string; side: "自軍" | "敵軍"; slot: number; speed: number; troops: number; max: number; dealt: number; healed: number };
export type BattleReport = {
  outcome: BattleStat["outcome"]; outcomeLabel: string;
  allyTotal: number; enemyTotal: number; allyRemaining: number; enemyRemaining: number;
  allyDead: number; enemyDead: number; allyWounded: number; enemyWounded: number;
  dealt: number; taken: number;
  units: BattleUnitSummary[];
  order: { name: string; side: "自軍" | "敵軍"; speed: number }[];
  logs: BattleLogEntry[];
};
const OUTCOME_LABELS = ["勝利", "優勢", "引分", "劣勢", "敗北"] as const;
const STAT_LABELS = ["統率", "武勇", "知略", "速度"] as const;

function fight(a: Squad, b: Squad, collectLog = false): { stat: BattleStat; report: BattleReport } {
  const A = buildUnits(a), B = buildUnits(b);
  A.forEach((u, i) => { u.side = "自軍"; u.slot = i; });
  B.forEach((u, i) => { u.side = "敵軍"; u.slot = i + 3; });
  let dealt = 0, taken = 0, peak = 0, hits = 0, healed = 0, healedEnemy = 0, ctrls = 0;
  const logs: BattleLogEntry[] = [];
  const alive = (u: Unit[]) => u.filter(x => x.troops > 0);
  const pick = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
  const rand = () => 0.97 + Math.random() * 0.06;
  const active = (u: Unit, k: keyof Unit["status"], turn: number) => { const s = u.status[k]; return s && turn <= s.until ? s : undefined; };
  /** バフ・デバフをすべて反映した最終ステータス値（速度判定・ダメージ計算で共通使用） */
  const eff = (u: Unit, idx: number, turn: number) => Math.max(0, (u.st[idx] ?? 0) + u.mods.filter(m => m.idx === idx && turn <= m.until).reduce((s, m) => s + m.delta, 0));
  const effSpeed = (u: Unit, turn: number) => eff(u, 3, turn);
  const hasPriority = (u: Unit, turn: number) => turn <= u.priorityUntil;
  const dmgFactor = (u: Unit, turn: number) => Math.max(0.1, 1 + u.dmgMods.filter(m => turn <= m.until).reduce((s, m) => s + m.delta, 0));
  const maxRate = (mods: { rate: number; until: number }[], turn: number) => mods.filter(m => turn <= m.until).reduce((mx, m) => Math.max(mx, m.rate), 0);
  const critRate = (u: Unit, type: DmgKind, turn: number) => u.critMods.filter(m => turn <= m.until && (m.type === type || m.type === "両方")).reduce((mx, m) => Math.max(mx, m.rate), 0) + (type === "兵刃" ? u.bonusCrit.b : u.bonusCrit.s);
  const critDmgBonus = (u: Unit, type: DmgKind, turn: number) => u.critDmgMods.filter(m => turn <= m.until && (m.type === type || m.type === "両方")).reduce((s, m) => s + m.delta, 0) + (type === "兵刃" ? u.bonusCrit.dmgB : u.bonusCrit.dmgS);
  const takenFactor = (u: Unit, turn: number, type?: DmgKind, kind?: string) => {
    let sum = u.takenMods.filter(m => turn <= m.until).reduce((s, m) => s + m.delta, 0);
    if (type) sum += u.typeTakenMods.filter(m => m.type === type && turn <= m.until).reduce((s, m) => s + m.delta, 0);
    if (kind) sum += u.kindTakenMods.filter(m => m.kind === kind && turn <= m.until).reduce((s, m) => s + m.delta, 0);
    if (kind === "通常攻撃") sum += u.naTakenMods.filter(m => turn <= m.until).reduce((s, m) => s + m.delta, 0);
    if (u.traitSet.has("越後の龍") && u.dealtTurn !== turn) sum += 0.22; // 越後の龍: このターンにダメージを与えていない間、被ダメージ-22%
    return Math.max(0.05, 1 - Math.min(0.95, sum));
  };
  const mainIdxOf = (u: Unit) => { let best = 0; for (let k = 1; k < 3; k++) if ((u.st[k] ?? 0) > (u.st[best] ?? 0)) best = k; return best; };
  const wpick = (arr: Unit[], n: number, w: (u: Unit) => number) => { const pool = [...arr]; const out: Unit[] = []; while (pool.length && out.length < n) { const total = pool.reduce((s, x) => s + w(x), 0); let r = Math.random() * total; let i = pool.findIndex(x => (r -= w(x)) <= 0); if (i < 0) i = pool.length - 1; out.push(pool.splice(i, 1)[0]!); } return out; };
  const adjProb = (u: Unit, s: TSpec, turn: number) => Math.min(1, s.prob + u.actProbMods.filter(m => m.kind === s.kind && (m.inherent === null || m.inherent === s.inherent) && turn <= m.untilTurn && (!m.notHitOnly || u.wasHitTurn !== turn)).reduce((sum, m) => sum + m.delta, 0));
  const cleanseUnit = (u: Unit, n: number) => {
    // 浄化: 制御→継続ダメージ→ステータス低下の順に弱体化を最大n個除去する
    let left = n;
    while (left > 0 && u.ctrls.length) { u.ctrls.shift(); left--; }
    while (left > 0 && u.dots.length) { u.dots.shift(); left--; }
    while (left > 0) { const idx = u.mods.findIndex(m => m.delta < 0); if (idx < 0) break; u.mods.splice(idx, 1); left--; }
  };
  const seg = (u: Unit): LogSegment => ({ text: u.name, tone: u.side === "自軍" ? "ally" : "enemy" });
  const pushLog = (e: Omit<BattleLogEntry, "actorTroops" | "actorSpeed" | "kills" | "healedByActor" | "effects"> & { actorUnit: Unit; effects?: string[] }) => {
    if (!collectLog) return;
    const { actorUnit, ...rest } = e;
    logs.push({ ...rest, effects: e.effects ?? [], actorTroops: Math.round(actorUnit.troops), actorSpeed: Math.round(effSpeed(actorUnit, Math.max(0, e.turn - 1))), kills: Math.round(actorUnit.dealtBy), healedByActor: Math.round(actorUnit.healedBy) });
  };
  if (collectLog) {
    for (const u of [...A, ...B]) pushLog({ turn: 0, kind: "開始", actor: u.name, actorSide: u.side, actorUnit: u, segments: [seg(u), { text: ` 兵力${MAX_TROOPS} 速度${Math.round(effSpeed(u, 0))} で合戦開始`, tone: "plain" }] });
  }
  // 覇王: 自身が兵力を回復したとき、敵単体に回復量の10%分の兵力損失（上限は自身の最大兵力の10%）
  const haouCheck = (target: Unit, healedAmt: number, turn: number) => {
    if (!target.traitSet.has("覇王") || healedAmt <= 0) return;
    const foes = (target.side === "自軍" ? B : A).filter(x => x.troops > 0);
    const foe = foes[Math.floor(Math.random() * foes.length)]; if (!foe) return;
    const loss = Math.min(healedAmt * 0.1, target.max * 0.1);
    foe.troops -= loss; target.dealtBy += loss;
    if (target.side === "自軍") dealt += loss; else taken += loss;
    if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: target.name, actorSide: target.side, actorTroops: Math.round(target.troops), actorSpeed: Math.round(effSpeed(target, turn)), kills: Math.round(target.dealtBy), healedByActor: Math.round(target.healedBy), target: foe.name, targetSide: foe.side, damage: Math.round(loss), targetTroopsAfter: Math.round(foe.troops), effects: ["覇王"], segments: [seg(target), { text: ` の`, tone: "plain" }, { text: "覇王", tone: "effect" }, { text: ` で `, tone: "plain" }, seg(foe), { text: ` に兵力${Math.round(loss)}の損失`, tone: "damage" }] });
  };
  const doHeal = (caster: Unit, target: Unit, ratePct: number, turn: number, mine: boolean, label = "回復", statIdx = 2) => {
    if (target.troops <= 0) return;
    const cut = turn <= target.healCutUntil ? target.healCut : 0;
    // 回復量は発動時点の現在兵数（リアルタイム反映済み）から算出する
    const intended = healAmount(caster.troops, ratePct, eff(caster, statIdx, turn), cut);
    const h = Math.min(intended, target.max - target.troops);
    if (h > 0) {
      target.troops += h; caster.healedBy += h;
      if (mine) healed += h; else healedEnemy += h;
      if (collectLog) logs.push({ turn: turn + 1, kind: "回復", actor: caster.name, actorSide: caster.side, actorTroops: Math.round(caster.troops), actorSpeed: Math.round(effSpeed(caster, turn)), kills: Math.round(caster.dealtBy), healedByActor: Math.round(caster.healedBy), target: target.name, targetSide: target.side, heal: Math.round(h), targetTroopsAfter: Math.round(target.troops), tacticName: label, effects: [], segments: [seg(caster), { text: ` の${label}で `, tone: "plain" }, seg(target), { text: ` が `, tone: "plain" }, { text: `${Math.round(h)} (${Math.round(target.troops)}) 兵力を回復`, tone: "heal" }] });
      // 人たらし: 友軍への回復が超過した場合、50%で対象のメイン属性+15（1ターン）
      if (caster.traitSet.has("人たらし") && target !== caster && intended > h && Math.random() < 0.5) target.mods.push({ idx: mainIdxOf(target), delta: 15, until: turn + 1 });
      haouCheck(target, h, turn);
    }
  };
  const flatHeal = (src: Unit, target: Unit, amount: number, turn: number, mine: boolean, label = "救援") => {
    const cut = turn <= target.healCutUntil ? target.healCut : 0;
    const h = Math.min(amount * (1 - cut), target.max - target.troops);
    if (h > 0 && target.troops > 0) {
      target.troops += h; src.healedBy += h;
      if (mine) healed += h; else healedEnemy += h;
      if (collectLog) logs.push({ turn: turn + 1, kind: "回復", actor: src.name, actorSide: src.side, actorTroops: Math.round(src.troops), actorSpeed: Math.round(effSpeed(src, turn)), kills: Math.round(src.dealtBy), healedByActor: Math.round(src.healedBy), target: target.name, targetSide: target.side, heal: Math.round(h), targetTroopsAfter: Math.round(target.troops), tacticName: label, effects: [], segments: [seg(src), { text: ` の${label}で `, tone: "plain" }, seg(target), { text: ` が `, tone: "plain" }, { text: `${Math.round(h)} (${Math.round(target.troops)}) 兵力を回復`, tone: "heal" }] });
      haouCheck(target, h, turn);
    }
  };
  /** 特性のダメージ連動フック（与えた側・受けた側の両方をここで処理する） */
  const traitDamageHooks = (src: Unit, dst: Unit, type: DmgKind, d: number, mine: boolean, turn: number, ctx: LogCtx) => {
    const srcSquad = mine ? A : B, dstSquad = mine ? B : A;
    // 一番槍: 初ターンに初めてダメージを与えた後、50%でメイン属性+18（戦闘中1回）
    if (src.traitSet.has("一番槍") && turn === 0 && !src.counters["ichiban"]) {
      src.counters["ichiban"] = 1;
      if (Math.random() < 0.5) { src.mods.push({ idx: mainIdxOf(src), delta: 18, until: 99 }); if (collectLog) logs.push({ turn: 1, kind: "状態", actor: src.name, actorSide: src.side, actorTroops: Math.round(src.troops), actorSpeed: Math.round(effSpeed(src, turn)), kills: Math.round(src.dealtBy), healedByActor: Math.round(src.healedBy), effects: ["一番槍"], segments: [seg(src), { text: ` の`, tone: "plain" }, { text: "一番槍", tone: "effect" }, { text: ` でメイン属性+18`, tone: "plain" }] }); }
    }
    // 猪武者: 兵刃ダメージ時、60%で会心+1%・会心ダメージ+1%（最大6回）
    if (src.traitSet.has("猪武者") && type === "兵刃" && Math.random() < 0.6 && (src.counters["inoshishi"] ?? 0) < 6) { src.counters["inoshishi"] = (src.counters["inoshishi"] ?? 0) + 1; src.bonusCrit.b += 0.01; src.bonusCrit.dmgB += 0.01; }
    // 姫武者: 2回攻撃するたび会心+2%（最大8回）
    if (src.traitSet.has("姫武者")) { src.counters["atkCount"] = (src.counters["atkCount"] ?? 0) + 1; if (src.counters["atkCount"] % 2 === 0 && (src.counters["himeji"] ?? 0) < 8) { src.counters["himeji"] = (src.counters["himeji"] ?? 0) + 1; src.bonusCrit.b += 0.02; } }
    // 姫城督: 兵刃ダメージ6回ごとに、兵力最小の自軍単体を回復（回復率98%・武勇依存、最大2回）
    if (src.traitSet.has("姫城督") && type === "兵刃") { src.counters["bladeCount"] = (src.counters["bladeCount"] ?? 0) + 1; if (src.counters["bladeCount"] % 6 === 0 && (src.counters["himeHeal"] ?? 0) < 2) { const target = srcSquad.filter(x => x.troops > 0).sort((x, y) => x.troops / x.max - y.troops / y.max)[0]; if (target) { src.counters["himeHeal"] = (src.counters["himeHeal"] ?? 0) + 1; doHeal(src, target, 98, turn, mine, "姫城督", 1); } } }
    // 坂東太郎: 統率が低下した武将へ兵刃ダメージ時、55%で自身の武勇+8・2ターン（最大3回）
    if (src.traitSet.has("坂東太郎") && type === "兵刃" && dst.mods.some(m => m.idx === 0 && m.delta < 0 && turn <= m.until) && Math.random() < 0.55 && (src.counters["bandou"] ?? 0) < 3) { src.counters["bandou"] = (src.counters["bandou"] ?? 0) + 1; src.mods.push({ idx: 1, delta: 8, until: turn + 1 }); }
    // 方円の器: 3ターン目から、各ターン初めて計略ダメージを与えたとき50%で自軍全体の知略+5%（最大2回）
    if (src.traitSet.has("方円の器") && type === "計略" && turn >= 2 && src.counters["houenTurn"] !== turn) { src.counters["houenTurn"] = turn; if ((src.counters["houen"] ?? 0) < 2 && Math.random() < 0.5) { src.counters["houen"] = (src.counters["houen"] ?? 0) + 1; for (const ally of srcSquad) ally.mods.push({ idx: 2, delta: Math.round(ally.st[2] * 0.05), until: 99 }); } }
    // 腹心の知: 自軍武将が戦法ダメージを合計3回受けると、その武将のメイン属性+6（最大2回）
    if (ctx.kind === "戦法" && dstSquad.some(x => x.traitSet.has("腹心の知") && x.troops > 0)) { dst.counters["tacHits"] = (dst.counters["tacHits"] ?? 0) + 1; if (dst.counters["tacHits"] >= 3 && (dst.counters["fukushin"] ?? 0) < 2) { dst.counters["tacHits"] = 0; dst.counters["fukushin"] = (dst.counters["fukushin"] ?? 0) + 1; dst.mods.push({ idx: mainIdxOf(dst), delta: 6, until: 99 }); } }
    // 老功古実: 初めて能動戦法ダメージを受けた際、その発動者の知略-15
    if (dst.traitSet.has("老功古実") && ctx.kind === "能動" && !dst.counters["roukou"]) { dst.counters["roukou"] = 1; src.mods.push({ idx: 2, delta: -15, until: 99 }); }
    // 雄略絶倫: 通常攻撃を受けた際、攻撃者からメイン属性を2吸収（最大8回）
    if (dst.traitSet.has("雄略絶倫") && ctx.kind === "通常攻撃" && (dst.counters["yuuryaku"] ?? 0) < 8) { dst.counters["yuuryaku"] = (dst.counters["yuuryaku"] ?? 0) + 1; src.mods.push({ idx: mainIdxOf(src), delta: -2, until: 99 }); dst.mods.push({ idx: mainIdxOf(dst), delta: 2, until: 99 }); }
    // 金城鉄壁: 通常攻撃を受けた時、攻撃者が弱体化状態なら30%で回復（回復率52%・統率依存）
    if (dst.traitSet.has("金城鉄壁") && ctx.kind === "通常攻撃" && (src.ctrls.some(c => turn <= c.until) || src.dots.some(x => turn <= x.until) || src.mods.some(m => m.delta < 0 && turn <= m.until)) && Math.random() < 0.3) flatHeal(dst, dst, healAmount(dst.troops, 52, eff(dst, 0, turn)), turn, !mine, "金城鉄壁");
    // 紅炉点雪: 累計で最大兵力の10%分のダメージを受けるたび、離反+3%（最大3回）
    if (dst.traitSet.has("紅炉点雪")) { dst.counters["takenAccum"] = (dst.counters["takenAccum"] ?? 0) + d; while (dst.counters["takenAccum"] >= dst.max * 0.1 && (dst.counters["kouro"] ?? 0) < 3) { dst.counters["takenAccum"] -= dst.max * 0.1; dst.counters["kouro"] = (dst.counters["kouro"] ?? 0) + 1; dst.status["離反"] = { rate: 3 * dst.counters["kouro"], until: 99 }; } }
  };
  type LogCtx = { label: string; grade?: string; kind?: string; ignoreDef?: boolean };
  const damage = (src: Unit, dst: Unit, type: DmgKind, ratePct: number, mine: boolean, turn: number, ctx: LogCtx = { label: "通常攻撃", grade: "A", kind: "通常攻撃" }) => {
    const mult = mine ? troopDamageMultiplier(a.troop, b.troop) : troopDamageMultiplier(b.troop, a.troop);
    if (ctx.kind === "通常攻撃") dst.wasHitTurn = turn; // 特性の「このターン通常攻撃を受けた」判定用
    // 清濁併呑: 通常攻撃を25%で無効化
    if (ctx.label === "通常攻撃" && dst.naEvade > 0 && Math.random() < dst.naEvade) {
      if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: dst.name, actorSide: dst.side, actorTroops: Math.round(dst.troops), actorSpeed: Math.round(effSpeed(dst, turn)), kills: Math.round(dst.dealtBy), healedByActor: Math.round(dst.healedBy), target: src.name, targetSide: src.side, tacticName: ctx.label, effects: ["無効化"], segments: [seg(dst), { text: ` は `, tone: "plain" }, seg(src), { text: ` の${ctx.label}を `, tone: "plain" }, { text: "無効化", tone: "effect" }, { text: ` した`, tone: "plain" }] });
      return 0;
    }
    // ダメージ計算直前時点の最終ステータス（デバフ適用後）と現在兵数を用いる
    // 回避: ダメージを無効化
    const ev = maxRate(dst.evadeMods, turn);
    if (ev > 0 && Math.random() < ev) {
      if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: dst.name, actorSide: dst.side, actorTroops: Math.round(dst.troops), actorSpeed: Math.round(effSpeed(dst, turn)), kills: Math.round(dst.dealtBy), healedByActor: Math.round(dst.healedBy), target: src.name, targetSide: src.side, tacticName: ctx.label, effects: ["回避"], segments: [seg(dst), { text: ` は `, tone: "plain" }, seg(src), { text: ` の${ctx.label}を `, tone: "plain" }, { text: "回避", tone: "effect" }, { text: ` してダメージを受けなかった`, tone: "plain" }] });
      return 0;
    }
    // 鉄壁: 回数を消費してダメージを無効化
    if (dst.teppeki > 0) {
      dst.teppeki--;
      if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: dst.name, actorSide: dst.side, actorTroops: Math.round(dst.troops), actorSpeed: Math.round(effSpeed(dst, turn)), kills: Math.round(dst.dealtBy), healedByActor: Math.round(dst.healedBy), target: src.name, targetSide: src.side, tacticName: ctx.label, effects: ["鉄壁"], segments: [seg(dst), { text: ` の `, tone: "plain" }, { text: "鉄壁", tone: "effect" }, { text: ` が `, tone: "plain" }, seg(src), { text: ` の${ctx.label}を無効化`, tone: "plain" }] });
      return 0;
    }
    // 与ダメージバフ: 全体バフ＋種別バフ＋戦法種別バフ（能動/突撃/固有能動の範囲限定）＋瓶割り条件＋材徳兼備の次回バフ
    let buff = dmgFactor(src, turn) - 1 + src.typeDmgMods.filter(m => m.type === type && turn <= m.until).reduce((s, m) => s + m.delta, 0)
      + src.kindDmgMods.filter(m => m.kind === ctx.kind && turn <= m.until && (!m.inherentOnly || ctx.label === src.specs.find(s => s.inherent)?.name)).reduce((s, m) => s + m.delta, 0);
    if (src.traitSet.has("瓶割り") && turn >= 4 && src.troops <= src.max / 2) buff += 0.1;
    if (src.nextDmg.left > 0) { buff += src.nextDmg.delta; src.nextDmg.left--; if (!src.nextDmg.left) src.nextDmg.delta = 0; }
    const base = type === "兵刃"
      ? weaponBase(eff(src, 1, turn), ctx.ignoreDef ? 0 : eff(dst, 0, turn), src.troops, mult, buff, rand())
      : weaponBase(eff(src, 2, turn), ctx.ignoreDef ? 0 : eff(dst, 2, turn), src.troops, mult, buff, rand());
    // 会心・奇策: 該当ダメージ種別で確率発動し、ダメージ1.5倍（特性でダメージ率が上乗せされる）
    const isCrit = Math.random() < critRate(src, type, turn);
    let d = Math.min(dst.troops, base * ratePct / 100 * (isCrit ? 1.5 + critDmgBonus(src, type, turn) : 1) * takenFactor(dst, turn, type, ctx.kind));
    // 鳳凰: 3ターン目以降、初めての致命ダメージを無効化
    if (d >= dst.troops && dst.troops > 0 && turn >= 2 && dst.traitSet.has("鳳凰") && !dst.counters["phoenix"]) {
      dst.counters["phoenix"] = 1; d = 0;
      if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: dst.name, actorSide: dst.side, actorTroops: Math.round(dst.troops), actorSpeed: Math.round(effSpeed(dst, turn)), kills: Math.round(dst.dealtBy), healedByActor: Math.round(dst.healedBy), effects: ["鳳凰"], segments: [seg(dst), { text: ` の`, tone: "plain" }, { text: "鳳凰", tone: "effect" }, { text: ` が致命ダメージを無効化`, tone: "plain" }] });
    }
    // 三河武士の次回被ダメージ-50%（1回分）
    let shielded = false;
    if (d > 0 && dst.shieldNext > 0) { d *= (1 - dst.shieldNext); dst.shieldNext = 0; shielded = true; }
    dst.troops -= d; // 兵数は即時反映され、後続の行動の計算に使われる
    src.dealtBy += d;
    if (d > 0) src.dealtTurn = turn;
    // 古今独歩（本多忠勝）: 通常攻撃を受けた際、48%の確率で攻撃者に兵刃ダメージ（70%）で反撃し、離反が4%ずつ最大8回まで重なる
    if (ctx.kind === "通常攻撃" && dst.troops > 0 && src.troops > 0 && dst.specs.some(s => s.name === "古今独歩") && Math.random() < 0.48) {
      damage(dst, src, "兵刃", 70, !mine, turn, { label: "古今独歩", grade: "S", kind: "受動" });
      const stacks = Math.min(8, (dst.counters["kokin"] ?? 0) + 1);
      dst.counters["kokin"] = stacks;
      dst.status["離反"] = { rate: 4 * stacks, until: 99 };
    }
    if (mine) { dealt += d; peak = Math.max(peak, d); } else taken += d;
    if (collectLog && d > 0) logs.push({ turn: turn + 1, kind: ctx.label === "通常攻撃" ? "通常攻撃" : "戦法", actor: src.name, actorSide: src.side, actorTroops: Math.round(src.troops), actorSpeed: Math.round(effSpeed(src, turn)), kills: Math.round(src.dealtBy), healedByActor: Math.round(src.healedBy), target: dst.name, targetSide: dst.side, damage: Math.round(d), targetTroopsAfter: Math.round(dst.troops), tacticName: ctx.label, tacticGrade: ctx.grade, tacticKind: ctx.kind, effects: [...(isCrit ? [type === "兵刃" ? "会心" : "奇策"] : []), ...(shielded ? ["被ダメージ軽減"] : [])], segments: [seg(src), { text: ` の${ctx.label}で `, tone: "plain" }, seg(dst), { text: ` に `, tone: "plain" }, { text: `兵力${Math.round(d)} (${Math.round(dst.troops)}) 損失`, tone: "damage" }, ...(isCrit ? [{ text: `（${type === "兵刃" ? "会心" : "奇策"}）`, tone: "effect" as LogTone }] : [])] });
    if (d > 0) traitDamageHooks(src, dst, type, d, mine, turn, ctx);
    const steal = active(src, type === "兵刃" ? "離反" : "心攻", turn);
    if (steal) flatHeal(src, src, d * steal.rate / 100, turn, mine, type === "兵刃" ? "離反" : "心攻");
    const rebirth = active(dst, "回生", turn);
    if (rebirth && dst.troops > 0) doHeal(dst, dst, rebirth.rate, turn, !mine, "回生");
    return d;
  };
  // 軍神（上杉謙信）「溜め」: 味方（自身以外）が通常攻撃・能動戦法・突撃戦法を発動するたび66%で1重なる（最大12）
  const tameTrigger = (src: Unit, own: Unit[]) => {
    const k = own.find(x => x.gunshin && x !== src && x.troops > 0);
    if (k && Math.random() < 0.66) k.tame = Math.min(12, k.tame + 1);
  };
  const fire = (src: Unit, s: TSpec, own: Unit[], foe: Unit[], mine: boolean, turn: number, mainTarget?: Unit) => {
    if (s.kind === "能動" || s.kind === "突撃") tameTrigger(src, own);
    if (s.cooldown) src.cooldownUntil.set(s.name, turn + 1);
    const until = turn + s.duration - 1;
    // --- パイプライン 1: バフ先行適用（このターンの攻撃から即時反映） ---
    const effectNames: string[] = [];
    for (const up of s.upStats) {
      const who = s.upAll ? alive(own) : [src];
      for (const u of who) u.mods.push({ idx: up.idx, delta: up.amount, until });
      effectNames.push(`${STAT_LABELS[up.idx]}上昇`);
    }
    if (s.dmgBuff || s.typeBuffs.length || s.kindBuffs.length || s.naBuff) {
      const who = s.upAll ? alive(own) : [src];
      for (const u of who) {
        if (s.dmgBuff) u.dmgMods.push({ delta: s.dmgBuff, until });
        for (const tb of s.typeBuffs) u.typeDmgMods.push({ type: tb.type, delta: tb.delta, until });
        for (const kb of s.kindBuffs) u.kindDmgMods.push({ kind: kb.kind, delta: kb.delta, until, inherentOnly: kb.inherentOnly });
        if (s.naBuff) u.naBuffMods.push({ delta: s.naBuff, until });
      }
      effectNames.push("与ダメージ増加");
    }
    if (s.priority) { src.priorityUntil = Math.max(src.priorityUntil, until); effectNames.push("先攻"); }
    // 浄化は自軍の弱体化を先に除去する
    if (s.cleanse) { cleanseUnit(src, s.cleanse); effectNames.push("浄化"); }
    // 会心・奇策・連撃・回避・被ダメージ軽減の付与
    { const who = s.upAll ? alive(own) : [src];
      for (const u of who) {
        if (s.crit) u.critMods.push({ rate: s.crit, type: "兵刃", until });
        if (s.kishaku) u.critMods.push({ rate: s.kishaku, type: "計略", until });
        if (s.rengeki) u.rengekiMods.push({ rate: s.rengeki, until });
        if (s.evade) u.evadeMods.push({ rate: s.evade, until });
        if (s.takenDown) u.takenMods.push({ delta: s.takenDown, until });
        for (const tt of s.typeTaken) u.typeTakenMods.push({ type: tt.type, delta: tt.delta, until });
        for (const kt of s.kindTaken) u.kindTakenMods.push({ kind: kt.kind, delta: kt.delta, until });
        if (s.naTaken) u.naTakenMods.push({ delta: s.naTaken, until });
        if (s.ranbu && !u.gunshin) u.ranbuMods.push({ rate: s.ranbu, until }); // 軍神は乱舞獲得不可
      }
      if (s.crit) effectNames.push("会心"); if (s.kishaku) effectNames.push("奇策"); if (s.rengeki) effectNames.push("連撃"); if (s.evade) effectNames.push("回避"); if (s.takenDown) effectNames.push("被ダメージ低下"); if (s.ranbu) effectNames.push("乱舞");
    }
    // --- 対象決定（挑発・牽制を受けている場合はその付与者に固定） ---
    let targets = mainTarget && s.kind === "突撃" ? [mainTarget] : s.dmg.length ? wpick(alive(foe), s.targets, x => x.tacticTargetWeight) : pick(alive(foe), s.targets);
    // 「敵軍大将に」の戦法は大将（先頭）を狙う
    if (s.targetLeader) { const leader = foe.find(x => x.slot === 0 && x.troops > 0); if (leader) targets = [leader]; }
    if (s.dmg.length && src.taunt && turn <= src.taunt.until && src.taunt.src.troops > 0) targets = [src.taunt.src];
    // --- パイプライン 2: デバフ・制御・継続ダメージ・挑発をダメージ計算の直前に先行適用 ---
    for (const t of targets) {
      for (const down of s.downStats) { t.mods.push({ idx: down.idx, delta: -down.amount, until }); effectNames.push(`${STAT_LABELS[down.idx]}低下`); }
      if (s.dmgDown) t.dmgMods.push({ delta: -s.dmgDown, until });
      if (s.healCut) { t.healCutUntil = turn + 2; t.healCut = s.healCut; effectNames.push("回復低下"); }
      if (s.ctrl) for (const kindName of s.ctrlKinds) if (Math.random() < 0.5) {
        // 側撃: そのターン通常攻撃を受けている場合、疲弊は無効
        if (kindName === "疲弊" && t.traitSet.has("側撃") && t.wasHitTurn === turn) { effectNames.push("疲弊無効"); continue; }
        // 特性の制御耐性（傾奇者・先駆け・上下一心など）: 確率で無効化し、回数を消費する
        let blocked = false;
        for (const r of t.ctrlResists) if (r.left > 0 && turn <= r.untilTurn && Math.random() < r.rate) { r.left--; blocked = true; break; }
        if (blocked) { effectNames.push("制御無効"); continue; }
        t.ctrls.push({ kind: kindName, until }); effectNames.push(kindName); if (mine) ctrls++;
      }
      for (const dot of s.dots) if (Math.random() < s.dotChance) { t.dots.push({ kind: dot.kind, rate: dot.rate, type: dot.type, until, src, mine }); effectNames.push(dot.kind); }
      if (s.taunt) { t.taunt = { src, until }; effectNames.push("挑発"); }
    }
    if (collectLog && (s.dmg.length || s.heal || effectNames.length)) logs.push({ turn: turn + 1, kind: "戦法", actor: src.name, actorSide: src.side, actorTroops: Math.round(src.troops), actorSpeed: Math.round(effSpeed(src, turn)), kills: Math.round(src.dealtBy), healedByActor: Math.round(src.healedBy), target: targets[0]?.name, targetSide: targets[0]?.side, tacticName: s.name, tacticGrade: s.grade, tacticKind: s.kind, effects: [...new Set(effectNames)], segments: [seg(src), { text: ` が `, tone: "plain" }, { text: `${s.grade} ${s.name}`, tone: "effect" }, { text: ` を発動`, tone: "plain" }, ...(effectNames.length ? [{ text: `（${[...new Set(effectNames)].join("・")}）`, tone: "effect" as LogTone }] : [])] });
    // --- パイプライン 3: 低下後のステータスと最新兵数でダメージ計算 ---
    for (const d of s.dmg) for (const t of targets) if (t.troops > 0) damage(src, t, d.type, d.rate, mine, turn, { label: s.name, grade: s.grade, kind: s.kind });
    if (s.dmg.length && targets.length > 1 && mine) hits++;
    if (s.heal) { const ally = alive(own).sort((x, y) => x.troops / x.max - y.troops / y.max); for (const t of s.healAll ? ally.slice(0, 2) : ally.slice(0, 1)) doHeal(src, t, s.heal, turn, mine, s.name); }
    if (s.teppeki) { const recipients = s.heal ? (s.healAll ? alive(own).slice(0, 2) : [src]) : [src]; for (const t of recipients) if (Math.random() < s.teppekiChance) t.teppeki += s.teppeki; }
    for (const [k, v] of Object.entries(s.grant)) { const who = k === "回生" ? alive(own).sort((x, y) => x.troops - y.troops)[0] : src; if (who) who.status[k as keyof Unit["status"]] = { rate: v!, until: turn + 2 }; }
  };
  const act = (u: Unit, own: Unit[], foe: Unit[], mine: boolean, turn: number) => {
    // 継続ダメージ（潰走・火傷・水攻め・中毒・消沈・一揆）は行動開始時に発生する
    for (const dot of [...u.dots]) {
      if (turn > dot.until) { u.dots = u.dots.filter(d => d !== dot); continue; }
      const dealtDot = damage(dot.src, u, dot.type, dot.rate, dot.mine, turn, { label: dot.kind, grade: "継", kind: "継続", ignoreDef: dot.ignoreDef ?? false });
      if (dot.kind === "一揆") {
        // 一揆状態は1回ダメージを与えたら終了し、与ダメージの25%を自軍（雑賀本願寺）への回復に均等転換する
        u.dots = u.dots.filter(d => d !== dot);
        if (dealtDot > 0) {
          const squad = dot.mine ? A : B;
          const recipients = squad.filter(x => x.troops > 0);
          if (recipients.length) for (const r of recipients) flatHeal(dot.src, r, dealtDot * 0.25 / recipients.length, turn, dot.mine, "一揆回復");
        }
      }
      if (u.troops <= 0) return;
    }
    // 制御は行動開始時点で判定する。速い武将が同ターンに付与した制御も即座に効く。
    const ctrl = u.ctrls.find(c => turn <= c.until);
    if (ctrl) {
      u.ctrls = u.ctrls.filter(c => c !== ctrl);
      if (collectLog) logs.push({ turn: turn + 1, kind: "制御", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: [ctrl.kind], segments: [seg(u), { text: ` は `, tone: "plain" }, { text: ctrl.kind, tone: "effect" }, { text: ` により行動できない`, tone: "plain" }] });
      return;
    }
    if (collectLog) logs.push({ turn: turn + 1, kind: "行動開始", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: hasPriority(u, turn) ? ["先攻"] : [], segments: [seg(u), { text: ` の行動開始 兵力${Math.round(u.troops)} 速度${Math.round(effSpeed(u, turn))}${hasPriority(u, turn) ? "（先攻）" : ""}`, tone: "plain" }] });
    // 軍神の大将技: 大将のとき、毎ターン行動前に「溜め」を追加で1回分獲得
    if (u.gunshin && u.isLeader) u.tame = Math.min(12, u.tame + 1);
    // 勇烈: 行動前に武勇+14（1ターン持続）
    if (u.traitSet.has("勇烈")) u.mods.push({ idx: 1, delta: 14, until: turn });
    // 独眼竜: 行動前に与ダメージバフ（武勇と知略の差が小さいほど大きく、最大10%・大将は15%。差が20%超で無効。差の計算は線形で近似）
    if (u.traitSet.has("独眼竜")) {
      const wu = eff(u, 1, turn), it = eff(u, 2, turn), mx = Math.max(wu, it);
      const diffPct = mx > 0 ? Math.abs(wu - it) / mx * 100 : 100;
      if (diffPct <= 20) { const b = (u.isLeader ? 0.15 : 0.10) * (1 - diffPct / 20); if (b > 0) u.dmgMods.push({ delta: b, until: turn }); }
    }
    // 瓶割り: 5ターン目以降、離反10%を獲得
    if (turn === 4 && u.traitSet.has("瓶割り") && !u.status["離反"]) u.status["離反"] = { rate: 10, until: 99 };
    // 伊達の粋: 行動時に粋を1消費し、兵刃・計略ダメージを各1回（各対象はランダム）
    if (u.hasSui && u.sui > 0 && alive(foe).length) {
      u.sui -= 1;
      if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: ["粋消費"], segments: [seg(u), { text: ` が `, tone: "plain" }, { text: "粋", tone: "effect" }, { text: ` を消費（残り${u.sui}）`, tone: "plain" }] });
      const suiHit = (type: DmgKind, ratePct: number) => { const t = pick(alive(foe), 1)[0]; if (t) damage(u, t, type, ratePct, mine, turn, { label: "伊達の粋", grade: "S", kind: "指揮" }); };
      suiHit("兵刃", 92); u.suiHitsB += 1;
      suiHit("計略", 92); u.suiHitsS += 1;
      // 大将技: 属性上昇が最大まで重ねがけ済みの消費では、134%の追加ダメージが各1回発生（追加分は回数カウント対象外）
      if (u.isLeader && u.suiBoosts >= 4) { suiHit("兵刃", 134); suiHit("計略", 134); }
      if (u.suiHitsB >= 2 && u.suiHitsS >= 2) {
        u.suiHitsB -= 2; u.suiHitsS -= 2;
        if (u.suiBoosts < 4) {
          u.suiBoosts += 1;
          u.mods.push({ idx: 1, delta: Math.round(u.st[1] * 0.05), until: 99 }, { idx: 2, delta: Math.round(u.st[2] * 0.05), until: 99 });
          if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: ["武勇・知略上昇"], segments: [seg(u), { text: ` の武勇と知略が5%上昇（${u.suiBoosts}/4）`, tone: "plain" }] });
        } else {
          u.sui += 1; // 最大まで重ねがけした後は、上昇効果が「粋を1スタック獲得」に変わる
          if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: ["粋獲得"], segments: [seg(u), { text: ` が `, tone: "plain" }, { text: "粋", tone: "effect" }, { text: ` を1スタック獲得（残り${u.sui}）`, tone: "plain" }] });
        }
      }
    }
    // 一切皆空: 2ターン目以降、一揆の発動を判定（失敗するたび発動確率+40ポイント）。発動後は行動時に一揆状態を付与
    if (u.hasIkki) {
      if (!u.ikkiActive && turn >= 1) {
        if (Math.random() < u.ikkiChance) {
          u.ikkiActive = true;
          if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: ["一揆発動"], segments: [seg(u), { text: ` が `, tone: "plain" }, { text: "一揆", tone: "effect" }, { text: ` を発動`, tone: "plain" }] });
        } else u.ikkiChance = Math.min(1, u.ikkiChance + 0.4);
      }
      if (u.ikkiActive && alive(foe).length) {
        const p = Math.min(0.9, 0.8 + 0.01 * (turn + 1)); // 80〜90%（ターン数依存を線形で近似）
        if (Math.random() < p) {
          const n = Math.random() < 0.5 ? 2 : 3;
          const targets = pick(alive(foe), n);
          const type: DmgKind = eff(u, 1, turn) >= eff(u, 2, turn) ? "兵刃" : "計略"; // 武勇と知略の高い方に依存
          const rate = 72 + (u.isLeader ? 12 * own.filter(x => x !== u && x.troops > 0).length : 0); // 大将技: 友軍の雑賀本願寺1名ごとに+12%（自軍の生存味方数で近似）
          for (const t of targets) t.dots.push({ kind: "一揆", rate, type, until: turn + 1, src: u, mine, ignoreDef: true });
          if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), target: targets[0]?.name, targetSide: targets[0]?.side, effects: ["一揆状態"], segments: [seg(u), { text: ` が ${targets.map(t => t.name).join("・")} に `, tone: "plain" }, { text: "一揆状態", tone: "effect" }, { text: `（ダメージ率${rate}%・防御無視）を付与`, tone: "plain" }] });
        }
      }
    }
    const rest = active(u, "休養", turn); if (rest) doHeal(u, u, rest.rate, turn, mine, "休養");
    // 準備中の戦法は残り準備ターンを消化し、0になったものから発動する
    const ready: TSpec[] = [];
    u.pending = u.pending.filter(p => { p.delay -= 1; if (p.delay <= 0) { ready.push(p.s); return false; } return true; });
    for (const s of ready) fire(u, s, own, foe, mine, turn);
    for (const s of u.specs) {
      if (turn <= (u.cooldownUntil.get(s.name) ?? -1)) continue;
      if (s.reactive) continue; // 反応型は受けた時にだけ働く（古今独歩は damage 側で処理）。能動的には発動しない
      if (s.kind === "能動" && Math.random() < adjProb(u, s, turn)) {
        const prep = s.prepTurns || (s.prepare ? 1 : 0);
        if (prep > 0 && turn + prep < 8) u.pending.push({ s, delay: prep });
        else if (prep === 0) {
          fire(u, s, own, foe, mine, turn);
          // 連歌百韻: 能動戦法の発動成功時、確率で再度発動判定（固有は35%、その他は7%）
          if (u.traitSet.has("連歌百韻") && Math.random() < (s.inherent ? 0.35 : 0.07)) fire(u, s, own, foe, mine, turn);
        }
      }
      // 指揮・受動は毎ターンの行動時に判定する（反応型の効果もこの枠で近似）。発動率は提供データの列を使用し、効果文中の確率があれば併せる
      // ただし「Nターン目に」限定の効果はそのターンだけ、「Nターン目以降/から」の効果はそのターンからだけ発動する
      else if ((s.kind === "指揮" || s.kind === "受動") && (s.dmg.length || s.heal)) { if ((s.onceTurn === undefined || turn === s.onceTurn) && (s.fromTurn === undefined || turn >= s.fromTurn) && Math.random() < Math.min(1, s.prob * (s.inner || 1))) fire(u, s, own, foe, mine, turn); }
      else if (s.kind !== "能動" && s.kind !== "突撃" && s.heal && (s.onceTurn === undefined || turn === s.onceTurn) && (s.fromTurn === undefined || turn >= s.fromTurn) && Math.random() < s.inner) fire(u, { ...s, dmg: [] }, own, foe, mine, turn);
    }
    // 通常攻撃の対象: 挑発・牽制が有効ならその付与者に固定、それ以外はランダム
    const target = u.taunt && turn <= u.taunt.until && u.taunt.src.troops > 0 ? u.taunt.src : wpick(alive(foe), 1, x => x.targetWeight)[0]; if (!target) return;
    // 軍神「溜め」: 通常攻撃ダメージが1スタックごとに10%上昇（最大12スタック=+120%）。通常攻撃後にリセット
    const stacks = u.gunshin ? u.tame : 0;
    if (stacks > 0 && collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: [`溜め×${stacks}`], segments: [seg(u), { text: ` の`, tone: "plain" }, { text: `溜め×${stacks}`, tone: "effect" }, { text: `（通常攻撃ダメージ+${stacks * 10}%）`, tone: "plain" }] });
    const atkRate = 100 * (1 + stacks * 0.1) * (1 + u.naDmgBonus + u.naBuffMods.filter(m => turn <= m.until).reduce((s, m) => s + m.delta, 0));
    // 乱舞: 通常攻撃時、確率で対象と同一部隊の他武将にも通常攻撃と同計算のダメージを付与（軍神は獲得不可）
    const normalHit = (dst: Unit) => {
      damage(u, dst, "兵刃", atkRate, mine, turn); // 通常攻撃（現在兵数を即時使用）
      const rb = u.gunshin ? 0 : maxRate(u.ranbuMods, turn);
      if (rb > 0 && Math.random() < rb) for (const other of foe) if (other !== dst && other.troops > 0) damage(u, other, "兵刃", atkRate, mine, turn, { label: "乱舞", grade: "A", kind: "通常攻撃" });
      if (dst.troops > 0) {
        // 波風: 通常攻撃時、80%で対象の知略を2吸収（最大10回）
        if (u.traitSet.has("波風") && (u.counters["houfu"] ?? 0) < 10 && Math.random() < 0.8) { u.counters["houfu"] = (u.counters["houfu"] ?? 0) + 1; dst.mods.push({ idx: 2, delta: -2, until: 99 }); u.mods.push({ idx: 2, delta: 2, until: 99 }); }
        // 赤備え: 通常攻撃後、攻撃対象の統率-18（同一対象に最大3回まで重ねがけ）
        if (u.traitSet.has("赤備え")) { const key = `aka_${dst.name}`; if ((u.counters[key] ?? 0) < 3) { u.counters[key] = (u.counters[key] ?? 0) + 1; dst.mods.push({ idx: 0, delta: -18, until: 99 }); } }
        // 側撃: 通常攻撃時、14%で対象に疲弊（1ターン）
        if (u.traitSet.has("側撃") && Math.random() < 0.14) dst.ctrls.push({ kind: "疲弊", until: turn });
        // 近衛斉射: 通常攻撃後、20%で対象に麻痺（2ターン）
        if (u.traitSet.has("近衛斉射") && Math.random() < 0.2) dst.ctrls.push({ kind: "麻痺", until: turn + 1 });
      }
    };
    normalHit(target);
    // 連撃: 確率でもう1回通常攻撃（溜めの上昇はこの行動内の通常攻撃すべてに適用）
    const rg = maxRate(u.rengekiMods, turn);
    if (rg > 0 && Math.random() < rg && u.troops > 0) {
      const t2 = u.taunt && turn <= u.taunt.until && u.taunt.src.troops > 0 ? u.taunt.src : wpick(alive(foe), 1, x => x.targetWeight)[0];
      if (t2) normalHit(t2);
    }
    if (u.gunshin) u.tame = 0; // 通常攻撃後に「溜め」リセット
    tameTrigger(u, own); // 味方の通常攻撃は軍神の「溜め」判定対象（自身は tameTrigger 内で除外）
    // 三河武士: 自軍の通常攻撃後、15%で自身の次回の被ダメージ-50%（部隊内に所持者がいる場合）
    if (own.some(x => x.traitSet.has("三河武士") && x.troops > 0) && Math.random() < 0.15) u.shieldNext = 0.5;
    for (const s of u.specs) if (s.kind === "突撃" && Math.random() < adjProb(u, s, turn) && turn > (u.cooldownUntil.get(s.name) ?? -1)) fire(u, s, own, foe, mine, turn, target);
    // 魔王: 自身の行動後、兵力が初めて50%以下になった敵武将はランダムに5%以下の兵力を損失
    if (u.traitSet.has("魔王")) for (const f of foe) if (f.troops > 0 && f.troops <= f.max / 2 && !f.counters["maou"]) {
      f.counters["maou"] = 1;
      const loss = f.troops * Math.random() * 0.05;
      f.troops -= loss; u.dealtBy += loss;
      if (mine) dealt += loss; else taken += loss;
      if (collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), target: f.name, targetSide: f.side, damage: Math.round(loss), targetTroopsAfter: Math.round(f.troops), effects: ["魔王"], segments: [seg(u), { text: ` の`, tone: "plain" }, { text: "魔王", tone: "effect" }, { text: ` で `, tone: "plain" }, seg(f), { text: ` が兵力${Math.round(loss)}を損失`, tone: "damage" }] });
    }
  };
  for (let turn = 0; turn < 8; turn++) {
    // 材徳兼備: ターン開始時、友軍が40%で次回の与ダメージ+28%（1人につき最大2回まで）
    for (const u of [...A, ...B]) if (u.traitSet.has("材徳兼備") && u.troops > 0) {
      const squad = u.side === "自軍" ? A : B;
      for (const ally of squad) if (ally !== u && ally.troops > 0 && (ally.counters["zaideki"] ?? 0) < 2 && Math.random() < 0.4) { ally.counters["zaideki"] = (ally.counters["zaideki"] ?? 0) + 1; ally.nextDmg = { delta: 0.28, left: ally.nextDmg.left + 1 }; }
    }
    // 風林火山: 2ターンごとに旗が 風→林→火→山 の順で切り替わり、その旗の効果だけが発動する（開始旗は所持者の最高属性）
    if (turn % 2 === 0) for (const [own, foe, mine] of [[A, B, true], [B, A, false]] as const) for (const u of own) {
      const start = u.counters["furin"];
      if (start === undefined || u.troops <= 0) continue;
      const flag = Number((start + turn / 2) % 4);
      const flagName = ["風", "林", "火", "山"][flag]!;
      if (flag === 0) for (const ally of own) if (ally.troops > 0) ally.typeDmgMods.push({ type: "兵刃", delta: 0.22, until: turn + 1 });
      if (flag === 3) for (const ally of own) if (ally.troops > 0) ally.typeTakenMods.push({ type: "兵刃", delta: 0.22, until: turn + 1 });
      if (flag === 1 || flag === 2) {
        // 林: 敵複数（2〜3名）に計略92% / 火: 敵単体〜複数（1〜2名）に兵刃156%。大将時は対象数が増える確率が25%上昇
        const n = (flag === 1 ? 2 : 1) + (Math.random() < (u.isLeader ? 0.75 : 0.5) ? 1 : 0);
        for (const t of pick(alive(foe), n)) damage(u, t, flag === 1 ? "計略" : "兵刃", flag === 1 ? 92 : 156, mine, turn, { label: "風林火山", grade: "S", kind: "指揮" });
      }
      if (collectLog) logs.push({ turn: turn + 1, kind: "戦法", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), tacticName: "風林火山", tacticGrade: "S", tacticKind: "指揮", effects: [`旗・${flagName}`], segments: [seg(u), { text: ` の `, tone: "plain" }, { text: "風林火山", tone: "effect" }, { text: `（旗・${flagName}）`, tone: "plain" }] });
    }
    // 毎ターン、残り全員の最終速度と先攻を再判定して最速の1名ずつ行動させる（ターン中のバフ・デバフ・制御も次判定に反映）
    const remaining = [...A.map(u => ({ u, mine: true })), ...B.map(u => ({ u, mine: false }))].filter(x => x.u.troops > 0);
    while (remaining.length) {
      if ((A[0]?.troops ?? 0) <= 0 || (B[0]?.troops ?? 0) <= 0) break;
      remaining.sort((x, y) => {
        const p = Number(hasPriority(y.u, turn)) - Number(hasPriority(x.u, turn));
        if (p !== 0) return p;
        const s = effSpeed(y.u, turn) - effSpeed(x.u, turn);
        return s !== 0 ? s : Math.random() - 0.5;
      });
      const cur = remaining.shift()!;
      if (cur.u.troops <= 0) continue;
      if (cur.mine) act(cur.u, A, B, true, turn); else act(cur.u, B, A, false, turn);
    }
    if ((A[0]?.troops ?? 0) <= 0 || (B[0]?.troops ?? 0) <= 0) break;
  }
  const sum = (u: Unit[]) => u.reduce((s, x) => s + x.troops, 0);
  let outcome: BattleStat["outcome"];
  if ((B[0]?.troops ?? 0) <= 0 && (A[0]?.troops ?? 0) > 0) outcome = 0;
  else if ((A[0]?.troops ?? 0) <= 0 && (B[0]?.troops ?? 0) > 0) outcome = 4;
  else { const r = sum(A) / Math.max(1, sum(B)); outcome = r > 1.15 ? 1 : r < 0.87 ? 3 : 2; }
  const stat: BattleStat = { outcome, dealt, taken, peak, hits, healed, ctrls };
  const all = [...A, ...B];
  const report: BattleReport = {
    outcome, outcomeLabel: OUTCOME_LABELS[outcome],
    allyTotal: MAX_TROOPS * 3, enemyTotal: MAX_TROOPS * 3,
    allyRemaining: Math.round(sum(A)), enemyRemaining: Math.round(sum(B)),
    allyDead: Math.round(MAX_TROOPS * 3 - sum(A)), enemyDead: Math.round(MAX_TROOPS * 3 - sum(B)),
    allyWounded: Math.round(healed), enemyWounded: Math.round(healedEnemy),
    dealt: Math.round(dealt), taken: Math.round(taken),
    units: all.map(u => ({ name: u.name, side: u.side, slot: u.slot, speed: Math.round(u.st[3] ?? 0), troops: Math.round(u.troops), max: u.max, dealt: Math.round(u.dealtBy), healed: Math.round(u.healedBy) })),
    order: [...all].sort((x, y) => (y.st[3] ?? 0) - (x.st[3] ?? 0)).map(u => ({ name: u.name, side: u.side, speed: Math.round(u.st[3] ?? 0) })),
    logs,
  };
  return { stat, report };
}

export type SimResult = { counts: number[]; total: number; metrics: number[]; score: number; tier: string; perOpponent: { label: string; win: number; report?: BattleReport | undefined }[] };
export function runSimulation(test: Squad, opponents: { label: string; squad: Squad }[], perMatch: number): SimResult {
  const counts = [0, 0, 0, 0, 0]; let dealt = 0, taken = 0, peak = 0, hits = 0, healed = 0, ctrls = 0;
  const perOpponent = opponents.map(o => {
    let w = 0, dealtOpp = 0, takenOpp = 0;
    const oppCounts = [0, 0, 0, 0, 0];
    // 詳細ログは実行した試行の一部（最大12件）を候補として保持し、後で平均に最も近い1件を代表試行として選ぶ
    const stride = Math.max(1, Math.floor(perMatch / 12));
    const candidates: BattleReport[] = [];
    for (let i = 0; i < perMatch; i++) {
      const collect = i % stride === 0;
      const { stat: r, report } = fight(test, o.squad, collect);
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1; oppCounts[r.outcome] = (oppCounts[r.outcome] ?? 0) + 1;
      if (r.outcome <= 1) w++;
      dealt += r.dealt; taken += r.taken; peak += r.peak; hits += r.hits; healed += r.healed; ctrls += r.ctrls;
      dealtOpp += r.dealt; takenOpp += r.taken;
      if (collect) candidates.push(report);
    }
    const meanDealt = dealtOpp / Math.max(1, perMatch), meanTaken = takenOpp / Math.max(1, perMatch);
    const modalOutcome = oppCounts.indexOf(Math.max(...oppCounts));
    const dist = (rep: BattleReport) => Math.abs(rep.dealt - meanDealt) / Math.max(1, meanDealt) + Math.abs(rep.taken - meanTaken) / Math.max(1, meanTaken) + (rep.outcome !== modalOutcome ? 1 : 0) + Math.abs(rep.outcome - modalOutcome) * 0.1;
    const representative = candidates.length ? [...candidates].sort((x, y) => dist(x) - dist(y))[0] : undefined;
    return { label: o.label, win: (w / perMatch) * 100, report: representative };
  });
  const total = opponents.length * perMatch; const n = Math.max(1, total);
  const c = (v: number) => Math.round(Math.max(0, Math.min(100, v)));
  const points = ((counts[0] ?? 0) * 3 + (counts[1] ?? 0) * 2 + (counts[2] ?? 0) - (counts[4] ?? 0)) / n;
  const ratio = dealt / Math.max(1, taken);
  const stability = 100 - ((counts[3] ?? 0) + (counts[4] ?? 0)) / n * 100;
  const metrics = [c(points / 3 * 100), c(dealt / n / 260), c(peak / n / 35), c(hits / n * 4), c(healed / n / 40), c(ctrls / n * 8), c((dealt / n) / 220), c(stability), c(ratio * 50)];
  const score = Math.round(metrics.reduce((a, b) => a + b, 0) / 9 / 10 * 100) / 100;
  const tier = score >= 8.4 ? "T0" : score >= 7.5 ? "T0.5" : score >= 6.5 ? "T1" : score >= 5.5 ? "T2" : "T3";
  return { counts, total, metrics, score, tier, perOpponent };
}
