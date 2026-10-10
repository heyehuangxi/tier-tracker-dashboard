import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tier/app-shell";
import { FormationEditor } from "@/components/tier/formation-editor";

export const Route = createFileRoute("/coexist")({
  head: () => ({ meta: [
    { title: "共存編成 | ぴえんで候" },
    { name: "description", content: "所持武将・戦法だけで最大10部隊を重複なしで編成します。" },
    { property: "og:title", content: "共存編成 | ぴえんで候" },
    { property: "og:description", content: "所持武将・戦法で重複なしの最大10部隊を編成。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <AppShell title="共存編成" description="所持している武将・戦法で、重複なしの部隊を組みます。"><FormationEditor mode="coexist" /></AppShell>,
});
