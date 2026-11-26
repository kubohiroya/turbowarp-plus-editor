# 残存していた機能実装の責務移管

Editor `6d2c73199de2b9ff76e27c516f7d2354605a9ed8` を調査元とし、残っていた画面・状態・照合・更新処理を既存の所有パッケージへ移します。作業状況、依存順、CI・公開結果の記録は [Issue #875](https://github.com/kubohiroya/turbowarp-plus-editor/issues/875) を単一の管理先とします。

## 所有者と公開API

| 既存パッケージ | 対応版・PR | 所有する実装 |
| --- | --- | --- |
| turbowarp-extension-loader | 0.16.3 / [#53](https://github.com/kubohiroya/turbowarp-extension-loader/pull/53) | packager-page / packager-handoff / catalog-trust: HTML出力の画面・文言・CSS・状態・生成・転送、カタログのキャッシュと照合 |
| turbowarp-plus-editor-project-folder | 0.22.3 / [#59](https://github.com/kubohiroya/turbowarp-plus-editor-project-folder/pull/59) | snapshot-workflows: 展開後の作品確認、欠落ファイル確認、フォルダの作成・コピー |
| turbowarp-plus-editor-git | 0.32.2 / [#90](https://github.com/kubohiroya/turbowarp-plus-editor-git/pull/90) | save-commit-workflows: 保存コミットのキューとジャーナル、作品/リポジトリのガード、公開セッション、Gitフォルダ判定 |
| turbowarp-plus-editor-workbench | 0.40.5 / [#167](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/167) | project-folder-integration: タイトル・タブ・未保存ファイルとフォルダ/Gitの調整、VM単位の接続と破棄 |
| turbowarp-plus-editor-test | 0.4.1 / [#6](https://github.com/kubohiroya/turbowarp-plus-editor-test/pull/6) | editor-host / frame-host: スナップショット、対象の照合、iframeと別窓の実行、拡張の実行方針、検証済みURLの寿命 |

Editorの対象7ファイルは配布URL、カタログと制限値、共有するVM/Renderer/Packager、GUIのRedux/Desktop preloadから読む値とコールバックを渡します。GUIの固定 `60b87e2f2503206847f509285aa4de3cee3670c7` とVMの `88a2c06e9deb3dd652c52c20daf4f728b387d41d` は変えず、GUIソースの差分はありません。新しいパッケージやEditor内のworkspaceパッケージ、既定OFFの新フラグは作りません。既定値と保存形式を維持します。

統合中にmainへ入ったProject Folderの画面状態保存とWorkbenchの外部更新APIは保持し、そのcallbackも分離先から渡します。WorkbenchはGit >=0.32.2 / Project Folder >=0.22.3を要求します。開発用の共有LoaderはEditorと同じnpm overrideで一つに固定し、npmの公開版4件と固定したTestコミットでクリーンインストールを確認します。

## 由来とライセンス

元ファイル追加の著者をgit logで確認しました（`9e26481`、`5be9371`、`5726276`、`aa4f4b3`、いずれもHiroya Kubo）。著作権者の「自分が権利を保有し、MPL-2.0での提供を認める」という確認をPlus独自部分に適用し、各上流の `EDITOR-MIGRATION.md` とソースのSPDXに記録します。本家GUIのコンポーネントやReduxは移しません。Packagerの実体はEditorから渡します。

## 境界検査

`config/site-ownership.json` で `site/` 全ファイルを棚卸しし、新しいhelperファイルによる検査の迂回を検出します。今回の6つの機能ファサードは、従来のclass/Map/Set/JSX検査に加え、矢印関数の中も含むlet/var・代入・ループ・async制御・DOM操作・コレクションによる照合・JSON/crypto処理を検出します。HTML出力のshellにはUI要素・文言・CSS・inline scriptを置きません。

nativeの読み取り、引数の投影、subscribe/dispatch、共有コンストラクターの生成は接続として許可します。native-gui-adapter分類には既存のGUI内部依存やGPL由来のアダプターを含みます。構文検査だけで全ファイルの責務を証明するものではなく、変更時の所有者レビューも必要です。過去の26ファイルの検査、本番用の配布元・ライセンス・完全固定を確認します。

## 検証と反映の条件

- 初期候補は上流5パッケージのbuild、LoaderとEditorの型検査、変更範囲の68件（単体・結合・DOM 67件、headless Chromium 1件）が成功。
- Loaderはクリーン状態での型検査と、Webpack 4向けの公開入口・配布契約2件も確認。
- 最新main統合後、Project Folderは画面状態保存を含む13件、Workbenchは画面状態13件とheadlessの接続・破棄1件を確認。
- 上流5件はCI成功後、最新base/headと公開差分を確認してSquash Merge。
- npmアーカイブはSHA-512、MPL-2.0、同梱srcとマージ済みソースの一致を照合する。
- EditorはLoader、Project Folder、Git、Workbenchを公開済みnpm版に固定する。Test 0.4.1はnpm公開が再開するまで、CIが成功したGitHubのマージコミット `d62812b77c6fb1d897705706fe82a4bf27349b7b` に一時固定する。クリーンインストールとビルド、変更範囲のヘッドレス結合、配信リビジョンとライセンス情報のソースを確認する。

Test 0.4.1のnpm公開後は、公式npmの配布物とGitソースの対応を確認し、依存指定とlockfileをnpmの `0.4.1` へ戻します。検証と配信の状況はIssue #875に記録します。

移管元を基準とする対象7ファイルは1,283行から191行へ減りました。行数は補助情報であり、責務は上の所有APIと接続内容に基づいて判断します。

## ロールバック

上流APIは追加で、既存consumerを維持します。配信切替後に戻すときは、Editorのアダプターと依存固定を導入前の組へまとめて戻します。SB3・フォルダ・キャッシュの形式変更はありません。
