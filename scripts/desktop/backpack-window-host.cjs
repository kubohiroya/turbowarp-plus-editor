const AbstractWindow = require('./abstract');

const editorURL = 'tw-editor://./gui/gui.html';
const childBase = 'tw-editor://./gui/';
const framePattern = /^tw-plus-(backpack|stage)-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;
const layoutEnabled = process.env.TW_PLUS_DESKTOP_WINDOW_LAYOUT === '1';
const spritePropertiesEnabled = process.env.TW_PLUS_DESKTOP_SPRITE_PROPERTIES === '1';
const internalEnabled = layoutEnabled && process.env.TW_PLUS_DESKTOP_INTERNAL_WINDOWS === '1';
const stagePanelEnabled = internalEnabled && process.env.TW_PLUS_DESKTOP_STAGE_PANEL === '1';
const enabled = layoutEnabled && process.env.TW_PLUS_DESKTOP_BACKPACK_POPOUT === '1';
const stagePopout = stagePanelEnabled && process.env.TW_PLUS_DESKTOP_STAGE_POPOUT === '1';

class BackpackWindow extends AbstractWindow {
    handleWindowOpen () {
        return {action: 'deny'};
    }

    handleWillNavigate (event, url) {
        if (url !== this.initialURL) event.preventDefault();
    }

    handlePermissionCheck () {
        return false;
    }

    isPopup () {
        return true;
    }
}

function getReservation ({url, frameName, postBody}) {
    const match = url === 'about:blank' && !postBody && framePattern.exec(frameName);
    if (!match) return null;
    const [, kind, ticket] = match;
    return {kind, ticket};
}

function createBackpackWindowHost (editor) {
    const url = new URL(editorURL);
    if (layoutEnabled) url.searchParams.set('twPlusWindowLayout', '1');
    if (internalEnabled) url.searchParams.set('twPlusInternalWindows', '1');
    if (spritePropertiesEnabled) url.searchParams.set('twPlusSpriteProperties', '1');
    if (stagePanelEnabled) url.searchParams.set('twPlusStagePanel', '1');
    if (enabled) url.searchParams.set('twPlusBackpackPopout', '1');
    if (stagePopout) url.searchParams.set('twPlusStagePopout', '1');
    let child;
    let pending;

    if (enabled || stagePopout) {
        editor.webContents.on('did-create-window', (window, details) => {
            const reservation = getReservation(details);
            if (!pending || reservation?.ticket !== pending.ticket || reservation.kind !== pending.kind) return;
            const {kind, ticket} = reservation;
            pending = undefined;
            child = window;
            const popup = new BackpackWindow({existingWindow: window, parentWindow: editor});
            popup.initialURL = 'about:blank';
            const fail = error => {
                console.error('Could not initialize the detached window:', error);
                if (!window.isDestroyed()) window.close();
            };
            const loadChild = () => {
                if (window.isDestroyed() || window.webContents.getURL() !== 'about:blank' ||
                    window.webContents.isLoadingMainFrame()) return;
                clearTimeout(fallback);
                window.webContents.removeListener('did-finish-load', loadChild);
                setImmediate(() => {
                    if (window.isDestroyed()) return;
                    popup.loadURL(`${childBase}${kind}-popout.html#${ticket}`).then(() => {
                        if (!window.isDestroyed()) popup.show();
                    }, fail);
                });
            };
            // Let the opener's original about:blank navigation finish before using loadURL.
            const fallback = setTimeout(loadChild, 250);
            window.webContents.on('did-finish-load', loadChild);
            window.once('closed', () => {
                clearTimeout(fallback);
                child = undefined;
            });
        });
        editor.once('closed', () => {
            if (child && !child.isDestroyed()) child.destroy();
        });
    }

    return {
        editorURL: url.href,
        handleWindowOpen (details) {
            // Requests outside the reserved namespace keep the original Desktop policy.
            if (!/^tw-plus-(backpack|stage)-/.test(details.frameName || '')) return null;
            const reservation = getReservation(details);
            if (!reservation || !(reservation.kind === 'stage' ? stagePopout : enabled) || child || pending) {
                return {action: 'deny'};
            }
            pending = reservation;
            // did-create-window arrives before the opener can issue another request.
            // Release the reservation if Electron rejects the native window before creation.
            setTimeout(() => {if (pending === reservation) pending = undefined;}, 5000).unref();
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    show: false,
                    webPreferences: {
                        contextIsolation: true,
                        nodeIntegration: false,
                        nodeIntegrationInSubFrames: false,
                        sandbox: true,
                        webviewTag: false,
                        webSecurity: true,
                        preload: null
                    }
                }
            };
        }
    };
}

module.exports = {createBackpackWindowHost};
