import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Grid3X3, UserRound, Flag, Share2, Crosshair, BookOpen, ChartNoAxesCombined, PanelLeftClose, PanelLeftOpen, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Item = { label: string; icon: typeof Grid3X3; badge?: string; to?: "/" | "/coexist" | "/free" | "/holdings" | "/saved" | "/share" | "/tactics" };
const groups: { name: string; items: Item[] }[] = [
  { name: "主要機能", items: [{ label: "共存編成", icon: Grid3X3, badge: "作業台", to: "/coexist" }, { label: "自由編成", icon: Grid3X3, to: "/free" }, { label: "所持管理", icon: UserRound, to: "/holdings" }, { label: "保存した編成", icon: Flag, to: "/saved" }, { label: "共有", icon: Share2, to: "/share" }] },
  { name: "シミュレーター機能", items: [{ label: "Tier測定", icon: Crosshair, badge: "NEW", to: "/" }, { label: "Tier測定light", icon: Crosshair, badge: "NEW" }, { label: "模擬対戦", icon: Crosshair, badge: "NEW" }, { label: "AI編成", icon: Crosshair, badge: "NEW" }] },
  { name: "データベース", items: [{ label: "武将データベース", icon: BookOpen }, { label: "属性値ランキング", icon: ChartNoAxesCombined }, { label: "特性一覧", icon: BookOpen }, { label: "戦法一覧", icon: BookOpen, to: "/tactics" }] },
];
export function Navigation({ collapsed, mobileOpen, onCollapse, onClose, onSelect }: { collapsed: boolean; mobileOpen: boolean; onCollapse: () => void; onClose: () => void; onSelect: (label: string) => void }) {
  const [closed, setClosed] = useState<string[]>([]);
  const pathname = useRouterState({ select: s => s.location.pathname });
  return <aside className={`app-sidebar fixed inset-y-0 left-0 z-40 flex flex-col ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`} aria-label="サイドナビゲーション">
    <div className="flex h-[82px] shrink-0 items-center gap-3 px-4">
      <div className="brand-mark shrink-0" aria-hidden="true">真</div>
      {!collapsed && <div className="min-w-0"><div className="font-display text-[17px] font-bold whitespace-nowrap">真戦研究所</div><div className="mt-0.5 text-[10px] text-muted-foreground">SRI - v1.0</div></div>}
      <Button variant="ghost" size="icon" className="ml-auto md:hidden shrink-0" onClick={onClose} aria-label="メニューを閉じる"><X /></Button>
    </div>
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
      {groups.map(group => <div key={group.name} className="mb-3">
        {!collapsed && <Button variant="ghost" className="mb-1 h-7 w-full justify-between px-3 text-[10px] font-normal text-muted-foreground/70" onClick={() => setClosed(prev => prev.includes(group.name) ? prev.filter(x => x !== group.name) : [...prev, group.name])} aria-expanded={!closed.includes(group.name)}>{group.name}<ChevronDown className={`size-3 transition-transform ${closed.includes(group.name) ? "-rotate-90" : ""}`} /></Button>}
        {(!closed.includes(group.name) || collapsed) && group.items.map(item => {
          const active = item.to === pathname;
          const inner = <><item.icon className="size-[15px] shrink-0" />{!collapsed && <><span className="text-[13px]">{item.label}</span>{item.badge && <span className="new-badge">{item.badge}</span>}</>}</>;
          const cls = `nav-item ${collapsed ? "justify-center px-0" : ""}`;
          return item.to
            ? <Button key={item.label} asChild variant="ghost" className={cls} data-active={active}><Link to={item.to} aria-current={active ? "page" : undefined} onClick={onClose} title={collapsed ? item.label : undefined}>{inner}</Link></Button>
            : <Button key={item.label} variant="ghost" className={cls} onClick={() => { onSelect(item.label); onClose(); }} title={collapsed ? item.label : undefined}>{inner}</Button>;
        })}
      </div>)}
    </nav>
    <div className="mx-2 border-t border-muted py-3"><Button variant="ghost" className="w-full justify-start gap-3 px-3 text-xs font-normal text-muted-foreground" onClick={onCollapse} title={collapsed ? "メニューを展開" : "折りたたむ"}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}{!collapsed && "折りたたむ"}</Button></div>
  </aside>;
}
