import React from 'react';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {DockablePanel, OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {WindowLayoutContext} from './index.jsx';
import styles from './layout.css';

function DockableBasicPanel({host, id, title, children}) {
    const {enabled, locale} = React.useContext(WindowLayoutContext);
    const [state, setState] = React.useState({kind: 'docked'});
    const action = React.useRef(null);
    const surface = React.useMemo(() => createSurface(host, setState), [host]);
    React.useLayoutEffect(() => () => surface.dock(), [surface]);
    React.useLayoutEffect(() => {
        if (!enabled) surface.dock();
    }, [enabled, surface]);
    React.useLayoutEffect(() => {
        if (!enabled || state.kind !== 'docked' || state.reason !== 'returned' && state.reason !== 'disconnected') return;
        const frame = requestAnimationFrame(() => action.current?.querySelector('button')?.focus({preventScroll: true}));
        return () => cancelAnimationFrame(frame);
    }, [enabled, state]);

    const japanese = /^ja(?:-|$)/i.test(locale);
    const mount = enabled && state.kind === 'external' ? state.target.mount : undefined;

    return <div className={styles.basicPanel}>
        {enabled && <div className={styles.basicPanelHeading} ref={action}>
            <h2>{title}</h2>
            {!mount && <OpenWindowButton
                disabled={state.kind === 'opening'}
                label={japanese ? '別画面で開く' : 'Open in another window'}
                onOpen={() => surface.undock({id, title, rememberPlacement: true})}
            />}
        </div>}
        <DockablePanel
            dockLabel={japanese ? 'ここに戻す' : 'Return here'}
            mount={mount}
            onDock={() => surface.dock()}
        >{children}</DockablePanel>
    </div>;
}

export function BasicPanel({id, title, children}) {
    const host = useWindowHost();
    return host ? <DockableBasicPanel {...{host, id, title}}>{children}</DockableBasicPanel> : children;
}
