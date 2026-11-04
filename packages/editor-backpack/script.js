import {FORMAT, MAX_BYTES, validateScript} from '@kubohiroya/turbowarp-script-transfer';

const stockOpcode = /^(motion|looks|sound|event|control|sensing|operator|math|text|colour|note)_|^(text|colour_picker)$/;

export const jsonDataUrl = 'data:application/json;base64,';

export async function readBackpackScript(url, signal) {
    if (!url.startsWith(jsonDataUrl)) throw new Error('Unsupported Backpack script URL');
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
