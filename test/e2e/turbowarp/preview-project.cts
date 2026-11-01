const JSZip = require('@turbowarp/jszip');
const {createHash} = require('node:crypto');

// Generic test-only extension for the host preview API. It owns no product DSL or runtime.
const register = Scratch => {
    const id = 'previewfixture';
    const canonical = {repository: 'turbowarp-plus-editor', path: 'test/e2e/turbowarp/preview-project.cts'};
    const schema = argument => ({
        identity: {ownerId: id, contractId: 'preview-fixture.controls', revision: '1', variantId: argument}, dialect: 'draft-07',
        root: {retrievalUri: `https://fixture.invalid/${argument}`, document: {type: 'number', minimum: 0, maximum: 100},
            artifact: {role: 'canonical-schema', source: canonical}}, resources: [],
        provenance: {canonicalSources: [canonical], generatedFiles: [], referenceSchemas: [], generationSources: []}
    });
    const api = Scratch.gui && Scratch.gui.blockEditors;
    const state = globalThis.__previewFixture = {
        capabilities: {preview: Boolean(api && typeof api.registerPreview === 'function'),
            fixed: Boolean(api && typeof api.registerFixedInputEditor === 'function'),
            isolatedVm: Boolean(Scratch.gui && typeof Scratch.gui.createPreviewVm === 'function')},
        hovers: 0, hoverReleases: 0, mounts: 0, unmounts: 0, quits: 0, previewVms: []
    };
    if (state.capabilities.fixed) api.registerFixedInputEditor({
        apiVersion: 1, extensionId: id, editorId: 'controls', opcodes: [`${id}_place`, `${id}_plain`],
        contractId: 'preview-fixture.controls', contractRevision: '1', readOnlyArguments: [], dependencies: [], branchPolicies: [],
        bindings: [{argument: 'NUMBER', schemaBundle: schema('NUMBER'), control: {kind: 'number'},
            read: Number, encode: value => String(value), validateCandidate: () => []}],
        validationContext: () => ({consumerId: id, nowMs: 0, settings: null})
    });
    // Only the place block has a preview; the plain block keeps the existing form alone.
    if (state.capabilities.preview) api.registerPreview({
        extensionId: id, opcodes: [`${id}_place`],
        mount (container, context) {
            state.mounts++;
            const preview = Scratch.gui.createPreviewVm();
            state.previewVms.push(preview);
            const document = container.ownerDocument;
            const value = document.createElement('output');
            value.dataset.previewFixtureValue = '';
            const add = document.createElement('button');
            add.type = 'button';
            add.textContent = 'Add 5';
            add.addEventListener('click', () => {
                const draft = context.getDraft();
                context.setDraft({...draft, inputs: {...draft.inputs,
                    NUMBER: {value: Number(draft.inputs.NUMBER.value) + 5, changed: true}}});
            });
            const render = () => { value.textContent = String(context.getDraft().inputs.NUMBER.value); };
            container.append(value, add);
            render();
            const stop = context.subscribe(render);
            return () => {
                stop();
                value.remove();
                add.remove();
                preview.quit();
                state.quits++;
                state.unmounts++;
            };
        },
        hover (anchor, snapshot) {
            state.hovers++;
            const tip = anchor.ownerDocument.createElement('div');
            tip.dataset.previewFixtureHover = '';
            tip.textContent = `NUMBER ${snapshot.arguments.NUMBER.value}`;
            anchor.ownerDocument.body.append(tip);
            return () => {
                tip.remove();
                state.hoverReleases++;
            };
        }
    });
    const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="white" d="M5 5h30v30H5z"/></svg>')}`;
    Scratch.extensions.register(new class {
        getInfo () {
            return {id, name: 'Preview fixture', color1: '#6b49a8', blockIconURI: icon,
                blocks: [{opcode: 'place', blockType: Scratch.BlockType.COMMAND, text: 'place at [NUMBER]',
                    arguments: {NUMBER: {type: Scratch.ArgumentType.NUMBER, defaultValue: 10}}},
                {opcode: 'plain', blockType: Scratch.BlockType.COMMAND, text: 'plain [NUMBER]',
                    arguments: {NUMBER: {type: Scratch.ArgumentType.NUMBER, defaultValue: 10}}}]};
        }
        place () {}
        plain () {}
    }());
};
const source = `(${register.toString()})(Scratch);`;
const command = (opcode, shadow, y) => ({opcode: `previewfixture_${opcode}`, next: null, parent: null, topLevel: true, shadow: false,
    x: 40, y, fields: {}, inputs: {NUMBER: [1, shadow]}});
const number = parent => ({opcode: 'math_number', next: null, parent, topLevel: false, shadow: true, fields: {NUM: ['10', null]}, inputs: {}});
const project = async () => {
    const backdrop = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"></svg>';
    const assetId = createHash('md5').update(backdrop).digest('hex');
    const data = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, comments: {},
        blocks: {'preview-root': command('place', 'preview-number', 40), 'preview-number': number('preview-root'),
            'plain-root': command('plain', 'plain-number', 140), 'plain-number': number('plain-root')},
        currentCostume: 0, costumes: [{name: 'Blank', assetId, dataFormat: 'svg', md5ext: `${assetId}.svg`, rotationCenterX: 240, rotationCenterY: 180}],
        sounds: [], volume: 100, tempo: 60, videoTransparency: 50, videoState: 'off', textToSpeechLanguage: null}], monitors: [],
        extensions: ['previewfixture'], extensionURLs: {previewfixture: `data:text/javascript,${encodeURIComponent(source)}`},
        meta: {semver: '3.0.0', vm: '0.2.0', agent: 'block-preview-common-test-fixture'}};
    const zip = new JSZip();zip.file('project.json', JSON.stringify(data));zip.file(`${assetId}.svg`, backdrop);
    return `data:application/octet-stream;base64,${await zip.generateAsync({type: 'base64', compression: 'DEFLATE'})}`;
};
module.exports = {source, project};
