import {connect} from 'react-redux';
import {createStageDisplayMenu} from '@kubohiroya/turbowarp-plus-editor-workbench/stage-display-menu';
import workbenchStyles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/stage-display-menu.css';
import fullscreenIcon from '@tw-plus/gui-stage-fullscreen-icon';
import exitFullscreenIcon from '@tw-plus/gui-stage-exit-fullscreen-icon';
import {setFullScreen} from '@tw-plus/gui-mode';
import {StageDisplayMenuContext, WindowLayoutContext} from './context.ts';
import {layoutFlags} from './config.ts';
import {testRunMenuItems} from '../test-run/editor.ts';

export const {EditorStageFullscreenMenu, StageDisplayMenu} = createStageDisplayMenu({
    WindowLayoutContext, StageDisplayMenuContext, layoutFlags, styles, workbenchStyles, fullscreenIcon, exitFullscreenIcon,
    connectFullscreen: component => connect(null, dispatch => ({onExit: () => dispatch(setFullScreen(false))}))(component),
    fullscreenMount: header => header.querySelector('[class*="stage-header_fullscreen-buttons-row_"]'),
    menuItems: testRunMenuItems
});
