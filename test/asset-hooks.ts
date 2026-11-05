/**
 * Let `node --test` load this repository's browser modules.
 *
 * The site build hands stylesheets, images and JSX to webpack loaders. Node has none, so a test
 * that imports anything reaching a view would fail on the first `.css` — which is how the
 * integration's own tests started failing when the library tab joined it.
 *
 * So the three kinds of file a loader would handle are answered here instead: a stylesheet becomes
 * the class-name map css-loader produces, an image becomes its path, and a view becomes a
 * placeholder component. That is enough for a test that checks what the integration supplies.
 * What the views actually do is tested where JSX can be compiled — `test/extension-library/`, which
 * uses the pinned GUI's babel, as the real build does.
 */

import fs from 'node:fs';
import {createRequire, registerHooks} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const stub = {
    // An empty map, not a Proxy answering every name: a stylesheet that claims to have every
    // class makes `styles.anything` truthy, and code that branches on one then takes a path it
    // never takes in a browser. A test that needs to see which class was asked for uses the
    // require-hook harness instead.
    '.css': 'export default {};',
    '.svg': 'export default import.meta.url;',
    '.png': 'export default import.meta.url;',
    '.tsx': 'export default function TestPlaceholderView () { return null; }'
};
const extensionOf = url => {
    const index = url.lastIndexOf('.');
    return index === -1 ? '' : url.slice(index).toLowerCase();
};

// The packages both sides share, resolved to the pinned GUI's copies — the same thing the site
// build's aliases do. Without this, a package that imports React would load this repository's own
// React 18 beside the GUI's 16, and a dialog rendered through both breaks in ways that have nothing
// to do with what is being tested.
const configured = process.env.E2E_GUI_ROOT;
const fallback = path.resolve('.host/scratch-gui');
const guiRoot = configured && path.isAbsolute(configured) ? configured :
    fs.existsSync(path.join(fallback, 'package.json')) ? fallback : null;
const guiRequire = guiRoot ? createRequire(path.join(guiRoot, 'package.json')) : null;
const shared = /^(?:react|react-dom|prop-types|lodash\.bindall|scratch-vm|react-intl|react-redux)(?:\/.*)?$/u;

registerHooks({
    resolve (specifier, context, nextResolve) {
        if (/^\.\.?\//.test(specifier)) {
            try { nextResolve(specifier, context); } catch (error) {
                if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
                for (const extension of ['.ts', '.tsx', '.js']) {
                    try { return nextResolve(specifier + extension, context); } catch (resolutionError) {
                        if (resolutionError.code !== 'ERR_MODULE_NOT_FOUND') throw resolutionError;
                    }
                }
                throw error;
            }
        }
        if (specifier.endsWith('.json')) {
            const resolved = nextResolve(specifier, context);
            return {...resolved, importAttributes: {...resolved.importAttributes, type: 'json'}};
        }
        if (!guiRequire || !shared.test(specifier)) return nextResolve(specifier, context);
        try {
            return {url: pathToFileURL(guiRequire.resolve(specifier)).href, shortCircuit: true};
        } catch {
            return nextResolve(specifier, context);
        }
    },
    load (url, context, nextLoad) {
        const source = Object.hasOwn(stub, extensionOf(url)) ? stub[extensionOf(url)] : null;
        return source === null ? nextLoad(url, context) : {format: 'module', shortCircuit: true, source};
    }
});
