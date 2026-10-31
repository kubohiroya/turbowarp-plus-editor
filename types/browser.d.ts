// TurboWarp exposes these host objects at runtime; their implementations live upstream.
interface Window {
    vm: any;
    Scratch: any;
    ScratchBlocks: any;
    ReduxStore: any;
    TurboWarpPlusExtensionHost: any;
}
