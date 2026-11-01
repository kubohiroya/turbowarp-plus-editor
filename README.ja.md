# TurboWarp-Plus-Editor

[English](README.md)

[![TurboWarp-Plus-Editor](https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg)](https://kubohiroya.github.io/turbowarp-plus-editor/)

**[TurboWarp-Plus-Editorを開く](https://kubohiroya.github.io/turbowarp-plus-editor/)**

TurboWarp Plusの作品をつくる・開くためのエディターです。kubohiroyaがフォークした[scratch-gui](https://github.com/kubohiroya/scratch-gui)を、固定したリビジョンからビルドしてGitHub Pagesで提供します。日本語と英語に対応します。

- サイト: <https://kubohiroya.github.io/turbowarp-plus-editor/>
- エディター: <https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja>
- npm: `@kubohiroya/turbowarp-plus-editor`

## 配信の責務

`turbowarp-extension-data-editor` と `turbowarp-extension-security-dialog` は上流のライブラリです。`scratch-gui` がこれらを利用し、さらに下流にある本パッケージが統合Editorを配信・検証します。上流のライブラリから下流GUIをビルドしません。

```text
turbowarp-extension-data-editor ───┐
                                 ├→ scratch-gui → turbowarp-plus-editor → GitHub Pages
turbowarp-extension-security-dialog┘
```

配信元GUIのSHA、data-editorのSHA、security-dialogのバージョンは [`site/source.json`](site/source.json) で固定します。公開成果物の `build-info.json` で実際に組み合わせたGUI・ライブラリ・サイトの版を確認できます。旧data-editorのPagesは廃止対象であり、移行先には本サイトを使用してください。

案内画面には `turbowarp-plus-site-header` の共通ヘッダーを読み込みます。エディター本体は全画面GUIとして表示します。

## 作品を開く

ランディング画面の **TurboWarp-Plus-Editorで編集** ボタンを押すとエディターが開きます。手元のSB3ファイルはエディターの「ファイル」から開けます。URLから開く場合は、ブラウザーによる取得を許可したHTTPSのSB3を指定します。

```text
https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja&project_url=https%3A%2F%2Fexample.com%2Fstory.sb3
```

`project_url` はURLエンコードしてください。`lang=ja` と `lang=en` を指定できます。ランディング画面へ指定した作品URLや他のEditorパラメーターも、編集ボタンでエディターに引き継ぎます。

<a id="edit-button"></a>
## 「TurboWarp-Plus-Editorで編集」ボタン

既存のTurboWarp Plusブランドの青いベースを青色鉛筆で塗るSVGを、編集操作用のブランドバリエーションとして提供します。画像だけでなく操作名も表示し、キーボードでフォーカスできるリンクを使います。共通CSSは高さ56px以上、画像36px、明確なフォーカス表示を設定します。

HTMLページの `<head>` にスタイルシートを1回読み込み、ボタンを置きたい場所へ次を貼り付けます。

```html
<link rel="stylesheet"
      href="https://kubohiroya.github.io/turbowarp-plus-editor/assets/edit-button.css">

<a class="twpe-edit-button"
   href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja&amp;project_url=https%3A%2F%2Fexample.com%2Fstory.sb3">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="36" height="36" alt="" aria-hidden="true">
  <span>TurboWarp-Plus-Editorで編集</span>
</a>
```

新しい作品用のボタンは `project_url` を省略します。英語では `lang=en` と `Edit in TurboWarp-Plus-Editor` を使います。

通常版はアイコンと操作名を表示します。小サイズ版は `twpe-edit-button--small` を追加し、表示文言を「編集」、`title` と `aria-label` を「TurboWarp-Plus-Editorで編集」にします（英語は `Edit` / `Edit in TurboWarp-Plus-Editor`）。`title` がホバー時のツールチップです。

```html
<a class="twpe-edit-button twpe-edit-button--small"
   href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja"
   title="TurboWarp-Plus-Editorで編集" aria-label="TurboWarp-Plus-Editorで編集">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="24" height="24" alt="" aria-hidden="true">
  <span>編集</span>
</a>
```

両サイズとも既定はOSの配色に追従（auto）します。`<html data-theme="light">` / `dark` で固定し、`auto` または属性の削除で自動へ戻せます。JavaScriptで生成する場合は `renderEditButton({size: 'small', language: 'ja', projectURL: 'https://example.com/story.sb3'})` を使います。省略時は通常版です。

GitHub READMEは外部CSSを適用できないため、次の画像付きリンクを使用できます。

```html
<a href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="36" height="36" alt=""> TurboWarp-Plus-Editorで編集
</a>
```

TurboWarp Plusの機能拡張一覧は通常のEditor URLから利用できます。従来のカタログ経路を使う場合は `twPlusExtensionLoader=0&twPlusExtensions=1` を指定して再起動します。その他のGUI機能フラグは変更せず、ボタンに渡したパラメーターも保持します。

Issue #4 の拡張Loaderは、独立したLoaderコアと薄いGUI/VMアダプターで実装します。通常配信では、URLフラグなしでEmbedded/Remoteの検証・許可UIを利用できます（起動時固定・既定ON）。Plus作品のPackager操作はローカル出力画面へ進みます。カタログに載っている拡張はEditorと同じく確認なしで動き、カタログにない拡張だけ、生成時と受け取り側の初回実行時に承認を確認します。`twPlusExtensionLoader=0` を指定して再起動するとLoaderを無効にできます。従来の `=1` も利用でき、不正値はOFFです。構成、検証、Desktopの制約、切戻しは [接続仕様](docs/extension-loader-integration.md) を参照してください。

機能拡張一覧でEmbedded／Remoteを一括・個別設定するUIは [Issue #11の操作・開発ガイド](docs/extension-authoring-ui.md) を参照してください。このUIは通常起動から利用できます（既定ON）。`twPlusExtensionLoader=0` で無効にできます。「カスタム拡張機能」は本家TurboWarpと同じ画面で、ローダーを通しません。

## npmで利用する

```sh
npm install @kubohiroya/turbowarp-plus-editor
```

```js
import {createEditorURL, renderEditButton} from '@kubohiroya/turbowarp-plus-editor';

const url = createEditorURL({
    language: 'ja',
    projectURL: 'https://example.com/story.sb3',
    parameters: {fps: 60}
});
const html = renderEditButton({language: 'ja', projectURL: 'https://example.com/story.sb3'});
```

ブランドSVG、ボタンCSS、URL/HTML生成関数、配信元の固定情報をnpmに含めます。巨大なGUI生成物はnpmへ同梱せず、固定情報を使ってPages用にビルドします。HTTP(S)以外の作品URLと未対応言語はURL生成関数が拒否します。

## 開発と配信

Node.js 26を使用します。自作コード・スクリプト・設定・テストはTypeScript（`.ts` / CommonJSの`.cts`）で管理します。開発用スクリプトはNode.jsの型除去で実行します。`npm run build` は公開用JavaScriptと型定義を `dist/` へ生成し、`npm pack` でも自動実行されます。実VSCode検証の前に `npm run build:test-driver` を実行します。

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:package
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui \
TW_PLUS_PACKAGER_ROOT=/absolute/path/to/pinned/packager npm run build:pages
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui npm run test:e2e
```

GUIとPackagerは `site/source.json` に記録したSHAをチェックアウトします。GUIの依存をインストールし、`node scripts/prepublish.mjs` で準備します。ビルドはGUIのSHA、実際にインストールされたdata-editorのSHA、security-dialogのバージョンが固定値と一致することを確認します。Pagesは統合検証に成功したmainから配信します。リリースのタグはnpmのバージョンと一致させます。

統合Editorの動作確認はこのリポジトリが担当します。既存の上流ライブラリの単体テストとGUIの機能フラグは維持します。新配信先の確認後、各参照先を移行し、旧data-editorのPagesを停止します。旧サイトへのリダイレクト配信は残しません。切戻しは直前のGUI固定SHA・サイト差分へのrevertと直前成果物の再配信で行います。

## 組み込み文書を編集する（0.2.0-rc.1）

[Issue #3](https://github.com/kubohiroya/turbowarp-plus-editor/issues/3)と[共通化Issue #6](https://github.com/kubohiroya/turbowarp-plus-editor/issues/6)に対応する試験公開機能です。起動時に `twPlusYamlEditor=1` を指定したEditorで有効になります。既定OFFです。Visual Studio CodeとNode.jsをインストールした環境で、ローカル補助プロセスからEditorを開きます。編集UIと外部エディタ連携は `@kubohiroya/turbowarp-document-editor` に分離し、scratch-guiフォークが直接組み込みます。TurboWarp-Plus-EditorはGUIの固定・ビルド・配信を担当します。原文文書の保存・文書参照・提供元登録は `@kubohiroya/turbowarp-document-data`、ハット・YAMLアイコン・共通YAMLブロックは独立した `@kubohiroya/turbowarp-document-source` に置きます。各拡張が文書を登録し、共通編集UIは所有者の検証と差分適用を呼び出します。標準のSB3ファイル保存はGUIが担当します。

提供元は文書を所有する各拡張に置き、その拡張の検証APIとSchemaを使用します。Editorのブラウザ用コードにはAppやそのparserを組み込まず、依存パッケージにもAppを含めません。対象となる作品と旧作品の移行手順は、各Appの文書を参照してください。

準備済みのEditorビルドに機能を加え、ローカルで起動します。`build:pages`で新たにビルドした場合は、同じ追加処理を自動で実行します。

```sh
npm ci --ignore-scripts
npm run build:yaml-tools -- /absolute/path/to/editor/build
npm run editor:yaml -- --site-dir /absolute/path/to/editor/build --data-dir /absolute/path/to/work-files
```

共有パッケージは公開rcへ固定しています。VSCodeとの連携には、ビルド済みEditorを配信するローカル補助プロセスが必要です。npmパッケージからも次のように起動できます。

```sh
npx --package=@kubohiroya/turbowarp-plus-editor@0.2.0-rc.1 turbowarp-plus-editor-yaml --site-dir /absolute/path/to/editor/build --data-dir /absolute/path/to/work-files
```

GitHub Pages上では文書の表示・変換・検証を利用できます。VSCodeを起動する操作は、上記のローカルURLで開いた場合に利用できます。

表示されたローカルURLを開くと、起動時固定の `twPlusYamlEditor=1` が有効になります。読み取り箇所はscratch-guiの `config/feature-flags.js` です。

1. 組み込み文書のSB3をEditorで開き、「データソース」ハットブロックのファイルアイコンを押します。文書ダイアログのYAMLテキストタブで「外部エディタで編集」を選びます。
2. 開いたYAMLを編集してVSCodeで保存します。
3. Editorへ戻って、ダイアログ右下の「表示されている形式に変換して検証・保存」を押します。VSCodeで保存済みの作業コピーを読み、書式・アセット参照・プロジェクトの同一性を検証して、Editor内の文書と整合性情報へ反映します。
4. 作品ファイルを残すには、Editor標準の「ファイル」メニューまたは「コンピューターに保存する」でSB3を保存します。ダイアログの「保存」ではファイルをダウンロードしません。画像・音声の格納方式は変わりません。

ハットブロックは組み込みYAMLへの入口です。ドロップダウンにファイル名を表示し、SB3には提供元IDと文書IDの参照を持ちます。文書の文字列をブロックの引数に複製しません。複数文書は同じファイル名でもIDで区別し、別文書へ移るときは、現在のダイアログを「保存」または「キャンセル」で閉じます。実際の文書取得・検証・更新は、その文書を所有する提供元に委ねます。この仕組みは特定のAppに依存しません。文書を所有する拡張がハットブロックを付けたSB3が対象です。ハットのない旧SB3へ、Editorから未知のブロックや拡張コードを自動挿入することはありません。文書の提供元が変換能力を登録すると、同じダイアログから原文ファイル・共通YAMLブロック・スキーマ専用ブロックを変換できます。

提供元は任意の `schema: {id, schema}` を文書ごとに指定できます。ローカル連携は所有者のSchemaと関連付けを作業フォルダへ保存し、YAML本文には設定用のコメントを挿入しません。Schema付き文書を初めて開くと、専用拡張領域へ公式のRed Hat YAML拡張 `redhat.vscode-yaml@2.0.0` を取得します。既存VSCodeの設定・拡張一覧は変更しません。初回取得には通信が必要です。Schemaがない文書は従来どおり所有者の検証で取り込みます。

VSCode側の補完と診断には[Red Hat YAMLのSchema関連付け](https://github.com/redhat-developer/vscode-yaml#associating-schemas)を使用します。所有者は原文の編集用Schemaを供給でき、取り込み時には所有者自身の検証も実行します。

補助プロセスはこのローカルEditorからの認証付き操作だけを受け付けます。VSCodeには専用の作業ファイルと独立した設定領域を渡し、既存のウィンドウ・設定・拡張機能を変更しません。保存済みの作業ファイルは、接続終了やプロセス停止後も保持します。実行するコマンドや任意のローカルパスをWeb側から指定する機能はありません。

YAMLが不正な場合や別作品へ切り替えた場合は、古い内容を上書きしません。反映できなかった草稿はVSCodeの作業ファイルに保持します。右上のXと「キャンセル」は、ダイアログ内の候補を破棄してEditorを書き換えずに閉じます。作業ファイルは削除しません。文書に新しいアセット参照を追加する操作は、既存のアセット一式で検証できる範囲に限ります。

macOSの内部通信パス上限を超える保存先では、作業ファイルを移動せず、VSCode設定領域だけを短い専用ディレクトリへ自動分離します。実際の保存先は作業領域の `host.json` に記録します。

切戻しはフラグを外して再起動し、必要に応じて直前の検証済み版へ戻します。補助プロセスを停止しても作業ファイルは保持します。

関連検証:

```sh
npm run test:yaml
TWPE_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:yaml:browser
# アセットを含む任意のSB3から、テスト専用fixtureを生成します。
node scripts/yaml-editor/build-settings-fixture.ts /absolute/path/to/base.sb3 /absolute/path/to/settings.sb3
node scripts/yaml-editor/build-document-source-fixture.ts /absolute/path/to/base.sb3 /absolute/path/to/document-source.sb3
TWPE_YAML_SITE=/absolute/path/to/editor/build \
TWPE_YAML_FIXTURE=/absolute/path/to/settings.sb3 \
TWPE_YAML_EVIDENCE=/absolute/path/to/evidence \
TWPE_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run test:yaml:roundtrip
# 同じ環境変数で、2文書のsettings fixtureも検証できます。
node --test test/yaml-multi-document.browser.ts
# 表現プレビューは同じ環境変数で、document-source fixtureを指定して検証します。
node --test test/representation-preview.browser.ts
```

`test:yaml:browser` は固定済みの共通document-editorとdocument-source registryに試験用の提供元・VMを接続し、URLプレビュー・取消・保存・再取得・埋め込みファイルへの変換を検証します。App固有APIは必要ありません。CIではPlaywrightのChromiumで実行し、ローカルの既存ブラウザーは `TWPE_CHROME_EXECUTABLE`（互換用に `CHROME_PATH` も可）で指定できます。

SB3往復の自動ブラウザ回帰ではネイティブ起動だけを注入し、実GUI・実VM・実SB3で検証します。実VSCode確認には `test/vscode-edit-driver/` のテスト専用Extension Development Hostを用い、VSCode自身の文書編集・保存APIで作業YAMLを保存します。このdriverを通常の補助プロセスへインストールする必要はありません。

### 原文・共通YAMLブロック・スキーマ専用ブロック

原文ファイル、キー・配列・値・コメントを表す共通YAMLブロック、所有するAppが供給するスキーマ専用ブロックを、同じ文書の3つの表現として扱います。原文を意味と変換の基準とし、ブロックを編集中はその内容もEditorの編集状態へ保持します。別のブロック表現へ移るときは、現在の編集を原文へ反映した上で変換する処理を、一つの保存操作の中で行います。変換先を選ぶだけでは作品を書き換えません。初期タブは現在の保存済み表現です。プレビューの上に「💽=保存済み形式」を表示します。別のタブで「保存」を押すと変換確認を表示し、OKで検証・変換してEditorへ反映します。Cancelは選択を保持してダイアログへ戻ります。Xと「キャンセル」は同じ取消操作です。未反映のブロックを原文から再生成して上書きする操作は拒否します。

各タブには、その形式のプレビューを表示します。原文タブはテキスト、ブロックのタブは読み取り専用のScratchBlocksを表示し、表示だけでは作品を書き換えません。ブロックは移動・編集できず、スクロールと拡大縮小で確認できます。💽はEditor内で現在保存されている形式を表し、SB3ファイルをダウンロードしたことを表すものではありません。

共通YAMLブロックはコメントを1行ずつ、複数行の文字列を行と改行種別のブロックで扱います。標準の文字入力欄で改行が失われるのを防ぎます。未編集の原文は改行・引用符・コメントをそのまま保持します。編集した部分の出力書式は所有者とYAMLライブラリが決定します。JSONではコメントを許可しません。

- `turbowarp-yaml-json`: YAML/JSONの解析・出力、原文構文、Schema検証。
- `turbowarp-document-data`: 原文・Schema・文書参照・提供元登録とSB3への永続化。
- `turbowarp-structured-data`: 原文から実行時の値を生成する一時的な投影。原文を書き換えません。
- `turbowarp-document-source`: 共通ハット・共通ブロック・変換候補と適用の契約。
- 各App: DSL専用の検証、スキーマ専用ブロックへの変換、実行データの再生成。
- turbowarp-document-editor: 操作ダイアログ、外部エディタ連携、プレビューと保存の操作。
- scratch-guiフォーク: 共通編集UIの組み込み、VM・Blockly接続、標準SB3ファイル保存。
- TurboWarp-Plus-Editor: GUIの固定・ビルド・配信。

`turbowarp-document-data` の原文文書はYAMLとJSONを利用でき、HTML/Markdownの既存APIは維持します。下位の文書形式判定を担当する `turbowarp-named-data` にもYAML/JSONを追加します。構造化データの既存の限定Schema解釈と、文書の完全なJSON Schema検証は別の契約として維持します。

新しい文書保存・投影・表現変換は既定OFFです。`twPlusYamlEditor=1` でEditorの文書操作を有効にします。提供元も同じ起動条件で自身の文書操作を切り替えられます。各文書の変換能力は所有者が提供し、未対応の拡張へ変換機能を追加することはありません。旧ブロック表現に元のモジュールYAMLが保存されていない場合、コメント等を含む元ファイルを復元したとは扱いません。

「ガイドを参照」は提供元のWebサイトを別タブで開きます。独立した検証ボタンは置かず、右下の「表示されている形式に変換して検証・保存」で表示中の形式を検証して反映します。ブロック表現を編集中のVSCode操作は、原文へ反映するまで無効になります。原文がJSONの場合、VSCode標準のJSON支援とSchema関連付けを使います。

## English

TurboWarp-Plus-Editor is an independent editor distribution by Hiroya Kubo. This downstream package builds the pinned `kubohiroya/scratch-gui` fork, verifies its library versions and integration, and deploys it to GitHub Pages. The upstream libraries do not build the GUI.

Use the landing page to create a project, open an SB3 URL, or continue to the editor and open a local file. Embed the SVG edit icon with the visible label **Edit in TurboWarp-Plus-Editor** and `assets/edit-button.css`; use `lang=en` and an encoded `project_url`. The snippet above preserves the work’s URL and provides a large keyboard-accessible action.

## ライセンス・製作者

ライセンス: GPL-3.0-or-later。統合GUIと同梱物については各ライセンス・NOTICEも参照してください。

製作者: [Hiroya Kubo](https://github.com/kubohiroya)

## ブロックアイコンのプレビュー

統合したデータエディターは、任意API `Scratch.gui.blockEditors.registerPreview` を提供します。仕様は `@kubohiroya/turbowarp-extension-data-editor` の `docs/block-preview.md` を参照してください。各拡張は自身のブロックにプレビューを登録します。プレビューは既存フォームと下書きを共有し、永続化はフォームの「保存」だけが行います。そのため1回の保存は1回のUndoで戻せます。`Scratch.gui.createPreviewVm()` は、拡張を読み込めない独立したVMを作成します。

プレビューと、それを有効にする切り替えは各拡張が所有します。Editor自身はプレビューやプレビュー用サンプルを同梱しません。`test/e2e/turbowarp/block-icon-preview.spec.cts` は、テスト専用の拡張でこのホスト契約を検証します。

## データソース4形式のローカル移行候補

`twPlusYamlEditor=1&twPlusDocumentSource=1` を起動時に指定すると、互換性を持つ提供元の文書で「SB3内のファイル」「外部URL」を選択できます。参照元とYAMLテキスト/YAMLブロック/スキーマ専用ブロックの表現を分けて扱います。文書の名前とreferenceは保持されます。汎用の表示名は「データソース」で、提供元が独自の表示名を指定することもできます。

参照元変更後は取得してプレビューし、画面下の保存で同じ検証済み候補を反映します。キャンセルは作品を変更しません。外部URLはCORSで取得できるHTTPSを指定します。外部の内容を編集・ブロック化するには、参照元を「SB3内のファイル」へ変更・保存して取り込みます。遠隔サイトへの書き戻しは行いません。実行時のURL再取得は提供元が担当し、失敗時に古いcacheへ黙って戻ってはいけません。

新フラグは既定OFFです。scratch-guiは `config/feature-flags.js` で読み取り、参照元の切り替えに対応する提供元はそれぞれ自身で読み取ります。切戻しは新フラグを外して再起動し、元SB3を利用します。現在の依存はローカル候補への参照であり、公開版への参照更新・新npm/リポジトリの公開は別途行います。

この候補は、直前の未公開UI修正（プレビューの重なり表示防止、タブ内の保存形式表示、外部エディタのフローティングボタン、ガイド/Schemaリンク）を引き継いでいます。
