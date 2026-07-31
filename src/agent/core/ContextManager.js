const MEDIA_URL_PATTERN = /^(?:data:|blob:|file:|https?:\/\/)/i
const SENSITIVE_KEY_PATTERN = /^(?:api[_-]?key|authorization|token|secret|assetPath|url|base64)$/i

export function sanitizeContextValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return MEDIA_URL_PATTERN.test(value.trim()) ? '[media-reference-hidden]' : value
  }
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  if (Array.isArray(value)) return value.map(item => sanitizeContextValue(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeContextValue(item, seen)
    ])
  )
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
