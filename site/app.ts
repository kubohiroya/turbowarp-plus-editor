const query = new URLSearchParams(location.search);
const languages = ['ja', 'en'];
const chooseLanguage = () => {
    if (languages.includes(query.get('lang'))) return query.get('lang');
    try { if (languages.includes(localStorage.getItem('twpe-language'))) return localStorage.getItem('twpe-language'); } catch {}
    return navigator.language.startsWith('ja') ? 'ja' : 'en';
};
const text = JSON.parse(document.querySelector<HTMLScriptElement>('#landing-translations').textContent);
function applyLanguage(language) {
    const words = text[language];
    document.documentElement.lang = language;
    document.querySelector<HTMLElement>('turbowarp-plus-header')?.setAttribute('site-lang', language);
    for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) element.textContent = words[element.dataset.text];
    for (const element of document.querySelectorAll<HTMLElement>('[data-alt]')) element.setAttribute('alt', words[element.dataset.alt]);
    // Screenshots and guide links that have an English counterpart switch with the language.
    for (const element of document.querySelectorAll<HTMLElement>('[data-en-src],[data-en-href]')) {
        const attribute = element.dataset.enSrc ? 'src' : 'href';
        element.dataset.jaValue ??= element.getAttribute(attribute);
        element.setAttribute(attribute, language === 'en' ? element.dataset.enSrc ?? element.dataset.enHref : element.dataset.jaValue);
    }
    for (const button of document.querySelectorAll<HTMLElement>('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-editor]')) {
        const target = new URL('editor.html', location.href);
        target.search = query.toString();
        target.searchParams.set('lang', language);
        link.href = target.href;
        const label = link.querySelector<HTMLElement>('[data-text]');
        if (label) label.textContent = words[query.get('project_url') ? 'projectAction' : 'editorAction'];
    }
    const editorNote = document.querySelector<HTMLElement>('[data-editor-note]');
    if (editorNote) editorNote.textContent = words[query.get('project_url') ? 'projectNote' : 'note'];
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
