# Editor の機能実装を上流へ移す変更

移管の調査元は Editor `fd11930fa10eaad70b8332eb76b34f9888a59157`。公開時の base は最新 main を使用する。既存の機能の責務を移し、新しいパッケージや起動フラグは作らない。
公開準備時に Editor main #713 の固定先更新を取り込み、GUI は `97b876ac206c2a7b6a4cd47a77e5827c70f3173a`、VM は `e623546e0e173d70e0314d06d8a17bf84c72afeb` のまま。GUI ソースへの変更はない。

## 機能の所有者

| 所有するパッケージ | 実装・状態・文言・検証 |
| --- | --- |
| turbowarp-plus-editor-code-views | 横パレットと表示グループ、削除予告、メニューのアイコン、別窓でのコード編集 |
| turbowarp-plus-editor-workbench | 作品のプロパティ・診断・履歴・保存と新規作成の段取り、スプライトタブ、パネル、ステージと別窓の操作メニュー |
| turbowarp-extension-loader | カタログの設定の読み書き、依存順・拒否した依存を考慮した拡張読み込み、VM ホストの承認状態・破棄、作品サイズの判定と同意の確認 |
| turbowarp-extension-security-dialog | 拡張一覧の UI と状態、作品を開く前のレビュー、許可・再試行の画面、レビュー中の状態と失敗の説明 |
| turbowarp-sb3-save-format | 作品データの調査・変換・検証、保存形式の設定と読み込み、組み込み素材の変換 |

Editor は公開 API を呼ぶアダプター、起動設定、カタログと信頼方針、GUI 内部との接続、ビルドと配信を持つ。
`site/editor-layout/config.ts` は起動設定をまとめ、表示部品との循環 import による初期化前の参照を避ける。
GUI の Redux、ScratchBlocks 本体、画像、全画面ボタンの要素は Editor が読み、機能パッケージへ値またはコールバックとして渡す。
機能パッケージから GUI モジュールを import しない。GUI のクラス名を選ぶ必要がある箇所は Editor 側の接続に残す。

## ライセンスと由来

2026-11-19、著作権者から Editor 独自の対象コードを MPL-2.0 でも提供する承認を得た。
各上流リポジトリの `EDITOR-MIGRATION.md` に移管元を、新規ソースに SPDX を記録する。
本家 GUI のコード・コンポーネントは移さない。Acorn / Acorn Walk の MIT 表示を保持する。

## 公開版の固定

上流 5 件をそれぞれの main へ Squash Merge し、既存のリリース workflow から npm へ公開した。
Editor は公開された完全版を直接固定する。検討中のローカルアーカイブと、それを配布するための一時的なビルド対応は取り除く。

| パッケージ | 完全版 | マージコミット | 公開差分 |
| --- | --- | --- | --- |
| @kubohiroya/turbowarp-plus-editor-code-views | `0.21.3` | `99e32b3dec0cedaecf3798889096cd09e9f1a14f` | [PR](https://github.com/kubohiroya/turbowarp-plus-editor-code-views/pull/37) |
| @kubohiroya/turbowarp-plus-editor-workbench | `0.27.1` | `225a814ad0ebe62b4bef4bc50b5c1404f30e636d` | [PR](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/113) |
| @kubohiroya/turbowarp-extension-security-dialog | `0.9.1` | `213ca71969be75943f2e775e29e89193e910181f` | [PR](https://github.com/kubohiroya/turbowarp-extension-security-dialog/pull/93) |
| @kubohiroya/turbowarp-sb3-save-format | `0.4.0-rc.3` | `519a703b3e4b019e03a18aa1b0a59690d4423a29` | [PR](https://github.com/kubohiroya/turbowarp-sb3-save-format/pull/6) |
| @kubohiroya/turbowarp-extension-loader | `0.11.2` | `1440c4e63713748e5de93d630a23c4dc2597c782` | [PR](https://github.com/kubohiroya/turbowarp-extension-loader/pull/35) |

順序は、上流の CI・マージ・npm 公開確認 → Editor の依存と lockfile の更新 → Editor の CI・マージ・Pages 配信。
アーカイブのバイト列は npm の SHA-512 と照合する。security-dialog はアーカイブに含まれる build-info の公開元コミットも確認する。

## 受け入れ条件と検証

- 移管したアダプターがローカルの UI、クラス、Map / Set の機能状態を所有しないことを `test/package/feature-ownership.test.ts` で検出する。
- 各上流の型チェックと、パレットの破棄、作品メタデータ・診断・ダイアログ、カタログ設定、画面の取消・破棄・再試行、4 保存形式の往復・改ざん拒否を単体で確認する。
- Editor の型チェック、拡張ホストと作品ツールの結合テスト、固定アーカイブの検証を行う。
- 固定 GUI の製品ビルドを作り、横パレット・削除予告・コード表示・拡張の許可と保存形式をヘッドレス Chromium で確認する。
- Desktop の実ウィンドウ、OS のフォーカスやカーソルを使う検証は実行しない。

## 移管実装段階の検証結果（2026-11-19）

移管実装を最初に検証した Editor コミットは `86526ebcaa763b118e5ae0512ab59b2fe91cfa7b`。
このコミットの製品ビルドと `build-info.json` を照合し、`check-artifact.ts` が通った。
この結果の追記による文書だけの変更では、ビルド・E2E を繰り返さない。

| 対象 | 結果 |
| --- | --- |
| 上流 5 パッケージ | 型チェック・ビルド成功、対象の単体テスト計 45 件成功 |
| Editor | 型チェック成功、拡張ホスト・一覧・作品ツール・固定ソース・責務境界のテスト計 124 件成功 |
| 最終アーカイブの固定とライセンス台帳 | 8 件を再確認し成功。5 アーカイブの SHA-512 と、元の TypeScript ソースの同梱も確認 |
| 最終ビルドのヘッドレス Chromium | 拡張の許可・拒否・日英・狭い表示 11 件、4 保存形式と組み込み画像・音声の再読込 5 件成功 |
| パレットのヘッドレス Chromium | 横パレット・検索・カテゴリ移動・タッチの 9 件成功 |
| コード表示・削除予告・ミニマップのヘッドレス Chromium | 6 件成功 |

E2E は異なるケース計 31 件を確認した。パレットは `7ce58aa` の GUI 接続 CSS 修正後の結果を使用し、
動的カテゴリの検索だけは同じビルドで対象ブロックを明示したテストを再実行した。
コード表示・削除予告・ミニマップは `578ea45` での結果を再利用した。その後の変更はパレットの GUI 接続 CSS と
Loader のホスト境界であり、この 6 件の対象コードと GUI・VM・ブラウザーの前提は変えていない。
Loader の追加移管が影響する承認画面と作品の入出力 16 件は、最終ビルドで再実行した。

`site/` の TypeScript・TSX・CSS は、移管前の 10,694 行から 4,798 行へ減った。
通常上限・許可後上限、既定で有効な機能、作品の保存形式は維持する。

## 公開版での統合確認

上流 5 件を公式 npm から取得し、全 tarball の SHA-512、security-dialog の build-info とマージコミットを照合した。
最新 GUI の lockfile に合わせて依存を導入し、型チェック、Editor の単体テスト 123 件、結合テスト 116 件、GUI 接続テスト 73 件が成功した。
公開版を使った製品ビルド・成果物検証と、変更範囲のヘッドレス E2E を実施してから Editor をマージ・配信する。

## 既存テストの移管（#741）

機能パッケージの API だけで成立するテストは、そのパッケージで実行する。
移管先への追加・CI の成功を確認してから、Editor の重複を削除する。

| Editor から削除するテスト | 移管先 | Editor に残す接続確認 |
| --- | --- | --- |
| `test/editor-host.browser.ts` | [editor-host の契約検証](https://github.com/kubohiroya/turbowarp-plus-editor-host#checking-a-host) | 実 GUI のホストが同じ VM を保ち、変更通知と保存状態を契約どおり伝えることだけを確認する。契約アサーション本体はホストパッケージを呼ぶ。 |
| `test/project-catalog.browser.ts` | workbench の `test/project-catalog-host.browser.ts`（[PR #128](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/128)） | `test/project-catalog-editor.browser.ts`（実 GUI のファイルメニュー、別タブ間の SB3/ファイルハンドル、実 SB3 保存、ネイティブ picker 非対応時の入力と新規作成の接続） |
| `test/script-transfer/format.test.ts`・`stage.test.ts`（計12件） | script-transfer の `test/format.test.mjs`・`stage.test.mjs`（[PR #6](https://github.com/kubohiroya/turbowarp-script-transfer/pull/6)） | `test/plus-integration.test.ts` の転送接続確認と `test/gui-integration/unit/plus/transfer.test.ts`、ブラウザー E2E |
| `test/extension-library/catalog-settings.test.ts`（12件） | extension-loader の `test/scratch-vm/catalog-settings.test.ts`（[PR #35](https://github.com/kubohiroya/turbowarp-extension-loader/pull/35)） | `test/extension-library/plus-library.test.cts`（画面の回答から設定 API への接続） |
| `test/project-tools/diagnostics.test.ts`（2件）と `properties.test.ts` の機能テスト13件 | workbench の `test/project-diagnostics.test.ts`・`project-properties.test.ts`（[PR #113](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/113)） | 起動フラグ確認を `test/project-tools/flags.test.ts` に保持。`host.test.cts`・`dialog.test.cts` も保持 |
| `test/project-tools/dialog.test.cts` の機能テスト5件 | workbench の `test/project-dialogs.test.cts`（元の5件に加え、キャンセル画面等の3件を実行） | 同ファイルを CSS とキャンセル判定の結線確認1件へ縮小 |
| `test/extension-host/load-errors.test.ts`（3件） | security-dialog の `test/load-errors.test.cts` | `test/gui-integration/unit/extension-loader/load-failure.test.ts`、`test/gui-integration/unit/plus/extension-host.test.ts` とレビュー内のキー入力確認 |
| `test/block-editor/icon.test.ts` の機能テスト2件 | data-editor の `test/editor-icon-service.test.ts` | 同ファイルの VM ごとのサービス共有・登録解除通知の結線確認1件 |
| `test/block-editor/{host,source-host,descendant-host,bridge,appearance}.test.ts`（38件） | data-editor の `test/editor-block-*.test.ts` と共通 fixture | `modal.test.ts` の実 GUI モーダル、`icon.test.ts` のサービス共有、`fixed-inputs.test.ts`・`source-forms.test.ts` と `test/gui-integration/unit/block-editor/` の GUI 接続確認 |
| `test/block-editor/modal.test.ts` の機能テスト17件 | data-editor の `test/editor-block-modal.test.ts` | 同ファイルの実 GUI ラッパー・ReactModal portal 内への mount の接続確認1件 |
| `test/extension-host/permission-ui.test.ts`（8件） | security-dialog の `test/permission-ui.test.cts` | `test/extension-host/host.test.ts` の実 VM・DOM 承認と `security-review.test.ts`、GUI のホスト接続確認 |
| `test/extension-host/batch-review.test.ts` の機能テスト3件 | security-dialog の `test/editor-batch-review.test.cts` | 同ファイルの実 VM による拒否後のブロック・URL 保持と GUI モーダルの結線確認2件 |
| `test/extension-host/project-size-gate.test.ts` の機能テスト3件 | Loader の `test/editor-project-size-gate.test.ts`（計測・同意2件）、workbench の `test/project-size-approval.test.cts`（画面1件） | 同ファイルの実 VM と Editor の64 MiB上限・同意を接続する1件 |
| `test/extension-host/project-uri.test.ts` の機能テスト5件 | Loader の `test/scratch-vm/editor-project-uri.test.ts` | 同ファイルの実 VM での URI 付与・保持と開く際のレビューの結線確認1件 |
| `test/extension-host/project-cache.test.ts` の保存時 URI 機能テスト5件 | Loader の `test/scratch-vm/editor-save-address.test.ts` | 同ファイルの実 VM・HTTPS と URI、作品別キャッシュ、カタログ、fallback、単一 HTML の接続確認5件 |
| `test/extension-host/retry-classification.test.ts` の判定行列1件（成功＋失敗9種類） | Loader の `test/scratch-vm/editor-retry-classification.test.ts` | `authoring.test.ts` の実 VM と authoring の接続、`host.test.ts` の再試行通知と404の接続確認 |
| `test/stage-controls.test.ts` の機能テスト3件 | workbench の `test/stage-controls.test.ts` | 同ファイルのサービスを GUI に渡す接続確認1件 |
| `test/extension-host/babel-rollback.test.ts`（native/webpack4 の6件） | Loader の `test/scratch-vm/editor-babel-rollback.test.ts` | `authoring.test.ts` の実 VM と登録失敗の結線、GUI の host 接続確認と既存 Editor ビルド |
| `test/extension-host/unified-review.test.ts` の表示名詳細4パターン | security-dialog の `test/editor-verified-review-names.test.cts` | 同ファイルに表示名接続1パターンを含む統合確認8件を保持 |

作品一覧の移管先は import の接続先だけを変更した同じテストで、[移管 PR の CI](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/45017749451) が成功している。
workbench の CI は `npm run test:browser` でこのテストを実行する。Editor が固定する workbench `0.39.0` のソースでも、ビルドと対象テスト1件がヘッドレス Chromium で成功した（2026-11-25）。
Editor 側では削除前から CI の実行対象でなかったため、この1件の削除による CI の時間短縮は見込まない。
切り戻す場合は Editor 側のテスト削除を revert する。製品コード・依存の固定・作品の保存形式は変更しない。

転送12件は [移管先の CI](https://github.com/kubohiroya/turbowarp-script-transfer/actions/runs/45526571441) で既存15件とともに成功した（Node.js 24、2026-11-25）。上流 PR #6 のマージ確認を Editor 側の削除の公開条件とする。
Editor の `test:script-transfer` と CI の同名ステップ・検証計画・結果再利用の対応表を外し、機能のテストは上流 CI へ任せる。CI 契約のハッシュは対応表と workflow から生成するため、変更前の証跡をそのまま再利用しない。
今回の CI 所要時間の削減量は未測定。切り戻す場合はテスト2ファイル、npm コマンド、CI ステップと3つの検証スクリプトをまとめて revert する。

カタログ設定12件は Loader PR #35 で移管済みで、[移管先 CI](https://github.com/kubohiroya/turbowarp-extension-loader/actions/runs/44413986006) の `npm run check` が成功している。Editor に残っていたテストと import 先・ライセンス表記以外が一致することを照合し、固定版 `0.13.1` のソースでもビルド・scratch-vm テスト群の型チェック・対象12件が成功した（2026-11-25）。
Editor の `test:extension-host` は同じ glob で残る結線テストを実行するため、npm コマンドと CI ステップは保持する。既存の `plus-library.test.cts` が、画面で選択した行・読み込み形式・依存順を設定 API へ渡す接続を確認する。
CI の時間短縮量は未測定。切り戻しは Editor のテスト1ファイルの削除を revert する。機能の実装と依存の固定は変更しない。

作品診断・プロパティの機能テスト15件は workbench PR #113 で移管済みで、[移管先 CI](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/44413407708) が成功している。診断2件は import 先・ライセンス表記だけが異なり、プロパティ13件も検証本体は同じで、上流ではホストの注入ポートを代役で渡す。固定版 `0.39.0` のソースでもビルドと対象15件が成功した（2026-11-25）。
Editor に残す `host.test.cts` は実 VM と拡張コーデックで保存・再読込・作品プロパティ・拡張追加の結線を、`dialog.test.cts` は実際に接続したダイアログを確認する。Editor 独自の起動フラグ確認1件は内容を変えず `flags.test.ts` へ移し、`test:project-tools` と CI の実行設定を維持する。
CI の時間短縮量は未測定。切り戻しはこの15件の整理を revert し、旧テスト2ファイルと元の起動フラグ確認の配置を戻す。製品コード・依存固定は変更しない。

作品ダイアログの機能テスト5件は workbench 側で実行済み。4件は検証本体が同じで、診断画面の1件も同じ経路を検証する。上流版で省かれていた英語の失敗見出しの確認は Editor の結線テストに保持する。固定版 workbench `0.39.0` の対象8件が成功した（2026-11-25）。
Editor の `dialog.test.cts` は、ホストが渡すダイアログ・通知の CSS と共有キャンセル判定が実際の画面へ接続されることだけを確認する1件へ縮小した。固定 GUI `b2e75a129546db48e6563f72c80a3d3d46d86fb5` の依存で成功し、CSS またはキャンセル判定を意図的に外すと失敗することも確認した。検証用の変更は元に戻し、製品コードと依存固定は変更していない。
`host.test.cts` と起動フラグ確認、既存の npm コマンド・CI 設定は保持する。短縮量は未測定。切り戻しはこの縮小を revert し、元の5件を復元する。

エラー説明・キャンセル分類3件は、実装を所有する security-dialog のビルド済み `./load-errors` を検証する。入れ子の原因、循環を含む集約エラー、拒否とキャンセルの分類の検証本体は維持し、元の GPL-3.0-or-later もテストに保持する。移管先の既存 `pnpm test` と CI が実行する。移管先の CI 成功とマージを Editor 側の削除の公開条件とする。
Editor では GUI のエラー受け渡し・分類の委譲、レビュー内のキー入力、作品ダイアログへのキャンセル判定の結線を引き続き確認する。`test:extension-host` と既存 CI 設定・依存固定・製品コードは変更しない。短縮量は未測定。切り戻しはテスト1ファイルの削除を revert する。

ブロック編集アイコンの入力処理とスキーマ検証・直列化の2件は、data-editor の既存 `pnpm test` と CI で検証する。移管先の CI 成功とマージを確認してから Editor の重複を削除する。検証本体は維持し、スキーマ検証でサービスを得る1行だけを同じ上流の `createPlusBlockEditor().createService()` へ接続する。元の GPL-3.0-or-later は移管先テストに保持する。
Editor は `icon.test.ts` に VM ごとのサービス共有と登録・解除通知の結線確認1件を内容不変で残す。製品コード・依存固定・GUI と既存 CI は変更しない。CI 時間の短縮量は未測定。切り戻しはこのテスト整理を revert し、移管先も戻す場合は Editor の元テストを先に復元する。

承認画面・診断ログ・再試行表示の8件は、security-dialog のビルド済み `./permission-ui` を検証するテストとして移す。import と DOM 照会の型専用記法だけを変更し、検証本体と元の GPL-3.0-or-later を維持する。移管先の既存 `pnpm test` と CI が実行し、その CI 成功とマージを Editor 側の削除の公開条件とする。
Editor では `host.test.ts` の実 VM が DOM 承認を待ってから拡張を実行する確認、`security-review.test.ts` の未承認実行の拒否、GUI のホスト・エラー受け渡しの結線確認を保持する。製品コード・依存固定・GUI・既存 CI と npm コマンドは変更しない。CI 時間の短縮量は未測定。切り戻しは削除したテスト1ファイルを復元し、上流側も戻す場合は Editor の復元を先に行う。

一括レビューの機能テスト3件（キャンセル判定 API の基本契約、作品識別、信頼済み行の判定）は security-dialog の `./project-review` へ移管する。ホストの注入ポートを GUI・VM なしで渡し、`identifyProject` の取得先1行以外の検証本体と元の GPL-3.0-or-later を維持する。移管先の既存 `pnpm test` と CI が実行し、上流 CI の成功とマージを Editor 側の削除の公開条件とする。
Editor の `batch-review.test.ts` には、実 VM で拒否後も作品のブロック・URL が残る確認と、GUI モーダルの prop・CSS・コンポーネント同一性を確認する2件を内容不変で残す。製品コード・依存固定・GUI・既存 CI と npm コマンドは変更しない。CI 時間の短縮量は未測定。切り戻しは今回のテスト整理を revert し、上流側も戻す場合は Editor の復元を先に行う。

作品サイズゲートの計測・同意2件を Loader、確認画面1件を workbench へ移管する。元の検証本体・fixture データ・GPL-3.0-or-later を維持し、Loader では既存のテスト型検査に合わせて型専用記法だけを追加する。両方の既存 `npm test` と CI が実行し、両移管先の CI 成功とマージを Editor 側の削除の公開条件とする。
Editor は `project-size-gate.test.ts` に実 VM と Editor の64 MiB上限・同意の結線確認1件を内容不変で残す。製品コード・依存固定・GUI・既存 CI と npm コマンドは変更しない。CI 時間の短縮量は未測定。切り戻しは元の4件を復元し、上流側も戻す場合は Editor の復元を先に行う。

作品 URI の付与5件は Loader の authoring controller の公開 API を、VM の代役で検証するテストとして移管する。検証本体・fixture・元の GPL-3.0-or-later を維持し、移管先の既存 `npm test` と CI が実行する。上流 CI の成功とマージを Editor 側の削除の公開条件とする。
Editor は `project-uri.test.ts` に実 VM で URI を一度だけ付与・保持し、その URI を開く際のレビューが作品名に使う結線確認1件を内容不変で残す。製品コード・依存固定・GUI・既存 CI と npm コマンドは変更しない。CI 時間の短縮量は未測定。切り戻しは元の6件を復元し、上流側も戻す場合は Editor の復元を先に行う。

ブロック編集の host・Source・子孫編集・bridge・見た目の38件は data-editor の公開 API を検証するテストとして移管する。検証本体と元の GPL-3.0-or-later を保持し、実 VM と Scratch Blocks の共通 fixture の解決先を GUI checkout からテスト専用の固定依存へ変更する。VM は Editor 固定の `f3d3811`、Scratch Blocks は固定 GUI が参照するブランチの調査時の先端 `a07fa8f`、parser は `f0d650c` に固定する。移管先の既存 `pnpm test` と CI が38件を skip せず実行し、CI 成功とマージを Editor 側の削除の公開条件とする。
Editor のモーダルと上表の GUI 接続確認、既存の `test:extension-host` コマンド・CI ステップを保持する。製品コード・依存固定・GUI は変更しない。CI 時間の短縮量は未測定。切り戻しはこの5ファイルの削除を revert し、移管先も戻す場合は Editor の元テストを先に復元する。

モーダルの保存・非同期検証・IME・階層表示・RJSF エラー表示の17件は data-editor へ移管する。実 ReactModal portal と RJSF、検証本体・セッション fixture・元の GPL-3.0-or-later を保持し、GUI ラッパーのコンパイルだけを `createPlusBlockEditor().render()` の公開 API 呼び出しへ置き換える。テスト専用の ReactModal `3.9.1`・Intl `2.9.0` は固定 GUI と同じ版を使う。移管先の既存 `pnpm test` と CI の成功・マージを Editor 側の重複除去の公開条件とする。
Editor の `modal.test.ts` には、実 GUI ラッパーが ReactModal の portal 内に本体を1回だけ mount する接続確認1件と必要な fixture を残す。参照のない旧 `test/block-editor/helpers.ts` は削除する。製品コード・依存固定・GUI・既存 CI コマンドは変更しない。CI 時間の短縮量は未測定。切り戻しはこの整理を revert して元テストと helpers を復元し、上流側も戻す場合は Editor の復元を先に行う。

保存時 URI の機能テスト5件は Loader の公開 `createProjectIO`・`installExtensionLoader` を VM の代役で検証するテストとして移管する。初回保存時の付与と保持、保存経路と sprite 書き出しの区別、既存 URI・manifest 不在・付与ポート不在・再読込を扱う。検証本体・fixture と元の GPL-3.0-or-later を維持し、移管先の既存 `npm test` と CI が実行する。移管先のソース全27ファイルは Editor 固定の Loader `0.16.0` と一致する。上流 CI の成功とマージを Editor 側の重複除去の公開条件とする。
Editor の `project-cache.test.ts` には実 VM・HTTPS・URI の往復、作品別キャッシュ・カタログとの結線、IndexedDB 不在時の接続、単一 HTML への除外を確認する5件を内容不変で残す。既存の `test:extension-host` と CI ステップを保持する。製品コード・依存固定・GUI は変更しない。CI 時間短縮量は未測定。切り戻しは元の10件と bridge fixture を復元し、上流も戻す場合は Editor の復元を先に行う。

再試行の判定行列（成功時と失敗9種類）は Loader の公開 host/authoring API と既存の実 VM fixture へ移管する。検証本体と SB3 fixture を維持し、Editor の薄い接続に代えて host factory の UI/review ポートと authoring 接続をテスト fixture で渡す。Loader には Storage のテスト専用依存を追加する。Editor の `authoring.test.ts` と `host.test.ts` の現行固定 VM による接続確認を保持する。
統合レビュー8件は Plus/legacy の承認・拒否・キャッシュ・キャンセルをパッケージ間で接続する確認として Editor に保持する。表示名の詳細4パターンだけを security-dialog の公開 `plusReviewRows` へ切り出し、元の source fixture と期待値を維持する。ZIP reader と正規化済みの依存配列を注入し、コードが実行されないことも確認する。Editor の表示名確認は4パターンから1パターンへ縮小する。
両移管先の既存テストコマンド・CI が新しいテストを実行し、元の GPL-3.0-or-later を保持する。Loader `0.16.0` のソース27ファイルと security-dialog `0.14.0` の32ファイルは Editor の固定版と一致する。両移管先の CI 成功とマージを Editor の整理の公開条件とする。製品コード・依存固定・GUI・既存 CI コマンドは変更しない。CI 時間短縮量は未測定。切り戻しは Editor の判定行列と表示名詳細ケースを復元してから、必要なら両上流の追加テスト・テスト専用依存・文書も revert する。

native/webpack4 変換後の登録拒否・cleanup 失敗・実 VM registrar の再試行6件を Loader へ移管する。検証本体・fixture と IE11/modules:false の Babel 変換設定を維持し、core と registrar を同じ公開 built entry から解決する。Babel core `7.29.7`・preset-env `7.14.8` は固定 GUI `14477c5` の lockfile と同じ版をテスト専用依存に固定する。VM は Loader の既存固定を利用する。移管先の既存 `npm test` と CI が GUI checkout なしで実行し、元の GPL-3.0-or-later を保持する。上流 CI 成功とマージを Editor の削除の公開条件とする。
Editor の `authoring.test.ts`・`host.test.ts` と GUI の host 接続確認、既存の `test:extension-host`・ビルドの検証を保持する。製品コード・依存固定・GUI・CI コマンドは変更しない。CI 時間短縮量は未測定。切り戻しは Editor の元テストを復元し、必要なら Loader の追加テスト・Babel devDependencies・lockfile・文書も revert する。

ステージ操作サービスの登録・更新・破棄と VM ごとの共有・作品変更時の消去を確認する3件は workbench の公開 `./stage-controls` へ移管する。検証本体・fixture と元の GPL-3.0-or-later を保持し、既存の `npm test` と CI が GUI checkout なしで実行する。上流 CI 成功とマージを Editor の重複削除の公開条件とし、Editor にはサービスを GUI へ渡す接続確認1件を残す。製品コード・依存固定・GUI・CI コマンドは変更しない。CI 時間短縮量は未測定。切り戻しは Editor の元3件を先に復元し、必要なら上流の追加テスト・文書を revert する。

`test/editor-layout.browser.ts` の39件は[ケース別の分類](./editor-layout-test-classification.md)に記録した。「コピーを保存」の action 配置・アイコン13行を workbench の `test/editor-save-dialog-actions.browser.ts` へ切り出し、公開 dialog API と windows の CSS で GUI checkout なしに確認する。元の期待値・検証処理と GPL-3.0-or-later を保持し、上流 CI 成功とマージを Editor の縮小の公開条件にする。Editor は File メニュー・Cancel・SB3 ダウンロードの接続確認を残す。他38件と共通 fixture は変更しない。通常 CI の実行対象外のため、この削除による通常 CI の時間短縮は見込まない。切り戻しは Editor の元13行とケース名を先に復元する。

未保存マーカーの hover・キーボード focus・狭幅 hint の詳細は workbench の `test/editor-unsaved-marker.browser.ts` へ移し、既存 browser CI が単独 host で実行する。Editor は VM の変更・native title の幅と隣接・保存メニューの接続を保持し、上流成功・マージ後に詳細11行を除く。元の操作・期待値と GPL-3.0-or-later を保持する。切り戻しは Editor の元11行とケース名を先に復元する。分類表の呼び出し図34番の照合結果は、後続の節に記録した。製品・固定依存・CI コマンドは変更しない。通常 CI の時間短縮は見込まない。

呼び出し図34番は現行 toolbar・矢印属性・SVG ラベルを実 Editor の固定ビルドで照合し、元の行列全体の成功を確認した。4状態・同じ図での更新・再マウント後の設定保持は sprite-panes の既存 browser テストへ2件追加し、section/分割ペインの状態は workbench の既存2件で確認する。Editor は VM JSON の内容不変、図の切替と他 target の受信 script への接続を残して77行から68行へ縮小し、縮小後の実ケースも成功した。残る38件と共通 fixture、製品・固定依存・GUI・CI コマンドは内容不変。上流 CI 成功・マージ後に Editor を公開する。切り戻しは現行 DOM のまま Editor の元の確認範囲を先に復元する。通常 CI の時間短縮は見込まない。

divider の grip 寸法・radial-gradient と keyboard の16px移動・行の最小値/復元は workbench の standalone browser テスト2件へ移す。host accent と両軸の境界/復元も確認し、既存5件の本文を保持して host を共通化する。Editor は詳細13行だけを除き、GUI テーマ・Blockly resize/edit・stage input・SB3 保存/再読込を保持する。従来レイアウトを指定する元ケースに合わせ、保存操作を存在する「Save to your computer」へ修正した。修正した元の全検証と縮小後の実ケースは初回の固定ビルドで成功し、公開前に進んだ main `cd135d8` の GUI `60b87e2`・VM `88a2c06` の固定ビルドでも両方が成功した。他38件・共通 fixture・製品・依存固定・GUI・CI コマンドは内容不変。上流 CI 成功・マージ後に Editor を公開する。切り戻しは Editor の詳細13行を先に復元し、従来レイアウトに合わせた保存操作を保持する。通常 CI の時間短縮は見込まない。

変数テーブル29番のmixed-row表示/並べ替えとlist dialogの詳細をsprite-panesの単独browser2件へ移す。元の操作・期待値・GPL-3.0-or-laterを保持し、キャンセル時0回/保存時1回のコールバックも確認する。Editorは112行から78行へ縮小し、実VMの参照数、スプライト/clone/global listの更新とmonitor接続を残す。残る38件と共通fixture、製品・固定依存・GUI・CI設定は内容不変。製品・テスト入力がmainと一致する既存固定ビルドで削減前後の実ケースが成功した。上流CI成功・マージ後にEditorを公開する。切り戻しは元のEditorケースと名前を先に復元する。通常CIの時間短縮は見込まない。

クローン切替31番のpagination境界・矢印geometry・選択保持/復帰をsprite-panesの単独browser2件へ移す。公開部品へtargetデータとlifecycle通知だけを渡し、元の期待値・GPL-3.0-or-laterを保持する。Editorはmonitorの旧アクセシブル名を現行DOMへ合わせて元の全検証の成功を確認し、136行から115行へ縮小する。実VMのclone編集・定義追加・monitor・実行中だけの変更・消滅と停止の接続を保持し、縮小後も成功した。残る38件と共通fixture、製品・固定依存・GUI・CI設定は内容不変。上流CI成功・マージ後にEditorを公開する。切り戻しはEditorの元の確認範囲とケース名を先に復元し、現行monitor名は保持する。通常CIの時間短縮は見込まない。

引き出しgeometry17番の移動・resize・viewport追従・取っ手の寸法/向きを、workbenchの公開EdgeDrawer/StageResizeHandleとCSSを使う単独browser1件へ移す。元のgeometry操作・期待値・GPL-3.0-or-laterを保持し、native canvasと公開portだけをhostが渡す。Editorは149行から66行へ縮小し、実canvas/palette/表示menuと移動・resize・閉じる/再表示の接続を残す。元ケースと縮小後はいずれも成功した。他38件と共通fixture、製品・固定依存・GUI・CI設定は内容不変。上流CI成功・マージ後にEditorを公開する。切り戻しは元Editorケースと名前の復元を先に行う。通常CIの時間短縮は見込まない。

## 切り戻し

Editor のこの変更を revert し、接続コードと依存の固定を公開直前の main の組み合わせへ戻して再ビルドする。
上流候補だけを旧版へ戻すと新しい接続口がなくなるため、Editor のアダプターと同時に戻す。
作品の JSON キー・保存形式と既存機能の既定値は変えておらず、保存済み作品の移行は不要。

## 作業記録

ブランチは `refactor/editor/upstream-feature-ownership`。各上流 PR に責務・依存順・検証・受け入れ条件・切り戻しを記録した。
2026-11-19 にローカル実装を検証し、ユーザーの「マージして公開して」の指示で上流から順に公開する。

### 実 Editor ホスト契約の実行（#823）

`TW_PLUS_TEST_EDITOR_HOST=1` で、固定 Scratch GUI と組み合わせてサイトをビルドする。ビルドに含まれる `siteRevision` を `E2E_EXPECT_SITE_REVISION`、絶対パスのビルド先を `E2E_PROJECT_FOLDER_BUILD` に指定して `npm run test:editor-host` を実行する。通常 CI では実行しない。Editor `53a5300` と Scratch GUI `60b87e2` でヘッドレス実行し1件成功、skip 0。

### Git レビュー印の版更新（#823）

担当パッケージの [Git #84](https://github.com/kubohiroya/turbowarp-plus-editor-git/pull/84) で、2件のスクリプトの確認済み印を再読込後に保持し、版更新で変更された側だけを外す。単独 Chromium ケースは [上流CI](https://github.com/kubohiroya/turbowarp-plus-editor-git/actions/runs/45721385184) で実行・成功。Editor は実ファイル起点の別タブ・Blocklyのプレビュー・前後のスクリプト・実タブ再オープン後の印・作業ツリー不変を保持。切り戻しは Editor の当該差分を先に revert。通常 Editor CI はこのブラウザーケースを実行しないため時間短縮には含めない。

### 拡張ホストの再試行と作品URI（#823）

[Loader 0.16.1 のCI](https://github.com/kubohiroya/turbowarp-extension-loader/actions/runs/45591120258) で、再試行の対象となる応答の判定、次の試行番号、拡張を変更しても既存URIが変わらないことを実行・確認（単体230件、ブラウザー5件、skip 0）。Editor は実際の固定VMで開く際に診断が届くこと、Editor の origin を用いた最初の保存、その作品URIが後の確認画面へ渡ることを保持する。配布元のサイズ制限やその実VM境界は維持。切り戻しは、Editor側の該当テスト変更を revert する。
