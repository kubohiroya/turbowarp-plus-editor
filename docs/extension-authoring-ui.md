# 機能拡張一覧でEmbedded／Remoteを設定する

[拡張ローダー](extension-loader-integration.md)の許可UI・SB3保存・単一HTML出力を、機能拡張の選択画面へ接続しています。URLフラグなしの通常起動で利用できます。

## 一覧からの操作

1. Editorを `editor.html?lang=ja` で起動します。
2. 左下の「拡張機能を追加」ボタンを押し、「TurboWarp Plus」を選びます。Loader有効時は、この一覧を開くために別の `twPlusExtensions` フラグを指定する必要はありません。
3. 必要なパッケージをチェックします。チェックしていないパッケージは追加対象外で、実行方法・配布方式の個別操作も無効です。依存パッケージは自動選択され、必要とするパッケージを表示します。依存先を外すには、必要としているパッケージのチェックを解除します。読み込み済みのパッケージはチェック済みで、現在の実行モードと配布方式を表示します。
4. サンドボックスあり／なしと、Embedded／Remoteを、それぞれ独立して選びます。一括操作で全パッケージの配布方式を設定し、個別の行で上書きできます。サンドボックスなし必須のパッケージでは、サンドボックスありを選べません。
5. 「拡張の設定を適用」を押します。コードを取得してSHA-256を自動計算し、カタログに載っているSHA-256と照合します。カタログの拡張はTurboWarpの標準ギャラリーと同じく信頼済みなので、許可画面は出しません。カタログにない拡張だけ、許可画面でID・取得元・ハッシュ・実行モードを確認します。全件の検証・承認が揃ってから現在の作品へまとめて反映します。途中で拒否した場合は、元作品を変更しません。
6. 「ファイル」から通常どおりSB3を保存します。Editorで開き直すと、Embedded／Remote・実行モード・SHA-256・EmbeddedのJSを復元します。一覧を開き直した際も、読み込み済みのチェック・実行モード・配布方式が復元されます。
7. 「ファイル」→「書き出し…」→「プロジェクトをパッケージ化する」で単一HTML出力画面へ進みます。書き出すファイルの台本・素材の格納方式を選べます。外部依存がないことを確認してチェックを入れ、「確認してHTMLを生成」を押します。カタログにない拡張があれば承認し、HTMLをダウンロードします。
8. HTMLは外部に接続できないため、開いたときにカタログを読めません。そこで生成時に、作品の拡張のうちカタログに載っているもののSHA-256をHTMLに埋め込みます。HTMLを開いた人のランタイムは、実際のバイト列がそのSHA-256と一致する拡張を確認なしで動かし、カタログにない拡張だけ実行許可を確認します。Remoteコードも生成時に検証・同梱し、サンドボックスあり／なしを維持します。外部依存のない作品はオフラインで動作します。

一括指定は通常背景、個別の見出し・一覧は灰色背景で表示します。まず一括指定し、必要な拡張について個別設定で上書きできます。

追加一覧は security-dialog の `ExtensionReview`（`mode="add"`）で、選ぶ画面と許可の画面を兼ねます。TurboWarp Plusの一覧に載る拡張はカタログが保証するので、本家がギャラリーを扱うのと同じくサンドボックスなしで実行し、実行方法は選択肢ではなく表示として示します。「拒否」は置かず、チェック解除で追加対象から外します。依存する拡張は自動で選ばれます。読み込み方は下の4形式から、一括または拡張ごとに選びます。作品を開く際の許可確認（`mode="open"`）では、引き続き拒否できます。

作品を開くときは、その作品の Plus 拡張と通常のカスタム拡張を、同じ `mode="open"` の画面1つでまとめて尋ねます。尋ねるのは Loader が取得・登録する前で、Loader はその答えで許可します（同じ拡張をもう一度尋ねません）。Plus 拡張について開く人が決められるのは次の2つです。

- 動かすかどうか。作者がサンドボックスなしで動かす拡張に「サンドボックスの中で」と答えた場合は、作者の指定どおりには動かせないので、作品を開きません（`TRUST_DENIED`）。作者がサンドボックスの中で動かす拡張は、どちらの答えでもサンドボックスの中で動きます。
- `remote-cacheable` の拡張のキャッシュを、このブラウザーに残すかどうか。断ることしかできず、作品に記録された形式は変わりません（Loader の `declineCaching`）。

この画面での拒否は、同じ訪問のうちに以前の読み込みで許可した拡張にも優先します。確認画面を持たないホスト（単一HTMLなど）では、従来どおり拡張ごとの許可ダイアログが出ます。

読み込み済みのチェックは状態表示のため解除できません。実行中の拡張を停止・削除する操作としては扱いません。実行状態を特定できない拡張について、サンドボックス設定を推測して表示することはありません。

## 作品の URI を指定する

通常起動で「ファイル」→「作品のプロパティ…」を開き、「作品の URI」に入力して「適用」を押します。認証情報やフラグメントを含まない HTTPS URI が使えます。

「ファイル」から SB3 を保存すると URI が記録され、同じ SB3 を開き直すと入力欄に表示されます。保存ファイル名は作品タイトルから付きます。URI を変更した後のキャッシュ書き込みには新しい URI が使われ、以前のキャッシュは保持されます。

URI 欄を非表示にするには、`twPlusManualProjectURI=0` を指定して起動します。

## カタログにない拡張

ローダーが扱う拡張の入口は、TurboWarp Plusの一覧だけです。カタログにない拡張を追加する機能は置きません。「拡張機能を追加」→「カスタム拡張機能」は本家TurboWarpと同じ画面と動作で、ローダーを通しません（作品の`extensionURLs`へ従来どおり保存します）。方針は [turbowarp-plus-packagesの設計書](https://github.com/kubohiroya/turbowarp-plus-packages/blob/main/docs/editor-architecture.ja.md) の「拡張の選び方と読み込み」を参照してください。

## 配布方式と安全境界

| 設定 | 動作 |
|---|---|
| `remote-non-cacheable` | HTTPS、資格情報・fragment・redirectなし、CORS取得可能なJS URLを保存。開くたびに取得し、このブラウザーにキャッシュを残さない |
| `remote-cacheable` | 同じURLを保存し、検証済みのキャッシュをこのブラウザーに残してよい（開く人は断れる） |
| `embedded-file` | UTF-8のJSをSB3内の `extensions/` にファイルとして同梱 |
| `embedded-data` | JSを `data:` の値として作品文書に同梱。標準TurboWarpでも開ける |
| サンドボックスあり | VM所有の隔離iframeで実行。`Scratch.vm`を渡さず、`Scratch.extensions.unsandboxed`はfalse |
| サンドボックスなし | 明示承認後にホストVMへ登録 |
| 配布方式の変更 | 既存の検証済みバイト列とSHA-256を保持。Remote先が同じ内容を返さない場合は拒否 |
| Packager | Remoteも同梱し、カタログにない拡張は生成したHTMLを開くたびに再承認。外部API・モデル等の依存資産の自動同梱は対象外 |

SHA-256は内容を固定する値で、発行者の本人性やコードの安全性を証明しません。作品の実行モードは要求値であり、ホストの承認を代替しません。サンドボックスなしで承認した任意JSの外部副作用まで巻き戻す保証はありません。

## 実装と依存順

- Security Dialog: 拡張一覧の UI・状態、作品を開く前のレビュー、許可・再試行と失敗の説明を持ちます。`ExtensionReview` 1つで追加（`add`）と作品を開くとき（`open`）の両方を尋ねます。4形式の綴りは Loader の Manifest・SB3の保存形式と同じなので、画面の答えを対応表なしで Loader へ渡します。旧綴り（`remote` / `embedded` / `cached`）は読み替えずに拒否します。
- Loader: SHA-256・取得・検証・認可・Manifest/SB3更新。`prepareCatalogExtensionChanges` は複数パッケージをまとめて準備し、既存コードを更新せず配布方式を変更します。
- VM: 所有portから隔離iframeを登録し、ID・RPC・worker/serviceの所有権を照合して破棄します。
- Loader の `./scratch-vm`: 実状態の復元、作品切替の競合防止、適用失敗時の復元と、復元できない場合の追加前SB3の回復処理を担当します。
- Editor（`site/extension-host/`・`site/extension-library/`）: 起動設定・信頼方針・GUIの値とコールバックを、上記の公開 API へ渡します。[責務の一覧](upstream-feature-ownership.md)を参照してください。
- GUIフォーク: 上記を差し込む口だけを持ちます。

## ローカルでの確認

`site/source.json` の完全SHAでGUIとPackagerをチェックアウトし、GUIで `npm ci` と `node scripts/prepublish.mjs` を実行してからプレビューをビルドして配信します。

```sh
npm ci
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui \
TW_PLUS_PACKAGER_ROOT=/absolute/path/to/pinned/packager \
NODE_OPTIONS=--max-old-space-size=6144 npm run build:extension-preview

E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui E2E_PORT=8744 \
  node test/e2e/turbowarp/serve.cts
```

起動後は `http://127.0.0.1:8744/turbowarp-plus-editor/editor.html?lang=ja` を開きます。プレビュービルドは実際のGUI・Loader・VM・Security Dialog・Editorの作業ツリーhashと `published: false` を記録します。接続部の単体テストは `npm run test:extension-host` で実行します。

## 無効化

`twPlusExtensionLoader=0` を指定して再起動すると追加UIは無効です。従来のカタログだけを使う場合は `twPlusExtensionLoader=0&twPlusExtensions=1` を指定します。
