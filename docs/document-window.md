# 組み込み文書のウィンドウ操作

関連: [Editor Issue #10](https://github.com/kubohiroya/turbowarp-plus-editor/issues/10)。作業ブランチは `fix/editor/document-window`。文書ダイアログとVSCode編集の既存実装に依存し、ウィンドウ操作→外部編集の再オープン→関連検証の順で進めます。ユーザーの追加承認に基づき、今回の差分をcommit・pushし、PRのCI成功後にSquash Merge・Release/npm・Pages公開を行います。

`twPlusYamlEditor=1` で有効になる既存ダイアログに適用します。起動時固定・既定OFF、読み取り箇所は `site/yaml-editor/feature-flags.ts` です。

- タイトル部分をドラッグすると画面内で移動します。
- 四辺・四隅をドラッグするとサイズを変更します。最小サイズは360×280pxで、画面がそれより小さい場合は画面内に収めます。
- Xの左にある「全画面化」でブラウザー内いっぱいに広げ、「元のサイズに戻す」で直前の位置とサイズへ戻ります。
- 本文はスクロールし、タイトル・全画面化・閉じる・保存・キャンセルは固定表示します。
- VSCodeを閉じた後も「VSCodeで編集」を再び押せます。元のセッション・作業ファイル・Schema設定を再利用し、未反映の編集内容を上書きしません。起動失敗時も再試行できます。

## 受け入れ基準と検証

- [x] タイトルの移動、四辺・四隅のリサイズ、全画面化と位置・サイズ復元。
- [x] 画面端、最小サイズ、320px・390px幅、画面サイズ変更時に操作ボタンへ到達可能。
- [x] 未編集での外部編集復帰、変更済み草稿の保持、再起動失敗後の再試行。
- [x] 同一作業ファイルとSchemaの再利用、認証・Origin制約、終了済みセッションと不正な作業ファイルの拒否。
- [x] 既存の文書保存・取消・変換・作品切替を含む関連ブラウザーテスト。

検証コマンド:

```sh
node --test test/yaml-host.test.ts test/yaml-build.test.ts
node --test test/yaml-ui.browser.ts
```

運用ログ（2026-10-31 JST）:

- start: Issue #10の文書UIを基点に、ウィンドウ操作とVSCode再オープンのローカル修正へ着手。
- blocked: 初回の検証はsandboxがlocalhostのlistenを拒否。許可された実行環境で再実行。
- done: Host・ビルド18件、文書UIのブラウザー29件が成功。
- done: 実EditorとチュートリアルSB3で通常表示・全画面・390px幅を確認。ページ例外0。修正版の補助プロセスは別ポートで起動し、既存の編集セッションを保持。

## 切戻し

`twPlusYamlEditor=0` またはフラグなしで再起動すると追加UIを無効化できます。今回の操作変更だけを戻す場合は、`client.ts`・`dialog-window.ts`・`ui.css`とHostのセッション再オープン処理を一緒に戻し、ローカル資産を再ビルドして補助プロセスを再起動します。元SB3とVSCodeの作業ファイルは保持します。

## 公開手順（2026-10-31 JST）

- branch: `fix/editor/document-window` / base: `main`。既存mainのサンプル・セキュリティ・配信更新を保持。
- 直列: data-editor 0.7.0のCI・main統合・公開→core版とSHAを固定→文書UI29件と通常統合CI→Squash Merge→main CI・Pages公開後検証→v0.2.0-rc.2のRelease/npm公開。
- DoD: 両ダイアログの操作・VSCode再オープン、既存保存取消の維持、CI・Pages・npmの版とrevision一致。
- ロールバック: 文書編集フラグOFF、または変更前のcore版・SHAと配信コミットへ揃えて切戻し。原文・SB3・外部作業ファイルを保持。
- start: ユーザーが今回の2リポジトリの公開操作を明示承認。
