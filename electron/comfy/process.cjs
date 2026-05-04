const paths = require('./paths.cjs')
const manager = require('./manager.cjs')

function start() {
  if (!paths.mainPyExists()) {
    return {
      running: false,
      error: 'ComfyUI 核心尚未下载，请在后续版本安装或手动放入。'
    }
  }

  // Phase 1: real start logic deferred
  return {
    running: false,
    error: '启动功能将在后续版本支持。'
  }
}

function stop() {
  // Phase 1: real stop logic deferred
  return { running: false, error: '' }
}

async function testConnection(baseUrl) {
  const url = `${baseUrl || 'http://127.0.0.1:8188'}/object_info`
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) {
      return { ok: false, error: `连接失败：HTTP ${resp.status}` }
    }
    const data = await resp.json()
    const count = Object.keys(data).length
    return { ok: true, objectInfoCount: count }
  } catch (e) {
    const msg = e.cause?.code === 'ECONNREFUSED'
      ? '无法连接到 ComfyUI，请确认引擎已启动'
      : e.name === 'TimeoutError'
        ? '连接超时，请确认 ComfyUI 正在运行'
        : `连接失败：${e.message}`
    return { ok: false, error: msg }
  }
}

module.exports = { start, stop, testConnection }
