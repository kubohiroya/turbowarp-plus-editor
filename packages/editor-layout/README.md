# TurboWarp Editor Layout

同じ document 内で「編集領域／ステージ列」と「ステージ／対象領域」の境界を調整する。ホストは `createLayout(React)` に既存の React を渡し、`render` に渡される境界・スタイル・表示サイズを既存コンポーネントに接続する。ホストがストレージとキーを指定し、このパッケージが設定を保存・復元する。

境界はドラッグ、矢印キー、Home／End で移動できる。Enter またはダブルクリックで、その境界を既定の位置に戻す。

## Editor での配分

| 境界 | 最小サイズ |
| --- | --- |
| 編集領域／ステージ列 | 編集領域 500 px、ステージ列 350 px |
| ステージ／対象領域 | ステージ 135 px、対象領域 175 px |

境界の幅は 8 px。分割比率は各領域の最小サイズまでに制限する。最小サイズを両立できない表示領域では通常配分に戻し、表示領域を広げると保存した比率で分割を再開する。プロパティと一覧はスプライト選択ペイン内にまとまっており、バックパックは開閉式のトレイなので、この段階では既存の操作で扱う。メニューバーは分割領域の外にある。

Scratch 配置では分割を既定で有効にする。既存のステージサイズボタンを押すと、指定したプリセットで配分を初期化する。設定は作品や SB3 と別に保存する。分割だけを無効にする場合は Web の起動 URL に `twPlusSplitter=0` を指定するか、Desktop を `TW_PLUS_DESKTOP_SPLITTER=0` で起動する。

## Plus 標準配置

`createStandardLayout(React, {styles, targetStyles, context})` は、⚓️ での配置切り替え、ステージの表示と計測、スプライト一覧の2列配置を担当する。`editor.css` と `targets.css` をクラス名マップとして渡す。ホストは起動設定、ストレージ、ウィンドウ操作部品、パレット表示のコールバックと描画先を渡す。ステージを隠しても同じ描画先を使う。

試験用ホストの `/example/?standard=1` で Plus と Scratch の往復を確認できる。`standard=0` は起動時の切り戻しを再現する。

Editor はこのパッケージの `0.1.0` をローカル依存としてロックし、Editor のリビジョンと一緒にソースを固定する。

## 検証

`npm test` で配分・縦横比・設定の読み書きを、`npm run test:browser` で独立した試験用ホストを検証する。試験用ホストを手動で開くには、このディレクトリで `npm install` と `python3 -m http.server` を実行し、`/example/` を表示する。

Editor のルートから、`site/source.json` の GUI を `npm run build:pages` でビルドし、`E2E_GUI_ROOT=/absolute/gui-checkout E2E_PATH_PREFIX=/turbowarp-plus-editor/ node --test test/editor-layout.browser.mjs` を実行する。同じ GUI をホスト接続なしでビルドしたディレクトリを `E2E_LAYOUT_BARE_BUILD` に渡すと、GUI 単体の動作も検証する。
