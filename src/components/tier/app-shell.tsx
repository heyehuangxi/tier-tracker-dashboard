import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navigation } from "./navigation";

const NoticeCtx = createContext<(msg: string) => void>(() => {});
export const useNotice = () => useContext(NoticeCtx);

export function AppShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(id); }, [notice]);
  return <NoticeCtx.Provider value={setNotice}><div className="min-h-screen">
    {mobileOpen && <div className="fixed inset-0 z-30 bg-foreground/25 md:hidden" onClick={() => setMobileOpen(false)} />}
    <Navigation collapsed={collapsed} mobileOpen={mobileOpen} onCollapse={() => { setCollapsed(v => !v); setMobileOpen(false); }} onClose={() => setMobileOpen(false)} onSelect={label => setNotice(`${label}は準備中です。`)} />
    <main className={`app-main min-h-screen ${collapsed ? "collapsed" : ""}`}>
      <header className="flex h-[64px] items-center gap-3 border-b border-muted bg-card/70 backdrop-blur-xl px-4 sm:px-7">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={() => setMobileOpen(true)} aria-label="メニューを開く"><Menu /></Button>
        <h1 className="page-title flex shrink-0 items-center gap-3 font-display text-xl font-bold">{title}</h1>
        {description && <span className="ml-1 hidden min-w-0 truncate border-l border-muted pl-4 text-[11px] text-muted-foreground/70 lg:block">{description}</span>}
      </header>
      <div className="content-wrap space-y-4 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
    </main>
    {notice && <div role="status" className="panel fixed bottom-5 right-4 z-50 flex max-w-[calc(100%-32px)] items-center gap-3 px-4 py-3 text-xs"><Check className="size-4 shrink-0 text-primary" /><span className="break-all">{notice}</span><Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="通知を閉じる" onClick={() => setNotice("")}><X /></Button></div>}
  </div></NoticeCtx.Provider>;
}
