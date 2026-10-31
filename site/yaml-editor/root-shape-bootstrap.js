import {registerEmbeddedYamlRootHatShape} from '@kubohiroya/turbowarp-document-source';

// Stored root blocks must remain readable even when document editing is disabled.
export async function initializeEmbeddedYamlRootShape({window: win = globalThis.window, timeoutMs = 30000} = {}) {
    if (!win) return;
    const deadline = Date.now() + timeoutMs;
    while (true) {
        // The GUI publishes its block instance before project security approval creates Scratch.
        if (typeof win.ScratchBlocks?.Extensions?.register === 'function') {
            registerEmbeddedYamlRootHatShape(win.ScratchBlocks);
            return;
        }
        const gui = win.Scratch?.gui;
        if (typeof gui?.getBlockly === 'function') {
            const eager = typeof gui.getBlocklyEagerly === 'function' ? await gui.getBlocklyEagerly() : null;
            registerEmbeddedYamlRootHatShape(eager || await gui.getBlockly());
            return;
        }
        if (Date.now() >= deadline) throw new Error('The Editor block API did not become available.');
        await new Promise(resolve => win.setTimeout(resolve, 50));
    }
}
