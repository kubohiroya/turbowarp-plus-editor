import ScratchBlocks from 'scratch-blocks';
import {startCodePopout} from '@kubohiroya/turbowarp-plus-editor-code-views/code-popout';
import '@kubohiroya/turbowarp-plus-editor-windows/styles.css';
import '@kubohiroya/turbowarp-plus-editor-code-views/styles.css';
import {PopupLayout} from '../editor-layout/popup-layout.tsx';
import {attachWorkspaceNavigation} from '@kubohiroya/turbowarp-plus-editor-workbench/workspace-navigation';
import {installBlockContextMenuIcons} from '../context-menu-icons/index.ts';
import {readWebStartupFeatureFlags} from '../startup-feature-flags.ts';

startCodePopout({ScratchBlocks, PopupLayout, attachWorkspaceNavigation, installBlockContextMenuIcons,
    readStartupFlags: readWebStartupFeatureFlags});
