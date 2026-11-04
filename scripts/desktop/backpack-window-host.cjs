const AbstractWindow = require('./abstract');

const editorURL = 'tw-editor://./gui/gui.html';
const childURL = 'tw-editor://./gui/backpack-popout.html';
const framePattern = /^tw-plus-backpack-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;
const layoutEnabled = process.env.TW_PLUS_DESKTOP_WINDOW_LAYOUT === '1';
const internalEnabled = layoutEnabled && process.env.TW_PLUS_DESKTOP_INTERNAL_WINDOWS === '1';
const enabled = layoutEnabled && process.env.TW_PLUS_DESKTOP_BACKPACK_POPOUT === '1';

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

function getTicket ({url, frameName, postBody}) {
    return url === 'about:blank' && !postBody ? framePattern.exec(frameName)?.[1] : undefined;
}

function createBackpackWindowHost (editor) {
    const url = new URL(editorURL);
    if (layoutEnabled) url.searchParams.set('twPlusWindowLayout', '1');
    if (internalEnabled) url.searchParams.set('twPlusInternalWindows', '1');
    if (enabled) url.searchParams.set('twPlusBackpackPopout', '1');
    let child;
    let pending;

    if (enabled) {
        editor.webContents.on('did-create-window', (window, details) => {
            const ticket = getTicket(details);
            if (!ticket || ticket !== pending?.ticket) return;
            pending = undefined;
            child = window;
            const popup = new BackpackWindow({existingWindow: window, parentWindow: editor});
            popup.initialURL = 'about:blank';
            const fail = error => {
                console.error('Could not initialize the Backpack window:', error);
                if (!window.isDestroyed()) window.close();
            };
            const loadChild = () => {
                if (window.isDestroyed() || window.webContents.getURL() !== 'about:blank' ||
                    window.webContents.isLoadingMainFrame()) return;
                clearTimeout(fallback);
                window.webContents.removeListener('did-finish-load', loadChild);
                setImmediate(() => {
                    if (window.isDestroyed()) return;
                    popup.loadURL(`${childURL}#${ticket}`).then(() => {
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
            if (!details.frameName?.startsWith('tw-plus-backpack-')) return null;
            const ticket = getTicket(details);
            if (!enabled || !ticket || child || pending) return {action: 'deny'};
            const reservation = {ticket};
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
