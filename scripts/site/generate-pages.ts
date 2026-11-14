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

async function writeLandingPage(output: string, revision: string, siteRevision: string) {
    const landing = path.join(root, 'docs/landing');
    const [template, japanese, english] = await Promise.all([
        fs.readFile(path.join(landing, 'index.html'), 'utf8'),
        fs.readFile(path.join(landing, 'ja.json'), 'utf8'),
        fs.readFile(path.join(landing, 'en.json'), 'utf8')
    ]);
    const ja = JSON.parse(japanese) as Record<string, string>;
    const en = JSON.parse(english) as Record<string, string>;
    const keys = new Set([...template.matchAll(/data-(?:text|alt)="([\w]+)"/g)].map(match => match[1]));
    keys.add('invalid');
    for (const [locale, words] of Object.entries({ja, en})) {
        for (const key of keys) {
            if (!Object.hasOwn(words, key) || typeof words[key] !== 'string') {
                throw new TypeError(`docs/landing/${locale}.json needs a string for ${key}`);
            }
        }
    }

    const versions = {guiRevision: revision, guiRevisionShort: revision.slice(0, 7),
        siteRevision, siteRevisionShort: siteRevision.slice(0, 7)};
    const values = {...ja, ...versions};
    // Escape '<' in inline JSON so translations cannot terminate the script element.
    const translations = JSON.stringify({ja, en}).replaceAll('<', '\\u003c');
    const html = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        if (key === 'translations') return translations;
        if (!Object.hasOwn(values, key)) throw new Error(`Unknown placeholder in docs/landing/index.html: ${key}`);
        return escape(values[key]);
    });
    await fs.writeFile(path.join(output, 'index.html'), html);
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
    await writeLandingPage(output, revision, siteRevision);
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
