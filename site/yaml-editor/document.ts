import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';

// The document owner supplies validation and commits; the Editor only selects its reference.
export function createEmbeddedYamlDocument(vm, reference, registry = getSourceDocumentRegistry(vm)) {
    return registry.open(reference);
}
