# 拡張ホストとの接続

この契約の実装と検証は `turbowarp-plus-editor` が所有します。GUI側は本家に存在するファイル内の呼び出し箇所と、VM・Modal・Redux等の引き渡しだけを持ちます。

GUIは標準の権限フックを設定した後、作品を読み込む前に `startupPlusExtensionHost(vm)` を呼びます。
配信ホストが `installExtensionHost` を提供しない場合、追加のローダーは設置しません。

GUIから渡すものは、起動時に取得したquery、GUI自身が使用するVM共有モジュール、信頼カタログ、
ロード失敗をGUIのエラー経路へ通知する関数、呼出元の権限ポリシーです。
GUIはアンマウント時に返されたホストを破棄し、レビューのモーダル排他と作品状態への接続を保持します。

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

共通画面は `site/source.json` の `securityRevision` と、package.json・lockfileの完全SHAを
一致させて固定します。バージョン番号だけでなく、インストール後の `build-info.json` のrevisionと
出所も検証します。Gitアーカイブのビルドでは既存CIが `TWEXTSEC_SOURCE_REVISION` を渡します。

切り戻す場合は、共通画面の依存をnpm版 `0.8.4` に戻し、`securityRevision` を削除してlockfileを
対応するnpmアーカイブへ戻します。実行許可・拡張の保存形式・他の依存は変更しません。
関連: [Editor #139](https://github.com/kubohiroya/turbowarp-plus-editor/issues/139)、
共通画面 [#68](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/68)・
[#70](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/70)・
[#72](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/72)。
