import React from 'react';
import type {createTargetSwitchFeedback} from '@kubohiroya/turbowarp-plus-editor-ui/busy-cursor';

export const WindowLayoutContext = React.createContext<{
    showUndock: boolean;
    plusLayout: boolean;
    locale: string;
    stageHidden?: boolean;
    stageDrawer?: boolean;
    setStageDrawerOpen?: (open: boolean) => void;
    setStageVisible?: (visible: boolean) => void;
    stageResize?: () => void;
    stageActionMount?: HTMLElement;
    targetsPinned?: boolean;
    setTargetsPinned?: React.Dispatch<React.SetStateAction<boolean>>;
}>({showUndock: false, plusLayout: false, locale: 'en'});

export const StageDisplayMenuContext = React.createContext(null);
const stageLauncherSlots = new WeakMap<object, HTMLDivElement>();

export function stageLauncherSlot(vm: object) {
    let slot = stageLauncherSlots.get(vm);
    if (!slot) {
        slot = document.createElement('div');
        stageLauncherSlots.set(vm, slot);
    }
    return slot;
}

export const TargetSwitchContext = React.createContext<ReturnType<typeof createTargetSwitchFeedback> | null>(null);
