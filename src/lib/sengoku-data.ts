// 武将：提供マスターデータ（名将・良将）／戦法：提供マスターデータ（S・A）
import MASTER from "./generals-master.json";
import PORTRAIT_MASTER from "./portrait-master.json";
import TACTICS_MASTER from "./tactics-master.json";
import INHERENT_MASTER from "./inherent-master.json";
import TRAITS_MASTER from "./traits-master.json";
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
/** 所持管理の初期値用: 全武将・全戦法のID（初回は全所持から未所持を外す方式） */
export const ALL_GENERAL_IDS = GENERALS.map(g => g.id);
export const ALL_TACTIC_IDS = TACTICS.map(t => t.id);
export const tacticTip = (x: Tactic) => `${x.name}［${x.grade}・${x.kind}］\n発動確率: ${x.rate}\n対応兵種: ${x.troop}\n効果: ${x.effect}`;

// 顔写真: SLGSIM（https://slgsim.com/generals）の武将画像を外部参照する。対応表は portrait-master.json（武将名→画像ファイル名）。
// 先方に画像自体がない武将（松平信康・伊達輝宗・鬼庭左月斎）と、先方の一覧にいない武将は undefined（UI側で頭文字アイコンにフォールバック）。
const PORTRAIT_FILES = PORTRAIT_MASTER as Record<string, string>;
/** マスター側の表記ゆれ吸収（瑞溪院は先方の表記が瑞渓院） */
const PORTRAIT_ALIASES: Record<string, string> = { "瑞溪院": "瑞渓院" };
export const portraitUrlForName = (name: string): string | undefined => {
  const file = PORTRAIT_FILES[name] ?? PORTRAIT_FILES[PORTRAIT_ALIASES[name] ?? ""];
  return file ? `https://slgsim.com/images/hero/${file}.png` : undefined;
};
export const portraitUrlForGeneral = (g: General): string | undefined => portraitUrlForName(g.name);

export const generalById = new Map(GENERALS.map(x => [x.id, x]));
export const tacticById = new Map(TACTICS.map(x => [x.id, x]));

// 固有戦法マスター（提供データ: inherent-tactics.tsv を変換した inherent-master.json）
export type InherentTactic = { name: string; holder: string; grade: "S" | "A"; kind: string; rate: string; prep: number; effect: string; leader: string };
type IM = { n: string; holder: string; g: "S" | "A"; k: string; r: string; prep: string; e: string; leader: string };
export const INHERENT_TACTICS: InherentTactic[] = (INHERENT_MASTER as IM[]).map(x => ({ name: x.n, holder: x.holder, grade: x.g, kind: x.k, rate: x.r, prep: x.prep === "-" ? 0 : Number(x.prep) || 0, effect: x.e, leader: x.leader }));
// 特性マスター（提供データ: traits.tsv を変換した traits-master.json。名称→効果の対応表）
export type Trait = { name: string; category: string; effect: string };
type TRM = { n: string; g: string; e: string };
export const TRAITS: Trait[] = (TRAITS_MASTER as TRM[]).map(x => ({ name: x.n, category: x.g, effect: x.e }));
export const traitByName = new Map(TRAITS.map(x => [x.name, x]));
/** 武将マスター側の表記ゆれを吸収して特性を引く（半角ローマ数字→全角、知略Ⅱはマスター側の誤記で知恵Ⅱを指す） */
const TRAIT_ALIASES: Record<string, string> = { "知略Ⅱ": "知恵Ⅱ" };
const ROMAN_FULL: Record<string, string> = { I: "Ⅰ", II: "Ⅱ", III: "Ⅲ" };
const normalizeTraitName = (name: string) => name.replace(/(I{1,3})$/, m => ROMAN_FULL[m] ?? m);
export const traitFor = (name: string | undefined): Trait | undefined => {
  if (!name || name === "-") return undefined;
  return traitByName.get(name) ?? traitByName.get(TRAIT_ALIASES[name] ?? "") ?? traitByName.get(normalizeTraitName(name));
};
/** 凸数に応じて有効になる特性名（無凸の金帯＋1凸・3凸・5凸） */
export const activeTraitNames = (g: General, rank: number): string[] => [g.main, ...(rank >= 1 ? [g.r1] : []), ...(rank >= 3 ? [g.r3] : []), ...(rank >= 5 ? [g.r5] : [])].filter(n => n && n !== "-");

/** 所持武将名 → 固有戦法 */
export const inherentByHolder = new Map(INHERENT_TACTICS.map(x => [x.holder, x]));
export const inherentByName = new Map(INHERENT_TACTICS.map(x => [x.name, x]));

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

// 所持リストの読み込みリンク: マスター順のビットセットを base64url 化する（?o= パラメータ用）。
// ゲーム内共有リンクは CORS のためサイトから直接読めないので、変換済みIDリストをこの形式で受け渡す。
const b64urlEncodeBytes = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecodeBytes = (s: string): Uint8Array | null => { try { return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); } catch { return null; } };
const bitsOfIds = (ids: string[], all: readonly { id: string }[]) => { const bytes = new Uint8Array(Math.ceil(all.length / 8)); all.forEach((x, i) => { if (ids.includes(x.id)) bytes[i >> 3] = (bytes[i >> 3] ?? 0) | (1 << (i & 7)); }); return bytes; };
const idsFromBits = (bytes: Uint8Array, all: readonly { id: string }[]) => all.filter((_, i) => (i >> 3) < bytes.length && (((bytes[i >> 3] ?? 0) >> (i & 7)) & 1) === 1).map(x => x.id);
export function encodeOwned(g: string[], t: string[]): string {
  const gb = bitsOfIds(g, GENERALS); const tb = bitsOfIds(t, TACTICS);
  const all = new Uint8Array(gb.length + tb.length); all.set(gb); all.set(tb, gb.length);
  return "1" + b64urlEncodeBytes(all);
}
export function decodeOwned(s: string): { g: string[]; t: string[] } | null {
  if (!s.startsWith("1")) return null;
  const bytes = b64urlDecodeBytes(s.slice(1));
  const gl = Math.ceil(GENERALS.length / 8); const tl = Math.ceil(TACTICS.length / 8);
  if (!bytes || bytes.length !== gl + tl) return null;
  return { g: idsFromBits(bytes.slice(0, gl), GENERALS), t: idsFromBits(bytes.slice(gl), TACTICS) };
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
