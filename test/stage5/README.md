# #176 領域 (1) ステージ

アプリ内ウィンドウに、既存のステージキャンバスとモニター等のオーバーレイを移す。メイン側のステージ操作行から緑旗・停止・ステージ全画面・⚓ を操作する。ステージの縦横比は作品設定から取得し、アプリ内の表示領域に収まるようにする。ステージを移動しても、入力は現在のキャンバスの座標で共有 VM に伝わる。

Web は `?twPlusWindowLayout=1&twPlusInternalWindows=1&twPlusStagePanel=1` で起動する。⚓ を有効にし、ステージをホバーするか右上の操作にフォーカスして「別画面で開く」を選ぶ。タイトルバーの「閉じる」またはドックの「ここに戻す」で元に戻る。

## ローカル検証

[設定パネルの手順](../sprite-properties/README.md) と同じ GUI と Packager の固定ソースを用意する。配信ビルドを使う場合は次を実行する。

```sh
TW151_STAGE5_PREFIX=/turbowarp-plus-editor/ \
  TW151_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node test/stage5/stage.mjs "$E2E_GUI_ROOT/build"
```

Desktop のローカルコピーは `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1 TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1 TW_PLUS_DESKTOP_STAGE_PANEL=1` で起動する。署名済み試験用コピーで次を実行する。

```sh
node test/stage3/check-desktop.mjs /private/tmp/tw151-stage5-stage-desktop.app --stage-panel
```

## 切り戻し

⚓ を解除してステージをドックへ戻す。ステージの切り離し機能を止める場合は Web の `twPlusStagePanel` または Desktop の `TW_PLUS_DESKTOP_STAGE_PANEL` を外して再起動する。

外部ウィンドウのステージは #155 の B-ST の結果を前提とする。
