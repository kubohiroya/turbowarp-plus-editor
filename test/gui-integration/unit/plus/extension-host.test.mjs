import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
    installSecurityHost, isPlusPermissionDenied, startupPlusExtensionHost
} from '../../../../site/gui-integration/lib/tw-plus-extension-host.js';
import {canLoadPlusExtension} from '../../../../site/gui-integration/lib/tw-plus-extension-permissions.js';

const forbidden = () => new Proxy({}, {get () {
    throw new Error('A VM must not be touched when no host installs extension loading');
}});

// Loading a project's extensions is the distributor's implementation now. With none supplied there
// is no loader at all, which is this fork on its own: every project opens the way it does upstream.
test('with no host there is no extension loading, and the VM is not touched', async () => {
    const host = startupPlusExtensionHost(forbidden(), {}, {});
    assert.equal(host.enabled, false);
    assert.equal(await host.dispose(), undefined);
    assert.equal(startupPlusExtensionHost(forbidden(), {}, null).enabled, false);
    // A host that answers with nothing is a host that installed nothing.
    assert.equal(startupPlusExtensionHost(forbidden(), {}, {installExtensionHost: () => null}).enabled, false);
});

test('the host is handed what only this fork has, and nothing it could read itself', async () => {
    const given = [];
    const installed = {enabled: true, dispose: async () => {}};
    const integration = {installExtensionHost (vm, settings) {
        given.push([vm, settings]);
        return installed;
    }};
    const vm = {};
    assert.equal(startupPlusExtensionHost(vm, {search: '', locale: 'en'}, integration), installed);
    const [[subject, settings]] = given;
    assert.equal(subject, vm);
    assert.equal(settings.locale, 'en');
    // The startup query goes over as it was. What it means — whether loading runs at all — and
    // the limits a project is read with are the host's to decide, so neither is sent from here.
    assert.equal(settings.search, '');
    assert.equal(settings.enabled, undefined);
    assert.equal(settings.archiveOptions, undefined);
    // The VM modules registration and native asset import need. Central dispatch is a
    // singleton, and a copy resolved anywhere else would not be the one the VM uses.
    assert.deepEqual(Object.keys(settings.vmModules).sort(),
        ['ScratchCommon', 'assetUploads', 'createTranslate', 'dispatch', 'loadCostume', 'loadSound', 'staticFetch']);
    assert.equal(settings.vmModules.loadCostume, (await import('scratch-vm/src/import/load-costume.js')).loadCostume);
    assert.equal(settings.vmModules.loadSound, (await import('scratch-vm/src/import/load-sound.js')).loadSound);
    assert.equal(settings.vmModules.dispatch,
        (await import('scratch-vm/src/dispatch/central-dispatch.js')).default);
    // What the project-error paths read back. The authoring controller the extension library
    // reads back is the host's own now, along with the library tab that reads it.
    assert.equal(typeof settings.markLoadFailure, 'function');
    assert.equal(settings.createAuthoring, undefined);
    assert.equal(settings.setAuthoringHost, undefined);
});

test('the startup query goes over unread, and a later URL change cannot change it', () => {
    const given = [];
    const integration = {installExtensionHost (vm, settings) {
        given.push(settings);
        return {enabled: true, dispose: async () => {}};
    }};
    startupPlusExtensionHost({}, {search: '?twPlusExtensionLoader=0'}, integration);
    assert.equal(given[0].search, '?twPlusExtensionLoader=0');
    // With no search given, the snapshot taken before any project was opened is used, so changing
    // the URL afterwards changes nothing.
    const previous = globalThis.location;
    globalThis.location = {search: '?twPlusExtensionLoader=0'};
    try {
        startupPlusExtensionHost({}, {}, integration);
        assert.equal(given[1].search, previous === undefined ? '' : previous.search);
    } finally {
        if (previous === undefined) delete globalThis.location;
        else globalThis.location = previous;
    }
});

test('a refusal is a refusal, whoever installed the loader or shipped the review', () => {
    assert.equal(isPlusPermissionDenied({code: 'TRUST_DENIED'}, {}), false);
    assert.equal(isPlusPermissionDenied({code: 'CANCELLED'}, {}), false);
    assert.equal(isPlusPermissionDenied({code: 'FETCH_FAILED'}, {}), false);
    assert.equal(isPlusPermissionDenied(null, {}), false);
    // A review the host shipped can only be recognised by the host, so it is asked.
    const asked = [];
    const integration = {securityReview: {isCancelled: error => {
        asked.push(error);
        return error.code === 'REVIEW_CANCELLED';
    }}};
    assert.equal(isPlusPermissionDenied({code: 'REVIEW_CANCELLED'}, integration), true);
    assert.equal(isPlusPermissionDenied({code: 'FETCH_FAILED'}, integration), false);
    assert.deepEqual(asked.map(error => error.code), ['REVIEW_CANCELLED', 'FETCH_FAILED']);
});

test('loader refusal classification is supplied by the host rather than inferred from codes', () => {
    const declined = new Error('host refused');
    const integration = {extensionLoadErrors: {isCancelled: error => error === declined}};
    assert.equal(isPlusPermissionDenied(declined, integration), true);
    assert.equal(isPlusPermissionDenied(new Error('different'), integration), false);
});

test('the host installs the batch review under the loader and restores it after disposal', async () => {
    const order = [];
    const vm = {extensionManager: {securityManager: {}}};
    const DialogFrame = () => null;
    const isTrusted = () => false;
    const entries = [];
    const initialChoices = new Map();
    const onComplete = () => {};
    let review;
    const dispose = installSecurityHost(vm, {
        securityManager: {}, locale: 'ja', DialogFrame, isTrusted,
        extensionLibrary: [{extensionId: 'music', iconURL: 'native-icon'}],
        requestModal (render, cancelled) {
            assert.equal(cancelled, null);
            return render(onComplete, 'en');
        }
    }, {
        securityReview: {
            installBatchLoader (options) {
                order.push('batch');
                assert.equal(options.vm, vm);
                assert.equal(options.isTrusted, isTrusted);
                assert.equal(options.bannerFor({ids: ['music']}), 'native-icon');
                review = options.showReview;
                return () => order.push('restore');
            },
            render (props) {
                assert.deepEqual(props, {entries, initialChoices, DialogFrame, onComplete, locale: 'en'});
                return 'review';
            }
        },
        installExtensionHost (target, settings) {
            assert.equal(target, vm);
            assert.equal(settings.locale, 'ja');
            order.push('loader');
            // Project tools still need disposal when the loader flag is off.
            return {enabled: false, async dispose () {
                await Promise.resolve();
                order.push('dispose');
            }};
        }
    });
    assert.equal(review(entries, initialChoices), 'review');
    const first = dispose();
    assert.equal(dispose(), first);
    assert.equal(review(entries, initialChoices), null);
    await first;
    assert.deepEqual(order, ['batch', 'loader', 'dispose', 'restore']);
});

test('a supplied native loading policy bypasses the batch review and stays bound to its VM', async () => {
    const security = {};
    const vm = {extensionManager: {securityManager: security}};
    const securityManager = {
        canLoadExtensionFromProject () {
            assert.equal(this, security);
            return false;
        },
        getSandboxMode () {
            assert.equal(this, security);
            return 'iframe';
        }
    };
    const dispose = installSecurityHost(vm, {securityManager}, {
        securityReview: {installBatchLoader: () => assert.fail('Native policy should own this load')},
        installExtensionHost (target, {hostPolicy}) {
            assert.equal(target, vm);
            assert.equal(hostPolicy.canLoadExtensionFromProject(), false);
            assert.equal(hostPolicy.getSandboxMode(), 'iframe');
            return {enabled: true, dispose () {}};
        }
    });
    assert.equal(canLoadPlusExtension(security, 'https://example.test/x.js'), false);
    await dispose();
    assert.equal(canLoadPlusExtension(security, 'https://example.test/x.js'), true);
});
