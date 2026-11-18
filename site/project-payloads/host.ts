import {createProjectPayloadService} from '@kubohiroya/turbowarp-sb3-save-format/project-payload-host';
import * as codec from './codec.ts';
export const {saveProjectForPackager, createProjectPayloadHost} = createProjectPayloadService(codec);
