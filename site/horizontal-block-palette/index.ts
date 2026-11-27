import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import {createHorizontalBlockPalette} from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette';
import styles from '@kubohiroya/turbowarp-plus-editor-code-views/horizontal-block-palette.css';
import './palette.css';
import {readWebStartupFeatureFlags} from '../../config/web-startup-feature-flags.ts';

import {getPaletteExtensionLibraryAction} from '../gui-integration/lib/tw-plus-integration-points.ts';

export const {connectPaletteVisibility, setHorizontalBlockPalette, openDetachedBlockPalette, installHorizontalBlockPalette} =
    createHorizontalBlockPalette({getScratchBlocks: () => window.ScratchBlocks, styles,
        showPaletteMenu: readWebStartupFeatureFlags(typeof window === 'undefined' ? '' : window.location.search).standardLayout,
        openExtensionLibrary: document => {
            const open = getPaletteExtensionLibraryAction();
            if (open) open();
            else document.querySelector<HTMLElement>(
                '[data-code-extension-button] button, [class*="gui_extension-button-container_"] button')?.click();
        }
    });
