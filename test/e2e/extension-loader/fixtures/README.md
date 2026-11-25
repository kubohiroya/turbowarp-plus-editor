# 公式ギャラリーの互換性fixture

`bitwise.js` は2026-10-30に公式配信元 https://extensions.turbowarp.org/bitwise.js から取得したBitwise拡張です。
作者はTrueFantom、元ファイルに記載されたライセンスはMIT AND MPL-2.0です。元の作者・ライセンス・翻訳情報を保持しています。

E2Eではネットワーク上の最新版へ追従せず、この固定したコードを公式URLへの応答に使用します。PlusのManifestや認可経路を使わず、従来の公式ギャラリーロードが維持されることを検証します。

このファイルは第三者配布物の固定snapshotとしてJavaScriptのまま保持します。自作の実装・ビルド・テストはTypeScriptです。

## TypeScript拡張をScratchから呼び出す検証

[`typed-clamp.ts`](typed-clamp.ts) を、上限を無視する版と上限を守る版にビルドします。同じScratchのテスト用ハットと厳密一致ブロックを両方のSB3に入れ、Editorのテスト実行ビューから実行します。期待値 `10` に対して、修正前は実測値 `15` と失敗箇所のブロックIDが表示され、修正後は同じテストが成功します。テスト用VMを再利用しても、その実行のスナップショットに承認がない拡張は拒否されることも確認します。ローカルビルドの自動再反映は [Editor #788](https://github.com/kubohiroya/turbowarp-plus-editor/issues/788) で追跡します。

`npm ci` でロックファイルが固定する公開版をインストールし、`npm run build:pages` でビルドしたEditorの完全なコミットSHAを指定します。テスト用拡張には `turbowarp-test` の `fc707c50a56b970db20c80081d0be9384517d120` に含まれる `dist/turbowarp-test.js` を使います。検証はヘッドレスで、ローカル成果物とテスト専用カタログへのリクエストはPlaywrightのルーティングで処理します。

```sh
E2E_EXTENSION_TEST_BUILD=/absolute/path/to/editor-build \
E2E_EXPECT_SITE_REVISION=REPLACE_WITH_FULL_EDITOR_SHA \
E2E_TEST_EXTENSION_JS=/absolute/path/to/turbowarp-test.js \
  node --test test/typescript-block-test-loop.browser.ts
```
