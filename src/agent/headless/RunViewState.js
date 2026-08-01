const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])
const SECRET_KEYS = /^(?:api[_-]?key|authorization|auth[_-]?token|token|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?token|(?:set[_-]?)?cookie|private[_-]?key|password)$/i
const BASE64_KEYS = /^(?:base64|b64[_-]?json|image[_-]?data|video[_-]?data|media[_-]?data)$/i
const DATA_URL = /^data:[^;,]+(?:;[^,]*)?;base64,/i
const LIKELY_BARE_BASE64 = /^[a-z0-9+/]+={0,2}$/i

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function isLikelyBareBase64(value) {
  if (typeof value !== 'string' || value.length < 128) return false
  const normalized = value.trim()
  if (/[^\S\r\n]/.test(normalized)) return false
  const compact = normalized.replace(/[\r\n]/g, '')
  return compact.length >= 128 && compact.length % 4 === 0 && LIKELY_BARE_BASE64.test(compact)
}

/**
 * Make event fragments safe and bounded before they enter a long-lived run
 * projection. Media payloads and credentials are never retained.
 */
export function sanitizeRunValue(value, {
  maxDepth = 7,
  maxStringLength = 4_000,
  maxArrayLength = 100
} = {}, seen = new WeakSet(), depth = 0, key = '') {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: String(value.message || value).slice(0, maxStringLength),
      ...(value.code == null ? {} : { code: String(value.code).slice(0, 200) })
    }
  }
  if (typeof value === 'string') {
    if (SECRET_KEYS.test(key)) return '[redacted]'
    if (BASE64_KEYS.test(key) || DATA_URL.test(value) || isLikelyBareBase64(value)) {
      return '[media-data-omitted]'
    }
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}…`
      : value
  }
  if (depth >= maxDepth) return '[max-depth]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.slice(0, maxArrayLength)
      .map(item => sanitizeRunValue(item, { maxDepth, maxStringLength, maxArrayLength }, seen, depth + 1))
      .filter(item => item !== undefined)
    seen.delete(value)
    return result
  }

  const result = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    if (SECRET_KEYS.test(childKey)) {
      result[childKey] = '[redacted]'
      continue
    }
    if (BASE64_KEYS.test(childKey)) {
      result[childKey] = '[media-data-omitted]'
      continue
    }
    const sanitized = sanitizeRunValue(
      childValue,
      { maxDepth, maxStringLength, maxArrayLength },
      seen,
      depth + 1,
      childKey
    )
    if (sanitized !== undefined) result[childKey] = sanitized
  }
  seen.delete(value)
  return result
}

function initialState(values = {}) {
  return {
    runId: values.runId || null,
    goal: String(values.goal || ''),
    targetType: values.targetType || null,
    status: values.status || 'idle',
    currentAction: values.currentAction || null,
    timeline: Array.isArray(values.timeline) ? clone(values.timeline) : [],
    artifacts: Array.isArray(values.artifacts) ? clone(values.artifacts) : [],
    final: values.final ? clone(values.final) : null,
    error: values.error ? clone(values.error) : null,
    stepCount: Number(values.stepCount || 0),
    startedAt: values.startedAt || null,
    updatedAt: values.updatedAt || null,
    completedAt: values.completedAt || null
  }
}

/** Serializable headless view of one Agent run. */
export class RunViewState {
  constructor(values = {}) {
    Object.assign(this, initialState(sanitizeRunValue(values)))
  }

  patch(values = {}) {
    const safe = sanitizeRunValue(values)
    for (const [key, value] of Object.entries(safe)) {
      if (['timeline', 'artifacts'].includes(key)) continue
      this[key] = value
    }
    return this
  }

  addTimeline(entry, maxEntries = 500) {
    this.timeline.push(sanitizeRunValue(entry))
    if (this.timeline.length > maxEntries) {
      this.timeline.splice(0, this.timeline.length - maxEntries)
    }
    return this
  }

  upsertArtifact(artifact) {
    const safe = sanitizeRunValue(artifact)
    const index = this.artifacts.findIndex(item => item.id === safe.id)
    if (index >= 0) this.artifacts[index] = safe
    else this.artifacts.push(safe)
    return this
  }

  reset(values = {}) {
    Object.assign(this, initialState(sanitizeRunValue(values)))
    return this
  }

  isTerminal() {
    return TERMINAL_STATUSES.has(this.status)
  }

  snapshot() {
    return clone(sanitizeRunValue({
      runId: this.runId,
      goal: this.goal,
      targetType: this.targetType,
      status: this.status,
      currentAction: this.currentAction,
      timeline: this.timeline,
      artifacts: this.artifacts,
      final: this.final,
      error: this.error,
      stepCount: this.stepCount,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt
    }))
  }
}

export default RunViewState
