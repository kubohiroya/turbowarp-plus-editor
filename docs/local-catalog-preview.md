# ローカルのカタログ表示差分を確認する

表示名とアイコンの正本は `turbowarp-plus-packages` のカタログ生成処理と `site/assets/extension-icons/` に置きます。GUIには名称変換ロジックを持たせません。通常ビルドは従来の固定HTTPSカタログを取得します。

未配信の表示差分をEditorへ反映する場合だけ、ローカルカタログのcheckoutを明示します。

```sh
E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" \
TW_PLUS_PACKAGER_ROOT="$PWD/.host/packager-issue4" \
TW_PLUS_CATALOG_ROOT="$PWD/.host/turbowarp-plus-packages-branding" \
NODE_OPTIONS=--max-old-space-size=6144 npm run build:extension-preview
```

先にカタログ側の `scripts/preview-editor-catalog.ts` で、固定した公開カタログsnapshotから `site/extensions-v1.json` を生成してください。表示名・アイコンの候補を確認してからEditorのビルドへ進みます。

この明示ビルドでは、共有の `parseExtensionCatalog` でJSONを検証した後、カタログと対応するSVGをホストの表示資産としてバンドルします。SVGは、カタログのcanonical icon URL・package名・ローカルファイルが一致する場合だけdata URLへ変換します。拡張JSのURL・ID・version・依存関係を変更せず、HTTPコードURLや任意の画像スキームを許可しません。

`build-info.json.localExtensionIntegration.catalogPreview` に元JSON・各SVG・バンドル入力のSHA-256と `published: false` を記録します。この設定なしのビルドはローカルsnapshotを使いません。追加機能の起動フラグは既定ONです。ローカルsnapshotの使用は引き続き明示プレビュー専用で、`twPlusExtensionLoader=0` による切戻しも維持します。

`TW_PLUS_LOCAL_CATALOG_INPUT` と `TW_PLUS_CATALOG_PREVIEW` はビルド内部用です。利用者は設定せず、公開ビルドの代用にしないでください。
