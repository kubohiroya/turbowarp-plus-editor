import {mountPackagerPage} from '@kubohiroya/turbowarp-extension-loader/packager-page';
import JSZip from '@turbowarp/jszip';
import Packager from '@turbowarp/packager-web';
import {withWaitCursor, withoutWaitCursor} from '@kubohiroya/turbowarp-plus-editor-workbench/busy-cursor';
import {extensionProjectArchiveOptions} from '../extension-host/config.ts';
import {createPlusPermissionUI} from '../extension-host/permission-ui.ts';
import {plusTrustedExtensions} from '../trusted-extensions.ts';
import {embedPackagedProjectData} from '../project-payloads/codec.ts';

mountPackagerPage({
    document, editorURL: 'editor.html', zip: JSZip, archiveOptions: extensionProjectArchiveOptions,
    createPackager: () => new Packager(),
    runtimeBundle: __TW_PLUS_EXTENSION_RUNTIME__, scaffoldingAssets: __TW_PLUS_PACKAGER_ASSETS__,
    ui: createPlusPermissionUI(document, 'ja'), trusted: plusTrustedExtensions,
    embedProjectData: embedPackagedProjectData,
    withBusy: operation => withWaitCursor([document], operation),
    withoutBusy: operation => withoutWaitCursor(document, operation)
});
