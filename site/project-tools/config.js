import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

// Snapshot at module startup, before project content is read.
const startupFlags = readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location?.search || '');
export const PROJECT_TOOLS_ENABLED = startupFlags.projectTools;
export const MANUAL_PROJECT_URI_ENABLED = startupFlags.manualProjectURI;
