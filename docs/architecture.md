# TurboWarp-Plus-Editorの責務と配信

本リポジトリは、kubohiroyaのscratch-guiフォークに上流ライブラリを組み込んだEditorの統合・検証・GitHub Pages配信を所有します。名称は **TurboWarp-Plus-Editor** で統一します。

## 依存方向

- `turbowarp-extension-data-editor` は編集API・フォーム・互換配布物を提供します。
- `turbowarp-extension-security-dialog` は拡張の情報解析と確認UIを提供します。
- `scratch-gui` フォークは両ライブラリを使うGUI接続を所有します。
- `turbowarp-plus-editor` はGUIを固定ソースからビルドし、案内画面・ブランド・編集ボタン・統合E2Eと配信を所有します。

上流ライブラリは本リポジトリやGUIを取得・ビルド・配信しません。GUIの内部コードをここでパッチせず、公開用webpack設定はGUIが提供するブラウザー構成だけを選択します。

## 固定ソースと成果物

`site/source.json` はGUI/coreの40桁SHA、coreとセキュリティUIのnpm完全版を持ちます。CIとローカル検証はGUIの固定lock導入後に `E2E_GUI_ROOT=<checkout> node scripts/site/prepare-core.mjs` を明示実行する。rootの固定lockで導入したcore配布物だけを隔離GUIへコピーする。依存・peer宣言の同一性、版・revision・内容SHAを検証し、GUIの他の依存とmanifest/lockを保持する。ビルド前にGUI checkout、インストールされたcoreのbuild-info、GUIが宣言するsecurity完全版と実際のインストール版を照合します。

`build-info.json` の `revision` はGUI、`coreRevision` はdata-editor製品ソース、`coreVersion` は実際に導入した完全版、`siteRevision` は本サイトのソースです。`securityPackage` / `securityVersion` も記録します。製品の版とテストrunnerの版は区別し、配信された値を期待値へ自己採用しません。

出力はGUI checkoutの `build/` です。`ROOT=/turbowarp-plus-editor/` に固定し、GUIのplayerを `player.html` に保持します。`editor.html`、ブロック編集サンプル、拡張セキュリティUI、GUIのLICENSEを同梱します。入口は `index.html`、共有資産は `assets/icon.svg` と `assets/edit-button.css` です。

## CIとPages

1. 通常CIがnpmの単体テスト、統合基盤、固定GUIの接続テスト、ビルド、移管したGUI E2Eを実行します。
2. 全件成功後だけ `editor-site-<site SHA>-<attempt>` を保存します。失敗時のレポートは別artifactに保存します。
3. mainのpush CI成功を受けたPages workflowが、そのmainの最新性と同一SHAの通常CI全体の最新attempt成功を照合します。
4. 検証済みCI run/attemptのartifactを取得してGUI/core/site/securityの各識別子と必須ファイルを照合し、再ビルドせず配信します。
5. deploy直前にもmain鮮度とCI結果を確認します。成功後に新サイトを対象に同じE2Eを実行します。

PRやfork、失敗CI、古いmain、API確認不能、未完了/失敗した最新attemptは配信しません。Pagesのwrite権限とOIDCはdeploy jobに限定します。失敗をskipや無条件retryで成功扱いにしません。

通常E2Eは19件です。実SB3の保存/再読込の2経路、明暗テーマ、セキュリティ確認10件、プレビュー再読込、案内画面のボタンとフォームの遷移2件を含みます。CIと公開後検証は固定入力profileの5件も含めて24件を実行します。macOSのOSファイル選択は対話可能なMacで手動実行する別経路です。Linux CIの成功でOSファイル選択の検証を代替しません。

案内画面の遷移2件は、案内HTML/CSS/JSを実配信から取得し、遷移先のEditor HTMLだけをfixtureへ差し替えてURLを確認します。Editorの機能自体は他の統合シナリオで実アプリを使って検証します。

## npm公開

npmパッケージはブランド資産・編集ボタン用のAPI・固定ソースの記録を提供します。GUIの巨大なビルド一式をnpmへ同梱せず、実行するEditorはGitHub Pagesで配信します。

`v<package version>` タグをmainに含まれるコミットへ付けると、release workflowが単体/基盤チェックと同じSHAの正常な統合CIを確認してからpackします。同一の検証済みアーカイブをGitHub Releaseとnpmへ公開し、既存版が異なるバイト列の場合は停止します。

npm Trusted Publisherは `kubohiroya/turbowarp-plus-editor` / `release.yml` / environment未指定を設定します。workflowはOIDCを使用し、npm tokenを保持しません。初回公開でTrusted Publisher設定を利用できない場合は、ユーザーがnpm CLIのWeb認証を行う手順が必要です。

## 移行・切戻し

新URLは `https://kubohiroya.github.io/turbowarp-plus-editor/`、Editorはその下の `editor.html` です。README、Docs、Samples、カタログからブランドアイコン付きの編集ボタンで参照します。作品URLを指定する場合は `project_url` と `lang` を引き継ぎます。

data-editorのPagesは提供を廃止します。workflowを消すだけでは旧ファイルが残るため、新サイトの公開確認後に旧PagesのUnpublishと設定無効化を実施します。旧URLへEditorやリダイレクトを残しません。

切戻しは本リポジトリの固定ソースと対応するGUI依存を直前の検証済み版へ戻し、通常CI経由で再配信します。上流ライブラリによるGUIの取得/配信を復活させず、公開済みnpm版を差し替えず、SB3の保存形式も変更しません。
