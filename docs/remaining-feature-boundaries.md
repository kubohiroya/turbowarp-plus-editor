# 残存していた機能実装の責務移管

この文書は `6d2c73199de2b9ff76e27c516f7d2354605a9ed8`（Editor main #874）を基点とする**未公開のローカル修正**の記録です。以前の移管記録の「結線だけ」という記載では、画面文言をimportしている矢印関数の制御やHTMLのUIを見落としていました。今回は以下の実装とその検証を所有者へ移します。

| 既存パッケージ | 新しい公開口 | 所有する実装 |
| --- | --- | --- |
| turbowarp-extension-loader | packager-page / packager-handoff / catalog-trust | HTML出力の画面・文言・CSS・状態・転送、カタログのキャッシュと照合 |
| turbowarp-plus-editor-project-folder | snapshot-workflows | 展開後の作品確認、欠落ファイル確認、作品フォルダの作成・コピー |
| turbowarp-plus-editor-git | save-commit-workflows | 保存コミットのキューとジャーナル、作品/リポジトリのガード、公開セッション、Gitフォルダ判定 |
| turbowarp-plus-editor-workbench | project-folder-integration | タイトル・タブ・未保存ファイルとフォルダ/Gitの調整、VM単位の接続と破棄 |
| turbowarp-plus-editor-test | editor-host / frame-host | スナップショット、テスト対象の照合、iframeと別窓の実行、拡張の実行方針、検証済みURLの寿命 |

Editorの対象7ファイルは、配布URL、カタログと制限値、共有するVM/Renderer/Packager、既存GUIのRedux/Desktop preloadから読む値とコールバックを渡します。GUIの固定コミット `60b87e2f2503206847f509285aa4de3cee3670c7` とVMの `88a2c06e9deb3dd652c52c20daf4f728b387d41d` を変えず、GUIのソース差分はありません。既存のパッケージだけを使用し、Editor内のworkspaceパッケージは作りません。既定値やファイル形式は維持します。

## 由来とライセンス

元ファイル追加の著者をgit logで確認しました（`9e26481`、`5be9371`、`5726276`、`aa4f4b3`、いずれもHiroya Kubo）。著作権者の「自分が権利を保有し、MPL-2.0での提供を認める」という確認をPlus独自部分に適用し、各上流の `EDITOR-MIGRATION.md` とソースのSPDXに記録します。本家GUIのコンポーネントやReduxを上流へコピーしません。GPLのPackagerは実体をEditorから渡し、実行パッケージはimportしません。

## 境界検査

`config/site-ownership.json` で `site/` 全ファイルを棚卸しし、新しいhelperファイルによる検査の迂回を検出します。今回の6つの機能ファサードは、従来のclass/Map/Set/JSX検査に加え、矢印関数の中も含むlet/var・代入・ループ・async制御・DOM操作・コレクションによる照合・JSON/crypto処理を検出します。HTML出力のshellはUI要素・文言・CSS・inline scriptを持てません。

nativeの値の読み取り、引数の投影、subscribe/dispatch、共有コンストラクターの生成は接続として許可します。棚卸しのnative-gui-adapter分類は、既存のGUI内部依存やGPL由来のアダプターを含みます。構文検査だけで全ファイルの責務を証明するものではなく、変更時の所有者レビューも必要です。過去の26ファイルの検査を消したり、公開版・ライセンス・完全固定の検査を緩めたりしません。

## Issue草案と依存順

関連の過去タスクは [#741](https://github.com/kubohiroya/turbowarp-plus-editor/issues/741) と [#823](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823) です。いずれも完了済みのため、本件を完了扱いで追記しません。公開前にこの節を新しいIssueの草案として登録し、Assigneeと各PRのリンクを集約します。今回の「進めて」はローカル修正として扱い、新しいIssue投稿・push・PR・merge・npm公開は行っていません。

Issue題名案: `refactor(editor): 残存するHTML出力・作品フォルダ/Git・テスト実行の実装を所有パッケージへ移す`

- Doing: `refactor/editor/remaining-feature-boundaries`。上流ソース・結線・境界検査・限定検証をローカルで用意する。
- ToDo: Loader、Project Folder、Git、Testをそれぞれレビュー・版更新・公開する。この4件は独立して進められる。
- ToDo: WorkbenchのGit/Project Folderへの依存と最低対応版を公開版に更新し、レビュー・公開する。前の2件の公開に依存する。
- ToDo: Editorの依存とlockfileを公開された5パッケージの完全版・integrityへ更新する。配信ビルド・変更範囲の統合検証後、PRをマージする。
- Done条件: 上流の実装とテストが公開され、Editorがその版を固定し、既存の本番ゲートを通過していること。ローカル移管だけでは公開完了としない。

### 受け入れ条件

- [x] 上記のUI・照合・状態・更新処理を所有パッケージへ移す。
- [x] GUI/VMの固定と既存接続口、既定値、保存形式を維持する。
- [x] 取消・作品切替・転送元/宛先・ダイジェスト不一致・破棄の検証を所有者へ置く。
- [x] Editorの境界検査で旧来の見落としを再現し、拒否する。
- [ ] 上流の版更新・PR・npm公開を確認する。
- [ ] Editorの公開版固定と配信ビルドを確認する。

### ロールバック

上流は追加APIで既存consumerを維持します。配信切替の後で戻すときは、Editorのアダプターと依存の固定を本件導入前の組にまとめて戻します。SB3・フォルダ・キャッシュの形式変更はありません。既定OFFの新フラグは作らず、現行の既定値を継続します。

### 運用ログ

- start: 最新mainと既存APIを確認し、利用中のブランチと未追跡の `docs/tutorial-mode/` を避けて専用worktreeを作成。
- done: 所有者5件へのローカル移管とEditorの結線、境界検査を実装。
- blocked（解消）: GUI/パッケージ依存の不足を専用複製への導入で解消。通常sandboxが拒否したChromium起動は、headless・実入力なしの許可された実行で検証。
- blocked（解消）: ローカルsymlinkのパスを前提としない既存runtimeビルド検査に合わせ、検証用packを正規のパッケージbasenameへ展開。既存テストや本番ゲートは変更しない。

## ローカル候補の検証方法

上流複製は作業ツリーの `.host/upstream/{loader,project-folder,git,workbench,test}` に独立して保持します。上流のビルドとテストは各複製で実行します。WorkbenchにはGit/Project Folderのローカル候補を使用します。

Editorは `.host/refresh-candidates.py` で各所有者の `npm pack --ignore-scripts` をignoredディレクトリに展開し、独立した作業ツリーのnode_modulesだけに接続して検証します。アーカイブを追跡したり、package.json/package-lock.jsonのnpm完全版・integrityを偽造したりしません。**このブランチの新APIはまだnpmに存在しないため、クリーンなnpm ciだけで公開用ビルドを作れる段階ではありません。** 公開後は上の依存順で正式に固定します。

検証結果は以下へ追記します。安定版の全体検証や配信済み成果物の検証とは区別します。

| 対象 | 結果 |
| --- | --- |
| 上流5パッケージ | 正式なbuildスクリプト成功（宣言の生成とWorkbenchのexample型検査を含む） |
| Loader | src/testの型検査成功。catalog-trust / handoff / page / 既存Plus Packagerの18件成功。画面テストはJSDOM、出力生成は実際のTurboWarp Packagerを使用 |
| Project Folder | スナップショットの取消・警告・コピー・実エラー伝播の4件成功 |
| Git | 保存コミットと既存の公開セッションの12件成功 |
| Test | frameの既存プロトコル、Editor側の接続・スナップショット・iframe破棄、実行方針とlegacy URL破棄の15件成功 |
| Workbench | headless Chromiumで、native portからのフォルダ接続、旧VM拒否、workflowの公開と破棄の1件成功 |
| Editor | 型検査成功。固定GUIとのPackagerプロトコル・実拡張ホストのキャッシュ結合12件、責務境界6件成功 |

計68件（単体・結合・DOM 67件、headless Chromium 1件）。公開されたnpmパッケージのみを使う配信ビルド、配信済み成果物のE2Eは未実施です。上流が未公開のため、公開版の固定完了後に確認します。Desktopの実ウィンドウやOSの入力は使用していません。

今回のEditor側の対象7ファイルは1,283行から191行へ減らしました。行数は補助情報で、責務の判定は上の所有APIと接続内容に基づきます。
