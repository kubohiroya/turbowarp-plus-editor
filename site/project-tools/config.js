import {readStartupFeatureFlags} from '../../config/feature-flags.ts';

// Snapshot at module startup, before project content is read.
export const PROJECT_TOOLS_ENABLED = readStartupFeatureFlags(
    typeof window === 'undefined' ? '' : window.location?.search || '').projectTools;
