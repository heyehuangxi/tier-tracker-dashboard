import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lovable の Supabase 連携がビルド時に注入する環境変数を読む。
// プロジェクト名などは連携側で管理され、リポジトリには保存されない。
// 新旧どちらの変数名でも動くよう、公開キー（publishable / anon）の両方に対応する。
const env = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL = env["VITE_SUPABASE_URL"];
const SUPABASE_KEY = env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];

/** Supabase の接続情報が揃っているか（揃っていない環境ではログイン機能を無効化する） */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * ブラウザ専用クライアント。SSR 中や未設定の環境では null を返し、
 * 呼び出し側は null の間「ログアウト状態・同期なし」として振る舞う。
 */
export const supabase: SupabaseClient | null =
  typeof window !== "undefined" && SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;
