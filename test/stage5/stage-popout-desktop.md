# #155 B-ST 公式 Desktop のローカルコピー

この試作は #176 の実ステージを利用する。親ウィンドウで起動した VM・描画ループ・レンダラー・WebGL canvas を使い続け、canvas を含む DOM を同一オリジンの固定子ページへ移す。マウスとキー入力を表示先の document で受け、ドック復帰時に購読を戻す。緑旗・停止・プロジェクト編集は親で扱い、質問への回答は表示先のステージで受け付ける。

変数モニターを別 document に移した場合は、`editor-layout` がマウスのポインターを捕捉し、表示倍率を反映して移動量を計算する。Scratch GUI の既存コールバックで同じ VM に位置を記録し、ドック時とアプリ内では既存のドラッグ経路を使う。

Desktop の main は、明示的な起動設定がある場合に限り `tw-plus-stage-<UUID>` と `about:blank` の組を受け、固定の `stage-popout.html` へ遷移させる。既存の短命チケットと MessagePort を利用する。子は sandbox と context isolation を有効にし、preload と Node の接続を持たない。接続後に opener を解除する。同じ種類のネイティブ表示先は1枚まで開ける。

## 再現

`site/source.json` が指す scratch-gui と、公式 TurboWarp Desktop 1.17.1 のソースおよび macOS アプリを用意する。

```sh
# Editor 作業ツリーで実行する。GUI の依存はインストール済みとする。
editor_checkout="$PWD"
gui_checkout=/absolute/path/to/scratch-gui
desktop_source=/absolute/path/to/official-desktop-source
desktop_app=/Applications/TurboWarp.app
stage_trial=$(mktemp -d)
(
  cd "$gui_checkout"
  CI=1 NODE_ENV=production ROOT= E2E_GUI_ROOT="$PWD" \
    TW_PLUS_DESKTOP_SOURCE="$desktop_source" \
    DISABLE_V8_COMPILE_CACHE=1 node --openssl-legacy-provider node_modules/webpack/bin/webpack.js \
    --config "$editor_checkout/scripts/desktop/webpack.config.cts" \
    --output-path "$stage_trial/build" --bail
)
python3 scripts/desktop/prepare-app.py "$stage_trial/Stage.app" \
  --source "$desktop_app" --build "$stage_trial/build" --test-control
TW_PLUS_NATIVE_INPUT=1 node test/stage3/check-desktop.ts "$stage_trial/Stage.app" --stage-popout
```

日常のアプリ内ステージのドック・アンドック確認にはヘッドレスの `test/stage5/stage.ts` を使う。実マウス・キーの検証は、ネイティブ入力、別ウィンドウへの接続、または対象の Desktop 環境が変わった場合に実施する。これらの前提が同じなら既存の結果を使う。

テストは使い捨てプロファイルを用いる。macOS の CoreGraphics でポインターとキーを入力し、CDP は状態の観測、キャンバスの画像取得、ウィンドウを開く操作と親側のドックボタンに使用する。サイズの変更とネイティブ閉鎖はテスト専用 main コマンドから BrowserWindow を操作する。テストは結果と診断を標準出力へ出す。

## 対象範囲と切り戻し

macOS のローカルコピーで、同じ描画ループによるピクセル更新、表示先変更とネイティブリサイズ後の縦横比・マウス座標、キー押下と解放、ドックボタンおよび BrowserWindow の閉鎖、復帰後の描画と入力を検証する。親側の緑旗と停止、子側の質問への回答、変数モニターのマウスドラッグとドック復帰後の位置も確認する。⚓ でアンドックボタンを非表示にしても別ウィンドウは維持され、ドックに戻した後もボタンは非表示のままとする。タッチ、モニターのコンテキストメニュー、異なる OS、ファイル・保存・メニューの境界は個別の検証対象。

アプリを閉じて `TW_PLUS_DESKTOP_STAGE_POPOUT` を外すと、アプリ内ステージの動作に戻る。ローカルコピーの作成は元の公式アプリを使用し、別の出力先に書き込む。
