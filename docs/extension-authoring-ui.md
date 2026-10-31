# 機能拡張一覧でEmbedded／Remoteを設定する

追跡: [Editor Issue #11](https://github.com/kubohiroya/turbowarp-plus-editor/issues/11)。Issue #4のLoader・許可UI・SB3保存・単一HTML出力を、既存の機能拡張選択画面へ接続します。公開EditorでもURLフラグなしの通常起動で利用でき、既定ONです。配信する依存実装は完全SHAで固定します。

## 一覧からの操作

1. この変更を含むEditorを `editor.html?lang=ja` で起動します。追加機能は起動時固定・既定ONで、URLフラグは不要です。
2. 左下の「拡張機能を追加」ボタンを押し、「TurboWarp Plus」を選びます。Loader有効時は、この一覧を開くために別の `twPlusExtensions` フラグを指定する必要はありません。
3. 必要なパッケージをチェックします。チェックしていないパッケージは追加対象外で、実行方法・配布方式の個別操作も無効です。依存パッケージは自動選択され、必要とするパッケージを表示します。依存先を外すには、必要としているパッケージのチェックを解除します。読み込み済みのパッケージはチェック済みで、現在の実行モードと配布方式を表示します。
4. サンドボックスあり／なしと、Embedded／Remoteを、それぞれ独立して選びます。一括操作で全パッケージの配布方式を設定し、個別の行で上書きできます。サンドボックスなし必須のパッケージでは、サンドボックスありを選べません。
5. 「拡張の設定を適用」を押します。コードを取得してSHA-256を自動計算し、許可画面でID・取得元・ハッシュ・実行モードを確認します。全件の検証・承認が揃ってから現在の作品へまとめて反映します。途中で拒否した場合は、元作品を変更しません。
6. 「ファイル」から通常どおりSB3を保存します。同じフラグ付きEditorで開き直すと、Embedded／Remote・実行モード・SHA-256・EmbeddedのJSを復元します。一覧を開き直した際も、読み込み済みのチェック・実行モード・配布方式が復元されます。
7. 「ファイル」→「プロジェクトをパッケージ化する」で単一HTML出力画面へ進みます。外部依存がないことを確認してチェックを入れ、「確認してHTMLを生成」を押します。拡張を承認し、HTMLをダウンロードします。
8. HTMLを開いた人にも実行許可を確認します。Remoteコードも生成時に検証・同梱し、サンドボックスあり／なしを維持します。外部依存のない作品はオフラインで動作します。

一括指定は通常背景、個別の見出し・一覧は灰色背景で表示します。まず一括指定し、必要な拡張について個別設定で上書きできます。

追加一覧の実行方法はサンドボックスあり／なしの2択です。「拒否」のラジオや一括ボタンは置かず、チェック解除で追加対象から外します。一括設定は、未選択のパッケージにも後で選択した際の設定として適用できます。作品を開く際やコード実行前の許可確認では、引き続き拒否できます。

読み込み済みのチェックは状態表示のため解除できません。実行中の拡張を停止・削除する操作としては扱いません。実行状態を特定できない拡張について、サンドボックス設定を推測して表示することはありません。

## JSファイル・任意URLからの追加

カタログにない拡張も、左下の「拡張機能を追加」→「カスタム拡張機能」から追加します。ファイルメニューに別のPlus専用入口は置きません。

1. 「URL」「ファイル」「テキスト」から入力方法を選びます。URLはHTTPSを指定し、ファイルは選択またはドラッグ＆ドロップ、テキストはJSを貼り付けます。複数のJSファイルもまとめて選べます。
2. 「次へ」で、拡張ID（JSの `getInfo().id`）を入力します。複数ファイルでは各ファイルのIDを指定します。IDの確認にコードの事前実行は行いません。
3. 「作品への保存方法」と「実行方法」を独立して選びます。URL入力は「JSを作品に同梱（Embedded）」「読み込み元のURLを保存（Remote）」から選べます。ファイル・テキスト入力は同梱です。実行方法は「サンドボックスあり」「サンドボックスなし」の2択で、初期値はサンドボックスありです。
4. 「検証して追加」から共通の許可画面で内容を確認します。すべての候補が検証・承認されてから作品へ反映し、追加されたブロックのカテゴリへ移動します。
5. 「戻る」で入力方法を修正できます。拒否・取得/検証失敗時は入力内容を保持して入力画面へ戻り、再試行できます。複数ファイルの途中で拒否した場合も元作品を変更しません。登録時のID不一致は元作品へ復元します。復元できない場合は追加前のSB3を保存するリンクを表示します。

通常のSB3保存・再読込・Packager出力へ進めます。起動フラグOFF時は従来のカスタム拡張の追加処理を利用します。

## 配布方式と安全境界

| 設定 | 動作 |
|---|---|
| Embedded | UTF-8のJSをSB3内の `extensions/` に同梱 |
| Remote | HTTPS、資格情報・fragment・redirectなし、CORS取得可能なJS URLを保存 |
| サンドボックスあり | VM所有の隔離iframeで実行。`Scratch.vm`を渡さず、`Scratch.extensions.unsandboxed`はfalse |
| サンドボックスなし | 明示承認後にホストVMへ登録 |
| 配布方式の変更 | 既存の検証済みバイト列とSHA-256を保持。Remote先が同じ内容を返さない場合は拒否 |
| Packager | Remoteも同梱し、受取側で再承認。外部API・モデル等の依存資産の自動同梱は対象外 |

SHA-256は内容を固定する値で、発行者の本人性やコードの安全性を証明しません。作品の実行モードは要求値であり、ホストの承認を代替しません。サンドボックスなしで承認した任意JSの外部副作用まで巻き戻す保証はありません。

## 実装と依存順

- Security Dialog: 既存の `ExtensionSelectionList` に一括／個別の配布方式と実行モードを追加。`enableDistribution` は既定falseで、従来APIの第1引数を維持します。
- Loader: SHA-256・取得・検証・認可・Manifest/SB3更新。`prepareCatalogExtensionChanges` は複数パッケージをまとめて準備し、既存コードを更新せず配布方式を変更します。
- VM: 所有portから隔離iframeを登録し、ID・RPC・worker/serviceの所有権を照合して破棄します。
- GUI: 実状態の復元、入力と許可UIの接続、作品切替の競合防止、適用失敗時の復元を担当します。復元できない場合も、追加前SB3の保存リンクを提供します。
- Editor: 実Editorの一覧操作からSB3保存・Packager出力までのブラウザーE2Eを所有します。

公開作業は [VMの追跡Issue #25](https://github.com/kubohiroya/turbowarp-plus-editor/issues/25)、[GUI Issue #86](https://github.com/kubohiroya/scratch-gui/issues/86)、[Loader Issue #3](https://github.com/kubohiroya/turbowarp-extension-loader/issues/3) で管理します。Loader・VM・Security Dialog→GUI→Editorの依存順で検証し、CI成功後にマージした完全SHAを固定します。

## ローカルでの再現

Node 26とpnpm 11.28.8を用意し、`site/extension-source.json` の完全SHAでGUIとPackagerをチェックアウトします。Loader・VM・Security DialogはGUIのlockfileから復元します。以下はGUIを `.host/scratch-gui-issue4`、Packagerを `.host/packager-issue4` に置いた例です。

```sh
npm ci
(cd .host/scratch-gui-issue4 && npm ci && node scripts/prepublish.mjs)
E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" node scripts/site/prepare-core.ts

E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" \
TW_PLUS_PACKAGER_ROOT="$PWD/.host/packager-issue4" \
NODE_OPTIONS=--max-old-space-size=6144 npm run build:extension-preview

E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" E2E_PORT=8744 \
  node test/e2e/turbowarp/serve.cts
```

起動後は `http://127.0.0.1:8744/turbowarp-plus-editor/editor.html?lang=ja` を開きます。プレビュービルドは実際のGUI・Loader・VM・Security Dialog・Editorの作業ツリーhashと `published: false` を記録します。対象の自動検証は次のコマンドで実行します。ブラウザーE2Eは専用サーバーを起動するため、手動の8744サーバーは終了してから実行してください。

```sh
(cd .host/scratch-gui-issue4 && npm run test:plus-extension-loader)
E2E_GUI_ROOT="$PWD/.host/scratch-gui-issue4" npm run test:e2e:extension-loader
```

## 公開前の再検証（2026-10-31）

最新の共通UIと固定インストールした依存構成で、追加UI12件を含む拡張E2E27件と、既存編集・セキュリティ・テーマ・サンプルE2E27件、計54件が成功しました。GUI接続76件、Loader74件、共通UI65件、VM所有境界17件、Editor関連42件も成功しています。最終headのCI・公開後検証と配信SHAはIssue #11で記録します。

## 開発時の検証記録（2026-10-30）

- 最終プレビュービルド成功。当時の公開用の固定SHAと既定OFFを維持して検証しました（現在は既定ONです）。
- Loader単体74件、GUI接続72件、VM所有境界17件、Editor単体14件・基盤33件が成功しました。Security Dialogは既存61件と追加のloaded-deny境界1件が成功しています。
- 初期実装のブラウザーE2E26件が成功しました。追加11件と既存15件を同じビルドで実行しています。一覧からの4組合せ、複数選択の途中拒否、実SB3保存・再読込、読み込み済み状態の復元、実行モードの往復、従来native経路からの移行を含みます。
- 配信資産と同じPackagerから実際に単一HTMLを生成し、file URL・オフラインで再承認と実ブロック実行を確認しました。sandboxedは `allow-scripts` だけのiframe、`Scratch.vm`なし。HTTP(S)通信は0件です。
- 日本語・英語の1280px／390px表示を目視し、横の欠けなし、全行の設定へスクロール可能、適用ボタンの常時表示を確認しました。

ローカル証跡は `.host/authoring-ui/extension-verified.log`、`extension-verified-results.json`、`*-verified-unit.log`、`screenshots/` に保持しています。この記録時点では、Issue #11の新規作成・Assignee設定以外の外部公開操作は行っていません。公開時の再検証結果はIssue #11で追跡します。

追加一覧から「拒否」を外した更新では、Security Dialog65件・GUI接続11件と、一覧操作のブラウザーE2E6件・作品ロード時の拒否E2E1件が成功しました。チェック解除による対象除外、依存先の自動選択と親の解除、未選択設定の無効化、既存のSB3/Packager連携、作品ロード時の拒否を確認しています。証跡は `.host/authoring-ui/selection-*.log` です。

## 切戻し

`twPlusExtensionLoader=0` を指定して再起動すると追加UIは無効です。既定OFFへ戻す配信切戻しは既定ON変更をrevertし、対応するGUI固定を戻してCI後に再配信します。従来のカタログだけを使う場合は `twPlusExtensionLoader=0&twPlusExtensions=1` を指定できます。元SB3とローカル成果を保持します。配信を戻す場合は、対応する旧GUI・Loader・VM・Security Dialogの固定SHAとビルド経路をまとめて戻します。
