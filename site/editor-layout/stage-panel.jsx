import React from 'react';
import {attachExternalMonitorDrag} from '@kubohiroya/turbowarp-editor-layout';
import {BasicPanel} from './basic-panel.jsx';
import {createDesktopPanelHost} from './desktop-panel-host.js';
import {decorateSurface} from '../editor-backpack/surface-styles.js';
import {layoutFlags, WindowLayoutContext} from './index.jsx';
import styles from './layout.css';

const desktopPopout = createDesktopPanelHost('stage', 'twPlusStagePopout', 680, 520);

function StageViewport({aspect, width, defaultWidth, floating, render, inputDocument}) {
    const viewport = React.useRef(null);
    const [floatingWidth, setFloatingWidth] = React.useState(null);
    const [externalBounds, setExternalBounds] = React.useState(Boolean(inputDocument));
    React.useLayoutEffect(() => {
        if (inputDocument) {
            setExternalBounds(true);
            return;
        }
        if (!externalBounds) return;
        // Recalculate Stage bounds after the docking portal has moved back into the editor.
        const frame = requestAnimationFrame(() => setExternalBounds(false));
        return () => cancelAnimationFrame(frame);
    }, [inputDocument, externalBounds]);
    React.useLayoutEffect(() => {
        if (!floating) return;
        const node = viewport.current;
        const measure = () => {
            if (node.clientWidth < 3 || node.clientHeight < 3) return;
            setFloatingWidth(Math.max(1, Math.floor(Math.min(node.clientWidth - 2, (node.clientHeight - 2) * aspect))));
        };
        const observer = new (inputDocument?.defaultView.ResizeObserver ?? ResizeObserver)(measure);
        measure();
        observer.observe(node);
        return () => observer.disconnect();
    }, [aspect, floating, inputDocument]);

    return <div className={styles.stageViewport} data-floating={floating} ref={viewport}>
        {render(floating ? floatingWidth ?? Math.min(240, width ?? defaultWidth) : width,
            floating || externalBounds, inputDocument)}
    </div>;
}

function AppStagePanel({aspect, width, defaultWidth, render}) {
    const {locale} = React.useContext(WindowLayoutContext);
    const title = /^ja(?:-|$)/i.test(locale) ? 'ステージ' : 'Stage';
    return <BasicPanel id="stage" title={title} externalHost={desktopPopout} decorate={decorateSurface} overlayAction dockHeight={Math.round((width ?? defaultWidth) / aspect)}
        render={(floating, mount) => <StageViewport {...{aspect, width, defaultWidth, floating, render}}
            inputDocument={desktopPopout ? mount?.ownerDocument : undefined} />}
    />;
}

export const StagePanel = layoutFlags.stagePanel ? AppStagePanel : undefined;
export const attachStageMonitorDrag = desktopPopout && layoutFlags.stagePanel ?
    (element, onMove, isDraggable) => attachExternalMonitorDrag(element, onMove, isDraggable, document) : undefined;
