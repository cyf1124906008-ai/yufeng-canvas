/**
 * Main-process image generation executor.
 * Executes the HTTP request in Electron main process so that a renderer crash
 * (refresh / close) does not lose an already-billed result.
 */

const pendingResults = new Map()

/**
 * Execute an image generation HTTP request in the main process.
 * @param {object} config - { url, method, headers, body, timeout, taskId }
 * @returns {Promise<{ok:boolean, data?:any, error?:string, status?:number}>}
 */
async function executeImageGeneration(config) {
  const { url, method = 'POST', headers = {}, body, timeout = 240000, taskId } = config

  if (!url) return { ok: false, error: '缺少请求 URL' }

  try {
    const fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: AbortSignal.timeout(timeout)
    }

    if (body && method !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const resp = await fetch(url, fetchOptions)
    const contentType = resp.headers.get('content-type') || ''

    let data
    if (contentType.includes('application/json')) {
      data = await resp.json()
    } else {
      data = await resp.text()
    }

    if (!resp.ok) {
      const errMsg = typeof data === 'object'
        ? (data.error?.message || data.message || JSON.stringify(data).slice(0, 300))
        : String(data).slice(0, 300)
      return { ok: false, error: errMsg, status: resp.status, data }
    }

    // Store result so renderer can recover after refresh
    if (taskId) {
      pendingResults.set(taskId, { ok: true, data, timestamp: Date.now() })
      // Auto-cleanup after 10 minutes
      setTimeout(() => pendingResults.delete(taskId), 10 * 60 * 1000)
    }

    return { ok: true, data, status: resp.status }
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { ok: false, error: '图片生成请求超时，请重试' }
    }
    return { ok: false, error: e.message || '图片生成请求失败' }
  }
}

/**
 * Retrieve a stored result for a task (for recovery after renderer refresh).
 */
function getPendingResult(taskId) {
  const result = pendingResults.get(taskId)
  if (!result) return null
  // Return and remove (one-time retrieval)
  pendingResults.delete(taskId)
  return result
}

module.exports = { executeImageGeneration, getPendingResult }
