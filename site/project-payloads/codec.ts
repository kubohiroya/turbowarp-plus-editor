import {createProjectPayloadCodec} from '@kubohiroya/turbowarp-sb3-save-format/project-payloads';
import {extensionProjectArchiveOptions} from '../extension-host/config.ts';

export const {payloadKey, originKey, bundleMaterials, inventory, configurePayloads, encodePayloads, embedPackagedProjectData, decodePayloads,
    digest} =
    createProjectPayloadCodec(extensionProjectArchiveOptions);
