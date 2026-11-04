# #151 段階3のローカル検証

Editor の `feat/backpack/undock-dnd` と、`site/source.json` が参照する scratch-gui のローカルブランチ `feat/gui/backpack-slots` を使う。フラグ `twPlusBackpackPopout=1` を Editor の URL に指定すると、ローカルバックパックを別ウィンドウで開ける。既定は OFF。splitter のフラグとは独立している。

| パッケージ | 責務 |
| --- | --- |
| `editor-windows` | タイトルバー、スプライト・ステージの選択、別画面で開く、最小化、最大化・復元、ドックの React 部品。表示値と操作可否は props、操作通知はコールバックで受け渡す |
| `editor-backpack` | 既存バックパックの表示を移し、ドラッグとコード画面へのドロップを接続する。`editor-windows` と段階2の `editor-surfaces`、`editor-transfer` を利用する |
| Editor | ブラウザーウィンドウを開き、既存の転送実装でドロップ時のスプライトにスクリプトをコピーする |
| scratch-gui | 任意の表示ラッパーとスクリプトのドラッグハンドルを受け取る。バックパックのストレージと展開状態は既存コンテナが保持する |

バックパックではタイトルバーと開く・ドック操作を使う。対象セレクターはコードなどの対象付き画面で再利用できる。最大化・最小化はブラウザーのウィンドウ枠で操作し、React のボタンはウィンドウ状態を管理するホストがある画面に接続できる。

## 再現と受け入れ基準

各作業ツリーで依存と scratch-gui の生成済みソースを用意する。macOS の Chrome と、CoreGraphics からマウス入力を送信できる GUI セッションを使用する。

```sh
# Editor 作業ツリー
node --test test/stage2/contracts.test.ts test/stage3/window-controls.test.mjs

# scratch-gui 作業ツリー
CI=1 E2E_GUI_ROOT="$PWD" node node_modules/webpack/bin/webpack.js \
  --config ../editor-stage3/scripts/site/webpack.config.cts \
  --output-path /private/tmp/tw151-stage3/build --bail

# Editor 作業ツリー
node test/stage3/check.mjs
```

- フラグ OFF で既存のバックパック、コード画面、splitter の操作が利用できる。
- ポップアップが拒否された場合は、保存済み項目を元の場所で操作できる。開けた場合は、既存の展開状態と項目を別ウィンドウに表示する。
- OS マウスで別ウィンドウからコード画面へドロップすると、保存済みスクリプトを1回コピーする。読み込み中に選択スプライトを切り替えても、ドロップ時点のスプライトだけに反映する。
- ドックボタンと別ウィンドウの閉鎖でバックパックが元の位置に戻る。SB3 の保存と再読込後もコピーが残る。

macOS の Chrome 156 で上記を確認した。転送対象は対応する組み込みブロックのスクリプト。変数、拡張、コメントなどの依存を持つスクリプトや画像・音声、段階3の Electron 接続は検証範囲外。

段階2の独立した双方向ドラッグ試験の再実行では、最初の Editor → 試験パネルのコピー待ちがタイムアウトした。同じローカル環境で段階2の基点 `b052a1d` に戻しても再現した。段階3のバックパック → コード画面の試験は通過した。

## 切り戻し

別ウィンドウを閉じ、URL の `twPlusBackpackPopout` を外して Editor を再読込する。すでにコピーしたコードは作品に残る。
