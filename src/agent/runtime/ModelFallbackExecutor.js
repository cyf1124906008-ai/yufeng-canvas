const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  'MODEL_ATTEMPT_TIMEOUT',
  'PROVIDER_TIMEOUT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UPSTREAM_ERROR'
])

const NON_RETRYABLE_ERROR_CODES = /(?:AUTH|FORBIDDEN|INVALID|MALFORMED|PARAM|ARGUMENT|UNSUPPORTED|NOT_SUPPORTED|CAPABILITY|MODEL_NOT_FOUND|PERMISSION|CONTENT_POLICY|SAFETY)/i
const RETRYABLE_MESSAGE_PATTERN = /(?:timed?\s*out|timeout|temporar(?:y|ily) unavailable|try again|rate[ -]?limit|too many requests|connection (?:reset|refused)|socket hang up|network error|upstream error|service unavailable)/i
const SENSITIVE_KEY_PATTERN = /(?:api[_-]?key|authorization|credential|password|secret|token)/i
const CANDIDATE_IDENTITY_KEYS = ['key', 'id', 'model', 'name', 'label', 'provider']

function statusFromError(error) {
  const values = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.cause?.status,
    error?.cause?.statusCode
  ]
  const value = values.find((item) => Number.isFinite(Number(item)))
  return value == null ? null : Number(value)
}

function codeFromError(error) {
  return String(error?.code || error?.cause?.code || '').trim().toUpperCase()
}

function isAbortError(error) {
  return error?.name === 'AbortError' || codeFromError(error) === 'ABORT_ERR'
}

/** Stable, precedence-ordered classification used by the fallback loop. */
export function classifyFallbackError(error) {
  const status = statusFromError(error)
  const code = codeFromError(error)
  const message = String(error?.message || error || '')

  if (isAbortError(error)) {
    return { retryable: false, category: 'aborted', status, code }
  }
  if (status === 401 || status === 403) {
    return { retryable: false, category: 'authentication', status, code }
  }
  if (NON_RETRYABLE_ERROR_CODES.test(code)) {
    return { retryable: false, category: 'request_or_capability', status, code }
  }
  if ([400, 404, 405, 409, 413, 415, 422].includes(status)) {
    return { retryable: false, category: 'request_or_capability', status, code }
  }
  if (status === 408 || status === 429) {
    return { retryable: true, category: status === 429 ? 'rate_limit' : 'timeout', status, code }
  }
  if (error?.name === 'TimeoutError') {
    return { retryable: true, category: 'timeout', status, code }
  }
  if (status != null && status >= 500 && status <= 599) {
    return { retryable: true, category: 'upstream', status, code }
  }
  if (code === 'MODEL_ATTEMPT_TIMEOUT') {
    return { retryable: true, category: 'timeout', status, code }
  }
  if (error?.retryable === false || error?.isRetryable === false) {
    return { retryable: false, category: 'explicit_non_retryable', status, code }
  }
  if (error?.retryable === true || error?.isRetryable === true) {
    return { retryable: true, category: 'explicit_retryable', status, code }
  }
  if (RETRYABLE_NETWORK_CODES.has(code)) {
    return {
      retryable: true,
      category: code.includes('TIMEOUT') || code.includes('TIMEDOUT') || code === 'ECONNABORTED'
        ? 'timeout'
        : 'network',
      status,
      code
    }
  }
  if (RETRYABLE_MESSAGE_PATTERN.test(message)) {
    return { retryable: true, category: /time/i.test(message) ? 'timeout' : 'transient', status, code }
  }
  return { retryable: false, category: 'non_retryable', status, code }
}

export function isRetryableFallbackError(error) {
  return classifyFallbackError(error).retryable
}

function sanitizeText(value) {
  return String(value || '')
    .replace(/data:[^\s"')]+/gi, '[media-url-hidden]')
    .replace(/blob:[^\s"')]+/gi, '[media-url-hidden]')
    .replace(/file:\/\/[^\s"')]+/gi, '[media-url-hidden]')
    .replace(/https?:\/\/[^\s"')]+/gi, '[url-hidden]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, '[redacted]')
    .replace(/\b(api[_-]?key|authorization|credential|password|secret|token)(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2[redacted]')
}

export function sanitizeFallbackValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return sanitizeText(value)
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => sanitizeFallbackValue(item, seen))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeFallbackValue(item, seen)
  ]))
}

function candidateReference(candidate, index) {
  if (candidate == null || typeof candidate !== 'object') {
    return sanitizeFallbackValue(candidate ?? `candidate-${index + 1}`)
  }

  const identity = {}
  for (const key of CANDIDATE_IDENTITY_KEYS) {
    if (candidate[key] != null) identity[key] = sanitizeFallbackValue(candidate[key])
  }
  return Object.keys(identity).length ? identity : { index }
}

function errorSummary(error, classification) {
  return {
    name: sanitizeText(error?.name || 'Error'),
    message: sanitizeText(error?.message || String(error)),
    ...(classification.code ? { code: sanitizeText(classification.code) } : {}),
    ...(classification.status == null ? {} : { status: classification.status }),
    category: classification.category
  }
}

function createAbortError(reason, attempts = []) {
  const sourceMessage = reason?.message || reason || 'Model fallback execution aborted'
  const error = new Error(sanitizeText(sourceMessage))
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  error.attempts = attempts.map((attempt) => sanitizeFallbackValue(attempt))
  return error
}

export class ModelAttemptTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Model attempt timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
    this.code = 'MODEL_ATTEMPT_TIMEOUT'
    this.timeoutMs = timeoutMs
    this.retryable = true
  }
}

export class ModelFallbackError extends Error {
  constructor({ attempts, lastError, retryable }) {
    const prefix = retryable ? 'All model fallback candidates failed' : 'Model fallback stopped'
    const lastMessage = sanitizeText(lastError?.message || String(lastError || 'Unknown error'))
    super(`${prefix} after ${attempts.length} attempt${attempts.length === 1 ? '' : 's'}: ${lastMessage}`)
    this.name = 'ModelFallbackError'
    this.code = retryable ? 'MODEL_FALLBACK_EXHAUSTED' : 'MODEL_FALLBACK_STOPPED'
    this.retryable = retryable
    this.attempts = attempts.map((attempt) => sanitizeFallbackValue(attempt))
    this.lastError = this.attempts.at(-1)?.error || null
    if (this.lastError?.status != null) this.status = this.lastError.status
  }
}

async function notifyAttempt(callback, summary) {
  if (typeof callback !== 'function') return
  try {
    await callback(sanitizeFallbackValue(summary))
  } catch {
    // Telemetry/logging callbacks must never change fallback semantics.
  }
}

function executeAttempt(candidate, execute, attemptContext, { parentSignal, timeoutMs }) {
  if (parentSignal?.aborted) {
    return Promise.reject(createAbortError(parentSignal.reason))
  }
  const controller = new AbortController()
  let timeoutId = null
  let detachParent = () => {}

  const cancellation = new Promise((_, reject) => {
    if (parentSignal) {
      const onAbort = () => {
        const abortError = createAbortError(parentSignal.reason)
        // Reject first so a cooperative execute() rejecting with AbortError
        // cannot mask an internally generated timeout or parent cancellation.
        reject(abortError)
        controller.abort(abortError)
      }
      if (parentSignal.aborted) {
        onAbort()
      } else {
        parentSignal.addEventListener('abort', onAbort, { once: true })
        detachParent = () => parentSignal.removeEventListener('abort', onAbort)
      }
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        const timeoutError = new ModelAttemptTimeoutError(timeoutMs)
        reject(timeoutError)
        controller.abort(timeoutError)
      }, timeoutMs)
    }
  })

  const execution = Promise.resolve().then(() => execute(candidate, {
    ...attemptContext,
    signal: controller.signal
  }))

  return Promise.race([execution, cancellation]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
    detachParent()
  })
}

export class ModelFallbackExecutor {
  constructor({ timeoutMs = 0, onAttempt } = {}) {
    this.timeoutMs = Math.max(0, Number(timeoutMs) || 0)
    this.onAttempt = onAttempt
  }

  /**
   * @returns {{result: *, candidate: *, candidateIndex: number, attempts: Array}}
   */
  async run(candidates, execute, options = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new TypeError('ModelFallbackExecutor.run requires at least one candidate')
    }
    if (typeof execute !== 'function') {
      throw new TypeError('ModelFallbackExecutor.run requires execute(candidate, attemptContext)')
    }

    const signal = options.signal
    const timeoutMs = options.timeoutMs == null
      ? this.timeoutMs
      : Math.max(0, Number(options.timeoutMs) || 0)
    const onAttempt = options.onAttempt || this.onAttempt
    const attempts = []

    if (signal?.aborted) throw createAbortError(signal.reason, attempts)

    for (let index = 0; index < candidates.length; index += 1) {
      if (signal?.aborted) throw createAbortError(signal.reason, attempts)

      const candidate = candidates[index]
      const startedAt = Date.now()
      const baseSummary = {
        attempt: index + 1,
        index,
        total: candidates.length,
        candidate: candidateReference(candidate, index),
        startedAt
      }

      try {
        const result = await executeAttempt(candidate, execute, {
          attempt: index + 1,
          index,
          total: candidates.length,
          timeoutMs,
          candidate: baseSummary.candidate,
          previousAttempts: attempts.map((attempt) => sanitizeFallbackValue(attempt)),
          context: options.context
        }, { parentSignal: signal, timeoutMs })

        const finishedAt = Date.now()
        const summary = {
          ...baseSummary,
          status: 'succeeded',
          finishedAt,
          durationMs: Math.max(0, finishedAt - startedAt)
        }
        attempts.push(summary)
        await notifyAttempt(onAttempt, summary)
        return {
          result,
          candidate,
          candidateIndex: index,
          attempts: attempts.map((attempt) => sanitizeFallbackValue(attempt))
        }
      } catch (error) {
        const classification = classifyFallbackError(error)
        const finishedAt = Date.now()
        const summary = {
          ...baseSummary,
          status: classification.category === 'aborted' ? 'aborted' : 'failed',
          finishedAt,
          durationMs: Math.max(0, finishedAt - startedAt),
          retryable: classification.retryable,
          error: errorSummary(error, classification)
        }
        attempts.push(summary)
        await notifyAttempt(onAttempt, summary)

        if (classification.category === 'aborted' || signal?.aborted) {
          throw createAbortError(signal?.reason || error, attempts)
        }

        const hasNextCandidate = index < candidates.length - 1
        if (!classification.retryable || !hasNextCandidate) {
          throw new ModelFallbackError({
            attempts,
            lastError: error,
            retryable: classification.retryable
          })
        }
      }
    }

    // The loop can only reach this line if the candidate array is mutated while
    // running. Keep the failure deterministic and sanitized in that edge case.
    throw new ModelFallbackError({ attempts, lastError: new Error('No candidate completed'), retryable: true })
  }
}

export function executeWithModelFallback(candidates, execute, options = {}) {
  return new ModelFallbackExecutor(options).run(candidates, execute, options)
}

export default ModelFallbackExecutor
