import {readWebStartupFeatureFlags as readFlags} from '../config/web-startup-feature-flags.ts';
import {readNewLayoutPreference} from '@kubohiroya/turbowarp-plus-editor-workbench/layout-preference';

// Browser-only connection: the published loader and CLI keep their configuration dependency-free.
export const readWebStartupFeatureFlags = (search = '', newLayout = readNewLayoutPreference(search)) =>
    readFlags(search, newLayout);
