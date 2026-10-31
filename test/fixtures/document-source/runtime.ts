// Test-only composition of the four real packages; all default package flags stay off.
import {createSourceDocumentStore} from '@kubohiroya/turbowarp-document-data/source-documents';
import {getSourceDocumentRegistry, encodeSourceDocumentReference, decodeSourceDocumentReference} from '@kubohiroya/turbowarp-document-data/composition';
import {createExtension as createStructuredDataExtension} from '@kubohiroya/turbowarp-structured-data/bundle-module';
import {createEmbeddedDocumentProvider} from '@kubohiroya/turbowarp-embedded-yaml/document-views';
import {createEmbeddedYamlHatDefinition, createEmbeddedYamlDocumentMenu} from '@kubohiroya/turbowarp-embedded-yaml';

globalThis.STRUCTURED_DATA_MVP = true;
globalThis.STRUCTURED_DOCUMENT_SOURCE = true;
globalThis.NAMED_DATA_REGISTRY_MVP = true;
const id = 'kubohiroyadocumentdata';
const fixtureKey = Symbol.for('twpe.document-source.fixture');
class DocumentSourceFixture {
    store: ReturnType<typeof createSourceDocumentStore>;
    registry: ReturnType<typeof getSourceDocumentRegistry>;
    structured: any;
    projection: any;
    dispose: () => unknown;
    constructor() {
        const vm = Scratch.vm, registry = getSourceDocumentRegistry(vm);
        const store = createSourceDocumentStore(vm), provider = createEmbeddedDocumentProvider(vm, {enabled: true, companionURL: __TWPE_COMPANION_URL__});
        const unregister = registry.register(provider);
        this.store = store; this.registry = registry;
        this.structured = createStructuredDataExtension(Scratch);
        this.projection = this.structured.createSourceProjection(registry);
        const state = {store, registry, structured: this.structured, projection: this.projection};
        Object.defineProperty(vm.runtime, fixtureKey, {value: state, configurable: true});
        // Project replacement reuses cached extension instances; only explicit disposal is permanent.
        this.dispose = () => {unregister(); store.dispose(); if (vm.runtime[fixtureKey] === state) delete vm.runtime[fixtureKey]; return this.structured.dispose();};
    }
    getInfo() {
        return {id, name: 'Persistent source documents', color1: '#9a7037', blocks: [
            {...createEmbeddedYamlHatDefinition({BlockType: Scratch.BlockType, operation: 'sourceDocument', menuName: 'sourceDocuments', defaultReference: {providerId: 'document-data', documentId: 'yaml-settings'}}), text: 'embedded document [DOCUMENT]'},
            {opcode: 'projectSource', blockType: Scratch.BlockType.COMMAND, text: '文書 [DOCUMENT] を実行時データ [NAME] に読み込む', arguments: {
                DOCUMENT: {type: Scratch.ArgumentType.STRING, menu: 'sourceDocuments', defaultValue: encodeSourceDocumentReference({providerId: 'document-data', documentId: 'yaml-settings'})}, NAME: {type: Scratch.ArgumentType.STRING, defaultValue: 'settings'}}},
            {opcode: 'projectedJson', blockType: Scratch.BlockType.REPORTER, text: '実行時データ [NAME] のJSON', arguments: {NAME: {type: Scratch.ArgumentType.STRING, defaultValue: 'settings'}}}
        ], menus: {sourceDocuments: {...createEmbeddedYamlDocumentMenu(this.store.list().map(document => ({reference: {providerId: 'document-data', documentId: document.id}, filename: document.filename}))), items: 'sourceDocuments'}}};
    }
    sourceDocuments() {return this.store.list().map(document => ({text: document.filename, value: encodeSourceDocumentReference({providerId: 'document-data', documentId: document.id})}));}
    sourceDocument() {return false;}
    projectSource(args, util) {this.projection.project(util.target, Scratch.Cast.toString(args.NAME), decodeSourceDocumentReference(Scratch.Cast.toString(args.DOCUMENT)));}
    projectedJson(args, util) {return this.structured.toJson(args, util);}
}
Scratch.extensions.register(new DocumentSourceFixture());
