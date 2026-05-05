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
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  comfy: {
    getStatus: () => ipcRenderer.invoke('app:comfy:get-status'),
    setConfig: (config) => ipcRenderer.invoke('app:comfy:set-config', config),
    install: () => ipcRenderer.invoke('app:comfy:install'),
    installDependencies: () => ipcRenderer.invoke('app:comfy:install-dependencies'),
    scanModels: () => ipcRenderer.invoke('app:comfy:scan-models'),
    start: () => ipcRenderer.invoke('app:comfy:start'),
    stop: () => ipcRenderer.invoke('app:comfy:stop'),
    testConnection: (baseUrl) => ipcRenderer.invoke('app:comfy:test-connection', baseUrl),
    getLogs: () => ipcRenderer.invoke('app:comfy:get-logs'),
    openFolder: (key) => ipcRenderer.invoke('app:comfy:open-folder', key)
  },
  comfyRuntime: {
    queuePrompt: (baseUrl, workflow) => ipcRenderer.invoke('app:comfy:queue-prompt', baseUrl, workflow),
    getHistory: (baseUrl, promptId) => ipcRenderer.invoke('app:comfy:get-history', baseUrl, promptId),
    fetchImage: (baseUrl, imageMeta) => ipcRenderer.invoke('app:comfy:fetch-image', baseUrl, imageMeta)
  },
  assets: {
    saveDataUrl: (dataUrl, projectId) => ipcRenderer.invoke('app:assets:save-data-url', dataUrl, projectId),
    readAsDataUrl: (assetPath) => ipcRenderer.invoke('app:assets:read-as-data-url', assetPath)
  },
  imageGen: {
    generate: (config) => ipcRenderer.invoke('app:image:generate', config),
    getPendingResult: (taskId) => ipcRenderer.invoke('app:image:get-pending-result', taskId)
  }
})
