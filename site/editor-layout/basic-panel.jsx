import React from 'react';
import {createPortal, flushSync} from 'react-dom';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {WindowLayoutContext} from './index.jsx';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';

function DockableBasicPanel({host, id, title, children, render, actionMount, dockHeight, className,
    externalHost, decorate, renderInExternalDocument}) {
    const {showUndock, locale} = React.useContext(WindowLayoutContext);
    const [state, setState] = React.useState({kind: 'docked'});
    const action = React.useRef(null);
    const undecorate = React.useRef(null);
    const unmounting = React.useRef(false);
    const surface = React.useMemo(() => createSurface(externalHost ?? host, next => {
        if (!externalHost) {
            setState(next);
            return;
        }
        if (next.kind === 'external') undecorate.current = decorate(next.target.mount.ownerDocument);
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
            surface.dock();
        };
    }, [surface]);
    React.useLayoutEffect(() => {
        if (!showUndock || state.kind !== 'docked' || state.reason !== 'returned' && state.reason !== 'disconnected') return;
        const frame = requestAnimationFrame(() => action.current?.querySelector('button')?.focus({preventScroll: true}));
        return () => cancelAnimationFrame(frame);
    }, [showUndock, state]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const mount = state.kind === 'external' ? state.target.mount : undefined;
    React.useLayoutEffect(() => {
        if (externalHost && mount) mount.ownerDocument.title = title;
    }, [externalHost, mount, title]);
    const content = render ? render(Boolean(mount), mount) : children;
    // Create target controls in the child document so React delegates input there.
    const nativeContent = mount && externalHost && renderInExternalDocument ?
        createPortal(<div className={styles.externalPanel}>{content}</div>, mount) : null;

    const openAction = showUndock && !mount && <span className={styles.openWindowAction} ref={action}>
        <OpenWindowButton
            disabled={state.kind === 'opening'}
            label={japanese ? '別画面で開く' : 'Open in another window'}
            onOpen={() => surface.undock({id, title, rememberPlacement: true})}
        />
    </span>;
    const focusable = Boolean(openAction && actionMount === undefined);
    return <div className={className ? `${styles.basicPanel} ${className}` : styles.basicPanel}
        style={mount ? {minBlockSize: dockHeight} : undefined}
        tabIndex={focusable ? -1 : undefined}
        onClick={focusable ? event => {
            const node = event.currentTarget;
            if (node.contains(event.target) && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
        } : undefined}>
        {actionMount === undefined ? <div className={styles.basicPanelHeading}>
            <h2>{title}</h2>
            {openAction}
        </div> : (actionMount && openAction && createPortal(openAction, actionMount))}
        <DockablePanel
            dockLabel={japanese ? 'ここに戻す' : 'Return here'}
            mount={mount}
            onDock={() => surface.dock()}
        >{nativeContent ? null : content}</DockablePanel>
        {nativeContent}
    </div>;
}

export function BasicPanel({children, ...options}) {
    const host = useWindowHost();
    return host ? <DockableBasicPanel {...options} host={host}>{children}</DockableBasicPanel> :
        (options.render ? options.render(false) : children);
}
