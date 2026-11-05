# #151 段階3の初回製品接続

Editor の `feat/backpack/product-integration` と、`site/source.json` が参照する scratch-gui のローカルブランチ `feat/gui/backpack-slots` を使用する。Web 版を `?twPlusWindowLayout=1&twPlusBackpackPopout=1` で起動し、⚓ を押すと、ローカルバックパックに別ウィンドウで開く操作が出る。バックパック用フラグは既定 OFF。フラグを指定せずに splitter だけを使える。

| 所有先 | 責務 |
| --- | --- |
| `@kubohiroya/turbowarp-editor-surfaces` | 表示先の遷移、準備完了、切断、復帰 |
| `@kubohiroya/turbowarp-editor-transfer` | 一時参照、読込の取消、適用先の確定、一度だけの適用 |
| `@kubohiroya/turbowarp-editor-backpack` | 既存バックパックの表示移動、操作ラベル、スクリプトの読込とコード画面へのドロップ。上の2パッケージと既存の `turbowarp-script-transfer` を利用する |
| Editor | 依存の固定、起動フラグと ⚓ への接続、ブラウザー用表示先と既存スクリプト適用処理を渡す |
| scratch-gui | 任意の表示ラッパーとスクリプトのドラッグハンドルを受け取る。ストレージ、項目の操作、展開状態は既存コンテナが保持する |

ローカルでは各パッケージの名前と版を定義し、Editor のロックファイルで各ソースを参照する。3パッケージは個別に `npm pack` できる。バックパックの試験用操作は段階4のウィンドウ管理から独立している。

## 再現と受け入れ基準

各作業ツリーで依存と scratch-gui の生成済みソースを用意する。実ドラッグの試験には macOS の Chrome と、CoreGraphics からマウス入力を送信できる GUI セッションが必要。

```sh
# Editor 作業ツリー
node --test --import ./test/asset-hooks.ts test/extension-loader.test.ts \
  test/project-tools/properties.test.ts test/stage2/contracts.test.ts \
  packages/editor-backpack/test/script.test.ts

# scratch-gui 作業ツリー
CI=1 NODE_ENV=production ROOT=/turbowarp-plus-editor/ E2E_GUI_ROOT="$PWD" \
  DISABLE_V8_COMPILE_CACHE=1 node --openssl-legacy-provider node_modules/webpack/bin/webpack.js \
  --config ../editor-product23/scripts/site/webpack.config.cts \
  --output-path /private/tmp/tw151-product23/production --bail

# Editor 作業ツリー
TW151_STAGE3_PREFIX=/turbowarp-plus-editor/ \
  TW151_STAGE3_BUILD=/private/tmp/tw151-product23/production node test/stage3/check.ts
```

既定ではヘッドレスで開閉と復帰を検証する。ウィンドウ間の実マウスドラッグを確認する場合は、コマンドに `TW_PLUS_NATIVE_INPUT=1` を追加する。

- 既定、明示 OFF、不正値で既存のバックパックとコード画面を利用できる。両方の起動フラグを有効にした場合も、⚓ を押すまで操作は出ない。
- ポップアップ拒否で保存済み項目を元の場所で使える。成功時は展開状態と項目を別ウィンドウに表示する。
- OS マウスで別ウィンドウからコード画面へドロップすると、保存済みスクリプトを1回コピーする。読み込み中にスプライトを切り替えても、ドロップ時点のスプライトだけに反映する。SB3 の保存と再読込後もコピーが残る。
- ドック操作や子ウィンドウ閉鎖・再読込でバックパックが元の位置に戻る。⚓ でボタンを非表示にしても開いているウィンドウと保留中の読込は維持し、ドック操作で保留中の読込を取り消す。この取消経路は DOM イベントを使い、ネイティブドラッグの成功経路とは分けて検証する。

macOS の Chrome 156 で配信用プレフィックスを使う production ビルドの7シナリオを確認した。ログは `/private/tmp/tw151-product23-production-native.log`。段階2のテキスト試験パネルは Chrome と署名済み #155 Electron 試験ビルドの両方でネイティブ双方向ドラッグと復帰を確認した。試験パネルの結果と、この段階3の製品接続は区別する。転送対象は対応する組み込みブロックのスクリプト。変数、拡張、コメントなどの依存を持つスクリプト、逆方向、他アイテム、外部コード画面、段階3の Electron 接続は後続の検証範囲。

## 切り戻し

開いているウィンドウのドック操作で、保留読込を取り消し、元の位置に戻す。バックパック機能だけを停止する場合は URL の `twPlusBackpackPopout` を外して Editor を再起動する。確定済みのコピーは作品に残る。
