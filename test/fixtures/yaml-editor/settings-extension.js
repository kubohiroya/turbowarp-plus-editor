// Test-only owner: two same-named YAML files, no Kamishibai code or storage.
import {createEmbeddedYamlHatDefinition, createEmbeddedYamlDocumentMenu, getProviderRegistry} from '@kubohiroya/turbowarp-embedded-yaml';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';

const id = 'twpeyamlsettings';
const schemas = {
    settings: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['volume'], additionalProperties: false,
        properties: {volume: {type: 'integer', minimum: 0, maximum: 100}, mode: {enum: ['rehearsal', 'production']}}},
    labels: {$schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', required: ['title'], additionalProperties: false,
        properties: {title: {type: 'string'}}}
};
const validators = Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [key, new Ajv2020().compile(schema)]));
const ref = documentId => ({providerId: id, documentId});
class SettingsExtension {
    constructor() {
        const vm = Scratch.vm, runtime = vm.runtime;
        let generation = 0, ended = false;
        const adapters = new Set();
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
                    inspect() { try { current(); return {available: true}; } catch (error) { return {available: false, reason: error.message}; } },
                    capture() {
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
        const unregister = getProviderRegistry(vm).register(provider);
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
