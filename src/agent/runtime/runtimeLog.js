const MEDIA_URL_PATTERN = /^(?:data:|blob:|file:|https?:\/\/)/i

function sanitizeValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return MEDIA_URL_PATTERN.test(value.trim()) ? '[media-url-hidden]' : value
  }
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'

  seen.add(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, seen))

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['url', 'assetPath', 'apiKey', 'authorization'].includes(key))
      .map(([key, item]) => [key, sanitizeValue(item, seen)])
  )
}

export function appendRuntimeLog(runtimeLogs, type, message, details) {
  const sanitizedDetails = details === undefined ? undefined : sanitizeValue(details)
  const entry = {
    id: `agent_log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level: type,
    type,
    message,
    timestamp: Date.now()
  }

  if (sanitizedDetails !== undefined) {
    // Keep both names: the existing Canvas log panel reads `meta`, while the
    // Agent-facing API exposes the more explicit `details` field.
    entry.meta = sanitizedDetails
    entry.details = sanitizedDetails
  }
  runtimeLogs?.value?.unshift(entry)
  if (runtimeLogs?.value?.length > 120) {
    runtimeLogs.value = runtimeLogs.value.slice(0, 120)
  }
  return entry
}

export { sanitizeValue }
