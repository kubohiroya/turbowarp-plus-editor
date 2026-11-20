import {createProjectDialogService} from '@kubohiroya/turbowarp-plus-editor-workbench/project-dialogs';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/project-dialog.css';
import snackbarStyles from '@kubohiroya/turbowarp-plus-editor-workbench/project-snackbar.css';
import './dialog.css';
import {extensionLoadErrors} from '../extension-host/load-errors.ts';

export const {createProjectDialogs} = createProjectDialogService({styles, snackbarStyles,
    isCancelled: extensionLoadErrors.isCancelled});
