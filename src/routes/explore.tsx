import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CirclePlay, OctagonX, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { GeneralFace } from "@/components/tier/general-face";
import { GENERALS, TACTICS, MAX_COST, MAX_SAVED, generalById, normSquad, squadCost, tacticById, type SavedFormation, type Squad } from "@/lib/sengoku-data";
import { TEMPLATES, TEMPLATE_RANKS, runSimulation, templateToSquad } from "@/lib/simulator";
import { candidateKey, generateRandomSquad, outcomeScore } from "@/lib/explore";
import { readLocal, useLocal, writeLocal, KEYS } from "@/lib/use-local";

export const Route = createFileRoute("/explore")({
  head: () => ({ meta: [
    { title: "AI編成探索 | ぴえんで候" },
    { name: "description", content: "武将と戦法をランダムに組み合わせてテンプレート編成と連戦させ、強かった編成を探します。" },
    { property: "og:title", content: "AI編成探索 | ぴえんで候" },
    { property: "og:description", content: "ランダム編成を自動生成して連戦検証し、上位の編成を表示します。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="AI編成探索" description="武将・戦法を無差別に組み合わせてテンプレ15部隊と連戦させ、強かった編成を探します。"><Explore /></AppShell>,
});

type Phase = "screen" | "verify";
type Entry = { squad: Squad; counts: number[]; total: number; score: number; phase: Phase };

const SCREEN_PER_MATCH = 10;   // ふるい分け: 相手1部隊あたりの試行数
const VERIFY_PER_MATCH = 50;   // 上位の再検証: Tier測定light と同じ試行数
const VERIFY_TOP = 8;          // 再検証する上位件数
const KEEP = 10;               // 表示する上位件数

const nextFrame = () => new Promise<void>(r => setTimeout(r, 0));

function Explore() {
  const notify = useNotice();
  const [ownedG] = useLocal<string[]>(KEYS.ownedGenerals, []);
  const [ownedT] = useLocal<string[]>(KEYS.ownedTactics, []);
  const [count, setCount] = useState(50);
  const [pool, setPool] = useState<"all" | "owned">("all");
  const [enemyRank, setEnemyRank] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const cancelRef = useRef(false);

  async function run() {
    const gPool = pool === "owned" ? GENERALS.filter(g => ownedG.includes(g.id)) : GENERALS;
    const tPool = pool === "owned" ? TACTICS.filter(t => ownedT.includes(t.id)) : TACTICS;
    if (gPool.length < 3) return notify("所持武将が3名未満のため探索できません。所持管理で登録するか、プールを「全武将」にしてください。");
    if (tPool.length < 6) return notify("所持戦法が6つ未満のため探索できません。所持管理で登録するか、プールを「全戦法」にしてください。");
    cancelRef.current = false;
    setRunning(true); setResults([]);
    const opponents = TEMPLATES.map((t, i) => ({ label: `テンプレ${i + 1}`, squad: templateToSquad(t, [enemyRank, enemyRank, enemyRank]) }));
    const seen = new Set<string>();
    const best: Entry[] = [];
    const pushBest = (e: Entry) => {
      const same = best.findIndex(x => candidateKey(x.squad) === candidateKey(e.squad));
      if (same >= 0) { if (e.phase === "verify" || best[same]!.phase !== "verify") best[same] = e; }
      else best.push(e);
      best.sort((a, b) => b.score - a.score);
      if (best.length > KEEP) best.length = KEEP;
      setResults([...best]);
    };
    try {
      // 第1段階: ランダム候補を生成して軽く連戦（ふるい分け）
      let done = 0; let tries = 0;
      while (done < count && tries < count * 20) {
        if (cancelRef.current) { setProgress("中断しました"); return; }
        tries++;
        const q = generateRandomSquad(gPool, tPool);
        if (!q) break;
        const key = candidateKey(q);
        if (seen.has(key)) continue;
        seen.add(key);
        const r = runSimulation(q, opponents, SCREEN_PER_MATCH);
        pushBest({ squad: q, counts: r.counts, total: r.total, score: outcomeScore(r.counts, r.total), phase: "screen" });
        done++;
        setProgress(`ふるい分け中… 候補 ${done}/${count}（各${SCREEN_PER_MATCH}回 × ${opponents.length}部隊）`);
        await nextFrame();
      }
      // 第2段階: 上位を Tier測定light 相当の試行数で再検証
      const top = [...best].slice(0, VERIFY_TOP);
      for (let i = 0; i < top.length; i++) {
        if (cancelRef.current) { setProgress("中断しました（ふるい分け結果のみ表示）"); return; }
        const e = top[i]!;
        setProgress(`再検証中… 上位 ${i + 1}/${top.length}（各${VERIFY_PER_MATCH}回 × ${opponents.length}部隊）`);
        await nextFrame();
        const r = runSimulation(e.squad, opponents, VERIFY_PER_MATCH);
        pushBest({ squad: e.squad, counts: r.counts, total: r.total, score: outcomeScore(r.counts, r.total), phase: "verify" });
      }
      setProgress(`完了: 候補${done}件を連戦し、上位${Math.min(VERIFY_TOP, top.length)}件を再検証しました`);
      notify("編成探索が完了しました");
    } finally { setRunning(false); }
  }

  function saveEntry(e: Entry, rank: number) {
    const saved = readLocal<SavedFormation[]>(KEYS.saved, []);
    if (saved.length >= MAX_SAVED) return notify(`保存できる編成は最大${MAX_SAVED}件です。`);
    const names = e.squad.generals.map(id => generalById.get(id ?? "")?.name ?? "?").join("・");
    const item: SavedFormation = { id: crypto.randomUUID(), name: `探索${rank}位 ${names}`, createdAt: new Date().toISOString(), mode: "free", squads: [normSquad(e.squad)] };
    writeLocal(KEYS.saved, [item, ...saved]);
    notify(`「${item.name}」を保存した編成に追加しました（自由編成として保存）`);
  }

  const chip = (active: boolean) => active ? "default" as const : "outline" as const;
  return <>
    <section className="panel px-5 py-4" aria-label="探索条件">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px]">
        <div className="flex items-center gap-2"><span className="font-semibold">候補数</span>{[20, 50, 100].map(n => <Button key={n} size="sm" variant={chip(count === n)} className="h-7 px-3 text-[11px]" onClick={() => setCount(n)} disabled={running}>{n}件</Button>)}</div>
        <div className="flex items-center gap-2"><span className="font-semibold">プール</span><Button size="sm" variant={chip(pool === "all")} className="h-7 px-3 text-[11px]" onClick={() => setPool("all")} disabled={running}>全武将・全戦法</Button><Button size="sm" variant={chip(pool === "owned")} className="h-7 px-3 text-[11px]" onClick={() => setPool("owned")} disabled={running}>所持のみ</Button></div>
        <div className="flex items-center gap-2"><span className="font-semibold">敵テンプレ凸数</span>{TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={chip(enemyRank === x)} className="h-7 px-3 text-[11px]" onClick={() => setEnemyRank(x)} disabled={running}>全員{x}凸</Button>)}</div>
        {running
          ? <Button variant="destructive" className="text-xs" onClick={() => { cancelRef.current = true; }}><OctagonX />中断</Button>
          : <Button variant="simulation" className="text-xs" onClick={run}><CirclePlay />探索開始</Button>}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        候補は全探索ではなくランダム抽出です。候補の武将は全員0凸・能力ポイントは各武将の最大ステータスへ全振り、コスト合計は{MAX_COST}以下、戦法は部隊兵種に対応するものを優先して付けます。
        まず各{SCREEN_PER_MATCH}回でふるい分けし、上位{VERIFY_TOP}件を各{VERIFY_PER_MATCH}回（Tier測定light相当）で再検証します。これはシミュレーター上の試算であり、実戦データではありません。
      </p>
      {progress && <p className="mt-2 text-[11px] font-semibold" role="status">{progress}</p>}
    </section>

    {results.length > 0 && <section className="panel px-4 py-4 sm:px-5" aria-label="探索結果">
      <h2 className="text-sm font-semibold">強かった編成（上位{results.length}件）</h2>
      <div className="mt-3 space-y-3">
        {results.map((e, i) => {
          const win = e.total ? (e.counts[0] ?? 0) / e.total * 100 : 0;
          const top2 = e.total ? ((e.counts[0] ?? 0) + (e.counts[1] ?? 0)) / e.total * 100 : 0;
          return <article key={candidateKey(e.squad)} className="rounded-md border border-muted px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-gold">{i + 1}位</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.phase === "verify" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{e.phase === "verify" ? `再検証済（各${VERIFY_PER_MATCH}回）` : `ふるい分け（各${SCREEN_PER_MATCH}回）`}</span>
              <span className="text-[11px] text-muted-foreground">{e.squad.troop}／コスト{squadCost(e.squad.generals)}/{MAX_COST}</span>
              <span className="ml-auto text-[11px]"><span className="text-muted-foreground">勝率</span> <strong className="tabular-nums">{win.toFixed(1)}%</strong><span className="mx-2 text-muted-foreground">·</span><span className="text-muted-foreground">優勢以上</span> <strong className="tabular-nums">{top2.toFixed(1)}%</strong><span className="mx-2 text-muted-foreground">·</span><span className="text-muted-foreground">スコア</span> <strong className="tabular-nums">{e.score.toFixed(3)}</strong></span>
              <Button size="sm" variant="import" className="text-[11px]" onClick={() => saveEntry(e, i + 1)}><Save />保存した編成に追加</Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {e.squad.generals.map((gid, gi) => { const gn = gid ? generalById.get(gid) : undefined; if (!gn) return null; const tx = [e.squad.tactics[gi * 2], e.squad.tactics[gi * 2 + 1]].map(id => tacticById.get(id ?? "")?.name).filter(Boolean); return <div key={gi} className="flex items-start gap-2">
                <GeneralFace name={gn.name} className="h-11 w-9 text-xs" />
                <div className="min-w-0 text-[11px] leading-4"><p className="font-semibold">{gi === 0 ? "大将" : `副将${gi}`} {gn.name}<span className="ml-1 font-normal text-muted-foreground">固有:{gn.inherent}</span></p><p className="text-muted-foreground">{tx.join("・") || "戦法なし"}</p></div>
              </div>; })}
            </div>
          </article>;
        })}
      </div>
    </section>}
  </>;
}
