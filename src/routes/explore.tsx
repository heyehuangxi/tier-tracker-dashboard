import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { CirclePlay, OctagonX, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { GeneralFace } from "@/components/tier/general-face";
import { ALL_GENERAL_IDS, ALL_TACTIC_IDS, GENERALS, TACTICS, MAX_COST, MAX_SAVED, generalById, normSquad, squadCost, tacticById, type SavedFormation, type Squad } from "@/lib/sengoku-data";
import { TEMPLATES, TEMPLATE_RANKS, runSimulation, templateToSquad } from "@/lib/simulator";
import { candidateKey, generateRandomSquad, outcomeScore } from "@/lib/explore";
import { readLocal, useOwnedList, writeLocal, KEYS } from "@/lib/use-local";

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

type Phase = "a" | "b" | "verify";
type Entry = { squad: Squad; counts: number[]; total: number; score: number; phase: Phase };

const A_PER_MATCH = 3;         // 1次ふるい分け（候補101件以上のとき）: 相手1部隊あたりの試行数
const A_KEEP = 60;             // 1次を通す件数
const A_KEEP_LARGE = 120;      // 候補1万件以上のときの1次通過件数（粗い試行での取りこぼし対策）
const B_PER_MATCH = 10;        // 2次ふるい分け: 相手1部隊あたりの試行数
const VERIFY_PER_MATCH = 50;   // 上位の再検証: Tier測定light と同じ試行数
const VERIFY_TOP = 20;         // 再検証する上位件数
const KEEP = 20;               // 表示する上位件数
const PHASE_LABEL: Record<Phase, string> = { a: `1次ふるい分け（各${A_PER_MATCH}回）`, b: `ふるい分け（各${B_PER_MATCH}回）`, verify: `再検証済（各${VERIFY_PER_MATCH}回）` };

const nextFrame = () => new Promise<void>(r => setTimeout(r, 0));

function Explore() {
  const notify = useNotice();
  const [ownedG] = useOwnedList(KEYS.ownedGenerals, ALL_GENERAL_IDS);
  const [ownedT] = useOwnedList(KEYS.ownedTactics, ALL_TACTIC_IDS);
  const [count, setCount] = useState(50);
  const [pool, setPool] = useState<"all" | "owned">("all");
  const [gFilter, setGFilter] = useState<"all" | "r5">("all");
  const [tFilter, setTFilter] = useState<"all" | "s">("all");
  const [selfRank, setSelfRank] = useState(0);
  const [enemyRank, setEnemyRank] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const cancelRef = useRef(false);

  async function run() {
    const gBase = pool === "owned" ? GENERALS.filter(g => ownedG.includes(g.id)) : GENERALS;
    const tBase = pool === "owned" ? TACTICS.filter(t => ownedT.includes(t.id)) : TACTICS;
    const gPool = gFilter === "r5" ? gBase.filter(g => g.rarity === 5) : gBase;
    const tPool = tFilter === "s" ? tBase.filter(t => t.grade === "S") : tBase;
    if (gPool.length < 3) return notify("対象の武将が3名未満のため探索できません。プールや絞り込みの条件を緩めるか、所持管理で登録してください。");
    if (tPool.length < 6) return notify("対象の戦法が6つ未満のため探索できません。プールや絞り込みの条件を緩めるか、所持管理で登録してください。");
    cancelRef.current = false;
    setRunning(true); setResults([]);
    const opponents = TEMPLATES.map((t, i) => ({ label: `テンプレ${i + 1}`, squad: templateToSquad(t, [enemyRank, enemyRank, enemyRank]) }));
    const seen = new Set<string>();
    // 上位ボード: 同一編成は新しい段階の結果で置き換え、常にスコア順に保つ
    const board = (limit: number) => {
      const list: Entry[] = [];
      return {
        list,
        push(e: Entry, publish: boolean) {
          const same = list.findIndex(x => candidateKey(x.squad) === candidateKey(e.squad));
          if (same >= 0) list[same] = e; else list.push(e);
          list.sort((a, b) => b.score - a.score);
          if (list.length > limit) list.length = limit;
          if (publish) setResults(list.slice(0, KEEP));
        },
      };
    };
    const sim = (q: Squad, perMatch: number, phase: Phase): Entry => { const r = runSimulation(q, opponents, perMatch); return { squad: q, counts: r.counts, total: r.total, score: outcomeScore(r.counts, r.total), phase }; };
    try {
      // 候補プールを作る: 101件以上はまず各3回で粗くふるい分ける（1万件以上は通過枠を広げて取りこぼしを減らす）
      let poolSquads: Squad[] = [];
      if (count > 100) {
        const aBoard = board(count >= 10000 ? A_KEEP_LARGE : A_KEEP);
        let done = 0; let tries = 0;
        while (done < count && tries < count * 20) {
          if (cancelRef.current) { setProgress("中断しました"); return; }
          tries++;
          const q = generateRandomSquad(gPool, tPool, Math.random, selfRank);
          if (!q) break;
          const key = candidateKey(q);
          if (seen.has(key)) continue;
          seen.add(key);
          aBoard.push(sim(q, A_PER_MATCH, "a"), done % 10 === 0);
          done++;
          if (done % 10 === 0 || done === count) { setProgress(`1次ふるい分け中… 候補 ${done}/${count}（各${A_PER_MATCH}回 × ${opponents.length}部隊）`); await nextFrame(); }
        }
        poolSquads = aBoard.list.map(e => e.squad);
        setProgress(`1次ふるい分け完了: ${done}件 → ${poolSquads.length}件`);
      } else {
        let tries = 0;
        while (poolSquads.length < count && tries < count * 20) {
          tries++;
          const q = generateRandomSquad(gPool, tPool, Math.random, selfRank);
          if (!q) break;
          const key = candidateKey(q);
          if (seen.has(key)) continue;
          seen.add(key);
          poolSquads.push(q);
        }
      }
      if (!poolSquads.length) { setProgress("候補を生成できませんでした"); return; }
      // ふるい分け: 各10回で連戦し、上位20件を残す
      const bBoard = board(KEEP);
      for (let i = 0; i < poolSquads.length; i++) {
        if (cancelRef.current) { setProgress("中断しました"); return; }
        bBoard.push(sim(poolSquads[i]!, B_PER_MATCH, "b"), true);
        setProgress(`ふるい分け中… ${i + 1}/${poolSquads.length}（各${B_PER_MATCH}回 × ${opponents.length}部隊）`);
        await nextFrame();
      }
      // 再検証: 上位20件を Tier測定light 相当（各50回）で測り直す
      const top = [...bBoard.list].slice(0, VERIFY_TOP);
      for (let i = 0; i < top.length; i++) {
        if (cancelRef.current) { setProgress("中断しました（ふるい分け結果のみ表示）"); return; }
        setProgress(`再検証中… 上位 ${i + 1}/${top.length}（各${VERIFY_PER_MATCH}回 × ${opponents.length}部隊）`);
        await nextFrame();
        bBoard.push(sim(top[i]!.squad, VERIFY_PER_MATCH, "verify"), true);
      }
      setProgress(`完了: 候補${count}件から上位${top.length}件を再検証しました`);
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
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">候補数</span>{[20, 50, 100, 1000, 5000, 10000, 20000, 50000].map(n => <Button key={n} size="sm" variant={chip(count === n)} className="h-7 px-3 text-[11px]" onClick={() => setCount(n)} disabled={running}>{n.toLocaleString("en-US")}件</Button>)}</div>
        <div className="flex items-center gap-2"><span className="font-semibold">プール</span><Button size="sm" variant={chip(pool === "all")} className="h-7 px-3 text-[11px]" onClick={() => setPool("all")} disabled={running}>全武将・全戦法</Button><Button size="sm" variant={chip(pool === "owned")} className="h-7 px-3 text-[11px]" onClick={() => setPool("owned")} disabled={running}>所持のみ</Button></div>
        <div className="flex items-center gap-2"><span className="font-semibold">武将</span><Button size="sm" variant={chip(gFilter === "all")} className="h-7 px-3 text-[11px]" onClick={() => setGFilter("all")} disabled={running}>すべて</Button><Button size="sm" variant={chip(gFilter === "r5")} className="h-7 px-3 text-[11px]" onClick={() => setGFilter("r5")} disabled={running}>星5のみ</Button></div>
        <div className="flex items-center gap-2"><span className="font-semibold">戦法</span><Button size="sm" variant={chip(tFilter === "all")} className="h-7 px-3 text-[11px]" onClick={() => setTFilter("all")} disabled={running}>すべて</Button><Button size="sm" variant={chip(tFilter === "s")} className="h-7 px-3 text-[11px]" onClick={() => setTFilter("s")} disabled={running}>Sのみ</Button></div>
        <div className="flex items-center gap-2"><span className="font-semibold">自軍凸数</span>{TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={chip(selfRank === x)} className="h-7 px-3 text-[11px]" onClick={() => setSelfRank(x)} disabled={running}>全員{x}凸</Button>)}</div>
        <div className="flex items-center gap-2"><span className="font-semibold">敵テンプレ凸数</span>{TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={chip(enemyRank === x)} className="h-7 px-3 text-[11px]" onClick={() => setEnemyRank(x)} disabled={running}>全員{x}凸</Button>)}</div>
        {running
          ? <Button variant="destructive" className="text-xs" onClick={() => { cancelRef.current = true; }}><OctagonX />中断</Button>
          : <Button variant="simulation" className="text-xs" onClick={run}><CirclePlay />探索開始</Button>}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        候補は全探索ではなくランダム抽出です。候補の武将は全員同じ凸数（上で選択）・能力ポイントは各武将の最大ステータスへ全振り、コスト合計は{MAX_COST}以下、戦法は部隊兵種に対応するものを優先して付けます。
        候補101件以上のときは各{A_PER_MATCH}回で1次ふるい分け→各{B_PER_MATCH}回でふるい分け→上位{VERIFY_TOP}件を各{VERIFY_PER_MATCH}回（Tier測定light相当）で再検証します（1次通過は通常{A_KEEP}件、候補1万件以上では{A_KEEP_LARGE}件）。候補が多いほど時間がかかります（1,000件で数分、5,000件で十数分、1万件で30分前後、5万件では数時間が目安。端末性能によります）。長時間の探索中はこのページを開いたままにしてください。これはシミュレーター上の試算であり、実戦データではありません。
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
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${e.phase === "verify" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{PHASE_LABEL[e.phase]}</span>
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
