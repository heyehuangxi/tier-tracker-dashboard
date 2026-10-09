import { useMemo, useState } from "react";
import { CirclePlay, Crosshair, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { useLocal, KEYS } from "@/lib/use-local";
import { generalById, normSquad, type SavedFormation, type Squad } from "@/lib/sengoku-data";
import { TEMPLATES, TEMPLATE_RANKS, templateToSquad, runSimulation, type SimResult } from "@/lib/simulator";

const METRICS = [
  { label: "勝敗点", color: "text-points" }, { label: "出力", color: "text-output" }, { label: "爆発", color: "text-burst" },
  { label: "多穿", color: "text-penetration" }, { label: "回復", color: "text-tier" }, { label: "制御", color: "text-control" },
  { label: "破壊力", color: "text-tier" }, { label: "安定性", color: "text-stability" }, { label: "兵力交換比", color: "text-tier" },
];
const OUTCOMES = [
  { label: "勝ち", color: "text-win", swatch: "bg-win" }, { label: "優勢", color: "text-advantage", swatch: "bg-advantage" },
  { label: "引分", color: "text-draw", swatch: "bg-draw" }, { label: "劣勢", color: "text-disadvantage", swatch: "bg-disadvantage" },
  { label: "負け", color: "text-loss", swatch: "bg-loss" },
];
const squadName = (q: Squad) => q.generals.map(id => (id ? generalById.get(id)?.name : "空き") ?? "空き").join("・");

export function TierPage({ title, perMatch }: { title: string; perMatch: number }) {
  return <AppShell title={title} description={`テンプレート${TEMPLATES.length}部隊＋保存した編成と各${perMatch}回、最大8ターンで戦闘を試算します。`}><TierBody perMatch={perMatch} /></AppShell>;
}

function TierBody({ perMatch }: { perMatch: number }) {
  const notice = useNotice();
  const [saved] = useLocal<SavedFormation[]>(KEYS.saved, []);
  const [ranks, setRanks] = useLocal<number[][]>("sri-template-ranks", TEMPLATES.map(() => [0, 0, 0]));
  const [testKey, setTestKey] = useState("t-0");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [openTpl, setOpenTpl] = useState(false);

  const tplSquads = useMemo(() => TEMPLATES.map((t, i) => ({ key: `t-${i}`, label: `テンプレ${i + 1} ${t.label}`, squad: templateToSquad(t, ranks[i] ?? [0, 0, 0]) })), [ranks]);
  const savedSquads = useMemo(() => saved.flatMap(f => f.squads.map(normSquad).map((q, i) => ({ key: `s-${f.id}-${i}`, label: `${f.name} 部隊${i + 1}（${squadName(q)}）`, squad: q })).filter(x => x.squad.generals.every(Boolean))), [saved]);
  const all = [...tplSquads, ...savedSquads];
  const test = all.find(x => x.key === testKey) ?? tplSquads[0]!;
  const opponents = all.filter(x => x.key !== test.key);

  function simulate() {
    setRunning(true);
    setTimeout(() => {
      const r = runSimulation(test.squad, opponents.map(o => ({ label: o.label, squad: o.squad })), perMatch);
      setResult(r); setRunning(false); notice(`${r.total.toLocaleString("en-US")}戦のシミュレーションが完了しました`);
    }, 30);
  }
  const setRank = (ti: number, gi: number, r: number) => { const next = TEMPLATES.map((_, i) => [...(ranks[i] ?? [0, 0, 0])]); next[ti]![gi] = r; setRanks(next); };
  const pct = result ? result.counts.map(c => (c / Math.max(1, result.total)) * 100) : [0, 0, 0, 0, 0];

  return <>
    <section className="panel grid grid-cols-1 items-center gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]" aria-label="シミュレーション設定">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium"><Crosshair className="size-3.5 text-gold" />テスト対象の部隊</div>
        <select className="h-9 w-full rounded-md border border-input bg-card px-2 text-xs" value={test.key} onChange={e => setTestKey(e.target.value)}>
          <optgroup label="テンプレート編成">{tplSquads.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
          {savedSquads.length > 0 && <optgroup label="保存した編成">{savedSquads.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>}
        </select>
        <p className="text-[11px] text-muted-foreground">対戦相手: {opponents.length}部隊 × {perMatch}回 = {(opponents.length * perMatch).toLocaleString("en-US")}戦（最大8ターン）</p>
      </div>
      <Button variant="simulation" className="w-full text-xs sm:w-auto" disabled={running} onClick={simulate}><CirclePlay className={running ? "animate-spin" : ""} />{running ? "シミュレーション実行中…" : `各${perMatch}回シミュレーション`}</Button>
    </section>

    <section className="panel px-4 pb-5 pt-5 sm:px-6 sm:pb-6" aria-labelledby="evaluation-title" aria-busy={running}>
      <h2 id="evaluation-title" className="text-sm font-semibold">総合評価</h2>
      <div className="mb-4 mt-0.5 flex items-baseline gap-3 text-tier"><span className="text-[40px] font-semibold leading-[1.25]">{result?.tier ?? "—"}</span><span className="text-base font-semibold">{result ? `(${result.score.toFixed(2)})` : "未測定"}</span></div>
      <div className="space-y-0.5">{METRICS.map((m, i) => { const v = result?.metrics[i] ?? 0; return <div key={m.label} className="metric-row"><span className="text-xs font-semibold sm:text-sm">{m.label}</span><svg className={`metric-bar ${m.color}`} viewBox="0 0 100 22" preserveAspectRatio="none" role="img" aria-label={`${m.label}: ${v}`}><rect className="track" width="100" height="22" /><rect className="fill" width={v} height="22" /></svg><span className={`text-right text-base font-medium tabular-nums ${m.color}`}>{result ? v : "—"}</span></div>; })}</div>
    </section>

    <section className="panel px-4 py-5 sm:px-6" aria-labelledby="results-title">
      <div className="mb-4 flex items-center justify-between"><h2 id="results-title" className="text-base font-semibold">対戦結果</h2><span className="text-[11px] text-muted-foreground tabular-nums">{(result?.total ?? 0).toLocaleString("en-US")}戦</span></div>
      <svg className="result-bar" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={OUTCOMES.map((o, i) => `${o.label} ${pct[i]!.toFixed(1)}%`).join("、")}><rect className="text-muted" fill="currentColor" width="100" height="24" />{OUTCOMES.map((o, i) => <rect key={o.label} className={o.color} fill="currentColor" x={pct.slice(0, i).reduce((a, b) => a + b, 0)} width={pct[i]} height="24" />)}</svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{OUTCOMES.map((o, i) => <div key={o.label} className="flex items-center gap-1.5 text-[11px]"><span className={`size-2 shrink-0 ${o.swatch}`} /><span className="text-muted-foreground">{o.label}</span><span className="ml-0.5 font-semibold tabular-nums">{pct[i]!.toFixed(1)}%</span></div>)}</div>
      {result && <div className="mt-4 grid gap-1 sm:grid-cols-2">{result.perOpponent.map(o => <div key={o.label} className="flex items-center justify-between gap-2 rounded border border-muted px-2 py-1 text-[11px]"><span className="truncate text-muted-foreground">{o.label}</span><span className="shrink-0 font-semibold tabular-nums">{o.win.toFixed(1)}%</span></div>)}</div>}
    </section>

    <section className="panel px-4 py-5 sm:px-6">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpenTpl(v => !v)} aria-expanded={openTpl}><h2 className="text-base font-semibold">対戦テンプレート（{TEMPLATES.length}部隊）・凸数設定</h2><ChevronDown className={`size-4 transition-transform ${openTpl ? "rotate-180" : ""}`} /></button>
      {openTpl && <div className="mt-4 grid gap-3 lg:grid-cols-2">{TEMPLATES.map((t, ti) => <div key={ti} className="rounded-md border border-muted p-3">
        <p className="mb-2 text-xs font-semibold">テンプレ{ti + 1} <span className="text-muted-foreground">[{t.label.split("]")[0]!.slice(1)}]</span></p>
        <div className="space-y-2">{t.members.map((m, gi) => { const r = ranks[ti]?.[gi] ?? 0; const q = tplSquads[ti]!.squad; const al = q.alloc![gi]!; return <div key={gi} className="text-[11px]">
          <div className="flex flex-wrap items-center gap-2"><span className="w-8 shrink-0 text-muted-foreground">{gi === 0 ? "主将" : "副将"}</span><span className="font-semibold">{m.name}</span>
            <div className="ml-auto flex gap-1">{TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={r === x ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setRank(ti, gi, x)}>{x}凸</Button>)}</div></div>
          <p className="mt-0.5 pl-10 text-muted-foreground">{m.tactics.join("・")} ／ {m.alloc.join("+")}：{["統率", "武勇", "知略", "速度"].map((s, k) => al[k] ? `${s}+${al[k]}` : "").filter(Boolean).join(" ") || "—"}（計{50 + r * 10}pt）</p>
        </div>; })}</div>
      </div>)}</div>}
    </section>
  </>;
}
