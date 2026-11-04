# スプライト一覧と複数コード画面

対象は同一ページ内の複数コード画面。作業ブランチは `feat/views/multi-target-editors`。#176 のアプリ内ウィンドウと、V-C で検証した前面だけの編集権を前提にする。 [製品統合 #177](https://github.com/kubohiroya/turbowarp-plus-editor/issues/177) · [契約検証 #154](https://github.com/kubohiroya/turbowarp-plus-editor/issues/154)

## 接続仕様

- GUI は既存のホスト接続口に、スプライトタイルの選択と「開く」、通常コードワークスペースのライフサイクルを渡す。GUI の一覧、コンテキストメニュー、既存のパレットとブロック編集処理を使う。任意の接続を指定しない GUI は従来の経路を通る。
- `windows` は通常の枠・前面化・最小化を担当する。追加した接続は前面化通知とプログラムからの前面化、最小化通知、タイトル更新を提供する。パッケージソース `e365d66999f1c187821733eaa4fc1a161d354a4e` の 0.5.0 を同梱し、lockfile で固定する。
- `views` はウィンドウごとの対象オブジェクトと前後順を保持する。一覧の左クリックは最後に前面化した同対象ウィンドウを選び、右クリックの「開く」は固有 ID を持つ新しいウィンドウを作る。前面が閉じたら次の表示中のウィンドウへ編集権を渡す。対象削除や作品差替えで、同じ ID の古い対象を再利用しない。
- 既存のコードワークスペースをマウントしたまま、前面またはドックへ移す。切替前に ScratchBlocks のジェスチャーとイベントキューを処理する。VM 側とワークスペースの対象が一致している場合に編集イベントを通す。背面は VM の対象から読み取り専用 ScratchBlocks 表示を更新する。
- Undo／Redo は既存の ScratchBlocks 履歴を対象オブジェクト別に保持する。外部更新でコードの内容が変わった場合や、ネイティブワークスペースを再生成した場合は古い履歴を破棄する。今回の GUI 接続は固定済み VM と ScratchBlocks を使う。履歴とイベントキューの内部 API への依存は `views/workspace.js` に限定する。

GUI の既存5ファイルに任意接続を追加する。コードは配信側の `packages/editor-views` が所有する。既存の単一編集画面、VM、SB3 のデータ形式を使う。製品向けの背面ドロップで履歴を正確に1操作へまとめるには、非同期取り込みが確定したブロック ID を返す契約が残る。コスチューム・音・別ウィンドウは対応する契約検証の後に扱う。

## 検証と切り戻し

起動時に `twPlusWindowLayout=1&twPlusInternalWindows=1&twPlusSpriteCodeWindows=1` を指定する。既定は OFF。以下はアプリ内のスプライト一覧を使い、配信用ビルドの起動、左右クリック、選択枠、キー操作による前面化、同対象の編集同期と Undo／Redo、別対象への誤適用防止、タブ切替、閉鎖、対象削除と SB3 保存・再読込、日英メニューを確認する。

```sh
E2E_GUI_ROOT=/absolute/path/to/scratch-gui TW_PLUS_PACKAGER_ROOT=/absolute/path/to/packager npm run build:pages
node test/stage6/code-windows.mjs /absolute/path/to/scratch-gui/build
```

切り戻す場合は、開いたコードウィンドウを閉じて作品を保存し、`twPlusSpriteCodeWindows=1` を外して起動し直す。確定済みのブロックは通常の SB3 に保存する。
