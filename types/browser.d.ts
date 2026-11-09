type PlusPopupWindowMode = 'normal' | 'minimized' | 'maximized';
type PlusPopupWindowAction = 'maximize' | 'minimize' | 'restore';

interface PlusPopupWindowControls {
    onMode(listener: (mode: PlusPopupWindowMode) => void): () => void;
    mode(): Promise<PlusPopupWindowMode>;
    change(action: PlusPopupWindowAction): Promise<PlusPopupWindowMode>;
}

// TurboWarp exposes these host objects at runtime; their implementations live upstream.
interface Window {
    vm: any;
    Scratch: any;
    ScratchBlocks: any;
    ReduxStore: any;
    TurboWarpPlusExtensionHost: any;
    TwPlusWindowControls?: PlusPopupWindowControls;
}


// Modules supplied by webpack or by the pinned GUI at runtime.
declare module '*.css' {
    const classes: Readonly<Record<string, string>>;
    export default classes;
}
declare module '*.svg' {
    const url: string;
    export default url;
}
declare module '@tw-plus/gui-stage-fullscreen-icon' {
    const url: string;
    export default url;
}
declare module '@tw-plus/gui-block-category-artwork' {
    export const resources: Readonly<Record<string, string>>;
}
declare module '@tw-plus/upstream-addon-manifests';
declare module '@tw-plus/backpack-window-host' {
    export function openBackpackWindow(url: URL, ticket: string): Window | null;
    export const detachBackpackOpener: boolean;
    export function getBackpackOpenLabel(locale: string): string | undefined;
}
declare module 'scratch-vm';
declare module 'scratch-vm/src/*';
declare module 'scratch-blocks';
declare module 'react-intl';
declare module 'react-redux';
declare module 'lodash.bindall';
declare module '@turbowarp/packager-web';

declare const EditorPreload: unknown;
declare const __TW_PLUS_LOCAL_CATALOG__: unknown;
declare const __TW_GUI_ADDON_MESSAGES__: Readonly<Record<string, string>>;
declare const __TW_PLUS_FILE_UPLOADER__: unknown;
declare const __TW_PLUS_PACKAGER_ASSETS__: Record<string, string>;
declare const __TW_PLUS_EXTENSION_RUNTIME__: string;
