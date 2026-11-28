import {createTestRunEditor} from '@kubohiroya/turbowarp-plus-editor-test/editor-host';
import {getDocumentWorkspace} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {activateTargetView, connectionFor} from '@kubohiroya/turbowarp-plus-editor-project-model/project-search-connections';
import JSZip from '@turbowarp/jszip';
import {getExtensionIdentities} from '../extension-host/loader-connections.ts';

// The code area's workspace when the workbench has no views of its own to navigate.
const mainWorkspace = () => window.ScratchBlocks?.getMainWorkspace?.();

const testRun = createTestRunEditor({
    document: () => document,
    frameURL: view => new URL(`${process.env.ROOT || './'}test-frame.html`, view.location.href).href,
    zip: JSZip,
    identities: getExtensionIdentities,
    openPanel: (vm, request) => getDocumentWorkspace(vm).open(request),
    navigation: vm => {
        const navigation = connectionFor(vm.runtime as never).navigation;
        if (navigation) {
            return {activate: target => Boolean(activateTargetView(navigation, target, 0)),
                centerBlock: block => navigation.centerBlock(block),
                workspace: () => (navigation.replacementContext?.()?.workspace ?? mainWorkspace()) as never};
        }
        return {activate: () => false,
            centerBlock: block => {
                const workspace = mainWorkspace();
                if (workspace?.getBlockById(block)) workspace.centerOnBlock(block);
            },
            workspace: () => mainWorkspace() as never};
    }
});

export const {runSavedGenerationTests, testRunMenuItems, connectTestRun} = testRun;
