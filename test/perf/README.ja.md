# #775: 実作品の応答時間

[Issue #775](https://github.com/kubohiroya/turbowarp-plus-editor/issues/775) の測定補助。製品コードや既定値は変更しない。公開SB3の完全SHA-256、固定した拡張ソース、Editorの固定ビルドと正式依存を使う。#823で所有先へ移した機能テストをEditorへ戻すものではない。実GUIの操作は固定Editorと既存Playwright、ビルドとoverviewは所有パッケージの公開APIで測定する。

## 実行

Nodeはリポジトリの対応版、ChromiumはlockfileのPlaywrightが指定するものを使う。最新mainから通常のPagesビルドを作る。GUIとPackagerのcheckoutは `site/source.json` の完全SHAに一致させる。通常の `scripts/prepublish.mjs` によるGUI準備も済ませておく。

```sh
npm ci --ignore-scripts
E2E_GUI_ROOT=/absolute/path/to/pinned/gui \
TW_PLUS_PACKAGER_ROOT=/absolute/path/to/pinned/packager \
NODE_OPTIONS=--max-old-space-size=6144 npm run build:pages
node test/perf/run.mjs --build /absolute/path/to/pinned/gui/build
node test/perf/report.mjs .host/perf/results.json .host/perf/report.md
```

既定は初回5回と、同じ各コンテキストでの再実行5回。1回目の予備確認には `--iterations 1`、経路の切り分けには `--only 1,3,6`、証跡の出力先には `--directory` と `--output` を使える。全14項目・Z/Nそれぞれに5回が揃わないJSONや、エラーを記録したJSONからは完了レポートを作れない。

対象URLとSHA-256は `kamishibai-input.json`。初回だけダウンロードし、再実行時もキャッシュのhashを確認する。公開URLの内容が変わった場合に最新のバイト列へ自動追従しない。6本の埋め込みソースをSB3から取り出し、6本の外部ソースは記録済みのhashと照合する。`translate` はVM内蔵で、個別の配布JSではない。取得元やコードの安全性をhashの一致だけで証明するものではない。

実測の[集計表](../../docs/performance/kamishibai-3.2.md)と[元サンプル・版情報](../../docs/performance/kamishibai-3.2.json)を保存している。

## 何を測るか

| # | 開始点 | 完了点・範囲 |
|---|---|---|
| 1 | 受信タブの対象File.arrayBuffer | 8ターゲットの実VM、編集中ターゲットの全トップレベルIDがWorkspaceに存在し件数も一致、2 animation frames。ブラウザー内の自動承認を含む |
| 2 | フォルダ選択の実行 | 同上。実FileSystemDirectoryHandleをCDPのブラウザー内dropで渡す準備は計測外 |
| 3 | StageのCallsタブの選択 | 実データの74節点・105辺と2 frames。関数とメッセージの関係を含む |
| 4 | StageのMessagesタブの選択 | メッセージの行と2 frames。既定の送信側の表示。描画件数も保存 |
| 5 | Z/Nメニュー項目のpointerdown | 表示中のprojectionに対応するlabelとスクリプトがあり、2 framesを経過 |
| 6 | poseIndexのinputイベント | 実検索結果が現れ、2 framesを経過。表示結果数も保存 |
| 7 | 選択したグローバル変数の置換 | 置換完了表示と2 frames。既存の選択箇所置換を使う |
| 8 | Global Variablesタブの選択 | Stageの18変数・リストのread/write 36個の集計リンクと2 frames |
| 9 | 変更比較の開始 | ファイル行のpointerdownから比較を準備し、自動で比較を展開。前後のブロックSVGと2 frames |
| 10 | Git historyの選択 | 50個のcommit行と2 frames |
| 11 | ブラウザー内の入力配列のbuffer化・SHA-256処理の開始 | 12ソースのdigestが固定値と一致。取得・認可・登録は含まない |
| 12 | sb3-toolchainのbuildSb3 | 出力まで。全回の生成SHA-256一致を確認 |
| 13 | Save Projectの実行 | 保存成功表示と2 frames。ディスクの変更値も照合 |
| 14 | Code Views公開APIの新しいoverview接続 | 実Stageワークスペースの非空ミニマップと2 frames。直後にdispose |

グラフの74節点・105辺は、Issueの「作品全体43関数・118呼び出し」という静的な件数とは別。実際の画面は選択中のターゲットとメッセージ関係に基づく。利用箇所のread/write集計リンクを判定し、他のテーブル行を変数件数に混入させない。

## 条件と限界

- ヘッドレス、1360×900、英語、ソフトウェアGPU。画面表示・OSのマウス・キーボード・実ピッカー・フォーカス切り替えは使わない。作品の緑の旗は実行しない。
- 拡張は固定したローカルコピー。外部ネットワークの速度をEditor性能に混ぜない。HTTPキャッシュはroutingによって無効で、初回／再実行はコンテキストとアプリ状態の区別。各初回／再実行の組の前にブラウザープロセスを再起動する。OSのファイルキャッシュは消さない。
- フォルダと50コミットは専用の測定ディレクトリ内で生成。識別markerのない既存フォルダは拒否し、各計測前に生成fixtureの追跡ファイルをHEADへ復元する。決定的ビルドの入力は別の不変フォルダに置く。コミットはローカルのみ。利用者の作品、Git ref、remote、認証情報は変更しない。履歴は実作品の開発史とは異なるfixture。
- #11は元の作品にないPlus形式のdigest宣言や認可を捏造しない。12ソースのbuffer化・hash照合とEditor読み込みを区別する。観測用にメインwindowのcrypto.subtle.digestを記録しているため、この計装の時間も含む。既知のソースhashと一致した観測は各回6件で、別realmやworkerの内部処理を網羅する計装ではない。
- #14は所有先の公開APIを測定用にbundleし、既に開いた実ワークスペースで初回描画を測る。Editorのロード時間や既存mapの再表示時間ではない。
- requestAnimationFrameはDOM描画の観測点で、実モニターへの提示時刻を保証しない。100ms等の閾値案は改善候補の分類用で、CIの合否条件にしない。
- 作品に偏りがあり、ターゲットを横断する高負荷や他OSへ結果を一般化しない。

## DoDと切り戻し

全項目の各5回、元サンプル、環境と各固定版、入力hash、再生成の同一性、開始・完了条件を記録する。閾値超過は改善候補として記録し、この測定に無関係な製品修正を加えない。測定スクリプトと文書だけをrevertでき、製品・保存データ・公開状態の切り戻しは不要。公開・PR・Issueへの記録は、具体的な差分と最終文面へのユーザー承認後に行う。
