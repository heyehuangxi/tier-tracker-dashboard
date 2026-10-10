import { createFileRoute } from "@tanstack/react-router";
import { TierPage } from "@/components/tier/tier-page";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Tier測定 | ぴえんで候" },
    { name: "description", content: "テンプレート15部隊と保存した編成を相手に各500回・最大8ターンの戦闘を試算し、勝率と対戦結果を表示します。" },
    { property: "og:title", content: "Tier測定 | ぴえんで候" },
    { property: "og:description", content: "兵種相性を反映した勝率と対戦結果を確認。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <TierPage title="Tier測定" perMatch={500} />,
});
