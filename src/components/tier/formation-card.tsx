import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotice } from "./app-shell";
import { FormationPreview } from "./formation-editor";
import type { SavedFormation } from "@/lib/sengoku-data";
import { writeLocal, KEYS } from "@/lib/use-local";

export function FormationCard({ f, onDelete }: { f: SavedFormation; onDelete: () => void }) {
  const navigate = useNavigate(); const notify = useNotice();
  return <section className="panel px-4 py-4 sm:px-5">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{f.name}</h2><p className="mt-0.5 text-[10px] text-muted-foreground"><span className="mode-badge mr-2">{f.mode === "coexist" ? "共存編成" : "自由編成"}</span>{new Date(f.createdAt).toLocaleString("ja-JP")}</p></div>
      <div className="flex gap-1">
        <Button size="sm" variant="import" className="text-[11px]" onClick={() => { writeLocal(KEYS.draft(f.mode), f.squads); notify(`「${f.name}」を読み込みました。`); navigate({ to: f.mode === "coexist" ? "/coexist" : "/free" }); }}><FolderOpen />読込</Button>
        <Button size="sm" variant="ghost" className="text-[11px] text-muted-foreground" onClick={onDelete}><Trash2 />削除</Button>
      </div>
    </div>
    <FormationPreview squads={f.squads} />
  </section>;
}

