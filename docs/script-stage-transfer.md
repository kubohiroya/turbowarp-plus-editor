# スクリプトとステージの転送

実装は独立リポジトリの [`@kubohiroya/turbowarp-script-transfer`](https://github.com/kubohiroya/turbowarp-script-transfer) に置きます。ファイル形式・衝突解決・制限・APIの仕様は同リポジトリのREADMEを正本にします。Editorはnpmの完全一致版を入れ、`site/source.json` に版・integrity・公開元のコミットを記録します。GUIフォークへは実装パッケージの依存を追加しません。

## 起動と操作

常に有効です。起動URLの設定は不要で、無効にするフラグもありません。`site/plus-integration.ts` が転送用の口を常にGUIへ渡します。

- ブロックの右クリック: 「かたまりをファイルに保存…」「かたまりごとコピー」。右クリックしたブロックを含む、つながったブロック全体を扱います。メニューは編集・コメント、切り取り、コピー、ファイルに保存、整列、ほかの項目、削除の順に並び、グループの間に仕切りが入ります。
- ワークスペースの右クリック: 「ファイルから読み込み…」「貼り付け」。Ctrl/Cmd+C・Vでもコピー・貼り付けできます。
- ステージの右クリック: 「ステージを書き出し」。
- 背景の「選ぶ」メニュー: 「ステージを読み込み（追加）」。

`.blocks3` は依存するブロック定義・変数・リスト・メッセージ・拡張URL/コードを含むJSONです。`.stage3` は `sprite.json` と背景・音アセットのZIPです。ステージの読み込みは追加方式で、既存内容とステージの設定を維持します。

同名の変数・リストは同じスコープ・種類の既存データを使い、読み込み先の値を保持します。新規データには新しいIDを付けます。ブロック定義や背景・音の名前が競合するときは読み込む側を改名し、対応する呼び出しやメニュー選択も更新します。計算式から生成する背景・音名や番号は自動変換しません。

同じオリジンではBroadcastChannelとlocalStorageを使い、OSクリップボードへの許可がなくても使えます。対応ブラウザではOSクリップボードへJSONのcustom MIMEとscratchblocksのテキストを載せます。別オリジンからの読み取りにはブラウザのcustom MIME対応と読み取り許可が必要です。最後のコピーはサイトのlocalStorageにも残ります。

拡張機能はVMの既存セキュリティ確認を通し、転送元での承認は引き継ぎません。Plusの埋め込み拡張はdata URLとして転送し、取り込んだ後は通常のVMの拡張URLとして保存します。

## 差し込み口

`PlusIntegration.scriptTransfer` の各メソッドは任意です。

- `attach(context)` はVM・ScratchBlocks・workspace・document・locale・`canUse`・`onError`を受け取り、`dispose()` を返します。GUIはワークスペースのマウント・アンマウントに合わせて呼びます。
- `stageMenu(context)` はVM・document・locale・JSZip・VMの `deserializeBlocks` を受け取り、ステージの `contextItems` と背景メニューの `backdropItems` を返します。
- `finalizeMenu(items)` はアドオンがメニューを追加した後に呼び、ホストの貼り付けと同名のウィンドウ内貼り付け項目の重複を解消します。

GUI内部の値を実装パッケージからimportせず、すべて引数で渡します。口がなければ既存のワークスペース・メニュー・クリップボードを保ちます。

## 検証

転送の機能テスト12件は [script-transfer PR #6](https://github.com/kubohiroya/turbowarp-script-transfer/pull/6) の `test/format.test.mjs` と `test/stage.test.mjs` へ移管します。パッケージの `npm test` が、Editor と同じリビジョンに固定した VM で検証します。移管先の CI 成功とマージを確認してから Editor 側の重複テストと `test:script-transfer` の CI 項目を削除します。テストだけの移管なので、製品パッケージの版の更新と npm 公開は不要です。

Editor には `test/plus-integration.test.ts` の転送接続確認と `test/gui-integration/unit/plus/transfer.test.ts` を残します。前者は通常の `npm test`、後者は `npm run test:gui-integration` で、GUI に渡す接続口とその破棄を確認します。

統合E2Eは `script-transfer.spec.cts` です。クエリなしの通常起動でのメニュー表示、`.blocks3`の往復、2ウィンドウのメニュー/キーボード操作、権限拒否時のフォールバック、OSのJSONとテキスト、別オリジンからの読み取り、`.stage3`の背景・音・スクリプトを実ブラウザで検証します。

## 切り戻し

URLフラグによる無効化はありません。口を渡さないGUIは元のメニューとクリップボードへ戻ります。読み込み済みの内容は通常のSB3として保存できます。
