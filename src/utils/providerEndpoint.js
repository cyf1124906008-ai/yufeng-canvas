/**
 * Provider endpoint normalization and identification.
 * Strips endpoint paths, identifies provider type, suggests canonical endpoints.
 */

const PROVIDER_DOMAIN_PATTERNS = [
  { pattern: /dataeyes|shuyanai|platform\.shuyanai/i, provider: 'dataeyes', label: 'DataEyes' },
  { pattern: /openrouter/i, provider: 'openai', label: 'OpenRouter' },
  { pattern: /siliconflow|silicon\.flow/i, provider: 'openai', label: 'SiliconFlow' },
  { pattern: /dashscope|aliyun|alicloud/i, provider: 'openai', label: '阿里云百炼' },
  { pattern: /volcengine|volces/i, provider: 'openai', label: '火山引擎' },
  { pattern: /deepseek/i, provider: 'openai', label: 'DeepSeek' },
  { pattern: /moonshot|kimi|msh\.org/i, provider: 'openai', label: 'Moonshot' },
  { pattern: /zhipu|bigmodel/i, provider: 'openai', label: '智谱 AI' },
  { pattern: /minimax/i, provider: 'openai', label: 'MiniMax' },
  { pattern: /stepfun/i, provider: 'openai', label: '阶跃星辰' },
  { pattern: /api\.openai|openai\.com/i, provider: 'openai', label: 'OpenAI' },
  { pattern: /generativelanguage\.google|googleapis/i, provider: 'openai', label: 'Google AI' },
  { pattern: /anthropic|claude\.ai/i, provider: 'openai', label: 'Anthropic' },
  { pattern: /api\.coze|coze\.com/i, provider: 'openai', label: 'Coze' },
  { pattern: /xai\.com|api\.x\.ai/i, provider: 'openai', label: 'xAI' }
]

const KNOWN_ENDPOINT_PATHS = [
  '/v1/images/generations',
  '/v1/images/edits',
  '/v1/chat/completions',
  '/v1/videos',
  '/v1/models',
  '/v1/embeddings',
  '/images/generations',
  '/images/edits',
  '/chat/completions',
  '/models',
  '/videos',
  '/api/v1/models',
  '/api/v1/chat/completions',
  '/api/v1/images/generations'
]

const DEFAULT_ENDPOINTS = {
  chat: '/v1/chat/completions',
  image: '/v1/images/generations',
  imageEdit: '/v1/images/edits',
  video: '/v1/videos',
  videoQuery: '/v1/videos/{taskId}',
  models: '/v1/models'
}

/**
 * Normalize a base URL: strip endpoint paths, add protocol, strip trailing slashes.
 * Enhanced version of request.js normalizeBaseUrl with provider identification.
 */
export function normalizeProviderEndpoint(input) {
  if (!input || typeof input !== 'string') {
    return { baseUrl: '', identifiedProvider: null, identifiedLabel: null, warnings: [], normalized: false }
  }

  let url = input.trim()
  if (!url) {
    return { baseUrl: '', identifiedProvider: null, identifiedLabel: null, warnings: [], normalized: false }
  }

  const warnings = []

  // Add https:// if no protocol
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
    warnings.push('已自动添加 https://')
  }

  // Strip known endpoint paths (longest first for correct matching)
  const sortedPaths = [...KNOWN_ENDPOINT_PATHS].sort((a, b) => b.length - a.length)
  for (const path of sortedPaths) {
    if (url.toLowerCase().endsWith(path.toLowerCase())) {
      url = url.slice(0, url.length - path.length)
      warnings.push(`已移除端点路径 ${path}`)
      break
    }
  }

  // Strip trailing slashes
  url = url.replace(/\/+$/, '')

  // Identify provider by domain
  let identifiedProvider = null
  let identifiedLabel = null
  for (const { pattern, provider, label } of PROVIDER_DOMAIN_PATTERNS) {
    if (pattern.test(url)) {
      identifiedProvider = provider
      identifiedLabel = label
      break
    }
  }

  // Build canonical endpoints for the identified provider
  const endpoints = { ...DEFAULT_ENDPOINTS }

  const normalized = url !== input.trim()
  return { baseUrl: url, identifiedProvider, identifiedLabel, warnings, endpoints, normalized }
}

/**
 * Test connection to a provider endpoint.
 * Returns { ok, status, models?, error?, chineseError? }
 */
export async function testProviderConnection({ baseUrl, apiKey, provider }) {
  if (!baseUrl) {
    return { ok: false, error: '缺少 Base URL', chineseError: '请填写 Base URL' }
  }

  const { baseUrl: normalizedUrl } = normalizeProviderEndpoint(baseUrl)
  const testUrl = normalizedUrl || baseUrl

  const paths = ['/v1/models', '/models', '/api/v1/models']
  let lastStatus = 0
  let lastError = null
  let payload = null

  for (const path of paths) {
    try {
      const headers = {}
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`
      }

      const resp = await fetch(`${testUrl}${path}`, { method: 'GET', headers, signal: AbortSignal.timeout(10000) })
      lastStatus = resp.status

      if (resp.status === 401 || resp.status === 403) {
        return {
          ok: false,
          status: resp.status,
          error: 'Authentication failed',
          chineseError: 'API Key 无效或没有权限，请检查 Key 是否正确。'
        }
      }

      const text = await resp.text()
      if (!resp.ok) {
        try { lastError = JSON.parse(text) } catch { lastError = { message: text.slice(0, 200) } }
        continue
      }

      try { payload = JSON.parse(text) } catch { payload = { raw: text.slice(0, 200) } }
      break
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        return {
          ok: false,
          error: 'Connection timeout',
          chineseError: '连接超时，请检查 Base URL 是否正确、网络是否可达。'
        }
      }
      lastError = e
    }
  }

  if (payload) {
    const models = normalizeModelPayload(payload)
    return {
      ok: true,
      status: 200,
      models,
      modelCount: models.length,
      chineseError: null
    }
  }

  const message = lastError?.error?.message || lastError?.message || `连接失败：尝试了 ${paths.length} 个路径均未成功`
  return {
    ok: false,
    status: lastStatus,
    error: message,
    chineseError: translateConnectionError(lastStatus, message)
  }
}

function normalizeModelPayload(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.models)) return payload.models
  if (Array.isArray(payload?.data?.models)) return payload.data.models
  return []
}

function translateConnectionError(status, message) {
  if (status === 404) return '接口路径未找到。请确认 Base URL 正确（只需填写域名部分）。'
  if (status === 401 || status === 403) return 'API Key 无效或没有权限。'
  if (status === 429) return '请求过于频繁，请稍后再试。'
  if (status >= 500) return '服务端异常，供应商可能暂时不可用。'
  if (/dns|ENOTFOUND|getaddrinfo/i.test(message)) return '域名解析失败，请检查 Base URL 拼写。'
  if (/ECONNREFUSED|network/i.test(message)) return '网络连接被拒绝，请检查 Base URL 和网络状态。'
  return `连接失败：${message || '未知错误'}`
}

export { DEFAULT_ENDPOINTS }
