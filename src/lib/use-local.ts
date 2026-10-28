import { useCallback, useEffect, useRef, useState } from "react";

const EVT = "sri-local-change";

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function writeLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
}

/** ブラウザ保存の値を読み書きする（SSR安全：マウント後に読み込み） */
export function useLocal<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setValue(readLocal(key, fallback)); setReady(true);
    const on = (e: Event) => { if ((e as CustomEvent).detail === key) setValue(readLocal(key, fallback)); };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((v: T) => { setValue(v); writeLocal(key, v); }, [key]);
  return [value, set, ready] as const;
}

/**
 * 所持リスト用フック。キーがまだ保存されていない初回だけ、全所持（allIds）を初期値として保存する。
 * 既に保存済みの値（空リストを含む）には一切触れない。
 */
export function useOwnedList(key: string, allIds: string[]) {
  const [value, set, ready] = useLocal<string[]>(key, []);
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    if (localStorage.getItem(key) === null) set(allIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return [value, set, ready] as const;
}

export const KEYS = {
  ownedGenerals: "sri-owned-generals",
  ownedTactics: "sri-owned-tactics",
  draft: (m: string) => `sri-draft-${m}`,
  saved: "sri-saved-formations",
  shared: "sri-shared-formations",
};
