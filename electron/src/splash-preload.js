const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  quit: () => ipcRenderer.send('splash-quit')
});
