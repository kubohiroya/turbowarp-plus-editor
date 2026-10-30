import {updatePreviewSampleLinks} from '../../assets/preview-sample.js';

const siteURL = new URL('../../', location.href);
const query = new URLSearchParams(location.search);
const labels = {
    ja: {open: 'プレビュー体験サンプルを開く', download: 'サンプルSB3をダウンロード', build: '配信バージョン'},
    en: {open: 'Open the preview sample', download: 'Download the sample SB3', build: 'Build information'}
};
function applyLanguage(language) {
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll('[data-guide-language]')) {
        element.hidden = element.dataset.guideLanguage !== language;
    }
    for (const element of document.querySelectorAll('[data-guide-label]')) {
        element.textContent = labels[language][element.dataset.guideLabel];
    }
    for (const button of document.querySelectorAll('[data-language]')) {
        button.setAttribute('aria-pressed', String(button.dataset.language === language));
    }
    const home = new URL(siteURL);
    home.searchParams.set('lang', language);
    document.querySelector('[data-guide-home]').href = home.href;
    updatePreviewSampleLinks(document, siteURL, language);
}
applyLanguage(query.get('lang') === 'en' ? 'en' : 'ja');
for (const button of document.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => {
        const language = button.dataset.language;
        query.set('lang', language);
        history.replaceState(null, '', `?${query}`);
        applyLanguage(language);
    });
}
