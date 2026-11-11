import React from 'react';
import {useSpriteCodeWindows} from '@kubohiroya/turbowarp-plus-editor-views/sprite-code-windows';
import {useTargetTabMenu} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';
import {createPortal} from 'react-dom';
import {BasicPanel} from './basic-panel.tsx';
import {createDesktopPanelHost, createWebPanelHost} from './desktop-panel-host.ts';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {layoutFlags, layoutViews, WindowLayoutContext} from './index.tsx';
import {TargetSwitchContext} from './context.ts';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';

const desktopPopout = createDesktopPanelHost('sprite-list', 'twPlusSpriteListPopout', 540, 420) ??
    createDesktopPanelHost('sprite-list', 'twPlusTargetPanelsPopout', 540, 420);
const externalHost = desktopPopout ?? (layoutFlags.standardLayout ? createWebPanelHost('sprite-list', 540, 420) : null);
const TargetListDocument = React.createContext<Document | undefined>(undefined);

function DockableTargetList({children}) {
    const {plusLayout} = React.useContext(WindowLayoutContext);
    const {mount, query, renderTools, title, openLabel} = layoutViews.useSpriteListTools();
    const dockHeading = openAction => {
        const tools = renderTools(openAction);
        return mount ? createPortal(tools, mount) : tools;
    };
    if (!plusLayout && !layoutFlags.targetList) return children;
    return <BasicPanel id="sprite-list" title={title}
        className={styles.targetListPanel} externalHost={externalHost} externalOnly={Boolean(externalHost)} decorate={decorateSurface}
        layer={plusLayout ? 'utility' : undefined} alwaysShowUndock={plusLayout} renderDockHeading={plusLayout ? dockHeading : undefined}
        openLabel={plusLayout ? openLabel : undefined}
        renderInExternalDocument render={(_floating, mount) => (
            <TargetListDocument.Provider value={mount?.ownerDocument}>
                <layoutViews.TargetSearchProvider value={query}>
                    <layoutViews.SpriteListContent>{children}</layoutViews.SpriteListContent>
                </layoutViews.TargetSearchProvider>
            </TargetListDocument.Provider>
        )} />;
}

const targetListEnabled = layoutFlags.targetList || layoutFlags.standardLayout;
export const TargetListLayout = targetListEnabled ?
    props => <layoutViews.TargetLayout {...props} compact={layoutFlags.targetList} /> : undefined;
export const TargetListPanel = targetListEnabled ? DockableTargetList : undefined;
export const SpriteGrid = targetListEnabled ? function HostedSpriteGrid(props) {
    const commands = useSpriteCodeWindows();
    const tabMenu = useTargetTabMenu();
    const targetSwitch = React.useContext(TargetSwitchContext);
    const document = React.useContext(TargetListDocument);
    const children = targetSwitch || tabMenu ? React.Children.map(props.children, child => {
        // The GUI passes sortable wrappers with one sprite tile apiece.
        if (!React.isValidElement<{children: React.ReactNode}>(child)) return child;
        const tile = child.props.children;
        if (!React.isValidElement<{id?: string; onClick?: (id: string) => void;
            renderEditorMenu?: (primitives, rename) => object}>(tile)) return child;
        const {id, onClick} = tile.props;
        if (!id || !onClick) return child;
        return React.cloneElement(child, {}, React.cloneElement(tile, {
            onClick(targetId) {
                const select = () => {
                    tabMenu?.select(targetId);
                    onClick(targetId);
                };
                if (targetSwitch) targetSwitch.select(targetId, select, document);
                else select();
            },
            ...(tabMenu && {renderEditorMenu: (primitives, rename) => ({
                ...tabMenu.render(primitives, id, rename),
                onShow: () => tabMenu.onShow(id)
            })})
        }));
    }) : props.children;
    return <layoutViews.SpriteGrid {...props} onRename={commands?.rename}>{children}</layoutViews.SpriteGrid>;
} : undefined;
export const BackdropTile = targetListEnabled ? function HostedBackdropTile(props: React.ComponentProps<typeof layoutViews.BackdropTile>) {
    const targetSwitch = React.useContext(TargetSwitchContext);
    const {onClick} = props;
    return <layoutViews.BackdropTile {...props} onClick={targetSwitch && onClick ?
        event => targetSwitch.select(undefined, onClick, event.currentTarget.ownerDocument) : onClick} />;
} : undefined;
export const BackdropListActions = targetListEnabled ?
    props => <layoutViews.BackdropActions {...props} compact={layoutFlags.targetList} /> : undefined;
