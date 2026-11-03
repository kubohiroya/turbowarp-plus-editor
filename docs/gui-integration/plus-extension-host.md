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
