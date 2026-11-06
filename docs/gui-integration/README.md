# GUI追加ファイルの全面移設

2026-11-03の指示により、TurboWarp本家に存在しないファイルをscratch-guiフォークからすべて撤去し、実装・文書・確認ツール・テストをこのリポジトリへ移設した。#151 の方針に従い、その後に追加する GUI 側の接続契約テストは、用途とパスを記録して例外とする。

比較元は `TurboWarp/scratch-gui:3c017c528c853af3111df9641914704745c1fdf6`、移設前のGUIは `c24b587ec49b871e9cbdc7530d54635a521a5d6e`、公開時の受け側の基準は `121e1eae083d3abdedd03ae19a725eeb3bf95c04`。

## 配置と責務

32ファイルの旧パスと移設先は [relocation.json](relocation.json) に記録する。

| 移設前のGUI | 移設先・扱い |
| --- | --- |
| 追加した `src/lib/` の10ファイル | `site/gui-integration/lib/`。空の `tw-plus-integration.js` は既存の `site/plus-integration.ts` とGUIの任意getterに置換 |
| 追加した `src/containers/` の2ファイル | `site/gui-integration/containers/` |
| 追加したテスト・helperの15ファイル | `test/gui-integration/unit/` |
| ローカル確認ツール1ファイル | `scripts/local-security-preview.cts` |
| 文書4ファイル | `docs/gui-integration/` |

GUIのREADMEと `.gitignore` は本家相当へ戻した。テストrunnerと専用CI呼出しをGUIから撤去し、`jsdom` と関連lockエントリも受け側のdevDependencyへ移した。GUIの `package-lock.json` は引き続き保持し、本家との差はVM固定元に関する追加3行・削除3行だけとなった。

## ビルド時の接続

GUIには本家に既存の `src/addons/hooks.js` 内の `getHostIntegration()` と、そのgetterを使う既存ファイル内の呼出し箇所を残す。追加のモジュールパスをGUIからimportしない。

配信ビルドの `scripts/site/webpack.config.cts` はwebpackの `ProvidePlugin` で `__TW_GUI_HOST__` を `site/gui-integration/index.ts` に結び付ける。ランタイムglobalへの代入や起動順に依存しない。GUI単体では値が存在せず、getterは `null` を返す。追加のローダー・フォーム・プレビューVM等は設置されず、通常のGUIが起動する。

共有するReact、React DOM、Redux/Intl、VMとcentral dispatchは、配信ビルドが固定GUIの実体に解決する。GUIのModal・遅延ScratchBlocks・logger・Redux action creatorは呼出し時に渡す。受け側の接続モジュールがGUIのreducerやUIを直接importして初期化の循環を作らない。

機能の有効化条件・既存の起動時フラグ・保存形式は変更しない。独立プレビューVMのdispatch退避、VM単位のサービス同一性、workspaceの差替え・破棄、権限拒否時の初期状態への復帰と失敗表示も受け側の接続実装が保持する。

## 検証

- `test:gui-integration` は本家にない GUI ファイルが次の接続契約テストと完全に一致すること、削除したモジュールへの参照と runner が残っていないことを確認する。32ファイルの移設先の存在も照合する。
  - `test/sprite-properties-host.test.mjs` は #175 の任意接続口について、既存表示への復帰と選択が切り替わった後の古い編集の拒否を検証する。
- CIは固定GUIを用意し、比較元の本家コミットをfetchした後、GUIの標準unitと受け側の接続テストを実行する。
- GUI標準unit 33件、受け側の既存境界182件、移設分と配置監査54件が成功。受け側の型検査と変更GUIソースのeslintも成功。
- GUI単体と配信ホストの両方で、production設定のブラウザー6エントリーをビルド。ローカル検証ではminifyのみOFF。micro:bitの通常生成物は同一基準の既存インストールから使用した。
- 実Chromium 156で、GUI単体の起動と通常の拡張一覧、Plusカタログからの追加、フォームの取消・保存・再表示、独立プレビューVM作成、保存SB3を別ページで開いてフォームを再編集する経路が成功。未処理のブラウザー例外は0件。

ローカル確認には `E2E_GUI_ROOT=/absolute/path/to/scratch-gui npm run test:gui-integration` を使う。サーバーを実際にlistenする試験が含まれるため、127.0.0.1への接続が可能な環境で実行する。

指すcheckoutは `site/source.json` の `guiRevision` に一致していなければならない。GUIの実装を取り込んで動かす試験なので、数commit進んだcheckoutでは読み込む側のmoduleが改名されており、検証しているつもりの組合せが別物になる。食い違っていれば、両方のrevisionを挙げて1件で止まる。

## 結果と受け入れ基準

- [x] 移設時点で本家に存在しない GUI の追跡ファイルは32件から0件になった。以降は上記の接続契約テストを監査で管理する。
- [x] 文書・ツール・専用テスト・接続実装の所有先が受け側に統一されている。
- [x] GUI単体と配信ビルドの両方が起動する。
- [x] 機能とSB3の互換を対象テストと実ブラウザーで確認した。
- [x] 移設したテストが受け側のrunner・CIから実行される。
- [x] 旧GUI・旧ホストの組合せへ戻す手順を記録した。

本家との直接差分は、68ファイル・追加3,080/削除53行から、34ファイル・追加636/削除55行へ縮小した。残る34ファイルはすべて本家にも存在するファイルの変更であり、追加ファイルを別名で残していない。

## 統合順とロールバック

GUIの撤去コミット `b4a575aad956147de1db416b89ab2decdaa0f612` を先に公開し、受け側の `site/source.json` はその完全SHAを固定する。受け側のCI・実ブラウザー検証が完了した組合せを配信する。単体GUIは引き続き利用できるが、旧ホストのビルド設定と新GUI、または新ホストの設定と旧GUIを混ぜない。

問題時は受け側を移設差分を載せる前のホスト基準 `121e1eae083d3abdedd03ae19a725eeb3bf95c04` へ戻し、その `site/source.json` が指す移設前GUI `c24b587ec49b871e9cbdc7530d54635a521a5d6e` を使う。sourceを戻す場合は両リポジトリの今回の変更を組としてrevertする。GUIの履歴・default branchは書き換えず、既存の完全SHAを取得可能なまま保持する。SB3・利用者データ・公開済みnpmは書き換えない。

公開前に受け側の最新mainへ載せ直し、security 0.8.1（`5c816492b39831a7c4ffeaabde01536046104c6a`）の固定と既存修正を保持した。この組合せでも既存境界182件・移設と配置監査54件、型検査と関連12件が成功した。

## 記録と公開範囲

先行整理の履歴は [scratch-gui #133](https://github.com/kubohiroya/scratch-gui/issues/133) と [#140](https://github.com/kubohiroya/scratch-gui/issues/140)。先行Issueの完了は、今回の全面移設が当時完了していたことを意味しない。

この変更はユーザーの追加指示に基づくローカル実装・検証。Issue投稿、push、PR作成、merge、Pages配信は、この文書の作成では実行していない。公開用のIssue・PR本文は別途草案として用意する。

CIと同じ入れ子checkoutで、テスト補助のresolverがGUI自身の依存解決まで再転送する問題を修正した。転送対象を配信側のsite/testに限定し、入れ子配置の独立プロセス回帰テストを追加した。この配置で既存182件・移設と配置監査54件が成功した。

## Issue #126：追加操作列の描画をホストで所有する

`site/stage-controls/view.tsx` がボタン・パネルの描画、serviceの購読と破棄を担当します。
GUIのcontrols viewは任意の `afterStop` nodeを配置し、containerは既存getterの `renderStageControls` へVMと表示サイズを渡します。
`Scratch.gui.stageControls` と同じVM単位のserviceを使い、登録APIと表示条件は維持します。
GUI単体は任意の描画部品がなければ標準の操作列を表示します。CSSはGUIの公開テーマ変数を使います。
切戻しはGUI/hostを移管前の互換なpinへ戻して行います。作品の形式は変更しません。

## Issue #127：拡張一覧の追加レイアウトをホストで所有する

`libraryTab.classes` がlibrary/content/tagsのCSS Modulesクラスを提供し、GUIは任意の `customClasses` として受け取ります。
追加の幅・余白・スクロール規則は `site/extension-library/plus-library.css` が所有します。
ホストのrootと追加クラスを組み合わせた規則で、GUIの基本レイアウトとの注入順に依存しません。
標準の検索・タグ選択・busy・closeの状態管理はGUIに残します。
切戻しはGUIの受渡しとホストCSSを既知のpin組合せへ戻して行います。

## Issue #163：ステージ転送メニューの描画をホストで所有する

`site/gui-integration/lib/tw-plus-transfer.ts` がステージ転送項目をネイティブメニューに渡す形へ整え、右クリックメニューとラッパーを描画します。ラッパーのレイアウトは同じディレクトリのCSSで管理します。
GUIはネイティブのコンテキストメニュー部品とファイル選択用アイコンを明示的に渡し、ステージ選択・ドロップ処理・背景ボタンの配置を担当します。
切戻しはGUIとホストを移管前の互換なpinに戻して行います。

## Issue #192 の標準配置

配置切り替え、ステージ表示、対象一覧のレイアウトと CSS は `@kubohiroya/turbowarp-plus-editor-layout` が所有します。Editor は起動設定、既存画面、ウィンドウ操作とパレットを接続します。

Plus 標準配置ではスプライト編集画面を Dockview のタブで開きます。「別画面で開く」からは既存の別画面コード編集を利用できます。切り戻すときは起動 URL に `twPlusDockviewSpriteTabs=0` を追加して再読み込みします。Editor は独立パッケージのアーカイブと整合性を lockfile に固定し、Scratch GUI の既存の編集タブ列・編集パネルの接続口を使います。

背景タイルでは GUI がタイルとネイティブのメニュー部品を任意の `wrapBackdropTile` 接続口に渡します。どの配置で転送メニューを表示し、どの項目を含めるかは Editor の既存ステージ転送接続で決めます。

### Editor のツールバーに置くアイコン付きメニュー

1つのアイコンから関連する操作や表示の選択肢を開く場合は、`@kubohiroya/turbowarp-plus-editor-ui`（`packages/editor-ui`）から `IconMenuButton` をインポートする。パネルの表示や配置の切り替えなどが対象。ステージ表示、編集タブ横の配置、別窓のレイアウト変更の各メニューを利用例とし、今後同じ形式のツールバー操作を追加・改修するときの共通部品とする。

- 呼び出し側は、翻訳済みの `label`、トリガーの装飾アイコン `icon`、表示順に並べた `items` を渡す。項目には一意の `id`、`label`、`onSelect` を指定し、必要に応じて `icon`、選択状態の `checked`、独立したオン・オフ項目を示す `checkbox`、現在のウィンドウ状態などを示す `current`、`disabled`、前に区切り線を置く `separatorBefore` を加える。
- 共通部品がテーマに沿った描画、メニューのアクセシブル名、矢印キー・Home・End での移動、Esc やメニュー外操作での閉鎖を担当する。ステージの表示・サイズ・ドック状態と起動フラグは、ステージ側が管理する。

UI パッケージは Editor リポジトリ内の `file:` 依存として Web と Desktop のビルドで共有する。React はホストから受け取り、GUI の Redux やステージの状態に依存しない。

受け入れ基準は、ステージで従来の表示と操作が再現され、別のツールバーからステージの状態や GUI 接続に依存せずに呼び出せること。抽出を戻す場合は、ステージの呼び出しと共通部品を同じ差分で戻す。

### ファイルメニューの機能拡張コマンド

新機能は原則として既定で有効にし、起動設定で切り戻せるようにする。段階導入で既定 OFF にする場合は、対象と条件を事前に合意する。

Plus 標準配置では既定で、ファイルメニューの項目にアイコンが付き、末尾の「機能拡張の追加」から既存のライブラリを開く。切り戻す場合は URL に `twPlusExtensionFileMenu=0` を指定して再読み込みする。

項目の描画と文言は `@kubohiroya/turbowarp-plus-editor-layout/extension-file-menu` が担当する。Editor は Scratch GUI #170 で提供された接続口に、既存のライブラリを開く操作とファイルメニュー項目を渡す。拡張カタログの画面操作はデスクトップ幅で検証する。

## Issue #175 スプライト設定パネルの任意接続

設定フォームとスタイルは独立パッケージ `@kubohiroya/turbowarp-editor-sprite-properties` に置く。Editor は `site/source.json` のパッケージ名・版・ソースコミットと、`vendor/` のローカル配布用 tarball を固定する。サイトのソース検証では、manifest と lockfile の相対パス、tarball の SHA-512、インストール済みの JavaScript と CSS の SHA-512 を照合する。Editor は起動時に既定 OFF の `twPlusSpriteProperties=1` を読み、パネルを既存の GUI 接続口に渡す。GUI は既存の選択情報・VM 更新経路を利用する。パネルと一覧は最小ドック内でそれぞれスクロールできる。

Editor 側の `npm ci` で、同梱 tarball が `node_modules` に展開される。独立パッケージの作業ディレクトリを参照する環境変数は不要。既定 OFF と ON のドック動作をローカルで検証する。

```sh
# Editor の作業ツリー
npm ci
node --test test/sprite-properties-source.test.ts test/family-notices.test.ts
editor_root="$PWD"
# GUI の作業ツリーは site/source.json に固定されたコミットを用意する
cd ../gui-sprite175
CI=1 E2E_GUI_ROOT="$PWD" DISABLE_V8_COMPILE_CACHE=1 node node_modules/webpack/bin/webpack.js \
  --config "$editor_root/scripts/site/webpack.config.cts" --output-path /private/tmp/tw175-host-build --bail
cd "$editor_root"
node test/sprite-properties/dock.ts /private/tmp/tw175-host-build
```

tarball の再現には、`spritePropertiesRevision` に固定した独立パッケージをクリーンなディレクトリへ展開し、そこで `npm ci`、`npm pack` を実行する。生成した tarball と Editor の固定ファイルを `cmp` で比較する。正式な npm 依存へ切り替える際は公開済みの版と integrity を確認する。

独立パッケージは `GPL-3.0-or-later` を宣言し、`LICENSE`、ソース、ビルドスクリプトを同梱する。配信ビルドは `notices/family.json` にライセンスとソースアーカイブを記録する。ローカル tarball の SHA-512 を照合し、配信成果物の `notices/` にそのまま収録する。

切り戻す場合は URL の `twPlusSpriteProperties=1` を外して再起動する。通常の設定欄に戻り、作品へ確定済みの変更は残る。配布依存も切り戻す場合は、パネル取り付けと配布成果物・依存固定を追加前の版へ戻す。
