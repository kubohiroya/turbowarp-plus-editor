const query = new URLSearchParams(location.search);
const languages = ['ja', 'en'];
const chooseLanguage = () => {
    if (languages.includes(query.get('lang'))) return query.get('lang');
    try { if (languages.includes(localStorage.getItem('twpe-language'))) return localStorage.getItem('twpe-language'); } catch {}
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
};
const text = {
    ja: {skip:'本文へ',eyebrow:'作品をつくる・開く',heading:'TurboWarp-Plusの作品をつくる・開く',intro:'機能拡張の実行条件を確認し、ブロックのデータをフォームで編集できます。',edit:'TurboWarp-Plus-Editorで編集',note:'新しい作品をつくる、またはエディターの「ファイル」から手元のSB3作品を開けます。',open:'URLから作品を開く',label:'作品のSB3ファイルのURL',urlNote:'HTTPSで公開され、ブラウザーから取得できるSB3ファイルを指定してください。',featureForms:'対応ブロックをフォームで編集・検証・保存',featureExtensions:'拡張の実行条件を確認し、コードの保存方法を選択',featureOptional:'文書をテキスト・ブロックで編集し、スクリプトとステージを別作品へ転送',featureProperties:'作品のプロパティ：タイトル・概要・作者・連絡先を日時とともにSB3へ保存。作者名と連絡先の履歴各5件、メール・HTTPSリンク',featureDiagnostics:'作品の診断：検証・実行許可・読み込み・失敗の記録を確認・コピー',featureProjectTools:'作品のプロパティは「ファイル」メニューから開き、作品の診断はそのダイアログの「作品の診断…」から開きます。作品情報は適用後にSB3を保存し、診断記録はページを開いている間だけ保持します。',featureGuide:'実画面と図で読む追加機能ガイド（日本語）',featureImage:'対応ブロックをフォームで編集する例',featureCondition:'フォーム・文書・プレビューは対応する拡張が提供します。',features:'標準TurboWarpから増える機能',featureBody:'TurboWarp Plusの作品を開き、機能拡張の実行条件を確認できます。ブロックのデータをフォームで編集する機能も備えています。',independent:'kubohiroyaによる独立したTurboWarpフォークです。',source:'ソースコード',button:'編集ボタンの設置方法',build:'配信バージョン',invalid:'有効なHTTPSのSB3ファイルURLを入力してください。'},
    en: {skip:'Skip to content',eyebrow:'CREATE AND OPEN PROJECTS',heading:'Create and open TurboWarp Plus projects.',intro:'Review extension execution requirements and edit block data in forms.',edit:'Edit in TurboWarp-Plus-Editor',note:'Create a project, or open an SB3 file on your device from the editor’s File menu.',open:'Open a project URL',label:'URL of the project’s SB3 file',urlNote:'Use an HTTPS SB3 file that permits your browser to fetch it.',featureForms:'Edit, validate, and save supported block data in forms',featureExtensions:'Review extensions and choose how their code is stored',featureOptional:'Edit documents as text or blocks, and move scripts and stages between projects',featureProperties:'Project Properties: save the title, description, author, contact, and timestamps in the SB3; choose from five recent author/contact entries and open email/HTTPS links',featureDiagnostics:'Project Diagnostics: inspect and copy validation, execution approval, loading, and failure records',featureProjectTools:'Open Project Properties from the File menu, and Project Diagnostics from that dialog’s “Project Diagnostics…” button. Save the SB3 after applying properties; diagnostics last only while the page remains open.',featureGuide:'Explore the illustrated feature guide (Japanese)',featureImage:'Form editing for a supported block',featureCondition:'Forms, documents, and previews require supporting extensions.',features:'Added features compared with standard TurboWarp',featureBody:'Open TurboWarp Plus projects, review extension execution requirements, and edit block data in forms.',independent:'An independent TurboWarp fork by kubohiroya.',source:'Source code',button:'Add an edit button',build:'Build information',invalid:'Enter a valid HTTPS URL for an SB3 project.'}
};
function applyLanguage(language) {
    const words = text[language];
    document.documentElement.lang = language;
    document.querySelector<HTMLElement>('turbowarp-plus-header')?.setAttribute('site-lang', language);
    for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) element.textContent = words[element.dataset.text];
    for (const element of document.querySelectorAll<HTMLElement>('[data-alt]')) element.setAttribute('alt', words[element.dataset.alt]);
    for (const button of document.querySelectorAll<HTMLElement>('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-editor]')) {
        const target = new URL('editor.html', location.href);
        target.search = query.toString();
        target.searchParams.set('lang', language);
        link.href = target.href;
    }
    document.querySelector<HTMLInputElement>('#project-url').value = query.get('project_url') || '';
}
let language = chooseLanguage();
applyLanguage(language);
for (const button of document.querySelectorAll<HTMLElement>('[data-language]')) button.addEventListener('click', () => {
    language = button.dataset.language;
    query.set('lang', language);
    try { localStorage.setItem('twpe-language', language); } catch {}
    history.replaceState(null, '', `?${query}`);
    applyLanguage(language);
});
document.querySelector<HTMLElement>('form').addEventListener('submit', event => {
    event.preventDefault();
    const error = document.querySelector<HTMLElement>('#url-error');
    try {
        const project = new URL(document.querySelector<HTMLInputElement>('#project-url').value);
        if (project.protocol !== 'https:') throw new TypeError('HTTPS required');
        const target = new URL('editor.html', location.href);
        target.search = query.toString();
        target.searchParams.set('lang', language);
        target.searchParams.set('project_url', project.href);
        location.assign(target.href);
    } catch { error.textContent = text[language].invalid; }
});
