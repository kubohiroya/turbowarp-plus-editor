# 拡張ローダーの統合（Embedded / Remote 拡張）

## 実装場所と依存方向

Manifest、取得、SHA-256、認可、依存順、診断、キャッシュ、SB3保持、VM登録・復元とロード/保存処理は独立した [`turbowarp-extension-loader`](https://github.com/kubohiroya/turbowarp-extension-loader) が持つ。拡張一覧・許可・再試行と作品を開く前のレビューは `turbowarp-extension-security-dialog`、作品データの調査・保存形式の変換は `turbowarp-sb3-save-format` が持つ。本リポジトリの `site/extension-host/` は起動設定・信頼方針・IndexedDBキャッシュの選択と、GUI・Packagerの値やコールバックを各パッケージへ渡す接続を担当する（[責務の一覧](upstream-feature-ownership.md)）。`scratch-gui` フォークは差し込み口（[差し込み口の設計](plus-integration-sockets.md)）を持つ。VMは拡張を所有サービスとして登録するportを持つ（差分は `scripts/site/patches/scratch-vm-host-extension-service-port.patch` にも保持）。

Loaderはnpmの完全一致版（`package.json` と `package-lock.json` の版・integrity。公開元コミットはnpmのprovenanceと `v<版>` タグでたどる）で、GUI・VM・Packagerは完全SHAで固定する。通常ビルドがLoader入りのscaffolding・runtime・ローカルPackager画面を生成し、artifact gateが依存の固定値・既定ON・資産hashを検証する。

## 起動と信頼境界

通常起動（フラグ未指定）では既定ONとなる。`twPlusExtensionLoader=1` もON、`=0` および不正値はOFFとなる。起動後のURL変更から有効化せず、作品の設定を起動フラグとして使わない。読み取りは `config/feature-flags.ts` が担当する。従来の `twPlusExtensions` とは独立している。

ホストが静的に組み込んだLoader、UI、VM registrarを接続する。作品からLoader・認可ポリシーを取得しない。coreが検証したexact bytesと取得元をUIへ渡し、id・取得元・発行者の未検証の申告・version・digest・unsandboxed要求・capabilityを表示する。拒否・Esc・閉じる・abortは拒否となる。承認はホストセッション内で要求の全情報に束縛し、破棄時に失効する。明示的な外部ホストポリシーをUI前に適用し、拒否をユーザー操作で上書きしない。

SHA-256はバイト列の一貫性の検証であり、安全性や発行者本人性の証明ではない。RemoteはHTTPSのみ、資格情報・fragment・redirect・未証明の最終URLを拒否する。Loaderのメモリキャッシュは既定8 MiB/1時間のセッションLRUで、Editorは利用可能ならIndexedDBの永続キャッシュを接続する。`remote-cacheable` の検証済みコードを作品のURIと結び付けて保持し、利用者がキャッシュを辞退した場合は保存しない。ヒット時にも再検証・認可する。通信不能時に異なるdigestのコードへフォールバックしない。

コアは全件を検証・認可してから登録する。認可証跡はコピーできないtransaction限定の証跡で、作品の自己申告を受け付けない。registrarはVMが提供する所有サービスportへ登録し、getInfo().idを照合してからVMブロックを登録する。失敗時は所有サービス・primitive・hat・category等を解除し、失敗したホストを再利用しない。任意の特権JSによるネットワーク・DOM等の副作用は巻き戻せない。承認後のJS評価でID不一致を検出した場合は登録を拒否する。

## SB3と保存互換性

`project.json.turboWarpPlus` とZIP内 `extensions/` のJSを使う。Plus固有の形式であり、標準SB3仕様ではない。Manifestには拡張ごとのsource/execution要求/digest/任意のversion等を保持する。executionと申告publisherは認可ではない。

VMは元の作品オブジェクトとZIPを保存時に作り直すため、未知フィールドや追加ZIPエントリを自動保持しない。Loader codecがロード時の文脈を保持し、保存処理（`toJSON` / `_saveProjectZip` / `saveProjectSb3DontZip`）からcoreの保持処理へ委譲する。標準extensionsとPlusの元URL metadata、unknown data、埋め込みバイト列を保存する。sprite単体の書出しに作品Manifestを混入しない。

ZIPはcentral directoryを展開前に検査し、重複・危険なパス・未知圧縮・ZIP64・過大サイズ等を拒否する。展開中にも実容量・CRCを照合する。Manifest無しは登録処理を呼ばず既存ロードへ委譲するが、ZIPの安全性制限は適用する。厳格な対応ZIP subset・サイズ上限はLoader READMEを正とする。

Legacy Data URLは自動で信頼済みPlus形式へ昇格しない。coreの明示移行APIでdigestとホスト承認を要求する。Embedded/Remote変換はexact bytesとlock/license/provenance metadataを保持し、Remote出力の公開用バイト列を返す。変換APIが外部へ公開することはない。

## Packagerと単一HTML

Plus作品のPackager操作は同一originの `plus-packager.html` へ進む。通常作品は従来の外部Packagerへ進む。ファイル入力または同一origin・元window照合済みpostMessageで作品を受け取る。作品が独自bootstrapや生成JSを供給することはない。

生成時はcoreの同一検証・認可APIでRemoteをEmbeddedへ変換する。外部依存が無いことの明示確認を要求し、未同梱の依存資源やlegacy custom URLが残る作品を拒否する。固定したPackagerへ完全なSB3をblobとして渡し、作品ロード前に信頼済みLoader/hostを起動する。JSONへ分解して埋め込みコードを失わない。

Editorと別のVMバンドルでdispatchを二重保持しないため、追加したVM portを使うscaffoldingを公式ソースから作る。runtime/scaffoldingを静的なローカルbuilderへ組み込み、生成HTMLへ全て同梱する。生成時の承認をHTMLに埋め込まず、HTMLを開くたびに再確認する（承認はそのページを開いている間だけ有効）。ただしカタログに載っている拡張は、Editorと同じく信頼済みとする。HTMLは実行時にカタログを読めないので、生成時にカタログと照合した拡張のSHA-256だけをHTMLに埋め込み、HTMLを開いたときは、実際のバイト列がそれと一致するコードだけを確認なしで実行する。CSPはconnect-src none等を指定し、実行時の外部取得に依存しない。依存資源がある拡張の自動バンドルは行わず拒否する。

## 実行環境

| 環境 | 動作 |
|---|---|
| Editor（オンライン） | Embedded/Remote、許可UI、実VMアクセス、保存・再読込 |
| Editor（オフライン） | Embedded、検証済みcache hit、cache miss拒否 |
| 単一HTML | カタログにない拡張はHTMLを開くたびに再承認、カタログの拡張は確認なしで実行、file URLとオフラインで動作 |
| TurboWarp Desktop | 生成HTMLは動作する。標準EditorはLoader無しで自己申告JSを実行せず、未知Manifest/ZIP entriesを保存時に破棄する |
| 標準TurboWarp / 非対応ホスト | 事前bootstrap無しに本機構の特権を得られない。未知情報の保持は保証しない |

保持対応のないエディターでの再保存は変換手段として使わない。

## ビルドと検証

`site/source.json` のGUI revisionとPackager revisionを専用checkoutへ取得し、GUIで `npm ci` と `node scripts/prepublish.mjs` を実行してから、通常のビルドを行う。

```sh
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui \
TW_PLUS_PACKAGER_ROOT=/absolute/path/to/pinned/packager \
NODE_OPTIONS=--max-old-space-size=6144 npm run build:pages
npm run test:extension-host
```

通常buildがscaffolding、runtime、ローカルbuilderを生成し、ソースの固定値と生成assets hashを検証して、`build-info.json.extensionIntegration` に依存の固定値・資産hash・既定ONを記録する。プレビュービルド（`npm run build:extension-preview`）も同じ通常buildを呼び、作業ツリー情報を追加する。悪意あるZIP・キャッシュ汚染/失効・変換・compiler実行はLoaderと実VMの単体テストで検証する。

## 無効化

URLに `twPlusExtensionLoader=0` を指定して再起動すると拡張ロードを停止する。終了時はhost.disposeを待って登録を解除し、rollback/unload失敗時はVMを破棄する。Plus作品を保持非対応の状態で上書き保存しない。

## 機能拡張一覧の追加UI

既存Security Dialogの機能拡張一覧に、全パッケージ一括／個別のEmbedded・Remote設定と実行モードを接続している。読み込み済みのチェック・実際の実行モード・保存された配布方式を復元する。

sandboxed／unsandboxedの4組合せに対応する。VM所有portのiframe経路は、検証済みJSを隔離実行し、ID・RPC応答・worker/service所有権を検査する。標準のlegacy経路で既に読み込んだ拡張も、所有権を一時detachしてからPlus登録へ移し、登録失敗時は元の状態へ復元する。旧resourceの不可逆なdispose後に失敗した場合は、元SB3を保存して回復するよう案内する。

一覧からSB3保存・単一HTML出力までの操作は [機能拡張一覧でEmbedded／Remoteを設定する](extension-authoring-ui.md) を参照。ローカルカタログの差し替えは明示プレビュー限定である（[ローカルのカタログ表示差分を確認する](local-catalog-preview.md)）。
