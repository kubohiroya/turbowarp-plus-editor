import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import {createHorizontalBlockPalette} from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette';
import styles from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette.css';
import './palette.css';

import {getPaletteExtensionLibraryAction} from '../gui-integration/lib/tw-plus-integration-points.ts';

export const {connectPaletteVisibility, setHorizontalBlockPalette, openDetachedBlockPalette, installHorizontalBlockPalette} =
    createHorizontalBlockPalette({getScratchBlocks: () => window.ScratchBlocks, styles,
        showPaletteMenu: true,
        openExtensionLibrary: document => {
            const open = getPaletteExtensionLibraryAction();
            if (open) open();
            else document.querySelector<HTMLElement>(
                '[data-code-extension-button] button, [class*="gui_extension-button-container_"] button')?.click();
        }
    });
