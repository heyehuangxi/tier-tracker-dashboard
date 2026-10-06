import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Save, Share2, Trash2, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GENERALS, TACTICS, MAX_SQUADS, MAX_SAVED, emptySquad, encodeFormation, generalById, tacticById, type Mode, type Squad, type SavedFormation } from "@/lib/sengoku-data";
import { useLocal, KEYS } from "@/lib/use-local";
import { useNotice } from "./app-shell";

export function FormationEditor({ mode }: { mode: Mode }) {
  const notify = useNotice();
  const [squads, setSquads, ready] = useLocal<Squad[]>(KEYS.draft(mode), [emptySquad()]);
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

  const update = (i: number, fn: (s: Squad) => Squad) => setSquads(squads.map((s, j) => (j === i ? fn({ generals: [...s.generals], tactics: [...s.tactics] }) : s)));
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
    {shareUrl && <section className="panel flex items-center gap-2 px-4 py-3"><Input readOnly value={shareUrl} className="h-8 flex-1 text-[11px]" onFocus={e => e.currentTarget.select()} /><Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(shareUrl); notify("コピーしました。"); }}><Copy />コピー</Button></section>}
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {squads.map((s, i) => <section key={i} className="panel px-4 py-4" aria-label={`部隊${i + 1}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">部隊 {i + 1}</h2>{squads.length > 1 && <Button variant="ghost" size="icon" className="size-7" aria-label={`部隊${i + 1}を削除`} onClick={() => setSquads(squads.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map(slot => <div key={slot} className="rounded-md border border-muted bg-background/50 p-2.5">
            <div className="mb-1.5 text-[10px] text-muted-foreground">{slot === 0 ? "大将" : "副将"}</div>
            <select className="slot-select font-semibold" value={s.generals[slot] ?? ""} onChange={e => update(i, x => { x.generals[slot] = e.target.value || null; return x; })} aria-label={`部隊${i + 1} ${slot === 0 ? "大将" : `副将${slot}`}`}>
              <option value="">— 武将を選択 —</option>
              {poolG.map(gn => { const other = usedG.get(gn.id); const disabled = (s.generals.includes(gn.id) && s.generals[slot] !== gn.id) || (coexist && other !== undefined && other !== i); return <option key={gn.id} value={gn.id} disabled={disabled}>{"★".repeat(gn.rarity === 5 ? 5 : 4)} {gn.name}{coexist && other !== undefined && other !== i ? `（部隊${other + 1}で使用中）` : ""}</option>; })}
            </select>
            {[0, 1].map(k => { const ti = slot * 2 + k; return <select key={k} className="slot-select mt-1.5" value={s.tactics[ti] ?? ""} onChange={e => update(i, x => { x.tactics[ti] = e.target.value || null; return x; })} aria-label={`部隊${i + 1} 戦法${ti + 1}`}>
              <option value="">— 戦法 —</option>
              {poolT.map(tc => { const other = usedT.get(tc.id); const disabled = (s.tactics.includes(tc.id) && s.tactics[ti] !== tc.id) || (coexist && other !== undefined && other !== i); return <option key={tc.id} value={tc.id} disabled={disabled}>[{tc.grade}] {tc.name}{coexist && other !== undefined && other !== i ? `（部隊${other + 1}）` : ""}</option>; })}
            </select>; })}
          </div>)}
        </div>
      </section>)}
    </div>
    {squads.length < MAX_SQUADS && <Button variant="ghost" className="w-full border border-dashed border-border text-xs text-muted-foreground" onClick={() => setSquads([...squads, emptySquad()])}><Plus />部隊を追加（{squads.length}/{MAX_SQUADS}）</Button>}
  </>;
}

export function FormationPreview({ squads }: { squads: Squad[] }) {
  const used = squads.map((s, i) => ({ s, i })).filter(({ s }) => s.generals.some(Boolean) || s.tactics.some(Boolean));
  if (!used.length) return <p className="text-[11px] text-muted-foreground">空の編成</p>;
  return <div className="space-y-1.5">{used.map(({ s, i }) => <div key={i} className="text-[11px] leading-5"><span className="mr-2 font-semibold">部隊{i + 1}</span><span>{s.generals.map(id => (id ? generalById.get(id)?.name : "—")).join(" / ")}</span><span className="ml-2 text-muted-foreground">{s.tactics.filter(Boolean).map(id => tacticById.get(id!)?.name).join("・")}</span></div>)}</div>;
}
