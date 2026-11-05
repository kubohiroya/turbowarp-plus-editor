const path = require('node:path');
const AbstractWindow: new (options: {existingWindow: object; parentWindow: object}) => {
    initialURL: string;
    loadURL(url: string): Promise<void>;
    show(): void;
} = require('./abstract');

const editorURL = 'tw-editor://./gui/gui.html';
const childBase = 'tw-editor://./gui/';
const framePattern = /^tw-plus-(backpack|stage|sprite-properties|sprite-list|code)-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;
const reservedFrame = /^tw-plus-(backpack|stage|sprite-properties|sprite-list|code)-/;
const splitterDisabled = process.env.TW_PLUS_DESKTOP_SPLITTER === '0';
const layoutEnabled = process.env.TW_PLUS_DESKTOP_WINDOW_LAYOUT === '1';
const standardLayout = process.env.TW_PLUS_DESKTOP_STANDARD_LAYOUT === undefined ?
    !layoutEnabled : process.env.TW_PLUS_DESKTOP_STANDARD_LAYOUT === '1';
const spritePropertiesEnabled = process.env.TW_PLUS_DESKTOP_SPRITE_PROPERTIES === '1';
const internalEnabled = layoutEnabled && process.env.TW_PLUS_DESKTOP_INTERNAL_WINDOWS === '1';
const stagePanelEnabled = internalEnabled && process.env.TW_PLUS_DESKTOP_STAGE_PANEL === '1';
const targetListEnabled = internalEnabled && process.env.TW_PLUS_DESKTOP_TARGET_LIST === '1';
const enabled = standardLayout || layoutEnabled && process.env.TW_PLUS_DESKTOP_BACKPACK_POPOUT === '1';
const stagePopout = standardLayout || stagePanelEnabled && process.env.TW_PLUS_DESKTOP_STAGE_POPOUT === '1';
const targetPopout = internalEnabled && process.env.TW_PLUS_DESKTOP_TARGET_PANELS_POPOUT === '1';
const codePopout = standardLayout || internalEnabled && process.env.TW_PLUS_DESKTOP_CODE_POPOUT === '1';
const allowed = new Set(Object.entries({
    backpack: enabled,
    stage: stagePopout,
    'sprite-properties': targetPopout && spritePropertiesEnabled,
    'sprite-list': standardLayout || targetPopout && targetListEnabled,
    code: codePopout
}).filter(([, available]) => available).map(([kind]) => kind));

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
    url.searchParams.set('twPlusStandardLayout', standardLayout ? '1' : '0');
    if (splitterDisabled) url.searchParams.set('twPlusSplitter', '0');
    if (layoutEnabled) url.searchParams.set('twPlusWindowLayout', '1');
    if (internalEnabled) url.searchParams.set('twPlusInternalWindows', '1');
    if (spritePropertiesEnabled) url.searchParams.set('twPlusSpriteProperties', '1');
    if (stagePanelEnabled) url.searchParams.set('twPlusStagePanel', '1');
    if (process.env.TW_PLUS_DESKTOP_STAGE_DISPLAY_MENU === '1') url.searchParams.set('twPlusStageDisplayMenu', '1');
    if (targetListEnabled) url.searchParams.set('twPlusTargetList', '1');
    if (enabled) url.searchParams.set('twPlusBackpackPopout', '1');
    if (stagePopout) url.searchParams.set('twPlusStagePopout', '1');
    if (standardLayout || targetPopout) url.searchParams.set('twPlusTargetPanelsPopout', '1');
    if (codePopout) url.searchParams.set('twPlusCodePopout', '1');
    const children = new Map();
    const pending = new Map();
    const count = kind => [...children.values(), ...pending.values()].filter(entry => entry.kind === kind).length;

    if (allowed.size) {
        editor.webContents.on('did-create-window', (window, details) => {
            const reservation = getReservation(details);
            if (!reservation || pending.get(reservation.ticket)?.kind !== reservation.kind) return;
            const {kind, ticket} = reservation;
            pending.delete(ticket);
            children.set(ticket, {kind, window});
            const popup = new BackpackWindow({existingWindow: window, parentWindow: editor});
            popup.initialURL = 'about:blank';
            if (standardLayout) {
                const contents = window.webContents;
                const channel = 'tw-plus-popup:mode';
                const mode = () => window.isMinimized() ? 'minimized' : window.isMaximized() ? 'maximized' : 'normal';
                const expectedURL = `${childBase}${kind}-popout.html#${ticket}`;
                contents.ipc.handle(channel, (event, action) => {
                    if (event.senderFrame !== contents.mainFrame || event.senderFrame.url !== expectedURL) return;
                    if (action === 'maximize') window.maximize();
                    if (action === 'minimize') window.minimize();
                    if (action === 'restore') window.unmaximize();
                    return mode();
                });
                for (const event of ['maximize', 'unmaximize', 'minimize', 'restore']) {
                    window.on(event, () => {
                        if (!contents.isDestroyed() && contents.getURL() === expectedURL) contents.send(channel, mode());
                    });
                }
            }
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
                children.delete(ticket);
            });
        });
        editor.once('closed', () => {
            pending.clear();
            for (const {window} of children.values()) {
                if (!window.isDestroyed()) window.destroy();
            }
        });
    }

    return {
        editorURL: url.href,
        handleWindowOpen (details) {
            // Requests outside the reserved namespace keep the original Desktop policy.
            if (!reservedFrame.test(details.frameName || '')) return null;
            const reservation = getReservation(details);
            if (!reservation || !allowed.has(reservation.kind)) return {action: 'deny'};
            const {kind, ticket} = reservation;
            if (children.has(ticket) || pending.has(ticket) || count(kind) >= (kind === 'code' ? 2 : 1)) {
                return {action: 'deny'};
            }
            pending.set(ticket, reservation);
            // did-create-window arrives before the opener can issue another request.
            // Release the reservation if Electron rejects the native window before creation.
            setTimeout(() => {
                if (pending.get(ticket) === reservation) pending.delete(ticket);
            }, 5000).unref();
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
                        preload: standardLayout ? path.join(__dirname, 'plus-popup-preload.cjs') : null
                    }
                }
            };
        }
    };
}

module.exports = {createBackpackWindowHost};
