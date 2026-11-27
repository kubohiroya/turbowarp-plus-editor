import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import {createHorizontalBlockPalette} from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette';
import styles from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette.css';
import './palette.css';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

let extensionLibraryAction: (() => void) | undefined;

// The File menu can replace the toolbox button, so reuse the GUI command directly.
export function bindPaletteExtensionLibrary(action?: (() => void) | null) {
    extensionLibraryAction = action ?? undefined;
}

export const {connectPaletteVisibility, setHorizontalBlockPalette, openDetachedBlockPalette, installHorizontalBlockPalette} =
    createHorizontalBlockPalette({getScratchBlocks: () => window.ScratchBlocks, styles,
        showPaletteMenu: readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search).standardLayout,
        openExtensionLibrary: document => {
            if (extensionLibraryAction) extensionLibraryAction();
            else document.querySelector<HTMLElement>(
                '[data-code-extension-button] button, [class*="gui_extension-button-container_"] button')?.click();
        }
    });
