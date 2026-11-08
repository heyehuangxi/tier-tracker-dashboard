import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tier/app-shell";

export const Route = createFileRoute("/changelog")({
  head: () => ({ meta: [
    { title: "更新履歴 | 真戦勝率測定" },
    { name: "description", content: "真戦勝率測定の更新履歴です。日付ごとに変更点を掲載しています。" },
    { property: "og:title", content: "更新履歴 | 真戦勝率測定" },
    { property: "og:description", content: "日付ごとの変更点を掲載しています。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="更新履歴" description="日付ごとに変更点をまとめています。新しい順に並んでいます。"><Changelog /></AppShell>,
});

type Entry = { date: string; items: string[] };

/** 更新履歴（新しい順）。正確に確認できる変更のみを載せる。 */
const ENTRIES: Entry[] = [
  {
    date: "2026年11月8日",
    items: [
      "サイト名を「ぴえんで候」から「真戦勝率測定」に変更しました（一門のみなさんにも使ってもらうため）。",
      "サイトのアイコンを『信長の野望 真戦』のロゴに変更しました。",
      "更新履歴ページ（このページ）を追加しました。",
    ],
  },
  {
    date: "2026年11月7日",
    items: [
      "兵種レベルに対応しました。部隊の特性から兵種レベルを自動で算出し、詳細戦報に表示します。ステータス補正（全能力+2%／Lv）もシミュレーションに反映しています。",
      "兵舎Lvと開始兵力を、編成エディタで入力できるようにしました。実際の戦報の条件（相手の開始兵力が減っている場合など）に合わせて測定できます。",
      "戦法の再現度を改善しました。七十二の計（発動の数え方を仕様どおりに）、一揆（外れるたびの発動率の伸び方）、風林火山（旗の効果が2ターンとも発動）、鬼美濃（ダメージを受けたときの回復を再現）。",
      "実際の対戦戦報4件とシミュレーション結果を突き合わせて検証し、勝率のズレを補正しました。",
    ],
  },
  {
    date: "2026年10月31日",
    items: [
      "サイトをリニューアルしました。ツールの名称を「勝率測定」「勝率測定light」に変更し、デザインを和紙と墨と朱の明るいテーマに刷新しました。",
    ],
  },
];

function Changelog() {
  return <div className="space-y-5">
    {ENTRIES.map(e => (
      <section key={e.date} className="panel p-5">
        <h2 className="text-[17px]">{e.date}</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed">
          {e.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </section>
    ))}
  </div>;
}
