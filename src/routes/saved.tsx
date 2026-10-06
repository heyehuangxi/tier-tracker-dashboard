import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { FormationPreview } from "@/components/tier/formation-editor";
import { MAX_SAVED, type SavedFormation } from "@/lib/sengoku-data";
import { useLocal, writeLocal, KEYS } from "@/lib/use-local";

export const Route = createFileRoute("/saved")({
  head: () => ({ meta: [
    { title: "保存した編成 | 真戦研究所" },
    { name: "description", content: "共存編成・自由編成で保存した部隊構成を一覧・読込・削除できます。" },
    { property: "og:title", content: "保存した編成 | 真戦研究所" },
    { property: "og:description", content: "保存した部隊構成を最大20件まで管理。" },
  ] }),
  component: () => <AppShell title="保存した編成" description={`最大${MAX_SAVED}件まで保存できます。`}><Saved /></AppShell>,
});

export function FormationCard({ f, onDelete }: { f: SavedFormation; onDelete: () => void }) {
  const navigate = useNavigate(); const notify = useNotice();
  return <section className="panel px-4 py-4 sm:px-5">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{f.name}</h2><p className="mt-0.5 text-[10px] text-muted-foreground"><span className="new-badge ml-0 mr-2">{f.mode === "coexist" ? "共存編成" : "自由編成"}</span>{new Date(f.createdAt).toLocaleString("ja-JP")}</p></div>
      <div className="flex gap-1">
        <Button size="sm" variant="import" className="text-[11px]" onClick={() => { writeLocal(KEYS.draft(f.mode), f.squads); notify(`「${f.name}」を読み込みました。`); navigate({ to: f.mode === "coexist" ? "/coexist" : "/free" }); }}><FolderOpen />読込</Button>
        <Button size="sm" variant="ghost" className="text-[11px] text-muted-foreground" onClick={onDelete}><Trash2 />削除</Button>
      </div>
    </div>
    <FormationPreview squads={f.squads} />
  </section>;
}

function Saved() {
  const notify = useNotice();
  const [saved, setSaved] = useLocal<SavedFormation[]>(KEYS.saved, []);
  return <>
    <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground"><span>保存件数</span><span className="tabular-nums">{saved.length}/{MAX_SAVED}</span></div>
    {saved.length === 0 ? <div className="panel px-6 py-10 text-center"><p className="text-sm font-semibold">保存した編成はありません</p><p className="mt-2 text-xs text-muted-foreground">共存編成・自由編成の「編成を保存」から追加できます。</p><div className="mt-5 flex justify-center gap-2"><Button asChild variant="simulation" className="text-xs"><Link to="/coexist">共存編成へ</Link></Button><Button asChild variant="import" className="text-xs"><Link to="/free">自由編成へ</Link></Button></div></div>
      : saved.map(f => <FormationCard key={f.id} f={f} onDelete={() => { setSaved(saved.filter(x => x.id !== f.id)); notify(`「${f.name}」を削除しました。`); }} />)}
  </>;
}
