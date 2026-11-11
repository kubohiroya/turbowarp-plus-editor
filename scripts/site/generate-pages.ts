import {emitBrowserModule} from './browser-modules.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exactVersion, sha} from './source.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

// The guide sources stay fragments so they can also be published as Artifacts; the site adds the
// document shell and the links back to the top page and across languages.
const developerGuides = [
    {file: 'index.html', lang: 'ja', top: '← TurboWarp-Plus-Editor', other: {file: 'index.en.html', lang: 'en', label: 'English'}},
    {file: 'index.en.html', lang: 'en', top: '← TurboWarp-Plus-Editor', other: {file: 'index.html', lang: 'ja', label: '日本語'}}
];
async function writeDeveloperGuides(target) {
    await fs.mkdir(target, {recursive: true});
    for (const {file, lang, top, other} of developerGuides) {
        const source = await fs.readFile(path.join(root, 'docs/developer-guide', file), 'utf8');
        const masthead = '<header class="masthead">';
        if (!source.includes(masthead)) throw new Error(`docs/developer-guide/${file} has no masthead`);
        const links = `<nav class="kicker" aria-label="${lang === 'ja' ? 'サイト' : 'Site'}"><a href="../?lang=${lang}">${top}</a> · <a href="${other.file}" hreflang="${other.lang}" lang="${other.lang}">${other.label}</a></nav>`;
        await fs.writeFile(path.join(target, file), `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<link rel="icon" type="image/svg+xml" href="../assets/icon.svg">\n${source.replace(masthead, `${masthead}\n  ${links}`)}</html>\n`);
    }
}

export async function generatePages(output, revision, coreRevision, {siteRevision, coreVersion, licensePath, securityVersion = '0.3.3', securityRevision}: {siteRevision?: string; coreVersion?: string; licensePath?: string; securityVersion?: string; securityRevision?: string} = {}) {
    for (const value of [revision, coreRevision, siteRevision]) {
        if (!/^[a-f0-9]{40}$/.test(value || '')) throw new TypeError('Full GUI, core and site revisions are required');
    }
    if (!exactVersion(coreVersion)) throw new TypeError('An exact core version is required');
    if (securityRevision !== undefined && !sha(securityRevision)) throw new TypeError('A full security revision is required');
    await fs.mkdir(path.join(output, 'assets'), {recursive:true});
    await fs.cp(path.join(root, 'docs/features'), path.join(output, 'features'), {recursive: true});
    await writeDeveloperGuides(path.join(output, 'developer-guide'));
    for (const file of ['icon.svg','edit-button.css']) await fs.copyFile(path.join(root,'assets',file),path.join(output,'assets',file));
    for (const file of ['style.css']) await fs.copyFile(path.join(root,'site',file),path.join(output,'assets',file));
    for (const file of ['app']) await emitBrowserModule(path.join(root, 'site', `${file}.ts`), path.join(output, 'assets', `${file}.js`));
    // Keep stylesheet imports local so embed assets also work on third-party sites.
    const css = await fs.readFile(path.join(output,'assets/style.css'),'utf8');
    await fs.writeFile(path.join(output,'assets/style.css'),css.replace("../assets/edit-button.css","./edit-button.css"));
    const button = `<img src="assets/icon.svg" width="36" height="36" alt="" aria-hidden="true"><span data-text="edit">TurboWarp-Plus-Editorで編集</span>`;
    await fs.writeFile(path.join(output,'index.html'),`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TurboWarp-Plus-Editor</title><meta name="description" content="コードとステージを好きな位置に並べ、作品全体を検索し、変更をGitで追い、ひとつのHTMLにまとめて渡せるTurboWarp Plusのエディター。">
<link rel="icon" type="image/svg+xml" href="assets/icon.svg"><link rel="stylesheet" href="assets/style.css"><script type="module" src="assets/app.js"></script><script type="module" src="https://kubohiroya.github.io/turbowarp-plus-site-header/dist/auto.js"></script></head>
<body><turbowarp-plus-header repo="turbowarp-plus-editor" site-lang="ja"></turbowarp-plus-header><a class="skip" href="#main" data-text="skip">本文へ</a><div class="wrap">
<header><a class="brand" href="./"><img src="assets/icon.svg" width="48" height="48" alt=""><span>TurboWarp-Plus-Editor</span></a><nav aria-label="Language"><button type="button" data-language="ja" lang="ja">日本語</button><button type="button" data-language="en" lang="en">English</button></nav></header>
<main id="main"><div class="hero"><div><p class="eyebrow" data-text="eyebrow">Scratch・TurboWarpの作品が開く</p><h1 data-text="heading">TurboWarp/Scratch作品をモダンな開発スタイルで制作できる、拡張可能なエディタ。</h1><p class="lead" data-text="intro">ブロックとテキストを使い分け、スクリプトを再利用し、作品に合った編集機能を追加できます。</p><div class="actions"><a class="twpe-edit-button" data-editor href="editor.html?lang=ja">${button}</a></div><p class="small" data-text="note">新しい作品をつくる、手元のSB3を開く、作品フォルダを開く。ここで保存したSB3は、ScratchやTurboWarpでもそのまま開けます。</p></div><div class="hero-shots"><div class="shot hero-main"><img src="features/images/top-editor.png" width="1200" height="660" alt="ネコとボールのスプライトと、ブロックを並べたコードの画面" data-alt="heroShot"></div><img class="shot shot-stage" src="features/images/top-stage-window.png" width="560" height="380" alt="別のウィンドウに出したステージ" data-alt="heroStageShot"></div></div>
<section class="terms panel" aria-labelledby="terms-heading"><h2 id="terms-heading" data-text="terms">このサイトで使う言葉</h2><dl><div><dt data-text="termFeature">追加機能</dt><dd data-text="termFeatureDef">TurboWarp-Plus-Editorがエディター本体に組み込み、標準TurboWarpに足している機能です。どの作品を開いても使えます。パネルの配置、作品全体の検索、ローカルGitなどがこれに当たります。</dd></div><div><dt data-text="termExtension">拡張</dt><dd data-text="termExtensionDef">作品が読み込んで使う、Scratch・TurboWarpの拡張機能です。ブロックや、カメラ・センサーなどの入出力を足します。作品に同梱して配ることもできます。</dd></div><div><dt data-text="termAddon">アドオン</dt><dd data-text="termAddonDef">TurboWarpに同梱されている、Scratch Addons由来の小さな機能です。設定画面で一つずつ入り切りでき、TurboWarp-Plus-Editorでもそのまま使えます。</dd></div></dl></section>
<div class="cards"><section class="panel"><h2 data-text="open">URLから作品を開く</h2><form><label for="project-url" data-text="label">作品のSB3ファイルのURL</label><input id="project-url" type="url" required placeholder="https://example.com/project.sb3" aria-describedby="url-note url-error"><p id="url-note" class="small" data-text="urlNote">HTTPSで公開され、ブラウザーから取得できるSB3ファイルを指定してください。</p><button type="submit" class="twpe-edit-button">${button}</button><p id="url-error" class="error" role="alert"></p></form></section>
<section class="panel"><h2 data-text="features">追加機能：標準TurboWarpから増える機能</h2><ul><li data-text="featureOpen">ひらく：読み込みの経過表示、Plusカタログ、開けないときの診断</li><li data-text="featureManage">管理する：作品フォルダの読み書き、ローカルGitの差分と履歴、公開PRのレビュー</li><li data-text="featureArrange">並べる：パネルの分割、パレットとコードの別画面、次に開くときの配置復元</li><li data-text="featureEdit">直す：作品全体の検索と置換、編集メニュー、検索付きの横型パレット、ミニマップ、JSON Schemaから作るフォームとYAML文書</li><li data-text="featureReuse">再利用する：スクリプトとステージの転送、バンドル素材の追加</li><li data-text="featureShare">わたす：上書き保存と名前を変えて保存、データと拡張コードの保存形式、Plus拡張を同梱した単一HTML</li><li data-text="featureCollaborate">AIと組む：作品フォルダはテキストとファイルなので、エージェントが読んで書き、差分とPRでレビューできる</li><li><a href="features/save/#project-properties" data-text="featureProperties">作品のプロパティ：タイトル・概要・作者・連絡先を日時とともにSB3へ保存。作者名と連絡先の履歴各5件、メール・HTTPSリンク</a></li><li><a href="features/open/#project-diagnostics" data-text="featureDiagnostics">作品の診断：検証・実行許可・読み込み・失敗の記録を確認・コピー</a></li></ul><p class="small" data-text="featureProjectTools">作品のプロパティは「ファイル」メニューから開き、作品の診断はそのダイアログの「作品の診断…」から開きます。作品情報は適用後にSB3を保存し、診断記録はページを開いている間だけ保持します。追加の拡張や有効化の設定は要りません。</p><p class="small" data-text="featureCondition">フォーム・文書・プレビューは対応する拡張が提供します。</p></section></div>
<section class="docs" aria-labelledby="docs-heading"><h2 id="docs-heading" data-text="docs">ドキュメント</h2><div class="cards docs-cards"><section class="panel"><a class="doc-shot" href="features/search/" tabindex="-1"><img src="features/images/top-search.png" width="454" height="288" loading="lazy" alt="作品全体を検索し、メッセージの送受信を一覧にした画面" data-alt="featureGuideShot"></a><p class="eyebrow" data-text="docsUsers">使う人へ</p><h3><a href="features/" data-text="featureGuide">実画面と図で読む追加機能ガイド（日本語）</a></h3><p class="small" data-text="featureGuideNote">追加機能を、実際の画面と図を使い、作業の流れに沿って説明します。</p></section><section class="panel"><a class="doc-shot" href="developer-guide/#howto" tabindex="-1"><img src="features/images/top-layout-menu.png" width="259" height="241" loading="lazy" alt="Plusが加えた、編集パネルのレイアウトのメニュー" data-alt="developerGuideShot"></a><p class="eyebrow" data-text="docsDevelopers">開発する人へ</p><h3 data-text="developerGuide">追加機能の作り方（開発者ガイド）</h3><ul class="doc-languages"><li><a href="developer-guide/" hreflang="ja" lang="ja">日本語</a></li><li><a href="developer-guide/index.en.html" hreflang="en" lang="en">English</a></li></ul><p class="small" data-text="developerGuideNote">Scratch AddonsやTurboWarpのアドオンとの比較、追加機能をエディターに組み込む仕組みの仕様、新しい追加機能を作る手順をまとめています。</p><p class="small" data-text="featurePlatform">拡張は使うだけでなく、書く側にも進めます。一覧から追加して保存形式を選び、自分で書いた拡張をSB3に同梱し、sb3-toolchainで名前・サンドボックス要件・SHA-256を固定して配布できます。拡張はTypeScriptで書くことをすすめています。型定義の付いたAPIに対して書き、npmのライブラリをそのまま使えます。ドメインの専門家がJSON Schemaとその文書でDSLを定義し、作品がそれを運用する、という組み立てもできます。使える拡張とアプリの一覧は、TurboWarp Plusファミリーのページにあります。カメラ映像の共有、カメラ校正、AR、QR読み取り、Teachable Machineの認識、非同期入力といったPlus拡張を使えば、インタラクティブ作品やカメラ・センサーのホストアプリも、Editorをフォークせずに作れます。</p><p class="small"><a href="https://kubohiroya.github.io/turbowarp-plus-packages/" data-text="family">TurboWarp Plusファミリーの機能拡張一覧</a></p></section></div></section>
<p class="small" data-text="independent">kubohiroyaによる独立したTurboWarpフォークです。約20の独立したパッケージから組み立て、固定したリビジョンで配信しています。</p></main>
<footer><a href="https://kubohiroya.github.io/turbowarp-plus-packages/" data-text="family">TurboWarp Plusファミリーの機能拡張一覧</a><a href="https://github.com/kubohiroya/turbowarp-plus-editor" data-text="source">ソースコード</a><a href="https://github.com/kubohiroya/turbowarp-plus-editor#edit-button" data-text="button">編集ボタンの設置方法</a><a href="build-info.json" data-text="build">配信バージョン</a><p class="small">GUI <a href="https://github.com/kubohiroya/scratch-gui/tree/${escape(revision)}">${revision.slice(0,7)}</a> · Site <a href="https://github.com/kubohiroya/turbowarp-plus-editor/tree/${escape(siteRevision)}">${siteRevision.slice(0,7)}</a></p></footer></div></body></html>`);
    if (licensePath) await fs.copyFile(licensePath,path.join(output,'LICENSE'));
    await fs.copyFile(path.join(root,'NOTICE'),path.join(output,'NOTICE'));
    await fs.copyFile(path.join(root,'LICENSE.MPL-2.0'),path.join(output,'LICENSE.MPL-2.0'));
    await fs.writeFile(path.join(output,'.nojekyll'),'');
    await fs.writeFile(path.join(output,'build-info.json'),JSON.stringify({
        repository:'https://github.com/kubohiroya/scratch-gui',revision,
        coreRepository:'https://github.com/kubohiroya/turbowarp-extension-data-editor',coreRevision,coreVersion,
        securityPackage:'@kubohiroya/turbowarp-extension-security-dialog',securityVersion,
        ...(securityRevision === undefined ? {} : {securityRevision}),
        siteRepository:'https://github.com/kubohiroya/turbowarp-plus-editor',siteRevision
    },null,2)+'\n');
}
