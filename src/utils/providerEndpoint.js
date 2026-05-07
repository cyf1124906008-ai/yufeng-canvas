/**
 * Provider endpoint normalization and identification.
 * Keeps API base versions such as /v1 and /api/v1, while stripping concrete endpoints.
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

// Endpoint suffixes to remove while preserving versioned API base paths.
// Example: https://host/api/v1/images/generations -> https://host/api/v1
const ENDPOINT_SUFFIXES = [
  '/images/generations',
  '/images/edits',
  '/chat/completions',
  '/videos/generations',
  '/video/generations',
  '/video/task',
  '/audio/speech',
  '/embeddings',
  '/models',
  '/videos',
  '/video'
]

const DEFAULT_ENDPOINTS = {
  chat: '/v1/chat/completions',
  image: '/v1/images/generations',
  imageEdit: '/v1/images/edits',
  video: '/v1/videos',
  videoQuery: '/v1/videos/{taskId}',
  models: '/v1/models'
}

const emptyResult = () => ({
  baseUrl: '',
  detectedEndpoint: '',
  capabilityHint: '',
  identifiedProvider: null,
  identifiedLabel: null,
  warnings: [],
  endpoints: { ...DEFAULT_ENDPOINTS },
  normalized: false
})

function identifyProvider(url) {
  for (const { pattern, provider, label } of PROVIDER_DOMAIN_PATTERNS) {
    if (pattern.test(url)) return { identifiedProvider: provider, identifiedLabel: label }
  }
  return { identifiedProvider: null, identifiedLabel: null }
}

function inferCapabilityFromEndpoint(endpoint = '') {
  if (/images\/(generations|edits)/i.test(endpoint)) return 'image'
  if (/chat\/completions/i.test(endpoint)) return 'chat'
  if (/videos|video\//i.test(endpoint)) return 'video'
  if (/audio\/speech/i.test(endpoint)) return 'audio'
  return ''
}

/**
 * Normalize provider URL. It adds https://, strips concrete endpoint suffixes,
 * and keeps API base prefixes such as /v1 and /api/v1.
 */
export function normalizeProviderEndpoint(input) {
  if (!input || typeof input !== 'string') return emptyResult()

  const original = input.trim()
  if (!original) return emptyResult()

  let url = original
  const warnings = []

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
    warnings.push('已自动添加 https://')
  }

  // Drop query/hash before matching endpoint paths; API base should not store them.
  url = url.replace(/[?#].*$/, '')

  let detectedEndpoint = ''
  const lower = url.toLowerCase().replace(/\/+$/, '')
  const sortedSuffixes = [...ENDPOINT_SUFFIXES].sort((a, b) => b.length - a.length)
  for (const suffix of sortedSuffixes) {
    if (lower.endsWith(suffix.toLowerCase())) {
      detectedEndpoint = url.slice(url.length - suffix.length)
      url = url.slice(0, url.length - suffix.length)
      warnings.push(`已移除完整接口路径 ${suffix}，保留 API Base URL`)
      break
    }
  }

  url = url.replace(/\/+$/, '')

  const { identifiedProvider, identifiedLabel } = identifyProvider(url)
  const capabilityHint = inferCapabilityFromEndpoint(detectedEndpoint)
  const normalized = url !== original

  return {
    baseUrl: url,
    detectedEndpoint,
    capabilityHint,
    identifiedProvider,
    identifiedLabel,
    label: identifiedLabel,
    warnings,
    endpoints: { ...DEFAULT_ENDPOINTS },
    normalized
  }
}

function getModelDiscoveryPaths(baseUrl = '') {
  const clean = String(baseUrl || '').replace(/\/+$/, '').toLowerCase()
  if (/\/(api\/)?v\d+$/.test(clean)) return ['/models']
  return ['/v1/models', '/models', '/api/v1/models']
}

/**
 * Test connection to a provider endpoint.
 * Returns { ok, status, models?, error?, chineseError? }
 */
export async function testProviderConnection({ baseUrl, apiKey }) {
  if (!baseUrl) {
    return { ok: false, error: 'Missing Base URL', chineseError: '请填写 Base URL' }
  }

  const { baseUrl: normalizedUrl } = normalizeProviderEndpoint(baseUrl)
  const testUrl = normalizedUrl || baseUrl
  const paths = getModelDiscoveryPaths(testUrl)
  let lastStatus = 0
  let lastError = null
  let payload = null

  for (const path of paths) {
    try {
      const headers = {}
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`

      const resp = await fetch(`${testUrl}${path}`, { method: 'GET', headers, signal: AbortSignal.timeout(10000) })
      lastStatus = resp.status

      const text = await resp.text()
      if (resp.status === 401 || resp.status === 403) {
        return {
          ok: false,
          status: resp.status,
          error: text || 'Authentication failed',
          chineseError: 'API Key 无效或没有访问权限，请检查 Key、余额和模型权限。'
        }
      }

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
    return { ok: true, status: 200, models, modelCount: models.length, chineseError: null }
  }

  const message = lastError?.error?.message || lastError?.message || `连接失败：尝试了 ${paths.length} 个模型列表路径均未成功`
  return { ok: false, status: lastStatus, error: message, chineseError: translateConnectionError(lastStatus, message) }
}

function normalizeModelPayload(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.models)) return payload.models
  if (Array.isArray(payload?.data?.models)) return payload.data.models
  return []
}

function translateConnectionError(status, message) {
  if (status === 404) return '模型列表接口未找到。请确认 Base URL 只填写到 /v1 或 /api/v1，不要包含具体生成接口。'
  if (status === 401 || status === 403) return 'API Key 无效或没有访问权限。'
  if (status === 429) return '请求过于频繁，请稍后再试。'
  if (status >= 500) return '供应商服务异常，可能暂时不可用。'
  if (/dns|ENOTFOUND|getaddrinfo/i.test(message)) return '域名解析失败，请检查 Base URL 拼写。'
  if (/ECONNREFUSED|network|failed to fetch/i.test(message)) return '网络连接失败，请检查 Base URL 和网络状态。'
  return `连接失败：${message || '未知错误'}`
}

export { DEFAULT_ENDPOINTS, getModelDiscoveryPaths }
