import { useEffect, useMemo, useRef, useState } from "react";
import { CirclePlay, Crosshair, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generalById, normalizeTroop, normSquad, type SavedFormation, type Squad } from "@/lib/sengoku-data";
import { KEYS, useLocal } from "@/lib/use-local";
import { runSimulation, STANDARD_SIMULATION_RUNS, TEMPLATES, templateToSquad, type BattleReport, type SimResult } from "@/lib/simulator";
import { BattleReportModal } from "./battle-report";
import { GeneralFace } from "./general-face";

const OUTCOMES = [
  { label: "勝ち", color: "text-win", swatch: "bg-win" },
  { label: "優勢", color: "text-advantage", swatch: "bg-advantage" },
  { label: "引分", color: "text-draw", swatch: "bg-draw" },
  { label: "劣勢", color: "text-disadvantage", swatch: "bg-disadvantage" },
  { label: "負け", color: "text-loss", swatch: "bg-loss" },
];

const squadName = (q: Squad) => q.generals.map(id => (id ? generalById.get(id)?.name : "空き") ?? "空き").join("・");

/** 自由編成の下で、保存や画面移動なしに通常の勝率測定を自動実行する。 */
export function FreeWinRate({ squads }: { squads: Squad[] }) {
  const [saved] = useLocal<SavedFormation[]>(KEYS.saved, []);
  const [ranks] = useLocal<number[][]>("sri-template-ranks", TEMPLATES.map(() => [0, 0, 0]));
  const [testKey, setTestKey] = useState("");
  const [runNonce, setRunNonce] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [reportSel, setReportSel] = useState<{ label: string; report: BattleReport } | null>(null);
  const runId = useRef(0);

  const candidates = useMemo(() => squads.map((squad, i) => ({
    key: `free-${i}`,
    label: `自由編成 部隊${i + 1}［${normalizeTroop(squad.troop)}］（${squadName(squad)}）`,
    squad,
  })).filter(x => x.squad.generals.every(Boolean)), [squads]);
  const test = candidates.find(x => x.key === testKey) ?? candidates[0];
  const opponents = useMemo(() => [
    ...TEMPLATES.map((t, i) => ({ key: `t-${i}`, label: `テンプレ${i + 1} ${t.label}`, squad: templateToSquad(t, ranks[i] ?? [0, 0, 0]) })),
    ...saved.flatMap(f => f.squads.map(normSquad).map((squad, i) => ({
      key: `s-${f.id}-${i}`,
      label: `${f.name} 部隊${i + 1}［${normalizeTroop(squad.troop)}］（${squadName(squad)}）`,
      squad,
    })).filter(x => x.squad.generals.every(Boolean))),
  ], [ranks, saved]);

  useEffect(() => {
    const id = ++runId.current;
    setReportSel(null);
    if (!test) {
      setResult(null);
      setRunning(false);
      return;
    }
    setResult(null);
    setRunning(true);
    // スライダー操作中の連続した変更をまとめ、操作が止まってから通常測定を開始する。
    const timer = window.setTimeout(() => {
      const next = runSimulation(test.squad, opponents, STANDARD_SIMULATION_RUNS);
      if (runId.current !== id) return;
      setResult(next);
      setRunning(false);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [test, opponents, runNonce]);

  const pct = result ? result.counts.map(c => (c / Math.max(1, result.total)) * 100) : [0, 0, 0, 0, 0];
  const winRate = result ? ((result.counts[0] ?? 0) / Math.max(1, result.total)) * 100 : null;

  return <section className="panel panel-accent px-5 py-5 sm:px-6" aria-labelledby="free-win-rate-title" aria-busy={running}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="free-win-rate-title" className="flex items-center gap-2 text-lg font-bold"><Crosshair className="size-5 text-primary" />勝率判定</h2>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">保存せず、この画面の部隊を通常測定と同じ各{STANDARD_SIMULATION_RUNS}回・最大8ターンで自動判定します。編成を変えると再測定されます。</p>
      </div>
      <span className="rounded bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary">通常測定・各{STANDARD_SIMULATION_RUNS}回</span>
    </div>

    {!test ? <div className="mt-5 rounded border border-dashed border-border bg-background/50 px-4 py-8 text-center">
      <p className="text-sm font-semibold">測定する部隊を完成させてください</p>
      <p className="mt-2 text-[11px] text-muted-foreground">いずれかの部隊に武将を3人選択すると、自動で勝率判定が始まります。</p>
    </div> : <>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-3">
          <label className="block text-[11px] font-bold" htmlFor="free-win-rate-squad">測定する部隊</label>
          <select id="free-win-rate-squad" className="h-10 w-full rounded border border-input bg-card px-2 text-[13px]" value={test.key} onChange={e => setTestKey(e.target.value)}>
            {candidates.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{test.squad.generals.map((gid, gi) => {
            const gn = gid ? generalById.get(gid) : undefined;
            return gn ? <span key={gi} className="inline-flex items-center gap-2 text-xs"><GeneralFace name={gn.name} className="h-10 w-8 text-[10px]" /><span className="font-display text-sm font-bold">{gn.name}</span><span className="text-muted-foreground">{test.squad.ranks?.[gi] ?? 0}凸</span></span> : null;
          })}</div>
          <p className="text-[11px] text-muted-foreground">対戦相手: テンプレート{TEMPLATES.length}部隊＋保存した編成 × 各{STANDARD_SIMULATION_RUNS}回 = {(opponents.length * STANDARD_SIMULATION_RUNS).toLocaleString("en-US")}戦</p>
          <Button variant="outline" size="sm" className="text-xs" disabled={running} onClick={() => setRunNonce(v => v + 1)}><CirclePlay />今すぐ再測定</Button>
        </div>
        <div className="flex flex-col justify-center border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-live="polite">
          <p className="text-[11px] font-bold tracking-[0.3em] text-muted-foreground">勝率</p>
          <p className="mt-1 flex min-h-[76px] items-center gap-2">
            {running ? <><LoaderCircle className="size-7 animate-spin text-primary" /><span className="text-sm font-semibold">自動測定中…</span></> : <><span className="winrate-num text-[68px] text-foreground">{winRate !== null ? winRate.toFixed(1) : "—"}</span>{winRate !== null && <span className="winrate-num text-3xl text-primary">%</span>}</>}
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">{result ? `${result.total.toLocaleString("en-US")}戦が完了` : "編成確定後に自動で開始"}</p>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-3 flex items-baseline justify-between"><h3 className="font-display text-base font-bold">対戦結果</h3><span className="text-[11px] text-muted-foreground tabular-nums">{(result?.total ?? 0).toLocaleString("en-US")}戦</span></div>
        <svg className="result-bar" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={OUTCOMES.map((o, i) => `${o.label} ${(pct[i] ?? 0).toFixed(1)}%`).join("、")}><rect className="text-muted" fill="currentColor" width="100" height="30" />{OUTCOMES.map((o, i) => <rect key={o.label} className={o.color} fill="currentColor" x={pct.slice(0, i).reduce((a, b) => a + b, 0)} width={pct[i]} height="30" />)}</svg>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{OUTCOMES.map((o, i) => <div key={o.label} className="flex items-center gap-1.5 text-[11px]"><span className={`size-2 shrink-0 ${o.swatch}`} /><span className="text-muted-foreground">{o.label}</span><span className="ml-0.5 font-semibold tabular-nums">{(pct[i] ?? 0).toFixed(1)}%</span></div>)}</div>
        {result && <><p className="mt-4 text-[11px] text-muted-foreground">対戦カードをクリックすると、代表試行の詳細戦報を表示します。</p><div className="mt-1 divide-y divide-border border-y border-border">{result.perOpponent.map(o => {
          const osq = opponents.find(x => x.label === o.label)?.squad;
          const w = Math.max(0, Math.min(100, o.win));
          return <button key={o.label} type="button" disabled={!o.report} className="group flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-accent/60 disabled:cursor-default disabled:opacity-60" onClick={() => { if (o.report) setReportSel({ label: o.label, report: o.report }); }} aria-label={`${o.label}の詳細戦報を表示`}>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">{osq?.generals.map((gid, gi) => { const gn = gid ? generalById.get(gid) : undefined; return gn ? <GeneralFace key={gi} name={gn.name} className="h-9 w-7 text-[9px]" /> : null; })}<span className="ml-1 truncate text-xs text-muted-foreground group-hover:text-foreground">{o.label}</span></span>
            <span className="hidden h-1.5 w-28 shrink-0 bg-track sm:block"><span className="block h-full bg-win" style={{ width: `${w}%` }} /></span>
            <span className="w-16 shrink-0 text-right font-display text-base font-bold tabular-nums">{o.win.toFixed(1)}<span className="ml-0.5 text-[10px] font-normal text-muted-foreground">%</span></span>
          </button>;
        })}</div></>}
      </div>
    </>}
    {reportSel && test && <BattleReportModal report={reportSel.report} opponentLabel={reportSel.label} allyLabel={test.label} onClose={() => setReportSel(null)} />}
  </section>;
}
