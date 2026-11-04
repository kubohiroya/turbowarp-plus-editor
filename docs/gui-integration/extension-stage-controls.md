# 機能拡張の再生操作列ボタン

この契約の実装と検証は `turbowarp-plus-editor` が所有します。GUI側は本家に存在するファイル内の呼び出し箇所と、VM・Modal・Redux等の引き渡しだけを持ちます。

このEditorは、サンドボックスなしの機能拡張へ `Scratch.gui.stageControls.addButton` を提供する。通常のTurboWarp全体で保証されるAPIではないため、利用側は有無を確認する。

```js
const button = Scratch.gui?.stageControls?.addButton({
    id: 'myextension-reload',
    label: '自動リロードの設定',
    text: '監視中',
    icon: '↻',
    onClick: () => openSettings()
});
button?.update({visible: true, expanded: false});
button?.update({label: '自動リロードの設定 — 変更を反映しました', text: '更新済み'});
button?.focus();
button?.dispose();
```

登録時は非表示。`visible` を明示して表示し、不要になったら非表示または解除する。配信側のReactコンポーネントがGUIの停止ボタン直後の描画枠へ表示し、通常表示と全画面の切り替えに追従する。狭いステージでは文字を省略し、アクセシブル名とツールチップを維持する。機能拡張がDOMのクラス名を探したり、既存ボタンを移動したりする必要はない。

`id` と `label` は空でない文字列、`onClick` は関数とする。`text`・`icon` はプレーンテキスト。同じ `id` の再登録は新しい登録へ置き換わり、古いハンドルの更新・解除が新しい登録へ影響しない。プロジェクト読み込み時には登録を消去する。登録しない場合は既存の再生操作を変更しない。

Kamishibaiの制作プレビューはYAML台本の実行開始時だけ表示し、タイトル、メニュー、選択中、終了後、停止では非表示にする。実行状態と文言はRuntime、配置用の枠はGUI、描画・テーマ・DOM寿命は配信側が管理する。設定画面の日本語化はRuntime側の変更も必要となる。
