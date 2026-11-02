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

import {registerHooks} from 'node:module';

const stub = {
    '.css': 'export default new Proxy({}, {get: (object, key) => (key === "__esModule" ? false : String(key))});',
    '.svg': 'export default import.meta.url;',
    '.png': 'export default import.meta.url;',
    '.jsx': 'export default function TestPlaceholderView () { return null; }'
};
const extensionOf = url => {
    const index = url.lastIndexOf('.');
    return index === -1 ? '' : url.slice(index).toLowerCase();
};

registerHooks({
    load (url, context, nextLoad) {
        const source = Object.hasOwn(stub, extensionOf(url)) ? stub[extensionOf(url)] : null;
        return source === null ? nextLoad(url, context) : {format: 'module', shortCircuit: true, source};
    }
});
