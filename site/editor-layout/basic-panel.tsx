import {createBasicPanel} from '@kubohiroya/turbowarp-plus-editor-workbench/basic-panel';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
import {WindowLayoutContext} from './context.ts';
import {PopupLayout} from './popup-layout.tsx';
import {surfaceRecovery} from './desktop-panel-host.ts';

export const {BasicPanel} = createBasicPanel({WindowLayoutContext, PopupLayout, surfaceRecovery, styles});
