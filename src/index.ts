export const editorBaseURL = 'https://kubohiroya.github.io/turbowarp-plus-editor/';
export const iconURL = `${editorBaseURL}assets/icon.svg`;
export const buttonStylesheetURL = `${editorBaseURL}assets/edit-button.css`;

export interface EditorOptions {
    projectURL?: string | URL;
    language?: string;
    parameters?: Record<string, unknown>;
}

export interface EditButtonOptions extends EditorOptions {
    size?: string;
}

export function createEditorURL({projectURL, language = 'ja', parameters = {}}: EditorOptions = {}): string {
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

const escapeHTML = (value: unknown): string => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

export function renderEditButton(options: EditButtonOptions = {}): string {
    const size = options.size ?? 'normal';
    if (!['normal', 'small'].includes(size)) throw new TypeError('size must be normal or small');
    const small = size === 'small';
    const label = options.language === 'en' ? 'Edit in TurboWarp-Plus-Editor' : 'TurboWarp-Plus-Editorで編集';
    const text = small ? (options.language === 'en' ? 'Edit' : '編集') : label;
    const attributes = small ? ` title="${label}" aria-label="${label}"` : '';
    const iconSize = small ? 24 : 36;
    return `<a class="twpe-edit-button${small ? ' twpe-edit-button--small' : ''}" href="${escapeHTML(createEditorURL(options))}"${attributes}><img src="${iconURL}" width="${iconSize}" height="${iconSize}" alt="" aria-hidden="true"><span>${text}</span></a>`;
}
