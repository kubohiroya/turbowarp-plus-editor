import React from 'react';
import {createPortal, flushSync} from 'react-dom';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import type {SurfaceState} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {WindowLayoutContext} from './index.tsx';
import {PopupLayout} from './popup-layout.tsx';
import styles from '@kubohiroya/turbowarp-plus-editor-layout/editor.css';

interface PanelMount {
    mount: HTMLElement;
    presentation?: 'internal' | 'external';
}
interface PanelRequest {
    id: string;
    title: string;
    rememberPlacement: boolean;
    presentation: 'internal';
    layer?: 'utility';
    openExternal?: () => void;
}
interface PanelProps {
    id: string;
    title: string;
    children?: React.ReactNode;
    render?: (floating: boolean, mount?: HTMLElement | null) => React.ReactNode;
    actionMount?: HTMLElement | null;
    dockHeight?: number;
    className?: string;
    externalHost?: ReturnType<typeof import('./desktop-panel-host.ts').createDesktopPanelHost>;
    decorate?: (document: Document) => () => void;
    renderInExternalDocument?: boolean;
    onDockActionChange?: (actions: {kind: SurfaceState<PanelMount>['kind']; dock(): void;
        undock(): void; external: boolean} | null) => void;
    alwaysShowUndock?: boolean;
    openLabel?: string;
    renderDockHeading?: (action: React.ReactNode) => React.ReactNode;
    layer?: 'utility';
}
function DockableBasicPanel({host, id, title, children, render, actionMount, dockHeight, className,
    externalHost, decorate, renderInExternalDocument, onDockActionChange, alwaysShowUndock, openLabel, renderDockHeading, layer}: PanelProps & {host: NonNullable<ReturnType<typeof useWindowHost>>}) {
    const {showUndock, locale, plusLayout} = React.useContext(WindowLayoutContext);
    const canUndock = alwaysShowUndock || showUndock;
    const [state, setState] = React.useState<SurfaceState<PanelMount>>({kind: 'docked'});
    const action = React.useRef(null);
    const undecorate = React.useRef(null);
    const unmounting = React.useRef(false);
    const fallback = React.useRef<PanelRequest | null>(null);
    const surface = React.useMemo(() => createSurface<PanelRequest | undefined, PanelMount>({
        open: request => request?.presentation === 'internal' ? host.open(request) : externalHost?.open(undefined)
    }, next => {
        if (next.kind === 'external' && next.target.presentation !== 'internal') {
            undecorate.current = decorate(next.target.mount.ownerDocument);
        }
        if (next.kind === 'docked' && fallback.current) {
            const retry = fallback.current;
            fallback.current = null;
            if (next.reason === 'blocked' || next.reason === 'failed') {
                surface.undock(retry);
                return;
            }
        }
        if (next.kind === 'docked' && undecorate.current) {
            if (!unmounting.current) flushSync(() => setState(next));
            undecorate.current();
            undecorate.current = null;
            return;
        }
        if (!unmounting.current) setState(next);
    }), [host, externalHost, decorate]);
    React.useLayoutEffect(() => {
        unmounting.current = false;
        return () => {
            unmounting.current = true;
            fallback.current = null;
            surface.dock();
        };
    }, [surface]);
    React.useLayoutEffect(() => {
        if (!canUndock || state.kind !== 'docked' || state.reason !== 'returned' && state.reason !== 'disconnected') return;
        const frame = requestAnimationFrame(() => action.current?.querySelector('button')?.focus({preventScroll: true}));
        return () => cancelAnimationFrame(frame);
    }, [canUndock, state]);

    const undock = React.useCallback(() => {
        if (externalHost && !plusLayout) {
            surface.undock(undefined);
            return;
        }
        const request: PanelRequest = {id, title, rememberPlacement: true, presentation: 'internal', layer};
        if (externalHost) request.openExternal = () => {
            surface.dock();
            fallback.current = request;
            surface.undock(undefined);
        };
        surface.undock(request);
    }, [surface, id, title, externalHost, plusLayout, layer]);
    React.useLayoutEffect(() => {
        if (!onDockActionChange) return;
        onDockActionChange({kind: state.kind, dock: surface.dock, undock, external: Boolean(externalHost && !plusLayout)});
        return () => onDockActionChange(null);
    }, [onDockActionChange, state.kind, surface, undock, externalHost, plusLayout]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const mount = state.kind === 'external' ? state.target.mount : undefined;
    const externalMount = state.kind === 'external' && state.target.presentation !== 'internal' ? state.target.mount : null;
    React.useLayoutEffect(() => {
        if (externalMount) externalMount.ownerDocument.title = title;
    }, [externalMount, title]);
    const content = render ? render(Boolean(mount), externalMount) : children;
    // Create target controls in the child document so React delegates input there.
    const nativeContent = externalMount && renderInExternalDocument ?
        createPortal(<div className={styles.externalPanel}>
            {plusLayout && <div className={styles.popupTools}>
                <PopupLayout window={externalMount.ownerDocument.defaultView} locale={locale} onDock={surface.dock} />
            </div>}
            {content}
        </div>, externalMount) : null;

    const openAction = canUndock && !mount && <span className={styles.openWindowAction} ref={action}>
        <OpenWindowButton
            disabled={state.kind === 'opening'}
            label={openLabel ?? (japanese ? '別画面で開く' : 'Open in another window')}
            onOpen={undock}
        />
    </span>;
    const focusable = Boolean(openAction && actionMount === undefined);
    return <div className={className ? `${styles.basicPanel} ${className}` : styles.basicPanel}
        style={mount ? {minBlockSize: dockHeight} : undefined}
        tabIndex={focusable ? -1 : undefined}
        onClick={focusable ? event => {
            const node = event.currentTarget;
            if (node.contains(event.target as Node) && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
        } : undefined}>
        {actionMount === undefined ? (
            renderDockHeading ? !mount && renderDockHeading(openAction) : <div className={styles.basicPanelHeading}>
                <h2>{title}</h2>
                {openAction}
            </div>
        ) : (actionMount && openAction && createPortal(openAction, actionMount))}
        <DockablePanel
            dockLabel={japanese ? 'ここに戻す' : 'Return here'}
            mount={mount}
            onDock={() => surface.dock()}
        >{nativeContent ? null : content}</DockablePanel>
        {nativeContent}
    </div>;
}

export function BasicPanel({children, ...options}: PanelProps) {
    const host = useWindowHost();
    return host ? <DockableBasicPanel {...options} host={host}>{children}</DockableBasicPanel> :
        (options.render ? options.render(false) : children);
}
