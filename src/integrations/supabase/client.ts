import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 接続情報は、Lovable の Supabase 連携がビルド時に注入する環境変数を優先し、
// 無い場合は下記の公開値をフォールバックとして使う。
// （2026-11-11: Lovable で Publish した公開ビルドに環境変数が注入されておらず、
//   登録・ログインが「利用できません」表示になったため、フォールバックを設けた。）
// フォールバックの URL とキーは publishable（公開）キーであり、ブラウザ向けに
// 配布される前提の値。データ保護は user_data テーブルの RLS が担う。
// secret / service_role キーは絶対にここへ書かないこと。
const env = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL = env["VITE_SUPABASE_URL"] ?? "https://afxwhnhxpbkbblujlfad.supabase.co";
const SUPABASE_KEY = env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"] ?? "sb_publishable_z9X1M8Fmret9_hrQIjnxjA_GNn7gpj2";

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
