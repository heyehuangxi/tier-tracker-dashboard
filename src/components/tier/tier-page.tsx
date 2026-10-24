import { useMemo, useState } from "react";
import { CirclePlay, Crosshair, ChevronDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { useLocal, KEYS } from "@/lib/use-local";
import { generalById, normSquad, normalizeTroop, type SavedFormation, type Squad } from "@/lib/sengoku-data";
import { TEMPLATES, TEMPLATE_RANKS, templateToSquad, runSimulation, type BattleReport, type SimResult } from "@/lib/simulator";
import { BattleReportModal } from "@/components/tier/battle-report";

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
  const [reportSel, setReportSel] = useState<{ label: string; report: BattleReport } | null>(null);
  const [openTpl, setOpenTpl] = useState(false);

  const tplSquads = useMemo(() => TEMPLATES.map((t, i) => ({ key: `t-${i}`, label: `テンプレ${i + 1} ${t.label}`, squad: templateToSquad(t, ranks[i] ?? [0, 0, 0]) })), [ranks]);
  const savedSquads = useMemo(() => saved.flatMap(f => f.squads.map(normSquad).map((q, i) => ({ key: `s-${f.id}-${i}`, label: `${f.name} 部隊${i + 1}［${normalizeTroop(q.troop)}］（${squadName(q)}）`, squad: q })).filter(x => x.squad.generals.every(Boolean))), [saved]);
  const all = [...tplSquads, ...savedSquads];
  const test = all.find(x => x.key === testKey) ?? tplSquads[0];
  if (!test) return null;
  const opponents = all.filter(x => x.key !== test.key);

  function simulate() {
    if (!test) return;
    setRunning(true);
    setTimeout(() => {
      const r = runSimulation(test.squad, opponents.map(o => ({ label: o.label, squad: o.squad })), perMatch);
      setResult(r); setRunning(false); notice(`${r.total.toLocaleString("en-US")}戦のシミュレーションが完了しました`);
    }, 30);
  }
  const setRank = (ti: number, gi: number, r: number) => { const next = TEMPLATES.map((_, i) => [...(ranks[i] ?? [0, 0, 0])]); const row = next[ti]; if (row) row[gi] = r; setRanks(next); setResult(null); setReportSel(null); };
  // 一括設定: 自軍＝テスト対象のテンプレート、敵＝それ以外のテンプレート全て（保存した編成は編成側の凸数が使われる）
  const testTplIndex = test.key.startsWith("t-") ? Number(test.key.slice(2)) : -1;
  const setBulkRanks = (side: "self" | "enemy", r: number) => {
    const next = TEMPLATES.map((_, i) => [...(ranks[i] ?? [0, 0, 0])]);
    next.forEach((row, i) => { const isSelf = i === testTplIndex; if ((side === "self" && isSelf) || (side === "enemy" && !isSelf)) { row[0] = r; row[1] = r; row[2] = r; } });
    setRanks(next); setResult(null); setReportSel(null);
  };
  const uniformRank = (rows: number[][]) => (rows.length && rows.every(row => row.every(v => v === rows[0]?.[0])) ? rows[0]?.[0] : undefined);
  const selfUniform = testTplIndex >= 0 ? uniformRank([ranks[testTplIndex] ?? [0, 0, 0]]) : undefined;
  const enemyUniform = uniformRank(TEMPLATES.map((_, i) => ranks[i] ?? [0, 0, 0]).filter((_, i) => i !== testTplIndex));
  const pct = result ? result.counts.map(c => (c / Math.max(1, result.total)) * 100) : [0, 0, 0, 0, 0];

  return <>
    <section className="panel grid grid-cols-1 items-center gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]" aria-label="シミュレーション設定">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium"><Crosshair className="size-3.5 text-gold" />テスト対象の部隊</div>
        <select aria-label="テスト対象の部隊" className="h-9 w-full rounded-md border border-input bg-card px-2 text-xs" value={test.key} onChange={e => { setTestKey(e.target.value); setResult(null); }}>
          <optgroup label="テンプレート編成">{tplSquads.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
          {savedSquads.length > 0 && <optgroup label="保存した編成">{savedSquads.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>}
        </select>
        <p className="text-[11px] text-muted-foreground">対戦相手: {opponents.length}部隊 × {perMatch}回 = {(opponents.length * perMatch).toLocaleString("en-US")}戦（最大8ターン）</p>
      </div>
      <Button variant="simulation" className="w-full text-xs sm:w-auto" disabled={running} onClick={simulate}><CirclePlay className={running ? "animate-spin" : ""} />{running ? "シミュレーション実行中…" : `各${perMatch}回シミュレーション`}</Button>
    </section>

    <section className="panel px-5 py-4" aria-labelledby="bulk-rank-title">
      <h2 id="bulk-rank-title" className="text-sm font-semibold">凸数の一括設定</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">ボタンを押すと即反映されます。部隊ごとの微調整は下の「対戦テンプレート・凸数設定」から今まで通りできます。</p>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="w-36 shrink-0 font-semibold text-primary">自軍（テスト対象）</span>
          {testTplIndex >= 0 ? TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={selfUniform === x ? "default" : "outline"} className="h-7 px-3 text-[11px]" onClick={() => setBulkRanks("self", x)} aria-label={`自軍の凸数を全員${x}凸に一括設定`}>全員{x}凸</Button>)
            : <span className="text-muted-foreground">保存した編成が対象のため、編成側の凸数が使われます</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="w-36 shrink-0 font-semibold text-loss">敵（テンプレート{TEMPLATES.length - Math.max(0, testTplIndex >= 0 ? 1 : 0)}部隊）</span>
          {TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={enemyUniform === x ? "default" : "outline"} className="h-7 px-3 text-[11px]" onClick={() => setBulkRanks("enemy", x)} aria-label={`敵テンプレートの凸数を全員${x}凸に一括設定`}>全員{x}凸</Button>)}
          <span className="text-muted-foreground">保存した編成の相手は編成側の凸数が使われます</span>
        </div>
      </div>
    </section>

    <section className="panel flex flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-6" aria-labelledby="win-rate-title" aria-busy={running}>
      <div><h2 id="win-rate-title" className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-primary" />勝率</h2><div className="mt-2 flex items-baseline gap-1 text-primary"><span className="text-5xl font-semibold tabular-nums">{result ? ((result.counts[0] ?? 0) / Math.max(1, result.total) * 100).toFixed(1) : "—"}</span><span className="text-lg">%</span></div></div>
      <div className="min-w-0 max-w-full text-right"><p className="break-words text-xs font-semibold">{test.label}</p><p className="mt-1 text-[11px] text-muted-foreground">{normalizeTroop(test.squad.troop)}<span className="mx-2">·</span>{result ? `${result.total.toLocaleString("en-US")}戦` : "未測定"}</p></div>
    </section>

    <section className="panel px-4 py-5 sm:px-6" aria-labelledby="results-title">
      <div className="mb-4 flex items-center justify-between"><h2 id="results-title" className="text-base font-semibold">対戦結果</h2><span className="text-[11px] text-muted-foreground tabular-nums">{(result?.total ?? 0).toLocaleString("en-US")}戦</span></div>
      <svg className="result-bar" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={OUTCOMES.map((o, i) => `${o.label} ${(pct[i] ?? 0).toFixed(1)}%`).join("、")}><rect className="text-muted" fill="currentColor" width="100" height="24" />{OUTCOMES.map((o, i) => <rect key={o.label} className={o.color} fill="currentColor" x={pct.slice(0, i).reduce((a, b) => a + b, 0)} width={pct[i]} height="24" />)}</svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{OUTCOMES.map((o, i) => <div key={o.label} className="flex items-center gap-1.5 text-[11px]"><span className={`size-2 shrink-0 ${o.swatch}`} /><span className="text-muted-foreground">{o.label}</span><span className="ml-0.5 font-semibold tabular-nums">{(pct[i] ?? 0).toFixed(1)}%</span></div>)}</div>
      {result && <><p className="mt-3 text-[11px] text-muted-foreground">対戦カードをクリックすると、平均に最も近い代表試行の詳細戦報を表示します。</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{result.perOpponent.map(o => <button key={o.label} type="button" disabled={!o.report} className="flex items-center justify-between gap-2 rounded border border-muted px-2 py-1 text-left text-[11px] transition-colors hover:border-gold disabled:cursor-default disabled:opacity-60" onClick={() => { if (o.report) setReportSel({ label: o.label, report: o.report }); }} aria-label={`${o.label}の詳細戦報を表示`}><span className="truncate text-muted-foreground">{o.label}</span><span className="shrink-0 font-semibold tabular-nums">{o.win.toFixed(1)}%</span></button>)}</div></>}
    </section>

    <section className="panel px-4 py-5 sm:px-6">
      <Button variant="ghost" className="h-auto w-full justify-between whitespace-normal p-0 text-left" onClick={() => setOpenTpl(v => !v)} aria-expanded={openTpl}><h2 className="text-base font-semibold">対戦テンプレート（{TEMPLATES.length}部隊）・凸数設定</h2><ChevronDown className={`size-4 shrink-0 transition-transform ${openTpl ? "rotate-180" : ""}`} /></Button>
      {openTpl && <div className="mt-4 grid gap-3 lg:grid-cols-2">{TEMPLATES.map((t, ti) => <div key={ti} className="rounded-md border border-muted p-3">
        <p className="mb-2 text-xs font-semibold">テンプレ{ti + 1} <span className="text-muted-foreground">[{(t.label.split("]")[0] ?? "").slice(1)}]</span></p>
        <div className="space-y-2">{t.members.map((m, gi) => { const r = ranks[ti]?.[gi] ?? 0; const q = tplSquads[ti]?.squad; const al = q?.alloc?.[gi] ?? [0, 0, 0, 0]; return <div key={gi} className="text-[11px]">
          <div className="flex flex-wrap items-center gap-2"><span className="w-8 shrink-0 text-muted-foreground">{gi === 0 ? "主将" : "副将"}</span><span className="font-semibold">{m.name}</span>
            <div className="ml-auto flex gap-1">{TEMPLATE_RANKS.map(x => <Button key={x} size="sm" variant={r === x ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => setRank(ti, gi, x)}>{x}凸</Button>)}</div></div>
          <p className="mt-0.5 pl-10 text-muted-foreground">{m.tactics.join("・")} ／ {m.alloc.join("+")}：{["統率", "武勇", "知略", "速度"].map((s, k) => al[k] ? `${s}+${al[k]}` : "").filter(Boolean).join(" ") || "—"}（計{50 + r * 10}pt）</p>
        </div>; })}</div>
      </div>)}</div>}
    </section>
    {reportSel && <BattleReportModal report={reportSel.report} opponentLabel={reportSel.label} allyLabel={test.label} onClose={() => setReportSel(null)} />}
  </>;
}
