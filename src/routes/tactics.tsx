import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/tier/app-shell";
import { GENERALS, TACTICS, TACTIC_KINDS } from "@/lib/sengoku-data";

export const Route = createFileRoute("/tactics")({
  head: () => ({ meta: [
    { title: "戦法一覧 | 真戦研究所" },
    { name: "description", content: "S戦法・A戦法・固有戦法をすべて検索・絞り込みして効果や発動確率を確認できます。" },
    { property: "og:title", content: "戦法一覧 | 真戦研究所" },
    { property: "og:description", content: "全戦法の効果・発動確率・伝授元武将を一覧で確認。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="戦法一覧" description="S戦法・A戦法・固有戦法をすべて掲載しています。"><TacticList /></AppShell>,
});

type Row = { id: string; name: string; grade: string; kind: string; rate: string; troop: string; effect: string; owners: string[] };

const ROWS: Row[] = [
  ...TACTICS.map(t => ({ ...t, owners: [] as string[] })),
  ...Object.entries(GENERALS.reduce<Record<string, string[]>>((m, g) => { if (g.inherent && g.inherent !== "-") (m[g.inherent] ??= []).push(g.name); return m; }, {}))
    .map(([name, owners]) => ({ id: `i-${name}`, name, grade: "固有", kind: "—", rate: "—", troop: "—", effect: "効果データ未登録", owners })),
];

function TacticList() {
  const [q, setQ] = useState(""); const [g, setG] = useState("all"); const [k, setK] = useState("all");
  const list = useMemo(() => ROWS.filter(r => (g === "all" || r.grade === g) && (k === "all" || r.kind === k) && (!q || [r.name, r.effect, ...r.owners].some(x => x.includes(q)))), [q, g, k]);
  const chip = (v: string, cur: string, set: (s: string) => void, label: string) => <button key={v} type="button" onClick={() => set(v)} className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${cur === v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</button>;
  return <>
    <section className="panel flex flex-col gap-3 px-4 py-3">
      <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="戦法名・効果・伝授元武将で検索" className="h-9 pl-8 text-xs" /></div>
      <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] text-muted-foreground">ランク</span>{[["all", "すべて"], ["S", "S戦法"], ["A", "A戦法"], ["固有", "固有戦法"]].map(([v, l]) => chip(v!, g, setG, l!))}</div>
      <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] text-muted-foreground">種別</span>{chip("all", k, setK, "すべて")}{TACTIC_KINDS.map(v => chip(v, k, setK, v))}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{list.length}件 / 全{ROWS.length}件</div>
    </section>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map(r => <article key={r.id} className="panel px-4 py-3">
        <div className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.grade === "S" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{r.grade}</span><h2 className="truncate text-sm font-semibold">{r.name}</h2><span className="ml-auto text-[10px] text-muted-foreground">{r.kind}</span></div>
        <p className="mt-2 text-[11px] leading-5">{r.effect}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-[10px] text-muted-foreground"><dt>発動確率</dt><dd>{r.rate}</dd><dt>対応兵種</dt><dd>{r.troop}</dd><dt>{r.grade === "固有" ? "所有武将" : "伝授元"}</dt><dd>{r.owners.length ? r.owners.join("・") : "—"}</dd></dl>
      </article>)}
    </div>
  </>;
}
