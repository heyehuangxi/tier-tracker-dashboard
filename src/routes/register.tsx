import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { AppShell } from "@/components/tier/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { authErrorMessage, useAccount } from "@/lib/account";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [
    { title: "新規登録 | 真戦勝率測定" },
    { name: "description", content: "真戦勝率測定のアカウントを登録します。所持・編成データがアカウントに保存され、他の端末からも利用できます。" },
    { property: "og:title", content: "新規登録 | 真戦勝率測定" },
    { property: "og:description", content: "アカウントを登録して、所持・編成データを同期します。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="新規登録" description="アカウントを登録すると、所持・編成データがアカウントに保存され、他の端末からも同じデータを利用できます。"><Register /></AppShell>,
});

function Register() {
  const navigate = useNavigate();
  const { user, ready } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (signUpError) {
      setError(authErrorMessage(signUpError.message));
      return;
    }
    if (data.session) {
      navigate({ to: "/" });
    } else {
      // メール確認が有効なため、セッションは確認リンクを開くまで発行されない
      setSent(true);
    }
  }

  if (!isSupabaseConfigured) {
    return <section className="panel mx-auto max-w-md p-5">
      <p className="text-[13px] leading-relaxed">現在、登録機能は利用できません。所持・編成データはこれまでどおりお使いのブラウザ内に保存されます。</p>
    </section>;
  }

  if (ready && user) {
    return <section className="panel mx-auto max-w-md space-y-4 p-5">
      <p className="text-[13px] leading-relaxed"><span className="font-medium">{user.email}</span> でログインしています。新たに登録する必要はありません。</p>
      <Button asChild><Link to="/">トップへ</Link></Button>
    </section>;
  }

  if (sent) {
    return <section className="panel mx-auto max-w-md space-y-3 p-5">
      <h2 className="font-display text-[17px] font-bold">確認メールを送信しました</h2>
      <p className="text-[13px] leading-relaxed">
        <span className="font-medium">{email}</span> 宛に確認メールを送信しました。メール内のリンクを開くと登録が完了します。その後、ログインするとこのブラウザのデータがアカウントへ引き継がれます。
      </p>
      <Button asChild variant="outline"><Link to="/login">ログインへ</Link></Button>
    </section>;
  }

  return <section className="panel mx-auto max-w-md p-5">
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="register-email">メールアドレス</Label>
        <Input id="register-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="register-password">パスワード</Label>
        <Input id="register-password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">6文字以上で入力してください。登録後、確認メールが届きます。</p>
      </div>
      {error && <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "登録中…" : "登録する"}</Button>
    </form>
    <p className="mt-4 text-center text-[12px] text-muted-foreground">
      既にアカウントをお持ちの方は <Link to="/login" className="text-primary underline underline-offset-4">ログイン</Link>
    </p>
  </section>;
}
