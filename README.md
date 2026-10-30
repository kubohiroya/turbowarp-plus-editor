# TurboWarp-Plus-Editor

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

新しい作品用のボタンは `project_url` を省略します。英語では `lang=en` と `Edit in TurboWarp-Plus-Editor` を使います。GitHub READMEは外部CSSを適用できないため、次の画像付きリンクを使用できます。

```html
<a href="https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja">
  <img src="https://kubohiroya.github.io/turbowarp-plus-editor/assets/icon.svg"
       width="36" height="36" alt=""> TurboWarp-Plus-Editorで編集
</a>
```

既存GUIの機能フラグは変更しません。TurboWarp Plusの機能拡張一覧を試す場合は、EditorのURLへ `twPlusExtensions=1` を指定して起動します。外すか `0` へ戻して再読込すれば無効になります。ボタンに渡したこのパラメーターも保持します。

Issue #4 の拡張Loaderは、独立したLoaderコアと薄いGUI/VMアダプターで実装します。ローカル統合版では `twPlusExtensionLoader=1` でEmbedded/Remoteの検証・許可UIを有効にできます（起動時固定・既定OFF）。Plus作品のPackager操作はローカル出力画面へ進み、生成時と受け取り側の初回実行時に承認を確認します。公開中の固定GUIにはまだ反映していません。構成、検証、Desktopの制約、切戻しは [接続仕様](docs/extension-loader-integration.md) を参照してください。

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

Node.js 26を使用します。

```sh
npm ci
npm test
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui npm run build:pages
E2E_GUI_ROOT=/absolute/path/to/pinned/scratch-gui npm run test:e2e
```

GUIは `site/source.json` に記録したSHAをチェックアウトして依存をインストールし、`node scripts/prepublish.mjs` で準備します。ビルドはGUIのSHA、実際にインストールされたdata-editorのSHA、security-dialogのバージョンが固定値と一致することを確認します。Pagesは統合検証に成功したmainから配信します。リリースのタグはnpmのバージョンと一致させます。

統合Editorの動作確認はこのリポジトリが担当します。既存の上流ライブラリの単体テストとGUIの機能フラグは維持します。新配信先の確認後、各参照先を移行し、旧data-editorのPagesを停止します。旧サイトへのリダイレクト配信は残しません。切戻しは直前のGUI固定SHA・サイト差分へのrevertと直前成果物の再配信で行います。

## English

TurboWarp-Plus-Editor is an independent editor distribution by Hiroya Kubo. This downstream package builds the pinned `kubohiroya/scratch-gui` fork, verifies its library versions and integration, and deploys it to GitHub Pages. The upstream libraries do not build the GUI.

Use the landing page to create a project, open an SB3 URL, or continue to the editor and open a local file. Embed the SVG edit icon with the visible label **Edit in TurboWarp-Plus-Editor** and `assets/edit-button.css`; use `lang=en` and an encoded `project_url`. The snippet above preserves the work’s URL and provides a large keyboard-accessible action.

## ライセンス・製作者

ライセンス: GPL-3.0-or-later。統合GUIと同梱物については各ライセンス・NOTICEも参照してください。

製作者: [Hiroya Kubo](https://github.com/kubohiroya)
