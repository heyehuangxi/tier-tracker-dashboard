import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileNav, TopNav } from "./navigation";

const NoticeCtx = createContext<(msg: string) => void>(() => {});
export const useNotice = () => useContext(NoticeCtx);

export function AppShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(id); }, [notice]);
  return <NoticeCtx.Provider value={setNotice}><div className="min-h-screen">
    <header className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-md">
      <div className="content-wrap flex h-[68px] items-center gap-3 px-4 sm:px-6">
        <a href="/" className="flex min-w-0 items-center gap-3" aria-label="ぴえんで候 トップへ">
          <span className="brand-seal" aria-hidden="true">ぴ</span>
          <span className="min-w-0">
            <span className="block truncate font-display text-[21px] font-bold leading-tight tracking-[0.06em]">ぴえんで候</span>
            <span className="block text-[9.5px] tracking-[0.28em] text-muted-foreground">SENGOKU LAB — 真戦・編成考査</span>
          </span>
        </a>
        <span className="v-text ml-auto hidden h-9 select-none text-[10px] text-gold lg:block" aria-hidden="true">真戦</span>
        <Button variant="ghost" size="icon" className="ml-auto shrink-0 lg:hidden" onClick={() => setMobileOpen(v => !v)} aria-label={mobileOpen ? "メニューを閉じる" : "メニューを開く"} aria-expanded={mobileOpen}>{mobileOpen ? <X /> : <Menu />}</Button>
      </div>
      <div className="content-wrap hidden px-4 sm:px-6 lg:block">
        <TopNav onSelect={label => setNotice(`${label}は準備中です。`)} />
      </div>
      {mobileOpen && <div className="border-t border-border bg-card px-3 py-3 lg:hidden">
        <MobileNav onSelect={label => setNotice(`${label}は準備中です。`)} onNavigate={() => setMobileOpen(false)} />
      </div>}
    </header>

    <div className="content-wrap px-4 sm:px-6">
      <div className="page-hero flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-4 pt-7">
        <h1 className="font-display text-[30px] font-bold leading-none tracking-[0.04em] sm:text-[34px]">{title}</h1>
        {description && <p className="max-w-xl pb-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>

    <main className="content-wrap space-y-5 px-4 py-6 sm:px-6">{children}</main>

    <footer className="content-wrap px-4 pb-8 sm:px-6">
      <div className="border-t border-border pt-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          本サイト「ぴえんで候」は『信長の野望 真戦』の非公式ファンツールです。ゲーム公式とは関係ありません。シミュレーション結果は試算であり、実際の戦闘結果を保証するものではありません。所持・編成などのデータはお使いのブラウザ内（localStorage）にのみ保存され、サーバーへ送信されることはありません。
        </p>
      </div>
    </footer>

    {notice && <div role="status" className="fixed bottom-5 right-4 z-50 flex max-w-[calc(100%-32px)] items-center gap-3 rounded bg-foreground px-4 py-3 text-xs text-background shadow-lg"><Check className="size-4 shrink-0 text-gold" /><span className="break-all">{notice}</span><Button variant="ghost" size="icon" className="size-7 shrink-0 text-background hover:bg-white/10 hover:text-background" aria-label="通知を閉じる" onClick={() => setNotice("")}><X /></Button></div>}
  </div></NoticeCtx.Provider>;
}
