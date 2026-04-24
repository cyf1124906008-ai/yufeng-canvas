/**
 * Chat API.
 */

import { request, getBaseUrl } from '@/utils'
import { getRuntimeApiKey, getRuntimeBaseUrl } from '@/utils/runtimeConfig'

export const chatCompletions = (data) =>
  request({
    url: '/chat/completions',
    method: 'post',
    data,
    metadata: { capability: 'chat' }
  })

export const streamChatCompletions = async function* (data, signal, options = {}) {
  const apiKey = getRuntimeApiKey(undefined, 'chat')
  const baseUrl = options.baseUrl || getBaseUrl() || getRuntimeBaseUrl()
  const endpoint = options.endpoint || '/chat/completions'

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({ ...data, stream: true }),
    signal
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error?.error?.message || error?.message || 'Stream request failed')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) {
        continue
      }

      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') {
        return
      }

      try {
        const parsed = JSON.parse(payload)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          yield content
        }
      } catch {
        // Ignore malformed chunks.
      }
    }
  }
}
