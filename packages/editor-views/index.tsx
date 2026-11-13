import React from 'react';
import {createPortal} from 'react-dom';
import './preview.css';
import type {createCodePaneAdapter} from './code-pane.ts';
import {getCodeSession} from './workspace.ts';

export {attachCodeWorkspace} from './workspace.ts';
export {createCodePaneAdapter} from './code-pane.ts';

export function CodePaneCostumeThumbnail({adapter}: {adapter: ReturnType<typeof createCodePaneAdapter>}) {
    const image = React.useRef<HTMLImageElement>(null);
    React.useLayoutEffect(() => adapter.watchEditingCostume(image.current), [adapter]);
    return <div data-dockview-costume-thumbnail="" aria-hidden="true">
        <img ref={image} alt="" />
    </div>;
}

const SpriteCodeContext = React.createContext(null);
export const SpriteCodeProvider = SpriteCodeContext.Provider;
export const useSpriteCodeWindows = () => React.useContext(SpriteCodeContext);

export function useCodeWindows({vm, host, locale, enabled}) {
    const [state, setState] = React.useState({windows: [], front: null});
    const current = React.useRef(state);
    const serial = React.useRef(0);
    const mounted = React.useRef(false);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const session = getCodeSession(vm);
    const title = target => japanese ? `${target.getName()}のコード` : `Code · ${target.getName()}`;
    function publish(windows, front) {
        current.current = {windows, front};
        session.frontView = front;
        if (mounted.current) setState(current.current);
    }

    function activated(view) {
        const {windows, front} = current.current;
        if (!windows.includes(view) || front === view && !view.minimized) return;
        if (!session.bridge?.select(view)) return;
        view.minimized = false;
        publish([...windows.filter(item => item !== view), view], view);
    }

    function remaining(view, remove) {
        const {windows, front} = current.current;
        const next = remove ? windows.filter(item => item !== view) : windows;
        if (front !== view) {
            publish(next, front);
            return;
        }
        const fallback = next.findLast(item => !item.minimized);
        publish(next, null);
        fallback?.connection.activate();
    }

    function show(id, separate = false) {
        const target = vm.runtime.getTargetById(id);
        if (!target?.isOriginal || target.isStage || !session.bridge) return;
        const windows = current.current.windows;
        const existing = !separate && windows.findLast(item => item.target === target);
        if (existing) {
            existing.connection.activate();
            return;
        }
        const view = {target, id: `sprite-code-${++serial.current}`, mount: null, minimized: false, connection: null};
        const connection = host.open({
            id: view.id, title: title(target), closeLabel: japanese ? 'コード画面を閉じる' : 'Close code window',
            onActivate: () => activated(view),
            onDuplicate: () => show(view.target.id, true),
            onMinimize() {
                view.minimized = true;
                remaining(view, false);
            }
        });
        if (!connection) return;
        view.connection = connection;
        connection.disconnected.addEventListener('abort', () => {
            remaining(view, true);
            connection.close();
        }, {once: true});
        publish([...windows, view], current.current.front);
        activated(view);
        void connection.ready.then(({mount}) => {
            if (!mounted.current || connection.disconnected.aborted) return;
            view.mount = mount;
            publish(current.current.windows, current.current.front);
        }, () => {});
    }

    React.useLayoutEffect(() => {
        if (!enabled) return;
        mounted.current = true;
        let queued = false;
        const updateTargets = () => {
            if (queued) return;
            queued = true;
            queueMicrotask(() => {
                queued = false;
                if (!mounted.current) return;
                for (const view of current.current.windows) {
                    if (vm.runtime.getTargetById(view.target.id) !== view.target) view.connection.close();
                    else view.connection.setTitle(title(view.target));
                }
                const {windows, front} = current.current;
                // Native stage and asset selection may give the docked editor control.
                if (front && vm.editingTarget !== front.target) publish(windows, null);
            });
        };
        vm.on('targetsUpdate', updateTargets);
        return () => {
            mounted.current = false;
            vm.removeListener('targetsUpdate', updateTargets);
            const {windows} = current.current;
            current.current = {windows: [], front: null};
            session.frontView = null;
            for (const view of windows) view.connection.close();
        };
    }, [enabled, vm, host]);

    return enabled ? {
        front: state.front,
        windows: state.windows,
        context: {
            selectedId: state.front?.target.id ?? '',
            openLabel: japanese ? '開く' : 'Open',
            select: show,
            open: id => show(id, true)
        },
        openCurrent: () => show(vm.editingTarget?.id)
    } : null;
}

function Preview({vm, view, attachBackpackDrop}) {
    const {target} = view;
    const drop = React.useRef(null);
    const ref = React.useRef(null);
    const chrome = React.useRef(null);
    React.useLayoutEffect(() => {
        const session = getCodeSession(vm);
        let bridge;
        let preview;
        let dropBinding;
        const update = () => {
            if (bridge !== session.bridge) {
                dropBinding?.dispose();
                preview?.dispose();
                bridge = session.bridge;
                preview = bridge?.preview(ref.current, chrome.current, view);
                if (preview) {
                    const boundBridge = bridge;
                    const canCommit = () => session.bridge === boundBridge && !view.connection.disconnected.aborted;
                    let record;
                    dropBinding = attachBackpackDrop({
                        vm, workspace: preview.workspace, dropElement: drop.current,
                        canUse: canCommit, onError: bridge.onError,
                        destination: {
                            target, canCommit,
                            beforeCommit: () => { record = boundBridge.prepareImport(target); },
                            onCommitted: receipt => record(receipt)
                        }
                    });
                }
            }
            preview?.update();
        };
        const unsubscribe = session.subscribe(update);
        update();
        return () => {
            unsubscribe();
            dropBinding?.dispose();
            preview?.dispose();
        };
    }, [vm, view, target, attachBackpackDrop]);
    return <div ref={drop} data-code-preview="" data-code-hover-surface="">
        <div ref={ref} {...{inert: ''}} />
        <div ref={chrome} className="tw-code-preview-chrome" {...{inert: ''}} />
    </div>;
}

export function BackCodeWindows({vm, windows, front, attachBackpackDrop}) {
    return windows.filter(view => view !== front && !view.minimized && view.mount).map(view =>
        createPortal(<Preview vm={vm} view={view} attachBackpackDrop={attachBackpackDrop} />, view.mount, view.id));
}
