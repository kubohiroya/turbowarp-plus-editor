import {createTestRunEditor} from '@kubohiroya/turbowarp-plus-editor-test/editor-host';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-project-model/project-search-connections';
import JSZip from '@turbowarp/jszip';
import {getExtensionIdentities} from '../extension-host/loader-connections.ts';

const testRun = createTestRunEditor({
    document: () => document,
    frameURL: view => new URL(`${process.env.ROOT || './'}test-frame.html`, view.location.href).href,
    zip: JSZip,
    identities: getExtensionIdentities,
    openPanel: (vm, request) => getDocumentWorkspace(vm).open(request),
    navigation: vm => {
        const navigation = connectionFor(vm.runtime as never).navigation;
        return navigation && {activate: target => Boolean(activateTargetView(navigation, target, 0)),
            centerBlock: block => navigation.centerBlock(block),
            workspace: () => navigation.replacementContext?.()?.workspace as never};
    }
});

export const {runSavedGenerationTests, testRunMenuItems, connectTestRun} = testRun;
