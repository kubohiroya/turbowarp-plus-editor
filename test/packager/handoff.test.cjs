/**
 * The Packager button, end to end across the boundary.
 *
 * Moved from the fork's `test/unit/extension-loader/packager-window.test.cjs`. The upstream
 * integration (`src/lib/tw-packager-integration-hoc.jsx`) stays in the GUI, so it is taken from the
 * pinned checkout and run against this repository's real handoff — which is exactly the pairing the
 * editor performs. Nothing is stubbed between the two.
 */

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');

const configured = process.env.E2E_GUI_ROOT;
const fallback = path.resolve('.host/scratch-gui');
const root = configured && path.isAbsolute(configured) ? configured :
    fs.existsSync(path.join(fallback, 'package.json')) ? fallback : null;
if (!root) {
    throw new Error('This test needs the pinned GUI: set E2E_GUI_ROOT, ' +
        'or check it out at .host/scratch-gui (see scripts/site/source.ts)');
}
const guiRequire = createRequire(path.join(root, 'package.json'));
const babel = guiRequire('@babel/core');
const source = path.join(root, 'src/lib/tw-packager-integration-hoc.jsx');
const transformed = babel.transformFileSync(source, {babelrc: false, configFile: false,
    presets: [[guiRequire.resolve('@babel/preset-env'), {targets: {node: 'current'}, modules: 'commonjs'}],
        guiRequire.resolve('@babel/preset-react')]}).code;

const tick = () => new Promise(resolve => setImmediate(resolve));
const buffer = manifest => new TextEncoder().encode(JSON.stringify({targets: [], extensions: [], extensionURLs: {},
    ...(manifest ? {turboWarpPlus: {schemaVersion: 1, extensions: [{id: 'sample', execution: 'unsandboxed',
        sha256: 'a'.repeat(64), source: {type: 'remote-cacheable', url: 'https://example.test/code.js'}}]}} : {})})).buffer;

/**
 * Run the pinned GUI's integration with this repository's handoff behind it.
 * @param {boolean} enabled Whether this build packages projects of its own.
 * @param {boolean} plus Whether the project the VM saves uses Plus extensions.
 * @returns {object} The component and what its windows saw.
 */
function fixture (enabled = true, plus = true) {
    const opened = [];
    const posted = [];
    let saves = 0;
    const popup = {closed: false, location: {href: ''}, close () {
        this.closed = true;
    }, postMessage (...args) {
        posted.push(args);
    }};
    const location = {href: 'https://editor.test/turbowarp-plus-editor/editor.html', origin: 'https://editor.test'};
    const window = {location, open (url) {
        opened.push(url);
        return popup;
    }, alert () {}, addEventListener () {}, removeEventListener () {}};
    // The handoff reads these as globals when it is called, as it does in a browser.
    const previous = {location: globalThis.location, window: globalThis.window, root: process.env.ROOT};
    globalThis.location = location;
    globalThis.window = window;
    process.env.ROOT = '/turbowarp-plus-editor/';
    const {createProjectPackager} = require('../../site/packager/handoff.js');
    const projectPackager = createProjectPackager({enabled});
    const module = {exports: {}};
    const requireMock = name => {
        if (name === 'react-redux') return {connect: () => component => component};
        if (name === './log') return {error () {}};
        if (name === '../reducers/project-state') return {getIsShowingProject: () => true};
        // The socket: the GUI reads the integration through this module, and the integration is
        // what this repository supplies.
        if (name === './tw-plus-integration-points.js') {
            return {hostIntegration: () => ({projectPackager}), hostProjectPackager: integration =>
                integration?.projectPackager || null};
        }
        return guiRequire(name);
    };
    new Function('require', 'module', 'exports', 'window', 'location', 'process', transformed)(
        requireMock, module, module.exports, window, location, {env: {ROOT: '/turbowarp-plus-editor/'}});
    const Class = module.exports.default(() => null);
    const component = new Class({canOpenPackager: true, reduxProjectTitle: 'Fixture',
        vm: {async saveProjectSb3 () {
            saves++;
            return buffer(plus);
        }}});
    const restore = () => {
        globalThis.location = previous.location;
        globalThis.window = previous.window;
        process.env.ROOT = previous.root;
    };
    return {component, location, opened, popup, posted, restore, saves: () => saves};
}

test('a build that packages nothing itself leaves the Packager button on the upstream path', () => {
    const f = fixture(false);
    try {
        f.component.handleClickPackager();
        assert.deepEqual(f.opened, ['https://packager.turbowarp.org/?import_from=https://editor.test']);
        // Nothing is serialized: without a host there is no project to inspect.
        assert.equal(f.saves(), 0);
    } finally {
        f.restore();
    }
});

test('a project that uses this distribution\'s extensions opens this build\'s own page', async () => {
    const f = fixture();
    try {
        f.component.handleClickPackager();
        // The window is opened during the gesture, before anything is serialized.
        assert.deepEqual(f.opened, ['about:blank']);
        await tick();
        await tick();
        assert.equal(f.popup.location.href, 'https://editor.test/turbowarp-plus-editor/plus-packager.html');
        assert.equal(f.saves(), 1);
    } finally {
        f.restore();
    }
});

test('project bytes are transferred only to the owned same-origin page that asked for them', async () => {
    const f = fixture();
    try {
        f.component.handleClickPackager();
        await tick();
        await tick();
        f.component.handleMessage({origin: 'https://attacker.test', source: f.popup,
            data: {twPlusPackage: {type: 'ready'}}});
        f.component.handleMessage({origin: f.location.origin, source: {},
            data: {twPlusPackage: {type: 'ready'}}});
        assert.equal(f.posted.length, 0);
        f.component.handleMessage({origin: f.location.origin, source: f.popup,
            data: {twPlusPackage: {type: 'ready'}}});
        assert.equal(f.posted.length, 1);
        assert.equal(f.posted[0][0].twPlusPackage.type, 'project');
        assert.equal(f.posted[0][0].twPlusPackage.name, 'Fixture.sb3');
        assert.equal(f.posted[0][1], f.location.origin);
        assert.equal(f.posted[0][2][0], f.posted[0][0].twPlusPackage.bytes);
        // Asking twice does not hand the bytes over twice.
        f.component.handleMessage({origin: f.location.origin, source: f.popup,
            data: {twPlusPackage: {type: 'ready'}}});
        assert.equal(f.posted.length, 1);
    } finally {
        f.restore();
    }
});

test('a project without them keeps the upstream path, and an import rechecks that', async () => {
    const ordinary = fixture(true, false);
    try {
        ordinary.component.handleClickPackager();
        await tick();
        await tick();
        assert.equal(ordinary.popup.location.href,
            'https://packager.turbowarp.org/?import_from=https://editor.test');
    } finally {
        ordinary.restore();
    }
    const plus = fixture();
    try {
        plus.component.handleMessage({origin: 'https://packager.turbowarp.org', source: plus.popup,
            data: {p4: {type: 'ready-for-import'}}});
        await tick();
        await tick();
        // The upstream Packager is told the import is off before the window is taken over.
        assert.deepEqual(plus.posted.map(args => args[0].p4.type), ['start-import', 'cancel-import']);
        assert.equal(plus.popup.location.href, 'https://editor.test/turbowarp-plus-editor/plus-packager.html');
    } finally {
        plus.restore();
    }
});
