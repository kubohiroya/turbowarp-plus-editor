# docs/ の案内

この索引は、`docs/` 直下の文書を**正本**と**記録**に分けます。正本は現行の `main` に対して真であることを保ちます。記録は特定の時点・版を調べた結果で、更新しません。各文書は先頭に自分の基準（対象リビジョン・日付・提案か確認済みか）を書いています。この表はそれを外から見えるようにするだけで、正本ではありません。

`docs/` 直下に `.md` を追加したら、この表に行を足してください。`npm test` の `docs/README.md` の検査が、未記載の文書と行き先のない行の両方で落ちます。

「最終更新」は git の最終コミット日です。

## 正本

現行の接続・仕様を述べます。実装の所有者は各文書が示す独立パッケージで、本リポジトリは固定・結線・検証を持ちます。

| 文書 | 内容 | 最終更新 |
| --- | --- | --- |
| [architecture.md](architecture.md) | 本リポジトリの責務、固定ソース、GitHub Pages 配信 | 2026-11-26 |
| [plus-integration-sockets.md](plus-integration-sockets.md) | フォークに残す差し込み口の設計。現在の配置は [gui-integration/README.md](gui-integration/README.md)。後半は各時点の判断の履歴 | 2026-11-16 |
| [extension-loader-integration.md](extension-loader-integration.md) | 拡張ローダーの統合（Embedded / Remote 拡張）と依存方向 | 2026-11-22 |
| [extension-authoring-ui.md](extension-authoring-ui.md) | 機能拡張一覧で Embedded／Remote を設定する | 2026-11-25 |
| [block-editor.md](block-editor.md) | フォーム型ブロックエディターの差し込み | 2026-11-19 |
| [document-window.md](document-window.md) | 組み込み文書のウィンドウ操作 | 2026-11-16 |
| [project-tools.md](project-tools.md) | 作品のプロパティと診断 | 2026-11-19 |
| [sb3-save-format.md](sb3-save-format.md) | SB3 の保存形式の指定と読み込み | 2026-11-16 |
| [script-stage-transfer.md](script-stage-transfer.md) | スクリプトとステージの転送。仕様の正本は script-transfer リポジトリ | 2026-11-25 |
| [local-catalog-preview.md](local-catalog-preview.md) | ローカルのカタログ表示差分を確認する | 2026-11-16 |
| [resource-declarations.ja.md](resource-declarations.ja.md) | リソース利用宣言の接続と検証 | 2026-11-21 |
| [preview-reload-overlay.ja.md](preview-reload-overlay.ja.md) | 紙芝居プレビューのリロード状態 UI。CSS は `site/source.json` のコミットと SHA-256 で固定 | 2026-11-10 |
| [scratch-numeric-input-spec.md](scratch-numeric-input-spec.md) | Scratch 数値入力の仕様メモ。確認済みの挙動と**提案**を文中で区別している | 2026-11-19 |

## 記録

終わった移管・監査・測定の記録です。各文書が基準の版を宣言しています。現在の件数や責務をここから読まないでください。

| 文書 | 内容 | 宣言された基準 |
| --- | --- | --- |
| [upstream-feature-ownership.md](upstream-feature-ownership.md) | 機能実装を上流パッケージへ移した記録。所有者の表、MPL-2.0 での提供承認（2026-11-19）、公開版の固定 | Editor `fd11930f` 調査・GUI `97b876ac` |
| [remaining-feature-boundaries.md](remaining-feature-boundaries.md) | 残存していた画面・状態・照合・更新処理の責務移管。管理先は Issue #875 | Editor `6d2c7319` |
| [issue-823-loader-final-audit.md](issue-823-loader-final-audit.md) | #823 Loader 全体 12 spec・60 ケースの最終照合 | 2026-11-26・main `70d4aefb` |
| [issue-823-final-integration.md](issue-823-final-integration.md) | #823 の最終結線候補と、公開前に実行した証拠 | main `70d4aefb`（公開後の追記あり） |
| [test-e2e-ownership.md](test-e2e-ownership.md) | #823 §4 E2E の棚卸し。件数は各時点の履歴で、現行 60 件へ加算しない | 2026-11-26・main `70d4aef` |
| [test-browser-project-git-ownership.md](test-browser-project-git-ownership.md) | 作品フォルダー・Git のブラウザーテストの分類 | Editor `6aaafd77`・`9285d2e2` |
| [test-browser-document-ownership.md](test-browser-document-ownership.md) | 文書・YAML・復元のブラウザーテストの分類 | #823 の分類時点 |
| [editor-layout-test-classification.md](editor-layout-test-classification.md) | `editor-layout.browser.ts` 39 件のケース分類。CI の exact-tree 再利用が参照する台帳 | main `8fc1e701`（3,955 行・39 件） |
| [editor-unit-test-classification.md](editor-unit-test-classification.md) | 単体・GUI 結合テストを所有先で分類 | Editor `5b6c900`・GUI `60b87e2f` |
| [test-prototype-inventory.md](test-prototype-inventory.md) | 試作・補助テストの棚卸し | Editor `5b6c900` |
| [ci-exact-tree-reuse.md](ci-exact-tree-reuse.md) | main での exact-tree 再利用の測定。示した秒数は基準値で、実測の短縮量ではない | Editor #828 の 2 実行 |

## 下位ディレクトリ

| 場所 | 内容 | 種別 |
| --- | --- | --- |
| [features/](features/index.html) | 公開する機能ガイド（日英・図版込み）。GitHub Pages で配信 | 正本 |
| [developer-guide/](developer-guide/index.html) | 公開する開発者ガイド（日英） | 正本 |
| [gui-integration/](gui-integration/README.md) | GUI 追加ファイルの全面移設とビルド契約。移設先・件数・検証は各移設時点の記録 | 記録を含む |
| [tutorial-mode/](tutorial-mode/README.ja.md) | 段階解放と紙芝居教材の設計。`*.proposal.json` は提案、`*.schema.json` は契約 | 検討中（アルファ） |
| [landing/](landing/index.html) | トップページの雛形と日英の文言 | 正本 |
| [performance/](performance/kamishibai-3.2.md) | 紙芝居の応答時間の測定。各文書が実行時刻と Editor のリビジョンを宣言 | 記録 |
