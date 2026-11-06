// ScratchBlocks normally coalesces variables by name and type. The VM's
// projection can contain two scalars with the same name and different scopes.
export function installScopedScalarReferences(blocks, workspace, getLocale: () => string) {
    const map = workspace.getVariableMap();
    const createVariable = map.createVariable;
    const getVariable = map.getVariable;
    map.createVariable = function (name, type, id, isLocal, isCloud) {
        const existing = id && type === '' && typeof isLocal === 'boolean' && getVariable.call(this, name, type);
        if (!existing) return createVariable.call(this, name, type, id, isLocal, isCloud);

        const byId = this.getVariableById(id);
        if (byId) return byId;
        // Preserve the normal model creation and events, but match the name
        // only within the incoming scope for this synchronous insertion.
        const sameScope = this.getVariablesOfType(type)
            .find(variable => variable.name === name && variable.isLocal === isLocal);
        this.getVariable = () => sameScope;
        try {
            return createVariable.call(this, name, type, id, isLocal, isCloud);
        } finally {
            this.getVariable = getVariable;
        }
    };

    const scalars = () => workspace.getVariablesOfType('');
    const scopedLabel = (variable, variables) => {
        if (!variables.some(other => other.name === variable.name && other.isLocal !== variable.isLocal)) {
            return variable.name;
        }
        const ja = /^ja(?:-|$)/i.test(getLocale());
        const scope = variable.isLocal ? (ja ? 'このスプライト' : 'Local') : (ja ? '全体' : 'Global');
        return `${scope}: ${variable.name}`;
    };
    const inWorkspace = field => field.sourceBlock_?.workspace === workspace;
    for (const field of [blocks.FieldVariable.prototype, blocks.FieldVariableGetter.prototype]) {
        const setText = field.setText;
        field.setText = function (text) {
            const variable = this.getVariable();
            const label = inWorkspace(this) && variable?.type === '' && text === variable.name ?
                scopedLabel(variable, scalars()) : text;
            return setText.call(this, label);
        };
    }

    const getOptions = blocks.FieldVariable.prototype.getOptions;
    blocks.FieldVariable.prototype.getOptions = function () {
        const options = getOptions.call(this);
        if (!inWorkspace(this) || this.getVariable()?.type !== '') return options;
        const variables = scalars();
        const byId = new Map(variables.map(variable => [variable.getId(), variable]));
        return options.map(option => {
            const variable = byId.get(option[1]);
            return variable ? [scopedLabel(variable, variables), option[1]] : option;
        });
    };

    const reporter = blocks.Blocks.data_variable;
    const init = reporter.init;
    reporter.init = function () {
        init.call(this);
        if (this.workspace !== workspace || this.isInFlyout) return;
        this.customContextMenu = options => {
            if (this.isCollapsed()) return;
            const field = this.getField('VARIABLE');
            const variables = scalars();
            for (const variable of variables.sort((a, b) => a.name.localeCompare(b.name))) {
                const id = variable.getId();
                if (id !== field.getValue()) {
                    options.push({text: scopedLabel(variable, variables), enabled: true, callback: () => field.setValue(id)});
                }
            }
        };
    };
}
