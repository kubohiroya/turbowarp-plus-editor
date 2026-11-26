# Editor の単体・GUI 結合テストの分類

[#823 §3](https://github.com/kubohiroya/turbowarp-plus-editor/issues/823) の対象を、機能の所有先と
Editor 固有の接続口で分類する。監査基準は Editor `5b6c900`、GUI
`60b87e2f2503206847f509285aa4de3cee3670c7`、VM `88a2c06e9deb3dd652c52c20daf4f728b387d41d`。
browser、E2E、試作補助、および `test/package/` はこの表の対象外。

- **保持**: 版固定・配布物と、Editor の起動設定、責務境界、接続口の検証。
- **分割候補**: 機能の所有先で同じ条件と期待値が実行された証拠が揃うまで、現行テストを保持する。
- GUI 固有のコードやテスト素材は、出自とライセンスを確認せず MPL-2.0 パッケージへ移さない。

| Editor suite | 担当・判定／保持する接続口 |
| --- | --- |
| extension-host/host | Editor⇆Loader⇆固定 VM。OFF、許可フックが登録より先、catalog trust、単一 HTML に埋込した digest、実 DOM 承認〜キャッシュ再開、Error diagnostics の callback、配布元の 64 MiB 制限は残る。再試行回数/404 の機能分岐は Loader が所有。実 VM 40 MiB JSON/SB3 は配布上限＋native VM parser の組合せで、上流の小サイズ IO fixture とは同等ではない。 |
| extension-host/authoring, security-review | Loader の登録ロールバック、Loader／security-dialog の許可がコア所有。固定 VM の旧 URL fallback、設定された host UI が無い/破棄時に実行しない、失敗時の既存拡張維持は統合なので保持。純機能の更なる分離は同一契約で逐次。 |
| extension-host/batch-review, unified-review, review-key-events | Loader の事前検証・承認/キャッシュ選択、security-dialog のフォーム/行・確認、GUI の native prop/キー隔離を分離。ZIP 名前、Plus＋通常拡張、VM 実行モード、以前の session 承認に対する今回の否認は host→Loader の実データ結線。行列を減らす場合は各所有先で対になる assertions、CI と既存結線の残存を照合してから。 |
| extension-host/project-cache, project-size-gate, project-uri | Cache 内部・URI 保持・サイズ測定/同意行列は Loader。Editor の cache factory ポート、catalog digest Set、現在の作品切替、メモリ fallback、単一 HTML に IndexedDB/save wrapper を混入させないこと、サイズ配布ポリシーと実 VM、origin と review の接続は保持。今回は URI が変更で消えないという再テストのみ削減。 |
| extension-host/pinned-host, test-errors | 実 GUI の VM モジュール／エラーラッパーなど suite helper。テスト件数には含めない。 |
| extension-library/flags, harness | Loader・Plus tab の配布起動フラグ、no-window fallback／実 GUI 解決 helper。維持。 |
| extension-library/plus-library | Loader の transitive deps・実行許可・選択形式・可逆ロールバック、security-dialog の文言・リトライ表示は分割候補。現在は pinned GUI test harness と editor site library、Load failure 生成を跨ぐ。preview 破棄時の parent navigation、Loader OFF、GUI review 決定値の渡し方は境界。文言・表示の既存重複は除去。依存・実行許可の行列は別途照合。 |
| packager/handoff | Editor⇆GUI native popup／Loader Packager。Plus 作品のみ owned ページへ振分け、非 Plus は native fallback、popup block、same-origin sender と要求後 serialization は配布プロトコル。純判定行列を Loader に移せるかは同等 provenance が必要。 |
| block-editor/{fixed-inputs,icon,modal,source-forms} | block-editor package の service/UI 詳細は上流。Editor の固定 GUI Intl と VM ごとのサービス、native ReactModal portal、default-on と旧成果物 capabilities は境界。単一サービス lifecycle は上下の役割を分離し、availability/init/do not dispose others を弱めない。 |
| gui-integration/{checkout-layout,ownership} | Editor の checkout resolver と pin 先 GUI の upstream source inventory、撤去済み module への参照再発を守る。全保持。 |
| gui-integration/unit/block-editor/{preview-vm,service,startup,workspace} | Editor GUI adapter/固定 GUI。VM service descriptor の exact restore と native primitives refresh、service 不在時の native GUI API、locale、既知 addon readiness、VM 世代変更と workspace dispose。純機能の owner は block-editor だが VM/GUI のポートと lifecycle は保持。 |
| gui-integration/unit/components/controls | Workbench が own する controls UI/state の詳細と native GUI slot⇆port 境界が混在。stage recorder/menu bar、panel node の所有、subscription disposer、VM とサイズの forwarding は結線。UI matrix は Workbench の既存実行証拠との照合候補。 |
| gui-integration/unit/document-editor/attachment | Document Editor 機能は上流、locale/document/Blockly/VM/translation/deserializer/detached root と dispose/replacement/error の native ハンドオフは Editor。維持。 |
| gui-integration/unit/extension-loader/load-failure | Loader が判定、Editor bridge が error identity／empty or broken formatter を保つ。契約のため保持。 |
| gui-integration/unit/extension-security/{cancel,keyboard,local-preview,plus-library,runtime-disposed,helpers} | GUI native route/error/modal/keyup と footer/library category+query＋props、Editor の snapshot preview script の integrity と exact serving、VM 破棄で取消/権限解除を守る。dialog 側 wording/mode 行列のみ別。helpers は pinned checkout を require hook で解決する試験基盤。 |
| gui-integration/unit/plus/{extension-host,integration-points,transfer} | GUI の無 host fallback、注入ネイティブ資材/起動 snapshot、cancel and trust port、host declaration、locale remount、stage/Backdrop menu と workspace dispose。機能所有 Loader/Workbench/script-transfer とは別の seam。 |
| gui-integration/unit/plus/web-fonts | Fonts 所有の未知参照・拒否・重複追加の分岐を分離。固定 GUI の FontManager、レンダラー、保存と Packager の組合せは独自の結線。§1 #5 の font dialog 行列を重複計上しない。 |
| project-tools/{dialog,flags,host} | Workbench 側の dialog/form/history・diagnostics 表示詳細、Loader/codec の保存機能、SB3 save format は機能所有候補。Editor には dialog stylesheet と shared cancel classifier、既定 ON、失敗時 popup＋native corner log suppression、real VM⇆Loader⇆project props による bytes/metadata/authoring ownership を残す。 |
| controls-dock,stage-controls,plus-integration (test/直下) | Editor の App Shell symbol と Workbench service、document mount/ownership/dispose、VM locale/host points を守る。service の一般状態は Workbench、App Shell 浮動 dock と Editor の toolbar adapter は実装/仕様が異なる。 |
| editor-revision,extension-artifact,family-notices,layout-package,npm-pins,pinned-gui,yaml-build,yaml-cli | pin/metadata/distribution/license/source/default/publisher/CLI 配布エントリ。機能移管対象にしない。layout-package の Desktop vs project layout の一例は Desktop 契約。 |
| extension-loader (test/直下) | Site bootstrap の OFF、loader trust、引き渡し/後片付けと startup flags 全般。cleanup failure の細い行列は Adapter 本体の ownership と上流契約比較後にのみ分割可能。 |
| package (test/直下) | 本配布物の embed/編集 URL 契約、署名クエリ・HTML escape・アクセシブル名・配布元 pin。独立の feature 所有が確認できるまでは保持（単一の URL helper upstream 候補）。 |
| plus-catalog,trusted-extensions | 公開 catalog URL、preview/production source/credentials、digest variant parsing、packaged trusted digests は本配布の trust policy。共有 API/複数形式 fallback などの純機能は Plus Packages/catalog owner と比較が必要。 |
| sb3-save-format-cli | CLI 引数/4形式の名称互換/実変換の programmatic entry/access safety は Editor CLI→security-dialog→SB3 codec 契約。CLI が生成する ZIP 全体の往復と4形式の再変換を維持。ZIP 内のペイロードと搬送用 URL の反復だけを writer に委ねる。 |
| reuse-pr-verification,verification-{evidence,execution,plan} | Editor CI の tree binding、artifact/判定・Docs selective、未実行時 fallback、release gate。機能パッケージへ移さない。 |

## 既存上流テストと照合して削減した重複

| Editor で保持する接続口 | ピン留めした上流で実行された検証 |
| --- | --- |
| `project-tools/host.test.cts`: 実 VM の digest エラー、詳細ログへの接続、作品メタデータと拡張の保存・作成、準備段階のエラー表示。 | [Workbench #159 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/45731519550) でメタデータ ON/OFF のエラー後の診断復旧を実行。不要な通知を出さないこととタイトル維持の重複のみ減らした。Project Tools 実装は固定版 0.39.0 と同じ。 |
| `block-editor/{source-forms,fixed-inputs}.test.ts`: 実GUIへの機能公開と固定入力の日英ラベル。 | [Data Editor 0.11.5 の CI](https://github.com/kubohiroya/turbowarp-extension-data-editor/actions/runs/45286526377) が旧 API の正規化と未提供機能の非公開を実行。実GUIの言語連携は Editor に保持。 |
| `block-editor/icon.test.ts`: 実パッケージの登録が同じ VM の GUI まで届き、別 VM には届かない。 | [Data Editor 0.11.5 の CI](https://github.com/kubohiroya/turbowarp-extension-data-editor/actions/runs/45286526377) で登録ごとの通知と、登録解除を繰り返しても状態が変わらないケースが実行・成功。 |
| `extension-host/host.test.ts`: 固定 VM で作品を開く途中に、再試行の次の番号・上限・対象 URL が Editor の診断コールバックに届く。 | Loader 0.16.1 (`e4b784d7e5269659b014ddbb01250e9d6da538bd`) の [CI 実行結果](https://github.com/kubohiroya/turbowarp-extension-loader/actions/runs/45591120258)。[HTTP 状態の行列](https://github.com/kubohiroya/turbowarp-extension-loader/blob/e4b784d7e5269659b014ddbb01250e9d6da538bd/test/fetch-retry.test.ts) は 404 を 1 回で打ち切り、`FETCH_FAILED` となることを検証。再試行レポートの番号・上限と、実 VM を使う再試行可否の行列も実行済み。 |
| `extension-host/project-uri.test.ts`: Editor のオリジンを使う初回追加から、固定 VM の SB3 保存、Editor のレビューで同じ URI を読むところまでを確認する。 | 同じ Loader CI で拡張変更後にも URI が維持されるケースと、[URI 付与の行列](https://github.com/kubohiroya/turbowarp-extension-loader/pull/44) を実行。Editor 固有の初回保存・キャッシュ接続は別テストに保持。 |
| `extension-library/plus-library.test.cts`: 失敗情報と再試行コールバックをレビューに渡し、そのコールバックで元の選択を再送し、成功時に正しい画面へ戻る。 | Security Dialog 0.14.0 (`f161f0f4c3cf4d623fcfcd16f0586fd52a88d19f`) の [CI 実行結果](https://github.com/kubohiroya/turbowarp-extension-security-dialog/actions/runs/45555301122)。[レビュー表示](https://github.com/kubohiroya/turbowarp-extension-security-dialog/blob/f161f0f4c3cf4d623fcfcd16f0586fd52a88d19f/test/review.test.cts) は日本語の再試行文言、再試行不可時のエラーのコードと本文・ボタン非表示、追加モードの言語別行列を実行。 |
| `gui-integration/unit/plus/web-fonts.test.ts`: 固定 VM でフォント用の参照を保存し、Packager では参照だけを除く。失敗時に代替フォントで描画し、利用不能なフォントを renderer に登録しない。 | [Fonts #2 の CI](https://github.com/kubohiroya/turbowarp-plus-editor-fonts/actions/runs/45724298634) で未知・不一致、拒否、オフライン、重複・追加を確認。8 件成功、スキップなし。 |
| `sb3-save-format-cli.test.ts`: CLI の両方向と各形式で ZIP 全体のバイト同一性を確認し、引数、出力先と安全性の検証を維持。 | [SB3 Save Format 0.5.1 の CI](https://github.com/kubohiroya/turbowarp-sb3-save-format/actions/runs/45039887803) で writer の搬送ペイロードの完全一致と旧 URL の消去を確認。全 53 件成功。 |

上記の CI ログで、Loader は単体 230 件・ブラウザー 5 件、Security Dialog は単体 151 件・
ブラウザー 28 件が成功し、いずれもスキップ 0 件だった。今回の差分は既存の上流検証を
利用して Editor の重複を削るものであり、新規移管の件数ではない。

Editor では Node 26、固定 GUI と VM で `npm run test:extension-host` 54 件、
`npm run test:gui-integration` 73 件、`npm run test:project-tools` 6 件が成功し、
いずれもスキップ 0 件だった。画面の表示や OS 入力は行っていない。
切り戻す場合は Editor 側の該当テストの変更を戻す。上流のテストは変えない。

## 未完了の判断

分類表の「分割候補」は移管済みではない。特に Plus Library の依存・実行許可・失敗回復、
Workbench の controls 表示、Fonts のカタログ・ダウンロード・代替表示、SB3 の変換行列は、
接続口だけを残せるかケース単位で照合する。既存の上流検証と同等でなければ、
所有先の追加テストと CI を先に整える。Packager・project-tools・起動処理の候補も
機能と接続口の切り分けが済むまでは維持する。分類しただけでは #823 §3 の最小化完了としない。
