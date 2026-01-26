const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
  setLocale: (locale) => {
    console.log('electronAPI.setLocale called with:', locale);
    ipcRenderer.send('set-locale', locale);
  }
});
