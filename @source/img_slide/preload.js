const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 슬라이드쇼 창용 API
  getSlideshowData: () => ipcRenderer.invoke('get-slideshow-data'),
  openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (_event, value) => callback(value)),
  appQuit: () => ipcRenderer.send('app-quit'),

  // 설정 창용 API
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  showItemInFolder: (path) => ipcRenderer.send('show-item-in-folder', path),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
});
