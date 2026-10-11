// 武将：提供マスターデータ（名将・良将）／戦法：提供マスターデータ（S・A）
import MASTER from "./generals-master.json";
import TACTICS_MASTER from "./tactics-master.json";
export type Stats = [number, number, number, number]; // 統率・武勇・知略・速度（Lv50）
export type General = { id: string; name: string; rarity: 5 | 4; faction: string; cost: number; stats: Stats; main: string; r1: string; r3: string; r5: string; inherent: string };
export type Tactic = { id: string; name: string; grade: "S" | "A"; kind: string; rate: string; troop: string; effect: string };

export const FACTIONS = ["織田", "豊臣", "徳川", "武田", "上杉", "群雄"] as const;
export const STAT_NAMES = ["統率", "武勇", "知略", "速度"] as const;
export const LEVEL = 50;
export const pointsFor = (rank: number) => 50 + rank * 10;
export const unlockedSkills = (g: General, rank: number) => [[1, g.r1], [3, g.r3], [5, g.r5]].filter(([r, n]) => rank >= (r as number) && n && n !== "-") as [number, string][];

type M = { f: string; n: string; r: 5 | 4; c: number; s: Stats; m: string; k1: string; k3: string; k5: string; i: string };
export const GENERALS: General[] = (MASTER as M[]).map(x => ({ id: `g-${x.n}`, name: x.n, rarity: x.r, faction: x.f, cost: x.c, stats: x.s, main: x.m, r1: x.k1, r3: x.k3, r5: x.k5, inherent: x.i })).sort((a, b) => b.cost - a.cost);

type TM = { n: string; g: "S" | "A"; k: string; r: string; t: string; e: string };
export const TACTICS: Tactic[] = (TACTICS_MASTER as TM[]).map(x => ({ id: `t-${x.n}`, name: x.n, grade: x.g, kind: x.k, rate: x.r, troop: x.t, effect: x.e }));
export const TACTIC_KINDS = [...new Set(TACTICS.map(x => x.kind))];
export const tacticTip = (x: Tactic) => `${x.name}［${x.grade}・${x.kind}］\n発動確率: ${x.rate}\n対応兵種: ${x.troop}\n効果: ${x.effect}`;

export const generalById = new Map(GENERALS.map(x => [x.id, x]));
export const tacticById = new Map(TACTICS.map(x => [x.id, x]));

export const MAX_SQUADS = 10;
export const MAX_SAVED = 20;
export const TROOP_TYPES = ["騎兵", "弓兵", "鉄砲", "足軽"] as const;
export type TroopType = typeof TROOP_TYPES[number];
export const normalizeTroop = (value: unknown): TroopType => TROOP_TYPES.find(troop => troop === value) ?? "足軽";
export const TROOP_ADVANTAGE: Record<TroopType, TroopType> = { 騎兵: "弓兵", 弓兵: "鉄砲", 鉄砲: "足軽", 足軽: "騎兵" };
// 簡易モデルの相性補正：有利+15%、不利-15%、同種・対角は補正なし。
export function troopDamageMultiplier(attacker: unknown, defender: unknown): number {
  const a = normalizeTroop(attacker), b = normalizeTroop(defender);
  return TROOP_ADVANTAGE[a] === b ? 1.125 : TROOP_ADVANTAGE[b] === a ? 0.875 : 1;
}
export type Squad = { troop?: TroopType; generals: (string | null)[]; tactics: (string | null)[]; ranks?: number[]; alloc?: number[][] }; // 武将3・伝授戦法6（各武将2枠）。固有戦法は武将から自動決定
export type Mode = "coexist" | "free";
export type Formation = { mode: Mode; squads: Squad[] };
export type SavedFormation = Formation & { id: string; name: string; createdAt: string };

export const emptySquad = (): Squad => ({ troop: "足軽", generals: [null, null, null], tactics: [null, null, null, null, null, null], ranks: [0, 0, 0], alloc: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
const clampRank = (n: unknown) => Math.max(0, Math.min(5, Math.floor(Number(n) || 0)));
export function normSquad(q: Squad): Squad {
  const ranks = [0, 1, 2].map(i => clampRank(q?.ranks?.[i]));
  const alloc = [0, 1, 2].map(i => { let left = pointsFor(ranks[i]!); return [0, 1, 2, 3].map(k => { const v = Math.max(0, Math.min(left, Math.floor(Number(q?.alloc?.[i]?.[k]) || 0))); left -= v; return v; }); });
  return { troop: normalizeTroop(q?.troop), generals: [0, 1, 2].map(i => (generalById.has(q?.generals?.[i] ?? "") ? q.generals[i] ?? null : null)), tactics: [0, 1, 2, 3, 4, 5].map(i => (tacticById.has(q?.tactics?.[i] ?? "") ? q.tactics[i] ?? null : null)), ranks, alloc };
}

export function encodeFormation(f: Formation & { name?: string | undefined }) {
  const json = JSON.stringify(f);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeFormation(s: string): (Formation & { name?: string }) | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const f = JSON.parse(new TextDecoder().decode(bytes));
    if (!f || !Array.isArray(f.squads) || (f.mode !== "coexist" && f.mode !== "free")) return null;
    return { mode: f.mode, name: typeof f.name === "string" ? f.name : undefined, squads: f.squads.slice(0, MAX_SQUADS).map(normSquad) };
  } catch { return null; }
}

// 部隊ルール
export const MAX_COST = 20;
export const FACTION_BONUS = 0.07;
export const SANADA_ID = "g-真田昌幸";
/** 真田昌幸は副将時に大将の勢力へ変化。大将時は本来の勢力のまま。 */
export function effectiveFaction(gens: (string | null)[], slot: number): string | undefined {
  const id = gens[slot]; const g = id ? generalById.get(id) : undefined; if (!g) return undefined;
  if (g.id === SANADA_ID && slot > 0) { const lead = gens[0] ? generalById.get(gens[0]) : undefined; if (lead) return lead.faction; }
  return g.faction;
}
export const squadCost = (gens: (string | null)[]) => gens.reduce((a, id) => a + (id ? generalById.get(id)?.cost ?? 0 : 0), 0);
export function hasFactionBonus(gens: (string | null)[]) {
  if (gens.some(x => !x)) return false;
  const f = [0, 1, 2].map(i => effectiveFaction(gens, i));
  return f.every(x => x && x === f[0]);
}
export const buffed = (v: number, on: boolean) => (on ? Math.round(v * (1 + FACTION_BONUS)) : v);
