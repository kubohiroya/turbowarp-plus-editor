import {createProjectPackager as createHandoff} from '@kubohiroya/turbowarp-extension-loader/packager-handoff';
import {packagerPageMessages} from '@kubohiroya/turbowarp-extension-loader/packager';
import JSZip from '@turbowarp/jszip';
import {withWaitCursor} from '@kubohiroya/turbowarp-plus-editor-workbench/busy-cursor';
import {withPackagerFontFallbacks} from '@kubohiroya/turbowarp-plus-editor-fonts/web-fonts';
import {extensionProjectArchiveOptions} from '../extension-host/config.ts';
import {PLUS_EXTENSION_LOADER_ENABLED} from '../extension-library/flags.ts';
import {saveProjectForPackager} from '../project-payloads/host.ts';

export const serializeProjectForExport = vm => withPackagerFontFallbacks(vm, () => saveProjectForPackager(vm));
export const createProjectPackager = ({enabled = PLUS_EXTENSION_LOADER_ENABLED,
    readProject = undefined,
    page = () => new URL(`${process.env.ROOT || './'}plus-packager.html`, location.href).href} = {}) => createHandoff({
    enabled, readProject, page, zip: JSZip, archiveOptions: extensionProjectArchiveOptions, origin: () => location.origin,
    serialize: serializeProjectForExport,
    withBusy: operation => withWaitCursor([globalThis.document], operation),
    reportError: error => {console.error(error); window.alert(packagerPageMessages('ja').handoffFailed(error as Error));}
});
export const plusProjectPackager = createProjectPackager();
export {connectProjectPackager} from '@kubohiroya/turbowarp-extension-loader/packager-handoff';
