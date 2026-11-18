import {attachExternalMonitorDrag} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {createStagePanel} from '@kubohiroya/turbowarp-plus-editor-workbench/stage-panel';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {BasicPanel} from './basic-panel.tsx';
import {StageDisplayMenuContext} from './context.ts';
import {EditorStageFullscreenMenu} from './stage-display-menu.tsx';
import {createDesktopPanelHost, createWebPanelHost} from './desktop-panel-host.ts';
import {decorateSurface} from '../editor-backpack/surface-styles.ts';
import {layoutFlags, layoutViews, stageCanUndock, stageDrawerEnabled, WindowLayoutContext} from './index.tsx';

const desktopPopout = createDesktopPanelHost('stage', 'twPlusStagePopout', 680, 520);
const externalHost = desktopPopout ?? (layoutFlags.standardLayout ? createWebPanelHost('stage', 680, 520) : null);
export const {StagePanel} = createStagePanel({WindowLayoutContext, StageDisplayMenuContext, BasicPanel,
    EdgeDrawer: layoutViews.EdgeDrawer, EditorStageFullscreenMenu, externalHost, decorateSurface, layoutFlags, stageCanUndock, styles});
export const attachStageMonitorDrag = (stageDrawerEnabled && externalHost) || (desktopPopout && layoutFlags.stagePanel) ?
    (element, onMove, isDraggable) => attachExternalMonitorDrag(element, onMove, isDraggable, document) : undefined;
