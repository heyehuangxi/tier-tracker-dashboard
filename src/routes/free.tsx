import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/tier/app-shell";
import { FormationEditor } from "@/components/tier/formation-editor";

export const Route = createFileRoute("/free")({
  head: () => ({ meta: [
    { title: "自由編成 | 真戦研究所" },
    { name: "description", content: "全武将・全戦法から自由に最大10部隊を編成します。" },
    { property: "og:title", content: "自由編成 | 真戦研究所" },
    { property: "og:description", content: "未所持を含む全武将・戦法で自由に編成。" },
  ] }),
  component: () => <AppShell title="自由編成" description="未所持を含むすべての武将・戦法で、自由に部隊を組みます。"><FormationEditor mode="free" /></AppShell>,
});
