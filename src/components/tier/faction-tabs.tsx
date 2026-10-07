import { Button } from "@/components/ui/button";
import { FACTIONS } from "@/lib/sengoku-data";

export function FactionTabs({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="勢力">
    {["all", ...FACTIONS].map(f => <Button key={f} role="tab" aria-selected={value === f} size="sm" variant="ghost" className={`h-7 text-[11px] ${value === f ? "bg-card font-semibold shadow-sm" : "text-muted-foreground"}`} onClick={() => onChange(f)}>{f === "all" ? "すべて" : f}</Button>)}
  </div>;
}
