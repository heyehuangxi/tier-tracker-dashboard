import { createFileRoute } from "@tanstack/react-router";
import { TierPage } from "@/components/tier/tier-page";

export const Route = createFileRoute("/tier-light")({
  head: () => ({ meta: [
    { title: "Tier測定light | ぴえんで候" },
    { name: "description", content: "各対戦50回の軽量シミュレーションで、編成の勝率と対戦結果をすばやく確認できます。" },
    { property: "og:title", content: "Tier測定light | ぴえんで候" },
    { property: "og:description", content: "軽量版Tier測定。各対戦50回で手早く評価。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <TierPage title="Tier測定light" perMatch={50} />,
});
