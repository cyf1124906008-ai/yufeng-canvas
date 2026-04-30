const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  getLocalApiStatus: () => ipcRenderer.invoke('app:get-local-api-status'),
  getUserDataPath: () => ipcRenderer.invoke('app:get-user-data-path'),
  fetchUrlText: (url) => ipcRenderer.invoke('app:fetch-url-text', url),
  saveUserDataBackup: (snapshot) => ipcRenderer.invoke('app:save-user-data-backup', snapshot),
  loadUserDataBackup: () => ipcRenderer.invoke('app:load-user-data-backup'),
  exportUserData: (snapshot) => ipcRenderer.invoke('app:export-user-data', snapshot),
  importUserData: () => ipcRenderer.invoke('app:import-user-data'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event, status) => callback(status)
    ipcRenderer.on('app:update-status', listener)
    return () => ipcRenderer.removeListener('app:update-status', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url)
})
