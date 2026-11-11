import { describe, expect, it } from "vitest";

import {
  TRACKED_KEYS,
  applyPayload,
  buildPayload,
  mergePayloads,
  payloadsEqual,
  sanitizePayload,
  type StorageLike,
} from "@/lib/account-sync";
import { KEYS } from "@/lib/use-local";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
  return { map, storage };
}

describe("TRACKED_KEYS", () => {
  it("covers every app-owned storage key exactly once", () => {
    expect(new Set(TRACKED_KEYS).size).toBe(TRACKED_KEYS.length);
    expect(TRACKED_KEYS).toContain(KEYS.ownedGenerals);
    expect(TRACKED_KEYS).toContain(KEYS.ownedTactics);
    expect(TRACKED_KEYS).toContain(KEYS.draft("free"));
    expect(TRACKED_KEYS).toContain(KEYS.draft("coexist"));
    expect(TRACKED_KEYS).toContain(KEYS.saved);
    expect(TRACKED_KEYS).toContain(KEYS.shared);
    expect(TRACKED_KEYS).toContain("sri-template-ranks");
    expect(TRACKED_KEYS.length).toBe(7);
  });
});

describe("buildPayload", () => {
  it("collects raw stored strings for tracked keys only", () => {
    const { storage } = fakeStorage({
      [KEYS.ownedGenerals]: '["g-1","g-2"]',
      [KEYS.saved]: "[]",
      "sb-xxx-auth-token": "secret",
      unrelated: "x",
    });
    expect(buildPayload(storage)).toEqual({
      [KEYS.ownedGenerals]: '["g-1","g-2"]',
      [KEYS.saved]: "[]",
    });
  });

  it("returns an empty payload when nothing is stored", () => {
    const { storage } = fakeStorage();
    expect(buildPayload(storage)).toEqual({});
  });
});

describe("sanitizePayload", () => {
  it("keeps only tracked keys with string values", () => {
    expect(
      sanitizePayload({
        [KEYS.ownedTactics]: '["t-1"]',
        [KEYS.saved]: 42,
        "unknown-key": "value",
      }),
    ).toEqual({ [KEYS.ownedTactics]: '["t-1"]' });
  });

  it("returns {} for non-object input", () => {
    expect(sanitizePayload(null)).toEqual({});
    expect(sanitizePayload("nope")).toEqual({});
    expect(sanitizePayload([1, 2])).toEqual({});
    expect(sanitizePayload(undefined)).toEqual({});
  });
});

describe("applyPayload", () => {
  it("overwrites present keys, removes missing tracked keys, and leaves other keys alone", () => {
    const { map, storage } = fakeStorage({
      [KEYS.ownedGenerals]: '["old"]',
      [KEYS.draft("free")]: '["draft"]',
      "sb-xxx-auth-token": "secret",
    });
    const changed = applyPayload(storage, { [KEYS.ownedGenerals]: '["new"]' });
    expect(map.get(KEYS.ownedGenerals)).toBe('["new"]');
    expect(map.has(KEYS.draft("free"))).toBe(false);
    expect(map.get("sb-xxx-auth-token")).toBe("secret");
    expect(changed.sort()).toEqual([KEYS.draft("free"), KEYS.ownedGenerals].sort());
  });

  it("reports no changes when the payload already matches storage", () => {
    const { storage } = fakeStorage({ [KEYS.saved]: "[1]" });
    expect(applyPayload(storage, { [KEYS.saved]: "[1]" })).toEqual([]);
  });
});

describe("payloadsEqual", () => {
  it("compares by content regardless of key order", () => {
    expect(payloadsEqual({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(payloadsEqual({ a: "1" }, { a: "2" })).toBe(false);
    expect(payloadsEqual({ a: "1" }, { a: "1", b: "2" })).toBe(false);
    expect(payloadsEqual({}, {})).toBe(true);
  });
});

describe("mergePayloads", () => {
  it("keeps local-only keys and lets cloud win on shared keys", () => {
    const local = {
      [KEYS.ownedGenerals]: '["g-1"]',
      [KEYS.draft("free")]: '"local-draft"',
    };
    const cloud = { [KEYS.draft("free")]: '"cloud-draft"', [KEYS.saved]: "[1]" };
    expect(mergePayloads(local, cloud)).toEqual({
      [KEYS.ownedGenerals]: '["g-1"]',
      [KEYS.draft("free")]: '"cloud-draft"',
      [KEYS.saved]: "[1]",
    });
  });

  it("applying a merged payload never removes locally stored tracked keys", () => {
    const { map, storage } = fakeStorage({
      [KEYS.ownedGenerals]: '["g-1"]',
      [KEYS.saved]: "[1,2]",
    });
    const cloud = { [KEYS.draft("free")]: '"draft"' };
    const merged = mergePayloads(buildPayload(storage), cloud);
    applyPayload(storage, merged);
    expect(map.get(KEYS.ownedGenerals)).toBe('["g-1"]');
    expect(map.get(KEYS.saved)).toBe("[1,2]");
    expect(map.get(KEYS.draft("free"))).toBe('"draft"');
  });
});
