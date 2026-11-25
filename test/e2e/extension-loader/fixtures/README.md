# 公式ギャラリーの互換性fixture

`bitwise.js` は2026-10-30に公式配信元 https://extensions.turbowarp.org/bitwise.js から取得したBitwise拡張です。
作者はTrueFantom、元ファイルに記載されたライセンスはMIT AND MPL-2.0です。元の作者・ライセンス・翻訳情報を保持しています。

E2Eではネットワーク上の最新版へ追従せず、この固定したコードを公式URLへの応答に使用します。PlusのManifestや認可経路を使わず、従来の公式ギャラリーロードが維持されることを検証します。

このファイルは第三者配布物の固定snapshotとしてJavaScriptのまま保持します。自作の実装・ビルド・テストはTypeScriptです。

## TypeScript拡張をScratchから呼び出す検証

[`typed-clamp.ts`](typed-clamp.ts) を、上限を無視する版と上限を守る版にビルドします。両方のSB3で同じScratchスクリプトを実行し、結果が `15` から `10` に変わることを、実際のEditorとサンドボックス内の拡張で確認します。テスト用ハット、検証ブロック、自動再反映をつないだ完成条件は [Editor #788](https://github.com/kubohiroya/turbowarp-plus-editor/issues/788) に記録しています。

ローカルのEditor成果物とそのEditorの完全なコミットSHAを指定します。検証はヘッドレスで、成果物へのリクエストはPlaywrightのルーティングで処理します。

```sh
E2E_EXTENSION_TEST_BUILD=/absolute/path/to/editor-build \
E2E_EXPECT_SITE_REVISION=REPLACE_WITH_FULL_EDITOR_SHA \
  node --test test/typescript-block-test-loop.browser.ts
```
