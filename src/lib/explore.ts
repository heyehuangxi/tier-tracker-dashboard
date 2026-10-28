import { MAX_COST, pointsFor, TROOP_TYPES, type General, type Squad, type Tactic, type TroopType } from "./sengoku-data";

/**
 * ランダム編成探索（要望4: 無差別に組んで連戦させ、強かった編成を探す）。
 * 全探索ではなくランダム抽出。候補は全員0凸で固定し、能力ポイントは各武将の最大ステータスへ全振りする
 * （テンプレ側も0凸時は得意ステータスへ50pt配分されるため、条件を揃える）。
 */

const pick = <T,>(arr: readonly T[], rand: () => number): T => arr[Math.floor(rand() * arr.length)]!;

function shuffled<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/** 戦法の対応兵種が部隊兵種で使えるか（「騎馬」表記は騎兵として扱う） */
export function tacticTroopCompatible(t: Tactic, troop: TroopType): boolean {
  if (t.troop === "全兵種") return true;
  if (t.troop === troop) return true;
  if (t.troop === "騎馬" && troop === "騎兵") return true;
  return false;
}

/** 0凸分の能力ポイントを最大ステータスへ全振りした配分 */
export function allocForGeneral(g: General): number[] {
  const out = [0, 0, 0, 0];
  let best = 0;
  g.stats.forEach((v, i) => { if (v > (g.stats[best] ?? 0)) best = i; });
  out[best] = pointsFor(0);
  return out;
}

/**
 * ランダムな1部隊を生成する。条件: 武将3名（重複なし）・コスト合計 MAX_COST 以下・
 * 伝授戦法6つ（重複なし、対応兵種に合うものを優先）・兵種はランダム。
 * プール不足やコスト超過が続く場合は null を返す。
 */
export function generateRandomSquad(generals: readonly General[], tactics: readonly Tactic[], rand: () => number = Math.random): Squad | null {
  if (generals.length < 3 || tactics.length < 6) return null;
  for (let attempt = 0; attempt < 200; attempt++) {
    const picked = shuffled(generals, rand).slice(0, 3);
    if (picked.reduce((a, g) => a + g.cost, 0) > MAX_COST) continue;
    const troop = pick(TROOP_TYPES, rand);
    const compatible = shuffled(tactics.filter(t => tacticTroopCompatible(t, troop)), rand);
    const rest = shuffled(tactics.filter(t => !tacticTroopCompatible(t, troop)), rand);
    const chosen = [...compatible, ...rest].slice(0, 6);
    if (chosen.length < 6) return null;
    return {
      troop,
      generals: picked.map(g => g.id),
      tactics: chosen.map(t => t.id),
      ranks: [0, 0, 0],
      alloc: picked.map(allocForGeneral),
    };
  }
  return null;
}

/** 同一編成の重複排除キー（武将の並び＋戦法の並び） */
export const candidateKey = (q: Squad): string => `${q.generals.join(",")}|${q.tactics.join(",")}|${q.troop ?? ""}`;

/** 勝敗カウント（[勝ち, 優勢, 引分, 劣勢, 負け]）から 0〜1 の総合スコアを作る */
export function outcomeScore(counts: number[], total: number): number {
  if (!total) return 0;
  const w = [1, 0.75, 0.5, 0.25, 0];
  return counts.reduce((a, c, i) => a + c * (w[i] ?? 0), 0) / total;
}
