import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import {createHorizontalBlockPalette} from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette';
import styles from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette.css';
import './palette.css';

export const {connectPaletteVisibility, setHorizontalBlockPalette, openDetachedBlockPalette, installHorizontalBlockPalette} =
    createHorizontalBlockPalette({getScratchBlocks: () => window.ScratchBlocks, styles,
        openExtensionLibrary: document => document.querySelector<HTMLElement>(
            '[data-code-extension-button] button, [class*="gui_extension-button-container_"] button')?.click()
    });
