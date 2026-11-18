import {createProjectPayloadCodec} from '@kubohiroya/turbowarp-sb3-save-format/project-payloads';
import {extensionProjectArchiveOptions} from '../extension-host/config.ts';

export const {payloadKey, bundleMaterials, inventory, configurePayloads, encodePayloads, embedPackagedProjectData, decodePayloads} =
    createProjectPayloadCodec(extensionProjectArchiveOptions);
