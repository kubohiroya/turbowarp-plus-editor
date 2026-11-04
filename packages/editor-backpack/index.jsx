import React from 'react';
import {createPortal} from 'react-dom';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {createTransferSession, transferMime} from '@kubohiroya/turbowarp-editor-transfer';
import {jsonDataUrl, readBackpackScript} from './script.js';

const kind = 'backpack-script';
const docked = {kind: 'docked'};
const messages = {
    en: {
        undock: 'Open Backpack in a browser window',
        dock: 'Dock Backpack',
        drag: 'Drag script to code',
        blocked: 'Could not open Backpack window',
        copyFailed: 'Could not copy Backpack script'
    },
    ja: {
        undock: 'バックパックをブラウザーの別ウィンドウで開く',
        dock: 'バックパックを元の位置に戻す',
        drag: 'スクリプトをコードへドラッグ',
        blocked: 'バックパックのウィンドウを開けませんでした',
        copyFailed: 'バックパックのスクリプトをコピーできませんでした'
    }
};

export function createBackpackIntegration({host, importScript, decorateSurface, readScript = readBackpackScript}) {
    const sessions = new WeakMap();

    function BackpackSurface({vm, children, enabled, locale}) {
        const labels = /^ja(?:-|$)/i.test(locale) ? messages.ja : messages.en;
        const copyFailed = React.useRef(labels.copyFailed);
        copyFailed.current = labels.copyFailed;
        const [display, setDisplay] = React.useState({vm, state: docked});
        const state = display.vm === vm ? display.state : docked;
        const scope = React.useRef(null);
        const mounted = React.useRef(true);
        const surface = React.useMemo(() => createSurface(host, next => {
            if (next.kind === 'external') {
                const id = crypto.randomUUID();
                const cleanup = decorateSurface(next.target.mount.ownerDocument);
                scope.current = {id, transfer: createTransferSession(id), cleanup, copyFailed};
                sessions.set(vm, scope.current);
            } else if (next.kind === 'docked' && scope.current) {
                const active = scope.current;
                scope.current = null;
                if (sessions.get(vm) === active) sessions.delete(vm);
                active.transfer.close();
                active.cleanup();
            }
            if (mounted.current) setDisplay({vm, state: next});
        }), [vm]);
        React.useLayoutEffect(() => {
            mounted.current = true;
            return () => {
                mounted.current = false;
                surface.dock();
            };
        }, [surface]);
        React.useLayoutEffect(() => {
            if (!enabled) {
                surface.dock();
                setDisplay({vm, state: docked});
            }
        }, [enabled, surface, vm]);

        const handle = item => typeof item.bodyUrl === 'string' && item.bodyUrl.startsWith(jsonDataUrl) ? (
            <button type="button" draggable data-testid="backpack-script-drag"
                style={{cursor: 'grab', flexShrink: 0}}
                onDragStart={event => {
                    const active = scope.current;
                    if (!active || !event.dataTransfer) return;
                    const reference = active.transfer.offer(kind, signal => readScript(item.bodyUrl, signal));
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData(transferMime, JSON.stringify(reference));
                }}>
                {labels.drag}
            </button>
        ) : null;
        const dock = (
            <button type="button" onClick={() => surface.dock()}>{labels.dock}</button>
        );
        if (enabled && state.kind === 'external') {
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
                {enabled && (
                    <div>
                        <button type="button" disabled={state.kind === 'opening'}
                            onClick={() => surface.undock()}>
                            {labels.undock}
                        </button>
                        {(state.reason === 'blocked' || state.reason === 'failed') &&
                            <span role="status">{labels.blocked}</span>}
                    </div>
                )}
                {children}
            </>
        );
    }

    function attachBackpackDrop({vm, workspace, canUse, onError}) {
        const node = workspace.getParentSvg();
        let disposed = false;
        const allowed = event => sessions.has(vm) && canUse() &&
            Array.from(event.dataTransfer?.types ?? []).includes(transferMime);
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
                if (result === 'failed' && !disposed) onError(new Error(active.copyFailed.current));
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
