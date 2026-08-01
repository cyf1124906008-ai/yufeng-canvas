export const REASONING_EFFORT_VALUES = Object.freeze([
  'auto',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
])

const REASONING_EFFORT_SET = new Set(REASONING_EFFORT_VALUES)
const UNSUPPORTED_PARAMETER_HINTS = [
  'unsupported',
  'not supported',
  'unknown',
  'unrecognized',
  'invalid',
  'not permitted',
  'extra field',
  'extra fields'
]

function read(value) {
  try {
    const resolved = typeof value === 'function' ? value() : value
    return resolved && typeof resolved === 'object' && 'value' in resolved
      ? resolved.value
      : resolved
  } catch {
    return undefined
  }
}

export function normalizeReasoningEffort(value, fallback = 'auto') {
  const normalized = String(read(value) || '').trim().toLowerCase()
  if (REASONING_EFFORT_SET.has(normalized)) return normalized
  return REASONING_EFFORT_SET.has(fallback) ? fallback : 'auto'
}

export function reasoningEffortRequestValue(value) {
  const normalized = normalizeReasoningEffort(value)
  return normalized === 'auto' ? undefined : normalized
}

export function isUnsupportedReasoningEffortResponse(status, payload) {
  if (![400, 422].includes(Number(status))) return false
  let text = ''
  try {
    text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  } catch {
    text = String(payload || '')
  }
  const normalized = text.toLowerCase()
  const namesParameter = normalized.includes('reasoning_effort') || normalized.includes('reasoning effort')
  return namesParameter && UNSUPPORTED_PARAMETER_HINTS.some(hint => normalized.includes(hint))
}
