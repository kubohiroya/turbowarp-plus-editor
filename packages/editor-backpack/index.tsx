import React from 'react';
import {createPortal} from 'react-dom';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import type {SurfaceState} from '@kubohiroya/turbowarp-editor-surfaces';
import {createTransferSession, transferMime} from '@kubohiroya/turbowarp-editor-transfer';
import {jsonDataUrl, readBackpackScript} from './script.ts';

const kind = 'backpack-script';
interface BackpackTarget {
    mount: HTMLElement;
    presentation?: 'internal' | 'external';
}
interface BackpackRequest {
    presentation: 'internal';
    id: string;
    title: string;
    rememberPlacement: boolean;
    layer: string;
    openExternal?: () => void;
}

const docked: Extract<SurfaceState<BackpackTarget>, {kind: 'docked'}> = {kind: 'docked'};
const messages = {
    en: {
        undock: 'Open Backpack in a browser window',
        detach: 'Undock Backpack',
        title: 'Backpack',
        restore: 'Return here',
        internal: 'Move into the editor',
        dock: 'Dock Backpack',
        drag: 'Drag script to code',
        blocked: 'Could not open Backpack window',
        copyFailed: 'Could not copy Backpack script'
    },
    ja: {
        undock: 'バックパックをブラウザーの別ウィンドウで開く',
        detach: 'バックパックを別画面で開く',
        title: 'バックパック',
        restore: 'ここに戻す',
        internal: 'アプリ内に戻す',
        dock: 'バックパックを元の位置に戻す',
        drag: 'スクリプトをコードへドラッグ',
        blocked: 'バックパックのウィンドウを開けませんでした',
        copyFailed: 'バックパックのスクリプトをコピーできませんでした'
    }
};

export function createBackpackIntegration({host, importScript, importScriptWithReceipt, decorateSurface, readScript = readBackpackScript}) {
    const sessions = new WeakMap();

    function BackpackSurface({vm, children, showUndock, locale, internalHost, openLabel, renderLaunchButton, launchClassName, onDetachedChange, renderPopupTools, internalLayer}) {
        const labels = /^ja(?:-|$)/i.test(locale) ? messages.ja : messages.en;
        const copyFailed = React.useRef(labels.copyFailed);
        copyFailed.current = labels.copyFailed;
        const [display, setDisplay] = React.useState<{vm: object; state: SurfaceState<BackpackTarget>}>({vm, state: docked});
        const state = display.vm === vm ? display.state : docked;
        const detached = state.kind === 'external';
        React.useLayoutEffect(() => {onDetachedChange?.(detached);}, [onDetachedChange, detached]);
        const scope = React.useRef(null);
        const mounted = React.useRef(true);
        const launchButton = React.useRef(null);
        const fallback = React.useRef<BackpackRequest | null>(null);
        const surface = React.useMemo(() => createSurface<BackpackRequest | undefined, BackpackTarget>({
            open: request => request?.presentation === 'internal' ? internalHost?.open(request) : host?.open()
        }, next => {
            if (next.kind === 'external') {
                fallback.current = null;
                const id = crypto.randomUUID();
                const cleanup = next.target.presentation === 'internal' ? () => {} :
                    decorateSurface(next.target.mount.ownerDocument);
                scope.current = {id, transfer: createTransferSession(id), cleanup, copyFailed};
                sessions.set(vm, scope.current);
            } else if (next.kind === 'docked' && scope.current) {
                const active = scope.current;
                scope.current = null;
                if (sessions.get(vm) === active) sessions.delete(vm);
                active.transfer.close();
                active.cleanup();
            }
            if (next.kind === 'docked' && fallback.current) {
                const retry = fallback.current;
                fallback.current = null;
                if (next.reason === 'blocked' || next.reason === 'failed') {
                    surface.undock(retry);
                    return;
                }
            }
            if (mounted.current) setDisplay({vm, state: next});
        }), [vm, internalHost]);
        React.useLayoutEffect(() => {
            mounted.current = true;
            return () => {
                mounted.current = false;
                fallback.current = null;
                surface.dock();
            };
        }, [surface]);
        React.useLayoutEffect(() => {
            if (!internalHost || !showUndock || state.kind !== 'docked' || !state.reason) return;
            const frame = requestAnimationFrame(() => launchButton.current?.querySelector('button')?.focus({preventScroll: true}));
            return () => cancelAnimationFrame(frame);
        }, [internalHost, showUndock, state]);

        function internalRequest() {
            const request: BackpackRequest = {
                presentation: 'internal', id: 'backpack', title: labels.title, rememberPlacement: true, layer: internalLayer
            };
            if (host) request.openExternal = () => {
                surface.dock();
                fallback.current = request;
                surface.undock(undefined);
            };
            return request;
        }

        function moveInternal() {
            surface.dock();
            surface.undock(internalRequest());
        }

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
        if (state.kind === 'external') {
            const internal = state.target.presentation === 'internal';
            return (
                <>
                    {internalHost ? (
                        <div style={{display: 'grid', placeItems: 'center', minHeight: 44}}>
                            <button type="button" onClick={() => surface.dock()}>{labels.restore}</button>
                        </div>
                    ) : dock}
                    {createPortal(<>
                        {!internal && (renderPopupTools ? renderPopupTools({mount: state.target.mount, onDock: surface.dock}) :
                            <>{dock}{internalHost && <button type="button" onClick={moveInternal}>
                                {labels.internal}
                            </button>}</>)}
                        {React.cloneElement(children, {renderScriptDragHandle: handle})}
                    </>,
                        state.target.mount)}
                </>
            );
        }
        const launch = {
            disabled: state.kind === 'opening',
            label: internalHost ? labels.detach : (openLabel ?? labels.undock),
            onOpen: () => surface.undock(internalHost ? internalRequest() : undefined)
        };
        return (
            <>
                {showUndock && (
                    <div className={launchClassName}>
                        <span ref={launchButton}>{renderLaunchButton ? renderLaunchButton(launch) :
                            <button type="button" disabled={launch.disabled} onClick={launch.onOpen}>{launch.label}</button>}
                        </span>
                    </div>
                )}
                {children}
                {showUndock && state.kind === 'docked' && (state.reason === 'blocked' || state.reason === 'failed') &&
                    <span role="status">{labels.blocked}</span>}
            </>
        );
    }

    async function receiveBackpackDrop({vm, target, raw, position, canUse, onError, receipt,
        commit = apply => apply(), accept = (_script: Awaited<ReturnType<typeof readBackpackScript>>) => true}) {
        const active = sessions.get(vm);
        if (!active) return;
        const canCommit = () => canUse() && sessions.get(vm) === active &&
            vm.runtime.getTargetById(target.id) === target;
        const result = await active.transfer.receive(raw, {session: active.id, id: target.id}, async (_, script) => {
            if (!accept(script)) throw new Error('Unsupported script for this workspace');
            return commit(async () => {
                if (!canCommit()) return false;
                if (receipt) {
                    const imported = await importScriptWithReceipt(vm, target, script, {
                        position, canCommit, beforeCommit: receipt.beforeCommit, onCommitted: receipt.onCommitted
                    });
                    return imported !== null;
                }
                await importScript(vm, target, script, {position});
                return true;
            });
        });
        if (result === 'failed' && canUse()) onError?.(new Error(active.copyFailed.current));
    }

    function attachBackpackDrop({vm, workspace, canUse, onError, dropElement, destination}) {
        const svg = workspace.getParentSvg();
        const node = dropElement ?? svg;
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
            const target = destination?.target ?? vm.editingTarget;
            const raw = event.dataTransfer.getData(transferMime);
            const matrix = workspace.getCanvas().getScreenCTM();
            if (!target || !matrix) return;
            const point = svg.createSVGPoint();
            point.x = event.clientX;
            point.y = event.clientY;
            const {x, y} = point.matrixTransform(matrix.inverse());
            void receiveBackpackDrop({
                vm, target, raw, position: {x, y}, onError, receipt: destination,
                canUse: destination ? destination.canCommit : () => !disposed
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

    return {BackpackSurface, attachBackpackDrop, receiveBackpackDrop};
}
