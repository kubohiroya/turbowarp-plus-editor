import React from 'react';

export const WindowLayoutContext = React.createContext<{
    showUndock: boolean;
    plusLayout: boolean;
    locale: string;
    stageHidden?: boolean;
    setStageVisible?: (visible: boolean) => void;
    stageResize?: () => void;
    stageActionMount?: HTMLElement;
    targetsPinned?: boolean;
    setTargetsPinned?: React.Dispatch<React.SetStateAction<boolean>>;
}>({showUndock: false, plusLayout: false, locale: 'en'});

export const StageDisplayMenuContext = React.createContext(null);
