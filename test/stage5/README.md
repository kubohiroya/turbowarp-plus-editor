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

タイトルバーの「閉じる」またはドックの「ここに戻す」でステージを戻す。ステージの切り離し機能を止める場合は Web の `twPlusStagePanel` または Desktop の `TW_PLUS_DESKTOP_STAGE_PANEL` を外して再起動する。

外部ウィンドウのステージは #155 の B-ST の結果を前提とする。

# #176 領域 (3) スプライト一覧と背景タイル

Web は `?twPlusWindowLayout=1&twPlusInternalWindows=1&twPlusTargetList=1` で起動する。⚓ を有効にすると、スプライト一覧の右上から一覧をアプリ内ウィンドウへ移せる。タイトルバーの「閉じる」かドックの「ここに戻す」で元の場所に戻る。

背景タイルは一覧の実寸で位置を決める。横長で2列以上なら右上、縦長で2行以上なら左下に1マスを使い、スクロール中もその端に残る。どちらも収まらないときは一覧の末尾に置く。タイルを選ぶとステージが選択され、背景タブの一覧下部にライブラリ・描画・おまかせ・アップロードの4操作が並ぶ。

## 実エディターで確認する

```sh
TW151_STAGE5_PREFIX=/turbowarp-plus-editor/ \
  TW151_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node test/stage5/targets.mjs "$E2E_GUI_ROOT/build"
```

試験では Scratch の画像配信をローカルのテスト画像で代替し、ライブラリ選択、おまかせ、描画、ファイルアップロードには実エディターの操作と VM を使用する。

## 切り戻し

タイトルバーの「閉じる」またはドックの「ここに戻す」で一覧を戻す。従来の一覧と背景操作に戻す場合は `twPlusTargetList` を外して再起動する。

## macOS Desktop の別ウィンドウ

[別窓ステージと同じ手順](stage-popout-desktop.md)で公式 Desktop の試験用コピーを作成する。起動時に `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1`、`TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1`、`TW_PLUS_DESKTOP_SPRITE_PROPERTIES=1`、`TW_PLUS_DESKTOP_TARGET_LIST=1`、`TW_PLUS_DESKTOP_TARGET_PANELS_POPOUT=1` を指定すると、⚓ で表示した操作からスプライト設定と一覧を各1枚のネイティブウィンドウに開ける。選択と編集は親の VM に反映する。

```sh
node test/stage3/check-desktop.mjs /absolute/path/to/trial.app --target-panels-popout
```

試験は両方を同時に開き、一覧での対象選択と設定からの編集、背景タイルの再配置、親の「ここに戻す」と OS ウィンドウの閉鎖による復帰を確認する。別窓だけを無効にする場合は、`TW_PLUS_DESKTOP_TARGET_PANELS_POPOUT` を外して再起動する。設定と一覧はアプリ内ウィンドウに開ける。
