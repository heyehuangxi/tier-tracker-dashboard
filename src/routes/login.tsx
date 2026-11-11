import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { AppShell } from "@/components/tier/app-shell";
import { EmailPrivacyNote } from "@/components/tier/email-privacy-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { authErrorMessage, useAccount } from "@/lib/account";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "ログイン | 真戦勝率測定" },
    { name: "description", content: "真戦勝率測定のアカウントにログインします。所持・編成データがアカウントに保存され、他の端末からも利用できます。" },
    { property: "og:title", content: "ログイン | 真戦勝率測定" },
    { property: "og:description", content: "アカウントにログインして、所持・編成データを同期します。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AppShell title="ログイン" description="ログインすると、所持・編成データがアカウントに保存され、他の端末からも同じデータを利用できます。"><Login /></AppShell>,
});

function Login() {
  const navigate = useNavigate();
  const { user, ready, signOut } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(authErrorMessage(signInError.message));
      return;
    }
    navigate({ to: "/" });
  }

  if (!isSupabaseConfigured) {
    return <section className="panel mx-auto max-w-md p-5">
      <p className="text-[13px] leading-relaxed">現在、ログイン機能は利用できません。所持・編成データはこれまでどおりお使いのブラウザ内に保存されます。</p>
    </section>;
  }

  if (ready && user) {
    return <section className="panel mx-auto max-w-md space-y-4 p-5">
      <p className="text-[13px] leading-relaxed"><span className="font-medium">{user.email}</span> でログインしています。データはこのアカウントに自動で保存されます。</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild><Link to="/">トップへ</Link></Button>
        <Button variant="outline" onClick={() => void signOut()}>ログアウト</Button>
      </div>
    </section>;
  }

  return <section className="panel mx-auto max-w-md p-5">
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">メールアドレス</Label>
        <Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">パスワード</Label>
        <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] leading-relaxed text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "ログイン中…" : "ログイン"}</Button>
    </form>
    <p className="mt-4 text-center text-[12px] text-muted-foreground">
      アカウントをお持ちでない方は <Link to="/register" className="text-primary underline underline-offset-4">新規登録</Link>
    </p>
    <EmailPrivacyNote />
  </section>;
}
