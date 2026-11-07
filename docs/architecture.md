# TurboWarp-Plus-Editorの責務と配信

現在の配置は[GUI追加ファイルの全面移設](gui-integration/README.md)を参照してください。以下の旧パス・GUI側に残す判断は、各時点の履歴です。現在は本家に存在しなかったファイルをGUIからすべて撤去し、接続実装・文書・ツール・テストを本リポジトリが所有します。


本リポジトリは、kubohiroyaのscratch-guiフォークに上流ライブラリを組み込んだEditorの統合・検証・GitHub Pages配信を所有します。名称は **TurboWarp-Plus-Editor** で統一します。

## 依存方向

- `turbowarp-extension-data-editor` は編集API・フォーム・互換配布物を提供します。
- `turbowarp-extension-security-dialog` は拡張の情報解析と確認UIを提供します。
- `scratch-gui` フォークは両ライブラリを使うGUI接続を所有します。
- `turbowarp-plus-editor` はGUIを固定ソースからビルドし、案内画面・ブランド・編集ボタン・統合E2Eと配信を所有します。

上流ライブラリは本リポジトリやGUIを取得・ビルド・配信しません。GUIの内部コードをここでパッチせず、公開用webpack設定はGUIが提供するブラウザー構成だけを選択します。

この分担は、[turbowarp-plus-packagesの設計書](https://github.com/kubohiroya/turbowarp-plus-packages/blob/main/docs/editor-architecture.ja.md)に従って移行中です。移行後は、本リポジトリが独自拡張のパッケージに依存してビルド時にGUIへ差し込み、`scratch-gui` フォークは差し込み口だけを持ちます。

## 固定ソースと成果物

`site/source.json` はGUI/coreの40桁SHA、coreとセキュリティUIのnpm完全版を持ちます。coreはGUIの依存ではなくなったので、GUIのnode_modulesへ配布物を差し替える手順はありません。ビルド前にGUI checkoutと、本リポジトリが導入したcoreのbuild-info、security完全版と実際のインストール版を照合します。

セキュリティUIをGitソースで固定する場合は、`site/source.json` の任意の `securityRevision` に40桁SHAを指定します。GUIのmanifestとlockが同じリポジトリ・SHAを参照し、導入した版が `securityVersion` と一致することを確認します。省略した場合は従来のnpm完全版を使用します。

`build-info.json` の `revision` はGUI、`coreRevision` はdata-editor製品ソース、`coreVersion` は実際に導入した完全版、`siteRevision` は本サイトのソースです。`securityPackage` / `securityVersion` と、指定した場合の `securityRevision` も記録し、配信gateと公開E2Eで固定値と照合します。製品の版とテストrunnerの版は区別し、配信された値を期待値へ自己採用しません。

出力はGUI checkoutの `build/` です。`ROOT=/turbowarp-plus-editor/` に固定し、GUIのplayerを `player.html` に保持します。`editor.html`、ブロック編集サンプル、拡張セキュリティUI、GUIのLICENSEを同梱します。入口は `index.html`、共有資産は `assets/icon.svg` と `assets/edit-button.css` です。

## 実験で起動する Editor の版

最新版の実験では開始時にリモート `main` を解決し、その SHA の checkout と固定依存で成果物を用意します。過去版を再現する場合は、対象の完全な SHA を指定して結果を区別します。

```sh
expected=$(git ls-remote --exit-code https://github.com/kubohiroya/turbowarp-plus-editor.git refs/heads/main | cut -f1)
test -n "$expected" || exit 1
export E2E_EXPECT_SITE_REVISION="$expected"
```

Web の実験ランナーは、実際に配信する `build-info.json` の `siteRevision` をブラウザー起動前に照合します。CI は同じ変数に PR のマージ候補、`main` の対象コミット、またはリリースの対象 SHA を設定します。ビルドパスや配信 URL が以前と同じでも、期待 SHA が一致しなければ停止します。

Desktop の公式アプリに Plus を組み込む試験用コピーでは、`test/stage3/check-desktop.ts` が `.app` の ASAR にある `gui/build-info.json` の `editorRevision` を照合します。Plus Desktop の製品パッケージは、同じ期待値で `node scripts/desktop/check-editor-revision.ts /absolute/path/to/TurboWarp-Plus.app` を実行すると、`plus-gui` に同梱された版を起動前に検証できます。公式 Desktop を使う D3 作品プロセス CI の結果は別に扱います。

## CIとPages

1. 通常CIがnpmの単体テスト、統合基盤、固定GUIの接続テスト、ビルド、移管したGUI E2Eを実行します。CIではブラウザーE2Eを3並列で実行します（`E2E_WORKERS` で変更でき、ローカルの既定は直列）。
   - mainのpush CIでは、同じソースツリーをPRのCIがすでに全件成功させていれば、ブラウザーE2EとYAMLの往復テストを繰り返しません。PRのCIは成功したツリーを `ci-verified-tree-<tree SHA>` という名前のartifactで残し、mainはこの名前で、このリポジトリのPRのCI runが成功していることを確かめます。確かめられないとき（マージ中にbaseが進んだ、artifactの期限切れ、forkのPR、APIエラーなど）は全件を実行します。配信物はmain自身のSHAで記録するため、ビルドは毎回行います。
2. 全件成功後だけ `editor-site-<site SHA>-<attempt>` を保存します。失敗時のレポートは別artifactに保存します。
3. mainのpush CI成功を受けたPages workflowが、そのmainの最新性と同一SHAの通常CI全体の最新attempt成功を照合します。
4. 検証済みCI run/attemptのartifactを取得してGUI/core/site/securityの各識別子と必須ファイルを照合し、再ビルドせず配信します。
5. deploy直前にもmain鮮度とCI結果を確認します。成功後に新サイトを対象に、要点のE2E 7件を実行します。対象は、固定した識別子の照合（各テストが `build-info.json` を確認）、案内画面2件、作品の保存と再読込2件、拡張の確認画面の日英2件、カタログからの4形式の読み込みと単一HTMLの1件です。同じコミットは配信前にCIで全件を通っています。

PRやfork、失敗CI、古いmain、API確認不能、未完了/失敗した最新attemptは配信しません。Pagesのwrite権限とOIDCはdeploy jobに限定します。失敗をskipや無条件retryで成功扱いにしません。

通常E2Eは19件です。実SB3の保存/再読込の2経路、明暗テーマ、セキュリティ確認10件、プレビュー再読込、案内画面のボタンとフォームの遷移2件を含みます。CIは固定入力profileの5件も含めて24件を実行します。macOSのOSファイル選択は対話可能なMacで手動実行する別経路です。Linux CIの成功でOSファイル選択の検証を代替しません。

案内画面の遷移2件は、案内HTML/CSS/JSを実配信から取得し、遷移先のEditor HTMLだけをfixtureへ差し替えてURLを確認します。Editorの機能自体は他の統合シナリオで実アプリを使って検証します。

### Pages デプロイがタイムアウトしたとき

公開 URL の `build-info.json` をキャッシュを避けて取得し、配信中の `siteRevision` を確認します。期待する SHA は `main` と成功した通常の push CI から決めます。対象がすでに配信されていれば、公開版の動作確認へ進みます。

```sh
curl -fsS -H 'Cache-Control: no-cache' \
  "https://kubohiroya.github.io/turbowarp-plus-editor/build-info.json?verify=$(date +%s)" \
  | jq -r .siteRevision
```

#### 保存するログと停止箇所

関連 Issue に、対象 SHA、タイムアウト時に配信されていた SHA、通常 CI と Pages の run・attempt・job の URL、成果物 ID、デプロイ ID を残します。タイムゾーン付きでデプロイ受理・タイムアウト・取消の時刻と、最後に返った状態または API エラーを記録します。

`Created deployment` より前の失敗は、CI、成果物の有無と出所、公開権限、API エラーを該当箇所から確認します。受理後に `syncing_files`、`finished_file_sync`、空欄などで止まった場合は、Pages API と GitHub Status を照合します。`finished_file_sync` はファイル同期の完了を示します。配信成功は `succeed` と公開 URL の両方で確認します。 [Pages API](https://docs.github.com/en/rest/pages/pages#get-a-github-pages-deployment) · [GitHub Status](https://www.githubstatus.com/)

#### 再実行の条件と打ち切り

対象が最新 `main` で、その SHA の通常の push CI が成功し、前回の配信が終了していて、競合する配信が進行していない場合に、失敗した公開処理の再実行を1回試します。権限や成果物のエラーがあれば先に解消します。同じ SHA で再発したら再実行を打ち切ります。`deploy-pages@v4` は `GITHUB_SHA` をビルドバージョンに使います。同じ SHA の手動実行で新しい成果物 ID が割り当てられても、ビルドバージョンはその SHA です。v4 の待機上限は10分です。 [ビルドバージョンの実装](https://github.com/actions/deploy-pages/blob/v4/src/internal/context.js) · [タイムアウトの実装](https://github.com/actions/deploy-pages/blob/v4/src/internal/deployment.js)

対象の修正を含む後続コミットが `main` にあれば、差分を確認し、その SHA の通常 CI と自動公開を追います。新しい公開がすでに進行中の場合も、その結果を待ちます。後続の公開候補がない場合や別の SHA でも再発する場合は、配信中の版を維持し、記録したログと ID を添えて Pages 側の調査に引き継ぎます。`d14d065` の3回の失敗と `f59f954` での復旧は Issue #177 に記録しています。Pages 内部の原因は未確定です。 [復旧時の記録](https://github.com/kubohiroya/turbowarp-plus-editor/issues/177#issuecomment-6702835809)

#### 公開版での復旧確認

配信と公開後検証の結果を確認し、公開 URL の `siteRevision` が対象 SHA または修正を含むと照合済みの後続 SHA に一致することを確かめます。公開 Editor をヘッドレス Chromium で開き、変更箇所を操作します。Dockview のコードパネルの場合は、左右をタブクリックと Enter キーで切り替えます。選択中だけにパレットとズームボタンが出ること、両パネルに半透明の衣装サムネイルとミニマップが出ること、衣装が各スプライトに対応することを確認します。パネルの位置と大きさ、ズームインの動作も確認し、配信 SHA と結果を関連 Issue に残します。 [公開 Editor](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html)

公開後に機能の回帰が見つかった場合は、問題の差分を取り消す変更を通常 CI と公開ゲートに通し、同じ手順で切り戻しを確認します。

## npm公開

npmパッケージはブランド資産・編集ボタン用のAPI・固定ソースの記録を提供します。GUIの巨大なビルド一式をnpmへ同梱せず、実行するEditorはGitHub Pagesで配信します。

`v<package version>` タグをmainに含まれるコミットへ付けると、release workflowが単体/基盤チェックと同じSHAの正常な統合CIを確認してからpackします。同一の検証済みアーカイブをGitHub Releaseとnpmへ公開し、既存版が異なるバイト列の場合は停止します。

npm Trusted Publisherは `kubohiroya/turbowarp-plus-editor` / `release.yml` / environment未指定を設定します。workflowはOIDCを使用し、npm tokenを保持しません。初回公開でTrusted Publisher設定を利用できない場合は、ユーザーがnpm CLIのWeb認証を行う手順が必要です。

## 移行・切戻し

新URLは `https://kubohiroya.github.io/turbowarp-plus-editor/`、Editorはその下の `editor.html` です。README、Docs、Samples、カタログからブランドアイコン付きの編集ボタンで参照します。作品URLを指定する場合は `project_url` と `lang` を引き継ぎます。

data-editorのPagesは提供を廃止します。workflowを消すだけでは旧ファイルが残るため、新サイトの公開確認後に旧PagesのUnpublishと設定無効化を実施します。旧URLへEditorやリダイレクトを残しません。

切戻しは本リポジトリの固定ソースと対応するGUI依存を直前の検証済み版へ戻し、通常CI経由で再配信します。上流ライブラリによるGUIの取得/配信を復活させず、公開済みnpm版を差し替えず、SB3の保存形式も変更しません。
