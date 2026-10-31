// A separate read-only ScratchBlocks workspace; it never registers an extension with the VM.
import {embeddedYamlRootHatShapeExtension, registerEmbeddedYamlRootHatShape} from '@kubohiroya/turbowarp-embedded-yaml';
let serial = 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const valueOf = field => Array.isArray(field) ? field[0] : record(field) ? field.value : field;
const fail = message => { throw new Error(message); };

function menuOptions(menu) {
    const items = Array.isArray(menu) ? menu : menu?.items;
    if (!Array.isArray(items) || !items.length) fail('Preview menus require static items.');
    return items.map(item => typeof item === 'string' ? [item, item] :
        record(item) && typeof item.text === 'string' && typeof item.value === 'string' ? [item.text, item.value] :
            fail('The preview menu has an unsupported item.'));
}

/** Convert declarative extension information only; no owner JavaScript is evaluated. */
export function compilePreviewDefinition(definition, alias, menus = {}) {
    if (!record(definition) || typeof definition.text !== 'string' && !Array.isArray(definition.text)) fail('A preview block declaration is required.');
    const lines = Array.isArray(definition.text) ? definition.text : [definition.text];
    const json: {type: string; inputsInline: boolean; category: string; colour: string; colourSecondary: string; colourTertiary: string; extensions?: string[]; [key: string]: any} = {type: alias, inputsInline: true, category: 'extension',
        colour: definition.color1 || definition.colour || '#5f68a8',
        colourSecondary: definition.color2 || '#505a94', colourTertiary: definition.color3 || '#404b7d'};
    let row = 0, branches = 0;
    for (const [lineIndex, line] of lines.entries()) {
        if (typeof line !== 'string') fail('Preview block labels must be strings.');
        const args = [];
        let message = line.replace(/\[([A-Za-z][A-Za-z0-9_]*)\]/gu, (_, name) => {
            const argument = definition.arguments?.[name];
            if (!record(argument)) fail(`The preview declaration is missing argument ${name}.`);
            if (String(argument.type).toLowerCase() === 'image') {
                args.push({type: 'field_image', src: argument.dataURI, width: 20, height: 20, alt: ''});
            } else if (argument.menu && menus[argument.menu]?.acceptReporters !== true) {
                args.push({type: 'field_dropdown', name, options: menuOptions(menus[argument.menu])});
            } else {
                args.push({type: 'input_value', name});
            }
            return `%${args.length}`;
        });
        if (lineIndex === 0 && typeof definition.blockIconURI === 'string') {
            message = message.replace(/%(\d+)/gu, (_, number) => `%${Number(number) + 1}`);
            args.unshift({type: 'field_image', src: definition.blockIconURI, width: 24, height: 24, alt: ''});
            message = `%1 ${message}`;
        }
        json[`message${row}`] = message;
        json[`args${row++}`] = args;
        if (branches < (definition.branchCount || 0)) {
            branches++;
            json[`message${row}`] = '%1';
            json[`args${row++}`] = [{type: 'input_statement', name: branches === 1 ? 'SUBSTACK' : `SUBSTACK${branches}`}];
        }
    }
    while (branches < (definition.branchCount || 0)) {
        if (branches >= 4) fail('The preview block has too many branches.');
        branches++;
        json[`message${row}`] = '%1';
        json[`args${row++}`] = [{type: 'input_statement', name: branches === 1 ? 'SUBSTACK' : `SUBSTACK${branches}`}];
    }
    const kind = String(definition.blockType || 'command').toLowerCase();
    json.extensions = [kind === 'hat' || kind === 'event' ? 'shape_hat' :
        kind === 'reporter' ? 'output_string' : kind === 'boolean' ? 'output_boolean' :
            definition.isTerminal ? 'shape_end' : 'shape_statement', 'scratch_extension'];
    if ((kind === 'hat' || kind === 'event') && definition.extensions?.includes(embeddedYamlRootHatShapeExtension)) {
        json.extensions.push(embeddedYamlRootHatShapeExtension);
    }
    return json;
}

/** Render a provider's plain block graph without changing the live workspace or VM. */
export async function renderBlockPreview({container, model, getScratch, vm, signal}) {
    if (!container?.ownerDocument || !record(model?.blocks) || !Array.isArray(model.rootIds) || !model.rootIds.length) fail('The owner did not provide a block preview graph.');
    const cancelled = () => {
        if (signal?.aborted) {
            const error = new Error('The obsolete block preview was cancelled.');
            error.name = 'AbortError';
            throw error;
        }
    };
    cancelled();
    const entries = Object.entries<any>(model.blocks);
    if (entries.length > 4000 || model.rootIds.length > 128) fail('The document is too large for a block preview.');
    const Scratch = await (typeof getScratch === 'function' ? getScratch() : container.ownerDocument.defaultView.Scratch);
    cancelled();
    if (typeof Scratch?.gui?.getBlockly !== 'function') fail('The Editor does not provide ScratchBlocks.');
    const B = await Scratch.gui.getBlockly();
    cancelled();
    registerEmbeddedYamlRootHatShape(B);
    const main = B.getMainWorkspace();
    if (!main) fail('The Editor workspace is unavailable.');
    const doc = container.ownerDocument, win = doc.defaultView;
    const number = ++serial, prefix = `twpe_preview_${number}_`;
    const surface = doc.createElement('div');
    surface.className = 'twpe-yaml-block-surface';
    surface.style.cssText = 'position:relative;width:100%;height:100%;min-width:180px;background:white;';
    surface.dataset.twpeBlockPreview = String(number);
    const summary = doc.createElement('pre');
    summary.className = 'twpe-yaml-preview-accessible';
    summary.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:pre;';
    summary.id = `${prefix}source`;
    summary.textContent = typeof model.source === 'string' ? model.source : '';
    surface.setAttribute('aria-describedby', summary.id);
    container.replaceChildren(surface, summary);
    const aliases = new Map(), registered = [], made = [], visited = new Set(), visiting = new Set();
    const declarations = new Map((model.blockDefinitions || []).map(item => [item.opcode, item]));
    let workspace, observer, disposed = false;
    const restoreMain = () => {const active = B.getMainWorkspace();if (!active || active === workspace) B.mainWorkspace = main;};
    const cleanup = () => {
        if (disposed) return;
        disposed = true;
        observer?.disconnect();
        B.Events.disable();
        try { workspace?.dispose(); } finally {
            restoreMain();
            for (const alias of registered) delete B.Blocks[alias];
            B.Events.enable();
        }
        surface.remove(); summary.remove();
    };
    let steps = 0;
    const yieldToEditor = async () => {
        B.Events.enable();
        try {
            restoreMain();
            await new Promise(resolve => win.setTimeout(resolve, 0));
            cancelled();
        } finally { B.Events.disable(); }
    };
    B.Events.disable();
    try {
        cancelled();
        // inject normally changes Blockly.mainWorkspace; the Editor keeps ownership throughout.
        workspace = B.inject(surface, {readOnly: true, scrollbars: true, sounds: false, trashcan: false,
            media: main.options?.pathToMedia, RTL: Boolean(main.RTL),
            zoom: {controls: true, wheel: true, startScale: 0.85, minScale: 0.25, maxScale: 1.5}});
        restoreMain();
        surface.dataset.workspaceId = workspace.id;
        workspace.markFocused = restoreMain;
        for (const [id, data] of entries) {
            if (++steps % 25 === 0) await yieldToEditor();
            if (!record(data) || typeof data.opcode !== 'string') fail(`Invalid preview block ${id}.`);
            let type = data.opcode;
            if (declarations.has(type) || !B.Blocks[type]) {
                if (!aliases.has(type)) {
                    const declaration = declarations.get(type);
                    if (!declaration) fail(`No declaration is available to preview ${type}.`);
                    const alias = `${prefix}definition_${aliases.size}`;
                    const json = compilePreviewDefinition(declaration, alias, model.menus || {});
                    B.defineBlocksWithJsonArray([json]);
                    registered.push(alias); aliases.set(type, alias);
                }
                type = aliases.get(type);
            }
            const block = workspace.newBlock(type, `${prefix}${id}`);
            block.setDeletable(false); block.setMovable(false); block.setEditable(false);
            block.data = data.opcode;
            made.push([id, block, data]);
        }
        const byId = new Map(made.map(([id, block]) => [id, block]));
        function setFields(block, fields) {
            for (const [name, data] of Object.entries<any>(fields || {})) {
                const field = block.getField(name);
                if (!field) fail(`The preview block has no field ${name}.`);
                const value = String(valueOf(data) ?? '');
                block.setFieldValue(value, name);
                if (String(field.getValue()) !== value && !(name === 'NUM' && Number(field.getValue()) === Number(value))) fail(`The preview cannot preserve field ${name}.`);
            }
        }
        function mutationNode(value) {
            if (!record(value)) fail('Invalid preview mutation.');
            const tag = value.tagName || 'mutation';
            if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(tag)) fail('Invalid preview mutation name.');
            const node = doc.createElement(tag);
            for (const [name, attribute] of Object.entries<any>(value)) {
                if (name === 'tagName' || name === 'children') continue;
                if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(name) || !['string','number','boolean'].includes(typeof attribute)) fail('Invalid preview mutation attribute.');
                node.setAttribute(name, String(attribute));
            }
            for (const child of value.children || []) node.appendChild(mutationNode(child));
            return node;
        }
        for (const [, block, data] of made) {
            if (++steps % 25 === 0) await yieldToEditor();
            if (data.mutation && typeof block.domToMutation === 'function') block.domToMutation(mutationNode(data.mutation));
            setFields(block, data.fields);
            if (data.shadow) block.setShadow(true);
            block.initSvg();
        }
        function literal(value) {
            if (!Array.isArray(value)) fail('Invalid preview literal.');
            const type = value[0];
            const numeric = [4, 5, 6, 7, 8].includes(type);
            if (!numeric && type !== 10 && type !== 9) fail('The preview contains an unsupported literal.');
            const block = workspace.newBlock(numeric ? 'math_number' : type === 9 ? 'colour_picker' : 'text');
            block.setFieldValue(String(value[1] ?? ''), numeric ? 'NUM' : type === 9 ? 'COLOUR' : 'TEXT');
            block.setShadow(true); block.setEditable(false); block.setMovable(false); block.setDeletable(false); block.initSvg(); block.render();
            return block;
        }
        function edge(input) {
            const value = Array.isArray(input) ? input[1] ?? input[2] : record(input) ? input.block || input.shadow : null;
            if (value === null || value === undefined) return null;
            if (typeof value === 'string') return value;
            if (Array.isArray(value)) return value;
            fail('Invalid preview input connection.');
        }
        async function connect(id) {
            if (++steps % 25 === 0) await yieldToEditor();
            if (visiting.has(id) || visited.has(id)) fail('The preview graph is cyclic or shared.');
            const data = model.blocks[id], block = byId.get(id);
            if (!block || !record(data)) fail('A referenced preview block is missing.');
            visiting.add(id);
            for (const [name, input] of Object.entries<any>(data.inputs || {})) {
                const target = edge(input);
                if (target === null) continue;
                const slot = block.getInput(name);
                if (!slot?.connection) fail(`The preview block has no input ${name}.`);
                const child = typeof target === 'string' ? await connect(target) : literal(target);
                const connection = slot.type === B.NEXT_STATEMENT ? child.previousConnection : child.outputConnection;
                if (!connection) fail(`The preview cannot connect input ${name}.`);
                slot.connection.connect(connection);
            }
            if (typeof data.next === 'string') {
                const next = await connect(data.next);
                if (!block.nextConnection || !next.previousConnection) fail('Invalid preview statement connection.');
                block.nextConnection.connect(next.previousConnection);
            }
            visiting.delete(id); visited.add(id);
            block.render();
            return block;
        }
        let y = 28;
        for (const id of model.rootIds) {
            const block = await connect(id), xy = block.getRelativeToSurfaceXY();
            block.moveBy(28 - xy.x, y - xy.y);
            y += block.getHeightWidth().height + 40;
        }
        for (const [id, block, data] of made) if (!visited.has(id)) {if (!data.shadow) fail('The preview contains unreachable blocks.');block.dispose(false);}
        B.svgResize(workspace);
        const bounds = workspace.getBlocksBoundingBox();
        const width = surface.clientWidth || 800;
        workspace.setScale(Math.max(0.4, Math.min(1, (width - 64) / Math.max(1, bounds.width))));
        const metrics = workspace.getMetrics();
        workspace.scrollbar?.set(bounds.x * workspace.scale - metrics.contentLeft - 24, bounds.y * workspace.scale - metrics.contentTop - 24);
        restoreMain();
    } catch (cause) {
        cleanup();
        throw cause;
    } finally { restoreMain(); B.Events.enable(); }
    if (typeof win.ResizeObserver === 'function') {
        observer = new win.ResizeObserver(() => {if (!disposed) {B.svgResize(workspace); restoreMain();}});
        observer.observe(surface);
    }
    return Object.freeze({dispose: cleanup});
}
