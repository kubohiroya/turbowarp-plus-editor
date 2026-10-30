import {installProjectPatchWorkspaceAdapter} from '@kubohiroya/turbowarp-embedded-yaml/project-views';

/** Redraw only affected document scripts; retain the remaining workspace and its variables. */
export function attachDocumentWorkspacePatch(vm, B) {
    if (typeof B?.Xml?.domToWorkspace !== 'function' || typeof B.Xml.textToDom !== 'function') return () => {};
    return installProjectPatchWorkspaceAdapter(vm, {
        hasBlockDefinition(type) {
            if (typeof type !== 'string') return false;
            try {
                const definition = Object.getOwnPropertyDescriptor(B.Blocks ?? {}, type)?.value;
                return typeof definition?.init === 'function';
            } catch {
                return false;
            }
        },
        prepare({targetChanges}) {
            const target = vm.editingTarget;
            const change = targetChanges.find(item => item.targetId === target?.id);
            if (!change) return {apply() {}, rollback() {}};
            const workspace = B.getMainWorkspace();
            if (!workspace || workspace.options?.readOnly || workspace.isFlyout) throw new Error('The editable block workspace is unavailable.');
            const ids = [...new Set([...change.beforeRootIds, ...change.afterRootIds])];
            const before = change.beforeRootIds.flatMap(id => {
                const block = workspace.getBlockById(id);
                if (!block) return [];
                const node = B.Xml.blockToDomWithXY(block);
                return [node.cloneNode(true)];
            });
            let touched = false;
            const check = () => {
                if (vm.editingTarget !== target || B.getMainWorkspace() !== workspace) throw new Error('The block workspace changed during the document update.');
            };
            const replace = nodes => {
                check();
                B.Events.disable();
                try {
                    for (const id of ids) workspace.getBlockById(id)?.dispose(false);
                    for (const node of nodes) {
                        const xml = B.Xml.textToDom('<xml xmlns="http://www.w3.org/1999/xhtml"></xml>');
                        xml.appendChild(node.cloneNode(true));
                        B.Xml.domToWorkspace(xml, workspace);
                    }
                    workspace.resizeContents?.();
                } finally { B.Events.enable(); }
            };
            return {
                apply() {
                    check();
                    const nodes = change.afterRootIds.flatMap(id => {
                        const text = target.blocks.blockToXML(id, target.comments);
                        if (!text) return [];
                        const xml = B.Xml.textToDom(`<xml xmlns="http://www.w3.org/1999/xhtml">${text}</xml>`);
                        return [...xml.children].map(node => node.cloneNode(true));
                    });
                    touched = true;
                    replace(nodes);
                },
                rollback() {
                    if (touched) replace(before);
                }
            };
        }
    });
}
