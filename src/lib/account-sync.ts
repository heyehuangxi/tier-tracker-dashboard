import { KEYS } from "./use-local";

/**
 * アカウント同期の対象キー一覧。
 *
 * アプリが localStorage に保存するユーザー所有データはすべて useLocal /
 * writeLocal 経由で以下のキーに書かれる（キー名は既存データを守るため変更禁止）。
 * - 所持武将・所持戦法（holdings）
 * - 自由編成・共存編成の下書き（draft は FormationEditor の mode 2 種のみ）
 * - 保存した編成 / 共有から取り込んだ編成
 * - テンプレート部隊の凸数設定（tier-page が使うリテラルキー）
 */
export const TRACKED_KEYS: readonly string[] = [
  KEYS.ownedGenerals,
  KEYS.ownedTactics,
  KEYS.draft("free"),
  KEYS.draft("coexist"),
  KEYS.saved,
  KEYS.shared,
  "sri-template-ranks",
];

/** クラウドに保存するペイロード: キー名 -> localStorage の保存文字列そのもの */
export type SyncPayload = Record<string, string>;

/** localStorage 互換の最小インターフェース（テストで差し替え可能にする） */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** 現在のストレージ内容から、追跡キーの分だけをペイロードに集める */
export function buildPayload(storage: StorageLike): SyncPayload {
  const payload: SyncPayload = {};
  for (const key of TRACKED_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) payload[key] = value;
  }
  return payload;
}

/**
 * クラウドから受け取った data（jsonb）を検証して SyncPayload にする。
 * 追跡キー以外・文字列でない値はすべて捨てる。
 */
export function sanitizePayload(input: unknown): SyncPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const payload: SyncPayload = {};
  for (const key of TRACKED_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string") payload[key] = value;
  }
  return payload;
}

/**
 * ログイン時のマージ: クラウドにあるキーはクラウドの値を優先し、
 * ローカルにしかないキーは保持する。別ブラウザで初めてログインしたときに、
 * そのブラウザにしかないデータ（所持・保存編成など）がクラウド優先の
 * 反映で消えてしまわないようにするための要。
 */
export function mergePayloads(local: SyncPayload, cloud: SyncPayload): SyncPayload {
  return { ...local, ...cloud };
}

/** ペイロード同士が同じ内容かどうか */
export function payloadsEqual(a: SyncPayload, b: SyncPayload): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/**
 * クラウドのペイロードをストレージへ反映する（クラウド優先）。
 * ペイロードにある追跡キーは上書きし、ない追跡キーは削除する。
 * 追跡キー以外には一切触れない。実際に変わったキーの一覧を返す。
 */
export function applyPayload(storage: StorageLike, payload: SyncPayload): string[] {
  const changed: string[] = [];
  for (const key of TRACKED_KEYS) {
    const next = payload[key];
    const current = storage.getItem(key);
    if (next === undefined) {
      if (current !== null) {
        storage.removeItem(key);
        changed.push(key);
      }
    } else if (current !== next) {
      storage.setItem(key, next);
      changed.push(key);
    }
  }
  return changed;
}
