import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, CirclePlay, Download, Menu, UserRound, Check, X, RotateCcw, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navigation } from "@/components/tier/navigation";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Tier測定 | 真戦研究所 SRI-v1.0" },
    { name: "description", content: "真戦研究所のTier測定。編成の総合評価、9つの戦闘指標、対戦結果を確認できます。" },
    { property: "og:title", content: "Tier測定 | 真戦研究所" },
    { property: "og:description", content: "編成のTierランクと戦闘シミュレーション結果を一覧で確認。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Index,
});
const metrics = [
  { label: "勝敗点", value: 76, color: "text-points" },
  { label: "出力", value: 97, color: "text-output" },
  { label: "爆発", value: 83, color: "text-burst" },
  { label: "多穿", value: 63, color: "text-penetration" },
  { label: "回復", value: 70, color: "text-tier" },
  { label: "制御", value: 74, color: "text-control" },
  { label: "破壊力", value: 71, color: "text-tier" },
  { label: "安定性", value: 76, color: "text-stability" },
  { label: "兵力交換比", value: 100, color: "text-tier" },
];
const outcomes = [
  { label: "勝ち", value: 60.6, color: "text-win", swatch: "bg-win" },
  { label: "優勢", value: 14.3, color: "text-advantage", swatch: "bg-advantage" },
  { label: "引分", value: 2.9, color: "text-draw", swatch: "bg-draw" },
  { label: "劣勢", value: 12.2, color: "text-disadvantage", swatch: "bg-disadvantage" },
  { label: "負け", value: 10.0, color: "text-loss", swatch: "bg-loss" },
];
function Index() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [values, setValues] = useState(metrics.map(m => m.value));
  const [results, setResults] = useState(outcomes.map(o => o.value));
  const [score, setScore] = useState(7.9);
  const [runs, setRuns] = useState(7500);
  const [notice, setNotice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [selected, setSelected] = useState("黒田官兵衛 + 豊臣秀吉 + ねね");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(id); }, [notice]);
  function simulate() {
    setRunning(true);
    timer.current = setTimeout(() => {
      const next = metrics.map(m => Math.min(100, Math.max(0, m.value + Math.round(Math.random() * 10 - 5))));
      setValues(next); setScore(Math.round((next.reduce((a, b) => a + b, 0) / 90) * 100) / 100);
      const win = Math.round((57 + Math.random() * 8) * 10) / 10;
      const advantage = Math.round((12 + Math.random() * 4) * 10) / 10;
      const draw = 2.9; const disadvantage = 12.2;
      setResults([win, advantage, draw, disadvantage, Math.round((100 - win - advantage - draw - disadvantage) * 10) / 10]);
      setRuns(n => n + 7500); setRunning(false); setNotice("シミュレーションが完了しました（ダミーデータ）");
    }, 1400);
  }
  return <div className="min-h-screen">
    {mobileOpen && <div className="fixed inset-0 z-30 bg-foreground/25 md:hidden" onClick={() => setMobileOpen(false)} />}
    <Navigation collapsed={collapsed} mobileOpen={mobileOpen} onCollapse={() => { setCollapsed(v => !v); setMobileOpen(false); }} onClose={() => setMobileOpen(false)} onSelect={label => { if (label !== "Tier測定") setNotice(`${label}は準備中です。現在はTier測定をお試しいただけます。`); }} />
    <main className={`app-main min-h-screen ${collapsed ? "collapsed" : ""}`}>
      <header className="grid h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-muted bg-card px-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setMobileOpen(true)} aria-label="メニューを開く"><Menu /></Button><h1 className="page-title flex shrink-0 items-center gap-3 font-display text-xl font-bold">Tier測定</h1><span className="ml-1 hidden border-l border-muted pl-4 text-[11px] text-muted-foreground/70 lg:block">保存した編成を使って、戦闘を試算します。</span></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4"><Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="通知" onClick={() => setNotice("新しい通知はありません。")}><Bell className="size-4" /></Button><div className="relative"><Button variant="account" size="sm" onClick={() => setAccountOpen(v => !v)} aria-expanded={accountOpen}><UserRound className="size-3" /><span>Shun</span><ChevronDown className="size-3" /></Button>{accountOpen && <div className="panel absolute right-0 top-11 z-20 w-44 p-3"><p className="text-xs font-medium">Shun</p><p className="mt-1 text-[11px] text-muted-foreground">デモアカウント</p><Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => { setValues(metrics.map(m => m.value)); setResults(outcomes.map(o => o.value)); setScore(7.9); setRuns(7500); setAccountOpen(false); setNotice("評価を初期状態に戻しました。"); }}><RotateCcw />評価をリセット</Button></div>}</div></div>
      </header>
      <div className="content-wrap space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        <section className="panel grid grid-cols-1 items-center gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]" aria-label="シミュレーション設定">
          <div className="min-w-0"><div className="mb-1 flex items-center gap-2 text-xs font-medium"><Crosshair className="size-3.5 text-gold" />戦闘シミュレーション<span className="ml-1 text-[10px] font-normal text-muted-foreground">DEMO</span></div><p className="text-[11px] leading-5 text-muted-foreground">Tier 0・Tier 0.5のテンプレ編成と各300回ずつ戦闘し、平均結果と兵力交換比を計算します。</p></div>
          <Button variant="simulation" className="w-full text-xs sm:w-auto" disabled={running} onClick={simulate}><CirclePlay className={running ? "animate-spin" : ""} />{running ? "シミュレーション実行中…" : "Tier0・0.5 各300回シミュレーション"}</Button>
        </section>
        <section className="panel px-4 pb-5 pt-5 sm:px-6 sm:pb-6" aria-labelledby="evaluation-title" aria-busy={running}>
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="min-w-0"><h2 id="evaluation-title" className="text-sm font-semibold">総合評価</h2><div className="mt-0.5 flex items-baseline gap-3 text-tier"><span className="text-[40px] font-semibold leading-[1.25]">{score >= 8.4 ? "T0" : "T0.5"}</span><span className="text-base font-semibold">({score.toFixed(2)})</span></div></div>
            <div className="relative"><Button variant="import" size="sm" className="text-[11px] sm:text-xs" onClick={() => setImportOpen(v => !v)} aria-expanded={importOpen}><Download />編成へ取り込む<ChevronDown className="size-3" /></Button>{importOpen && <div className="panel absolute right-0 top-10 z-20 w-64 p-2"><p className="px-2 py-2 text-[11px] text-muted-foreground">取り込み先の編成</p>{["黒田官兵衛 + 豊臣秀吉 + ねね", "部隊 2", "部隊 3"].map(label => <Button key={label} variant="ghost" className="h-10 w-full justify-start text-xs" onClick={() => { setSelected(label); setImportOpen(false); setNotice(`${label}に評価を取り込みました（デモ）。`); }}>{selected === label && <Check className="text-primary" />}{label}</Button>)}</div>}</div>
          </div>
          <div className="space-y-0.5">{metrics.map((metric, i) => <div key={metric.label} className="metric-row"><span className="text-xs font-semibold sm:text-sm">{metric.label}</span><svg className={`metric-bar ${metric.color}`} viewBox="0 0 100 22" preserveAspectRatio="none" role="img" aria-label={`${metric.label}: ${values[i]}`}><rect className="track" width="100" height="22" /><rect className="fill" width={values[i]} height="22" /></svg><span className={`text-right text-base font-medium tabular-nums ${metric.color}`}>{values[i]}</span></div>)}</div>
        </section>
        <section className="panel px-4 py-5 sm:px-6" aria-labelledby="results-title">
          <div className="mb-4 flex items-center justify-between"><h2 id="results-title" className="text-base font-semibold">対戦結果</h2><span className="text-[11px] text-muted-foreground tabular-nums">{runs.toLocaleString()}戦</span></div>
          <svg className="result-bar" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={outcomes.map((o, i) => `${o.label} ${results[i].toFixed(1)}%`).join("、")}>{outcomes.map((outcome, i) => <rect key={outcome.label} className={outcome.color} fill="currentColor" x={results.slice(0, i).reduce((a, b) => a + b, 0)} width={results[i]} height="24"><title>{outcome.label} {results[i].toFixed(1)}%</title></rect>)}</svg>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">{outcomes.map((outcome, i) => <div key={outcome.label} className="flex items-center gap-1.5 text-[11px]"><span className={`size-2 shrink-0 ${outcome.swatch}`} /><span className="text-muted-foreground">{outcome.label}</span><span className="ml-0.5 font-semibold tabular-nums">{results[i].toFixed(1)}%</span></div>)}</div>
        </section>
        <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground/70"><span>真戦研究所 · SRI-v1.0</span><span>ダミーデータ</span></div>
      </div>
    </main>
    {notice && <div role="status" className="panel fixed bottom-5 right-4 z-50 flex max-w-[calc(100%-32px)] items-center gap-3 px-4 py-3 text-xs"><Check className="size-4 shrink-0 text-primary" /><span>{notice}</span><Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="通知を閉じる" onClick={() => setNotice("")}><X /></Button></div>}
  </div>;
}
