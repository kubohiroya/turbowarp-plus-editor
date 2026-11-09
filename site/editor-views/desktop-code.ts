import {createCodeSession} from '@kubohiroya/turbowarp-plus-editor-views';
import {createSurface, pendingSurfaceEdits} from '@kubohiroya/turbowarp-editor-surfaces';
import {createDesktopPanelHost} from '../editor-layout/desktop-panel-host.ts';

const host = createDesktopPanelHost('code', 'twPlusCodePopout', 830, 600, false);
export const desktopCodeEnabled = Boolean(host);
let openCode = null;

export const openDesktopCode = () => openCode?.();

export function attachDesktopCode(context) {
    if (!host) return null;
    const session = createCodeSession(context);
    const unregister = pendingSurfaceEdits.register(() => session.flush());
    const surfaces = new Set<{dock(): void}>();
    const menu = new URLSearchParams(location.search).get('twPlusStandardLayout') === '1';
    const open = (target = context.vm.editingTarget) => {
        if (!target?.isOriginal || !context.canUse() || surfaces.size >= 2) return;
        let detach;
        const surface = createSurface(host, state => {
            if (state.kind === 'external') {
                detach = session.attach({...state.target, target, close: () => surface.dock(),
                    duplicate: menu ? next => open(next) : undefined, layoutMenu: menu});
            } else if (state.kind === 'docked') {
                surfaces.delete(surface);
                detach?.();
                if (menu) session.setCanDuplicate(surfaces.size < 2);
            }
        });
        surfaces.add(surface);
        if (menu) session.setCanDuplicate(surfaces.size < 2);
        surface.undock({timeoutMs: 15000});
    };
    openCode = open;
    return {dispose() {
        if (openCode === open) openCode = null;
        unregister();
        session.dispose();
        for (const surface of surfaces) surface.dock();
    }};
}
