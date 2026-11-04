import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

// Snapshot at module startup, before project content is read.
export const PROJECT_TOOLS_ENABLED = readWebStartupFeatureFlags(
    typeof window === 'undefined' ? '' : window.location?.search || '').projectTools;
