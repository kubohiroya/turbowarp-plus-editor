import {createWorkspaceLayoutStore, type WorkspaceLayoutStore} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';

export interface DesktopWorkspaceLayouts {
    read(key: string): Promise<string | null>;
    write(key: string, layout: string): Promise<boolean>;
}

export function connectDesktopWorkspaceLayouts(port: DesktopWorkspaceLayouts): WorkspaceLayoutStore {
    const local = createWorkspaceLayoutStore();
    return {
        ...local,
        async open(identity, signature) {
            if (identity.kind !== 'desktop') return local.open(identity, signature);
            const layout = (await port.read(identity.key)) ?? undefined;
            let saved = layout !== undefined;
            let writes = 0;
            return {
                layout,
                exact: saved,
                get saved() { return saved || writes > 0; },
                async write(next) {
                    writes++;
                    try {
                        if (await port.write(identity.key, next)) saved = true;
                    } finally {
                        writes--;
                    }
                }
            };
        }
    };
}
