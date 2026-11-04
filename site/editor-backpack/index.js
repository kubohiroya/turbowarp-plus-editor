import {FORMAT, MAX_BYTES, importScript, validateScript} from '@kubohiroya/turbowarp-script-transfer';
import {createBackpackIntegration} from '../../packages/editor-backpack/index.jsx';
import {createBrowserHost} from './browser-host.ts';

const enabled = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('twPlusBackpackPopout') === '1';
const stockOpcode = /^(motion|looks|sound|event|control|sensing|operator|math|text|colour|note)_|^(text|colour_picker)$/;

async function readScript(url, signal) {
    if (url.length > MAX_BYTES * 2) throw new Error('Backpack script too large');
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error('Backpack item unavailable');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) throw new Error('Backpack script too large');
    const raw = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(raw) || !raw.length) throw new Error('Unsupported Backpack script');
    const script = validateScript({format: FORMAT, version: 1, blocks: raw, variables: [], extensionURLs: {}});
    if (script.blocks.some(block => block.comment || !stockOpcode.test(block.opcode))) {
        throw new Error('This Backpack script requires unsupported project dependencies');
    }
    return script;
}

function decorateSurface(doc) {
    const mirror = () => {
        doc.head.querySelectorAll('[data-backpack-style]').forEach(style => style.remove());
        for (const style of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
            const copy = doc.importNode(style, true);
            copy.setAttribute('data-backpack-style', '');
            doc.head.appendChild(copy);
        }
        doc.documentElement.dir = document.documentElement.dir;
        doc.documentElement.lang = document.documentElement.lang;
        doc.body.className = document.body.className;
        doc.body.style.cssText = document.body.style.cssText;
    };
    mirror();
    const observer = new MutationObserver(mirror);
    observer.observe(document.head, {childList: true, subtree: true, characterData: true, attributes: true});
    observer.observe(document.body, {attributes: true});
    observer.observe(document.documentElement, {attributes: true});
    return () => observer.disconnect();
}

const feature = enabled ? createBackpackIntegration({
    host: createBrowserHost(window, (url, ticket) =>
        window.open(url, `tw151-backpack-${ticket}`, 'popup,width=560,height=320')),
    readScript, importScript, decorateSurface
}) : null;

export const BackpackSurface = feature?.BackpackSurface;
export const attachBackpackDrop = context => feature?.attachBackpackDrop(context);
