import {hostBlockEditor, hostIntegration} from './tw-plus-integration-points.js';

const services = new WeakMap();
const presentation = new WeakMap();

// Keep one service per VM while allowing it to read the current GUI locale.
const getBlockEditorService = (vm, intl, integration = hostIntegration()) => {
    if (intl) presentation.set(vm, intl);
    const editor = hostBlockEditor(integration);
    if (!editor) return null;
    if (!services.has(vm)) {
        services.set(vm, editor.createService({getIntl: () => presentation.get(vm)}));
    }
    return services.get(vm);
};

export default getBlockEditorService;
