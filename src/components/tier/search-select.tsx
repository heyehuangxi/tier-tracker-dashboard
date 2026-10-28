import { useId, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { portraitUrlForName } from "@/lib/sengoku-data";
import { GeneralFace } from "./general-face";

export type SearchOption = { value: string; label: string; name: string; disabled?: boolean };
export const matchesName = (name: string, query: string) => name.normalize("NFKC").toLocaleLowerCase().includes(query.trim().normalize("NFKC").toLocaleLowerCase());

export function SearchSelect({ value, options, onChange, label, placeholder }: { value: string; options: SearchOption[]; onChange: (value: string) => void; label: string; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const shown = options.filter(option => matchesName(option.name, query));
  const enabled = shown.filter(option => !option.disabled);
  const select = (next: string) => { onChange(next); setOpen(false); };
  return <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(""); setActive(0); }}>
    <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} className="slot-select flex justify-between gap-1 text-left font-normal"><span className="flex min-w-0 items-center gap-1.5">{(() => { const sel = options.find(option => option.value === value); return sel && portraitUrlForName(sel.name) ? <GeneralFace name={sel.name} className="h-7 w-5 text-[9px]" /> : null; })()}<span className="truncate">{options.find(option => option.value === value)?.label ?? placeholder}</span></span><ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="search-popover p-0">
      <div className="relative border-b border-border p-2"><Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label={`${label} 名前検索`} autoComplete="off" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="名前を検索" className="h-9 pl-8 text-xs" onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(previous => Math.max(0, Math.min(enabled.length - 1, previous + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter") { event.preventDefault(); const option = enabled[active]; if (option) select(option.value); }
      }} /></div>
      <div role="listbox" id={id} aria-label={`${label} 候補`} className="max-h-64 overflow-y-auto p-1">
        {!query && <Button variant="ghost" role="option" aria-selected={!value} className="h-9 w-full justify-start text-xs text-muted-foreground" onClick={() => select("")}>{placeholder}</Button>}
        {shown.map(option => <Button key={option.value} variant="ghost" role="option" aria-selected={value === option.value} disabled={option.disabled} className={`h-auto min-h-9 w-full justify-start whitespace-normal px-2 py-2 text-left text-xs ${enabled[active]?.value === option.value ? "bg-secondary" : ""}`} onClick={() => select(option.value)}>{portraitUrlForName(option.name) && <GeneralFace name={option.name} className="mr-2 h-9 w-7 text-[10px]" />}<span className="min-w-0 flex-1 break-words">{option.label}</span>{value === option.value && <Check className="text-primary" />}</Button>)}
        {!shown.length && <p role="status" className="px-3 py-5 text-center text-xs text-muted-foreground">該当する候補はありません</p>}
      </div>
    </PopoverContent>
  </Popover>;
}