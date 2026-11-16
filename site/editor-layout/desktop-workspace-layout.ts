import {createWorkspaceLayoutStore, type WorkspaceLayoutStore} from '@kubohiroya/turbowarp-plus-editor-workbench/sprite-tabs';

interface DesktopWorkspaceLayoutRecord {
    layout: string;
    savedAt?: number;
}

export interface DesktopWorkspaceLayouts {
    read(key: string): Promise<string | null>;
    /** The layout with when it last changed. Desktop versions before it kept the time do not have it. */
    readRecord?(key: string): Promise<DesktopWorkspaceLayoutRecord | null>;
    /** Desktop returns when the layout last changed, or `true` when it does not know. */
    write(key: string, layout: string): Promise<boolean | number>;
}

const validTime = (time: unknown) => typeof time === 'number' && Number.isSafeInteger(time) && time > 0 ?
    time : undefined;

export function connectDesktopWorkspaceLayouts(port: DesktopWorkspaceLayouts): WorkspaceLayoutStore {
    const local = createWorkspaceLayoutStore();
    return {
        ...local,
        async open(identity, signature) {
            if (identity.kind !== 'desktop') return local.open(identity, signature);
            const record: DesktopWorkspaceLayoutRecord | null = port.readRecord ?
                await port.readRecord(identity.key) :
                await port.read(identity.key).then(layout => layout === null ? null : {layout});
            const layout = record?.layout;
            let savedAt = validTime(record?.savedAt);
            let saved = layout !== undefined;
            let writes = 0;
            return {
                layout,
                exact: saved,
                get saved() { return saved || writes > 0; },
                get savedAt() { return savedAt; },
                async write(next) {
                    writes++;
                    try {
                        const result = await port.write(identity.key, next);
                        if (result) saved = true;
                        savedAt = validTime(result) ?? savedAt;
                    } finally {
                        writes--;
                    }
                }
            };
        }
    };
}
