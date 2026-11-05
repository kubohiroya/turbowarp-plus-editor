import React from 'react';
import {OpenWindowButton, useWindowHost} from '@kubohiroya/turbowarp-editor-windows';
import {layoutViews, WindowLayoutContext} from '../editor-layout/index.tsx';
import {getBackpackOpenLabel} from '@tw-plus/backpack-window-host';
import {feature} from './integration.ts';
import {PopupLayout} from '../editor-layout/popup-layout.tsx';
import styles from '@kubohiroya/turbowarp-editor-layout/editor.css';

function WebBackpackSurface({setExpanded, ...props}: Pick<
    React.ComponentProps<NonNullable<typeof feature>['BackpackSurface']>, 'vm' | 'children'
> & {setExpanded?: (expanded: boolean) => void}) {
    const {showUndock, locale, plusLayout} = React.useContext(WindowLayoutContext);
    const internalHost = useWindowHost();
    const [open, setOpen] = React.useState(false);
    const [detached, setDetached] = React.useState(false);
    React.useLayoutEffect(() => {
        if (plusLayout) setExpanded?.(open || detached);
    }, [plusLayout, setExpanded, open, detached]);
    const canUndock = showUndock || plusLayout;
    const content = <div className={styles.backpackPanel} tabIndex={canUndock ? -1 : undefined} onClick={canUndock ? event => {
        const node = event.currentTarget;
        if (node.contains(event.target as Node) && !node.contains(node.ownerDocument.activeElement)) node.focus({preventScroll: true});
    } : undefined}>
        <feature.BackpackSurface {...props} showUndock={canUndock} locale={locale} internalHost={internalHost}
            onDetachedChange={setDetached} internalLayer={plusLayout ? 'utility' : undefined}
            renderPopupTools={plusLayout ? ({mount, onDock}) => <div className={styles.popupTools}>
                <PopupLayout window={mount.ownerDocument.defaultView} locale={locale} onDock={onDock} />
            </div> : undefined}
            openLabel={getBackpackOpenLabel(locale)} launchClassName={styles.backpackActions}
            renderLaunchButton={button => <span className={styles.openWindowAction}><OpenWindowButton {...button} /></span>} />
    </div>;
    return plusLayout ? <layoutViews.EdgeDrawer edge="bottom" onOpenChange={setOpen}
        label={/^ja(?:-|$)/i.test(locale) ? 'バックパックを展開' : 'Reveal Backpack'}>{content}</layoutViews.EdgeDrawer> : content;
}

export const BackpackSurface = feature ? WebBackpackSurface : undefined;
export {attachBackpackDrop, receiveBackpackDrop} from './integration.ts';
