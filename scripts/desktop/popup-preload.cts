const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('TwPlusWindowControls', {
    mode: () => ipcRenderer.invoke('tw-plus-popup:mode'),
    change: action => ipcRenderer.invoke('tw-plus-popup:mode', action),
    onMode: callback => {
        const listener = (_event, mode) => callback(mode);
        ipcRenderer.on('tw-plus-popup:mode', listener);
        return () => ipcRenderer.removeListener('tw-plus-popup:mode', listener);
    }
});
