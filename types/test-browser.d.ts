// Browser fixture state and globals supplied by the test harness.
interface Window {
    TurboWarpPlusLoader: any;
    __blockPreviewVms: any;
    fixture: any;
    fixtureReady: any;
    linePoint: any;
    oldPreparation: any;
    replaceProject: any;
    shapeFixture: any;
    showOpenFilePicker: any;
    showSaveFilePicker: any;
    ui: any;
}
declare var Scratch: any;
declare var __TWPE_COMPANION_URL__: any;
declare var vm: any;

interface DragEvidence {
    trusted: boolean;
    mime: string[];
}
interface MonitorEvidence {
    name: string;
    trusted: boolean;
    target?: string;
    belongsToChildRealm: boolean;
}
interface StagePopoutEvidence {
    vm: object;
    loop: {running: boolean};
    renderer: object;
    canvas: HTMLCanvasElement;
    lost: number;
    input: {device: string; data: {isDown?: boolean}}[];
    frames: number;
    monitorEvents?: MonitorEvidence[];
}
interface Window {
    layoutReads: number;
    layoutWorkspace: object;
    layoutCanvas: Element | null;
    initialStagePanel: Element;
    initialStageCanvas: Element | null;
    initialStageControls: Element | null;
    stageControlCalls: string[];
    originalSpriteNameInput: Element;
    originalBackdropTile: Element;
    originalStageCanvas: Element;
    savedPanelNode: Element;
    stage5SpriteX: Element;
    stage5DesktopCanvas: Element;
    stage5Canvas: Element;
    stage5Renderer: object;
    stage5Runs: number;
    stage3Cancelled: boolean;
    stage3FinishCancelledRead: () => void;
    stage3Reading: boolean;
    stage3Release: () => void;
    stage3Drop: DragEvidence;
    stage4Drops: DragEvidence[];
    stage6Snapshot: Blob;
    stage6Receipts: (import('@kubohiroya/turbowarp-script-transfer').BlockImportReceipt | null)[];
    stage6Drop: {trusted: boolean; editingTarget: string} | null;
    stage6ReleaseDrop: () => void;
    nativeEvidence: (DragEvidence & {type: string; label?: string})[];
    nativeBackpackRead: () => void;
    everEditable: boolean;
    stage155: StagePopoutEvidence;
    EditorPreload?: {getInitialFile(): unknown};
}
declare var stage155: StagePopoutEvidence;
declare var TwPlusWindowControls: PlusPopupWindowControls;

interface Screen {
    // Chromium exposes these offsets for screens to the left of or above the primary display.
    availLeft: number;
    availTop: number;
}
