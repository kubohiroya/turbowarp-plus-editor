# TurboWarp Editor Layout

同じdocument内のエディター・ステージ列と、ステージ・対象領域を分割するパッケージ。Issue #161で追跡する。

ホストは `createLayout(React)` に既存のReactを渡し、返された部品の `render` で描画領域を接続する。フラグ、⚓️、ストレージの選択はホストが所有する。パッケージはGUI・VMをimportしない。

ドラッグ、矢印キー、Home／Endで分割位置を変更する。ダブルクリックまたはEnterで対象の境界を初期化できる。ビューが狭い間は最小サイズで制限し、保存済みの配分は広げた時に復元する。

`npm test` で配分、縦横比、設定の読み書きを確認する。独立試験用ホストは `example/index.html`。

試験用ホストを開くにはパッケージディレクトリで `npm install` と `python3 -m http.server` を実行し、`/example/` を表示する。実行時に必要なReactは組み込み先から受け取る。

この段階のEditorはチェックアウト内の候補パッケージをビルド時に参照する。別リポジトリで公開版を確定した後は、Editorの依存版固定へ置き換えられる。

## Editorのローカル結合試験

Editorのwebpack設定で、`site/source.json` が指すGUIをビルドする。Editorのルートから `E2E_GUI_ROOT=/absolute/gui-checkout node --test test/editor-layout.browser.mjs` を実行する。同じGUIをホスト連携なしでビルドしたディレクトリを `E2E_LAYOUT_BARE_BUILD` に渡すと、GUI単体の回帰も確認する。

移行時の⚓️をOFFにすると標準配分へ戻り、再ONで保存した配分を復元する。スプリッターモード内で既存のステージサイズボタンを押すと配分をリセットし、そのプリセットを適用する。
