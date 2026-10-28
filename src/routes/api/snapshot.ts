import { createFileRoute } from "@tanstack/react-router";
import { GAME_CFG_URL, resolveSnapshot, snapshotApiUrl, type GameCfg, type GameSnapshot } from "@/lib/snapshot";

/**
 * ゲーム内共有リンクの取り込み用プロキシ。
 * ゲーム側APIには CORS ヘッダーが無くブラウザから直接読めないため、サーバー側で取得して
 * 当サイトの武将/戦法IDに解決した結果だけを返す。データは保存しない。
 */

let cfgCache: { at: number; cfg: GameCfg } | null = null;
const CFG_TTL_MS = 10 * 60 * 1000;

async function loadCfg(): Promise<GameCfg> {
  if (cfgCache && Date.now() - cfgCache.at < CFG_TTL_MS) return cfgCache.cfg;
  const res = await fetch(GAME_CFG_URL, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`cfg ${res.status}`);
  const cfg = (await res.json()) as GameCfg;
  cfgCache = { at: Date.now(), cfg };
  return cfg;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/snapshot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("snapshot_id") ?? "";
        if (!/^[A-Za-z0-9]{16,64}$/.test(id)) return json({ error: "snapshot_id の形式が正しくありません" }, 400);
        try {
          const snapRes = await fetch(snapshotApiUrl(id), { headers: { "user-agent": "Mozilla/5.0", referer: "https://general.qookkagames.com/" } });
          if (!snapRes.ok) return json({ error: "ゲーム側からスナップショットを取得できませんでした" }, 502);
          const snap = (await snapRes.json()) as GameSnapshot & { code?: number };
          const heros = (snap.data ?? []).flatMap(p => p.player_data?.heros ?? []);
          if (!heros.length) return json({ error: "スナップショットに武将データがありませんでした（リンクの期限切れの可能性があります）" }, 404);
          const cfg = await loadCfg();
          return json(resolveSnapshot(cfg, snap));
        } catch {
          return json({ error: "ゲーム側への接続に失敗しました。時間をおいて再度お試しください" }, 502);
        }
      },
    },
  },
});
