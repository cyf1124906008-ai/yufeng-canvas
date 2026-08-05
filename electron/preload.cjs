const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopApp', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  getLocalApiStatus: () => ipcRenderer.invoke('app:get-local-api-status'),
  getBackgroundMode: () => ipcRenderer.invoke('app:get-background-mode'),
  setBackgroundMode: (enabled) => ipcRenderer.invoke('app:set-background-mode', { enabled }),
  getLaunchAtLogin: () => ipcRenderer.invoke('app:get-launch-at-login'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('app:set-launch-at-login', { enabled }),
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
  // OpenCode runs in the Electron main process. No executable path,
  // environment, or provider credential crosses this bridge.
  openCode: {
    getStatus: () => ipcRenderer.invoke('app:opencode:get-status'),
    start: () => ipcRenderer.invoke('app:opencode:start'),
    stop: () => ipcRenderer.invoke('app:opencode:stop'),
    health: () => ipcRenderer.invoke('app:opencode:health'),
    createSession: (input) => ipcRenderer.invoke('app:opencode:create-session', input),
    sessionStatus: (input) => ipcRenderer.invoke('app:opencode:session-status', input),
    prompt: (input) => ipcRenderer.invoke('app:opencode:prompt', input),
    abort: (input) => ipcRenderer.invoke('app:opencode:abort', input)
  },
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
  agentAssets: {
    saveDataUrl: (dataUrl, runId) => ipcRenderer.invoke('app:agent-assets:save-data-url', dataUrl, runId),
    readAsDataUrl: (assetRef, runId, assetProof) => ipcRenderer.invoke(
      'app:agent-assets:read-as-data-url', assetRef, runId, assetProof
    ),
    deleteRefs: (runId, assetRefs, retainedRefs) => ipcRenderer.invoke(
      'app:agent-assets:delete-refs', runId, assetRefs, retainedRefs
    )
  },
  agentTools: {
    getCapabilities: () => ipcRenderer.invoke('app:agent-tools:get-capabilities'),
    requestFullAccess: () => ipcRenderer.invoke('app:agent-tools:request-full-access'),
    getFullAccess: () => ipcRenderer.invoke('app:agent-tools:get-full-access'),
    revokeFullAccess: () => ipcRenderer.invoke('app:agent-tools:revoke-full-access'),
    getKeepAwake: () => ipcRenderer.invoke('app:agent-tools:get-keep-awake'),
    setKeepAwake: (enabled) => ipcRenderer.invoke('app:agent-tools:set-keep-awake', { enabled }),
    getWorkspaceRoot: () => ipcRenderer.invoke('app:agent-tools:get-workspace-root'),
    chooseWorkspaceRoot: (input) => ipcRenderer.invoke('app:agent-tools:choose-workspace-root', input),
    setWorkspaceRoot: (input) => ipcRenderer.invoke('app:agent-tools:set-workspace-root', input),
    listFiles: (input) => ipcRenderer.invoke('app:agent-tools:list-files', input),
    readFile: (input) => ipcRenderer.invoke('app:agent-tools:read-file', input),
    writeFile: (input) => ipcRenderer.invoke('app:agent-tools:write-file', input),
    applyPatch: (input) => ipcRenderer.invoke('app:agent-tools:apply-patch', input),
    revertPatch: (input) => ipcRenderer.invoke('app:agent-tools:revert-patch', input),
    searchFiles: (input) => ipcRenderer.invoke('app:agent-tools:search-files', input),
    startCommand: (input) => ipcRenderer.invoke('app:agent-tools:start-command', input),
    getCommand: (input) => ipcRenderer.invoke('app:agent-tools:get-command', input),
    cancelCommand: (input) => ipcRenderer.invoke('app:agent-tools:cancel-command', input),
    getPermissions: () => ipcRenderer.invoke('app:agent-tools:get-permissions'),
    captureScreen: (input) => ipcRenderer.invoke('app:agent-tools:capture-screen', input),
    openApplication: (input) => ipcRenderer.invoke('app:agent-tools:open-application', input),
    click: (input) => ipcRenderer.invoke('app:agent-tools:click', input),
    typeText: (input) => ipcRenderer.invoke('app:agent-tools:type-text', input)
  },
  imageGen: {
    generate: (config) => ipcRenderer.invoke('app:image:generate', config),
    getPendingResult: (taskId) => ipcRenderer.invoke('app:image:get-pending-result', taskId)
  }
})
