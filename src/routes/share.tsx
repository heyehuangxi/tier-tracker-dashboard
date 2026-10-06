import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, useNotice } from "@/components/tier/app-shell";
import { FormationCard } from "@/components/tier/formation-card";
import { decodeFormation, MAX_SAVED, type SavedFormation } from "@/lib/sengoku-data";
import { useLocal, readLocal, writeLocal, KEYS } from "@/lib/use-local";

export const Route = createFileRoute("/share")({
  head: () => ({ meta: [
    { title: "共有 | 真戦研究所" },
    { name: "description", content: "共有URLから受け取った編成を表示・保存します。" },
    { property: "og:title", content: "共有された編成 | 真戦研究所" },
    { property: "og:description", content: "共有URLで届いた部隊構成を確認できます。" },
  ] }),
  component: () => <AppShell title="共有" description="共有URLから読み込んだ編成がここに表示されます。"><Share /></AppShell>,
});

function Share() {
  const notify = useNotice(); const navigate = useNavigate();
  const [shared, setShared] = useLocal<SavedFormation[]>(KEYS.shared, []);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return; done.current = true;
    const d = new URLSearchParams(window.location.search).get("d");
    if (!d) return;
    const f = decodeFormation(d);
    if (!f) { notify("共有URLの形式が正しくありません。"); return; }
    const list = readLocal<SavedFormation[]>(KEYS.shared, []);
    const item: SavedFormation = { id: crypto.randomUUID(), name: f.name || "共有された編成", createdAt: new Date().toISOString(), mode: f.mode, squads: f.squads };
    writeLocal(KEYS.shared, [item, ...list].slice(0, 50));
    notify("共有された編成を読み込みました。");
    navigate({ to: "/share", replace: true });
  }, [navigate, notify]);

  function toSaved(f: SavedFormation) {
    const saved = readLocal<SavedFormation[]>(KEYS.saved, []);
    if (saved.length >= MAX_SAVED) return notify(`保存できる編成は最大${MAX_SAVED}件です。`);
    writeLocal(KEYS.saved, [{ ...f, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...saved]);
    notify(`「${f.name}」を保存した編成に追加しました。`);
  }

  if (!shared.length) return <div className="panel px-6 py-10 text-center"><p className="text-sm font-semibold">共有された編成はありません</p><p className="mt-2 text-xs text-muted-foreground">共存編成・自由編成の「共有URLを発行」で作ったURLを開くと、ここに表示されます。</p></div>;
  return <>{shared.map(f => <div key={f.id} className="space-y-1">
    <FormationCard f={f} onDelete={() => setShared(shared.filter(x => x.id !== f.id))} />
    <div className="flex justify-end"><Button size="sm" variant="ghost" className="text-[11px]" onClick={() => toSaved(f)}><BookmarkPlus />保存した編成に追加</Button></div>
  </div>)}</>;
}
