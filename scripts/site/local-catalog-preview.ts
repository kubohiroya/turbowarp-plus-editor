import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const familyPrefix = '@kubohiroya/';

/** Bundle only explicitly selected local catalog presentation; runtime URLs stay HTTPS. */
export async function prepareLocalCatalogPreview(directory, gui, output) {
    assert.ok(path.isAbsolute(directory), 'TW_PLUS_CATALOG_ROOT must be absolute');
    assert.ok(path.isAbsolute(gui) && path.isAbsolute(output));
    const sourceRoot = await fs.realpath(directory);
    const source = path.join(sourceRoot, 'site/extensions-v1.json');
    assert.ok((await fs.stat(source)).size <= 2 * 1024 * 1024, 'Local catalog exceeds its preview size limit');
    const bytes = await fs.readFile(source);
    const catalog = JSON.parse(bytes.toString('utf8'));
    const require = createRequire(path.join(gui, 'package.json'));
    const entries = require('@kubohiroya/turbowarp-extension-security-dialog').parseExtensionCatalog(catalog);
    const icons = {};
    const assets = {};
    for (const entry of entries) {
        if (!entry.metadata.package?.startsWith(familyPrefix)) continue;
        const repo = entry.metadata.package.slice(familyPrefix.length);
        if (!/^turbowarp-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(repo)) continue;
        const relative = `site/assets/extension-icons/${repo}.svg`;
        const expectedURL = `https://kubohiroya.github.io/turbowarp-plus-packages/assets/extension-icons/${repo}.svg`;
        if (entry.metadata.banner !== expectedURL) continue;
        const assetPath = path.join(sourceRoot, relative);
        const actualPath = await fs.realpath(assetPath);
        assert.ok(actualPath.startsWith(`${sourceRoot}${path.sep}`), 'Catalog icon leaves its source checkout');
        assert.ok((await fs.stat(actualPath)).size <= 64 * 1024, 'Catalog icon exceeds its preview size limit');
        const icon = await fs.readFile(actualPath);
        assert.match(icon.toString('utf8'), /^\s*<svg\b/, 'Catalog preview icons must be SVG assets');
        icons[entry.id] = `data:image/svg+xml;base64,${icon.toString('base64')}`;
        assets[relative] = hash(icon);
    }
    const input = {catalog, icons};
    const serialized = `${JSON.stringify(input)}\n`;
    await fs.mkdir(path.dirname(output), {recursive: true});
    await fs.writeFile(output, serialized);
    return {inputPath: output, sourceRoot, catalogSource: source, catalogSha256: hash(bytes),
        bundledSha256: hash(serialized), assets, published: false};
}
