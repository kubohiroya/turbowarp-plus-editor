import {createPopupLayout} from '@kubohiroya/turbowarp-plus-editor-workbench/popup-layout';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/popup-layout.css';

export const {PopupLayout} = createPopupLayout({styles, getWindowControls: window => window?.TwPlusWindowControls});
