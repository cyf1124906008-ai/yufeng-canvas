const { app, BrowserWindow, shell, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const http = require('http')
const packageJson = require('../package.json')

const rendererUrl = process.env.ELECTRON_RENDERER_URL
const repo = 'cyf1124906008-ai/yufeng-canvas'
const githubUpdateSource = {
  type: 'github',
  label: 'GitHub Release',
  feed: {
    provider: 'github',
    owner: 'cyf1124906008-ai',
    repo: 'yufeng-canvas'
  }
}

const normalizeMirrorUrl = (url) => String(url || '').trim().replace(/\/+$/, '')
const configuredMirrorUrls = [
  ...String(process.env.YUFENG_UPDATE_MIRROR_URL || '')
    .split(',')
    .map(normalizeMirrorUrl)
    .filter(Boolean),
  ...(Array.isArray(packageJson.yufeng?.updateMirrors)
    ? packageJson.yufeng.updateMirrors.map(normalizeMirrorUrl).filter(Boolean)
    : [])
]

const updateSources = [
  ...configuredMirrorUrls.map((url, index) => ({
    type: 'generic',
    label: `国内镜像 ${index + 1}`,
    feed: {
      provider: 'generic',
      url
    }
  })),
  githubUpdateSource
]

let updateState = {
  status: 'idle',
  currentVersion: packageJson.version,
  updateSource: updateSources[0]?.label || githubUpdateSource.label
}
let updateCheckMode = 'auto'
let updateSourceIndex = 0
let localApiServer = null
const localApiPort = Number.parseInt(process.env.YUFENG_LOCAL_API_PORT || '43112', 10) || 43112
let localApiState = {
  enabled: process.env.YUFENG_LOCAL_API !== '0',
  running: false,
  port: localApiPort,
  origin: `http://127.0.0.1:${localApiPort}`,
  error: ''
}

const isPackagedRuntime = () => app.isPackaged && !rendererUrl

const getCurrentUpdateSource = () => updateSources[updateSourceIndex] || githubUpdateSource

const setUpdaterSource = (source = getCurrentUpdateSource()) => {
  autoUpdater.setFeedURL(source.feed)
  return source
}

const compareVersions = (a = '0.0.0', b = '0.0.0') => {
  const left = String(a).replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = String(b).replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff !== 0) return diff
  }

  return 0
}

const getLatestRelease = async () => {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `${packageJson.productName || packageJson.name}/${packageJson.version}`
    }
  })

  if (!response.ok) {
    throw new Error(`检查更新失败：${response.status}`)
  }

  return response.json()
}

const getInstallerAsset = (release) => {
  const assets = Array.isArray(release.assets) ? release.assets : []
  return assets.find((asset) =>
    /\.exe$/i.test(asset.name || '') &&
    /setup/i.test(asset.name || '')
  ) || assets.find((asset) => /\.exe$/i.test(asset.name || ''))
}

const setUpdateState = (nextState) => {
  updateState = {
    ...updateState,
    ...nextState,
    currentVersion: packageJson.version,
    updateSource: nextState.updateSource || getCurrentUpdateSource().label,
    updatedAt: Date.now()
  }

  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('app:update-status', updateState)
  })

  return updateState
}

const checkLatestReleaseManually = async () => {
  const release = await getLatestRelease()
  const installerAsset = getInstallerAsset(release)
  const latestVersion = String(release.tag_name || '').replace(/^v/i, '')
  const hasUpdate = compareVersions(latestVersion, packageJson.version) > 0

  return setUpdateState({
    status: hasUpdate ? 'available' : 'not-available',
    manual: true,
    latestVersion,
    releaseName: release.name || release.tag_name || '',
    releaseUrl: release.html_url,
    downloadUrl: installerAsset?.browser_download_url || release.html_url,
    publishedAt: release.published_at || '',
    error: ''
  })
}

const setupAutoUpdater = () => {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  setUpdaterSource()

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      status: 'checking',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      error: ''
    })
  })

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'available',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      latestVersion: info?.version,
      releaseName: info?.releaseName || '',
      releaseNotes: info?.releaseNotes || '',
      releaseDate: info?.releaseDate || '',
      error: ''
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setUpdateState({
      status: 'not-available',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      latestVersion: info?.version || packageJson.version,
      error: ''
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      status: 'downloading',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      progress: {
        percent: Math.round(progress.percent || 0),
        transferred: progress.transferred || 0,
        total: progress.total || 0,
        bytesPerSecond: progress.bytesPerSecond || 0
      },
      error: ''
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      latestVersion: info?.version || updateState.latestVersion,
      progress: { percent: 100 },
      error: ''
    })
  })

  autoUpdater.on('error', (error) => {
    if (tryNextUpdateSource(error)) return

    setUpdateState({
      status: 'error',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      error: error?.message || '更新失败'
    })
  })
}

const tryNextUpdateSource = (error) => {
  if (!isPackagedRuntime()) return false
  if (updateSourceIndex >= updateSources.length - 1) return false

  const failedSource = getCurrentUpdateSource()
  updateSourceIndex += 1
  const nextSource = setUpdaterSource(getCurrentUpdateSource())

  setUpdateState({
    status: 'checking',
    manual: false,
    initiatedBy: updateCheckMode,
    silent: updateCheckMode === 'auto',
    updateSource: nextSource.label,
    previousUpdateSource: failedSource.label,
    previousError: error?.message || '更新源不可用',
    error: ''
  })

  autoUpdater.checkForUpdates().catch((nextError) => {
    if (tryNextUpdateSource(nextError)) return
    setUpdateState({
      status: 'error',
      manual: false,
      initiatedBy: updateCheckMode,
      silent: updateCheckMode === 'auto',
      updateSource: getCurrentUpdateSource().label,
      error: nextError?.message || '所有更新源都不可用'
    })
  })

  return true
}

const checkForUpdatesInBackground = () => {
  if (!isPackagedRuntime()) return

  updateCheckMode = 'auto'
  updateSourceIndex = 0
  setUpdaterSource()
  autoUpdater.checkForUpdates().catch((error) => {
    if (tryNextUpdateSource(error)) return
    setUpdateState({
      status: 'error',
      manual: false,
      initiatedBy: 'auto',
      silent: true,
      updateSource: getCurrentUpdateSource().label,
      error: error?.message || '后台检查更新失败'
    })
  })
}

const sendJson = (response, statusCode, data) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://127.0.0.1',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  response.end(JSON.stringify(data))
}

const readJsonBody = (request) => new Promise((resolve, reject) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    if (!chunks.length) {
      resolve({})
      return
    }

    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch (error) {
      reject(error)
    }
  })
  request.on('error', reject)
})

const mcpTools = [
  {
    name: 'yufeng.health',
    description: 'Return YUFENG Canvas local API health and version.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'yufeng.release',
    description: 'Return the GitHub release page for downloading the latest installer.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
]

const handleMcpRequest = async (body = {}) => {
  const id = body.id ?? null
  const method = body.method

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'yufeng-canvas-local',
          version: packageJson.version
        },
        capabilities: {
          tools: {}
        }
      }
    }
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: mcpTools
      }
    }
  }

  if (method === 'tools/call') {
    const name = body.params?.name
    if (name === 'yufeng.health') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                app: packageJson.productName || packageJson.name,
                version: packageJson.version,
                localApi: localApiState
              }, null, 2)
            }
          ]
        }
      }
    }

    if (name === 'yufeng.release') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `https://github.com/${repo}/releases/latest`
            }
          ]
        }
      }
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Unknown MCP method: ${method || 'empty'}`
    }
  }
}

const startLocalApiServer = () => {
  if (!localApiState.enabled || localApiServer) return

  localApiServer = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {})
      return
    }

    const url = new URL(request.url || '/', localApiState.origin)

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, {
          ok: true,
          app: packageJson.productName || packageJson.name,
          version: packageJson.version,
          mcp: `${localApiState.origin}/mcp`
        })
        return
      }

      if (request.method === 'GET' && url.pathname === '/mcp') {
        sendJson(response, 200, {
          name: 'yufeng-canvas-local',
          version: packageJson.version,
          transport: 'json-rpc-over-http',
          endpoint: `${localApiState.origin}/mcp`,
          tools: mcpTools
        })
        return
      }

      if (request.method === 'POST' && url.pathname === '/mcp') {
        const body = await readJsonBody(request)
        sendJson(response, 200, await handleMcpRequest(body))
        return
      }

      sendJson(response, 404, {
        ok: false,
        error: 'Not found',
        endpoints: ['/health', '/mcp']
      })
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error?.message || 'Local API error'
      })
    }
  })

  localApiServer.on('error', (error) => {
    localApiState = {
      ...localApiState,
      running: false,
      error: error?.message || 'Local API failed'
    }
  })

  localApiServer.listen(localApiPort, '127.0.0.1', () => {
    localApiState = {
      ...localApiState,
      running: true,
      error: ''
    }
  })
}

function createWindow() {
  const windowIcon = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png')

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone', details)
  })

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.html'))
  }
}

app.whenReady().then(() => {
  setupAutoUpdater()

  ipcMain.handle('app:get-version', () => packageJson.version)
  ipcMain.handle('app:get-update-status', () => updateState)
  ipcMain.handle('app:get-local-api-status', () => localApiState)

  ipcMain.handle('app:check-update', async () => {
    if (!isPackagedRuntime()) {
      return checkLatestReleaseManually()
    }

    updateCheckMode = 'manual'
    updateSourceIndex = 0
    setUpdaterSource()
    await autoUpdater.checkForUpdates()
    return updateState
  })

  ipcMain.handle('app:download-update', async () => {
    if (!isPackagedRuntime()) {
      return checkLatestReleaseManually()
    }

    updateCheckMode = 'manual'
    setUpdateState({ status: 'downloading', manual: false, error: '' })
    await autoUpdater.downloadUpdate()
    return updateState
  })

  ipcMain.handle('app:install-update', () => {
    if (updateState.status !== 'downloaded') {
      throw new Error('更新尚未下载完成')
    }

    autoUpdater.quitAndInstall(true, true)
    return { ok: true }
  })

  ipcMain.handle('app:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })

  createWindow()
  startLocalApiServer()
  setTimeout(checkForUpdatesInBackground, 8000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    localApiServer?.close()
    app.quit()
  }
})
