import {createDesktopCode} from '@kubohiroya/turbowarp-plus-editor-code-views/desktop-code';
import {createDesktopPanelHost} from '../editor-layout/desktop-panel-host.ts';

export const {desktopCodeEnabled, openDesktopCode, attachDesktopCode} = createDesktopCode({
    host: createDesktopPanelHost('code', 'twPlusCodePopout', 830, 600, false),
    layoutMenu: typeof location !== 'undefined' && new URLSearchParams(location.search).get('twPlusStandardLayout') === '1'
});
