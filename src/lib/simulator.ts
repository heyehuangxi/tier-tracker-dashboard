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
type Unit = { st: Stats; troops: number; dmgPow: number; rate: number; heal: number; ctrl: number; baggage: boolean; healBlockedUntil: number };
const FALLBACK: Stats = [160, 150, 160, 100];
function buildUnits(q: Squad): Unit[] {
  const bonus = hasFactionBonus(q.generals);
  return [0, 1, 2].map(i => {
    const id = q.generals[i]; const g = id ? generalById.get(id) : undefined;
    const base = g?.stats ?? FALLBACK; const al = q.alloc?.[i] ?? [0, 0, 0, 0];
    const st = base.map((v, k) => buffed(v + (al[k] ?? 0), bonus)) as Stats;
    const ts = [q.tactics[i * 2], q.tactics[i * 2 + 1]].map(id => (id ? tacticById.get(id) : undefined));
    const grade = ts.reduce((a, t) => a + (t ? (t.grade === "S" ? 1 : 0.6) : 0.3), 0);
    const text = ts.map(t => t?.effect ?? "").join("");
    void effectiveFaction;
    return { st, troops: i === 0 ? 10000 : 9000, dmgPow: 1 + grade * 0.25, rate: 0.35 + grade * 0.08, baggage: ts.some(t => t?.name === "荷駄崩し"), healBlockedUntil: -1, heal: ts.some(t => t && /回復/.test(t.effect) && !/受ける回復|被回復率低下/.test(t.effect)) ? 1 : 0, ctrl: /(混乱|封撃|無策|威圧|麻痺)/.test(text) ? 1 : 0 };
  });
}

export type BattleStat = { outcome: 0 | 1 | 2 | 3 | 4; dealt: number; taken: number; peak: number; hits: number; healed: number; ctrls: number };
function fight(a: Squad, b: Squad): BattleStat {
  const A = buildUnits(a), B = buildUnits(b);
  let dealt = 0, taken = 0, peak = 0, hits = 0, healed = 0, ctrls = 0;
  const alive = (u: Unit[]) => u.filter(x => x.troops > 0);
  const hit = (src: Unit, dst: Unit[], mine: boolean, stunned: boolean, turn: number) => {
    const live = alive(dst); if (!live.length || stunned) return false;
    const tactic = Math.random() < src.rate;
    const atk = tactic ? src.st[2] : src.st[1];
    const randomTarget = live[Math.floor(Math.random() * live.length)];
    const targets = tactic && Math.random() < 0.5 ? live : randomTarget ? [randomTarget] : [];
    const multiplier = mine ? troopDamageMultiplier(a.troop, b.troop) : troopDamageMultiplier(b.troop, a.troop);
    let ctrl = false;
    for (const t of targets) {
      const d = Math.max(80, (atk * 1.6 - t.st[0] * 0.9) * (src.dmgPow) * (tactic ? 1.4 : 1) * (0.8 + Math.random() * 0.4) * Math.sqrt(src.troops / 9000) * 4.2) * multiplier;
      t.troops = Math.max(0, t.troops - d);
      if (mine) { dealt += d; peak = Math.max(peak, d); if (targets.length > 1) hits++; } else taken += d;
    }
    if (src.baggage && Math.random() < 0.4) {
      const targets = [...alive(dst)].sort(() => Math.random() - 0.5).slice(0, 2);
      for (const target of targets) {
        const damage = Math.max(80, (src.st[2] * 1.28 - target.st[2] * 0.5) * 4.2 * Math.sqrt(src.troops / 9000)) * multiplier;
        target.troops = Math.max(0, target.troops - damage); target.healBlockedUntil = turn + 2;
        if (mine) { dealt += damage; peak = Math.max(peak, damage); hits++; } else taken += damage;
      }
    }
    if (tactic && src.ctrl && Math.random() < 0.3) { ctrl = true; if (mine) ctrls++; }
    if (src.heal && Math.random() < 0.3) { const own = mine ? A : B; const w = alive(own).sort((x, y) => x.troops - y.troops)[0]; if (w) { const h = Math.min((src.st[2] * 3) * (turn < w.healBlockedUntil ? 0.5 : 1), (own.indexOf(w) === 0 ? 10000 : 9000) - w.troops); w.troops += h; if (mine) healed += h; } }
    return ctrl;
  };
  let stunA = false, stunB = false;
  for (let turn = 0; turn < 8; turn++) {
    const order = [...A.map(u => ({ u, mine: true })), ...B.map(u => ({ u, mine: false }))].filter(x => x.u.troops > 0).sort((x, y) => y.u.st[3] - x.u.st[3] + (Math.random() - 0.5) * 20);
    let nA = false, nB = false;
    for (const { u, mine } of order) {
      if (u.troops <= 0) continue;
      if (mine) { if (hit(u, B, true, stunA && Math.random() < 0.5, turn)) nB = true; } else if (hit(u, A, false, stunB && Math.random() < 0.5, turn)) nA = true;
      if ((A[0]?.troops ?? 0) <= 0 || (B[0]?.troops ?? 0) <= 0) break;
    }
    stunA = nA; stunB = nB;
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
