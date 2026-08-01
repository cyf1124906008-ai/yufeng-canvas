const { app, BrowserWindow, shell, ipcMain, dialog, systemPreferences } = require('electron')
let autoUpdater
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch {
  autoUpdater = null
}
const path = require('path')
const http = require('http')
const fs = require('fs')
const { fileURLToPath } = require('url')
const packageJson = require('../package.json')
const comfyManager = require('./comfy/manager.cjs')
const comfyInstaller = require('./comfy/installer.cjs')
const comfyProcess = require('./comfy/process.cjs')
const comfyPaths = require('./comfy/paths.cjs')
const comfyExecutor = require('./comfy/executor.cjs')
const assetManager = require('./assets/manager.cjs')
const { createAgentTools } = require('./agent-tools/index.cjs')
const {
  agentToolApprovalDetail,
  attachNativeApproval,
  bindWorkspaceApprovalPayload,
  canonicalizeAgentToolPayload
} = require('./agent-tools/approval.cjs')
const imageGeneration = require('./imageGeneration.cjs')

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
let desktopAgentTools = null
const localApiPort = Number.parseInt(process.env.YUFENG_LOCAL_API_PORT || '43112', 10) || 43112
let localApiState = {
  enabled: process.env.YUFENG_LOCAL_API !== '0',
  running: false,
  port: localApiPort,
  origin: `http://127.0.0.1:${localApiPort}`,
  error: ''
}

const isPackagedRuntime = () => app.isPackaged && !rendererUrl

const isTrustedRendererUrl = (value) => {
  const source = String(value || '')
  if (!source) return false
  if (rendererUrl) {
    try {
      return new URL(source).origin === new URL(rendererUrl).origin
    } catch {
      return false
    }
  }
  try {
    const sourcePath = path.resolve(fileURLToPath(new URL(source)))
    const rendererRoot = path.resolve(__dirname, '..', 'dist-desktop')
    return sourcePath === rendererRoot || sourcePath.startsWith(rendererRoot + path.sep)
  } catch {
    return false
  }
}

const isTrustedRendererEvent = (event) => isTrustedRendererUrl(
  event?.senderFrame?.url || event?.sender?.getURL?.()
)

const requireTrustedRenderer = (event) => {
  if (!isTrustedRendererEvent(event)) {
    const error = new Error('拒绝来自非应用页面的 IPC 请求')
    error.code = 'UNTRUSTED_RENDERER_IPC'
    throw error
  }
}

const WORKSPACE_BOUND_APPROVAL_ACTIONS = new Set([
  'workspace.write',
  'workspace.patch',
  'workspace.revert_patch',
  'terminal.run'
])

const currentWorkspaceIdentity = async (expected = null) => {
  const identity = await desktopAgentTools?.getWorkspaceIdentity?.()
  if (!identity?.workspaceRoot || !Number.isSafeInteger(Number(identity.workspaceGeneration))) {
    const error = new Error('请先选择有效的 workspace root')
    error.code = 'WORKSPACE_NOT_SET'
    throw error
  }
  const normalized = {
    workspaceRoot: identity.workspaceRoot,
    workspaceGeneration: Number(identity.workspaceGeneration)
  }
  if (expected && (
    expected.workspaceRoot !== normalized.workspaceRoot ||
    Number(expected.workspaceGeneration) !== normalized.workspaceGeneration
  )) {
    const error = new Error('workspace root 在回滚记录创建或审批后已发生变化，请重新发起操作')
    error.code = 'WORKSPACE_IDENTITY_MISMATCH'
    throw error
  }
  return normalized
}

const confirmAgentToolAction = async (event, action, input = {}, { expectedWorkspaceIdentity = null } = {}) => {
  requireTrustedRenderer(event)
  let payload = canonicalizeAgentToolPayload(action, input)
  if (action === 'workspace.set') {
    const realPath = await fs.promises.realpath(payload.path)
    const stat = await fs.promises.stat(realPath)
    if (!stat.isDirectory()) {
      const error = new Error('workspace root 必须是目录')
      error.code = 'WORKSPACE_NOT_DIRECTORY'
      throw error
    }
    payload = Object.freeze({ path: realPath })
  } else if (WORKSPACE_BOUND_APPROVAL_ACTIONS.has(action)) {
    payload = bindWorkspaceApprovalPayload(
      payload,
      await currentWorkspaceIdentity(expectedWorkspaceIdentity)
    )
  }
  const parent = BrowserWindow.fromWebContents(event.sender) || undefined
  const options = {
    type: 'warning',
    title: 'YUFENG Agent 安全确认',
    message: `允许执行一次 ${action}？`,
    detail: agentToolApprovalDetail(action, payload),
    buttons: ['取消', '允许一次'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  }
  const result = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  if (result.response !== 1) {
    const error = new Error(`用户取消了操作: ${action}`)
    error.code = 'NATIVE_APPROVAL_REJECTED'
    throw error
  }
  if (WORKSPACE_BOUND_APPROVAL_ACTIONS.has(action)) {
    await currentWorkspaceIdentity({
      workspaceRoot: payload.workspaceRoot,
      workspaceGeneration: payload.workspaceGeneration
    })
  }
  return attachNativeApproval(action, payload)
}

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
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
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
    description: 'Return YUFENG Agent local API health and version.',
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
    description: 'Return starter task ideas for the desktop Agent Workbench.',
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
          name: 'yufeng-agent-local',
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
                apiKey: 'https://dataeyes.ai/'
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
                '检查当前项目结构，告诉我最需要修复的问题',
                '读取 README 和 package.json，然后运行测试并总结结果',
                '在工作区搜索所有 TODO，按优先级整理',
                '查看当前屏幕，说明正在打开什么并建议下一步',
                '调用 Creative 工具制作一张黑银科技感汽车海报'
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
          name: 'yufeng-agent-local',
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
          apiKey: 'https://dataeyes.ai/'
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
  'ai-canvas-deleted-projects',
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
  try {
    ensureParentDir(targetDir)
    fs.cpSync(sourceDir, targetDir, { recursive: true, force: false })
    return true
  } catch (error) {
    console.warn('[data-backup] skipped legacy data copy', {
      sourceDir,
      targetDir,
      error: error?.message || String(error)
    })
    return false
  }
}

const getLegacyUserDataCandidates = () => {
  const appDataPath = app.getPath('appData')
  const currentUserData = app.getPath('userData')
  const currentName = path.basename(currentUserData)
  const knownNames = [
    'YUFENG Canvas',
    'AI Canvas',
    'huobao-canvas',
    'Huobao Canvas',
    '火宝无限画布',
    'YUFENG Agent'
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
  const currentAssets = path.join(currentUserData, 'yufeng-canvas', 'assets')
  const needsLocalStorage = !hasFiles(currentLocalStorage)
  const needsAssets = !hasFiles(currentAssets)

  if (!needsLocalStorage && !needsAssets) return

  for (const legacyDir of getLegacyUserDataCandidates()) {
    const legacyLocalStorage = path.join(legacyDir, 'Local Storage', 'leveldb')
    const legacyAssets = path.join(legacyDir, 'yufeng-canvas', 'assets')
    if (!hasFiles(legacyLocalStorage) && !hasFiles(legacyAssets)) continue

    const copied = [
      needsLocalStorage && copyDirIfMissing(path.join(legacyDir, 'Local Storage'), path.join(currentUserData, 'Local Storage')),
      needsLocalStorage && copyDirIfMissing(path.join(legacyDir, 'IndexedDB'), path.join(currentUserData, 'IndexedDB')),
      needsLocalStorage && copyDirIfMissing(path.join(legacyDir, 'Session Storage'), path.join(currentUserData, 'Session Storage')),
      needsAssets && copyDirIfMissing(legacyAssets, currentAssets)
    ].some(Boolean)

    if (copied) {
      console.log('[data-backup] migrated legacy user data from', legacyDir)
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
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] did-fail-load', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone', details)
    desktopAgentTools?.shutdown?.()
  })

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.html'))
  }
}

app.whenReady().then(async () => {
  migrateLegacyUserDataStorage()
  const agentTools = createAgentTools({
    userDataPath: app.getPath('userData'),
    tempPath: app.getPath('temp'),
    systemPreferences
  })
  desktopAgentTools = agentTools
  await agentTools.initialize()
  setupAutoUpdater()
  // 本地 ComfyUI 仅作为高级用户可选能力，不在应用启动时自动装载。

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
    const now = new Date()
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const defaultPath = path.join(
      app.getPath('documents'),
      `yufeng-canvas-backup-${timestamp}.json`
    )
    const result = await dialog.showSaveDialog({
      title: '导出 YUFENG Canvas 备份',
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

  // Comfy Engine IPC
  ipcMain.handle('app:comfy:get-status', () => comfyManager.getStatus())
  ipcMain.handle('app:comfy:set-config', (_event, config) => comfyManager.setConfig(config))
  ipcMain.handle('app:comfy:install', () => comfyInstaller.install())
  ipcMain.handle('app:comfy:install-dependencies', () => comfyInstaller.installDependencies())
  ipcMain.handle('app:comfy:scan-models', () => comfyInstaller.scanModels())
  ipcMain.handle('app:comfy:start', () => comfyProcess.start())
  ipcMain.handle('app:comfy:stop', () => comfyProcess.stop())
  ipcMain.handle('app:comfy:test-connection', (_event, baseUrl) => comfyProcess.testConnection(baseUrl))
  ipcMain.handle('app:comfy:get-logs', () => comfyManager.getLogs())
  ipcMain.handle('app:comfy:open-folder', (_event, key) => {
    const folderMap = {
      root: comfyPaths.getComfyRoot(),
      engine: comfyPaths.getComfyEnginePath(),
      models: comfyPaths.getComfyModelsPath(),
      outputs: comfyPaths.getComfyOutputsPath()
    }
    const folder = folderMap[key] || folderMap.root
    const fs = require('fs')
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
    shell.openPath(folder)
    return { ok: true, path: folder }
  })

  // Comfy Runtime IPC
  ipcMain.handle('app:comfy:queue-prompt', (_event, baseUrl, workflow) => comfyExecutor.queuePrompt(baseUrl, workflow))
  ipcMain.handle('app:comfy:get-history', (_event, baseUrl, promptId) => comfyExecutor.getHistory(baseUrl, promptId))
  ipcMain.handle('app:comfy:fetch-image', (_event, baseUrl, imageMeta) => comfyExecutor.fetchImage(baseUrl, imageMeta))

  // Asset Persistence IPC
  ipcMain.handle('app:assets:save-data-url', (event, dataUrl, projectId) => {
    requireTrustedRenderer(event)
    return assetManager.saveDataUrl(dataUrl, projectId)
  })
  ipcMain.handle('app:assets:read-as-data-url', (event, assetPath) => {
    requireTrustedRenderer(event)
    return assetManager.readAsDataUrl(assetPath)
  })
  ipcMain.handle('app:agent-assets:save-data-url', (event, dataUrl, runId) => {
    requireTrustedRenderer(event)
    return assetManager.saveAgentDataUrl(dataUrl, runId)
  })
  ipcMain.handle('app:agent-assets:read-as-data-url', (event, assetRef, runId, assetProof) => {
    requireTrustedRenderer(event)
    return assetManager.readAgentAsDataUrl(assetRef, runId, assetProof)
  })
  ipcMain.handle('app:agent-assets:delete-refs', (event, runId, assetRefs, retainedRefs) => {
    requireTrustedRenderer(event)
    return assetManager.deleteAgentRefs(runId, assetRefs, retainedRefs)
  })

  // Agent desktop tools. Every handler independently verifies the renderer;
  // approval-bearing actions are validated again inside agent-tools.
  ipcMain.handle('app:agent-tools:get-capabilities', (event) => {
    requireTrustedRenderer(event)
    return agentTools.getCapabilities()
  })
  ipcMain.handle('app:agent-tools:get-workspace-root', (event) => {
    requireTrustedRenderer(event)
    return agentTools.getWorkspaceRoot()
  })
  ipcMain.handle('app:agent-tools:choose-workspace-root', async (event, input) => {
    requireTrustedRenderer(event)
    const result = await dialog.showOpenDialog({
      title: '选择 Agent Workspace Root',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true }
    return agentTools.setChosenWorkspaceRoot(result.filePaths[0])
  })
  ipcMain.handle('app:agent-tools:set-workspace-root', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.setWorkspaceRoot(await confirmAgentToolAction(event, 'workspace.set', input))
  })
  ipcMain.handle('app:agent-tools:list-files', (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.listFiles(input)
  })
  ipcMain.handle('app:agent-tools:read-file', (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.readFile(input)
  })
  ipcMain.handle('app:agent-tools:write-file', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.writeFile(await confirmAgentToolAction(event, 'workspace.write', input))
  })
  ipcMain.handle('app:agent-tools:apply-patch', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.applyPatch(await confirmAgentToolAction(event, 'workspace.patch', input))
  })
  ipcMain.handle('app:agent-tools:revert-patch', async (event, input) => {
    requireTrustedRenderer(event)
    const prepared = agentTools.prepareRevertPatch(input)
    const expectedWorkspaceIdentity = {
      workspaceRoot: prepared.workspaceRoot,
      workspaceGeneration: prepared.workspaceGeneration
    }
    return agentTools.revertPatch(await confirmAgentToolAction(
      event,
      'workspace.revert_patch',
      prepared,
      { expectedWorkspaceIdentity }
    ))
  })
  ipcMain.handle('app:agent-tools:search-files', (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.searchFiles(input)
  })
  ipcMain.handle('app:agent-tools:start-command', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.startCommand(await confirmAgentToolAction(event, 'terminal.run', input))
  })
  ipcMain.handle('app:agent-tools:get-command', (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.getCommand(input)
  })
  ipcMain.handle('app:agent-tools:cancel-command', (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.cancelCommand(input)
  })
  ipcMain.handle('app:agent-tools:get-permissions', (event) => {
    requireTrustedRenderer(event)
    return agentTools.getPermissions()
  })
  ipcMain.handle('app:agent-tools:capture-screen', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.captureScreen(await confirmAgentToolAction(event, 'computer.capture_screen', input))
  })
  ipcMain.handle('app:agent-tools:open-application', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.openApplication(await confirmAgentToolAction(event, 'computer.open_application', input))
  })
  ipcMain.handle('app:agent-tools:click', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.click(await confirmAgentToolAction(event, 'computer.click', input))
  })
  ipcMain.handle('app:agent-tools:type-text', async (event, input) => {
    requireTrustedRenderer(event)
    return agentTools.typeText(await confirmAgentToolAction(event, 'computer.type_text', input))
  })

  // Image Generation IPC (main-process execution for stability)
  ipcMain.handle('app:image:generate', (_event, config) => imageGeneration.executeImageGeneration(config))
  ipcMain.handle('app:image:get-pending-result', (_event, taskId) => imageGeneration.getPendingResult(taskId))

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

app.on('before-quit', () => {
  desktopAgentTools?.shutdown?.()
})
