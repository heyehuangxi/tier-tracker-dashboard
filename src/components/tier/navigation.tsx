import { Link, useRouterState } from "@tanstack/react-router";

type Item = { label: string; badge?: string; to?: "/" | "/coexist" | "/free" | "/holdings" | "/saved" | "/share" | "/tactics" | "/tier-light" | "/explore" };
const items: Item[] = [
  { label: "Tier測定", badge: "NEW", to: "/" },
  { label: "Tier測定light", badge: "NEW", to: "/tier-light" },
  { label: "AI編成探索", badge: "NEW", to: "/explore" },
  { label: "共存編成", to: "/coexist" },
  { label: "自由編成", to: "/free" },
  { label: "所持管理", to: "/holdings" },
  { label: "保存した編成", to: "/saved" },
  { label: "共有", to: "/share" },
  { label: "戦法一覧", to: "/tactics" },
  { label: "模擬対戦", badge: "NEW" },
  { label: "武将データベース" },
  { label: "属性値ランキング" },
  { label: "特性一覧" },
];

/** 上部ナビゲーション（横並び）。準備中項目は onSelect で通知する。 */
export function TopNav({ onSelect, onNavigate }: { onSelect: (label: string) => void; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return <nav aria-label="メインナビゲーション" className="flex items-center overflow-x-auto">
    {items.map(item => {
      const active = item.to === pathname;
      const badge = item.badge ? <span className="new-badge">{item.badge}</span> : null;
      return item.to
        ? <Link key={item.label} to={item.to} className="topnav-link" data-active={active} aria-current={active ? "page" : undefined} onClick={onNavigate}>{item.label}{badge}</Link>
        : <button key={item.label} type="button" className="topnav-link" onClick={() => { onSelect(item.label); onNavigate?.(); }}>{item.label}{badge}</button>;
    })}
  </nav>;
}

/** モバイル用ドロワー内の縦並びナビ。 */
export function MobileNav({ onSelect, onNavigate }: { onSelect: (label: string) => void; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return <nav aria-label="メインナビゲーション" className="flex flex-col gap-0.5">
    {items.map(item => {
      const active = item.to === pathname;
      const badge = item.badge ? <span className="new-badge">{item.badge}</span> : null;
      return item.to
        ? <Link key={item.label} to={item.to} className="mobilenav-link" data-active={active} aria-current={active ? "page" : undefined} onClick={onNavigate}>{item.label}{badge}</Link>
        : <button key={item.label} type="button" className="mobilenav-link" onClick={() => { onSelect(item.label); onNavigate?.(); }}>{item.label}{badge}</button>;
    })}
  </nav>;
}
