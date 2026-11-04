# 拡張ホストとの接続

この契約の実装と検証は `turbowarp-plus-editor` が所有します。GUI側は本家に存在するファイル内の呼び出し箇所と、VM・Modal・Redux等の引き渡しだけを持ちます。

GUIは標準の権限フックを設定した後、作品を読み込む前に `installSecurityHost` を呼びます。
配信側は呼出元の権限ポリシーを尊重し、一括レビューを先に、作品ローダーを後に取り付けます。
破棄は逆順です。Loaderが無効な場合も、作品情報や診断の接続を破棄します。

GUIから渡すものは、VM、標準の権限ポリシー・信頼対象・拡張一覧、モーダルの枠と排他キュー、
作品状態のアクセサーです。配信側がレビューを描画し、GUIは作品の切替時に保留中の応答を取り消します。

Loaderの有効化条件、ZIP制約、キャッシュ、レビューUI、保存・配布方式は配信ホストが所有します。
現在の仕様・確認手順は[配信側の拡張Loader接続](https://github.com/kubohiroya/turbowarp-plus-editor/blob/main/docs/extension-loader-integration.md)を参照してください。
過去の導入記録は [Editor Issue #4](https://github.com/kubohiroya/turbowarp-plus-editor/issues/4) と本ファイルのGit履歴に残ります。

## 拡張一覧の操作と共通画面の固定

Plus一覧のチェックボックスは左端に置き、その右にアイコンと拡張名を表示します。
サンドボックスなしの注意は閉じられるスナックバーで表示し、一覧の項目位置を動かしません。
「キャンセル」「追加」はダイアログ下部に常時表示し、一覧側だけをスクロールします。
注意はボタンの上に重ね、ボタンを覆いません。

認証アイコンは登録された紹介ページ、バージョン表記は該当版のリリースノートへリンクします。
概要は改行を保持し、HTTP(S)・mailto・メールアドレスをリンク表示します。製作者の右横には
登録済みの連絡先を表示します。リンクを開いても選択や実行許可は変更しません。

共通画面はnpm版 `0.8.5` を完全一致で固定します。package.jsonと `site/source.json` の
`securityVersion` を一致させ、lockfileにはnpmアーカイブのURLとintegrityを記録します。
Git指定用の `securityRevision` は設定しません。通常の `npm ci` でビルド済み配布物を取得します。
公開・取り込み時には、npmとGitHub Releaseのアーカイブhash一致と、配布物の
`build-info.json` がversion `0.8.5`・revision `cba70ed1df196300cfb155da4397a50a920dd786`・
`sourceState: "commit"` であることを照合しています。

切り戻す場合は、直前のGit固定へ戻します。依存を
`github:kubohiroya/turbowarp-extension-security-dialog#67dbe996d92c8dbb3d954c2c4253cdd82eedb888`
とし、`securityVersion` を `0.8.4`、`securityRevision` を同じ完全SHAに戻して、lockfileも対応させます。
Gitアーカイブのビルドでは既存CIが `TWEXTSEC_SOURCE_REVISION` を渡します。
実行許可・拡張の保存形式・他の依存は変更しません。公開済みのnpm版は削除・上書きしません。
関連: [Editor #139](https://github.com/kubohiroya/turbowarp-plus-editor/issues/139)、
共通画面 [#68](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/68)・
[#70](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/70)・
[#72](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/72)。
