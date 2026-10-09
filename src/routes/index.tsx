import { createFileRoute } from "@tanstack/react-router";
import { TierPage } from "@/components/tier/tier-page";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Tier測定 | 真戦研究所 SRI-v1.0" },
    { name: "description", content: "テンプレート16部隊と保存した編成を相手に各500回・最大8ターンの戦闘を試算し、Tierと対戦結果を表示します。" },
    { property: "og:title", content: "Tier測定 | 真戦研究所" },
    { property: "og:description", content: "編成のTierランクと戦闘シミュレーション結果を一覧で確認。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <TierPage title="Tier測定" perMatch={500} />,
});
