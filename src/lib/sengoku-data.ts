// 武将：提供マスターデータ（名将・良将）／戦法：デモ用ダミー
import MASTER from "./generals-master.json";
export type Stats = [number, number, number, number]; // 統率・武勇・知略・速度（Lv50）
export type General = { id: string; name: string; rarity: 5 | 4; faction: string; cost: number; stats: Stats; main: string; r1: string; r3: string; r5: string; inherent: string };
export type Tactic = { id: string; name: string; grade: "S" | "A"; kind: string };
const t = (name: string, grade: "S" | "A", kind: string): Tactic => ({ id: `t-${name}`, name, grade, kind });

export const FACTIONS = ["織田", "豊臣", "徳川", "武田", "上杉", "群雄"] as const;
export const STAT_NAMES = ["統率", "武勇", "知略", "速度"] as const;
export const LEVEL = 50;
export const pointsFor = (rank: number) => 50 + rank * 10;
export const unlockedSkills = (g: General, rank: number) => [[1, g.r1], [3, g.r3], [5, g.r5]].filter(([r, n]) => rank >= (r as number) && n && n !== "-") as [number, string][];

type M = { f: string; n: string; r: 5 | 4; c: number; s: Stats; m: string; k1: string; k3: string; k5: string; i: string };
export const GENERALS: General[] = (MASTER as M[]).map(x => ({ id: `g-${x.n}`, name: x.n, rarity: x.r, faction: x.f, cost: x.c, stats: x.s, main: x.m, r1: x.k1, r3: x.k3, r5: x.k5, inherent: x.i })).sort((a, b) => b.cost - a.cost);

export const TACTICS: Tactic[] = [
  t("天下布武", "S", "指揮"), t("風林火山", "S", "能動"), t("車懸りの陣", "S", "陣法"), t("三本の矢", "S", "指揮"),
  t("鬼島津", "S", "突撃"), t("日ノ本一の兵", "S", "能動"), t("三段撃ち", "S", "能動"), t("今孔明", "S", "指揮"),
  t("天下人の器", "S", "受動"), t("神速", "S", "突撃"), t("鉄壁", "S", "受動"), t("一騎当千", "S", "能動"),
  t("兵糧攻め", "A", "能動"), t("奇襲", "A", "突撃"), t("鼓舞", "A", "指揮"), t("挟撃", "A", "能動"),
  t("火計", "A", "能動"), t("籠城", "A", "受動"), t("連撃", "A", "突撃"), t("治療", "A", "受動"),
  t("離間", "A", "能動"), t("槍衾", "A", "陣法"),
];

export const generalById = new Map(GENERALS.map(x => [x.id, x]));
export const tacticById = new Map(TACTICS.map(x => [x.id, x]));

export const MAX_SQUADS = 10;
export const MAX_SAVED = 20;
export type Squad = { generals: (string | null)[]; tactics: (string | null)[]; ranks?: number[]; alloc?: number[][] }; // 武将3・伝授戦法6（各武将2枠）。固有戦法は武将から自動決定
export type Mode = "coexist" | "free";
export type Formation = { mode: Mode; squads: Squad[] };
export type SavedFormation = Formation & { id: string; name: string; createdAt: string };

export const emptySquad = (): Squad => ({ generals: [null, null, null], tactics: [null, null, null, null, null, null], ranks: [0, 0, 0], alloc: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
const clampRank = (n: unknown) => Math.max(0, Math.min(5, Math.floor(Number(n) || 0)));
export function normSquad(q: Squad): Squad {
  const ranks = [0, 1, 2].map(i => clampRank(q?.ranks?.[i]));
  const alloc = [0, 1, 2].map(i => { let left = pointsFor(ranks[i]!); return [0, 1, 2, 3].map(k => { const v = Math.max(0, Math.min(left, Math.floor(Number(q?.alloc?.[i]?.[k]) || 0))); left -= v; return v; }); });
  return { generals: [0, 1, 2].map(i => (generalById.has(q?.generals?.[i] ?? "") ? q.generals[i]! : null)), tactics: [0, 1, 2, 3, 4, 5].map(i => (tacticById.has(q?.tactics?.[i] ?? "") ? q.tactics[i]! : null)), ranks, alloc };
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
