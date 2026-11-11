import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { LOCAL_CHANGE_EVENT } from "./use-local";
import {
  TRACKED_KEYS,
  applyPayload,
  buildPayload,
  mergePayloads,
  payloadsEqual,
  sanitizePayload,
} from "./account-sync";

type AccountState = {
  user: User | null;
  /** 初回のセッション確認が終わったか（false の間は表示を確定させない） */
  ready: boolean;
  signOut: () => Promise<void>;
};

const AccountCtx = createContext<AccountState>({
  user: null,
  ready: false,
  signOut: async () => {},
});

export const useAccount = () => useContext(AccountCtx);

/** Supabase の認証エラーを利用者向けの日本語にする */
export function authErrorMessage(message: string): string {
  if (message.includes("Invalid login credentials")) return "メールアドレスまたはパスワードが正しくありません。";
  if (message.includes("Email not confirmed")) return "メールアドレスがまだ確認できていません。確認メールのリンクを開いてからログインしてください。";
  if (message.includes("User already registered")) return "このメールアドレスは既に登録されています。ログインしてください。";
  if (message.includes("Password should be at least")) return "パスワードは6文字以上で入力してください。";
  if (message.includes("invalid format") || message.includes("Invalid email")) return "メールアドレスの形式が正しくありません。";
  if (message.includes("rate limit")) return "試行回数が多すぎます。しばらく時間をおいてから再度お試しください。";
  return "処理に失敗しました。時間をおいて再度お試しください。";
}

/**
 * ログイン状態の管理と、localStorage とクラウドの同期を担う。
 *
 * - 未ログイン時は何もしない（従来どおりブラウザ内保存のみ）。
 * - ログイン時: クラウドの保存と現在のローカルデータをマージする
 *   （同じキーはクラウド優先、ローカルにしかないキーは保持してクラウドへ取り込む）。
 *   保存がなければ、現在のローカルデータを初回移行としてアップロードする。
 * - ログイン中: 追跡キーが変わるたびに、少し待ってからまとめてアップロードする。
 * - Supabase 未設定の環境（環境変数なし）では全体が無効化され、従来動作になる。
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const signOutRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    const client = supabase;
    let cancelled = false;
    let currentUid: string | null = null;
    let lastSent: string | null = null; // 直近にクラウドと一致したペイロードの JSON
    let timer: number | null = null;

    const uploadNow = async () => {
      const uid = currentUid;
      if (!uid) return;
      const payload = buildPayload(window.localStorage);
      const json = JSON.stringify(payload);
      if (json === lastSent) return;
      const { error } = await client
        .from("user_data")
        .upsert({ user_id: uid, data: payload }, { onConflict: "user_id" });
      if (!error) lastSent = json;
      else console.warn("アカウント同期のアップロードに失敗しました", error.message);
    };

    const scheduleUpload = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void uploadNow();
      }, 800);
    };

    const initialSync = async (uid: string) => {
      const { data, error } = await client
        .from("user_data")
        .select("data")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled || currentUid !== uid) return;
      if (error) {
        // 取得できなくてもアプリは止めない。以後の変更は通常どおりアップロードされる。
        console.warn("アカウント同期の取得に失敗しました", error.message);
        return;
      }
      if (data) {
        const cloud = sanitizePayload(data.data);
        const merged = mergePayloads(buildPayload(window.localStorage), cloud);
        const changed = applyPayload(window.localStorage, merged);
        for (const key of changed) {
          window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: key }));
        }
        if (payloadsEqual(merged, cloud)) {
          lastSent = JSON.stringify(merged);
        } else {
          // ローカルにしかなかったキーをクラウドへ取り込む
          const { error: upError } = await client
            .from("user_data")
            .upsert({ user_id: uid, data: merged }, { onConflict: "user_id" });
          if (cancelled || currentUid !== uid) return;
          if (!upError) lastSent = JSON.stringify(merged);
          else {
            console.warn("アカウント同期のマージ保存に失敗しました", upError.message);
            lastSent = JSON.stringify(cloud); // 次の変更時に merged が再送される
          }
        }
      } else {
        // 初回ログイン: 今このブラウザにあるデータをそのままアカウントへ移す
        const payload = buildPayload(window.localStorage);
        const { error: upError } = await client
          .from("user_data")
          .upsert({ user_id: uid, data: payload }, { onConflict: "user_id" });
        if (!upError) lastSent = JSON.stringify(payload);
        else console.warn("アカウント同期の初回移行に失敗しました", upError.message);
      }
    };

    const handleSession = (session: Session | null) => {
      if (cancelled) return;
      const uid = session?.user.id ?? null;
      setUser(session?.user ?? null);
      setReady(true);
      if (uid !== currentUid) {
        currentUid = uid;
        lastSent = null;
        if (uid) void initialSync(uid);
      }
    };

    void client.auth.getSession().then(({ data }) => handleSession(data.session));
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    const onLocalChange = (e: Event) => {
      const key = (e as CustomEvent).detail;
      if (typeof key === "string" && TRACKED_KEYS.includes(key)) scheduleUpload();
    };
    window.addEventListener(LOCAL_CHANGE_EVENT, onLocalChange);

    const onPageHide = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
        void uploadNow();
      }
    };
    window.addEventListener("pagehide", onPageHide);

    signOutRef.current = async () => {
      await client.auth.signOut();
    };

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
      window.removeEventListener(LOCAL_CHANGE_EVENT, onLocalChange);
      window.removeEventListener("pagehide", onPageHide);
      if (timer !== null) window.clearTimeout(timer);
      signOutRef.current = async () => {};
    };
  }, []);

  return (
    <AccountCtx.Provider value={{ user, ready, signOut: () => signOutRef.current() }}>
      {children}
    </AccountCtx.Provider>
  );
}
