# Tier Tracker Dashboard

添付したスクリーンショットのデザインとレイアウトを忠実に再現したWebアプリケーションを作成してください。

【構成要素とUI仕様】

1. サイドナビゲーション（左側）:

   - ダーク〜ライトグレーのモダンなサイドバー

   - ブランドロゴ「真戦研究所 SRI-v1.0」を上部に配置

   - 「主要機能」グループ（共存編成、自由編成、所持管理、保存した編成、共有）

   - 「シミュレーター機能」グループ（Tier測定、Tier測定light、模擬対戦、AI編成）※「NEW」のバッジ付き

   - 「データベース」グループ（武将データベース、属性値ランキング、特性一覧、戦法一覧）

   - アイコンとテキストを綺麗に整列させ、アクティブな項目（例：Tier測定）はハイライト表示にしてください。

2. メインコンテンツエリア（右側）:

   - ヘッダー部分にタイトル「| Tier測定」とシミュレーション実行ボタン「Tier0・0.5 各300回シミュレーション」を配置

   - 「総合評価」カード: 「T0.5」などのTierランクとスコア（7.90）を大きく表示し、勝敗点・出力・爆発・多穿・回復・制御・破壊力・安定性・兵力交換比の各種ステータスをカラフルなプログレスバー（横棒グラフ）で表示してください。

   - 「対戦結果」カード: 勝率（勝ち、優勢、引分、劣勢、負け）の割合を示すマルチカラーの1段スタックバーを表示してください。

3. 全体的なデザイン・インタラクション:

   - Tailwind CSSを用いた、清潔感のあるライトモードのダッシュボードUI

   - レスポンシブ対応（画面サイズに応じてレイアウトが崩れないように）

   - ダミーデータで動作するインタラクティブなUIコンポーネント（ボタンやメニューのホバーエフェクト）を実装してください。

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fd6226b9-b8ec-4488-b9c9-c9f09319f39d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
