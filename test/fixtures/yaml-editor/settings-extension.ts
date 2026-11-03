// Test-only owner: two same-named YAML files, no App code or storage. A project may add a third,
// `locked`, which the owner lists but refuses to open, so the refusal can be checked through the
// built Editor. The owner also marks its source locations editable, so the Editor offers the
// source controls for its documents.
import {createEmbeddedYamlHatDefinition, createEmbeddedYamlDocumentMenu, getDocumentSourceRegistry} from '@kubohiroya/turbowarp-document-data/document-source';
import YAML from 'yaml';
import {Ajv2020} from 'ajv/dist/2020.js';

const id = 'twpeyamlsettings';
const schemas = {
    settings: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['volume'], additionalProperties: false,
        properties: {volume: {type: 'integer', minimum: 0, maximum: 100}, mode: {enum: ['rehearsal', 'production']}}},
    labels: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['title'], additionalProperties: false,
        properties: {title: {type: 'string'}}},
    locked: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object'}
};
const refusals = {locked: 'The settings owner keeps this document locked.'};
const validators = Object.fromEntries(Object.entries<any>(schemas).map(([key, schema]) => [key, new Ajv2020().compile(schema)]));
const ref = documentId => ({providerId: id, documentId});
class SettingsExtension {
    provider: any;
    constructor() {
        const vm = Scratch.vm, runtime = vm.runtime;
        let generation = 0, ended = false;
        const adapters = new Set<{dispose(): void}>();
        const documents = () => runtime.extensionStorage[id]?.documents || {};
        const checkId = documentId => { if (!Object.hasOwn(schemas, documentId) || typeof documents()[documentId] !== 'string') throw new Error('Unknown settings document.'); };
        const provider = {
            id, hatOpcodes: [`${id}_embeddedYaml`],
            list: () => Object.keys(schemas).filter(key => typeof documents()[key] === 'string').map(documentId => ({
                documentId, filename: 'settings.yml', schema: {id: `urn:twpe:settings:${documentId}`, schema: schemas[documentId]}
            })),
            open(documentId) {
                checkId(documentId);
                const snapshots = new WeakMap(), preparedValues = new WeakMap(); let disposed = false;
                const current = () => { if (ended || disposed) throw new Error('The document is closed.'); checkId(documentId); return documents()[documentId]; };
                const baseline = snapshot => {
                    const saved = snapshots.get(snapshot);
                    if (!saved || saved.generation !== generation || saved.source !== current() || saved.project !== vm.toJSON(undefined, {allowOptimization: false})) throw new Error('The project changed.');
                };
                const adapter = {
                    inspect() {
                        if (Object.hasOwn(refusals, documentId)) return {available: false, reason: refusals[documentId]};
                        try { current(); return {available: true}; } catch (error) { return {available: false, reason: error.message}; }
                    },
                    capture() {
                        if (Object.hasOwn(refusals, documentId)) throw new Error(refusals[documentId]);
                        const snapshot = Object.freeze({source: current(), sourceName: 'settings.yml'});
                        snapshots.set(snapshot, {source: snapshot.source, generation, project: vm.toJSON(undefined, {allowOptimization: false})});
                        return snapshot;
                    },
                    async prepare(snapshot, source) {
                        baseline(snapshot); const parsed = YAML.parse(source);
                        if (!validators[documentId](parsed)) throw new Error('JSON Schema validation failed for this document.');
                        const prepared = Object.freeze({source}); preparedValues.set(prepared, snapshot); return prepared;
                    },
                    async commit(snapshot, prepared) {
                        baseline(snapshot);
                        if (preparedValues.get(prepared) !== snapshot) throw new Error('Unknown prepared edit.');
                        documents()[documentId] = prepared.source; snapshots.delete(snapshot); preparedValues.delete(prepared);
                        runtime.emitProjectChanged(); return {source: prepared.source};
                    },
                    dispose() { disposed = true; adapters.delete(adapter); }
                };
                adapters.add(adapter); return adapter;
            },
            dispose() { ended = true; for (const adapter of [...adapters]) adapter.dispose(); runtime.off('PROJECT_LOADED', loaded); }
        };
        const loaded = () => { generation++; };
        runtime.on('PROJECT_LOADED', loaded);
        const check = (documentId, source) => {
            checkId(documentId);
            if (Object.hasOwn(refusals, documentId)) throw new Error(refusals[documentId]);
            if (!validators[documentId](YAML.parse(source))) throw new Error('JSON Schema validation failed for this document.');
        };
        const unregister = getDocumentSourceRegistry(vm).register(provider, {sourceStorageId: id, fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
            buildSourceCandidate({project, reference, source}) {
                check(reference.documentId, source);
                project.extensionStorage[id].documents[reference.documentId] = source;
                return {project, source};
            }});
        runtime.once('RUNTIME_DISPOSED', unregister);
        this.provider = provider;
    }
    getInfo() {
        return {id, name: 'YAML settings example', color1: '#4c97ff', blocks: [createEmbeddedYamlHatDefinition({BlockType: Scratch.BlockType, defaultReference: ref('settings')})],
            menus: {embeddedYamlDocuments: createEmbeddedYamlDocumentMenu(Object.keys(schemas).map(documentId => ({reference: ref(documentId), filename: 'settings.yml'})))}};
    }
    embeddedYaml() { return false; }
}
Scratch.extensions.register(new SettingsExtension());
