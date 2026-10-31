import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {readReference} from '@kubohiroya/turbowarp-embedded-yaml';

// Runtime owners register themselves into the shared VM registry, including across bundles.
export function getYamlEditorProviders(vm) {
    return Object.freeze({registry: getSourceDocumentRegistry(vm), readReference});
}
