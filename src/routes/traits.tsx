import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/tier/app-shell";
import { GeneralFace } from "@/components/tier/general-face";
import { GENERALS, TRAITS, traitFor, type Trait } from "@/lib/sengoku-data";

export const Route = createFileRoute("/traits")({
  head: () => ({ meta: [
    { title: "特性一覧 | ぴえんで候" },
    { name: "description", content: "金帯特性・汎用特性すべての効果と、所持する武将（解放凸数つき）を一覧で確認できます。" },
    { property: "og:title", content: "特性一覧 | ぴえんで候" },
    { property: "og:description", content: "全特性の効果と所持武将を一覧で確認。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="特性一覧" description={`全${TRAITS.length}特性の効果と所持武将を掲載しています。`}><TraitList /></AppShell>,
});

type Holder = { name: string; at: string };
/** 特性名（表記ゆれ吸収済み）→ 所持武将と解放条件の逆引き */
const holdersByTrait = (() => {
  const m = new Map<string, Holder[]>();
  for (const g of GENERALS) {
    const entries: { raw: string; at: string }[] = [
      { raw: g.main, at: "金帯" }, { raw: g.r1, at: "1凸" }, { raw: g.r3, at: "3凸" }, { raw: g.r5, at: "5凸" },
    ];
    for (const { raw, at } of entries) {
      const t = traitFor(raw);
      if (!t) continue;
      const list = m.get(t.name) ?? [];
      if (!list.some(h => h.name === g.name)) list.push({ name: g.name, at });
      m.set(t.name, list);
    }
  }
  return m;
})();

function TraitCard({ t }: { t: Trait }) {
  const holders = holdersByTrait.get(t.name) ?? [];
  const gold = t.category === "金帯";
  return <article className="panel px-4 py-3">
    <div className="flex items-center gap-2">
      <span className={`rounded-[2px] px-1.5 py-0.5 text-[10px] font-bold ${gold ? "bg-gold/20 text-gold" : "bg-muted text-muted-foreground"}`}>{t.category}</span>
      <h2 className="truncate text-[15px] font-bold">{t.name}</h2>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">所持 {holders.length}名</span>
    </div>
    <p className="mt-2 text-[11px] leading-5">{t.effect}</p>
    <div className="mt-2 border-t border-border pt-2">
      <p className="mb-1 text-[10px] font-bold tracking-[0.12em] text-muted-foreground">所持武将</p>
      {holders.length === 0
        ? <p className="text-[11px] text-muted-foreground">—（武将マスターに所持者なし）</p>
        : <div className="flex flex-wrap gap-x-3 gap-y-1.5">{holders.map(h => <span key={h.name} className="inline-flex items-center gap-1.5 text-[11px]"><GeneralFace name={h.name} className="h-7 w-6 text-[9px]" /><span className="font-semibold">{h.name}</span><span className="text-[10px] text-muted-foreground">{h.at}</span></span>)}</div>}
    </div>
  </article>;
}

function TraitList() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const list = useMemo(() => TRAITS.filter(t => {
    if (cat !== "all" && t.category !== cat) return false;
    if (!q) return true;
    const holders = holdersByTrait.get(t.name) ?? [];
    return t.name.includes(q) || t.effect.includes(q) || holders.some(h => h.name.includes(q));
  }), [q, cat]);
  const chip = (v: string, label: string) => <button key={v} type="button" onClick={() => setCat(v)} className={`rounded border px-2.5 py-1 text-[11px] transition-colors ${cat === v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</button>;
  return <>
    <section className="panel panel-accent flex flex-col gap-3 px-4 py-3">
      <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="特性名・効果・所持武将で検索" className="h-9 pl-8 text-xs" /></div>
      <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] text-muted-foreground">区分</span>{chip("all", "すべて")}{chip("金帯", "金帯")}{chip("汎用", "汎用")}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{list.length}件 / 全{TRAITS.length}件（金帯は武将固有の特性、汎用は凸数で解放される特性です）</div>
    </section>
    {list.length === 0
      ? <div className="panel px-6 py-10 text-center"><p className="text-sm font-semibold">該当する特性がありません</p><p className="mt-2 text-xs text-muted-foreground">検索条件や絞り込みを変えてみてください。</p></div>
      : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map(t => <TraitCard key={t.name} t={t} />)}</div>}
  </>;
}
