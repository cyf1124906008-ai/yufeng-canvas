const paths = require('./paths.cjs')
const manager = require('./manager.cjs')

const ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1']

function isAllowedHost(hostname) {
  const h = hostname.toLowerCase()
  return ALLOWED_HOSTS.includes(h)
}

function normalizeBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return 'http://127.0.0.1:8188'

  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return 'http://127.0.0.1:8188'
  }

  if (url.protocol !== 'http:') {
    return null
  }

  if (!isAllowedHost(url.hostname)) {
    return null
  }

  const port = url.port || '8188'
  return `http://${url.hostname}:${port}`
}

function start() {
  if (!paths.mainPyExists()) {
    manager.appendLog('启动失败：ComfyUI 核心尚未下载', 'error')
    manager.setConfig({ error: 'ComfyUI 核心尚未下载，请在后续版本安装或手动放入。' })
    return manager.getStatus()
  }

  manager.appendLog('启动功能将在后续版本支持', 'warn')
  manager.setConfig({ error: '启动功能将在后续版本支持。' })
  return manager.getStatus()
}

function stop() {
  manager.appendLog('停止功能将在后续版本支持', 'warn')
  manager.setConfig({ error: '' })
  return manager.getStatus()
}

async function testConnection(rawUrl) {
  const baseUrl = normalizeBaseUrl(rawUrl)

  if (!baseUrl) {
    manager.appendLog('测试连接失败：仅允许 http://127.0.0.1、http://localhost 或 http://[::1]', 'error')
    manager.setConfig({ error: '测试连接失败：仅允许本地地址', lastCheckedAt: Date.now() })
    return { ok: false, error: '仅允许 http://127.0.0.1、http://localhost 或 http://[::1]' }
  }

  const url = `${baseUrl}/object_info`
  manager.appendLog(`正在测试连接 ${url}`, 'info')

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) {
      const err = `连接失败：HTTP ${resp.status}`
      manager.appendLog(err, 'error')
      manager.setConfig({ error: err, lastCheckedAt: Date.now() })
      return { ok: false, error: err }
    }
    const data = await resp.json()
    const count = Object.keys(data).length
    manager.appendLog(`连接成功，检测到 ${count} 个节点`, 'info')
    manager.setConfig({
      baseUrl,
      objectInfoCount: count,
      lastConnectedAt: Date.now(),
      error: ''
    })
    return { ok: true, objectInfoCount: count }
  } catch (e) {
    const msg = e.cause?.code === 'ECONNREFUSED'
      ? '无法连接到 ComfyUI，请确认引擎已启动'
      : e.name === 'TimeoutError'
        ? '连接超时，请确认 ComfyUI 正在运行'
        : `连接失败：${e.message}`
    manager.appendLog(msg, 'error')
    manager.setConfig({ error: msg, lastCheckedAt: Date.now() })
    return { ok: false, error: msg }
  }
}

module.exports = { start, stop, testConnection }
