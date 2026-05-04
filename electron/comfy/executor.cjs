const manager = require('./manager.cjs')

const ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1']

function normalizeBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let url
  try { url = new URL(raw.trim()) } catch { return null }
  if (url.protocol !== 'http:') return null
  if (!ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) return null
  return `http://${url.hostname}:${url.port || '8188'}`
}

function formatError(e) {
  if (e.cause?.code === 'ECONNREFUSED') return '无法连接到 ComfyUI，请确认引擎已启动'
  if (e.name === 'TimeoutError') return 'Comfy 连接超时，请确认引擎正在运行'
  return `Comfy 请求失败：${e.message}`
}

async function queuePrompt(rawUrl, workflow) {
  const baseUrl = normalizeBaseUrl(rawUrl)
  if (!baseUrl) {
    manager.appendLog('提交任务失败：仅允许本地地址', 'error')
    return { ok: false, error: '仅允许本地地址（127.0.0.1 / localhost / [::1]）' }
  }

  manager.appendLog(`提交任务到 ${baseUrl}/prompt`, 'info')

  try {
    const resp = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: 'yufeng-canvas' }),
      signal: AbortSignal.timeout(10000)
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      const err = `Comfy 返回错误 (${resp.status}): ${text.slice(0, 200)}`
      manager.appendLog(err, 'error')
      return { ok: false, error: err }
    }

    const data = await resp.json()
    if (!data.prompt_id) {
      const err = 'Comfy 没有返回任务 ID'
      manager.appendLog(err, 'error')
      return { ok: false, error: err }
    }

    manager.appendLog(`任务已提交，prompt_id: ${data.prompt_id}`, 'info')
    return { ok: true, promptId: data.prompt_id }
  } catch (e) {
    const msg = formatError(e)
    manager.appendLog(msg, 'error')
    return { ok: false, error: msg }
  }
}

async function getHistory(rawUrl, promptId) {
  const baseUrl = normalizeBaseUrl(rawUrl)
  if (!baseUrl) return { ok: false, error: '仅允许本地地址' }

  try {
    const resp = await fetch(`${baseUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(10000)
    })
    if (!resp.ok) return { ok: false, error: `获取历史失败: HTTP ${resp.status}` }
    const data = await resp.json()
    const item = data[promptId] || data
    return { ok: true, history: item || null }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

async function fetchImage(rawUrl, imageMeta) {
  const baseUrl = normalizeBaseUrl(rawUrl)
  if (!baseUrl) return { ok: false, error: '仅允许本地地址' }

  const params = new URLSearchParams({ filename: imageMeta.filename })
  if (imageMeta.subfolder) params.set('subfolder', imageMeta.subfolder)
  if (imageMeta.type) params.set('type', imageMeta.type)

  try {
    const resp = await fetch(`${baseUrl}/view?${params}`, {
      signal: AbortSignal.timeout(30000)
    })
    if (!resp.ok) return { ok: false, error: `获取图片失败: HTTP ${resp.status}` }
    const buffer = Buffer.from(await resp.arrayBuffer())
    const contentType = resp.headers.get('content-type') || 'image/png'
    const base64 = `data:${contentType};base64,${buffer.toString('base64')}`
    return { ok: true, dataUrl: base64 }
  } catch (e) {
    return { ok: false, error: formatError(e) }
  }
}

function extractOutputImages(historyItem) {
  if (!historyItem?.outputs) return []
  const images = []
  for (const output of Object.values(historyItem.outputs)) {
    if (Array.isArray(output.images)) {
      for (const img of output.images) {
        if (img.filename) images.push(img)
      }
    }
  }
  return images
}

module.exports = { queuePrompt, getHistory, fetchImage, extractOutputImages }
