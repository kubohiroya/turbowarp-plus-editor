import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createBrowserHost} from '../../site/editor-backpack/browser-host.ts';

// The surface and transfer contracts moved with their code to @kubohiroya/turbowarp-plus-editor-windows.

test('the browser host tells the editor closing apart from the user closing the window', () => {
    for (const [trigger, cause] of [['parent', 'parent-closed'], ['child', 'child-closed']]) {
        let tick = () => {};
        const parent = Object.assign(new EventTarget(), {
            location: {href: 'https://editor.test/index.html', origin: 'https://editor.test'},
            setInterval: (run: () => void) => {tick = run; return 1;},
            clearInterval() {},
            setTimeout: () => 2,
            clearTimeout() {}
        }) as unknown as Window;
        const child = {closed: false, document: {} as Document, close() {this.closed = true;}};
        const connection = createBrowserHost(parent, () => child as unknown as Window).open({});
        void connection.ready.catch(() => {});
        if (trigger === 'parent') parent.dispatchEvent(new Event('pagehide'));
        if (trigger === 'child') child.closed = true;
        tick();
        assert.equal(connection.disconnected.reason, cause);
        // A later signal does not overwrite the first cause.
        parent.dispatchEvent(new Event('pagehide'));
        assert.equal(connection.disconnected.reason, cause);
    }
});
