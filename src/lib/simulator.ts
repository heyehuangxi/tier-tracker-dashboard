// Tier測定 戦闘シミュレーター（ブラウザ内で完結する簡易モデル）
import { generalById, tacticById, inherentByHolder, STAT_NAMES, pointsFor, effectiveFaction, hasFactionBonus, buffed, normalizeTroop, troopDamageMultiplier, type TroopType, type Squad, type Stats } from "./sengoku-data";

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
type TSpec = { name: string; grade: string; kind: string; prob: number; inner: number; dmg: { type: DmgKind; rate: number }[]; targets: number; heal: number; healAll: boolean; grant: Partial<Record<"回生" | "休養" | "離反" | "心攻", number>>; prepare: boolean; ctrl: boolean; healCut: number; downStats: StatModSpec[]; upStats: StatModSpec[]; upAll: boolean; dmgBuff: number; dmgDown: number; ctrlKinds: string[]; priority: boolean; duration: number; prepTurns: number; cooldown: boolean; inherent: boolean; crit: number; kishaku: number; rengeki: number; evade: number; takenDown: number; dots: DotSpec[]; dotChance: number; taunt: boolean; cleanse: number; teppeki: number; teppekiChance: number; auraUntil: number };
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
  const evadeM = e.match(/([\d.]+)%の回避/);
  const evade = evadeM ? Number(evadeM[1]) / 100 : 0;
  const takenDown = Math.max(maxPct(/被ダメージが(?:[\d.]+%[〜→])?([\d.]+)%低下/, e), maxPct(/被ダメージを(?:[\d.]+%[〜→])?([\d.]+)%(?:低下|低減)/, e)) / 100;
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
  return { name, grade, kind, prob, inner: innerM ? Number(innerM[1]) / 100 : 1, dmg, targets: /全体/.test(e) ? 3 : /複数/.test(e) ? 2 : 1, heal: grant.休養 ? 0 : heal, healAll: /自軍(複数|全体)/.test(e), grant, prepare: /準備後/.test(e), ctrl: ctrlKinds.length > 0, healCut: name === "荷駄崩し" ? 0.5 : maxPct(/受ける回復効果が(?:[\d.]+%[〜→])?([\d.]+)%低下/, e) / 100, downStats: statChanges(e, "低下"), upStats: statChanges(e, "増加"), upAll: /(自軍|友軍)(全体|複数)/.test(e), dmgBuff: name === "軍神" ? 0 : maxPct(/与ダメージが?(?:[\d.]+%[〜→])?([\d.]+)%(?:（[^）]*）)?(?:上昇|増加)/, e) / 100, dmgDown: maxPct(/与ダメージを(?:[\d.]+%[〜→])?([\d.]+)%低下/, e) / 100, ctrlKinds, priority: /先攻/.test(e), duration: durM ? Math.max(1, Math.min(3, Number(durM[1]))) : 2, prepTurns: opts.prepTurns ?? (e.match(/(\d+)ターンの準備後/) ? Number(e.match(/(\d+)ターンの準備後/)![1]) : /準備後/.test(e) ? 1 : 0), cooldown: /再発動不可|クールタイム/.test(e), inherent: opts.inherent ?? false, crit, kishaku, rengeki, evade, takenDown, dots, dotChance, taunt, cleanse, teppeki, teppekiChance, auraUntil };
}

type Status = { rate: number; until: number };
type StatMod = { idx: number; delta: number; until: number };
type RateMod = { rate: number; type: DmgKind | "両方"; until: number };
type DotState = { kind: string; rate: number; type: DmgKind; until: number; src: Unit; mine: boolean };
type Unit = { name: string; side: "自軍" | "敵軍"; slot: number; st: Stats; troops: number; max: number; specs: TSpec[]; status: Partial<Record<"回生" | "休養" | "離反" | "心攻", Status>>; healCutUntil: number; healCut: number; stunned: boolean; pending: { s: TSpec; delay: number }[]; mods: StatMod[]; dmgMods: { delta: number; until: number }[]; ctrls: { kind: string; until: number }[]; priorityUntil: number; dealtBy: number; healedBy: number; cooldownUntil: Map<string, number>; critMods: RateMod[]; rengekiMods: { rate: number; until: number }[]; evadeMods: { rate: number; until: number }[]; takenMods: { delta: number; until: number }[]; dots: DotState[]; taunt: { src: Unit; until: number } | null; teppeki: number; tame: number; gunshin: boolean; isLeader: boolean };
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
      specs.unshift(spec);
    }
    const u: Unit = { name: g?.name ?? `武将${i + 1}`, side: "自軍", slot: i, st, troops: MAX_TROOPS, max: MAX_TROOPS, specs, status: {}, healCutUntil: -1, healCut: 0, stunned: false, pending: [], mods: [], dmgMods: [], ctrls: [], priorityUntil: -1, dealtBy: 0, healedBy: 0, cooldownUntil: new Map(), critMods: [], rengekiMods: [], evadeMods: [], takenMods: [], dots: [], taunt: null, teppeki: 0, tame: 0, gunshin: inh?.name === "軍神", isLeader: i === 0 };
    // 受動・指揮・兵種の付与系（休養・離反・心攻など）は戦闘開始から常時
    for (const s of specs) if (s.prob >= 1 && s.kind !== "突撃" && s.kind !== "能動") for (const [k, v] of Object.entries(s.grant)) if (k !== "回生") u.status[k as keyof Unit["status"]] = { rate: v!, until: 99 };
    return u;
  });
  // 指揮・受動の常時効果（オーラ）: ステータス上昇・与ダメージ上昇・被ダメージ軽減・会心・連撃・回避を戦闘開始から適用
  for (const u of units) for (const s of u.specs) {
    if ((s.kind !== "指揮" && s.kind !== "受動") || s.prob < 1) continue;
    const scope = s.upAll ? units : [u];
    for (const t of scope) {
      for (const up of s.upStats) t.mods.push({ idx: up.idx, delta: up.amount, until: s.auraUntil });
      if (s.dmgBuff) t.dmgMods.push({ delta: s.dmgBuff, until: s.auraUntil });
      if (s.takenDown) t.takenMods.push({ delta: s.takenDown, until: s.auraUntil });
      if (s.crit) t.critMods.push({ rate: s.crit, type: "兵刃", until: s.auraUntil });
      if (s.kishaku) t.critMods.push({ rate: s.kishaku, type: "計略", until: s.auraUntil });
      if (s.rengeki) t.rengekiMods.push({ rate: s.rengeki, until: s.auraUntil });
      if (s.evade) t.evadeMods.push({ rate: s.evade, until: s.auraUntil });
    }
  }
  return units;
}

export type BattleStat = { outcome: 0 | 1 | 2 | 3 | 4; dealt: number; taken: number; peak: number; hits: number; healed: number; ctrls: number };

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
  const critRate = (u: Unit, type: DmgKind, turn: number) => u.critMods.filter(m => turn <= m.until && (m.type === type || m.type === "両方")).reduce((mx, m) => Math.max(mx, m.rate), 0);
  const takenFactor = (u: Unit, turn: number) => Math.max(0.05, 1 - Math.min(0.95, u.takenMods.filter(m => turn <= m.until).reduce((s, m) => s + m.delta, 0)));
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
  const doHeal = (caster: Unit, target: Unit, ratePct: number, turn: number, mine: boolean, label = "回復") => {
    if (target.troops <= 0) return;
    const cut = turn <= target.healCutUntil ? target.healCut : 0;
    // 回復量は発動時点の現在兵数（リアルタイム反映済み）から算出する
    const h = Math.min(healAmount(caster.troops, ratePct, eff(caster, 2, turn), cut), target.max - target.troops);
    if (h > 0) {
      target.troops += h; caster.healedBy += h;
      if (mine) healed += h; else healedEnemy += h;
      if (collectLog) logs.push({ turn: turn + 1, kind: "回復", actor: caster.name, actorSide: caster.side, actorTroops: Math.round(caster.troops), actorSpeed: Math.round(effSpeed(caster, turn)), kills: Math.round(caster.dealtBy), healedByActor: Math.round(caster.healedBy), target: target.name, targetSide: target.side, heal: Math.round(h), targetTroopsAfter: Math.round(target.troops), tacticName: label, effects: [], segments: [seg(caster), { text: ` の${label}で `, tone: "plain" }, seg(target), { text: ` が `, tone: "plain" }, { text: `${Math.round(h)} (${Math.round(target.troops)}) 兵力を回復`, tone: "heal" }] });
    }
  };
  const flatHeal = (src: Unit, target: Unit, amount: number, turn: number, mine: boolean, label = "救援") => {
    const cut = turn <= target.healCutUntil ? target.healCut : 0;
    const h = Math.min(amount * (1 - cut), target.max - target.troops);
    if (h > 0 && target.troops > 0) {
      target.troops += h; src.healedBy += h;
      if (mine) healed += h; else healedEnemy += h;
      if (collectLog) logs.push({ turn: turn + 1, kind: "回復", actor: src.name, actorSide: src.side, actorTroops: Math.round(src.troops), actorSpeed: Math.round(effSpeed(src, turn)), kills: Math.round(src.dealtBy), healedByActor: Math.round(src.healedBy), target: target.name, targetSide: target.side, heal: Math.round(h), targetTroopsAfter: Math.round(target.troops), tacticName: label, effects: [], segments: [seg(src), { text: ` の${label}で `, tone: "plain" }, seg(target), { text: ` が `, tone: "plain" }, { text: `${Math.round(h)} (${Math.round(target.troops)}) 兵力を回復`, tone: "heal" }] });
    }
  };
  type LogCtx = { label: string; grade?: string; kind?: string };
  const damage = (src: Unit, dst: Unit, type: DmgKind, ratePct: number, mine: boolean, turn: number, ctx: LogCtx = { label: "通常攻撃", grade: "A", kind: "通常攻撃" }) => {
    const mult = mine ? troopDamageMultiplier(a.troop, b.troop) : troopDamageMultiplier(b.troop, a.troop);
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
    const base = type === "兵刃"
      ? weaponBase(eff(src, 1, turn), eff(dst, 0, turn), src.troops, mult, dmgFactor(src, turn) - 1, rand())
      : weaponBase(eff(src, 2, turn), eff(dst, 2, turn), src.troops, mult, dmgFactor(src, turn) - 1, rand());
    // 会心・奇策: 該当ダメージ種別で確率発動し、ダメージ1.5倍
    const isCrit = Math.random() < critRate(src, type, turn);
    const d = Math.min(dst.troops, base * ratePct / 100 * (isCrit ? 1.5 : 1) * takenFactor(dst, turn));
    dst.troops -= d; // 兵数は即時反映され、後続の行動の計算に使われる
    src.dealtBy += d;
    if (mine) { dealt += d; peak = Math.max(peak, d); } else taken += d;
    if (collectLog && d > 0) logs.push({ turn: turn + 1, kind: ctx.label === "通常攻撃" ? "通常攻撃" : "戦法", actor: src.name, actorSide: src.side, actorTroops: Math.round(src.troops), actorSpeed: Math.round(effSpeed(src, turn)), kills: Math.round(src.dealtBy), healedByActor: Math.round(src.healedBy), target: dst.name, targetSide: dst.side, damage: Math.round(d), targetTroopsAfter: Math.round(dst.troops), tacticName: ctx.label, tacticGrade: ctx.grade, tacticKind: ctx.kind, effects: isCrit ? [type === "兵刃" ? "会心" : "奇策"] : [], segments: [seg(src), { text: ` の${ctx.label}で `, tone: "plain" }, seg(dst), { text: ` に `, tone: "plain" }, { text: `兵力${Math.round(d)} (${Math.round(dst.troops)}) 損失`, tone: "damage" }, ...(isCrit ? [{ text: `（${type === "兵刃" ? "会心" : "奇策"}）`, tone: "effect" as LogTone }] : [])] });
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
    if (s.dmgBuff) { const who = s.upAll ? alive(own) : [src]; for (const u of who) u.dmgMods.push({ delta: s.dmgBuff, until }); effectNames.push("与ダメージ増加"); }
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
      }
      if (s.crit) effectNames.push("会心"); if (s.kishaku) effectNames.push("奇策"); if (s.rengeki) effectNames.push("連撃"); if (s.evade) effectNames.push("回避"); if (s.takenDown) effectNames.push("被ダメージ低下");
    }
    // --- 対象決定（挑発・牽制を受けている場合はその付与者に固定） ---
    let targets = mainTarget && s.kind === "突撃" ? [mainTarget] : pick(alive(foe), s.targets);
    if (s.dmg.length && src.taunt && turn <= src.taunt.until && src.taunt.src.troops > 0) targets = [src.taunt.src];
    // --- パイプライン 2: デバフ・制御・継続ダメージ・挑発をダメージ計算の直前に先行適用 ---
    for (const t of targets) {
      for (const down of s.downStats) { t.mods.push({ idx: down.idx, delta: -down.amount, until }); effectNames.push(`${STAT_LABELS[down.idx]}低下`); }
      if (s.dmgDown) t.dmgMods.push({ delta: -s.dmgDown, until });
      if (s.healCut) { t.healCutUntil = turn + 2; t.healCut = s.healCut; effectNames.push("回復低下"); }
      if (s.ctrl) for (const kindName of s.ctrlKinds) if (Math.random() < 0.5) { t.ctrls.push({ kind: kindName, until }); effectNames.push(kindName); if (mine) ctrls++; }
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
    // 継続ダメージ（潰走・火傷・水攻め・中毒・消沈）は行動開始時に発生する
    for (const dot of [...u.dots]) {
      if (turn > dot.until) { u.dots = u.dots.filter(d => d !== dot); continue; }
      damage(dot.src, u, dot.type, dot.rate, dot.mine, turn, { label: dot.kind, grade: "継", kind: "継続" });
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
    const rest = active(u, "休養", turn); if (rest) doHeal(u, u, rest.rate, turn, mine, "休養");
    // 準備中の戦法は残り準備ターンを消化し、0になったものから発動する
    const ready: TSpec[] = [];
    u.pending = u.pending.filter(p => { p.delay -= 1; if (p.delay <= 0) { ready.push(p.s); return false; } return true; });
    for (const s of ready) fire(u, s, own, foe, mine, turn);
    for (const s of u.specs) {
      if (turn <= (u.cooldownUntil.get(s.name) ?? -1)) continue;
      if (s.kind === "能動" && Math.random() < s.prob) {
        const prep = s.prepTurns || (s.prepare ? 1 : 0);
        if (prep > 0 && turn + prep < 8) u.pending.push({ s, delay: prep }); else if (prep === 0) fire(u, s, own, foe, mine, turn);
      }
      // 指揮・受動は毎ターンの行動時に判定する（反応型の効果もこの枠で近似）。発動率は提供データの列を使用し、効果文中の確率があれば併せる
      else if ((s.kind === "指揮" || s.kind === "受動") && (s.dmg.length || s.heal)) { if (Math.random() < Math.min(1, s.prob * (s.inner || 1))) fire(u, s, own, foe, mine, turn); }
      else if (s.kind !== "能動" && s.kind !== "突撃" && s.heal && Math.random() < s.inner) fire(u, { ...s, dmg: [] }, own, foe, mine, turn);
    }
    // 通常攻撃の対象: 挑発・牽制が有効ならその付与者に固定、それ以外はランダム
    const target = u.taunt && turn <= u.taunt.until && u.taunt.src.troops > 0 ? u.taunt.src : pick(alive(foe), 1)[0]; if (!target) return;
    // 軍神「溜め」: 通常攻撃ダメージが1スタックごとに10%上昇（最大12スタック=+120%）。通常攻撃後にリセット
    const stacks = u.gunshin ? u.tame : 0;
    if (stacks > 0 && collectLog) logs.push({ turn: turn + 1, kind: "状態", actor: u.name, actorSide: u.side, actorTroops: Math.round(u.troops), actorSpeed: Math.round(effSpeed(u, turn)), kills: Math.round(u.dealtBy), healedByActor: Math.round(u.healedBy), effects: [`溜め×${stacks}`], segments: [seg(u), { text: ` の`, tone: "plain" }, { text: `溜め×${stacks}`, tone: "effect" }, { text: `（通常攻撃ダメージ+${stacks * 10}%）`, tone: "plain" }] });
    const atkRate = 100 * (1 + stacks * 0.1);
    damage(u, target, "兵刃", atkRate, mine, turn); // 通常攻撃（現在兵数を即時使用）
    // 連撃: 確率でもう1回通常攻撃（溜めの上昇はこの行動内の通常攻撃すべてに適用）
    const rg = maxRate(u.rengekiMods, turn);
    if (rg > 0 && Math.random() < rg && u.troops > 0) {
      const t2 = u.taunt && turn <= u.taunt.until && u.taunt.src.troops > 0 ? u.taunt.src : pick(alive(foe), 1)[0];
      if (t2) damage(u, t2, "兵刃", atkRate, mine, turn);
    }
    if (u.gunshin) u.tame = 0; // 通常攻撃後に「溜め」リセット
    tameTrigger(u, own); // 味方の通常攻撃は軍神の「溜め」判定対象（自身は tameTrigger 内で除外）
    for (const s of u.specs) if (s.kind === "突撃" && Math.random() < s.prob && turn > (u.cooldownUntil.get(s.name) ?? -1)) fire(u, s, own, foe, mine, turn, target);
  };
  for (let turn = 0; turn < 8; turn++) {
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
