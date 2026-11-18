import {createProjectDialogService} from '@kubohiroya/turbowarp-plus-editor-workbench/project-dialogs';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/project-dialog.css';
import snackbarStyles from '@kubohiroya/turbowarp-plus-editor-workbench/project-snackbar.css';
import './dialog.css';

export const {createProjectDialogs} = createProjectDialogService({styles, snackbarStyles});
