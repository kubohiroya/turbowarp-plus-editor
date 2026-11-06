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

### `fromJson` と独自 DOM の互換性試作

親側での実行が許可された拡張の `customFieldTypes` に対し、親の ScratchBlocks が
`implementation.fromJson` を呼び、元のフィールドを生成する。
別窓のブロック上には保存値を表示し、編集時は親のフィールドが `WidgetDiv` に作る DOM を
別窓の document に配置する。イベントリスナーは親側で作られたものを使う。
前面ビューの編集権と対象を確認し、同じ操作中の同期的な `setValue` を共有履歴の1項目として確定する。
フォーカス移動、対象の切り替え、別窓の閉鎖では編集中の UI を閉じる。

対象は `WidgetDiv` に DOM を作り、文字列を `setValue` で確定する編集 UI。
フィールド自体の独自 SVG 描画、`document.body` や別のオーバーレイに直接出力する UI、
親 document に依存するイベントや CSS、閉鎖後の非同期確定は互換性の検証範囲外。

製品版 Electron の検証用コピーに対して `--code-native-fields` を指定する。
`fixtures/native-extension.ts` の独自テキストエリアとボタンを Playwright／CDP で操作する。

### 独自 SVG の互換性試作

親の ScratchBlocks で描画済みの拡張フィールドから、基本図形、パス、文字と
許可した描画属性をデータとして取得する。別窓ではフィールドの保存値と一致する描画だけを再現する。
スクリプト、イベント属性、外部参照、任意の CSS は渡さない。親で対象の描画を取得できない場合は
別窓に値を文字で表示する。編集は既存の `WidgetDiv` と同期的な `setValue` を使う。

製品版 Electron の検証用コピーで `--code-svg-fields` を指定すると、
`fixtures/native-extension.ts` の独自 SVG を表示し、値に応じた色の変化、
共有 Undo／Redo、ドック復帰、SB3 再読込を Playwright／CDP で確認する。

### 親 document で描画・イベント処理を行う独自フィールドの試作

親側での実行が許可された拡張で、`customFieldTypes` の
`implementation.parentDocument = true` を指定する。元の `WidgetDiv` と操作対象は
親 document に残し、別窓に許可した HTML 要素だけを再構築する。
別窓で編集権を持つ間、入力値を対応する親側の要素へコピーし、
バブリングする `input`、`change`、`click` を送る。拡張の委譲リスナーは親 document で実行し、
同期的な `setValue` を既存の共有履歴へ確定する。

対象は固定構造のテキストエリア、テキスト・数値・範囲の入力欄、ボタンと補助的なテキスト要素。
別窓へは任意の HTML、スクリプト、外部参照、独自 CSS を渡さない。
`WidgetDiv` 外への描画、構造の動的な変更、実フォーカスや `isTrusted` に依存するイベント、
キーボード・ポインターイベントの一般的な転送、非同期確定は未検証。

製品版 Electron の検証用コピーに対して `--code-parent-document-fields` を指定する。
試験拡張の元の入力とボタンが親 document に留まり、親の委譲イベントで値が確定することを Playwright／CDP で確認する。

### 独自 CSS の互換性試作

`implementation.parentDocument = true` の `WidgetDiv` では、親 document で計算された
色、背景色、枠線、余白、文字のスタイルから許可した値だけを別窓の操作部品に適用する。
独自 SVG にも、親で計算された塗り・線と文字のスタイルのうち許可した値を適用する。
拡張の CSS セレクターやクラス、スタイルシート、外部参照は別窓へ渡さない。

対象は、固定構造の操作部品と、編集操作の時点で親側に適用されている見た目。
別窓固有の擬似クラスと擬似要素の対応範囲は次節を参照する。

製品版 Electron の検証用コピーに対して `--code-css-fields` を指定する。
親 document のスタイルシートを使う試験拡張で、別窓の編集 UI とブロック上の SVG のスタイルを
Playwright／CDP で確認する。

### CSS の擬似クラス・擬似要素の互換性試作

`implementation.parentDocument = true` の HTML 操作部品では、親 document で読み取れる
スタイルシートの直下にある単一クラスの `:hover`、`:focus`、`:focus-visible` を扱う。
例は `.apply:hover` や `.apply:hover::after`。許可した宣言を編集中のウィジェットに限定し、
別窓のブラウザーがポインターとフォーカスの状態に応じて適用する。拡張のイベント処理と値の確定は親側で行う。
`::before` と `::after` には、短いプレーンテキストと許可した色・余白・文字などのスタイルを適用する。
複数の条件や複雑なセレクター、カスケード全体、SVG の対話状態、任意のレイアウト、
外部フォント・画像・SVG 参照、非同期確定は検証範囲外。

製品版 Electron の検証用コピーに対して次を実行する。

```sh
node test/stage3/check-desktop.ts /path/to/TurboWarp.app --code-css-pseudo-fields
```

Playwright／CDP で、別窓のホバー・フォーカス・解除、生成テキストと色、画像参照の除外を確認する。
続けて編集、別ビューへの反映、共有 Undo／Redo、ドック復帰、SB3 再読込後の値と表示を確認する。
TurboWarp Desktop 1.17.1 の macOS ローカルコピー（Electron 43.8.4、GUI `15edb7930`、VM `78e5f032`）で通過した。
切り戻し時は作品を保存してドックへ戻し、`editor-views` のこの差分を戻す。

### CSS アニメーションの互換性試作

`implementation.parentDocument = true` の固定構造の HTML 操作部品では、親のブラウザーが解決した
CSS アニメーションから、色と不透明度のキーフレームを取得して別窓で再生する。
要素ごとに通常の文書タイムラインで実行中のアニメーション1本を対象とし、
対象プロパティの始点と終点を明示したキーフレームを使う。別窓で開くたびに再生を開始し、
閉じると停止する。別窓で動きを減らす設定が有効な場合は再生を抑止し、再生中に有効にすると停止する。
拡張の処理と値の確定は親 VM 側で行う。別窓へスタイルシートや外部参照は渡さない。

複数アニメーションの合成、動的な開始・停止や親との位相同期、擬似要素・SVG のアニメーション、
トランジション、位置・サイズ・変形などのレイアウトに関わるプロパティは検証範囲外。

検証では固定済みの Scratch GUI、Editor の Web レンダラー、本番のコード別窓レンダラーを使う。
ヘッドレス Chromium は複数のページで同時にフォーカスを報告するため、検証ハーネスが各ページの
フォーカス状態と通知を供給し、製品コードの編集権と MessagePort の経路で操作する。

```sh
editor_checkout="$PWD"
trial=$(mktemp -d)
(
  cd /absolute/path/to/pinned-scratch-gui
  CI=1 NODE_ENV=production ROOT=/turbowarp-plus-editor/ E2E_GUI_ROOT="$PWD" \
    DISABLE_V8_COMPILE_CACHE=1 node --openssl-legacy-provider node_modules/webpack/bin/webpack.js \
    --config "$editor_checkout/test/stage6/code-popouts.webpack.config.cts" --output-path "$trial/build" --bail
)
node test/stage6/css-animation-fields.ts "$trial/build"
```

再生時刻ごとの見た目、動きを減らす設定、共有 Undo／Redo、ドック復帰、SB3 再読込後の値と再生を確認する。
ヘッドレス Chromium 156.0.8078.4（GUI `15edb7930`、VM `78e5f032`）で通過した。
切り戻し時は作品を保存してコード別窓をドックへ戻し、この段階の `editor-views` の差分を戻す。
