// Tier測定 戦闘シミュレーター（ブラウザ内で完結する簡易モデル）
import { generalById, tacticById, STAT_NAMES, pointsFor, effectiveFaction, hasFactionBonus, buffed, normalizeTroop, troopDamageMultiplier, type TroopType, type Squad, type Stats } from "./sengoku-data";

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
type TSpec = { kind: string; prob: number; inner: number; dmg: { type: DmgKind; rate: number }[]; targets: number; heal: number; healAll: boolean; grant: Partial<Record<"回生" | "休養" | "離反" | "心攻", number>>; prepare: boolean; ctrl: boolean; healCut: number };
const maxPct = (re: RegExp, e: string) => { const m = e.match(re); return m ? Number(m[m.length - 1]) : 0; };
function parseTactic(name: string, kind: string, rate: string, e: string): TSpec {
  const rp = Number(rate.replace("%", ""));
  const prob = kind === "能動" || kind === "突撃" ? (Number.isFinite(rp) && rp > 0 ? rp / 100 : 0.35) : 1;
  const dmg: TSpec["dmg"] = [];
  for (const m of e.matchAll(/(兵刃|計略)ダメージ（(?:[\d.]+%[〜→])?([\d.]+)%/g)) dmg.push({ type: m[1] as DmgKind, rate: Number(m[2]) });
  const heal = maxPct(/回復(?:率)?[（(](?:毎ターン)?(?:回復率)?(?:[\d.]+%[〜→])?([\d.]+)%/, e);
  const grant: TSpec["grant"] = {};
  if (/休養/.test(e)) grant.休養 = maxPct(/休養[（(](?:毎ターン)?(?:回復率)?(?:[\d.]+%[〜→])?([\d.]+)%/, e) || 50;
  if (/回生/.test(e)) grant.回生 = 50;
  if (/離反/.test(e)) grant.離反 = maxPct(/離反[^%]*?(?:[\d.]+%[〜→])?([\d.]+)%/, e) || 20;
  if (/心攻/.test(e)) grant.心攻 = maxPct(/心攻[^%]*?(?:[\d.]+%[〜→])?([\d.]+)%/, e) || 20;
  const innerM = e.match(/(?:[\d.]+%[〜→])?([\d.]+)%の確率/);
  return { kind, prob, inner: innerM ? Number(innerM[1]) / 100 : 1, dmg, targets: /全体/.test(e) ? 3 : /複数/.test(e) ? 2 : 1, heal: grant.休養 ? 0 : heal, healAll: /自軍(複数|全体)/.test(e), grant, prepare: /準備後/.test(e), ctrl: /(混乱|封撃|無策|威圧|麻痺)/.test(e), healCut: name === "荷駄崩し" ? 0.5 : maxPct(/受ける回復効果が(?:[\d.]+%[〜→])?([\d.]+)%低下/, e) / 100 };
}

type Status = { rate: number; until: number };
type Unit = { st: Stats; troops: number; max: number; specs: TSpec[]; status: Partial<Record<"回生" | "休養" | "離反" | "心攻", Status>>; healCutUntil: number; healCut: number; stunned: boolean; pending: TSpec[] };
const FALLBACK: Stats = [160, 150, 160, 100];
function buildUnits(q: Squad): Unit[] {
  const bonus = hasFactionBonus(q.generals);
  void effectiveFaction;
  return [0, 1, 2].map(i => {
    const id = q.generals[i]; const g = id ? generalById.get(id) : undefined;
    const base = g?.stats ?? FALLBACK; const al = q.alloc?.[i] ?? [0, 0, 0, 0];
    const st = base.map((v, k) => buffed(v + (al[k] ?? 0), bonus)) as Stats;
    const specs = [q.tactics[i * 2], q.tactics[i * 2 + 1]].map(id => (id ? tacticById.get(id) : undefined)).filter(Boolean).map(t => parseTactic(t!.name, t!.kind, t!.rate, t!.effect));
    const u: Unit = { st, troops: MAX_TROOPS, max: MAX_TROOPS, specs, status: {}, healCutUntil: -1, healCut: 0, stunned: false, pending: [] };
    // 受動・指揮・兵種の付与系（休養・離反・心攻など）は戦闘開始から常時
    for (const s of specs) if (s.prob >= 1 && s.kind !== "突撃" && s.kind !== "能動") for (const [k, v] of Object.entries(s.grant)) if (k !== "回生") u.status[k as keyof Unit["status"]] = { rate: v!, until: 99 };
    return u;
  });
}

export type BattleStat = { outcome: 0 | 1 | 2 | 3 | 4; dealt: number; taken: number; peak: number; hits: number; healed: number; ctrls: number };
function fight(a: Squad, b: Squad): BattleStat {
  const A = buildUnits(a), B = buildUnits(b);
  let dealt = 0, taken = 0, peak = 0, hits = 0, healed = 0, ctrls = 0;
  const alive = (u: Unit[]) => u.filter(x => x.troops > 0);
  const pick = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
  const rand = () => 0.97 + Math.random() * 0.06;
  const active = (u: Unit, k: keyof Unit["status"], turn: number) => { const s = u.status[k]; return s && turn <= s.until ? s : undefined; };
  const doHeal = (caster: Unit, target: Unit, ratePct: number, turn: number, mine: boolean) => {
    if (target.troops <= 0) return;
    const cut = turn <= target.healCutUntil ? target.healCut : 0;
    const h = Math.min(healAmount(caster.troops, ratePct, caster.st[2], cut), target.max - target.troops);
    if (h > 0) { target.troops += h; if (mine) healed += h; }
  };
  const flatHeal = (target: Unit, amount: number, turn: number, mine: boolean) => {
    const cut = turn <= target.healCutUntil ? target.healCut : 0;
    const h = Math.min(amount * (1 - cut), target.max - target.troops);
    if (h > 0 && target.troops > 0) { target.troops += h; if (mine) healed += h; }
  };
  const damage = (src: Unit, dst: Unit, type: DmgKind, ratePct: number, mine: boolean, turn: number) => {
    const mult = mine ? troopDamageMultiplier(a.troop, b.troop) : troopDamageMultiplier(b.troop, a.troop);
    const base = type === "兵刃" ? weaponBase(src.st[1], dst.st[0], src.troops, mult, 0, rand()) : weaponBase(src.st[2], dst.st[2], src.troops, mult, 0, rand());
    const d = Math.min(dst.troops, base * ratePct / 100);
    dst.troops -= d;
    if (mine) { dealt += d; peak = Math.max(peak, d); } else taken += d;
    const steal = active(src, type === "兵刃" ? "離反" : "心攻", turn);
    if (steal) flatHeal(src, d * steal.rate / 100, turn, mine);
    const rebirth = active(dst, "回生", turn);
    if (rebirth && dst.troops > 0) doHeal(dst, dst, rebirth.rate, turn, !mine);
    return d;
  };
  const fire = (src: Unit, s: TSpec, own: Unit[], foe: Unit[], mine: boolean, turn: number, mainTarget?: Unit) => {
    const targets = mainTarget && s.kind === "突撃" ? [mainTarget] : pick(alive(foe), s.targets);
    for (const d of s.dmg) for (const t of targets) if (t.troops > 0) damage(src, t, d.type, d.rate, mine, turn);
    if (s.dmg.length && targets.length > 1 && mine) hits++;
    if (s.healCut) for (const t of targets) { t.healCutUntil = turn + 2; t.healCut = s.healCut; }
    if (s.ctrl) for (const t of targets) if (Math.random() < 0.5) { t.stunned = true; if (mine) ctrls++; }
    if (s.heal) { const ally = alive(own).sort((x, y) => x.troops / x.max - y.troops / y.max); for (const t of s.healAll ? ally.slice(0, 2) : ally.slice(0, 1)) doHeal(src, t, s.heal, turn, mine); }
    for (const [k, v] of Object.entries(s.grant)) { const who = k === "回生" ? alive(own).sort((x, y) => x.troops - y.troops)[0] : src; if (who) who.status[k as keyof Unit["status"]] = { rate: v!, until: turn + 2 }; }
  };
  const act = (u: Unit, own: Unit[], foe: Unit[], mine: boolean, turn: number) => {
    const rest = active(u, "休養", turn); if (rest) doHeal(u, u, rest.rate, turn, mine);
    for (const s of u.pending.splice(0)) fire(u, s, own, foe, mine, turn);
    if (u.stunned) { u.stunned = false; return; }
    for (const s of u.specs) {
      if (s.kind === "能動" && Math.random() < s.prob) { if (s.prepare) u.pending.push(s); else fire(u, s, own, foe, mine, turn); }
      else if (s.kind !== "能動" && s.kind !== "突撃" && s.heal && Math.random() < s.inner) fire(u, { ...s, dmg: [] }, own, foe, mine, turn);
    }
    const target = pick(alive(foe), 1)[0]; if (!target) return;
    damage(u, target, "兵刃", 100, mine, turn); // 通常攻撃
    for (const s of u.specs) if (s.kind === "突撃" && Math.random() < s.prob) fire(u, s, own, foe, mine, turn, target);
  };
  for (let turn = 0; turn < 8; turn++) {
    const order = [...A.map(u => ({ u, mine: true })), ...B.map(u => ({ u, mine: false }))].filter(x => x.u.troops > 0).sort((x, y) => y.u.st[3] - x.u.st[3] + (Math.random() - 0.5) * 20);
    for (const { u, mine } of order) {
      if (u.troops <= 0) continue;
      if (mine) act(u, A, B, true, turn); else act(u, B, A, false, turn);
      if ((A[0]?.troops ?? 0) <= 0 || (B[0]?.troops ?? 0) <= 0) break;
    }
    if ((A[0]?.troops ?? 0) <= 0 || (B[0]?.troops ?? 0) <= 0) break;
  }
  const sum = (u: Unit[]) => u.reduce((s, x) => s + x.troops, 0);
  let outcome: BattleStat["outcome"];
  if ((B[0]?.troops ?? 0) <= 0 && (A[0]?.troops ?? 0) > 0) outcome = 0;
  else if ((A[0]?.troops ?? 0) <= 0 && (B[0]?.troops ?? 0) > 0) outcome = 4;
  else { const r = sum(A) / Math.max(1, sum(B)); outcome = r > 1.15 ? 1 : r < 0.87 ? 3 : 2; }
  return { outcome, dealt, taken, peak, hits, healed, ctrls };
}

export type SimResult = { counts: number[]; total: number; metrics: number[]; score: number; tier: string; perOpponent: { label: string; win: number }[] };
export function runSimulation(test: Squad, opponents: { label: string; squad: Squad }[], perMatch: number): SimResult {
  const counts = [0, 0, 0, 0, 0]; let dealt = 0, taken = 0, peak = 0, hits = 0, healed = 0, ctrls = 0;
  const perOpponent = opponents.map(o => {
    let w = 0;
    for (let i = 0; i < perMatch; i++) { const r = fight(test, o.squad); counts[r.outcome] = (counts[r.outcome] ?? 0) + 1; if (r.outcome <= 1) w++; dealt += r.dealt; taken += r.taken; peak += r.peak; hits += r.hits; healed += r.healed; ctrls += r.ctrls; }
    return { label: o.label, win: (w / perMatch) * 100 };
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
