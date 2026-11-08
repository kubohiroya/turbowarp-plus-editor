const query = new URLSearchParams(location.search);
const languages = ['ja', 'en'];
const chooseLanguage = () => {
    if (languages.includes(query.get('lang'))) return query.get('lang');
    try { if (languages.includes(localStorage.getItem('twpe-language'))) return localStorage.getItem('twpe-language'); } catch {}
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
};
const text = {
    ja: {skip:'本文へ',eyebrow:'Scratch・TurboWarpの作品が開く',heading:'作品を、ひとつのファイルに閉じ込めない。',intro:'Scratch 3と標準TurboWarpで保存した作品を、そのまま開いて編集できます。コードとステージを好きな位置に並べ、別のウィンドウに出す。作品全体を検索して直す。作品をGitのフォルダとして持ち、変更を差分で読む。できた作品は、ひとつのHTMLにまとめて誰にでも渡せる。',edit:'TurboWarp-Plus-Editorで編集',note:'新しい作品をつくる、手元のSB3を開く、作品フォルダを開く。ここで保存したSB3は、ScratchやTurboWarpでもそのまま開けます。',open:'URLから作品を開く',label:'作品のSB3ファイルのURL',urlNote:'HTTPSで公開され、ブラウザーから取得できるSB3ファイルを指定してください。',featureOpen:'ひらく：読み込みの経過表示、Plusカタログ、開けないときの診断',featureManage:'管理する：作品フォルダの読み書き、ローカルGitの差分と履歴、公開PRのレビュー',featureArrange:'並べる：パネルの分割、パレットとコードの別画面、次に開くときの配置復元',featureEdit:'直す：作品全体の検索と置換、編集メニュー、検索付きの横型パレット、ミニマップ、JSON Schemaから作るフォームとYAML文書',featureReuse:'再利用する：スクリプトとステージの転送、バンドル素材の追加',featureShare:'わたす：上書き保存と名前を変えて保存、データと拡張コードの保存形式、Plus拡張を同梱した単一HTML',featureCollaborate:'AIと組む：作品フォルダはテキストとファイルなので、エージェントが読んで書き、差分とPRでレビューできる',featurePlatform:'拡張は使うだけでなく、書く側にも進めます。一覧から追加して保存形式を選び、自分で書いた拡張をSB3に同梱し、sb3-toolchainで名前・サンドボックス要件・SHA-256を固定して配布できます。拡張はTypeScriptで書くことをすすめています。型定義の付いたAPIに対して書き、npmのライブラリをそのまま使えます。ドメインの専門家がJSON Schemaとその文書でDSLを定義し、作品がそれを運用する、という組み立てもできます。カメラ映像の共有、カメラ校正、AR、QR読み取り、Teachable Machineの認識、非同期入力といったPlus拡張を使えば、インタラクティブ作品やカメラ・センサーのホストアプリも、Editorをフォークせずに作れます。',featureProperties:'作品のプロパティ：タイトル・概要・作者・連絡先を日時とともにSB3へ保存。作者名と連絡先の履歴各5件、メール・HTTPSリンク',featureDiagnostics:'作品の診断：検証・実行許可・読み込み・失敗の記録を確認・コピー',featureProjectTools:'作品のプロパティは「ファイル」メニューから開き、作品の診断はそのダイアログの「作品の診断…」から開きます。作品情報は適用後にSB3を保存し、診断記録はページを開いている間だけ保持します。追加の拡張や有効化の設定は要りません。',featureGuide:'実画面と図で読む追加機能ガイド（日本語）',featureImage:'対応ブロックをフォームで編集する例',featureCondition:'フォーム・文書・プレビューは対応する拡張が提供します。',features:'標準TurboWarpから増える機能',independent:'kubohiroyaによる独立したTurboWarpフォークです。約20の独立したパッケージから組み立て、固定したリビジョンで配信しています。',source:'ソースコード',button:'編集ボタンの設置方法',build:'配信バージョン',invalid:'有効なHTTPSのSB3ファイルURLを入力してください。'},
    en: {skip:'Skip to content',eyebrow:'SCRATCH AND TURBOWARP PROJECTS OPEN HERE',heading:'A project does not have to live in one file.',intro:'Projects saved by Scratch 3 and by standard TurboWarp open here and can be edited as they are. Put the code and the stage where you want them, or in windows of their own. Search the whole project and fix what you find. Keep a project as a folder in Git and read every change as a diff. Hand the finished project to anyone as a single HTML file.',edit:'Edit in TurboWarp-Plus-Editor',note:'Start a new project, open an SB3 from your device, or open a project folder. An SB3 saved here opens in Scratch and in TurboWarp as it is.',open:'Open a project URL',label:'URL of the project’s SB3 file',urlNote:'Use an HTTPS SB3 file that permits your browser to fetch it.',featureOpen:'Open: load progress, the Plus catalog, diagnostics when a project will not open',featureManage:'Manage: read and write a project folder, local Git diffs and history, public PR review',featureArrange:'Arrange: split the panels, the palette and code in separate windows, the layout restored next time',featureEdit:'Fix: project-wide search and replace, an edit menu, a searchable horizontal palette, a minimap, forms generated from a JSON Schema and YAML documents',featureReuse:'Reuse: transfer scripts and stages, add bundled assets',featureShare:'Hand over: Save and Save As, storage formats for data and extension code, one HTML with the Plus extensions bundled',featureCollaborate:'Work with an AI: a project folder is text and ordinary files, so an agent can read and write it and you review the result as a diff or a PR',featurePlatform:'Extensions are not only something you use. Add one from the catalog, choose how its code is stored, embed one you wrote yourself in the SB3, and pin its name, sandbox requirement and SHA-256 with sb3-toolchain. Writing extensions in TypeScript is the recommended path: you write against typed APIs and can pull libraries straight from npm. A domain expert can also define a DSL as a JSON Schema and its documents, and let the project operate it. With Plus extensions for shared camera streams, camera calibration, AR, QR reading, Teachable Machine recognition and asynchronous input, an interactive work or a camera or sensor host application is an extension plus a project, not a fork of the Editor.',featureProperties:'Project Properties: save the title, description, author, contact, and timestamps in the SB3; choose from five recent author/contact entries and open email/HTTPS links',featureDiagnostics:'Project Diagnostics: inspect and copy validation, execution approval, loading, and failure records',featureProjectTools:'Open Project Properties from the File menu, and Project Diagnostics from that dialog’s “Project Diagnostics…” button. Save the SB3 after applying properties; diagnostics last only while the page remains open. No supporting extension or activation option is required.',featureGuide:'Explore the illustrated feature guide (Japanese)',featureImage:'Form editing for a supported block',featureCondition:'Forms, documents, and previews require supporting extensions.',features:'Added features compared with standard TurboWarp',independent:'An independent TurboWarp fork by kubohiroya, assembled from around twenty independently versioned packages and served from pinned revisions.',source:'Source code',button:'Add an edit button',build:'Build information',invalid:'Enter a valid HTTPS URL for an SB3 project.'}
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
