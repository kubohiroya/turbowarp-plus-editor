# フォーム型ブロックエディター

この配信物は `site/block-editor/editor.ts` の `plusBlockEditor` をGUIの `blockEditor` 差し込み口へ渡します。
共通エディターの依存と、Schema・SOURCE・固定入力の対応は配信側で管理します。
GUIはworkspace、VM、ScratchBlocks、現在の言語とモーダルの接続を提供します。
文書編集には起動設定がありません。`site/plus-integration.ts` は共通文書エディターを常にマウントし、ファイルアイコンは登録された提供元が文書を所有するハットにだけ付きます。参照元を切り替えられるかも提供元が文書ごとに決めます。`config/feature-flags.ts` は拡張ローダーや作品ツール、レイアウトなどの起動設定を読みます。スクリプト転送には起動設定がありません。
過去の `blockEditorDialogs` 等のGUI URLフラグを現行の有効化手順として使用しないでください。

## 例

- `examples/extensions/block-editor.ts`: Schemaを宣言する単一ブロック。
- `examples/extensions/block-editor-descendants.ts`: 入れ子のブロック。

Plus Editorの通常のカスタム拡張追加から、これらのファイルをサンドボックスなしで読み込みます。
例は `Scratch.gui.blockEditors` の有無を確認して登録し、対応しないホストではフォームを登録しません。
例のブロックは検証用で、製品側の既存作品へ自動追加しません。

## 確認と切戻し

フォームの UI・状態・更新処理は `@kubohiroya/turbowarp-extension-data-editor` が所有します。
固定GUIとの接続は `test/gui-integration/`、実ブロック・ダイアログの接続は `test/block-editor/`、
ブラウザーでの保存・取消・固定入力は `test/e2e/turbowarp/` にあります。
実装変更時は変更した境界に対応するものだけを実行します。
表示・保存の切戻しはGUIと配信側を検証済みの固定元へ戻して行い、保存済みSB3を移行しません。

拡張操作のサービスと描画は `@kubohiroya/turbowarp-plus-editor-workbench`（`./stage-controls`・`./stage-controls-view`）が担当し、`site/controls-dock.ts` が拡張向けの接続を提供します。
