# リソース利用宣言の接続と検証

関連Issue: [Editor #738](https://github.com/kubohiroya/turbowarp-plus-editor/issues/738)、[契約 #9](https://github.com/kubohiroya/turbowarp-extension-manifest/issues/9)、[family #134](https://github.com/kubohiroya/turbowarp-plus-packages/issues/134)、[画面 #99](https://github.com/kubohiroya/turbowarp-extension-security-dialog/issues/99)。

各拡張の `package.json` にある `turbowarpExtension.resourceDeclaration` が情報源です。既存manifestパッケージの契約で検証し、familyの生成する `extensions-v1.json` に運びます。ダッシュボードもこの生成済みカタログを使い、リポジトリHEADの宣言を公開済みnpm版へ混ぜません。

Editorは既存の `plusCatalog` を `createCatalogLibrary` と `createProjectSecurityReview` に渡します。表示、型、検証、対象版の照合は独立パッケージが担当します。Editor・Scratch GUIに表示本体やパッケージ名からの推測表を追加しません。固定GUI `b2e75a129546db48e6563f72c80a3d3d46d86fb5` の既存接続口で対応できます。

- 追加画面と作品を開く確認画面は、共通の `ExtensionRow` で通常はアイコンのみを表示し、クリック・Enter・Spaceでラベルと説明を展開します。
- 利用条件、用途、連携先、通信の方向・内容を展開して読めます。
- 未宣言と明示的な空配列は別表示です。宣言は製作者の申告で、実行許可・ブラウザ権限の付与ではありません。
- 確認画面は、カタログのID・URL・必要なハッシュと一致した対象版の宣言を質問前に用意します。従来のdata URLはコードを実行せずハッシュを計算します。不一致・取得不能では未申告と表示します。
- 宣言の表示は既定で有効です。機器の起動、作品の保存形式、実行選択や既存フラグを変更しません。

## ヘッドレス検証

`test/e2e/extension-loader/resources.spec.cts` は、実際のCamera Sourceメタデータを写したJSON fixtureを読み、カタログの受け渡し、日英の追加画面、条件・許可要求の表示、狭幅で説明末尾までのスクロール、作品を開く確認、異なるハッシュ、キャンセルを検証します。コードは小さな未実行fixtureへ置き換え、機器や外部サービスは使いません。閲覧・キャンセル時の拡張実行数とgetUserMedia呼び出しは0であることを確認します。

固定GUIとnpm配布版security-dialog 0.12.0を接続したビルドで、次を実行します。

```sh
E2E_GUI_ROOT=/absolute/path/to/pinned-gui \
E2E_EXPECT_SITE_REVISION=<build-info.jsonのsiteRevision> \
node node_modules/@playwright/test/cli.js test \
  --config test/e2e/extension-loader/playwright.config.cts \
  test/e2e/extension-loader/resources.spec.cts
```

ビルドと検証のSHAを一致させ、ローカル差分を含む成果物は `localExtensionIntegration.published: false` とソースのハッシュで識別します。OS入力・画面付きブラウザーは使用しません。

## 公開順序と切り戻し

1. 共通契約の0.6.0を新しい版として公開する。
2. 利用側の依存ロックを実際の公開tarballに対して生成する。ローカル検証中は専用workspaceで新契約を接続し、架空のintegrityやローカルパスを製品lockfileに入れない。
3. 各拡張の宣言を含む新しい版を公開する。同じ版のpackage.jsonやJSを差し替えない。版を更新してビルドしたJSのURL・ハッシュと一緒にカタログを再生成する。
4. security-dialogの表示実装を新しい版として公開し、Editorの依存・lock・`site/source.json` をその公開版へ固定する。
5. 公開後も同じ3画面とキャンセルを対象版の成果物で確認する。

本番反映では上記の順序を守り、npmのtarball・integrity・provenanceと公開元コミットを照合してからEditorの固定を更新します。旧版の宣言は新しい版から推測せず、対象版の宣言が取得できない場合は未申告です。

切り戻しはEditorを従来のsecurity-dialog 0.11.0へ戻し、必要ならダッシュボードの表示変更を戻します。追加したoptionalな宣言は旧consumerの作品実行設定を変えません。新しい権限設定や作品データの移行はありません。

リソース欄は通常アイコンのみで、クリックやEnter/Spaceでラベルと説明を展開・縮約します。E2Eでは初期状態・クリック後・キー操作の開閉も確認します。
