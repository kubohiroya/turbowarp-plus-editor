import {createCodeSession} from '@kubohiroya/turbowarp-editor-views';
import {createSurface} from '@kubohiroya/turbowarp-editor-surfaces';
import {createDesktopPanelHost} from '../editor-layout/desktop-panel-host.js';

const host = createDesktopPanelHost('code', 'twPlusCodePopout', 830, 600, false);
export const desktopCodeEnabled = Boolean(host);
let openCode = null;

export const openDesktopCode = () => openCode?.();

export function attachDesktopCode(context) {
    if (!host) return null;
    const session = createCodeSession(context);
    const surfaces = new Set();
    const open = () => {
        const target = context.vm.editingTarget;
        if (!target?.isOriginal || !context.canUse() || surfaces.size >= 2) return;
        let detach;
        const surface = createSurface(host, state => {
            if (state.kind === 'external') {
                detach = session.attach({...state.target, target, close: () => surface.dock()});
            } else if (state.kind === 'docked') {
                surfaces.delete(surface);
                detach?.();
            }
        });
        surfaces.add(surface);
        surface.undock({timeoutMs: 15000});
    };
    openCode = open;
    return {dispose() {
        if (openCode === open) openCode = null;
        session.dispose();
        for (const surface of surfaces) surface.dock();
    }};
}
