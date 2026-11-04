const {app, BrowserWindow, screen} = require('electron');
const {createInterface} = require('node:readline');

const kind = window => {
    const url = window.webContents.getURL();
    if (url.startsWith('tw-editor://./gui/gui.html')) return 'editor';
    if (url.startsWith('tw-editor://./gui/backpack-popout.html#')) return 'backpack';
    if (url.startsWith('tw-editor://./gui/stage-popout.html#')) return 'stage';
    return null;
};

function observe (window) {
    const preferences = window.webContents.getLastWebPreferences();
    return {
        kind: kind(window), id: window.id, focused: window.isFocused(), visible: window.isVisible(),
        contentFocused: window.webContents.isFocused(), fullScreen: window.isFullScreen(),
        bounds: window.getBounds(), content: window.getContentBounds(), zoom: window.webContents.getZoomFactor(),
        url: window.webContents.getURL(), preferences: {
            sandbox: preferences.sandbox, contextIsolation: preferences.contextIsolation,
            nodeIntegration: preferences.nodeIntegration, preload: Boolean(preferences.preload)
        }
    };
}

function execute ({operation, windowId}) {
    if (operation === 'windows') return BrowserWindow.getAllWindows().filter(kind).map(observe);
    if (operation === 'quit') {
        app.exit(0);
        return null;
    }
    const window = BrowserWindow.fromId(windowId);
    if (!window || !kind(window)) throw new Error('Missing test window');
    if (operation === 'focus') {
        app.focus({steal: true});
        window.focus();
        window.webContents.focus();
        return observe(window);
    }
    if (operation === 'close') {
        window.close();
        return null;
    }
    if (operation === 'layout-tall' && kind(window) === 'stage') {
        const area = screen.getPrimaryDisplay().workArea;
        window.setBounds({x: area.x + Math.round(area.width * 0.65), y: area.y + 100,
            width: Math.round(area.width * 0.17), height: Math.round(area.height * 0.72)});
        return observe(window);
    }
    if (operation !== 'layout') throw new Error('Unknown test command');
    const area = screen.getPrimaryDisplay().workArea;
    const editor = kind(window) === 'editor';
    window.setBounds({
        x: area.x + Math.round(area.width * (editor ? 0.02 : 0.68)),
        y: area.y + 45,
        width: Math.round(area.width * (editor ? 0.62 : 0.28)),
        height: Math.round(area.height * (editor ? 0.90 : 0.42))
    });
    return observe(window);
}

createInterface({input: process.stdin}).on('line', line => {
    const request = JSON.parse(line);
    try {
        const result = execute(request);
        process.stdout.write(`TWPLUS_DESKTOP ${JSON.stringify({id: request.id, result})}\n`);
    } catch (error) {
        process.stdout.write(`TWPLUS_DESKTOP ${JSON.stringify({id: request.id, error: String(error)})}\n`);
    }
});
