import {createNativeAssetConversion} from '@kubohiroya/turbowarp-sb3-save-format/native-assets';
import {bundleMaterials} from './codec.ts';
export const {nativeAssetConversion} = createNativeAssetConversion({bundleMaterials});
