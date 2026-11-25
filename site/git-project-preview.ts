import {openProjectVersionEditor as openVersionEditor, openProjectVersionPreview as openVersionPreview,
    packProjectVersion as packVersion, type MergePlanCodeEdit, type MergePlaytestRequest, type PlaytestObserver}
    from '@kubohiroya/turbowarp-plus-editor-git/project-version-preview';
import JSZip from '@turbowarp/jszip';

// The build supplies sb3-toolchain's source validator (scripts/site/webpack.config.cts).
declare const __TW_PLUS_VALIDATE_PROJECT_FOLDER__: ((files: ReadonlyMap<string, Uint8Array>) => void) | undefined;

export function hasProjectVersionValidator() {
    return typeof __TW_PLUS_VALIDATE_PROJECT_FOLDER__ === 'function';
}

export function validateProjectVersion(files: ReadonlyMap<string, Uint8Array>) {
    if (typeof __TW_PLUS_VALIDATE_PROJECT_FOLDER__ !== 'function') {
        throw new Error('Project source validation is unavailable');
    }
    __TW_PLUS_VALIDATE_PROJECT_FOLDER__(files);
}

/** Builds a past version's SB3 with the Git package, using this build's validator and JSZip. */
export const packProjectVersion = (files: ReadonlyMap<string, Uint8Array>, validate = validateProjectVersion) =>
    packVersion(files, {validate, zip: JSZip});

/** Opens the player page this distribution builds, without the Editor features a past version must not use. */
export const openProjectVersionPreview = (document: Document, oid: string, archive: ArrayBuffer, locale: string,
    title?: string, playtest?: MergePlaytestRequest,
    observe?: PlaytestObserver) => {
    const options = {page: 'git-project-preview.html', params: {
        twPlusLocalGit: '0', twPlusStandardLayout: '0',
        ...playtest && {twPlusProjectTools: '0', twPlusSaveWorkspace: '0'}
    }, title, playtest, observe};
    return openVersionPreview(document, oid, archive, locale, options);
};

export const openProjectVersionEditor = (document: Document, archive: ArrayBuffer, locale: string, title: string,
    save: (edit: MergePlanCodeEdit) => Promise<string>) => openVersionEditor(document, archive, locale, {
    page: 'git-project-preview.html', title, params: {
        twPlusLocalGit: '0', twPlusStandardLayout: '0', twPlusProjectTools: '0', twPlusSaveWorkspace: '0'
    }
}, save);
