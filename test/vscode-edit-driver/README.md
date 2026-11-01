# 実VSCodeによるYAML保存の検証用driver

このdevelopment拡張はテスト専用です。productionのHTTP API、launcher引数、通常Editorでは有効にしません。拡張のインストール・公開やVSCodeのdownloadは不要です。

`test/yaml-native-launch.ts` の `createNativeYamlTestLauncher({marker, resultPath})` を、ローカルhostの `launchEditor` へ注入します。`resultPath` の親フォルダは一時テスト領域へ事前に作成し、結果ファイルは未作成にします。新しい私有profileを使用してください。

helperはproductionと同じ固定argvに、このdriverの `--extensionDevelopmentPath` だけを追加します。`--disable-extensions` は維持します。`TWPE_YAML_TEST_SPEC` 環境変数へJSON文字列 `{workingFile, marker, resultPath}` を渡します。

driverは次を確認してから公式VSCode APIで操作します。

- realpathが一時領域の私有 `twpe-yaml-*/sessions/<32桁hex>/<文書名>.yml` であり、symlinkやユーザーファイルではないこと。
- 既存ファイルやYAMLそのものを結果ファイルとして上書きしないこと。
- `openTextDocument` と `showTextDocument` の対象が指定YAMLであり、未保存変更がないこと。

`WorkspaceEdit` で末尾にmarkerのコメント1行を追加し、`document.save()` で保存します。結果JSONにURI、実VSCode版、document version、前後SHA256、保存成功、disk/document一致を記録します。helperは結果を確認するまで起動完了を返しません。

実機確認: VSCode 1.144.0で、`--disable-extensions` を維持したExtension Development Hostから `onStartupFinished` によりdriverが起動し、version 1→2、保存成功、disk一致を確認しました。元のユーザーprofile/Downloadsのファイルは操作していません。

`settingsYamlSchemaChecks` と `settingsJsonSchemaChecks` は、テスト用設定文書のSchemaに対するプローブです。列挙値の補完と不正値の診断をVSCode自身のAPIで確認します。任意Schemaに通用する検証プローブとしては扱いません。

TypeScriptソース `extension.cts` は、リポジトリルートで `npm run build:test-driver` を実行して `dist/extension.cjs` へビルドしてから使用します。
