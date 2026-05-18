/**
 * Main-process image generation executor.
 * Executes the HTTP request in Electron main process so that a renderer crash
 * (refresh / close) does not lose an already-billed result.
 */

const pendingResults = new Map()
let electronNet = null

try {
  electronNet = require('electron')?.net || null
} catch {
  electronNet = null
}

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

  if (!url) return { ok: false, error: '\u7f3a\u5c11\u8bf7\u6c42 URL' }

  let safeUrl
  try {
    safeUrl = new URL(url)
  } catch {
    return { ok: false, error: `\u56fe\u7247\u63a5\u53e3\u5730\u5740\u65e0\u6548\uff1a${url}` }
  }

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

    // Electron's network stack follows the app/system proxy and certificate
    // behavior better than Node's global fetch on Windows desktop builds.
    const fetchImpl = typeof electronNet?.fetch === 'function'
      ? electronNet.fetch.bind(electronNet)
      : fetch
    const resp = await fetchImpl(url, fetchOptions)
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
    const cause = e?.cause || {}
    const code = cause.code || cause.errno || e.code || ''
    const detail = [
      e?.message,
      code ? `\u9519\u8bef\u7801\uff1a${code}` : '',
      safeUrl?.host ? `\u63a5\u53e3\uff1a${safeUrl.host}` : ''
    ].filter(Boolean).join('\uff1b')

    return {
      ok: false,
      error: detail
        ? `\u56fe\u7247\u63a5\u53e3\u7f51\u7edc\u8bf7\u6c42\u5931\u8d25\uff1a${detail}\u3002\u8bf7\u68c0\u67e5\u56fe\u7247\u6a21\u578b Base URL\u3001\u7f51\u7edc\u4ee3\u7406\u6216\u4f9b\u5e94\u5546\u670d\u52a1\u72b6\u6001\u3002`
        : '\u56fe\u7247\u751f\u6210\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u56fe\u7247\u6a21\u578b Base URL\u3001\u7f51\u7edc\u4ee3\u7406\u6216\u4f9b\u5e94\u5546\u670d\u52a1\u72b6\u6001\u3002'
    }
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
