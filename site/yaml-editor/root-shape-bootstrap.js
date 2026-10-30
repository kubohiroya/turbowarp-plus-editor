import {registerEmbeddedYamlRootHatShape} from '@kubohiroya/turbowarp-embedded-yaml';

// Stored root blocks must remain readable even when document editing is disabled.
export async function initializeEmbeddedYamlRootShape({window: win = globalThis.window, timeoutMs = 30000} = {}) {
    if (!win) return;
    const deadline = Date.now() + timeoutMs;
    while (typeof win.Scratch?.gui?.getBlockly !== 'function') {
        if (Date.now() >= deadline) throw new Error('The Editor block API did not become available.');
        await new Promise(resolve => win.setTimeout(resolve, 50));
    }
    const gui = win.Scratch.gui;
    const eager = typeof gui.getBlocklyEagerly === 'function' ? await gui.getBlocklyEagerly() : null;
    registerEmbeddedYamlRootHatShape(eager || await gui.getBlockly());
}
