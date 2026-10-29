export const editorBaseURL = 'https://kubohiroya.github.io/turbowarp-plus-editor/';
export const iconURL = `${editorBaseURL}assets/icon.svg`;
export const buttonStylesheetURL = `${editorBaseURL}assets/edit-button.css`;

export function createEditorURL({projectURL, language = 'ja', parameters = {}} = {}) {
    if (!['ja', 'en'].includes(language)) throw new TypeError('language must be ja or en');
    const result = new URL('editor.html', editorBaseURL);
    for (const [key, value] of Object.entries(parameters)) {
        if (key !== 'lang' && key !== 'project_url') result.searchParams.set(key, String(value));
    }
    result.searchParams.set('lang', language);
    if (projectURL !== undefined) {
        const project = new URL(projectURL);
        if (!['https:', 'http:'].includes(project.protocol)) throw new TypeError('projectURL must use HTTP(S)');
        result.searchParams.set('project_url', project.href);
    }
    return result.href;
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function renderEditButton(options = {}) {
    const label = options.language === 'en' ? 'Edit in TurboWarp-Plus-Editor' : 'TurboWarp-Plus-Editorで編集';
    return `<a class="twpe-edit-button" href="${escapeHTML(createEditorURL(options))}"><img src="${iconURL}" width="36" height="36" alt="" aria-hidden="true"><span>${label}</span></a>`;
}
