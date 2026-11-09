import upstream from '@tw-plus/upstream-addon-manifests';

type Manifest = {tags?: string[]; enabledByDefault?: boolean};

// Plus turns on, by default, every addon the settings page labels "recommended", plus these.
// A choice saved in the addon settings still wins over the default.
const alsoEnabled = new Set(['hide-delete-button', 'block-palette-icons']);
// Recommended upstream but left off: an auto-hiding palette floats over the workspace, covering
// the scripts beside it and the minimap Plus places against the palette's edge.
const keptOff = new Set(['hide-flyout']);

const manifests: Record<string, Manifest> = {};
for (const [id, manifest] of Object.entries(upstream as Record<string, Manifest>)) {
    const enabled = (manifest.tags?.includes('recommended') || alsoEnabled.has(id)) && !keptOff.has(id);
    manifests[id] = enabled ? {...manifest, enabledByDefault: true} : manifest;
}
export default manifests;
