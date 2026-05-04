const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
let autoUpdater
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch {
  autoUpdater = null
}
const path = require('path')
const http = require('http')
const fs = require('fs')
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
  if (!autoUpdater) return source
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

const decodeHtmlEntities = (value = '') => String(value)
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))

const htmlToReadableText = (html = '') => {
  const title = decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()
  const text = decodeHtmlEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|br|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
  ).trim()

  return { title, text }
}

const fetchUrlText = async (rawUrl) => {
  const target = String(rawUrl || '').trim()
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('只支持读取 http/https 链接')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(target, {
      headers: {
        Accept: 'text/html, text/plain;q=0.9, application/json;q=0.7, */*;q=0.5',
        'User-Agent': `${packageJson.productName || packageJson.name}/${packageJson.version}`
      },
      redirect: 'follow',
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`读取链接失败：HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const rawText = (await response.text()).slice(0, 1_500_000)
    const readable = /html/i.test(contentType)
      ? htmlToReadableText(rawText)
      : { title: '', text: rawText.trim() }

    if (!readable.text) {
      throw new Error('链接里没有读取到可用正文')
    }

    return {
      ok: true,
      url: response.url || target,
      title: readable.title || response.url || target,
      contentType,
      text: readable.text.slice(0, 60_000)
    }
  } finally {
    clearTimeout(timeout)
  }
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
  if (!autoUpdater) return
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

  autoUpdater?.checkForUpdates().catch((nextError) => {
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
  },
  {
    name: 'yufeng.support',
    description: 'Return support contacts and project links.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'yufeng.prompt_suggestions',
    description: 'Return starter prompt ideas for image, video and workflow creation.',
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

    if (name === 'yufeng.support') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                app: packageJson.productName || packageJson.name,
                email: '16689675868@163.com',
                github: `https://github.com/${repo}`,
                issues: `https://github.com/${repo}/issues`,
                apiKey: 'https://dataeyes.ai/?promoter_code=nqg9bv83'
              }, null, 2)
            }
          ]
        }
      }
    }

    if (name === 'yufeng.prompt_suggestions') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                '把这个中文提示词优化得更适合生图，但不要翻译成英文',
                '生成一个 6 镜头短视频分镜，包含首尾帧建议',
                '根据产品照片设计一套电商主图和详情页画面',
                '帮我把角色设定扩展成可直接图生图的提示词',
                '我想做一个公共工作流模板，请帮我拆成输入节点、生成节点和结果节点'
              ], null, 2)
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
          mcp: `${localApiState.origin}/mcp`,
          support: `${localApiState.origin}/support`
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

      if (request.method === 'GET' && url.pathname === '/support') {
        sendJson(response, 200, {
          ok: true,
          email: '16689675868@163.com',
          github: `https://github.com/${repo}`,
          issues: `https://github.com/${repo}/issues`,
          apiKey: 'https://dataeyes.ai/?promoter_code=nqg9bv83'
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
        endpoints: ['/health', '/mcp', '/support']
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

const userDataBackupFileName = 'yufeng-canvas-data-backup.json'
const userDataBackupKind = 'yufeng-canvas.user-data'
const protectedBackupKeys = [
  'ai-canvas-projects',
  'yufeng-image-expert-history',
  'image-expert-history',
  'yufeng-canvas-chat-history-v1',
  'home-chat-history',
  'api-keys-by-provider',
  'base-urls-by-provider',
  'custom-chat-models',
  'custom-image-models',
  'custom-video-models',
  'custom-chat-models-by-provider',
  'custom-image-models-by-provider',
  'custom-video-models-by-provider',
  'selected-chat-model',
  'selected-image-model',
  'selected-video-model',
  'api-provider',
  'theme'
]

const getUserDataBackupPath = () => path.join(app.getPath('userData'), userDataBackupFileName)

const ensureParentDir = (filePath) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

const readJsonFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.warn('[data-backup] read failed', filePath, error?.message || error)
    return null
  }
}

const writeJsonFile = (filePath, data) => {
  ensureParentDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

const normalizeBackupSnapshot = (snapshot = {}) => ({
  ...snapshot,
  kind: userDataBackupKind,
  savedAt: new Date().toISOString(),
  appVersion: packageJson.version
})

const parseStorageJsonValue = (value) => {
  if (!value || typeof value !== 'string') return null

  try {
    return JSON.parse(value)
  } catch {
    return value.trim() ? value : null
  }
}

const storageValueScore = (value) => {
  const parsed = parseStorageJsonValue(value)
  if (!parsed) return 0
  if (Array.isArray(parsed)) return parsed.length
  if (typeof parsed === 'object') return Object.keys(parsed).length
  if (typeof parsed === 'string') return parsed.length > 0 ? 1 : 0
  return 1
}

const mergeSnapshotWithExistingBackup = (incomingSnapshot) => {
  const incoming = normalizeBackupSnapshot(incomingSnapshot)
  const existing = readJsonFile(getUserDataBackupPath())

  if (!existing || existing.kind !== userDataBackupKind) {
    return incoming
  }

  const merged = {
    ...existing,
    ...incoming,
    localStorage: {
      ...(existing.localStorage || {}),
      ...(incoming.localStorage || {})
    },
    sessionStorage: {
      ...(existing.sessionStorage || {}),
      ...(incoming.sessionStorage || {})
    },
    savedAt: incoming.savedAt,
    appVersion: packageJson.version
  }

  protectedBackupKeys.forEach((key) => {
    const existingValue = existing.localStorage?.[key]
    const incomingValue = incoming.localStorage?.[key]
    if (storageValueScore(existingValue) > storageValueScore(incomingValue)) {
      merged.localStorage[key] = existingValue
    }
  })

  return merged
}

const hasFiles = (targetPath) => {
  try {
    return fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0
  } catch {
    return false
  }
}

const copyDirIfMissing = (sourceDir, targetDir) => {
  if (!fs.existsSync(sourceDir) || hasFiles(targetDir)) return false
  ensureParentDir(targetDir)
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: false })
  return true
}

const getLegacyUserDataCandidates = () => {
  const appDataPath = app.getPath('appData')
  const currentUserData = app.getPath('userData')
  const currentName = path.basename(currentUserData)
  const knownNames = [
    'huobao-canvas',
    'Huobao Canvas',
    '火宝无限画布',
    'AI Canvas',
    'YUFENG Canvas'
  ]

  const discoveredNames = (() => {
    try {
      return fs.readdirSync(appDataPath)
        .filter((name) => /huobao|yufeng|canvas|火宝|御风/i.test(name))
    } catch {
      return []
    }
  })()

  return [...new Set([...knownNames, ...discoveredNames])]
    .filter((name) => name && name !== currentName)
    .map((name) => path.join(appDataPath, name))
    .filter((candidate) => candidate !== currentUserData && fs.existsSync(candidate))
}

const migrateLegacyUserDataStorage = () => {
  const currentUserData = app.getPath('userData')
  const currentLocalStorage = path.join(currentUserData, 'Local Storage', 'leveldb')

  if (hasFiles(currentLocalStorage)) return

  for (const legacyDir of getLegacyUserDataCandidates()) {
    const legacyLocalStorage = path.join(legacyDir, 'Local Storage', 'leveldb')
    if (!hasFiles(legacyLocalStorage)) continue

    const copied = [
      copyDirIfMissing(path.join(legacyDir, 'Local Storage'), path.join(currentUserData, 'Local Storage')),
      copyDirIfMissing(path.join(legacyDir, 'IndexedDB'), path.join(currentUserData, 'IndexedDB')),
      copyDirIfMissing(path.join(legacyDir, 'Session Storage'), path.join(currentUserData, 'Session Storage'))
    ].some(Boolean)

    if (copied) {
      console.log('[data-backup] migrated legacy user data from', legacyDir)
      return
    }
  }
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
  migrateLegacyUserDataStorage()
  setupAutoUpdater()

  ipcMain.handle('app:get-version', () => packageJson.version)
  ipcMain.handle('app:get-update-status', () => updateState)
  ipcMain.handle('app:get-local-api-status', () => localApiState)
  ipcMain.handle('app:fetch-url-text', (_event, url) => fetchUrlText(url))
  ipcMain.handle('app:get-user-data-path', () => app.getPath('userData'))

  ipcMain.handle('app:save-user-data-backup', (_event, snapshot) => {
    const normalized = mergeSnapshotWithExistingBackup(snapshot)
    writeJsonFile(getUserDataBackupPath(), normalized)
    return {
      ok: true,
      path: getUserDataBackupPath(),
      savedAt: normalized.savedAt
    }
  })

  ipcMain.handle('app:load-user-data-backup', () => readJsonFile(getUserDataBackupPath()))

  ipcMain.handle('app:export-user-data', async (_event, snapshot) => {
    const defaultPath = path.join(
      app.getPath('documents'),
      `YUFENG-Canvas-Data-${new Date().toISOString().slice(0, 10)}.json`
    )
    const result = await dialog.showSaveDialog({
      title: '导出 YUFENG Canvas 创作与配置',
      defaultPath,
      filters: [
        { name: 'YUFENG Canvas 数据包', extensions: ['json'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const normalized = normalizeBackupSnapshot(snapshot)
    writeJsonFile(result.filePath, normalized)
    writeJsonFile(getUserDataBackupPath(), normalized)

    return {
      ok: true,
      path: result.filePath
    }
  })

  ipcMain.handle('app:import-user-data', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 YUFENG Canvas 创作与配置',
      properties: ['openFile'],
      filters: [
        { name: 'YUFENG Canvas 数据包', extensions: ['json'] }
      ]
    })

    if (result.canceled || !result.filePaths?.[0]) {
      return { canceled: true }
    }

    const snapshot = readJsonFile(result.filePaths[0])
    if (!snapshot || snapshot.kind !== userDataBackupKind) {
      throw new Error('选择的文件不是有效的 YUFENG Canvas 数据包')
    }

    writeJsonFile(getUserDataBackupPath(), normalizeBackupSnapshot(snapshot))
    return snapshot
  })

  ipcMain.handle('app:check-update', async () => {
    if (!isPackagedRuntime()) {
      return checkLatestReleaseManually()
    }

    updateCheckMode = 'manual'
    updateSourceIndex = 0
    setUpdaterSource()
    await autoUpdater?.checkForUpdates()
    return updateState
  })

  ipcMain.handle('app:download-update', async () => {
    if (!isPackagedRuntime()) {
      return checkLatestReleaseManually()
    }

    updateCheckMode = 'manual'
    setUpdateState({ status: 'downloading', manual: false, error: '' })
    await autoUpdater?.downloadUpdate()
    return updateState
  })

  ipcMain.handle('app:install-update', () => {
    if (updateState.status !== 'downloaded') {
      throw new Error('更新尚未下载完成')
    }

    autoUpdater?.quitAndInstall(true, true)
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
