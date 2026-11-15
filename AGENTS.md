# TurboWarp Plus Editor 作業ルール

## 実装の置き場所

- 新しい機能の実装本体は、turbowarp-plus family の別パッケージ（MPL-2.0、`turbowarp-plus-editor-*`）に置く。本リポジトリには、版の固定と、パッケージの口を GUI に渡す結線だけを置く（[構成・責務・ライセンス](https://github.com/kubohiroya/turbowarp-plus-packages/blob/main/docs/editor-architecture.ja.md)）。
- `packages/editor-*` は、family へ移す途中のものである（[移行計画の段階7](https://github.com/kubohiroya/turbowarp-plus-packages/blob/main/docs/editor-migration-plan.ja.md#段階7-plus-editorの-packageseditor--をfamilyへ移す)）。ここに新しいファイルやワークスペースを足さない。既存のファイルにある不具合を直すこと、family へ移して消すことはしてよい。
- 既存のファイルが `packages/editor-*` にあることを、新しい機能をここに置く前例にしない。置き場所に迷うときは、設計や issue を書く段階で、どのリポジトリに入れるかを先に決める。

## 実マウスを使う E2E

- OS のマウスカーソルを動かす E2E は、その実行をユーザーが今回の作業で明示的に依頼した場合に限って実行する。一般的な E2E の実行や PR の検証依頼は、実マウスを使う E2E の実行依頼に含めない。
- 明示的な依頼がない場合は、`TW_PLUS_NATIVE_INPUT=1` の設定、実入力ドライバーの直接起動、別スクリプト経由の起動を行わない。
- 検証対象の実入力処理、ウィンドウ接続、対象の OS・ブラウザー・Desktop アプリなど、検証結果に関わる前提が変わっていなければ、既存の結果を再利用する。前提が変わった場合も、実マウスを使う再検証には明示的な依頼が必要となる。
