import React from 'react';
import styles from '@kubohiroya/turbowarp-plus-editor-workbench/editor.css';
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
/** The class that keeps a stage launcher mount out of the menu bar's own layout. */
export const stageLauncherSlotClass: string = styles.stageLauncherSlot;

const stageLauncherSlots = new WeakMap<object, HTMLDivElement>();

/**
 * The element the stage launcher is mounted in, kept for the life of one VM.
 *
 * The menu bar aligns and shrinks its own items, so the slot carries the Layout package's class
 * that takes it out of layout: the launcher inside it is then the row's item, not this wrapper.
 * `stageLauncherSlotClass` does the same for the element the slot is appended to.
 * @param {object} vm The VM the launcher belongs to.
 * @returns {HTMLDivElement} The slot.
 */
export function stageLauncherSlot(vm: object) {
    let slot = stageLauncherSlots.get(vm);
    if (!slot) {
        slot = document.createElement('div');
        slot.className = stageLauncherSlotClass;
        stageLauncherSlots.set(vm, slot);
    }
    return slot;
}


export const TargetSwitchContext = React.createContext<ReturnType<typeof createTargetSwitchFeedback> | null>(null);
