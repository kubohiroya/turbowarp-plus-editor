import React from 'react';
import {WindowLayoutMenu} from '@kubohiroya/turbowarp-editor-windows';

export function PopupLayout({window, locale, onDock, onDuplicate = undefined}) {
    const [mode, setMode] = React.useState<'normal' | 'minimized' | 'maximized'>('normal');
    const controls = window?.TwPlusWindowControls;
    React.useEffect(() => {
        if (!controls) return;
        let mounted = true;
        const unsubscribe = controls.onMode(next => {if (mounted) setMode(next);});
        void controls.mode().then(next => {if (mounted) setMode(next);}, () => {});
        return () => {
            mounted = false;
            unsubscribe();
        };
    }, [controls]);
    const change = action => controls ? () => {
        void controls.change(action).then(setMode, () => {});
    } : undefined;
    return <WindowLayoutMenu locale={locale} presentation="external" mode={mode} onDock={onDock}
        onDuplicate={onDuplicate} onMaximize={change('maximize')} onMinimize={change('minimize')}
        onRestore={change('restore')} />;
}
