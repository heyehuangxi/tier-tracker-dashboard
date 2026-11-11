/** メールアドレス登録への不安を和らげる案内（登録・ログイン共通）。 */
export function EmailPrivacyNote() {
  return <div className="mt-5 space-y-2 rounded border bg-muted/40 px-3 py-3 text-left">
    <h3 className="text-[12px] font-semibold">メールアドレスについて</h3>
    <ul className="list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
      <li>メールアドレスは、ログインと、登録確認・パスワード再設定のためだけに使います。広告やお知らせのメールを送ることはありません。</li>
      <li>他の利用者に公開されることはなく、第三者に渡すこともありません。</li>
      <li>パスワードは暗号化（ハッシュ化）して保管するため、運営者でも元のパスワードを見ることはできません。</li>
      <li>保存されるデータは、ご本人の分しか読み書きできない設定になっています。</li>
      <li>確認メールを受け取れるアドレスであれば、普段お使いでないアドレスでも登録できます。</li>
      <li>登録は任意です。登録しなくても、これまでどおりすべての機能をお使いいただけます（データはお使いのブラウザ内に保存されます）。</li>
    </ul>
  </div>;
}
