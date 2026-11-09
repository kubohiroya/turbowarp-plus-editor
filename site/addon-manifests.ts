import upstream from '@tw-plus/upstream-addon-manifests';

type Manifest = {tags?: string[]; enabledByDefault?: boolean};

// Plus turns on, by default, every addon the settings page labels "recommended", plus these.
// A choice saved in the addon settings still wins over the default.
const alsoEnabled = new Set(['hide-delete-button', 'block-palette-icons']);

const manifests: Record<string, Manifest> = {};
for (const [id, manifest] of Object.entries(upstream as Record<string, Manifest>)) {
    manifests[id] = manifest.tags?.includes('recommended') || alsoEnabled.has(id) ?
        {...manifest, enabledByDefault: true} : manifest;
}
export default manifests;
