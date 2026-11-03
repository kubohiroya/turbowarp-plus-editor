/**
 * The editor's keys stop at the review's edge.
 *
 * The GUI turns a bare space into "run" and the arrows into sprite nudges. Inside the review those
 * keys belong to its checkboxes and its buttons, so the GUI asks the socket first
 * (`src/lib/vm-listener-hoc.jsx`). It also still carries a hard-coded `.twextsec-modal` from when
 * the fork owned this screen, and the 0.7 `ExtensionReview` does not render that class any more —
 * so the socket is the only thing answering now, and this is what proves it answers.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {plusIntegration} from '../../site/plus-integration.js';
import {plusSecurityReview} from '../../site/extension-host/review.js';

import {guiRequire} from './pinned-host.mjs';

import {JSDOM} from 'jsdom';

test('a key pressed inside the review is the review\'s, and one outside it is the editor\'s', () => {
    const dom = new JSDOM('<div class="twextsec-review"><input type="checkbox" id="pick">' +
        '<button id="ok">OK</button></div><button id="outside">Outside</button>', {url: 'http://localhost/'});
    const {document} = dom.window;
    try {
        for (const id of ['pick', 'ok']) {
            const event = {target: document.getElementById(id)};
            assert.equal(plusSecurityReview.ownsKeyEvent(event), true, id);
            assert.equal(plusIntegration().shouldIgnoreKeyEvent(event), true, id);
        }
        const outside = {target: document.getElementById('outside')};
        assert.equal(plusSecurityReview.ownsKeyEvent(outside), false);
        assert.equal(plusIntegration().shouldIgnoreKeyEvent(outside), false);
        // The GUI hands over whatever its listener saw: a target that cannot be asked, or none.
        assert.equal(plusIntegration().shouldIgnoreKeyEvent({target: {}}), false);
        assert.equal(plusIntegration().shouldIgnoreKeyEvent({}), false);
    } finally {
        dom.window.close();
    }
});
