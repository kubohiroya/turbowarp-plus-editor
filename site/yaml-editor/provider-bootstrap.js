import {getSourceDocumentRegistry} from '@kubohiroya/turbowarp-document-data/composition';
import {readReference, getDocumentSourceRegistry} from '@kubohiroya/turbowarp-document-source';

// Both APIs use one owner registry; source locations are enabled only at startup.
export function getYamlEditorProviders(vm, {documentSources = false} = {}) {
    return Object.freeze({registry: documentSources ? getDocumentSourceRegistry(vm) : getSourceDocumentRegistry(vm), readReference});
}
