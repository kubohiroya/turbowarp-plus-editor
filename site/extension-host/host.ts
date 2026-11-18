import JSZip from '@turbowarp/jszip';
import {createScratchVMExtensionHost} from '@kubohiroya/turbowarp-extension-loader/scratch-vm/extension-host';
import {createPlusPermissionUI} from './permission-ui.ts';
import {openPlusReview, closePlusReview} from './review-channel.ts';
export type {ExtensionHostOptions} from '@kubohiroya/turbowarp-extension-loader/scratch-vm/extension-host';
export const installPlusExtensionHost = createScratchVMExtensionHost({zip: JSZip,
    createPermissionUI: createPlusPermissionUI, openReview: openPlusReview, closeReview: closePlusReview});
