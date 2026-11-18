# Editor の機能実装を上流へ移す変更

対象 Editor は `fd11930fa10eaad70b8332eb76b34f9888a59157` をベースとする。既存の機能の責務を移し、新しいパッケージや起動フラグは作らない。
固定 GUI は `e9d05e0f6f931693f95eaf40245b3bde2d76d283`、VM は `e623546e0e173d70e0314d06d8a17bf84c72afeb` のまま。GUI ソースへの変更はない。

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

## 固定したローカル候補

次のコミットとアーカイブは未公開。上流はそれぞれ独立した Git リポジトリで、Editor の workspace パッケージを再作成していない。
アーカイブは `site/source.json` の `packageArchives` と npm lockfile で完全版・コミット・SHA-512 を固定する。
ビルド前にアーカイブの実バイト列と、manifest・lock・導入版を照合する。security-dialog は build-info のコミットと `sourceState: commit` も照合する。
配布物のライセンス台帳には未公開候補であることを記録し、検証済みアーカイブ自体を `notices/<package>@<version>/source.tgz` に同梱する。成果物検証も同梱ソースの SHA-512 を照合し、出所を固定していないローカルアーカイブは引き続き拒否する。

| パッケージ | 候補の完全版 | コミット | ベース |
| --- | --- | --- | --- |
| @kubohiroya/turbowarp-plus-editor-code-views | `0.21.3-ownership.0` | `ed0600e2385011ef87ff66f7d84b3bc32588094e` | `f2a2a742adaa33838b72d35229d1d88be44d6f04` |
| @kubohiroya/turbowarp-plus-editor-workbench | `0.27.1-ownership.0` | `1e7849a16339325b77ab8605437a7c84b2120863` | `4315ae6283543a18386fa0835ad14d3a598f96f3` |
| @kubohiroya/turbowarp-extension-loader | `0.11.2-ownership.2` | `82bb54d31880483ff4d7a27387b39da4f5f40884` | `438f5b5a5acf403be9dd3f5900a848819b36ca0e` |
| @kubohiroya/turbowarp-extension-security-dialog | `0.9.1-ownership.0` | `8d750ae16362bf6256b7214880eecd6b2773433a` | `3b5531912d7999a85c96f2cfcfdc9d3fb2e222fb` |
| @kubohiroya/turbowarp-sb3-save-format | `0.4.0-rc.3-ownership.0` | `265fcb3042c7840f1c877f881ad26197a4834d2f` | `46cf5890d57f77186db046e0ca5b3eb49cb687b5` |

上流の作業ブランチは `refactor/editor/feature-ownership`。ローカルの複製は `.host/upstream/<directory>`、復元用 Git bundle は `.host/review-bundles/` にある。
公開済み npm 版を差し替えない。公開操作の承認を得て上流を公開した後は、承認した版・バイト列を照合して通常の npm pin に置き換えられる。

## 受け入れ条件と検証

- 移管したアダプターがローカルの UI、クラス、Map / Set の機能状態を所有しないことを `test/package/feature-ownership.test.ts` で検出する。
- 各上流の型チェックと、パレットの破棄、作品メタデータ・診断・ダイアログ、カタログ設定、画面の取消・破棄・再試行、4 保存形式の往復・改ざん拒否を単体で確認する。
- Editor の型チェック、拡張ホストと作品ツールの結合テスト、固定アーカイブの検証を行う。
- 固定 GUI の製品ビルドを作り、横パレット・削除予告・コード表示・拡張の許可と保存形式をヘッドレス Chromium で確認する。
- Desktop の実ウィンドウ、OS のフォーカスやカーソルを使う検証は実行しない。

## 切り戻し

Editor のこの変更を revert し、接続コードと依存の固定を `fd11930` の組み合わせへ戻して再ビルドする。
上流候補だけを旧版へ戻すと新しい接続口がなくなるため、Editor のアダプターと同時に戻す。
作品の JSON キー・保存形式と既存機能の既定値は変えておらず、保存済み作品の移行は不要。

## Issue 追記案（未投稿）

関連: [Editor #1](https://github.com/kubohiroya/turbowarp-plus-editor/issues/1) の組み立て・配信責務、
[Editor #462](https://github.com/kubohiroya/turbowarp-plus-editor/issues/462) の上流での機能検証。

- ブランチ: `refactor/editor/upstream-feature-ownership`。
- 依存と順序: 上流 5 件の API・テスト → 固定アーカイブ → Editor の接続・統合検証。公開は承認後に上流 → Editor の順。
- start: 2026-11-19 JST。残存実装の調査、著作権者の MPL 提供承認、既存パッケージへの移管を実施。
- 検証中に判明した境界: Webpack 4 の exports 解決、GUI の表示設定の循環 import、移管した CSS の参照先を接続側で修正。
- DoD と切り戻しは上記の通り。Issue の作成・編集・コメント、push、PR、npm publish は行っていない。
