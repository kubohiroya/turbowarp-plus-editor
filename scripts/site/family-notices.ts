import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// The Pages Editor is distributed as a GPL-3.0 work. Every turbowarp-plus family package it bundles
// keeps its own license, so the build records each one's license text and where to get its source.
export const familyScope = '@kubohiroya/';
/** Family packages published under an upstream name: the fork is not the npm package of that name. */
export const familyForks = {'scratch-vm': 'kubohiroya/scratch-vm'};
/** Packages every Editor build bundles; a build whose notices lack one of them is incomplete. */
export const requiredFamilyPackages = [
    '@kubohiroya/turbowarp-extension-security-dialog',
    '@kubohiroya/turbowarp-extension-loader',
    '@kubohiroya/turbowarp-extension-data-editor',
    '@kubohiroya/turbowarp-document-editor',
    '@kubohiroya/turbowarp-document-data',
    'scratch-vm'
];
/**
 * Published versions that declare no license and ship no license file. The source has declared
 * MPL-2.0 since, so the next release replaces these. They are recorded as published, not relicensed here.
 */
export const undeclaredLicenseReleases = {
    '@kubohiroya/turbowarp-extension-data-editor': ['0.5.0', '0.7.0']
};

export const isFamilyPackage = (name: string) => name.startsWith(familyScope) || Object.hasOwn(familyForks, name);
const noticeFile = /^(?:LICEN[CS]E|COPYING|NOTICE|THIRD_PARTY_NOTICES)(?:[.-][\w.-]+)?$/iu;
const licenseFile = /^(?:LICEN[CS]E|COPYING)/iu;

/** Copy a package's license and notice files to `destination`, named `${prefix}${file}`. */
export async function copyNoticeFiles(packageRoot: string, destination: string, prefix = ''): Promise<string[]> {
    const names = (await fs.readdir(packageRoot, {withFileTypes: true}))
        .filter(entry => entry.isFile() && noticeFile.test(entry.name)).map(entry => entry.name).sort();
    await fs.mkdir(destination, {recursive: true});
    for (const name of names) await fs.copyFile(path.join(packageRoot, name), path.join(destination, `${prefix}${name}`));
    return names;
}

/** The family packages a production install contains, read from its lockfile. */
export async function installedFamilyPackages(directory: string) {
    const lock = JSON.parse(await fs.readFile(path.join(directory, 'package-lock.json'), 'utf8'));
    const found = [];
    for (const [location, entry] of Object.entries<any>(lock.packages || {})) {
        if (!location || entry.dev) continue;
        const name = location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
        if (!isFamilyPackage(name)) continue;
        const packageRoot = path.resolve(directory, entry.link ? entry.resolved : location);
        found.push({name, location, packageRoot, lock: entry});
    }
    return found;
}

const githubURL = (value: unknown) => {
    const url = typeof value === 'string' ? value : (value as {url?: string})?.url;
    const match = typeof url === 'string' && url.match(/github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:#.*)?$/u);
    return match ? `https://github.com/${match[1]}` : null;
};

function sourceOf(name: string, manifest, lock) {
    // A git dependency records its commit; prepare-core may have replaced a package after install,
    // so trust the lock's source only while it still describes the installed version.
    const git = lock.version === manifest.version && typeof lock.resolved === 'string' &&
        lock.resolved.match(/^git\+(?:ssh:\/\/git@|https:\/\/)github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?#([0-9a-f]{40})$/u);
    if (git) return {npm: null, repository: `https://github.com/${git[1]}`, revision: git[2]};
    assert.ok(!Object.hasOwn(familyForks, name), `${name} must be installed from its fork's Git revision`);
    return {npm: `https://www.npmjs.com/package/${name}/v/${manifest.version}`,
        tarball: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${manifest.version}.tgz`,
        repository: githubURL(manifest.repository)};
}

/**
 * Record the license files and source of every family package the given installs bundle in
 * `${output}/notices/`, with `notices/family.json` as the index.
 */
export async function buildFamilyNotices(output: string, installs: {origin: string; directory: string}[],
    {required = requiredFamilyPackages, warn = message => console.warn(message)} = {}) {
    const noticeRoot = path.join(output, 'notices');
    const packages = new Map();
    for (const {origin, directory} of installs) {
        for (const installed of await installedFamilyPackages(directory)) {
            const manifest = JSON.parse(await fs.readFile(path.join(installed.packageRoot, 'package.json'), 'utf8'));
            assert.equal(manifest.name, installed.name, `Unexpected package at ${installed.location}`);
            const key = `${manifest.name}@${manifest.version}`;
            const where = `${origin}:${installed.location}`;
            if (packages.has(key)) { packages.get(key).installedIn.push(where); continue; }
            const label = `${manifest.name.split('/').at(-1)}@${manifest.version}`;
            const files = await copyNoticeFiles(installed.packageRoot, path.join(noticeRoot, label));
            const entry: Record<string, unknown> = {package: manifest.name, version: manifest.version,
                license: manifest.license ?? null, files: files.map(name => `notices/${label}/${name}`),
                source: sourceOf(manifest.name, manifest, installed.lock), installedIn: [where]};
            if (!files.some(name => licenseFile.test(name)) || !manifest.license) {
                assert.ok(undeclaredLicenseReleases[manifest.name]?.includes(manifest.version),
                    `${key} has no license declaration or license file`);
                entry.licenseStatus = 'undeclared';
                warn(`${key} declares no license and ships no license file; recorded as published.`);
            }
            packages.set(key, entry);
        }
    }
    const entries = [...packages.values()].sort((a, b) => `${a.package}@${a.version}`.localeCompare(`${b.package}@${b.version}`));
    const missing = required.filter(name => !entries.some(entry => entry.package === name));
    assert.deepEqual(missing, [], `Bundled family packages without notices: ${missing.join(', ')}`);
    const index = {packages: entries};
    await fs.mkdir(noticeRoot, {recursive: true});
    await fs.writeFile(path.join(noticeRoot, 'family.json'), `${JSON.stringify(index, null, 2)}\n`);
    return {index: 'notices/family.json', packages: entries.map(entry => `${entry.package}@${entry.version}`),
        undeclared: entries.filter(entry => entry.licenseStatus).map(entry => `${entry.package}@${entry.version}`)};
}
