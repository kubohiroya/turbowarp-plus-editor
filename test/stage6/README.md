# #151 段階6 — コードの別ウィンドウ

#154 と #155 の対象固定、編集権、履歴共有の試作を、#189 後の Editor に接続する。Scratch GUI は `site/source.json` の既存固定版と任意のワークスペース接続口を使用する。各子ウィンドウはその document で ScratchBlocks を起動し、既存の固定 URL と MessagePort を使って親の VM に接続する。子は VM、Node、preload、opener を持たない。

`editor-views` がターゲットと編集権、対象別の Undo／Redo、投影を管理する。旧所有者のイベントを MessagePort 順に処理し、解放を受けてから次を許可する。親のコード画面は同じ履歴を使用する。履歴は対象ごとに最初の別窓を開いた時点から親のメモリーに保持し、確定したコードは VM の通常の SB3 保存対象になる。履歴を復元するアダプターは、#155 と同様に固定 VM のブロックコンテナー内部を利用する。

実バックパックからコード別窓へは、既存の一度だけ使える転送参照を渡す。背面では専用の領域がドロップを受け、ドロップ先はウィンドウに結び付いた対象に固定する。前面の編集イベントを処理し終えてから親の VM にコピーし、転送したスクリプト全体を対象別履歴の1件として記録する。バックパック側の既存の対象範囲と同じく、転送は依存関係のない標準ブロックに限る。

## 検証

[既存の Desktop コピー作成手順](../stage5/stage-popout-desktop.md)で、GUI の固定版と公式 TurboWarp Desktop 1.17.1 から試験用アプリを作る。macOS の製品版ローカルコピーは次のコマンドで検証する。

```sh
node test/stage3/check-desktop.ts /absolute/path/to/trial.app --code-popout
node test/stage3/check-desktop.ts /absolute/path/to/trial.app --code-target-sync
node test/stage3/check-desktop.ts /absolute/path/to/trial.app --code-stage
node test/stage3/check-desktop.ts /absolute/path/to/trial.app --code-comments
node test/stage3/check-desktop.ts /absolute/path/to/trial.app --code-backpack
TW_PLUS_NATIVE_INPUT=1 node test/stage3/check-desktop.ts /absolute/path/to/trial.app --code-backpack-native
node --test packages/editor-views/test/code-session.test.ts
```

フォーカスは Electron のネイティブウィンドウで切り替え、コード編集と Undo／Redo は Playwright／CDP で実際の ScratchBlocks と操作ボタンに入力する。親の VM、両ワークスペース、親コード画面への引き継ぎを観測する。移動したブロックと追加したブロックは、SB3 を保存して再読込した後にも照合する。

`--code-target-sync` は、タイトルバーの対象コンボボックスに現在のコスチュームのサムネイルが表示されることと、マウス・キーボードで対象を選べることを確認する。コンボボックスで対象を選ぶとスプライト一覧の選択が変わる。逆に一覧で選ぶと、最後に操作したコード別窓1枚が追従する。背面の対象を保持し、スプライトを行き来しても対象別の Undo／Redo を別ビューから利用できることを照合する。このモードの入力は Playwright／CDP を使用する。

前面のコード別窓ではコンボボックスの名前欄でスプライトを改名できる。Enter で確定し、Escape で編集中の値を取り消す。同名の別スプライトがいる場合は元の名前に戻して通知する。改名後は別窓のタイトルと候補、スプライト一覧を更新し、別スプライトのコードからの名前参照が共有 Undo／Redo 後も新しい名前を指すことを確認する。

`--code-stage` は、対象をステージへ切り替えるとパレットに背景用ブロックが表示され、スプライトへ戻すと「動き」カテゴリが戻ることを確認する。追加した「次の背景にする」はステージのコードにだけ反映され、同じステージの別窓から Undo／Redo できる。ドック復帰後と SB3 再読込後にも追加したブロックを照合する。入力は Playwright／CDP を使用する。

`--code-comments` は、ブロックに付けたコメントと独立したコメントを別窓から編集する。別窓に編集権が移るときに入力を確定し、共有 Undo／Redo、別スプライトへの誤適用防止、ドック復帰、SB3 再読込を Playwright／CDP で確認する。

2026年11月5日に、TurboWarp Desktop 1.17.1 の macOS ローカルコピー（Electron 43.8.4）で `--code-target-sync` と `--code-backpack` が通過した。名前編集を追加した後も、Editor が固定する GUI `481c17b45` と VM `78e5f032` を使った同製品のローカルコピーで `--code-target-sync` が通過した。

`--code-backpack` は実バックパックのドラッグを CDP で捕捉し、背面のコード別窓にドロップする。前面が操作可能な状態に戻り、コピーした2ブロックが親の VM と同じ対象の両ビューに表示され、別のスプライトに変更が入らないことを照合する。再送が拒否されること、前面の共有 Undo／Redo でコピー全体を1回で戻せること、バックパックがドックに復帰することも確認する。

`--code-backpack-native` は macOS の CoreGraphics HID 経由でドラッグとボタンのクリックを行う。CDP はテストデータの用意と状態観測に使う。ドラッグ開始とドロップが信頼されたイベントであること、背面のコード画面が途中も編集不可のままであること、前面の Undo と Redo を各1回押すとコピーした2ブロック全体が消え、復元されることを確認する。バックパックのドックボタンを押すと別窓が閉じ、元の項目がエディター内に戻る。

2026年11月5日に、TurboWarp Desktop 1.17.1 の macOS ローカルコピー（Electron 43.8.4）で `--code-backpack-native` の全項目が通過した。

## 今回の範囲と切り戻し

Desktop のコード欄から、選択中の対象で別窓を最大2枚開ける。初期パレットは動きと見た目の一部。コードの基本ブロック編集、前面への編集権の移動、対象別履歴、閉鎖時の親コード画面への復帰を対象とする。タイトルバーのコンボボックスは対象の選択とスプライト名の編集に使う。全パレット、変数・コメント・定義・拡張ブロックの共有履歴、Web 外部表示、他 OS は個別に検証する。

起動時に `TW_PLUS_DESKTOP_WINDOW_LAYOUT=1`、`TW_PLUS_DESKTOP_INTERNAL_WINDOWS=1`、`TW_PLUS_DESKTOP_CODE_POPOUT=1` を指定する。バックパックも OS の別窓で開く場合は `TW_PLUS_DESKTOP_BACKPACK_POPOUT=1` を加える。⚓ で操作を表示し、コード行の「別画面で開く」を押す。フラグは既定 OFF。子を閉じ、作品を保存してから `TW_PLUS_DESKTOP_CODE_POPOUT` を外して再起動すると、既存のコード画面とアプリ内表示に戻る。

アプリ内の複数コード画面と背面ドロップは別の検証手順を使う。両方の起動フラグが有効な Desktop では、既存の OS 別窓を優先する。 [アプリ内コード画面の検証](sprite-code-windows.md)

### 拡張独自フィールド

親 VM に登録する拡張の `customFieldTypes` で、`implementation` に
`{type: 'field_input'}` または
`{type: 'field_dropdown', options: [['表示名', '保存する値']]}` を指定できる。
独自型名には組み込み引数型と重複しない名前を使う。選択肢の表示名と保存値には文字列を使う。ScratchBlocks が編集 UI を生成し、VM の独自フィールド名と保存値はそのまま SB3 に入る。任意の `fromJson` や独自 UI コードはこの接続の対象外。

製品版 Electron の検証用コピーに対して
`node test/stage3/check-desktop.ts /path/to/TurboWarp.app --code-custom-fields`
を実行する。Playwright／CDP で、別窓間のテキストと選択値の反映、共有履歴、ドック復帰、SB3 再読込を確認する。

親側での実行が許可された TypeScript 拡張で処理を伴うフィールドを定義するときは
`ProgrammaticExtensionField` を使う。`getEditor(value)` が見出しと操作ボタンを返し、
`applyAction(value, actionId)` が保存する文字列を返す。変更を取り消す場合は
`undefined` を返す。コールバックは親側で同期的に実行される。作品の変更は戻り値で表し、コールバックから VM を直接更新しない。別窓へは文字列と操作 ID を渡す。
対象は、操作ボタンで完結するフィールド編集。任意の `fromJson`、HTML、DOM の互換性は別途検証する。

検証用の TypeScript 拡張は `fixtures/programmatic-extension.ts`。
製品版 Electron の検証用コピーに対し `--code-programmatic-fields` で実行する。
