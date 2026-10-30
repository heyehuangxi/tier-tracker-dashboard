import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/tier/app-shell";
import { FactionTabs } from "@/components/tier/faction-tabs";
import { GeneralFace } from "@/components/tier/general-face";
import { GENERALS, INHERENT_TACTICS, STAT_NAMES, traitFor, type General } from "@/lib/sengoku-data";

export const Route = createFileRoute("/generals")({
  head: () => ({ meta: [
    { title: "武将一覧 | ぴえんで候" },
    { name: "description", content: "全武将の能力値（Lv50）・固有戦法・特性（金帯／凸解放）を一覧で確認できます。" },
    { property: "og:title", content: "武将一覧 | ぴえんで候" },
    { property: "og:description", content: "全武将の能力値・固有戦法・特性を一覧で確認。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="武将一覧" description={`全${GENERALS.length}武将の能力値（Lv50）・固有戦法・特性を掲載しています。`}><GeneralList /></AppShell>,
});

const inherentByName = new Map(INHERENT_TACTICS.map(t => [t.name, t]));
const STAT_MAX = [0, 1, 2, 3].map(k => Math.max(...GENERALS.map(g => g.stats[k] ?? 0)));
type SortKey = "cost" | "total" | "s0" | "s1" | "s2" | "s3";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "cost", label: "コスト順" }, { key: "total", label: "合計順" },
  { key: "s0", label: "統率順" }, { key: "s1", label: "武勇順" }, { key: "s2", label: "知略順" }, { key: "s3", label: "速度順" },
];

function TraitLine({ at, name }: { at: string; name: string }) {
  const t = traitFor(name);
  return <p className="flex gap-1.5 text-[11px] leading-4">
    <span className={`mt-px shrink-0 rounded-[2px] px-1 py-px text-[9px] font-bold ${at === "金帯" ? "bg-gold/20 text-gold" : "bg-muted text-muted-foreground"}`}>{at}</span>
    <span className="min-w-0"><span className="font-semibold">{name}</span>{t && <span className="text-muted-foreground"> — {t.effect}</span>}</span>
  </p>;
}

function GeneralCard({ g }: { g: General }) {
  const inh = inherentByName.get(g.inherent);
  const best = Math.max(...g.stats);
  return <article className="panel px-4 py-3">
    <div className="flex items-start gap-3">
      <GeneralFace name={g.name} className="h-16 w-[52px] text-base" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="truncate text-[17px] font-bold">{g.name}</h2>
          <span className="text-[11px] font-bold text-gold" aria-label={`星${g.rarity}`}>{"★".repeat(g.rarity)}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{g.faction} ・ コスト {g.cost} ・ メイン属性 {g.main === "-" ? "—" : g.main}</p>
        <div className="mt-2 space-y-1">
          {STAT_NAMES.map((nm, k) => { const v = g.stats[k] ?? 0; return <div key={nm} className="flex items-center gap-2 text-[10px]">
            <span className="w-7 shrink-0 text-muted-foreground">{nm}</span>
            <span className="h-1.5 flex-1 bg-track"><span className={`block h-full ${v === best ? "bg-primary" : "bg-gold/80"}`} style={{ width: `${Math.round((v / (STAT_MAX[k] || 1)) * 100)}%` }} /></span>
            <span className={`w-8 shrink-0 text-right tabular-nums ${v === best ? "font-bold text-primary" : "font-semibold"}`}>{v}</span>
          </div>; })}
        </div>
      </div>
    </div>
    <div className="mt-3 border-t border-border pt-2">
      <p className="text-[11px]"><span className="mr-1.5 text-[10px] font-bold tracking-[0.12em] text-muted-foreground">固有戦法</span><span className="font-display font-bold">{g.inherent}</span>{inh && <span className="ml-1.5 text-[10px] text-muted-foreground">{inh.grade}・{inh.kind}・発動{inh.rate}</span>}</p>
      {inh && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{inh.effect}</p>}
    </div>
    <div className="mt-2 space-y-1 border-t border-border pt-2">
      <TraitLine at="金帯" name={g.main} />
      {g.r1 !== "-" && <TraitLine at="1凸" name={g.r1} />}
      {g.r3 !== "-" && <TraitLine at="3凸" name={g.r3} />}
      {g.r5 !== "-" && <TraitLine at="5凸" name={g.r5} />}
    </div>
  </article>;
}

function GeneralList() {
  const [q, setQ] = useState("");
  const [fac, setFac] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState<SortKey>("cost");
  const list = useMemo(() => {
    const hit = (g: General) => !q || [g.name, g.faction, g.inherent, g.main, g.r1, g.r3, g.r5].some(x => x && x.includes(q));
    const rows = GENERALS.filter(g => hit(g) && (fac === "all" || g.faction === fac) && (rarity === "all" || g.rarity === Number(rarity)));
    const by = (a: General, b: General) => b.cost - a.cost;
    switch (sort) {
      case "total": return rows.sort((a, b) => (b.stats.reduce((x, y) => x + y, 0) - a.stats.reduce((x, y) => x + y, 0)) || by(a, b));
      case "s0": case "s1": case "s2": case "s3": { const k = Number(sort[1]); return rows.sort((a, b) => ((b.stats[k] ?? 0) - (a.stats[k] ?? 0)) || by(a, b)); }
      default: return rows;
    }
  }, [q, fac, rarity, sort]);
  const chip = (v: string, label: string) => <button key={v} type="button" onClick={() => setRarity(v)} className={`rounded border px-2.5 py-1 text-[11px] transition-colors ${rarity === v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</button>;
  return <>
    <section className="panel panel-accent flex flex-col gap-3 px-4 py-3">
      <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="武将名・勢力・固有戦法・特性で検索" className="h-9 pl-8 text-xs" /></div>
      <div className="flex flex-wrap items-center gap-3">
        <FactionTabs value={fac} onChange={setFac} />
        <div className="flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">レア度</span>{chip("all", "すべて")}{chip("5", "星5")}{chip("4", "星4")}</div>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">並び替え
          <select className="slot-select h-8 w-28" value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="並び替え">{SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{list.length}件 / 全{GENERALS.length}件（能力値はLv50・属性ポイント未振り）</div>
    </section>
    {list.length === 0
      ? <div className="panel px-6 py-10 text-center"><p className="text-sm font-semibold">該当する武将がいません</p><p className="mt-2 text-xs text-muted-foreground">検索条件や絞り込みを変えてみてください。</p></div>
      : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map(g => <GeneralCard key={g.id} g={g} />)}</div>}
  </>;
}
