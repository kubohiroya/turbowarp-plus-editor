export const EDITOR_TAB_NAME = 'TurboWarp Plus Editor';

export function updateBrowserTabTitle(title?: string) {
    const name = title?.trim();
    document.title = name ? `${name} - ${EDITOR_TAB_NAME}` : EDITOR_TAB_NAME;
}
