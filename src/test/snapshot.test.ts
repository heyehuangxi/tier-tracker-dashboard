import { describe, expect, it } from "vitest";
import { parseSnapshotId, resolveSnapshot, type GameCfg, type GameSnapshot } from "@/lib/snapshot";

const cfg: GameCfg = {
  hero: [
    { id: 10001, name: "织田信长", icon: "res/card/hero/zhitianxinchang.png" },
    { id: 19001, name: "鬼庭左月斋", icon: "res/card/hero/guitingzuoyuezhai.png" },
    { id: 19002, name: "瑞溪院", icon: "res/card/hero/ruixiyuan.png" },
  ],
  skill: [
    { id: 21001, name: "回天转运" },
    { id: 21002, name: "萨摩铁炮队" },
    { id: 21003, name: "百战炼磨" },
    { id: 21004, name: "存在しない戦法" },
  ],
  multi_lang: [
    { id: "织田信长", ja: "織田信長" },
    { id: "鬼庭左月斋", ja: "鬼庭左月斎" },
    { id: "瑞溪院", ja: "瑞渓院" },
    { id: "回天转运", ja: "回天転運" },
    { id: "萨摩铁炮队", ja: "薩摩鉄砲兵" },
  ],
};

const snap: GameSnapshot = {
  data: [
    { player_data: { hero_count: 3, skill_count: 4 } },
    { player_data: { heros: [{ id: "10001" }, { id: "19001" }, { id: "19002" }] } },
    { player_data: { skills: [{ id: "21001" }, { id: "21002" }, { id: "21003" }, { id: "21004" }] } },
  ],
};

describe("Game share snapshot import", () => {
  it("parses snapshot ids from pasted links", () => {
    expect(parseSnapshotId("https://general.qookkagames.com/xzdyw-station-qookka#/handbook?snapshot_id=6ae204d48d89b4d8a3dcf2b0")).toBe("6ae204d48d89b4d8a3dcf2b0");
    expect(parseSnapshotId("6ae204d48d89b4d8a3dcf2b0")).toBe("6ae204d48d89b4d8a3dcf2b0");
    expect(parseSnapshotId("https://example.com/")).toBeNull();
    expect(parseSnapshotId("")).toBeNull();
  });
  it("resolves game ids to site ids, reporting unresolved names", () => {
    const r = resolveSnapshot(cfg, snap);
    expect(r.generals).toEqual(["g-織田信長", "g-鬼庭左月斎", "g-瑞溪院"]);
    expect(r.tactics).toEqual(["t-回天転運", "t-薩摩鉄砲隊", "t-百戦錬磨"]);
    expect(r.unresolvedGenerals).toEqual([]);
    expect(r.unresolvedTactics).toEqual(["存在しない戦法"]);
    expect(r.heroCount).toBe(3);
    expect(r.skillCount).toBe(4);
  });
});
