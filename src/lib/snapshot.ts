import { generalById, tacticById } from "./sengoku-data";
import PORTRAIT_MASTER from "./portrait-master.json";

/**
 * ゲーム内共有リンク（戦備庫スナップショット）の取り込み。
 * ゲーム側API・設定ファイルには CORS ヘッダーが無くブラウザから直接読めないため、
 * 取得はサーバー側（/api/snapshot）で行い、ここではID→当サイトの武将/戦法IDへの解決だけを行う。
 * 解決ルール: 公式設定の多言語表（簡体字名→日本語名）で照合し、武将はアイコンのピンイン
 * （顔写真の対応表と同一）でも照合する。一部の公式訳と当サイト表記の差は別名表で吸収する。
 */

export const SNAPSHOT_API_BASE = "https://p11386-platform.qookkagames.com/sns/web/api/cache/get_player_share_snapshot";
export const GAME_CFG_URL = "https://p11386-media-cdn.qookkagames.com/P11386/sns/public_config/release/cfg.json";

export const snapshotApiUrl = (snapshotId: string) =>
  `${SNAPSHOT_API_BASE}?_json=${encodeURIComponent(JSON.stringify({ game_id: "s11", selectors: ["snapshot_hero_pack"], snapshot_id: snapshotId }))}`;

/** 貼り付けられた共有リンク（またはIDそのもの）から snapshot_id を取り出す */
export function parseSnapshotId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/snapshot_id=([A-Za-z0-9]+)/);
  if (m) return m[1]!;
  if (/^[A-Za-z0-9]{16,64}$/.test(s)) return s;
  return null;
}

type CfgHero = { id: number; name: string; icon?: string };
type CfgSkill = { id: number; name: string };
type CfgLang = { id: string; ja?: string };
export type GameCfg = { hero: CfgHero[]; skill: CfgSkill[]; multi_lang: CfgLang[] };
export type GameSnapshot = { data?: { player_data?: { heros?: { id: string }[]; skills?: { id: string }[]; hero_count?: number; skill_count?: number } }[] };

export type ResolvedOwned = {
  generals: string[];
  tactics: string[];
  unresolvedGenerals: string[];
  unresolvedTactics: string[];
  heroCount: number;
  skillCount: number;
};

const GENERAL_NAME_ALIASES: Record<string, string> = { "瑞渓院": "瑞溪院" };
const TACTIC_NAME_ALIASES: Record<string, string> = { "薩摩鉄砲兵": "薩摩鉄砲隊" };
const TACTIC_CN_ALIASES: Record<string, string> = { "百战炼磨": "百戦錬磨" };

const PINYIN_TO_GENERAL = new Map<string, string>();
for (const [name, file] of Object.entries(PORTRAIT_MASTER as Record<string, string>)) PINYIN_TO_GENERAL.set(file, name);

export function resolveSnapshot(cfg: GameCfg, snap: GameSnapshot): ResolvedOwned {
  const ja = new Map<string, string>();
  for (const e of cfg.multi_lang ?? []) if (e.ja) ja.set(e.id, e.ja);
  const heroById = new Map((cfg.hero ?? []).map(h => [String(h.id), h]));
  const skillById = new Map((cfg.skill ?? []).map(s => [String(s.id), s]));
  const parts = snap.data ?? [];
  const heros = parts.flatMap(p => p.player_data?.heros ?? []);
  const skills = parts.flatMap(p => p.player_data?.skills ?? []);

  const generals: string[] = [];
  const unresolvedGenerals: string[] = [];
  for (const h of heros) {
    const c = heroById.get(h.id);
    if (!c) { unresolvedGenerals.push(`ID:${h.id}`); continue; }
    const jp = ja.get(c.name) ?? c.name;
    const aliased = GENERAL_NAME_ALIASES[jp] ?? jp;
    if (generalById.has(`g-${aliased}`)) { generals.push(`g-${aliased}`); continue; }
    const file = (c.icon ?? "").split("/").pop()?.replace(/\.png$/, "");
    const byPinyin = file ? PINYIN_TO_GENERAL.get(file) : undefined;
    if (byPinyin && generalById.has(`g-${byPinyin}`)) { generals.push(`g-${byPinyin}`); continue; }
    unresolvedGenerals.push(jp);
  }

  const tactics: string[] = [];
  const unresolvedTactics: string[] = [];
  for (const s of skills) {
    const c = skillById.get(s.id);
    if (!c) { unresolvedTactics.push(`ID:${s.id}`); continue; }
    const jp = ja.get(c.name);
    const name = (jp && (TACTIC_NAME_ALIASES[jp] ?? jp)) ?? TACTIC_CN_ALIASES[c.name] ?? jp ?? c.name;
    if (tacticById.has(`t-${name}`)) { tactics.push(`t-${name}`); continue; }
    unresolvedTactics.push(jp ?? c.name);
  }

  return {
    generals: [...new Set(generals)],
    tactics: [...new Set(tactics)],
    unresolvedGenerals,
    unresolvedTactics,
    heroCount: heros.length,
    skillCount: skills.length,
  };
}
