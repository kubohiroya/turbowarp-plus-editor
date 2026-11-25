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
| `test/project-catalog.browser.ts` | workbench の `test/project-catalog-host.browser.ts`（[PR #128](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/128)） | `test/project-catalog-editor.browser.ts`（実 GUI のファイルメニュー・作品読込・保存との接続） |
| `test/script-transfer/format.test.ts`・`stage.test.ts`（計12件） | script-transfer の `test/format.test.mjs`・`stage.test.mjs`（[PR #6](https://github.com/kubohiroya/turbowarp-script-transfer/pull/6)） | `test/plus-integration.test.ts` の転送接続確認と `test/gui-integration/unit/plus/transfer.test.ts`、ブラウザー E2E |
| `test/extension-library/catalog-settings.test.ts`（12件） | extension-loader の `test/scratch-vm/catalog-settings.test.ts`（[PR #35](https://github.com/kubohiroya/turbowarp-extension-loader/pull/35)） | `test/extension-library/plus-library.test.cts`（画面の回答から設定 API への接続） |
| `test/project-tools/diagnostics.test.ts`（2件）と `properties.test.ts` の機能テスト13件 | workbench の `test/project-diagnostics.test.ts`・`project-properties.test.ts`（[PR #113](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/pull/113)） | 起動フラグ確認を `test/project-tools/flags.test.ts` に保持。`host.test.cts`・`dialog.test.cts` も保持 |

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

## 切り戻し

Editor のこの変更を revert し、接続コードと依存の固定を公開直前の main の組み合わせへ戻して再ビルドする。
上流候補だけを旧版へ戻すと新しい接続口がなくなるため、Editor のアダプターと同時に戻す。
作品の JSON キー・保存形式と既存機能の既定値は変えておらず、保存済み作品の移行は不要。

## 作業記録

ブランチは `refactor/editor/upstream-feature-ownership`。各上流 PR に責務・依存順・検証・受け入れ条件・切り戻しを記録した。
2026-11-19 にローカル実装を検証し、ユーザーの「マージして公開して」の指示で上流から順に公開する。
