import { createFileRoute } from "@tanstack/react-router";
import { WinRatePage } from "@/components/tier/tier-page";

export const Route = createFileRoute("/tier-light")({
  head: () => ({ meta: [
    { title: "勝率測定light | ぴえんで候" },
    { name: "description", content: "各対戦50回の軽量シミュレーションで、編成の勝率と対戦結果をすばやく確認できます。" },
    { property: "og:title", content: "勝率測定light | ぴえんで候" },
    { property: "og:description", content: "軽量版勝率測定。各対戦50回で手早く評価。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <WinRatePage title="勝率測定light" perMatch={50} />,
});
