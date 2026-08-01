import { appendRuntimeLog } from './runtimeLog.js'

function read(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function cleanString(value) {
  return String(value || '').trim()
}

function extractText(response) {
  if (typeof response === 'string') return response
  if (typeof response?.output_text === 'string') return response.output_text
  if (typeof response?.content === 'string') return response.content
  if (Array.isArray(response?.content)) {
    return response.content.map(item => item?.text || item?.content || '').join('')
  }
  const content = response?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(item => item?.text || '').join('')
  return ''
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

/** Direct OpenAI-compatible chat client used by the headless Agent runtime. */
export function createHeadlessChatClient({
  modelStore,
  fetchImpl = globalThis.fetch,
  runtimeLogs
} = {}) {
  if (!modelStore) throw new Error('Headless Chat 需要 modelStore')
  if (typeof fetchImpl !== 'function') throw new Error('Headless Chat 需要 fetch 实现')

  const send = async (content, _stream = false, options = {}) => {
    const model = cleanString(options.model || read(modelStore.selectedChatModel))
    if (!model) throw new Error('请先配置文本模型')
    const endpoint = cleanString(modelStore.getChatEndpoint?.())
    if (!endpoint) throw new Error('请先配置文本模型 API 地址')

    const images = Array.isArray(options.images) ? options.images.filter(Boolean) : []
    const userContent = images.length
      ? [
          { type: 'text', text: String(content || '') },
          ...images.map(image => ({
            type: 'image_url',
            image_url: { url: image?.url || image }
          }))
        ]
      : String(content || '')
    const payload = {
      model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        { role: 'user', content: userContent }
      ],
      stream: false
    }
    const adapted = modelStore.adaptRequest?.('chat', payload) || payload
    const provider = cleanString(read(modelStore.currentProvider))
    const apiKey = cleanString(
      read(modelStore.currentChatApiKey) ||
      modelStore.getApiKeyByProvider?.(provider, 'chat')
    )

    appendRuntimeLog(runtimeLogs, 'info', 'Headless 文本模型请求开始', {
      model,
      hasImages: images.length > 0
    })
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(adapted),
      signal: options.signal
    })
    const raw = await parseResponse(response)
    if (!response.ok) {
      const error = new Error(raw?.error?.message || raw?.message || `Chat request failed: ${response.status}`)
      error.status = response.status
      error.response = { status: response.status, data: raw }
      throw error
    }
    const normalized = modelStore.adaptResponse?.('chat', raw) || raw
    const text = extractText(normalized) || extractText(raw)
    if (!text) {
      const error = new Error('文本模型返回为空')
      error.code = 'EMPTY_CHAT_RESPONSE'
      throw error
    }
    appendRuntimeLog(runtimeLogs, 'success', 'Headless 文本模型请求完成', { model })
    return text
  }

  return { send }
}

export { extractText }

export default createHeadlessChatClient
