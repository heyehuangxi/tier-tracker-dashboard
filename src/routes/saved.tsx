import { createFileRoute, Link } from "@tanstack/react-router";
import { FormationCard } from "@/components/tier/formation-card";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { MAX_SAVED, type SavedFormation } from "@/lib/sengoku-data";
import { useLocal, KEYS } from "@/lib/use-local";

export const Route = createFileRoute("/saved")({
  head: () => ({ meta: [
    { title: "保存した編成 | ぴえんで候" },
    { name: "description", content: "共存編成・自由編成で保存した部隊構成を一覧・読込・削除できます。" },
    { property: "og:title", content: "保存した編成 | ぴえんで候" },
    { property: "og:description", content: "保存した部隊構成を最大20件まで管理。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <AppShell title="保存した編成" description={`最大${MAX_SAVED}件まで保存できます。`}><Saved /></AppShell>,
});

function Saved() {
  const notify = useNotice();
  const [saved, setSaved] = useLocal<SavedFormation[]>(KEYS.saved, []);
  return <>
    <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground"><span>保存件数</span><span className="tabular-nums">{saved.length}/{MAX_SAVED}</span></div>
    {saved.length === 0 ? <div className="panel px-6 py-10 text-center"><p className="text-sm font-semibold">保存した編成はありません</p><p className="mt-2 text-xs text-muted-foreground">共存編成・自由編成の「編成を保存」から追加できます。</p><div className="mt-5 flex justify-center gap-2"><Button asChild variant="simulation" className="text-xs"><Link to="/coexist">共存編成へ</Link></Button><Button asChild variant="import" className="text-xs"><Link to="/free">自由編成へ</Link></Button></div></div>
      : saved.map(f => <FormationCard key={f.id} f={f} onDelete={() => { setSaved(saved.filter(x => x.id !== f.id)); notify(`「${f.name}」を削除しました。`); }} />)}
  </>;
}
