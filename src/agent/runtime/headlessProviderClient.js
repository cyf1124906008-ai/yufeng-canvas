function readValue(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function cleanString(value) {
  return String(value || '').trim()
}

function capabilityField(capability, suffix) {
  const name = capability.charAt(0).toUpperCase() + capability.slice(1)
  return `current${name}${suffix}`
}

function providerValue(modelStore, capability, suffix) {
  return readValue(modelStore?.[capabilityField(capability, suffix)])
}

function resolveApiKey(modelStore, capability) {
  const provider = cleanString(readValue(modelStore?.currentProvider))
  return cleanString(
    providerValue(modelStore, capability, 'ApiKey') ||
    modelStore?.getApiKeyByProvider?.(provider, capability)
  )
}

function resolveBaseUrl(modelStore, capability) {
  const provider = cleanString(readValue(modelStore?.currentProvider))
  return cleanString(
    providerValue(modelStore, capability, 'BaseUrl') ||
    modelStore?.getBaseUrlByProvider?.(provider, capability) ||
    readValue(modelStore?.currentBaseUrl)
  ).replace(/\/+$/, '')
}

function resolveEndpoint(modelStore, capability, endpoint) {
  const value = cleanString(endpoint)
  if (/^https?:\/\//i.test(value)) return value
  const baseUrl = resolveBaseUrl(modelStore, capability)
  if (!baseUrl) {
    const error = new Error(`Headless ${capability} 请求缺少完整 API 地址`)
    error.code = 'PROVIDER_ENDPOINT_REQUIRED'
    throw error
  }
  return `${baseUrl}/${value.replace(/^\/+/, '')}`
}

async function parseResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function responseError(response, payload) {
  const message = payload?.error?.message || payload?.message ||
    `Provider request failed: ${response.status}`
  const error = new Error(message)
  error.status = response.status
  error.response = { status: response.status, data: payload }
  return error
}

/**
 * Minimal Provider client for the headless runtime. It intentionally depends
 * only on fetch and modelStore configuration, never on Canvas/request modules.
 */
export function createHeadlessProviderClient({
  modelStore,
  capability,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!modelStore) throw new Error('Headless Provider client 需要 modelStore')
  if (!['image', 'video'].includes(capability)) {
    throw new Error(`Headless Provider client 不支持能力: ${capability || '(empty)'}`)
  }
  if (typeof fetchImpl !== 'function') throw new Error('Headless Provider client 需要 fetch 实现')

  const request = async ({ endpoint, method = 'POST', data, signal }) => {
    const url = resolveEndpoint(modelStore, capability, endpoint)
    const apiKey = resolveApiKey(modelStore, capability)
    const response = await fetchImpl(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(data ?? {}) }),
      signal
    })
    const payload = await parseResponse(response)
    if (!response.ok) throw responseError(response, payload)
    return payload
  }

  return { request }
}

export function createHeadlessImageApiClient({ modelStore, fetchImpl } = {}) {
  const client = createHeadlessProviderClient({ modelStore, capability: 'image', fetchImpl })
  return {
    generateImage(data, options = {}) {
      return client.request({
        endpoint: options.endpoint || modelStore.getImageEndpoint?.(),
        data,
        signal: options.signal
      })
    },
    generateImageWithChat(data, options = {}) {
      return client.request({
        endpoint: options.endpoint || modelStore.getChatEndpoint?.(),
        data,
        signal: options.signal
      })
    }
  }
}

export function createHeadlessVideoApiClient({ modelStore, fetchImpl } = {}) {
  const client = createHeadlessProviderClient({ modelStore, capability: 'video', fetchImpl })
  return {
    createVideoTask(data, options = {}) {
      return client.request({
        endpoint: options.endpoint || modelStore.getVideoEndpoint?.(),
        data,
        signal: options.signal
      })
    },
    getVideoTaskStatus(_taskId, options = {}) {
      return client.request({
        endpoint: options.endpoint || modelStore.getVideoTaskEndpoint?.(),
        method: 'GET',
        signal: options.signal
      })
    }
  }
}

export {
  parseResponse,
  resolveApiKey,
  resolveBaseUrl,
  resolveEndpoint
}

export default createHeadlessProviderClient
