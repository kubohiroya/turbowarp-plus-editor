const query = new URLSearchParams(location.search);
const languages = ['ja', 'en'];
const chooseLanguage = () => {
    if (languages.includes(query.get('lang'))) return query.get('lang');
    try { if (languages.includes(localStorage.getItem('twpe-language'))) return localStorage.getItem('twpe-language'); } catch {}
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
};
const text = {
    ja: {skip:'本文へ',eyebrow:'作品をつくる・開く',heading:'TurboWarp-Plusの作品をつくる・開く',intro:'機能拡張の実行条件を確認し、ブロックのデータをフォームで編集できます。',edit:'TurboWarp-Plus-Editorで編集',note:'新しい作品をつくる、またはエディターの「ファイル」から手元のSB3作品を開けます。',open:'URLから作品を開く',label:'作品のSB3ファイルのURL',urlNote:'HTTPSで公開され、ブラウザーから取得できるSB3ファイルを指定してください。',features:'機能拡張の確認とフォーム編集',featureBody:'TurboWarp Plusの作品を開き、機能拡張の実行条件を確認できます。ブロックのデータをフォームで編集する機能も備えています。',docs:'紙芝居の使い方',samples:'作品サンプル',independent:'kubohiroyaによる独立したTurboWarpフォークです。',source:'ソースコード',button:'編集ボタンの設置方法',build:'配信バージョン',invalid:'有効なHTTPSのSB3ファイルURLを入力してください。'},
    en: {skip:'Skip to content',eyebrow:'CREATE AND OPEN PROJECTS',heading:'Create and open TurboWarp Plus projects.',intro:'Review extension execution requirements and edit block data in forms.',edit:'Edit in TurboWarp-Plus-Editor',note:'Create a project, or open an SB3 file on your device from the editor’s File menu.',open:'Open a project URL',label:'URL of the project’s SB3 file',urlNote:'Use an HTTPS SB3 file that permits your browser to fetch it.',features:'Extension review and form editing',featureBody:'Open TurboWarp Plus projects, review extension execution requirements, and edit block data in forms.',docs:'Kamishibai documentation',samples:'Sample projects',independent:'An independent TurboWarp fork by kubohiroya.',source:'Source code',button:'Add an edit button',build:'Build information',invalid:'Enter a valid HTTPS URL for an SB3 project.'}
};
function applyLanguage(language) {
    const words = text[language];
    document.documentElement.lang = language;
    document.querySelector('turbowarp-plus-header')?.setAttribute('site-lang', language);
    for (const element of document.querySelectorAll('[data-text]')) element.textContent = words[element.dataset.text];
    for (const button of document.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    for (const link of document.querySelectorAll('[data-editor]')) {
        const target = new URL('editor.html', location.href);
        target.search = query.toString();
        target.searchParams.set('lang', language);
        link.href = target.href;
    }
    document.querySelector('#project-url').value = query.get('project_url') || '';
}
let language = chooseLanguage();
applyLanguage(language);
for (const button of document.querySelectorAll('[data-language]')) button.addEventListener('click', () => {
    language = button.dataset.language;
    query.set('lang', language);
    try { localStorage.setItem('twpe-language', language); } catch {}
    history.replaceState(null, '', `?${query}`);
    applyLanguage(language);
});
document.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const error = document.querySelector('#url-error');
    try {
        const project = new URL(document.querySelector('#project-url').value);
        if (project.protocol !== 'https:') throw new TypeError('HTTPS required');
        const target = new URL('editor.html', location.href);
        target.search = query.toString();
        target.searchParams.set('lang', language);
        target.searchParams.set('project_url', project.href);
        location.assign(target.href);
    } catch { error.textContent = text[language].invalid; }
});
