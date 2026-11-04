import React from 'react';
import {createPortal} from 'react-dom';
import {createSurface} from '../editor-surfaces/index.ts';
import {createTransferSession, transferMime} from '../editor-transfer/index.ts';
import {DockWindowButton, OpenWindowButton, WindowTitleBar} from '../editor-windows/index.jsx';

const kind = 'backpack-script';
const jsonDataUrl = 'data:application/json;base64,';

export function createBackpackIntegration({host, readScript, importScript, decorateSurface}) {
    const sessions = new WeakMap();

    function BackpackSurface({vm, children}) {
        const [state, setState] = React.useState({kind: 'docked'});
        const scope = React.useRef(null);
        const mounted = React.useRef(true);
        const surface = React.useMemo(() => createSurface(host, next => {
            if (next.kind === 'external') {
                const cleanup = decorateSurface(next.target.mount.ownerDocument);
                const id = crypto.randomUUID();
                scope.current = {id, transfer: createTransferSession(id), cleanup};
                sessions.set(vm, scope.current);
            } else if (next.kind === 'docked' && scope.current) {
                scope.current.transfer.close();
                scope.current.cleanup();
                if (sessions.get(vm) === scope.current) sessions.delete(vm);
                scope.current = null;
            }
            if (mounted.current) setState(next);
        }), [vm]);
        React.useEffect(() => {
            mounted.current = true;
            return () => {
                mounted.current = false;
                surface.dock();
            };
        }, [surface]);

        const handle = item => item.bodyUrl?.startsWith(jsonDataUrl) ? (
            <button type="button" draggable data-testid="backpack-script-drag"
                style={{cursor: 'grab', flexShrink: 0}}
                onDragStart={event => {
                    const active = scope.current;
                    if (!active || !event.dataTransfer) return;
                    const reference = active.transfer.offer(kind, signal => readScript(item.bodyUrl, signal));
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData(transferMime, JSON.stringify(reference));
                }}>
                Drag script to code
            </button>
        ) : null;
        const dock = (
            <WindowTitleBar title="Backpack">
                <DockWindowButton label="Dock Backpack" onDock={() => surface.dock()} />
            </WindowTitleBar>
        );
        if (state.kind === 'external') {
            return (
                <>
                    {dock}
                    {createPortal(<>{dock}{React.cloneElement(children, {renderScriptDragHandle: handle})}</>,
                        state.target.mount)}
                </>
            );
        }
        return (
            <>
                <WindowTitleBar title="Backpack">
                    <OpenWindowButton label="Undock Backpack" disabled={state.kind === 'opening'}
                        onOpen={() => surface.undock({page: 'backpack-popout.html'})} />
                </WindowTitleBar>
                {state.reason === 'blocked' || state.reason === 'failed' ?
                    <span role="status">Could not open Backpack window</span> : null}
                {children}
            </>
        );
    }

    function attachBackpackDrop({vm, workspace, canUse, onError}) {
        const node = workspace.getParentSvg();
        let disposed = false;
        const allowed = event => sessions.has(vm) && canUse() &&
            event.dataTransfer?.types.includes(transferMime);
        function over(event) {
            if (!allowed(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
        }
        function drop(event) {
            if (!allowed(event)) return;
            event.preventDefault();
            const active = sessions.get(vm);
            const target = vm.editingTarget;
            const raw = event.dataTransfer.getData(transferMime);
            const matrix = workspace.getCanvas().getScreenCTM();
            if (!target || !matrix) return;
            const point = node.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            const {x, y} = point.matrixTransform(matrix.inverse());
            void active.transfer.receive(raw, {session: active.id, id: target.id}, async (destination, script) => {
                if (disposed || sessions.get(vm) !== active ||
                    vm.runtime.getTargetById(destination.id) !== target) return false;
                await importScript(vm, target, script, {position: {x, y}});
                return true;
            }).then(result => {
                if (result === 'failed') onError(new Error('Could not copy Backpack script'));
            });
        }
        node.addEventListener('dragover', over);
        node.addEventListener('drop', drop);
        return {dispose() {
            disposed = true;
            node.removeEventListener('dragover', over);
            node.removeEventListener('drop', drop);
        }};
    }

    return {BackpackSurface, attachBackpackDrop};
}
