# #151 段階6 — コードの別ウィンドウ

#154 と #155 の対象固定、編集権、履歴共有の試作を、#189 後の Editor に接続する。Scratch GUI は `site/source.json` の既存固定版と任意のワークスペース接続口を使用する。各子ウィンドウはその document で ScratchBlocks を起動し、既存の固定 URL と MessagePort を使って親の VM に接続する。子は VM、Node、preload、opener を持たない。

`editor-views` がターゲットと編集権、対象別の Undo／Redo、投影を管理する。旧所有者のイベントを MessagePort 順に処理し、解放を受けてから次を許可する。親のコード画面は同じ履歴を使用する。履歴は対象ごとに最初の別窓を開いた時点から親のメモリーに保持し、確定したコードは VM の通常の SB3 保存対象になる。履歴を復元するアダプターは、#155 と同様に固定 VM のブロックコンテナー内部を利用する。

実バックパックからコード別窓へは、既存の一度だけ使える転送参照を渡す。背面では専用の領域がドロップを受け、ドロップ先はウィンドウに結び付いた対象に固定する。前面の編集イベントを処理し終えてから親の VM にコピーし、転送したスクリプト全体を対象別履歴の1件として記録する。バックパック側の既存の対象範囲と同じく、転送は依存関係のない標準ブロックに限る。

## 検証

[既存の Desktop コピー作成手順](../stage5/stage-popout-desktop.md)で、GUI の固定版と公式 TurboWarp Desktop 1.17.1 から試験用アプリを作る。macOS の製品版ローカルコピーは次のコマンドで検証する。

```sh
node test/stage3/check-desktop.mjs /absolute/path/to/trial.app --code-popout
node test/stage3/check-desktop.mjs /absolute/path/to/trial.app --code-backpack
node --test packages/editor-views/test/code-session.test.js
```

フォーカスは Electron のネイティブウィンドウで切り替え、コード編集と Undo／Redo は Playwright／CDP で実際の ScratchBlocks と操作ボタンに入力する。親の VM、両ワークスペース、親コード画面への引き継ぎを観測する。移動したブロックと追加したブロックは、SB3 を保存して再読込した後にも照合する。

`--code-backpack` は実バックパックのドラッグを CDP で捕捉し、背面のコード別窓にドロップする。前面が操作可能な状態に戻り、コピーした2ブロックが親の VM と同じ対象の両ビューに表示され、別のスプライトに変更が入らないことを照合する。再送が拒否されること、前面の共有 Undo／Redo でコピー全体を1回で戻せること、バックパックがドックに復帰することも確認する。

## 今回の範囲と切り戻し

Desktop のコード欄から、選択中の対象を固定した別窓を最大2枚開ける。初期パレットは動きと見た目の一部。コードの基本ブロック編集、前面への編集権の移動、対象別履歴、閉鎖時の親コード画面への復帰を対象とする。背面へのドロップを OS の物理マウス入力で行う検証、全パレット、変数・コメント・定義・拡張ブロックの共有履歴、対象セレクター、Web 外部表示、他 OS は個別に検証する。

起動時に `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1`、`TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1`、`TW_PLUS_DESKTOP_CODE_POPOUT=1` を指定する。バックパックも OS の別窓で開く場合は `TW_PLUS_DESKTOP_BACKPACK_POPOUT=1` を加える。⚓ で操作を表示し、コード行の「別画面で開く」を押す。フラグは既定 OFF。子を閉じ、作品を保存してから `TW_PLUS_DESKTOP_CODE_POPOUT` を外して再起動すると、既存のコード画面とアプリ内表示に戻る。
