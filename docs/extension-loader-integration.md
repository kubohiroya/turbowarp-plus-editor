# Issue #4: Embedded / Remote拡張の統合

親仕様: https://github.com/kubohiroya/turbowarp-plus-editor/issues/4

## 実装場所と依存方向

Manifest、取得、SHA-256、認可、依存順、診断、キャッシュ、SB3保持、配布元変換は独立した `turbowarp-extension-loader` に集約した。`scratch-gui` は許可UI、VM登録、ロード/保存フック、Packagerとの受け渡しだけを担当する。Editorは固定GUIのビルド・配信と統合E2Eを所有する。

| 構成 | 固定した基点 | ローカル変更 |
|---|---|---|
| scratch-gui | `a655d14dfff611c0cf6d040e0a312349ea712a75` | `.host/scratch-gui-issue4` の薄いアダプター・UI・出力画面 |
| scratch-vm | `55fd9b7c9509827c9cec31482aa63f2d57ec564d` | `.host/scratch-vm-issue4` の所有サービスport（43行追加） |
| Packager | `c115bdf525c5f49f0fb689a21b335ccb70fc22d2` / npm `3.14.0` | ソースを改変せず、上記VMを使ってscaffoldingをビルド |
| data-editor | npm `0.5.0` / source `df1e78b6982ccc0c1ddb8a741a8d57848519c74d` | 変更なし |
| security-dialog | npm `0.3.3` | 既存UI・通常カスタム拡張の方針を維持 |

Loaderは [kubohiroya/turbowarp-extension-loader](https://github.com/kubohiroya/turbowarp-extension-loader) が所有する。GUIのpackage/lockfileはLoaderとVMをGitの完全SHAで固定する。通常配信の `site/source.json` と、統合プレビューの `site/extension-source.json` を分け、公開中の固定構成を変更せず検証できる。既存のscratch-gui作業ツリーは変更せず専用checkoutを使う。

## 起動と信頼境界

`twPlusExtensionLoader=1` の完全一致だけで起動する。起動後のURL変更から有効化せず、作品の設定を起動フラグとして使わない。Editor公開APIの読取は `config/feature-flags.js`、GUIの接続は `startupPlusExtensionHost` が担当する。既定OFFで、既存の `twPlusExtensions` とは独立している。

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
NODE_OPTIONS=--max-old-space-size=6144 npm run build:extension-preview

E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" npm run test:e2e:extension-loader
node --test .host/scratch-gui-issue4/test/unit/extension-loader/*.test.mjs
npm --prefix .host/turbowarp-extension-loader test
npm test
npm run test:extension-loader:desktop
```

新しい環境では `site/extension-source.json` のGUI revisionとPackager revisionを専用checkoutへ取得し、GUIで `npm ci` と `node scripts/prepublish.mjs` を実行する。LoaderとVMはGUIの固定Git依存から取得されるため、ローカルの兄弟ディレクトリやnode_modulesへの手作業パッチは不要。VMパッチはレビュー資料として `scripts/site/patches/scratch-vm-host-extension-service-port.patch` にも保持する。preview buildはscaffolding、runtime、ローカルbuilder、E2E用の単一HTMLまで生成する。ソースの固定値と生成assets hashをビルドで検証し、`build-info.json.localExtensionIntegration` に出所を記録する。通常の配信構成は維持する。

検証証跡は `test-results/extension-loader/results.json`、`.host/issue-4-artifacts/*tests.log`、`desktop-result.json` とDesktop screenshots。Embedded/Remote実行、拒否・Esc・改ざん・未知schema・信頼偽装・ID不一致、real TLSのCORS/redirect拒否、CSP、cache offline、URL/ローカルファイル、公式Bitwise/標準Pen、従来カスタム拡張の回帰を検証する。悪意あるZIP・キャッシュ汚染/失効・変換・compiler実行はcore/実VMの単体テストで検証する。

## 切戻しと公開境界

起動パラメーターを外すか0にして再起動すればOFFへ戻る。終了時はhost.disposeを待って登録を解除し、rollback/unload失敗時はVMを破棄する。Plus作品を保持非対応の状態で上書き保存しない。

`site/source.json` の公開固定SHAと通常配信は維持する。Loader/VM → GUI → Editorの順にPRでレビューする。関連PRは本文で親Issue #4へ紐づけ、個別の依存と検証結果を記す。PR作成だけで親Issueを完了・closeしない。merge、リリース、npm公開は別の操作とする。
