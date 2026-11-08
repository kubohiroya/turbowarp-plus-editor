import {emitBrowserModule} from './browser-modules.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exactVersion, sha} from './source.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export async function generatePages(output, revision, coreRevision, {siteRevision, coreVersion, licensePath, securityVersion = '0.3.3', securityRevision}: {siteRevision?: string; coreVersion?: string; licensePath?: string; securityVersion?: string; securityRevision?: string} = {}) {
    for (const value of [revision, coreRevision, siteRevision]) {
        if (!/^[a-f0-9]{40}$/.test(value || '')) throw new TypeError('Full GUI, core and site revisions are required');
    }
    if (!exactVersion(coreVersion)) throw new TypeError('An exact core version is required');
    if (securityRevision !== undefined && !sha(securityRevision)) throw new TypeError('A full security revision is required');
    await fs.mkdir(path.join(output, 'assets'), {recursive:true});
    await fs.cp(path.join(root, 'docs/features'), path.join(output, 'features'), {recursive: true});
    for (const file of ['icon.svg','edit-button.css']) await fs.copyFile(path.join(root,'assets',file),path.join(output,'assets',file));
    for (const file of ['style.css']) await fs.copyFile(path.join(root,'site',file),path.join(output,'assets',file));
    for (const file of ['app']) await emitBrowserModule(path.join(root, 'site', `${file}.ts`), path.join(output, 'assets', `${file}.js`));
    // Keep stylesheet imports local so embed assets also work on third-party sites.
    const css = await fs.readFile(path.join(output,'assets/style.css'),'utf8');
    await fs.writeFile(path.join(output,'assets/style.css'),css.replace("../assets/edit-button.css","./edit-button.css"));
    const button = `<img src="assets/icon.svg" width="36" height="36" alt="" aria-hidden="true"><span data-text="edit">TurboWarp-Plus-Editorで編集</span>`;
    await fs.writeFile(path.join(output,'index.html'),`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TurboWarp-Plus-Editor</title><meta name="description" content="TurboWarp Plusの作品をつくる・開くエディター。">
<link rel="icon" type="image/svg+xml" href="assets/icon.svg"><link rel="stylesheet" href="assets/style.css"><script type="module" src="assets/app.js"></script><script type="module" src="https://kubohiroya.github.io/turbowarp-plus-site-header/dist/auto.js"></script></head>
<body><turbowarp-plus-header repo="turbowarp-plus-editor" site-lang="ja"></turbowarp-plus-header><a class="skip" href="#main" data-text="skip">本文へ</a><div class="wrap">
<header><a class="brand" href="./"><img src="assets/icon.svg" width="48" height="48" alt=""><span>TurboWarp-Plus-Editor</span></a><nav aria-label="Language"><button type="button" data-language="ja" lang="ja">日本語</button><button type="button" data-language="en" lang="en">English</button></nav></header>
<main id="main"><div class="hero"><div><p class="eyebrow" data-text="eyebrow">作品をつくる・開く</p><h1 data-text="heading">TurboWarp-Plusの作品をつくる・開く</h1><p class="lead" data-text="intro">機能拡張の実行条件を確認し、ブロックのデータをフォームで編集できます。</p><div class="actions"><a class="twpe-edit-button" data-editor href="editor.html?lang=ja">${button}</a></div><p class="small" data-text="note">新しい作品をつくる、またはエディターの「ファイル」から手元のSB3作品を開けます。</p></div><img src="assets/icon.svg" width="250" height="250" alt=""></div>
<div class="cards"><section class="panel"><h2 data-text="open">URLから作品を開く</h2><form><label for="project-url" data-text="label">作品のSB3ファイルのURL</label><input id="project-url" type="url" required placeholder="https://example.com/project.sb3" aria-describedby="url-note url-error"><p id="url-note" class="small" data-text="urlNote">HTTPSで公開され、ブラウザーから取得できるSB3ファイルを指定してください。</p><button type="submit" class="twpe-edit-button">${button}</button><p id="url-error" class="error" role="alert"></p></form></section>
<section class="panel"><h2 data-text="features">標準TurboWarpから増える機能</h2><ul><li data-text="featureForms">対応ブロックをフォームで編集・検証・保存</li><li data-text="featureExtensions">拡張の実行条件を確認し、コードの保存方法を選択</li><li data-text="featureOptional">文書をテキスト・ブロックで編集し、スクリプトとステージを別作品へ転送</li><li><a href="features/save/#project-properties" data-text="featureProperties">作品のプロパティ：タイトル・概要・作者・連絡先を日時とともにSB3へ保存。作者名と連絡先の履歴各5件、メール・HTTPSリンク</a></li><li><a href="features/open/#project-diagnostics" data-text="featureDiagnostics">作品の診断：検証・実行許可・読み込み・失敗の記録を確認・コピー</a></li></ul><p class="small" data-text="featureProjectTools">作品のプロパティは「ファイル」メニューから開き、作品の診断はそのダイアログの「作品の診断…」から開きます。作品情報は適用後にSB3を保存し、診断記録はページを開いている間だけ保持します。</p><a href="features/" data-text="featureGuide">実画面と図で読む追加機能ガイド（日本語）</a><a href="features/documents/#forms"><img class="feature-shot" src="features/images/form.png" width="1440" height="1000" loading="lazy" alt="対応ブロックをフォームで編集する例" data-alt="featureImage"></a><p class="small" data-text="featureCondition">フォーム・文書・プレビューは対応する拡張が提供します。</p></section></div>
<p class="small" data-text="independent">kubohiroyaによる独立したTurboWarpフォークです。</p></main>
<footer><a href="https://github.com/kubohiroya/turbowarp-plus-editor" data-text="source">ソースコード</a><a href="https://github.com/kubohiroya/turbowarp-plus-editor#edit-button" data-text="button">編集ボタンの設置方法</a><a href="build-info.json" data-text="build">配信バージョン</a><p class="small">GUI <a href="https://github.com/kubohiroya/scratch-gui/tree/${escape(revision)}">${revision.slice(0,7)}</a> · Site <a href="https://github.com/kubohiroya/turbowarp-plus-editor/tree/${escape(siteRevision)}">${siteRevision.slice(0,7)}</a></p></footer></div></body></html>`);
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
