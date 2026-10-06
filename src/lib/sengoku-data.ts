// デモ用のダミーデータ（実際のゲームデータではありません）
export type General = { id: string; name: string; rarity: 5 | 4; faction: string; type: string };
export type Tactic = { id: string; name: string; grade: "S" | "A"; kind: string };

const g = (name: string, rarity: 5 | 4, faction: string, type: string): General => ({ id: `g-${name}`, name, rarity, faction, type });
const t = (name: string, grade: "S" | "A", kind: string): Tactic => ({ id: `t-${name}`, name, grade, kind });

export const GENERALS: General[] = [
  g("織田信長", 5, "織田", "騎兵"), g("豊臣秀吉", 5, "豊臣", "足軽"), g("徳川家康", 5, "徳川", "弓兵"),
  g("武田信玄", 5, "武田", "騎兵"), g("上杉謙信", 5, "上杉", "騎兵"), g("黒田官兵衛", 5, "豊臣", "弓兵"),
  g("ねね", 5, "豊臣", "足軽"), g("真田幸村", 5, "真田", "騎兵"), g("伊達政宗", 5, "伊達", "鉄砲"),
  g("島津義弘", 5, "島津", "足軽"), g("毛利元就", 5, "毛利", "弓兵"), g("明智光秀", 5, "織田", "鉄砲"),
  g("本多忠勝", 5, "徳川", "騎兵"), g("立花誾千代", 5, "大友", "鉄砲"), g("竹中半兵衛", 5, "豊臣", "弓兵"),
  g("前田利家", 4, "織田", "足軽"), g("柴田勝家", 4, "織田", "足軽"), g("石田三成", 4, "豊臣", "弓兵"),
  g("加藤清正", 4, "豊臣", "足軽"), g("福島正則", 4, "豊臣", "騎兵"), g("井伊直政", 4, "徳川", "騎兵"),
  g("山県昌景", 4, "武田", "騎兵"), g("直江兼続", 4, "上杉", "弓兵"), g("片倉景綱", 4, "伊達", "弓兵"),
  g("鈴木重秀", 4, "雑賀", "鉄砲"), g("今川義元", 4, "今川", "足軽"), g("北条氏康", 4, "北条", "弓兵"),
];

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
export type Squad = { generals: (string | null)[]; tactics: (string | null)[] }; // 武将3・戦法6（各武将2枠）
export type Mode = "coexist" | "free";
export type Formation = { mode: Mode; squads: Squad[] };
export type SavedFormation = Formation & { id: string; name: string; createdAt: string };

export const emptySquad = (): Squad => ({ generals: [null, null, null], tactics: [null, null, null, null, null, null] });

export function encodeFormation(f: Formation & { name?: string }) {
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
    return { mode: f.mode, name: typeof f.name === "string" ? f.name : undefined, squads: f.squads.slice(0, MAX_SQUADS).map((q: Squad) => ({ generals: [0, 1, 2].map(i => (generalById.has(q?.generals?.[i] ?? "") ? q.generals[i] : null)), tactics: [0, 1, 2, 3, 4, 5].map(i => (tacticById.has(q?.tactics?.[i] ?? "") ? q.tactics[i] : null)) })) };
  } catch { return null; }
}
