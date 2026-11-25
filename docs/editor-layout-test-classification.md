# editor-layout.browser.ts のケース分類（#741）

基準は Editor main `8fc1e701088c007ba0180f4961f7d8911e82ca1e`（3,955行・39件）。行番号と題名はこの固定コミットのもの。前半70行は共通 host fixture で、残る3,885行を以下39件が覆う。

全件が `openBrowser` を通り、38件は固定 GUI の実 Editor ビルドと `verifyWebEditor` を使う。残る1件は接続口を使わない bare GUI を使う。ファイル全体を workbench へコピーするだけでは GUI checkout・固定ビルドの依存を解消できない。`TW_PLUS_LAYOUT_EDITOR_URL` などが未指定なら skip する上流の既存 integration test を、移管済みの根拠には使わない。

「接続保持」は実 GUI/VM/複数パッケージをまたぐ確認。「分離候補」は同じケースに機能の詳細検証も混ざるものであり、単独 host fixture を用意し、所有パッケージの CI で skip なしの成功を確認するまでは元の検証を削除しない。所有先は主な候補で、各切り出し時に実装の所在を再確認する。テスト行数だけを削除基準にしない。

| # | 固定コミットの行 | 元のケース | 主な所有先・接続先 | 判定 | 残す接続・次の切り分け |
|---|---|---|---|---|---|
| 1 | [71–106](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L71-L106) | the browser tab follows the current project title | workbench | 接続保持 | 入力・ファイルを開く・新規作成からブラウザー題名へ |
| 2 | [107–146](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L107-L146) | the unsaved marker stays by the project name and its hint fits in the viewport | workbench | 一部分離 | VM 変更・タイトル幅と隣接・保存メニューを保持。hint の hover/focus・狭幅表示は単独 host へ |
| 3 | [147–334](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L147-L334) | the real editor resizes both dividers and preserves editing and stage input | workbench / windows | 一部分離 | grip の幾何・keyboard の詳細を workbench へ。GUI テーマ・Blockly resize/edit・stage input・SB3 往復を保持 |
| 4 | [335–349](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L335-L349) | the GUI keeps its original editor without a host connection | Editor / GUI | 接続保持 | 接続口を使わない GUI の従来動作 |
| 5 | [350–421](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L350-L421) | the paint toolbar opens the project font list from costumes and backdrops | fonts / GUI | 分離候補 | costume/backdrop のフォント接続を保持し、追加・選択の詳細を分ける |
| 6 | [422–455](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L422-L455) | the Plus File menu groups project settings and opens the extension library | workbench / security-dialog | 接続保持 | File メニューから作品設定・拡張ライブラリーへ |
| 7 | [456–514](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L456-L514) | classic startup hides Plus additions while preserving the original File commands | Editor / GUI / workbench | 接続保持 | classic 起動フラグと既存 GUI メニュー |
| 8 | [515–566](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L515-L566) | the first menu row orders the Plus logo, project title, File, Edit, and search | workbench / GUI | 分離候補 | 既存 GUI と Plus のメニュー結線を保持し、並び・座標を別検証へ |
| 9 | [567–659](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L567-L659) | extension controls sit at the end of the menu bar and the stage can still shrink | workbench / Editor controls-dock | 接続保持 | 拡張 controls API と GUI メニューバー・stage sizing |
| 10 | [660–729](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L660-L729) | the enabled debugger opens from its own menu bar button, outside the extension controls | workbench / GUI addons | 接続保持 | debugger addon と専用メニューボタン |
| 11 | [730–872](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L730-L872) | the Plus project menu relocates display settings, runtime actions, and settings dialogs | workbench / GUI | 分離候補 | 本家の表示設定・runtime・dialog の結線を保持し、配置の詳細を分ける |
| 12 | [873–924](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L873-L924) | the Plus project menu and previous stage layout remain available | workbench / windows | 接続保持 | 作品メニューと以前の stage layout の併存 |
| 13 | [925–957](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L925-L957) | a separate stage window releases keyboard input on blur and restores the editor canvas | windows / workbench / VM | 接続保持 | 別窓の blur から VM 入力解放と元 canvas へ |
| 14 | [958–1235](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L958-L1235) | startup chooses the layout and the stage menu hides the stage without stopping the project | Editor / workbench / windows | 分離候補 | 起動フラグと継続実行を保持し、表示モード行列を分ける |
| 15 | [1236–1424](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1236-L1424) | the menu bar disables both stage buttons while a stage is open | workbench / windows | 接続保持 | stage を開いた間の既存 GUI ボタンと同一 renderer |
| 16 | [1425–1474](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1425-L1474) | the stage drawer starts pinned and remembers the pin menu choice | workbench / windows | 分離候補 | 実 stage の表示と復元を保持し、pin menu の状態行列を分ける |
| 17 | [1475–1624](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1475-L1624) | the stage drawer moves, resizes and folds into its attached editor edge | workbench / windows | 一部分離 | geometry の一連の操作をworkbench単独hostへ。実canvas・palette・表示menu・移動/resize/再表示の接続を保持 |
| 18 | [1625–1743](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1625-L1743) | the stage drawer restores its geometry and visibility with the project layout | workbench / project-model / windows | 接続保持 | IndexedDB・SB3・project layout と stage geometry の往復 |
| 19 | [1744–1902](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1744-L1902) | the default editor pins the sprite list and supports the drawer and detached window layout | workbench / sprite-panes / windows | 分離候補 | sprite list の接続を保持し、drawer と窓配置の詳細を分ける |
| 20 | [1903–1953](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1903-L1953) | a background code view retains its layout, pan and zoom | code-views / workbench | 接続保持 | 背景 view 切替後の layout・pan・zoom |
| 21 | [1954–2001](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L1954-L2001) | a background sprite code window fits scripts when the foreground shows none | code-views / workbench | 接続保持 | 異なる target と空の前面 workspace から背景 script の fit |
| 22 | [2002–2017](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2002-L2017) | the editor leaves the bottom edge free of Backpack controls | Editor / GUI | 接続保持 | 未使用 Backpack 接続口が画面下部を占有しない |
| 23 | [2018–2043](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2018-L2043) | the project information menu stays above the block palette | workbench / code-views | 分離候補 | 実 palette との重なりを保持し、menu 単体の表示を分ける |
| 24 | [2044–2192](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2044-L2192) | the editor layout menu opens the live block palette and the Dockview panel in separate windows | workbench / windows / code-views | 接続保持 | 既存 palette と Dockview を別窓へつなぐ |
| 25 | [2193–2295](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2193-L2295) | the default Dockview splits one sprite editor and restores each view section | workbench / sprite-panes | 接続保持 | 同一 sprite の編集 section を分割し復元する |
| 26 | [2296–2395](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2296-L2395) | sprite and backdrop menus open and select numbered Dockview tabs | workbench / GUI | 接続保持 | sprite/backdrop メニューと target・番号付き tab の選択 |
| 27 | [2396–2575](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2396-L2575) | the Dockview asset connection restores the native costume and sound selection per pane | sprite-panes / workbench / GUI | 接続保持 | native costume/sound 選択を pane ごとに戻す |
| 28 | [2576–2783](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2576-L2783) | the Dockview variables pane lists only data owned by the selected target | sprite-panes / code-views | 一部分離・候補あり | 作成ダイアログの詳細を単独 browser 2件へ。実 VM の結線を保持し、所有対象・種類・cloud 状態の表示行列は #823 で引き続き分類 |
| 29 | [2784–2896](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2784-L2896) | the variables table sorts mixed rows and saves list items for the selected target | sprite-panes | 一部分離 | sort/list editor の詳細を単独browser2件へ。実 VM の参照数・スプライト/クローン/グローバルリスト更新・monitor接続を保持 |
| 30 | [2897–2943](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2897-L2943) | variable counts open the project search at the selected kind of access | sprite-panes / code-views | 接続保持 | 変数アクセス種別から実 project search へ |
| 31 | [2944–3080](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L2944-L3080) | clone pages edit the selected runtime instance and fall back when it disappears | sprite-panes / VM | 一部分離 | pagination の境界・配置・選択保持を単独browser2件へ。実VMのclone編集・定義追加・monitor・消滅と停止を保持 |
| 32 | [3081–3151](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3081-L3151) | clone variables keep the original sprite reference counts and definition actions | sprite-panes / code-views | 接続保持 | clone から original sprite の参照・定義へ |
| 33 | [3152–3246](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3152-L3246) | editor pane headings and message diagrams follow the active target | sprite-panes / code-views | 接続保持 | active target と見出し・message diagram |
| 34 | [3247–3323](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3247-L3323) | the calls section independently toggles function calls and messages and opens a receiver in another target | sprite-panes / workbench / code-views | 一部分離 | 現行 DOM を実 Editor で照合済み。表示行列は sprite-panes の2件へ集約し、VM・図・別 target への接続を保持 |
| 35 | [3324–3508](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3324-L3508) | the hats and functions list and the calls section show each script alone in a code view beside the sprite | workbench / code-views | 分離候補 | script ごとの view 接続を保持し、表示・操作行列を分ける |
| 36 | [3509–3539](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3509-L3539) | Save a Copy of the Project keeps the labelled dialog actions at the right edge | workbench / windows | 今回分離 | 保存 form の action 配置・アイコン13行を単独 browser test へ。File メニュー・cancel・SB3 download を保持 |
| 37 | [3540–3669](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3540-L3669) | a block stack can be copied to a split code tab and back from its popout | workbench / code-views / GUI | 接続保持 | split code tab・popout・実 Blockly stack の往復 |
| 38 | [3670–3802](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3670-L3802) | two Dockview code panes keep independent positions and zoom for the same sprite | code-views / workbench | 接続保持 | 同一 sprite の複数 pane と独立 viewport |
| 39 | [3803–3955](https://github.com/kubohiroya/turbowarp-plus-editor/blob/8fc1e701088c007ba0180f4961f7d8911e82ca1e/test/editor-layout.browser.ts#L3803-L3955) | the Dockview stage keeps its renderer, controls and input through split and tab moves | workbench / windows / VM | 接続保持 | split/tab move 前後の同一 renderer・controls・input |

## 保存画面の action 配置（#815）

36番の action bar の `justify-content`、異なる cancel/confirm アイコン、並び順、右端の位置を workbench の `test/editor-save-dialog-actions.browser.ts` へ移す。元の13行の期待値・検証処理と GPL-3.0-or-later を保持し、追加の host fixture だけを書き換える。workbench の公開 `project-dialogs`・`project-file-dialogs` と windows の公開 `styles.css` を使い、GUI checkout・VM・Editor ビルド・外部ネットワークなしで実行する。windows の既存 API・CSS を利用し、windows 本体の変更は要らない。

Editor は同じケースで、File メニューからの起動、Cancel と再起動、保存した SB3 のダウンロードを内容不変で保持する。ケース名だけ接続確認を表すものに変える。残る38件と共通 fixture は変更しない。

依存順は workbench の push・PR・CI 成功・マージ → Editor の削除を含む push・PR・CI 成功・マージ。既存 `npm run test:browser` が新しい standalone case を環境変数なしで実行することを DoD とする。ローカルはビルド・新ケース・関連 form/dialog テスト・Editor 型検査と責務境界を限定実行する。保持した実 Editor の接続確認は、削除した13行とケース名以外が変更前と一致することを照合する。実 Editor の browser case は今回ローカルで再実行していない。通常 CI はこのファイルを実行しないため、PR #813 の CI 成功を当該 browser case の成功証拠には使わない。

製品コード・依存固定・GUI・起動フラグ・CI コマンドは変更しない。この browser ファイルは現在の通常 CI の実行対象ではないため、今回の13行削除による通常 CI の時間短縮は見込まない。#741 全体の CI 所要時間比較は未実施。

切り戻しは Editor の元13行とケース名を先に復元し、必要なら上流の追加テストと文書を revert する。その他38件の分離・最小化は継続する。特に VM に依存しない menu の状態行列や geometry の詳細は単独 host が作れるかを次に調べる。

## 未保存マーカーの詳細の切り出し

2番の背景色、hover と Tab フォーカス時のヒント表示、300px 幅の viewport 内にヒントが収まることを workbench の `test/editor-unsaved-marker.browser.ts` へ移す。元の操作・期待値を維持し、viewport の既知の存在を表す TypeScript の non-null 注釈だけを補う。公開 `ProjectSaveMenu` と `project-file-menu.css` を直接使い、host は native input と配置だけを用意する。GUI checkout・VM・Editor ビルド・起動フラグは要らない。既存 browser CI が環境変数の指定なし・skip なしで実行する。GPL-3.0-or-later と既存テスト用ライセンスを保持する。

Editor は VM の変更で表示されるマーカー、native title field の短い/長い名前の幅と隣接、保存メニューへの接続を残す。300px 幅での長いタイトルの確認も保持する。詳細11行（ヒント用 locator と空行を含む）を除き、ケース名を接続確認に合わせる。元のそれ以外の本文と、他38件・共通 fixture は内容不変。

依存順は workbench の CI 成功・マージ → Editor の縮小。ローカルは移管 browser case 1件・関連 file-menu 18件、workbench ビルド・対象型検査と Editor 型検査・責務境界2件を確認する。実 Editor の保持した browser case は今回再実行していない。元ファイルは通常 CI 対象外なので、この11行削減による通常 CI の時間短縮は見込まない。製品コード・依存固定・GUI・CI コマンドは変更しない。切り戻しは Editor の元11行とケース名を先に復元し、必要なら上流の追加テスト・文書を revert する。

## 呼び出し図の照合結果と検証分担

34番を Editor main `fbd709f3f4a50abb8c3071487bd46b953c165e34` の新しい固定ビルドで再現した。元ケースは図の内側の `Function calls` を見つけられず失敗した。現在のフィルターは active toolbar の `Functions` / `Messages`、方向ボタンは `Flow: Top to bottom (TD)`、矢印は `data-script-relation="function"` / `"message"`。メッセージの表示ラベルは SVG の `text` を対象に `💬 ready` と照合し、補足の `title` と分ける。

セレクターを更新した元の行列全体は実 Editor で成功した。sprite-panes の `relationGraph` が描画前に種類別の候補を絞るため、表示切替は正常に働いていた。sprite-panes `0.11.3` の製品 src 全16ファイルは固定版と一致し、製品修正や版更新は要らない。

詳細の4状態・hidden label・同じ図ノードでの更新・再マウント後の保持を、sprite-panes の既存 `test/sprite-function-pane.browser.ts` に2件追加する。既存の scanned message 形式と、Editor と同じ `scriptRelations` 形式を両方確認する。追加テストは sprite-panes の既存 MPL-2.0 fixture を拡張したもの。Editor の GPL の VM fixture は Editor に保持する。workbench の既存 `test/section-controls.test.ts` 2件が分割ペインと section 変更後の状態を検証しており、今回も成功を確認した。

Editor は初期の実グラフ、操作欄からの関数矢印の非表示・復元と VM JSON の内容不変、Hats and functions / Calls の往復と方向変更、他 target の受信 script を開く接続を残す。表示行列・詳細の保持確認を除いて77行から68行へ縮小し、ケース名を接続確認の役割に合わせた。他38件と共通 fixture は内容不変。

検証は sprite-panes のビルド・追加2件を含む図の関連 browser 11件、workbench の既存2件、Editor 型検査・責務境界2件と実 Editor の対象ケース1件。Editor の対象は元の行列の DOM 修正後と縮小後の両方をヘッドレスで実行し、fail/skip 0 だった。Editor `fbd709f`・GUI `14477c5`・VM `f3d3811`・Packager `d690225` を完成済み build-info と照合した。

依存順は sprite-panes の追加テストの CI 成功・マージ → Editor の縮小。製品コード・依存固定・GUI・起動フラグ・CI コマンドは変更しない。元 browser ファイルは通常 CI の対象外のため、この縮小による通常 CI の時間短縮は見込まない。切り戻しは Editor の元ケースの確認範囲を先に戻す。旧 DOM セレクターには戻さず、必要なら上流の追加テストと文書を revert する。

## divider の grip と keyboard 詳細の切り出し

3番の grip の縦横寸法・radial-gradient、keyboard の16px移動と行の最小値・Enter 復元を、workbench の `test/editor-splitter-details.browser.ts` の2件へ移す。元の期待値を保持し、host のアクセント変更と両軸の Home/End 境界・Enter 復元も検証する。既存の公開 `createLayout`・`editor.css` を使う example と browser host を再利用し、既存5件の本文は内容不変で host だけを共通ファイルへ抽出する。example の任意 `stageHeight` query は復元点を最小値より大きくするための設定で、従来の既定180pxは保持する。GPL-3.0-or-later と既存のテスト用ライセンスを保持し、既存 browser CI が GUI checkout・VM・Editor ビルド・環境変数なしで実行する。

Editor は元の操作と前提を保持し、使わなくなった grip helper と詳細の assertion だけ計13行を除く。GUI の Accent 設定から divider への反映、pointer/keyboard resize から Blockly への反映、stage の縦横比と入力、block drag/scroll/undo/redo、Costumes/Code の往復、SB3 の保存・再読込と splitter 無効時の確認を残す。残る38件と共通 fixture は内容不変。

調査開始時の Editor main `8f530447f30ca4d40ad54e5560678e05d2aa4399` の完成済み固定ビルドで元ケースを実行すると、従来レイアウト `twPlusStandardLayout=0` に存在しない Plus 専用の「Save a Copy」を探して失敗した。実際の File メニューの「Save to your computer」に保存操作を合わせると、詳細削減前の全検証と削減後のケースの両方が、実ダウンロード・ZIP 内容・再読込まで成功した。保存処理・成果物・共通 route は変更していない。GUI `14477c5`・VM `f3d3811`・Packager `d690225` と Editor revision を `build-info.json` に照合した。

公開前に main が `cd135d8a668a5843d59ed84707419e20c4f7d630`（#818）へ進んだため、承認済み差分を内容不変で rebase した。GUI `60b87e2`・VM `88a2c06`・Packager `d690225` で build/build:pages を再実行し、完成済み build-info の site revision `486e790221da09e5f78849066fd059234e833e57` と照合した。新しい固定ビルドでも削減前の全検証と削減後の対象ケースはそれぞれ1 pass / fail・skip 0だった。後続の文書追記だけでは成果物を再ビルドしない。

ローカル検証は workbench ビルド、新2件と既存5件の browser テスト、追加ファイルの型検査、Editor 型検査と責務境界2件、実 Editor の対象1件。workbench 製品 src 85ファイルは Editor 固定0.39.0と一致し、npm archive 230ファイルにテスト・helper・テスト用ライセンス・node_modules が含まれないことを確認した。

依存順と DoD は workbench の push・PR・既存 CI 成功・Squash Merge → Editor の縮小を公開・既存 CI 成功・Squash Merge → 作業環境整理・#741への記録。製品コード・依存固定・GUI・起動フラグ・CI コマンドは変更しない。この browser ファイルは通常 CI の対象外なので、この13行削減による通常 CI の時間短縮は見込まない。#741全体の CI 所要時間比較は未実施。切り戻しは Editor の詳細13行を先に復元し、必要なら workbench の追加テスト・host 抽出・example 設定・文書を revert する。従来レイアウトに合わせた保存操作は保持する。

## 変数テーブルとリスト編集の詳細の切り出し

29番の種類アイコン・リストプレビュー・参照数の表示と並べ替え、編集ボタンのhover・list dialogの背景・キャンセル・項目の移動/削除/追加とフォーカスを、sprite-panes の `test/editor-variable-details.browser.ts` の2件へ移す。元の操作と期待値を保持し、単独hostが渡す `onWrite` についてキャンセル時0回、保存時1回と数値/文字列の配列も確認する。公開 `SpriteAssetPane`・`sprite-asset-pane.css` を使い、既存のasset pane browser hostだけを共通化する。既存2件の本文とHTMLは内容不変。移管テストのGPL-3.0-or-laterとテスト用ライセンス、抽出hostのMPL-2.0を保持する。

Editorは112行から78行へ縮小し、実VMのリスト読み取り/変更blockからの参照数、編集配列の保存、cloneだけの変更とoriginalの内容不変、stageのglobal list更新とmonitorのon/offを保持する。他38件と共通fixtureは内容不変。製品・依存固定・GUI・起動フラグ・CIコマンドは変更しない。

開始時のリモートmainは `07ce8cb8c6f2e57d8f218b3fe507ad6ddbdcb38f`。完成済みビルドのsite revision `486e790221da09e5f78849066fd059234e833e57` との差分は文書2ファイルだけで、製品とテストの入力は一致している。そのためビルドを再利用し、実際のsite revisionを `E2E_EXPECT_SITE_REVISION` に指定して元ケースと縮小後のケースをそれぞれheadless実行した。両方1 pass / fail・skip 0。GUI `60b87e2`・VM `88a2c06`・Packager `d690225` と完成済みbuild-infoも照合済み。main自体から新しくビルドした結果とは区別する。

移管先ではビルド、新2件と既存2件のbrowserテスト（4 pass / fail・skip 0）、追加test/helperの型検査を実行した。Editorの型検査・責務境界2件も成功。sprite-panes製品ソース16ファイルはEditor固定0.11.3と一致し、npm archive 47ファイルにtest/helper/テスト用ライセンス/node_modulesが含まれないことを確認した。

依存順とDoDは sprite-panes の公開・既存browser CIで新2件をskipなしに成功・Squash Merge → Editorの縮小を公開・CI成功・Squash Merge → 作業環境整理・#741への記録。元browserファイルは通常CI対象外のため、この34行削減による通常CI時間短縮は見込まない。#741全体の時間比較は未実施。切り戻しはEditorの元112行とケース名を先に復元し、必要なら上流の追加テスト・host抽出・テスト用ライセンス・文書をrevertする。

## クローン切替のページング詳細の切り出し

31番の0/5/6体での表示切替、8体までの追加での選択保持、前/次の移動と端の無効化、矢印の丸形・枠・SVG寸法・幅と間隔、削除後のID保持と番号更新・選択消滅時の復帰をsprite-panesの `test/editor-clone-pagination.browser.ts` 2件へ切り出す。停止と再生成も単独hostで確認する。公開 `SpriteCloneInspector`・`SpriteClonePagination`・`sprite-editor-toolbar.css` を使い、hostはtargetのデータとlifecycle通知だけを渡す。元のpagination期待値とgeometryを保持し、型検査のためbounding boxの存在確認を補う。GPL-3.0-or-laterと既存のテスト用ライセンスを保持し、既存browser4件とunit4件の本文は内容不変。

元ケースはmonitorの旧アクセシブル名「元のスプライトの「体力」をステージに表示」を探して失敗した。現行DOMの「元のスプライトの「体力」を実行画面（ステージ）に表示」に更新すると、詳細削減前の136行全体が成功した。製品は修正しない。Editorは136行から115行へ縮小し、実VMのcloneを選んだ際の属性/値の編集、全cloneへの定義追加、monitor、実行中だけの変更、別cloneの消滅後の値保持、選択cloneの消滅時の元への復帰、停止を保持する。他38件と共通fixtureは内容不変。

開始時のリモートmainは `56d8a419ea98b6f3926c0c3d82fde9653625fc0b`。完成済み固定ビルドのsite revision `486e790221da09e5f78849066fd059234e833e57` との差分は文書と他ケースのテスト整理だけで、製品入力・対象元ケース・共通fixtureは一致している。そのためビルドを再利用し、実際のsite revisionを期待値に指定した。GUI `60b87e2`・VM `88a2c06`・Packager `d690225` とbuild-infoを照合し、名称修正後の元ケースと縮小後をheadlessで各1 pass / fail・skip 0と確認した。main自体から新しくビルドした結果とは区別する。

移管先はビルド、追加2件+既存4件のbrowser6件、関連unit4件、対象test/helperの型検査が成功した。Editor型検査・責務境界2件も成功。sprite-panes製品ソース16ファイルは固定0.11.3と一致し、npm archive47ファイルにtest/helper/テスト用ライセンス/node_modulesが含まれないことを確認した。

依存順とDoDはsprite-panesの公開・既存browser CIで新2件をskipなしに実行/成功・Squash Merge → Editorの縮小を公開・CI成功・Squash Merge → 作業環境整理・#741への記録。製品・依存固定・GUI・起動フラグ・CI設定は変更しない。元browserファイルは通常CI対象外なので、この21行削減による通常CI時間短縮は見込まない。#741全体の時間比較は未実施。切り戻しはEditorの元の確認範囲とケース名を先に復元し、monitorの現行アクセシブル名は保持する。必要なら上流の追加テスト・hostの2経路・文書をrevertする。

## ステージ引き出しのgeometryの切り出し

17番の操作部からdragしないこと、9か所の周辺位置、resize可能な辺、40pxのresizeと反対側の角の保持、viewport変更後の位置、右/下/上の折り畳んだ取っ手の寸法・向きを、workbenchの `test/editor-stage-drawer-geometry.browser.ts` 1件へ移す。元のgeometry操作・期待値は、hostのcloseボタン・bounding boxの存在確認・型注釈に適応した上で内容不変と照合した。GPL-3.0-or-laterと既存のテスト用ライセンスを保持する。

単独hostは公開 `createStandardLayout` が返す `EdgeDrawer`、`stage-surface` の `StageResizeHandle` と `editor.css` を使う。GUI rendererの代わりにnative canvasを渡し、寸法とopen/position stateを公開portで接続する。既存esbuildで公開entryをメモリ内にbundleする。製品のdrag/resize/折り畳み処理・CSSは複製しない。既存browser command/CIがGUI checkout・VM・Editorビルド・環境変数なしで実行する。

Editorは149行から66行へ縮小し、実run-viewの表示menu、実canvasとpaletteの併存、dragと40px resizeから実canvasへの接続、閉じる/取っ手からの再表示を保持する。元ケースと縮小後はいずれもheadlessで1 pass / fail・skip 0。他38件と共通fixtureは内容不変。

開始時のリモートmainは `d17cb8e0aeb8ca38c7faf6a65cb1e89f1e3e9482`。完成済み固定ビルドのsite revision `486e790221da09e5f78849066fd059234e833e57` との差分は文書と他ケースのテスト整理だけで、製品入力・対象元ケース・共通fixtureは一致している。そのため実site revisionを期待値に指定してビルドを再利用した。GUI `60b87e2`・VM `88a2c06`・Packager `d690225` とbuild-infoを照合し、main自体の新規ビルドとは区別する。

workbenchのビルド、新1件+関連既存5件のbrowser6件、対象型検査、Editor型検査・責務境界2件が成功。workbench製品ソース85ファイルは固定0.39.0と一致し、npm archive230ファイルにtest/テスト用ライセンス/node_modulesが含まれないことを確認した。

依存順とDoDはworkbenchの公開・既存browser CIで新1件をskipなしに実行/成功・Squash Merge → Editorの縮小を公開・CI成功・Squash Merge → 作業環境整理・#741への記録。製品・依存固定・GUI・起動フラグ・CI設定は変更しない。元browserファイルは通常CI対象外なので、この83行削減による通常CI時間短縮は見込まない。#741全体の時間比較は未実施。切り戻しはEditorの元149行とケース名の復元を先に行い、必要なら上流の追加テストと文書をrevertする。


## 変数作成ダイアログの詳細の切り出し（#823）

28番の見た目、ローカルのリストタブのキー操作、グローバルのエラー表示とクラウド選択の初期化を、sprite-panes の `test/editor-variable-dialogs.browser.ts` の2件で検証する。GPL-3.0-or-later と既存のテスト用ライセンスを保持し、公開 Windows 0.2.3 の CSS はテスト専用依存とする。リストの種類アイコンは上流の既存 `editor-variable-details.browser.ts` でも確認する。

Editor は現行のモニター名・ステージ説明を使い、対象切り替え、ローカル・グローバル・クラウド変数とリストの作成、重複エラー、実 VM の定義とモニターの結線を残す。207行から175行に縮小し、他38件と共通 fixture、製品コード・GUI・Editor の固定依存・通常 CI 設定は変えない。所有対象・種類・cloud 状態の表示行列の分類は別途残る。

引き継ぎ時、両 repo の main が作業ベース（Editor `6e8767a`、sprite-panes `1ce1abd`）と一致することを照合。上流の build と関連ブラウザーテスト6件、Editor の固定ビルド（site `6e8767a`）の縮小後ケース1件、型検査・責務境界2件をローカルで再確認した。公開 CI ではまだ検証していない。元 browser ファイルは通常 CI 対象外で、この差分による通常 CI 時間短縮は計上しない。

上流の既存 CI で新2件の実行・成功（skip なし）を確認してから上流をマージし、その後 Editor 側を公開・検証する。切り戻す場合はまず Editor の元の検証範囲とケース名を復元し、現行 DOM に合わせた名称は維持する。必要なら上流の追加テスト・テスト専用依存を戻す。
