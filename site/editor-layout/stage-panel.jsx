import React from 'react';
import {BasicPanel} from './basic-panel.jsx';
import {layoutFlags, WindowLayoutContext} from './index.jsx';
import styles from './layout.css';

function StageViewport({aspect, width, defaultWidth, floating, render}) {
    const viewport = React.useRef(null);
    const [floatingWidth, setFloatingWidth] = React.useState(null);
    React.useLayoutEffect(() => {
        if (!floating) return;
        const node = viewport.current;
        const measure = () => {
            if (node.clientWidth < 3 || node.clientHeight < 3) return;
            setFloatingWidth(Math.max(1, Math.floor(Math.min(node.clientWidth - 2, (node.clientHeight - 2) * aspect))));
        };
        const observer = new ResizeObserver(measure);
        measure();
        observer.observe(node);
        return () => observer.disconnect();
    }, [aspect, floating]);

    return <div className={styles.stageViewport} data-floating={floating} ref={viewport}>
        {render(floating ? floatingWidth ?? Math.min(240, width ?? defaultWidth) : width, floating)}
    </div>;
}

function AppStagePanel({aspect, width, defaultWidth, render}) {
    const {locale} = React.useContext(WindowLayoutContext);
    const title = /^ja(?:-|$)/i.test(locale) ? 'ステージ' : 'Stage';
    return <BasicPanel id="stage" title={title} overlayAction dockHeight={Math.round((width ?? defaultWidth) / aspect)}
        render={floating => <StageViewport {...{aspect, width, defaultWidth, floating, render}} />}
    />;
}

export const StagePanel = layoutFlags.stagePanel ? AppStagePanel : undefined;
