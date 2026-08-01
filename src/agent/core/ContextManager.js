const MEDIA_URL_PATTERN = /^(?:data:|blob:|file:|https?:\/\/)/i
const SENSITIVE_KEY_PATTERN = /^(?:api[_-]?key|authorization|auth[_-]?token|token|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?token|(?:set[_-]?)?cookie|private[_-]?key|password|asset[_-]?path|url)$/i
const BASE64_KEY_PATTERN = /^(?:base64|b64[_-]?json|image[_-]?data|video[_-]?data|media[_-]?data)$/i
const LIKELY_BARE_BASE64 = /^[a-z0-9+/]+={0,2}$/i

function isLikelyBareBase64(value) {
  if (typeof value !== 'string' || value.length < 128) return false
  const normalized = value.trim()
  if (/[^\S\r\n]/.test(normalized)) return false
  const compact = normalized.replace(/[\r\n]/g, '')
  return compact.length >= 128 && compact.length % 4 === 0 && LIKELY_BARE_BASE64.test(compact)
}

export function sanitizeContextValue(value, seen = new WeakSet(), key = '') {
  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]'
    if (BASE64_KEY_PATTERN.test(key) || isLikelyBareBase64(value)) return '[media-data-omitted]'
    return MEDIA_URL_PATTERN.test(value.trim()) ? '[media-reference-hidden]' : value
  }
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  if (Array.isArray(value)) {
    const result = value.map(item => sanitizeContextValue(item, seen))
    seen.delete(value)
    return result
  }

  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? '[redacted]'
        : BASE64_KEY_PATTERN.test(key)
          ? '[media-data-omitted]'
          : sanitizeContextValue(item, seen, key)
    ])
  )
  seen.delete(value)
  return result
}

function summarize(value, maxLength) {
  const sanitized = sanitizeContextValue(value)
  let text
  if (typeof sanitized === 'string') text = sanitized
  else {
    try {
      text = JSON.stringify(sanitized)
    } catch {
      text = String(sanitized)
    }
  }
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

/**
 * Small bounded history used by the planner. Large media payloads stay in state
 * and are represented here by compact observations.
 */
export class ContextManager {
  constructor({ maxEntries = 40, maxEntryLength = 2_000 } = {}) {
    this.maxEntries = maxEntries
    this.maxEntryLength = maxEntryLength
    this.entries = []
  }

  add(role, content, metadata = {}) {
    const entry = {
      role,
      content: summarize(content, this.maxEntryLength),
      metadata: { ...metadata },
      timestamp: Date.now()
    }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
    return entry
  }

  addGoal(goal) {
    return this.add('user', goal, { kind: 'goal' })
  }

  addAction(action) {
    return this.add('assistant', action, { kind: 'action' })
  }

  addObservation(actionName, result) {
    return this.add('tool', result, { kind: 'observation', action: actionName })
  }

  addSystem(content, metadata = {}) {
    return this.add('system', content, metadata)
  }

  recent(limit = this.maxEntries) {
    return this.entries.slice(-limit).map(entry => ({ ...entry, metadata: { ...entry.metadata } }))
  }

  toMessages(limit = this.maxEntries) {
    return this.recent(limit).map(({ role, content }) => ({ role, content }))
  }

  clear() {
    this.entries.length = 0
  }
}

export default ContextManager
