# #155 B-ST 公式 Desktop のローカルコピー

この試作は #176 の実ステージを利用する。親ウィンドウで起動した VM・描画ループ・レンダラー・WebGL canvas を使い続け、canvas を含む DOM を同一オリジンの固定子ページへ移す。マウスとキー入力を表示先の document で受け、ドック復帰時に購読を戻す。緑旗・停止・プロジェクト編集は親で扱う。

Desktop の main は、明示的な起動設定がある場合に限り `tw-plus-stage-<UUID>` と `about:blank` の組を受け、固定の `stage-popout.html` へ遷移させる。既存の短命チケットと MessagePort を利用する。子は sandbox と context isolation を有効にし、preload と Node の接続を持たない。接続後に opener を解除する。検証用のネイティブ表示先は1枚ずつ開く。

## 再現

固定した scratch-gui と公式 TurboWarp Desktop 1.17.1 のソースを用意する。

```sh
# scratch-gui 作業ツリー
CI=1 NODE_ENV=production ROOT= E2E_GUI_ROOT="$PWD" \
  TW_PLUS_DESKTOP_SOURCE=/private/tmp/tw151-desktop23-official \
  node --openssl-legacy-provider node_modules/webpack/bin/webpack.js \
  --config ../editor-stage5/scripts/desktop/webpack.config.cjs \
  --output-path /private/tmp/tw155-bst-build --bail

# Editor 作業ツリー
python3 scripts/desktop/prepare-app.py /private/tmp/tw155-bst.app \
  --build /private/tmp/tw155-bst-build --test-control
node test/stage3/check-desktop.mjs /private/tmp/tw155-bst.app --stage-popout
```

テストは使い捨てプロファイルを用いる。macOS の CoreGraphics でポインターとキーを入力し、CDP は状態の観測、キャンバスの画像取得、ウィンドウを開く操作と親側のドックボタンに使用する。サイズの変更とネイティブ閉鎖はテスト専用 main コマンドから BrowserWindow を操作する。診断はローカルの `/private/tmp/tw155-bst-final.log` に記録する。

## 対象範囲と切り戻し

macOS のローカルコピーで、同じ描画ループによるピクセル更新、表示先変更とネイティブリサイズ後の縦横比・マウス座標、キー押下と解放、ドックボタンおよび BrowserWindow の閉鎖、復帰後の描画と入力を検証する。モニターのドラッグ、タッチ、質問欄、異なる OS、ファイル・保存・メニューの境界は個別の検証対象。

アプリを閉じて `TW_PLUS_DESKTOP_STAGE_POPOUT` を外すと、アプリ内ステージの動作に戻る。ローカルコピーの作成は元の公式アプリを使用し、別の出力先に書き込む。
