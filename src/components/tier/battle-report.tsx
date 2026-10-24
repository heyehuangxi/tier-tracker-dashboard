import { useEffect, useMemo, useState } from "react";
import { X, HeartPulse, Skull, Swords } from "lucide-react";
import type { BattleReport, LogTone } from "@/lib/simulator";

const TONE_CLASS: Record<LogTone, string> = {
  ally: "br-seg-ally",
  enemy: "br-seg-enemy",
  damage: "br-seg-damage",
  heal: "br-seg-heal",
  effect: "br-seg-effect",
  plain: "br-seg-plain",
};
const TABS = [ -1, 0, 1, 2, 3, 4, 5, 6, 7, 8 ] as const; // -1=全ターン、0=合戦開始、1〜8=ターン
const tabLabel = (t: number) => (t === -1 ? "全ターン" : t === 0 ? "合戦開始" : `ターン${t}`);

/** ゲーム内戦報の再現型・詳細戦報モーダル。代表試行1件分の全ログを表示する。 */
export function BattleReportModal({ report, opponentLabel, allyLabel, onClose }: { report: BattleReport; opponentLabel: string; allyLabel: string; onClose: () => void }) {
  const [tab, setTab] = useState<number>(-1);
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const logs = useMemo(() => (tab === -1 ? report.logs : report.logs.filter(l => l.turn === tab)), [report, tab]);
  useEffect(() => { setActiveIdx(0); }, [tab, report]);
  const active = logs[Math.min(activeIdx, Math.max(0, logs.length - 1))];
  const win = report.outcome <= 1;
  const SideSummary = ({ title, total, remaining, dead, wounded, accent }: { title: string; total: number; remaining: number; dead: number; wounded: number; accent: string }) => (
    <div className="br-side">
      <p className={`text-xs font-semibold ${accent}`}>{title}</p>
      <dl className="br-side-grid">
        <div><dt>総兵数</dt><dd>{total.toLocaleString("en-US")}</dd></div>
        <div><dt>残存</dt><dd>{remaining.toLocaleString("en-US")}</dd></div>
        <div><dt><Skull className="inline size-3" /> 戦死</dt><dd>{dead.toLocaleString("en-US")}</dd></div>
        <div><dt><HeartPulse className="inline size-3" /> 傷兵（回復）</dt><dd>{wounded.toLocaleString("en-US")}</dd></div>
      </dl>
    </div>
  );
  return (
    <div className="br-overlay" role="dialog" aria-modal="true" aria-label="詳細戦報" onClick={onClose}>
      <div className="br-modal panel" onClick={e => e.stopPropagation()}>
        <header className="br-header">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Swords className="size-4 text-gold" />詳細戦報 <span className={`br-outcome ${win ? "br-outcome-win" : report.outcome === 2 ? "br-outcome-draw" : "br-outcome-loss"}`}>{report.outcomeLabel}</span></h3>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{allyLabel}　vs　{opponentLabel}（平均に最も近い代表試行）</p>
          </div>
          <button type="button" className="br-close" aria-label="詳細戦報を閉じる" onClick={onClose}><X className="size-4" /></button>
        </header>

        <div className="br-sides">
          <SideSummary title="自軍" total={report.allyTotal} remaining={report.allyRemaining} dead={report.allyDead} wounded={report.allyWounded} accent="text-primary" />
          <SideSummary title="敵軍" total={report.enemyTotal} remaining={report.enemyRemaining} dead={report.enemyDead} wounded={report.enemyWounded} accent="text-loss" />
        </div>

        <nav className="br-tabs" aria-label="ターン切り替え">
          {TABS.map(t => <button key={t} type="button" className="br-tab" data-active={tab === t} onClick={() => setTab(t)}>{tabLabel(t)}</button>)}
        </nav>

        <div className="br-logs" aria-live="polite">
          {logs.length === 0 && <p className="p-4 text-xs text-muted-foreground">このターンのログはありません。</p>}
          {logs.map((l, i) => (
            <button key={i} type="button" className="br-log" data-active={i === activeIdx} onClick={() => setActiveIdx(i)}>
              <span className="br-badge">{l.tacticName ? `${l.tacticGrade ?? "S"} ${l.tacticName}` : l.kind}</span>
              <span className={`br-avatar ${l.actorSide === "自軍" ? "br-avatar-ally" : "br-avatar-enemy"}`} aria-hidden="true">{l.actor.slice(0, 1)}</span>
              <span className="br-log-main">
                <span className="br-log-meta">
                  <strong>{l.actor}</strong>
                  <span>兵力{l.actorTroops.toLocaleString("en-US")}</span>
                  <span>撃破{l.kills.toLocaleString("en-US")}</span>
                  <span>救援{l.healedByActor.toLocaleString("en-US")}</span>
                  <span>速度{l.actorSpeed}</span>
                </span>
                <span className="br-log-text">{l.segments.map((s, k) => <span key={k} className={TONE_CLASS[s.tone]}>{s.text}</span>)}</span>
                {l.effects.length > 0 && <span className="br-effects">{l.effects.map(e => <span key={e} className="br-effect">{e}</span>)}</span>}
              </span>
            </button>
          ))}
        </div>

        <footer className="br-order" aria-label="武将行動順">
          <span className="text-[10px] text-muted-foreground">行動順</span>
          {report.order.map((u, i) => {
            const isActive = active && active.actor === u.name && active.actorSide === u.side;
            return <span key={`${u.side}-${u.name}`} className="br-order-item" data-active={!!isActive} title={`${u.name}（${u.side}・速度${u.speed}）`}>
              <span className={`br-avatar ${u.side === "自軍" ? "br-avatar-ally" : "br-avatar-enemy"}`}>{u.name.slice(0, 1)}</span>
              <span className="br-order-name">{i + 1}. {u.name}</span>
              {isActive && <span className="br-order-arrow" aria-hidden="true">▼</span>}
            </span>;
          })}
        </footer>
      </div>
    </div>
  );
}
