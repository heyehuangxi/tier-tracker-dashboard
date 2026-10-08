import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus as PlusI, Save, Share2, Trash2, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GENERALS, TACTICS, MAX_SQUADS, MAX_SAVED, emptySquad, normSquad, encodeFormation, FACTIONS, STAT_NAMES, LEVEL, pointsFor, unlockedSkills, generalById, tacticById, tacticTip, MAX_COST, effectiveFaction, squadCost, hasFactionBonus, buffed, type Mode, type Squad, type SavedFormation } from "@/lib/sengoku-data";
import { useLocal, KEYS } from "@/lib/use-local";
import { useNotice } from "./app-shell";
import { FactionTabs } from "./faction-tabs";

export function FormationEditor({ mode }: { mode: Mode }) {
  const notify = useNotice();
  const [rawSquads, setSquads, ready] = useLocal<Squad[]>(KEYS.draft(mode), [emptySquad()]);
  const squads = useMemo(() => rawSquads.map(normSquad), [rawSquads]);
  const [fac, setFac] = useState("all");
  const [ownedG] = useLocal<string[]>(KEYS.ownedGenerals, []);
  const [ownedT] = useLocal<string[]>(KEYS.ownedTactics, []);
  const [saved, setSaved] = useLocal<SavedFormation[]>(KEYS.saved, []);
  const [name, setName] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const coexist = mode === "coexist";

  const poolG = coexist ? GENERALS.filter(x => ownedG.includes(x.id)) : GENERALS;
  const poolT = coexist ? TACTICS.filter(x => ownedT.includes(x.id)) : TACTICS;

  // 共存編成：全部隊で使用中の武将・戦法（どの部隊のどの枠か）
  const usedG = useMemo(() => { const m = new Map<string, number>(); squads.forEach((s, i) => s.generals.forEach(id => id && m.set(id, i))); return m; }, [squads]);
  const usedT = useMemo(() => { const m = new Map<string, number>(); squads.forEach((s, i) => s.tactics.forEach(id => id && m.set(id, i))); return m; }, [squads]);

  const update = (i: number, fn: (s: Squad) => Squad) => setSquads(squads.map((s, j) => (j === i ? fn({ generals: [...s.generals], tactics: [...s.tactics], ranks: [...s.ranks!], alloc: s.alloc!.map(a => [...a]) }) : s)));
  const filled = squads.some(s => s.generals.some(Boolean) || s.tactics.some(Boolean));

  function save() {
    if (!filled) return notify("武将または戦法を1つ以上選択してください。");
    if (saved.length >= MAX_SAVED) return notify(`保存できる編成は最大${MAX_SAVED}件です。不要な編成を削除してください。`);
    const item: SavedFormation = { id: crypto.randomUUID(), name: name.trim() || `${coexist ? "共存" : "自由"}編成 ${saved.length + 1}`, createdAt: new Date().toISOString(), mode, squads };
    setSaved([item, ...saved]); setName(""); notify(`「${item.name}」を保存しました。`);
  }
  function share() {
    if (!filled) return notify("武将または戦法を1つ以上選択してください。");
    const url = `${window.location.origin}/share?d=${encodeFormation({ mode, squads, name: name.trim() || undefined })}`;
    setShareUrl(url); navigator.clipboard?.writeText(url).then(() => notify("共有URLをコピーしました。"), () => notify("共有URLを発行しました。"));
  }

  if (coexist && ready && poolG.length === 0) return <div className="panel px-6 py-10 text-center"><p className="text-sm font-semibold">所持武将が登録されていません</p><p className="mt-2 text-xs text-muted-foreground">共存編成では、所持管理で保存した武将・戦法のみ使えます。</p><Button asChild variant="simulation" className="mt-5 text-xs"><Link to="/holdings">所持管理へ</Link></Button></div>;

  return <>
    <section className="panel flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1 text-[11px] leading-5 text-muted-foreground">{coexist ? <>所持武将 {poolG.length}名・所持戦法 {poolT.length}種を使用。<span className="font-medium text-foreground">1つの部隊で使った武将・戦法は他の部隊で選べません。</span></> : <>全武将・全戦法を使用できます。部隊間での重複利用も可能です。</>}<span className="ml-2 tabular-nums">部隊 {squads.length}/{MAX_SQUADS}</span></div>
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="編成名（任意）" className="h-9 w-full text-xs sm:w-44" maxLength={40} />
        <Button variant="simulation" className="text-xs" onClick={save}><Save />編成を保存</Button>
        <Button variant="import" className="text-xs" onClick={share}><Share2 />共有URLを発行</Button>
        <Button variant="ghost" size="icon" aria-label="編成をリセット" title="編成をリセット" onClick={() => { setSquads([emptySquad()]); notify("編成をリセットしました。"); }}><RotateCcw /></Button>
      </div>
    </section>
    <section className="panel flex flex-wrap items-center gap-3 px-4 py-3"><span className="text-[11px] text-muted-foreground">勢力で絞り込み（コスト高い順）</span><FactionTabs value={fac} onChange={setFac} /></section>
    {shareUrl && <section className="panel flex items-center gap-2 px-4 py-3"><Input readOnly value={shareUrl} className="h-8 flex-1 text-[11px]" onFocus={e => e.currentTarget.select()} /><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(shareUrl); notify("コピーしました。"); }}><Copy />コピー</Button></section>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {squads.map((s, i) => <section key={i} className="panel px-4 py-4" aria-label={`部隊${i + 1}`}>
        <div className="mb-3 flex items-center justify-between"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">部隊 {i + 1}</h2><span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${squadCost(s.generals) > MAX_COST ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>コスト {squadCost(s.generals)}/{MAX_COST}</span>{hasFactionBonus(s.generals) && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">同勢力（{effectiveFaction(s.generals, 0)}）全属性+7%</span>}</div>{squads.length > 1 && <Button variant="ghost" size="icon" className="size-7" aria-label={`部隊${i + 1}を削除`} onClick={() => setSquads(squads.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map(slot => <div key={slot} className="rounded-md border border-muted bg-background/50 p-2.5">
            <div className="mb-1.5 text-[10px] text-muted-foreground">{slot === 0 ? "大将" : "副将"}</div>
            <select className="slot-select font-semibold" value={s.generals[slot] ?? ""} onChange={e => { const v = e.target.value || null; const next = [...s.generals]; next[slot] = v; if (v && squadCost(next) > MAX_COST) { notify(`部隊コストが上限（${MAX_COST}）を超えています。`); return; } update(i, x => { x.generals[slot] = v; x.alloc![slot] = [0, 0, 0, 0]; return x; }); }} aria-label={`部隊${i + 1} ${slot === 0 ? "大将" : `副将${slot}`}`}>
              <option value="">— 武将を選択 —</option>
              {poolG.filter(gn => fac === "all" || gn.faction === fac || gn.id === s.generals[slot]).map(gn => { const other = usedG.get(gn.id); const over = gn.id !== s.generals[slot] && squadCost(s.generals.map((x, j) => (j === slot ? gn.id : x))) > MAX_COST; const disabled = over || (s.generals.includes(gn.id) && s.generals[slot] !== gn.id) || (coexist && other !== undefined && other !== i); return <option key={gn.id} value={gn.id} disabled={disabled}>[{gn.cost}] {gn.name}（{gn.faction}）{coexist && other !== undefined && other !== i ? `（部隊${other + 1}で使用中）` : over ? "（コスト超過）" : ""}</option>; })}
            </select>
            <div className="inherent-field" aria-label={`部隊${i + 1} ${slot === 0 ? "大将" : `副将${slot}`} 固有戦法`} aria-readonly="true"><span className="text-[9px] text-muted-foreground">固有戦法</span><span className="truncate">{s.generals[slot] ? generalById.get(s.generals[slot]!)?.inherent : "武将を選択すると自動表示"}</span></div>
            {(() => { const gn = s.generals[slot] ? generalById.get(s.generals[slot]!) : undefined; if (!gn) return null; const rank = s.ranks![slot]!; const al = s.alloc![slot]!; const total = pointsFor(rank); const left = total - al.reduce((a, b) => a + b, 0); const setAl = (k: number, v: number) => update(i, x => { const cur = x.alloc![slot]!; const max = cur[k]! + (total - cur.reduce((a, b) => a + b, 0)); cur[k] = Math.max(0, Math.min(max, v)); return x; }); return <div className="mt-1.5 space-y-1.5 rounded border border-muted bg-card p-2">
              <div className="flex items-center justify-between text-[10px]"><span className="text-muted-foreground">Lv{LEVEL}・コスト{gn.cost}・<span className={effectiveFaction(s.generals, slot) !== gn.faction ? "font-semibold text-primary" : ""}>{effectiveFaction(s.generals, slot)}</span>・{gn.main}</span><select className="slot-select h-6 w-16 py-0 text-[10px]" value={rank} aria-label={`部隊${i + 1} 枠${slot + 1} 凸数`} onChange={e => update(i, x => { const r = Number(e.target.value); x.ranks![slot] = r; let lim = pointsFor(r); x.alloc![slot] = x.alloc![slot]!.map(v => { const n = Math.min(v, lim); lim -= n; return n; }); return x; })}>{[0, 1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r}凸</option>)}</select></div>
              <div className="flex flex-wrap gap-1">{[[1, gn.r1], [3, gn.r3], [5, gn.r5]].filter(([, n]) => n !== "-").map(([r, n]) => { const on = unlockedSkills(gn, rank).some(([u]) => u === r); return <span key={r as number} className={`rounded px-1.5 py-0.5 text-[9px] ${on ? "bg-primary/15 font-semibold text-primary" : "bg-muted text-muted-foreground line-through"}`}>{r}凸:{n}</span>; })}</div>
              <div className="text-[10px] tabular-nums">属性ポイント 残り <span className={left ? "font-semibold text-primary" : ""}>{left}</span>/{total}</div>
              {STAT_NAMES.map((nm, k) => <div key={nm} className="flex items-center gap-1 text-[10px] tabular-nums"><span className="w-8 shrink-0 whitespace-nowrap text-muted-foreground">{nm}</span><span className="whitespace-nowrap">{buffed(gn.stats[k]! + al[k]!, hasFactionBonus(s.generals))}{hasFactionBonus(s.generals) && <span className="text-primary">↑</span>}{al[k]! > 0 && <span className="text-primary">(+{al[k]})</span>}</span><button type="button" className="grid size-5 place-items-center rounded border border-border disabled:opacity-30" aria-label={`${nm}を減らす`} disabled={!al[k]} onClick={() => setAl(k, al[k]! - 1)}><Minus className="size-3" /></button><span className="flex-1" /><button type="button" className="grid size-5 place-items-center rounded border border-border disabled:opacity-30" aria-label={`${nm}を増やす`} disabled={!left} onClick={() => setAl(k, al[k]! + 1)}><PlusI className="size-3" /></button></div>)}
            </div>; })()}
            {[0, 1].map(k => { const ti = slot * 2 + k; const cur = s.tactics[ti] ? tacticById.get(s.tactics[ti]!) : undefined; return <div key={k}><select title={cur ? tacticTip(cur) : undefined} className="slot-select mt-1.5" value={s.tactics[ti] ?? ""} onChange={e => update(i, x => { x.tactics[ti] = e.target.value || null; return x; })} aria-label={`部隊${i + 1} ${slot === 0 ? "大将" : `副将${slot}`} 伝授戦法${k + 1}`}>
              <option value="">— 伝授戦法{k + 1} —</option>
              {cur && !sortedT.includes(cur) && <option value={cur.id}>[{cur.grade}] {cur.name}</option>}{sortedT.map(tc => { const other = usedT.get(tc.id); const disabled = (s.tactics.includes(tc.id) && s.tactics[ti] !== tc.id) || (coexist && other !== undefined && other !== i); return <option key={tc.id} value={tc.id} disabled={disabled} title={tacticTip(tc)}>[{tc.grade}・{tc.kind}] {tc.name}{coexist && other !== undefined && other !== i ? `（部隊${other + 1}）` : ""}</option>; })}
            </select>{cur && <details className="mt-1 rounded border border-muted bg-card px-2 py-1 text-[10px] leading-4"><summary className="cursor-pointer text-muted-foreground">{cur.kind}・発動{cur.rate}・{cur.troop}</summary><p className="mt-1">{cur.effect}</p></details>}</div>; })}
          </div>)}
        </div>
      </section>)}
    </div>
    {squads.length < MAX_SQUADS && <Button variant="ghost" className="w-full border border-dashed border-border text-xs text-muted-foreground" onClick={() => setSquads([...squads, emptySquad()])}><PlusI />部隊を追加（{squads.length}/{MAX_SQUADS}）</Button>}
  </>;
}

export function FormationPreview({ squads }: { squads: Squad[] }) {
  const used = squads.map((s, i) => ({ s, i })).filter(({ s }) => s.generals.some(Boolean) || s.tactics.some(Boolean));
  if (!used.length) return <p className="text-[11px] text-muted-foreground">空の編成</p>;
  return <div className="space-y-1.5">{used.map(({ s, i }) => <div key={i} className="text-[11px] leading-5"><span className="mr-2 font-semibold">部隊{i + 1}</span><span className="mr-2 text-muted-foreground tabular-nums">コスト{squadCost(s.generals)}/{MAX_COST}</span>{hasFactionBonus(s.generals) && <span className="mr-2 font-semibold text-primary">同勢力+7%</span>}{[0, 1, 2].map(k => { const gid = s.generals[k]; const gn = gid ? generalById.get(gid) : undefined; const tx = [s.tactics[k * 2], s.tactics[k * 2 + 1]].filter(Boolean).map(id => tacticById.get(id!)?.name); return <span key={k} className="mr-3 inline-block">{gn ? `${gn.name}${effectiveFaction(s.generals, k) !== gn.faction ? `［${effectiveFaction(s.generals, k)}］` : ""} ${s.ranks?.[k] ?? 0}凸` : "—"}{gn && <span className="text-muted-foreground">（固有:{gn.inherent}{tx.length ? `／${tx.join("・")}` : ""}）</span>}</span>; })}</div>)}</div>;
}
