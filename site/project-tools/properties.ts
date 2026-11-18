import {createProjectProperties} from '@kubohiroya/turbowarp-plus-editor-workbench/project-properties';
import {projectSerializationOptions} from '@kubohiroya/turbowarp-extension-loader/scratch-vm';
import {beginProjectArchiveRead} from '../extension-host/shared-project-archive.ts';

export {PROJECT_INFO_KEY, withProjectFolderTitle} from '@kubohiroya/turbowarp-plus-editor-workbench/project-properties';
export const installProjectProperties = createProjectProperties({beginProjectArchiveRead, projectSerializationOptions});
