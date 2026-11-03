# 機能拡張セキュリティのローカル確認

このツールは配信ホストの構成でEditorと機能拡張セキュリティをローカル検証します。配信ホストが提供するPlusの一覧・レビュー・フォームは、[配信側の確認手順](https://github.com/kubohiroya/turbowarp-plus-editor/blob/main/docs/local-catalog-preview.md)を参照してください。

Node.js 26と、このリポジトリおよび固定GUIの依存が必要です。両方で `npm ci` を実行し、GUIを `.host/scratch-gui` に用意してください。別のcheckoutを使う場合は `E2E_GUI_ROOT` に絶対パスを指定します。GUIの通常インストールで生成するmicro:bitアセットも必要です。

## 起動

```sh
cd /Users/hiroya/Dev/turbowarp-plus-editor
npm run preview:security
```

エディターと遅延ロードする全JSチャンクをビルドし、確認用SB3・3つのサンプル機能拡張・実バナーを同じ配信先に生成します。全ファイルのSHA-256と必要ファイルの存在を検証した後、127.0.0.1:8601で配信します。さらにHTTPでエディター・全JSチャンク（iframe-extension-workerを含む）・確認用ファイルの内容を検証し、成功した場合だけ確認URLを表示します。ターミナルを開いたまま、表示されたURLをブラウザーで開いてください。

確認URLには `lang=ja&project_url=...` が含まれます。起動時の機能設定は配信ホストと同じです。サンプル機能拡張は名前を返すレポーターブロックだけを登録します。バナーはリポジトリ内の音楽機能拡張の実画像を使用します。GitHubのソーシャルプレビューはネットワーク状況により共通バナーへフォールバックします。

## 未公開の共通UIをローカルで確認する

`turbowarp-extension-security-dialog` の実行・保存方法アイコンなどを確認する場合は、共通パッケージをビルドした後、その絶対パスを指定します。

```sh
TW_PLUS_SECURITY_PREVIEW_ROOT=/absolute/path/to/turbowarp-extension-security-dialog \
  npm run preview:security -- --port 8612
```

この指定はローカル確認ツールだけに適用します。通常のサイトビルド、公開済み依存、lockfileは変更しません。確認用マニフェストの `securityPreview` にパッケージのパス・版・元コミット・作業ツリーの状態を記録します。環境変数を外して再ビルドすれば固定依存に戻せます。別ファイルのiframeワーカーがEditor本体に組み込まれた構成では、`iframeWorkerAsset` にその本体ファイルを記録して内容を検証します。

アイコンは一括設定・各行の選択・固定された保存方法表示で共通です。日英とも同じ6種類を使い、アイコンは `aria-hidden` で読み上げ名から除外します。正式な依存更新は、共通パッケージ公開後にその確定版を指定します。

## 停止・再起動・状態確認

停止は配信ターミナルで **Ctrl+C** です。同じビルドを再利用するときは次を実行します。欠落・変更されたファイルがあれば起動を拒否します。

```sh
npm run preview:security -- serve
```

別のターミナルから稼働中のサーバーを確認できます。HTTPエラー・内容不一致は終了コード1になります。

```sh
npm run preview:security -- check
```

ソース・依存を更新した後は、配信を停止して `npm run preview:security` で再ビルドし、ブラウザーを再読み込みします。配信中のプロジェクトを編集している場合は先に保存してください。別ターミナルで `npm run preview:security -- build` を実行しても、既存の配信は以前のビルド一式を継続して使用します。新しいビルドへの切替は配信の停止・再起動時に行います。

8601番が使用中なら既存プロセスを確認してください。このスクリプトは他のサーバーを停止しません。別ポートを使用する場合は、生成するSB3の参照先も合わせて変更するため、まず次のコマンドでビルドします。再利用・確認時も同じポートを指定します。

```sh
npm run preview:security -- --port 8602
npm run preview:security -- check --port 8602
# 停止後、同じビルドを再利用
npm run preview:security -- serve --port 8602
```

以前の一時配信（launchd label `com.kubohiroya.turbowarp-security-preview`）が8601を使用している場合だけ、`launchctl remove com.kubohiroya.turbowarp-security-preview` で停止してから新手順へ移行してください。

## macOSでターミナルから独立して配信する場合

会話やターミナルの終了後も確認を続けたい場合は、先にビルドしてから、現在のユーザーのlaunchdジョブとして配信できます。ログイン時の自動起動ファイルは作成しません。既存ジョブがある場合は停止してから再起動します。

```sh
cd /Users/hiroya/Dev/turbowarp-plus-editor
npm run preview:security -- build
launchctl submit -l com.kubohiroya.turbowarp-security-preview \
  -o "$PWD/.local-preview/security/server.log" \
  -e "$PWD/.local-preview/security/server.log" \
  -- "$(command -v node)" "$PWD/scripts/local-security-preview.cjs" serve
npm run preview:security -- check
```

`check` が成功してから、`server.log` に表示された確認URLを開いてください。ジョブ登録の成功だけではHTTP配信の成功を意味しません。失敗時はログを確認し、次のコマンドでジョブを停止してから原因を解消します。

```sh
launchctl remove com.kubohiroya.turbowarp-security-preview
```

再ビルド時も、配信中のビルド一式は保持されます。新しいビルドを作成した後、このジョブを停止し、同じ `launchctl submit` と `check` を実行して切り替えます。切替後はブラウザーを再読み込みしてください。ログアウト・再起動後はこの手順で起動し直します。

## 配信ファイルの保持と復旧

配信ホスト内のビルドごとに `.local-preview/security/<ID>/` を新規作成し、成功した最新ビルドを `current.json` に記録します。配信は起動時に選んだビルドに固定し、通常の `npm run build` / `npm run clean` が削除する `build/`・`dist/` は使用しません。一時ディレクトリにも依存しません。HTTPキャッシュを無効にし、存在しないファイルにはHTMLを返さず404にします。

- `ENOENT`・ファイル不一致・HTTP検証失敗: 配信を停止し、`npm run preview:security` で再ビルドしてください。別のビルドからワーカーだけをコピーしないでください。
- `EADDRINUSE`: 既存の配信元を確認して停止するか、別ポートを使用してください。
- `ChunkLoadError`: `npm run preview:security -- check` を実行し、成功後にブラウザーを再読み込みしてください。配信ターミナルが終了していないかも確認してください。

旧ビルドを自動削除しないため、長く使うとディスクを消費します。すべての確認用配信を停止した後に `.local-preview/security/` を削除して構いません。次回は再ビルドが必要です。配信中にこのディレクトリを削除しないでください。

この手順はローカル確認用です。製品ソースや既存の `npm start` は変更しません。切戻しは確認用配信を停止し、必要に応じて `npm start` を使用します。機能設定は配信ホストの既存の起動設定に従い、この確認ツールの移設では変更しません。
