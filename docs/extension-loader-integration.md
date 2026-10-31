# Issue #4: Embedded / Remote拡張の統合

親仕様: https://github.com/kubohiroya/turbowarp-plus-editor/issues/4

## 実装場所と依存方向

Manifest、取得、SHA-256、認可、依存順、診断、キャッシュ、SB3保持、配布元変換は独立した `turbowarp-extension-loader` に集約した。`scratch-gui` は許可UI、VM登録、ロード/保存フック、Packagerとの受け渡しだけを担当する。Editorは固定GUIのビルド・配信と統合E2Eを所有する。

| 構成 | 固定した基点 | ローカル変更 |
|---|---|---|
| scratch-gui | `9868fa1f600a4ba60840699563b870b20d3e82ed` | `.host/scratch-gui` の薄いアダプター・UI・出力画面 |
| scratch-vm | `55fd9b7c9509827c9cec31482aa63f2d57ec564d` | `.host/scratch-vm-issue4` の所有サービスport（43行追加） |
| Packager | `c115bdf525c5f49f0fb689a21b335ccb70fc22d2` / npm `3.14.0` | ソースを改変せず、上記VMを使ってscaffoldingをビルド |
| data-editor | npm `0.6.0` / source `91533dbbffa9eb9d3b50be8084b85dae5184f9dc` | 共通フォーム・固定入力・プレビュー登録API |
| security-dialog | npm `0.3.3` | 既存UI・通常カスタム拡張の方針を維持 |

Loaderは [kubohiroya/turbowarp-extension-loader](https://github.com/kubohiroya/turbowarp-extension-loader) が所有する。GUIのpackage/lockfileはLoaderとVMをGitの完全SHAで固定する。通常配信の `site/source.json` と、統合プレビューの `site/extension-source.json` は、ともにマージ済み統合GUIを固定する。通常ビルドがLoader入りscaffolding/runtime/ローカルPackager画面を生成し、artifact gateが依存SHA・既定ON・資産hashを検証する。既存のscratch-gui作業ツリーは変更せず専用checkoutを使う。

## 起動と信頼境界

通常起動（フラグ未指定）では既定ONとなる。`twPlusExtensionLoader=1` もON、`=0` および不正値はOFFとなる。起動後のURL変更から有効化せず、作品の設定を起動フラグとして使わない。Editor公開APIの読取は `config/feature-flags.js`、GUIの接続は `startupPlusExtensionHost` が担当する。既定ONで、従来の `twPlusExtensions` とは独立している。

ホストが静的に組み込んだLoader、UI、VM registrarを接続する。作品からLoader・認可ポリシーを取得しない。coreが検証したexact bytesと取得元をUIへ渡し、id・取得元・発行者の未検証の申告・version・digest・unsandboxed要求・capabilityを表示する。拒否・Esc・閉じる・abortは拒否となる。承認はホストセッション内で要求の全情報に束縛し、破棄時に失効する。明示的な外部ホストポリシーをUI前に適用し、拒否をユーザー操作で上書きしない。

SHA-256はバイト列の一貫性の検証であり、安全性や発行者本人性の証明ではない。RemoteはHTTPSのみ、資格情報・fragment・redirect・未証明の最終URLを拒否する。キャッシュは既定8 MiB/1時間のセッションLRUで、ヒット時にも再検証・認可する。通信不能時に異なるdigestのコードへフォールバックしない。

コアは全件を検証・認可してから登録する。認可証跡はコピーできないtransaction限定の証跡で、作品の自己申告を受け付けない。registrarはVMが提供する所有サービスportへ登録し、getInfo().idを照合してからVMブロックを登録する。失敗時は所有サービス・primitive・hat・category等を解除し、失敗したホストを再利用しない。任意の特権JSによるネットワーク・DOM等の副作用は巻き戻せない。承認後のJS評価でID不一致を検出した場合は登録を拒否する。

## SB3と保存互換性のADR

v1は `project.json.turboWarpPlus` とZIP内 `extensions/` のJSを使う。Plus固有の形式であり、標準SB3仕様ではない。Manifestには拡張ごとのsource/execution要求/digest/任意のversion等を保持する。executionと申告publisherは認可ではない。

VMは元の作品オブジェクトとZIPを保存時に作り直すため、未知フィールドや追加ZIPエントリを自動保持しない。Loader codecがロード時の文脈を保持し、GUIは `toJSON` / `_saveProjectZip` / `saveProjectSb3DontZip` からcoreの保持処理へ委譲する。標準extensionsとPlusの元URL metadata、unknown data、埋め込みバイト列を保存する。sprite単体の書出しに作品Manifestを混入しない。

ZIPはcentral directoryを展開前に検査し、重複・危険なパス・未知圧縮・ZIP64・過大サイズ等を拒否する。展開中にも実容量・CRCを照合する。Manifest無しは登録処理を呼ばず既存ロードへ委譲するが、ZIPの安全性制限は適用する。厳格な対応ZIP subset・サイズ上限はLoader READMEを正とする。

Legacy Data URLは自動で信頼済みPlus形式へ昇格しない。coreの明示移行APIでdigestとホスト承認を要求する。Embedded/Remote変換はexact bytesとlock/license/provenance metadataを保持し、Remote出力の公開用バイト列を返す。変換APIが外部へ公開することはない。

## Packagerと単一HTML

Plus作品のPackager操作は同一originの `plus-packager.html` へ進む。通常作品は従来の外部Packagerへ進む。ファイル入力または同一origin・元window照合済みpostMessageで作品を受け取る。作品が独自bootstrapや生成JSを供給することはない。

生成時はcoreの同一検証・認可APIでRemoteをEmbeddedへ変換する。外部依存が無いことの明示確認を要求し、未同梱の依存資源やlegacy custom URLが残る作品を拒否する。Packager 3.14.0へ完全なSB3をblobとして渡し、作品ロード前に信頼済みLoader/hostを起動する。JSONへ分解して埋め込みコードを失わない。

Editorと別のVMバンドルでdispatchを二重保持しないため、追加したVM portを使うscaffoldingを公式ソースから作る。runtime/scaffoldingを静的なローカルbuilderへ組み込み、生成HTMLへ全て同梱する。生成時の承認を受け取り側の承認として埋め込まず、HTMLで再確認する。CSPはconnect-src none等を指定し、実行時の外部取得に依存しない。依存資源がある拡張の自動バンドルは初期版では行わず拒否する。

## 実行環境

| 環境 | 確認した動作 |
|---|---|
| ローカル統合Editor online | Embedded/Remote、許可UI、実VMアクセス、保存・再読込 |
| 同Editor offline | Embedded、検証済みcache hit、cache miss拒否 |
| 単一HTML | 公式Packager生成、受け取り側の再承認、file URLとoffline、実ブロック実行 |
| TurboWarp Desktop 1.17.0 / Electron 43.8.3 | 専用プロファイルで生成HTMLを実行。標準EditorはLoader無しで自己申告JSを実行せず、未知Manifest/ZIP entriesを保存時に破棄 |
| 標準TurboWarp / 非対応ホスト | 事前bootstrap無しに本機構の特権を得られない。未知情報の保持は保証しない |

Desktopの本体や元のユーザープロファイルへ改変を加えていない。署名版はNode inspector fuseが無効なので、独立プロセスのrendererへChromium CDPで接続して測定した。保持対応のないエディターでの再保存は変換手段として使わない。

## 検証と再現

```sh
E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" \
TW_PLUS_PACKAGER_ROOT="$PWD/.host/packager-issue4" \
NODE_OPTIONS=--max-old-space-size=6144 npm run build:pages

E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" node test/e2e/extension-loader/prepare-packaged.mjs

E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" npm run test:e2e:extension-loader
node --test .host/scratch-gui-issue4/test/unit/extension-loader/*.test.mjs
npm --prefix .host/turbowarp-extension-loader test
npm test
npm run test:extension-loader:desktop
```

新しい環境では `site/extension-source.json` のGUI revisionとPackager revisionを専用checkoutへ取得し、GUIで `npm ci` と `node scripts/prepublish.mjs` を実行する。LoaderとVMはGUIの固定Git依存から取得されるため、ローカルの兄弟ディレクトリやnode_modulesへの手作業パッチは不要。VMパッチはレビュー資料として `scripts/site/patches/scratch-vm-host-extension-service-port.patch` にも保持する。通常buildがscaffolding、runtime、ローカルbuilderを生成する。E2E用の単一HTMLはprepare-packaged.mjsで生成する。preview buildも同じ通常buildを呼ぶ。ソースの固定値と生成assets hashをビルドで検証し、`build-info.json.extensionIntegration` に通常配信の依存SHA・資産hash・既定ONを記録し、プレビューのみ作業ツリー情報も追加する。

検証証跡は `test-results/extension-loader/results.json`、`.host/issue-4-artifacts/*tests.log`、`desktop-result.json` とDesktop screenshots。Embedded/Remote実行、拒否・Esc・改ざん・未知schema・信頼偽装・ID不一致、real TLSのCORS/redirect拒否、CSP、cache offline、URL/ローカルファイル、公式Bitwise/標準Pen、従来カスタム拡張の回帰を検証する。悪意あるZIP・キャッシュ汚染/失効・変換・compiler実行はcore/実VMの単体テストで検証する。

## 切戻しと公開境界

起動パラメーターを外すか0にして再起動すればOFFへ戻る。終了時はhost.disposeを待って登録を解除し、rollback/unload失敗時はVMを破棄する。Plus作品を保持非対応の状態で上書き保存しない。

通常配信は統合GUIの固定SHAへ切り替え、機能フラグはユーザーの明示指示により既定ONとする。通常CIは既存24件と拡張15件のブラウザーE2E成功後だけ成果物を公開可能にする。公開後も固定された出所を照合して同じE2Eを実行し、単一HTMLのテストは配信されたbuilderから実際に生成したHTMLを使う。通常配信の切戻しは今回の切替コミット全体をrevertし、固定情報と対応するビルド/CI経路を一緒に以前の状態へ戻す。旧GUIへのpin変更だけでは新しいPackager資産の生成条件と一致しないため、単独では行わない。URLの `twPlusExtensionLoader=0` 指定で再起動すると拡張ロードを停止できる。既定OFFへ戻す場合は既定ON変更をrevertして対応するGUI固定を戻す。検証済み成果物は通常のCI/Pages経路で再配信する。npm公開は本作業に含めない。

## Issue #11の追加UI（起動時フラグで有効化）

既存Security Dialogの機能拡張一覧に、全パッケージ一括／個別のEmbedded・Remote設定と実行モードを接続します。読み込み済みのチェック・実際の実行モード・保存された配布方式を復元します。Loaderは通常起動で既定ONです。`twPlusExtensionLoader=0` でOFFへ戻せます。

追加実装はsandboxed／unsandboxedの4組合せに対応します。VM所有portのiframe経路は、検証済みJSを隔離実行し、ID・RPC応答・worker/service所有権を検査します。標準のlegacy経路で既に読み込んだ拡張も、所有権を一時detachしてからPlus登録へ移し、登録失敗時は元の状態へ復元します。旧resourceの不可逆なdispose後に失敗した場合は、元SB3を保存して回復するよう案内します。

機能拡張一覧からSB3保存・単一HTML出力までの操作とローカル再現は [追加UIガイド](extension-authoring-ui.md) を参照してください。通常配信の依存は `site/source.json` とGUIのlockfileで完全SHAを固定します。ローカルカタログの差し替えは明示プレビュー限定です。
