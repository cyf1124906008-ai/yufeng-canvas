/**
 * Main-process image generation executor.
 * Executes the HTTP request in Electron main process so that a renderer crash
 * (refresh / close) does not lose an already-billed result.
 */

const pendingResults = new Map()

// Maximum time to keep a pending result for recovery (30 minutes)
const PENDING_RESULT_TTL = 30 * 60 * 1000

/**
 * Build a multipart/form-data body from IPC-serialised parts.
 * Returns { body: Buffer, contentType: string }
 */
function buildMultipartBody(parts) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2)
  const chunks = []

  for (const part of parts) {
    chunks.push(`--${boundary}\r\n`)
    if (part.type === 'blob') {
      const buf = Buffer.from(part.data, 'base64')
      chunks.push(`Content-Disposition: form-data; name="${part.key}"; filename="${part.filename}"\r\n`)
      chunks.push(`Content-Type: ${part.mimeType}\r\n\r\n`)
      chunks.push(buf)
      chunks.push('\r\n')
    } else {
      chunks.push(`Content-Disposition: form-data; name="${part.key}"\r\n\r\n`)
      chunks.push(part.value)
      chunks.push('\r\n')
    }
  }
  chunks.push(`--${boundary}--\r\n`)

  const body = Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)))
  const contentType = `multipart/form-data; boundary=${boundary}`
  return { body, contentType }
}

/**
 * Execute an image generation HTTP request in the main process.
 * No timeout on the main process side — the provider may have already charged,
 * so we let the request run to completion. The frontend handles UX timeouts
 * separately while the backend keeps waiting for the result.
 *
 * @param {object} config - { url, method, headers, body, taskId, isFormData }
 * @returns {Promise<{ok:boolean, data?:any, error?:string, status?:number}>}
 */
async function executeImageGeneration(config) {
  const { url, method = 'POST', headers = {}, body, taskId, isFormData } = config

  if (!url) return { ok: false, error: '缺少请求 URL' }

  try {
    const fetchOptions = { method, headers: { ...headers } }

    if (body && method !== 'GET') {
      if (isFormData && typeof body === 'string') {
        // Reconstruct multipart/form-data from IPC-serialised parts
        try {
          const parts = JSON.parse(body)
          if (Array.isArray(parts)) {
            const { body: multipartBody, contentType } = buildMultipartBody(parts)
            fetchOptions.body = multipartBody
            fetchOptions.headers['Content-Type'] = contentType
          } else {
            fetchOptions.body = body
            fetchOptions.headers['Content-Type'] = 'application/json'
          }
        } catch {
          fetchOptions.body = body
          fetchOptions.headers['Content-Type'] = 'application/json'
        }
      } else {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
        if (!fetchOptions.headers['Content-Type']) {
          fetchOptions.headers['Content-Type'] = 'application/json'
        }
      }
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
      setTimeout(() => pendingResults.delete(taskId), PENDING_RESULT_TTL)
    }

    return { ok: true, data, status: resp.status }
  } catch (e) {
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
