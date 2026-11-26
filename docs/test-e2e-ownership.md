# #823 §4 E2E 棚卸し・検証記録

### 対象と結果

Editor の棚卸し基点は `6c09ab4e8eada248b0cb5ba9bdcddca1009dd57d`。実行対象は Editor `07b7ccb50fa796997dff2ad10ce41fb12d68b0f2` の固定ビルド。両者の差分に製品コード、依存の固定値、§4 の E2E 定義の変更がないことを確認した。ビルドの固定値は GUI `60b87e2f2503206847f509285aa4de3cee3670c7`、VM `88a2c06e9deb3dd652c52c20daf4f728b387d41d`、Packager `d690225b9f326c98be617a51c7c65f76758048ee`、Loader 0.16.1、Security Dialog 0.14.0、Document Editor 0.2.1、Script Transfer 0.1.5。

| 実行した検証 | 結果と範囲 |
| --- | --- |
| 基盤 | 33/33 成功。Playwright の列挙は標準49、固定入力込み52。両 SB3 経路の列挙を確認。列挙数はブラウザー実行数ではない。 |
| TurboWarp ヘッドレス | 固定入力込み51/51成功。実 GUI のファイル入力と `project_url` の両方で SB3 を保存・再読込し、復元を確認。OS クリップボードを使う別オリジン間転送1件は対象外。 |
| Extension Loader ヘッドレス | 旧形式を含む統合実行で57/57成功（旧形式を除く場合は55/55）。実際に開く別タブへの受け渡し、承認と拒否、4保存形式、IndexedDB、診断、作成・再読込、作品データ・素材、URI、再試行、TLS/CORS/CSP、メニューからの Packager を確認。統合実行には進捗2件と、異なる設定で実行する4件（公開配布2、Packager 単一 HTML 2）を含めていない。 |
| 旧形式 | 固定 VM の `single_sound.sb` と `unknown-opcode.sb2` を使い2/2成功。OS ピッカーを使わず、ブラウザー内で作った転送可能なファイルハンドルを使った。別タブで開き、上書き先を保持せず、編集可能な SB3 を出力した。 |
| Packager・公開配布 | 計7実行が成功。固定 Web 配布物から HTML を生成する3実行、別途 CLI で生成した HTML の2再実行、npm／GitHub Release の2実行。公開拡張は v0.13.0（リリースコミット `b4cd60ecf9f2a3094dc446bf1b99dabaeb89517a`）。同じテスト名による別成果物の検証を含むため、7種類の追加ケースとは数えない。 |

Desktop（アプリ起動）、macOS の実ファイルピッカー、OS クリップボードによる別オリジン間転送は実行していない。ブラウザー内のメニューやキーボード操作による転送の成功を、OS の実機検証の代替とはしない。これらの件数はローカル実行の結果であり、Editor の通常 CI 時間や実行範囲に関する主張ではない。

### 所有先と Editor に残す接続

以下は移管先の分類。製品の入口や複数パッケージをまたぐ検証は Editor に残す。同等の検証が所有先 CI で実行されたと確認するまで、既存テストは削らない。

**Extension Loader**

| 対象 | 詳細を検証する所有先 | Editor で残す境界 |
| --- | --- | --- |
| `catalog-authoring` | Loader（カタログ、依存、形式、失敗・再試行、登録）、Security Dialog（選択表示） | 実メニュー、カタログ追加、既存拡張の引き継ぎ、Packager への接続 |
| `editor` | Loader（ダイジェスト、形式、キャッシュ、ネットワーク、登録）、Security Dialog（承認・拒否）、VM（実行） | 実 SB3 起動／ファイル入力、承認から登録までの接続、起動無効化・公式ギャラリー互換、失敗時の診断 |
| `file-menu`、`manual-project-uri` | Project Folder／Workbench（保存先・メニュー）、Loader（URI）、VM（旧形式） | 実メニュー、別タブへの引き継ぎ、保存先を勝手に付けないこと、URI の SB3 往復 |
| `four-formats`、`project-payload-formats`、`resources` | Loader／Manifest（保存形式・宣言の照合）、Security Dialog（表示・選択）、VM（画像・音声） | 実 GUI の追加→保存→再読込、承認と素材が利用可能になるまでの接続 |
| `persistent-cache` | Loader（IndexedDB・設計方針） | 実ブラウザーの保存・再読込、作品 URI による分類、取得し直す場合とキャッシュ利用の区別 |
| `project-load-progress` | Workbench（進捗データ、履歴、表示）、GUI（ロード画面との接続） | 実ファイル入力での進捗の表示・完了・取消。後述の未完2件を保持 |
| `packaged`、`packager-builder` | Loader／Packager（生成、同梱、配布時承認） | 固定 Web／CLI の実成果物、オフライン実行、生成時承認と配布後承認の分離 |
| `published-distribution` | Extension Template（公開方法） | バージョンを固定した2種類の成果物を、Editor が実際に読み込み実行すること |

**TurboWarp**

| 対象 | 詳細を検証する所有先 | Editor で残す境界 |
| --- | --- | --- |
| `editor`、`fixed-inputs`、`invalid-theme` | Extension Data Editor（入力、検証、下書き、テーマ）、Loader（拡張の保存と再読込） | 通常起動、実ブロックからフォームを開く、GUIの日英表示とテーマ切替、異なる2つの SB3 入力経路 |
| `document-layout`、`document-source`、`document-refusal` | Document Editor／Document Source／Document Data（提供者、プレビュー、拒否） | 実 GUI のハットと文書ダイアログ、ホストの配置、作品を意図せず変更しないこと |
| `extension-security` | Security Dialog（表示・選択）、Loader／VM（承認の適用） | 日英の起動画面、ダイレクト起動、選択／拒否／取消から実 VM に至る接続、モバイルの表示枠 |
| `landing` | Editor | 配布ページから渡す URL・言語・設定と、不正なプロトコルの拒否 |
| `horizontal-block-palette`、`palette-delete-preview`、`workspace-minimap` | Workbench（パレット、検索、並べ替え、幅、削除予告）、Sprite Panes／Windows、GUI／Blocks | 実パレット・ブロック、ドラッグとタッチの接続、別窓でのパネル配置 |
| `project-search`、`project-replace` | Workbench、Project Model、Code Views、Document Editor | 実ワークスペースと YAML の移動・検証済み下書きとの接続 |
| `script-layout` | Code Views（並べ替え、関係、Undo）、Workbench（パネルとカーソル） | 分割パネルで操作先が正しく切り替わり、ロード中のカーソルが実 GUI に反映されること |
| `script-transfer` | Script Transfer（転送データ）、Workbench／GUI（メニュー、ウィンドウ）、Sprite Panes（ステージ） | 実メニュー、実ブラウザーの複数窓・別オリジン、ステージ素材。OS クリップボードは別途 |

### 最小化と残件

- セレクタと操作を、通常の承認／個別確認、ファイルを受け取る別タブ、日英の「更新」、現行の読み込み失敗画面に合わせた。承認前に説明を表示するための通信と、承認後の実行用フェッチを区別し、後者の回数と VM の実行を検証した。ケース数は減らしていない。
- `test/e2e/turbowarp/wait-public.cts` は #515 以後に呼び出しも出力の参照もなく、現行の配布確認は `verify-remote-editor.cts` が担当する。未使用の43行は [Editor #844](https://github.com/kubohiroya/turbowarp-plus-editor/pull/844) で削除し、前後で基盤33件と Playwright の列挙が維持されたことを確認した。固定ビルド照合、共通サーバー、事前・事後の配布物確認、報告、SB3やTLSのフィクスチャは保持する。
- 開始ページの署名付き作品 URL は、転送先 HTML の代替ではなく、実際の Editor・VM が同じ URL のクエリを使い、クリック後一度だけ読み込むことまで確認する。作品はローカル生成の拡張なし SB3 で、外部作品は実行しない。
- キャッシュ不可の規則は [Loader 0.16.1 の CI](https://github.com/kubohiroya/turbowarp-extension-loader/actions/runs/45591120258) でキャッシュの読み書きがなく取得は一度だけと確認済み。Editor の2ケースを1件にまとめ、実承認画面の選択肢と VM の実行を保持した。変更した2ファイルは統合後29件実行・成功、スキップなし。
- **未完: ローカル SB3 の進捗表示2件（完了／取消）。** 実ファイルを受け取る別タブで、拡張の承認画面までは表示されるが、`[data-project-load-progress]` が現れない。固定版の [Workbench の別タブ経路](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/blob/d935ae50683cbfc55ab55a41529c00cc7c497914/src/project-open-tabs.ts) は受信したファイルを直接 `vm.loadProject` に渡す。一方、[Editor の組み込み](https://github.com/kubohiroya/turbowarp-plus-editor/blob/6c09ab4e8eada248b0cb5ba9bdcddca1009dd57d/scripts/site/connect-project-load-progress.cts) は既存 GUI のロード画面に `ProjectLoadProgress` を載せる。実際の受信タブのみを測る切り分けでも、承認画面まで到達した2件で進捗と承認フェーズ要素はともに0件だった。承認後の拡張実行と、取消後に受信タブを閉じる動作は確認でき、元のタブは変わらなかった。別タブ経路にも同画面を結線するか、表示仕様を決め直す必要がある。既存2件は削除しない。
- **未完: 移管後の削減。** 同じ版の所有先 CI の実行を確認したが、コンポーネント内部の検証だけでは、実 Editor での入口、別タブ、配布物、VM 接続を代替できない。下記の結果は移管先の候補を選ぶ根拠であり、Editor の既存カバレッジを減らす根拠ではない。

### 所有先 CI の固定版対応

| 所有先 | 固定版の実行 |
| --- | --- |
| Loader 0.16.1 | [Loader core](https://github.com/kubohiroya/turbowarp-extension-loader/actions/runs/45591120258)。Node 230件、ブラウザー5件成功。実 VM 登録、TLSリダイレクト、CORS、CSP を確認。 |
| Security Dialog 0.14.0 | [Test](https://github.com/kubohiroya/turbowarp-extension-security-dialog/actions/runs/45555301122)。Node 151件、ブラウザー28件成功。 |
| Document Editor 0.2.1 | [CI](https://github.com/kubohiroya/turbowarp-document-editor/actions/runs/45114921120)。Node 35件、ブラウザー44件成功。 |
| Script Transfer 0.1.5 | [Test](https://github.com/kubohiroya/turbowarp-script-transfer/actions/runs/43695205955)。Node 15件成功。実 GUI のメニューや OS クリップボードの検証とは異なる。 |
| Extension Data Editor 0.11.5 | [CI](https://github.com/kubohiroya/turbowarp-extension-data-editor/actions/runs/45286526377)。78件成功、別の Node 行列は522件中468件成功、ブラウザーの別2バッチで4件と7件成功。未実行ケースは移管の証拠にしない。 |
| Workbench 0.39.0 | [CI](https://github.com/kubohiroya/turbowarp-plus-editor-workbench/actions/runs/45503360028)。単体238件、ブラウザー／GUI 13件成功。固定 GUI を必要とする一部ケースの成立はこの実行からは判断しない。 |
| Code Views 0.26.5 | [CI](https://github.com/kubohiroya/turbowarp-plus-editor-code-views/actions/runs/45495163888)。単体178件、ブラウザー87件成功。 |

変更対象はテストと補助コードのみ。メッセージ線の正確な破線パターンは Code Views の実行済みテストで検証し、Editor には実ビルド上での表示差と VM の編集・ undo の接続を残す。製品コードや通常 CI の対象は変更しない。
