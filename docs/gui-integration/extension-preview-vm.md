# 編集用プレビューの独立VM

この契約の実装と検証は `turbowarp-plus-editor` が所有します。GUI側は本家に存在するファイル内の呼び出し箇所と、VM・Modal・Redux等の引き渡しだけを持ちます。

`Scratch.gui.createPreviewVm()` は、Editorと同じTurboWarp実装から編集用の空VMを作成します。利用前にAPIの有無を確認してください。

```js
if (typeof Scratch.gui?.createPreviewVm !== 'function') {
    throw new Error('This Editor does not provide isolated preview VMs.');
}
const previewVm = Scratch.gui.createPreviewVm();
```

TurboWarpのVMコンストラクターは、同じJavaScriptモジュールで共有するdispatchへ`runtime`と`extensions`を登録します。そのまま別VMを作ると、Editorで後から読み込む拡張やブロックの更新先がプレビューへ変わります。このAPIは、同期的なコンストラクター実行中だけ2つのサービスを退避し、成功・失敗どちらでも元のプロパティ記述子を復元します。他のdispatchサービスは変更しません。

返却したVMは、スクリプト・拡張宣言・拡張URL・モニターを除去したプレビュー用プロジェクト専用です。外部拡張と組込拡張の読み込みを拒否します。新たな拡張を登録したり、通常の編集用VMとして使ったりするAPIではありません。利用側は、renderer・storage・audio等の接続と、終了時の`clear()`・`quit()`および接続したリソースの解放を所有します。

このAPIのないホストでは、Editor自身のVMコンストラクターを直接呼ぶ代替を使わず、プレビュー機能を提供できないことを表示してください。EditorのVM・ブロック・共有サービスは保持します。

関連作業は`turbowarp-kamishibai-app`の[Issue #1100](https://github.com/kubohiroya/turbowarp-kamishibai-app/issues/1100)です。ロールバックは利用側のプレビュー登録解除またはホストと利用側を既知の組合せへ戻すことで行い、保存済みの作品データは移行しません。
