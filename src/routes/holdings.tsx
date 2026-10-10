import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { FactionTabs } from "@/components/tier/faction-tabs";
import { GENERALS, TACTICS, TACTIC_KINDS, tacticTip } from "@/lib/sengoku-data";
import { useLocal, KEYS } from "@/lib/use-local";

export const Route = createFileRoute("/holdings")({
  head: () => ({ meta: [
    { title: "所持管理 | ぴえんで候" },
    { name: "description", content: "所持している武将と戦法を登録し、共存編成で利用します。" },
    { property: "og:title", content: "所持管理 | ぴえんで候" },
    { property: "og:description", content: "所持武将・戦法をまとめて管理。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <AppShell title="所持管理" description="所持している武将・戦法を選び、保存してください。"><Holdings /></AppShell>,
});

function Holdings() {
  const notify = useNotice();
  const [savedG, setSavedG, readyG] = useLocal<string[]>(KEYS.ownedGenerals, []);
  const [savedT, setSavedT, readyT] = useLocal<string[]>(KEYS.ownedTactics, []);
  const [g, setG] = useState<string[]>([]);
  const [t, setT] = useState<string[]>([]);
  useEffect(() => { if (readyG) setG(savedG); }, [readyG]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (readyT) setT(savedT); }, [readyT]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<"g" | "t">("g");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [fac, setFac] = useState("all");
  const [grade, setGrade] = useState("all");
  const [detail, setDetail] = useState<string | null>(null);
  const dirty = JSON.stringify([...g].sort()) !== JSON.stringify([...savedG].sort()) || JSON.stringify([...t].sort()) !== JSON.stringify([...savedT].sort());
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const gq = GENERALS.filter(x => x.name.includes(q) || x.faction.includes(q) || x.inherent.includes(q)).filter(x => fac === "all" || x.faction === fac).filter(x => filter === "owned" ? g.includes(x.id) : filter === "unowned" ? !g.includes(x.id) : true);
  const tq = TACTICS.filter(x => x.name.includes(q) || x.kind.includes(q) || x.effect.includes(q)).filter(x => grade === "all" || x.grade === grade).filter(x => filter === "all" ? true : filter === "owned" ? t.includes(x.id) : filter === "unowned" ? !t.includes(x.id) : x.kind === filter);
  const types = tab === "g" ? [...new Set([] as string[])] : TACTIC_KINDS;

  const groups = tab === "g"
    ? [{ title: "名将（星5）", items: gq.filter(x => x.rarity === 5).map(x => ({ id: x.id, name: x.name, sub: `${x.faction}・コスト${x.cost}`, star: x.inherent, tip: "" })) }, { title: "良将（星4）", items: gq.filter(x => x.rarity === 4).map(x => ({ id: x.id, name: x.name, sub: `${x.faction}・コスト${x.cost}`, star: x.inherent, tip: "" })) }]
    : [{ title: "S戦法", items: tq.filter(x => x.grade === "S").map(x => ({ id: x.id, name: x.name, sub: `${x.kind}・${x.rate}・${x.troop}`, star: "S", tip: tacticTip(x) })) }, { title: "A戦法", items: tq.filter(x => x.grade === "A").map(x => ({ id: x.id, name: x.name, sub: `${x.kind}・${x.rate}・${x.troop}`, star: "A", tip: tacticTip(x) })) }];
  const list = tab === "g" ? g : t; const setList = tab === "g" ? setG : setT;

  return <>
    <section className="panel flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
      <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist">
        {([["g", `武将 (${g.length}/${GENERALS.length})`], ["t", `戦法 (${t.length}/${TACTICS.length})`]] as const).map(([k, l]) => <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant="ghost" className={`text-xs ${tab === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`} onClick={() => { setTab(k); setFilter("all"); setQ(""); setGrade("all"); setDetail(null); }}>{l}</Button>)}
      </div>
      <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder={tab === "g" ? "武将名・勢力・固有戦法で検索" : "戦法名・種類で検索"} className="h-9 pl-8 text-xs" /></div>
      <select className="slot-select h-9 md:w-36" value={filter} onChange={e => setFilter(e.target.value)} aria-label="フィルタ"><option value="all">すべて</option><option value="owned">所持のみ</option><option value="unowned">未所持のみ</option>{types.map(x => <option key={x} value={x}>{x}</option>)}</select>
      <Button variant="simulation" className="text-xs" onClick={() => { setSavedG(g); setSavedT(t); notify(`所持状況を保存しました（武将${g.length}・戦法${t.length}）。`); }}><Save />所持状況を保存{dirty && " *"}</Button>
    </section>
    {tab === "g" ? <FactionTabs value={fac} onChange={setFac} /> : <div className="flex gap-1">{[["all", "すべて"], ["S", "S戦法"], ["A", "A戦法"]].map(([k, l]) => <Button key={k} size="sm" variant="ghost" className={`h-7 text-[11px] ${grade === k ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`} onClick={() => setGrade(k!)}>{l}</Button>)}</div>}
    {tab === "t" && detail && <section className="panel whitespace-pre-line px-5 py-3 text-[11px] leading-5">{detail}</section>}
    {groups.map(gr => <section key={gr.title} className="panel px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{gr.title}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{gr.items.length}件</span></h2>
        <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setList([...new Set([...list, ...gr.items.map(x => x.id)])])}>全選択</Button><Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setList(list.filter(id => !gr.items.some(x => x.id === id)))}>全解除</Button></div></div>
      {gr.items.length === 0 ? <p className="text-[11px] text-muted-foreground">該当なし</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {gr.items.map(x => { const on = list.includes(x.id); return <button key={x.id} type="button" className="owned-card" data-on={on} aria-pressed={on} title={x.tip || undefined} onMouseEnter={() => x.tip && setDetail(x.tip)} onClick={() => { toggle(list, setList, x.id); if (x.tip) setDetail(x.tip); }}>
          <span className="flex items-center justify-between"><span className="truncate text-[10px] text-gold">{tab === "g" ? `固有: ${x.star}` : `${x.star}戦法`}</span><span className="owned-check" aria-hidden="true">{on ? "✓" : ""}</span></span>
          <span className="mt-1 block text-[13px] font-semibold">{x.name}</span><span className="block text-[10px] text-muted-foreground">{x.sub}</span>
        </button>; })}
      </div>}
    </section>)}
  </>;
}

