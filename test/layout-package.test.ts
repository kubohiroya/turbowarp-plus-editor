import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import {attachStageInput} from '@kubohiroya/turbowarp-plus-editor-workbench';
import {createSpriteInfoAdapter} from '@kubohiroya/turbowarp-plus-editor-sprite-panes/sprite-properties';
import {WindowDesktop} from '@kubohiroya/turbowarp-plus-editor-windows';
import lock from '../package-lock.json' with {type: 'json'};
import manifest from '../package.json' with {type: 'json'};
import {connectDesktopWorkspaceLayouts} from '../site/editor-layout/desktop-workspace-layout.ts';

test('the Editor resolves the pinned layout package and its host entry points', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-workbench';
    const {version, resolved, integrity} = lock.packages[`node_modules/${name}`];
    assert.match(integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-workbench-${version}.tgz`);
    for (const entry of [attachStageInput, createSpriteInfoAdapter]) {
        assert.equal(typeof entry, 'function');
    }
});

test('the Editor resolves the pinned npm windows package split out of the layout', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-windows';
    const {version, resolved} = lock.packages[`node_modules/${name}`];
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-windows-${version}.tgz`);
    assert.equal(typeof WindowDesktop, 'function');
});

test('the Editor resolves the pinned sprite-panes package split out of the layout', () => {
    const name = '@kubohiroya/turbowarp-plus-editor-sprite-panes';
    const {version, resolved} = lock.packages[`node_modules/${name}`];
    assert.equal(manifest.devDependencies[name], version);
    assert.equal(resolved, `https://registry.npmjs.org/${name}/-/turbowarp-plus-editor-sprite-panes-${version}.tgz`);
});

test('the Editor installs no package from a .tgz archive outside npm and keeps none in the repository', () => {
    // Bundling package .tgz files is not allowed: publish to npm and pin the published version instead.
    const deps = manifest as unknown as Record<string, Record<string, string> | undefined>;
    const specs = Object.entries({...deps.dependencies, ...deps.devDependencies, ...deps.optionalDependencies});
    assert.deepEqual(specs.filter(([, spec]) => /\.tgz$/u.test(spec)), []);
    const local = Object.entries(lock.packages as Record<string, {resolved?: unknown}>).filter(([, entry]) => typeof entry.resolved === 'string' &&
        entry.resolved.endsWith('.tgz') && !entry.resolved.startsWith('https://registry.npmjs.org/'));
    assert.deepEqual(local.map(([name]) => name), []);
    const tracked = execFileSync('git', ['ls-files', '*.tgz'], {cwd: new URL('..', import.meta.url), encoding: 'utf8'}).trim();
    assert.equal(tracked, '');
});

test('Desktop reports when a project layout last changed, so a newer one wins over the project file', async () => {
    const records = new Map<string, {layout: string; savedAt?: number}>([['legacy', {layout: '{"old":true}'}]]);
    const store = connectDesktopWorkspaceLayouts({
        read: async key => records.get(key)?.layout ?? null,
        readRecord: async key => records.get(key) ?? null,
        write: async (key, layout) => {
            records.set(key, {layout, savedAt: 2000});
            return 2000;
        }
    });
    const open = (key: string) => store.open({kind: 'desktop', name: 'Game', key}, '');
    const legacy = await open('legacy');
    assert.equal(legacy.layout, '{"old":true}');
    assert.equal(legacy.savedAt, undefined);
    const fresh = await open('fresh');
    assert.equal(fresh.savedAt, undefined);
    await fresh.write('{"new":true}', '');
    assert.equal(fresh.savedAt, 2000);
    assert.equal((await open('fresh')).savedAt, 2000);

    // A Desktop without the time keeps working, and its layouts lose to the file.
    const older = connectDesktopWorkspaceLayouts({read: async () => '{}', write: async () => true});
    const session = await older.open({kind: 'desktop', name: 'Game', key: 'k'}, '');
    await session.write('{}', '');
    assert.equal(session.saved, true);
    assert.equal(session.savedAt, undefined);
});

test('the site connects the saved preference without adding browser dependencies to the distributed flags', async t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {configurable: true, value: {
        localStorage: {getItem: () => '1'}
    }});
    t.after(() => {
        if (previous) Object.defineProperty(globalThis, 'window', previous);
        else Reflect.deleteProperty(globalThis, 'window');
    });
    const {readWebStartupFeatureFlags: readSiteFlags} = await import('../site/startup-feature-flags.ts');
    const {readWebStartupFeatureFlags: readDistributedFlags} = await import('../config/web-startup-feature-flags.ts');
    assert.equal(readSiteFlags().standardLayout, true);
    assert.equal(readDistributedFlags().standardLayout, false);
});
