# #823 の最終結線候補と検証

**公開後の追記:** 本候補は[Editor #864](https://github.com/kubohiroya/turbowarp-plus-editor/pull/864)でSquash Mergeされ、main `70d4aefb6292b3ee2a9a7488aeb14bb6a804fbd6` の[CI](https://github.com/kubohiroya/turbowarp-plus-editor/actions/runs/45811987935)・[通常Pages配信](https://github.com/kubohiroya/turbowarp-plus-editor/actions/runs/45812344821)が成功した。公開固定値とLoader全体60件、移管後の最小化・最小runtime・Desktopの既存結果の扱いは[最終監査](issue-823-loader-final-audit.md)へ集約する。以下は公開前に実行した証拠として保持する。

2026-11-26、着手時のEditor mainは `4c2f291`。作業中にWebKit修正 #862と進捗修正 #863が公開されたため、`947017a7431370618ceb77c5122622c992a30ccc` に既にある進捗の結線・統合テストを保持した。本差分はカタログの依存解決、Security Dialogの正式固定、検証記録に限定する。WebKitの完了根拠は [既存記録](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823#issuecomment-7189266559) を保持する。以下はEditor側の公開前のローカル検証で、main・配信先の成功とは区別する。

## 最終の所有先と結線

| 対象 | 所有先・正式公開版 | Editorに残す接続 |
| --- | --- | --- |
| 別タブSB3の進捗 | Workbench 0.40.1、[既存 #162](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/162)、main `c9b683b` | #863の `setLoading` portと固定GUIの `loadingProject` modalへの結線をそのまま保持 |
| カタログのSVG | Security Dialog 0.14.2、[#113](https://github.com/kubohiroya/turbowarp-extension-security-dialog/pull/113)、main `989eb40` | ビルド補助のparser解決をEditor自身の依存へ向ける。変更不可の解析結果を新しい表示用entryへ写す処理は所有先に置く |
| 最小runtime | Test Runtime 0.3.3、[#5](https://github.com/kubohiroya/turbowarp-plus-editor-test-runtime/pull/5)、main `fb61d29` | 実Editorでも同じhost契約を確認。runtimeをEditorの機能実装として取り込まない |

Workbench #162が先に同じ版・対象を実装したため、こちらの重複候補 [#163](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/163) はマージしない。Editorは既存の接続口に合わせる。Scratch GUIの追跡ソースと固定コミット、新しいUI実装・文言・状態管理は変更しない。

Editorのmanifest/lockはSecurity Dialog 0.14.2とWorkbench 0.40.1の正規npm URL・SHA-512 integrityを固定した。Security Dialogに必要なManifest 0.8.0の解決とpeer情報だけを揃え、他の固定値を変えていない。クリーンな `npm ci --ignore-scripts` 後、インストールされた各88/239ファイルが公開tarballとバイト単位で一致した。Security DialogとRuntimeのnpm/GitHub Releaseアーカイブもそれぞれ同一だった。

## 正式依存の検証

通常成果物とローカルカタログプレビューは別のGUI checkoutへ出力した。最新main #863を保持した最終確認のsite revisionは両方とも `3ef36875a7749e95f9ec0c75e7279d82878e8aa0`、GUI `60b87e2f`、VM `88a2c06e`、Packager `d690225b`。ビルド後は文書だけを更新し、製品入力・対象テストは維持している。通常成果物のhost契約検証にはテスト用の観測接続 `TW_PLUS_TEST_EDITOR_HOST=1` を使った。プレビューの `localExtensionIntegration.published` はfalseで、ローカルカタログを通常の配布物へ混ぜない。

| 検証 | 結果 |
| --- | --- |
| Editorの型検査・関連境界 | 型検査成功。カタログ・責務境界8件成功、fail/skip 0 |
| 実受信タブ | 完了・取消2件成功、fail/skip 0。実VMの承認待ち、許可後の1回実行、表示解除、取消時のタブ終了、元タブの内容不変を確認 |
| 実Editorの共通host契約 | 1件成功、fail/skip 0 |
| ローカルカタログ | 正式依存の完成品で42件と埋め込みSVGを表示し、公開カタログへの通信は0件。実拡張の実行は伴わない |
| Security Dialog CI | PR `45807432453` は単体153件・browser28件成功、fail/skip 0。追加のimmutable entryの回帰も実行・成功。main・tag・Releaseも成功 |
| Workbench既存CI | main `45807751068` は単体262件・browser34件成功、既存8件skip。新しい日英2件の履歴・時刻・hover/focus・承認フェーズは実行・成功し、skipを根拠にしない。移管元GPL-3.0-or-laterを保持 |
| Runtime CI | PR `45807478118` はbuild3件・browser5件成功、fail/skip 0。main・Releaseも成功 |

#863で修正された既存2ケースをそのまま使い、実際の受信タブの解析・承認・完了／取消と元タブの内容不変を確認した。履歴や時刻の表示詳細はWorkbenchの実行済みテストへ委ねる。

## 最小runtimeの能力と保持する境界

GUI `60b87e2f`・VM `88a2c06e`、Blocks `4113c534`、renderer `655edeb5`、storage 2.0.0、SVG renderer 1.1.0を固定GUIのlockfileと照合した。GUIの画面・sandbox worker・OPFSの別タブ受け渡し・Desktopをこのruntimeで代替しない。進捗の詳細はWorkbench、実ファイル・承認とVMの結線はEditor、WebKitの保管/再開は実ブラウザー、配布HTMLの承認は実Electronで確認する。今回の残件のためにruntimeへGUIやworkerを持ち込む必要はなく、将来workerを使うテストを移す場合は別途能力と実行成功を確認する。

## Desktopの承認された1回の検証

既存TurboWarpプロセスがないことを確認し、専用の一時プロファイルで純正TurboWarp Desktop 1.17.1 / Electron 43.8.4を1回起動した。OSのマウス・キーボード操作は使わずCDPで操作し、終了後のプロセス不在を確認した。

純正EditorはSB3の埋め込みコードを自動実行せず、再保存時にPlus manifest・埋め込みJS・テスト用の未知フィールドを保持しなかった。同じ一時ウィンドウで配布HTMLを開くと、承認前の登録は0、明示承認後の実行は1回、reporterは42、外部HTTP(S)通信は0だった。これは配布HTMLのElectron検証で、純正DesktopのEditorにPlusが組み込まれたことを示すものではない。

使用HTMLのSHA-256は `9328dd23a03d4d15f673b0bdec45cebd11c2520e5923e7b82cd3af5b51628b36`。結果は `.host/issue-4-artifacts/desktop-result.json`（status: passed）。正式依存で生成し直したHTMLも同じSHA-256で、実機で検証した成果物とバイト一致したため、追加の起動は不要だった。

## DoDと切り戻し

上流CI・正式公開、Editorの正規固定と結線のCI・Squash Merge、main/通常Pagesの照合、必要な配信先境界の確認、cleanな作業環境整理、#823の完了記録と最終チェックを完了条件とする。既存の [各3回のCI実測](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823#issuecomment-7177184281) を保持し、今回のbrowser整理だけによる通常CI短縮を追加計上しない。

切り戻しはEditorの結線と依存固定を先に検証済みの組合せへ戻して再ビルドする。必要なら所有先の修正をrevertする。runtimeはGUIのpinsとVMのmanifest/lockを一緒に戻す。作品・Git履歴・OPFS保存データ・旧ジャーナルは削除しない。
