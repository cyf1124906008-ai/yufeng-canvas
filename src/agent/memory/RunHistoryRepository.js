import { normalizeRemoteUrl } from '../runtime/artifactPersistence.js'

export const RUN_HISTORY_SCHEMA_VERSION = 1
export const RUN_HISTORY_STORAGE_KEY = 'yufeng-agent-run-history-v1'
export const RUN_HISTORY_MAX_ENTRIES = 50

const SECRET_KEYS = /^(?:api[_-]?key|authorization|auth[_-]?token|token|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?token|(?:set[_-]?)?cookie|private[_-]?key|password)$/i
const BASE64_KEYS = /^(?:base64|b64[_-]?json|image[_-]?data|video[_-]?data|media[_-]?data)$/i
const DATA_URL = /^data:/i
const TRANSIENT_URL = /^blob:/i
const PERSISTABLE_ARTIFACT_URL = /^(?:https?:\/\/|file:)/i
const LIKELY_BARE_BASE64 = /^[a-z0-9+/]+={0,2}$/i

function safePersistableUrl(value, maxLength) {
  const text = String(value || '').trim()
  try {
    return normalizeRemoteUrl(text).slice(0, maxLength)
  } catch {
    return '[unsafe-url-omitted]'
  }
}

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function isLikelyBareBase64(value) {
  if (typeof value !== 'string' || value.length < 128) return false
  const normalized = value.trim()
  // MIME-style base64 may contain newlines, but ordinary prose contains spaces
  // or tabs and must remain readable in local history.
  if (/[^\S\r\n]/.test(normalized)) return false
  const compact = normalized.replace(/[\r\n]/g, '')
  return compact.length >= 128 && compact.length % 4 === 0 && LIKELY_BARE_BASE64.test(compact)
}

/**
 * Sanitize a value before it enters durable run history.
 *
 * Unlike Planner context sanitization, local history intentionally keeps
 * Strict public HTTPS artifact URLs so a read-only history UI can preview them.
 * Data URLs, transient blob URLs, credentials, and raw media bytes are never
 * persisted.
 */
export function sanitizeRunHistoryValue(value, options = {}, seen = new WeakSet(), depth = 0, key = '') {
  const {
    maxDepth = 8,
    maxStringLength = 8_000,
    maxArrayLength = 200,
    maxObjectKeys = 100
  } = options

  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (typeof value === 'string') {
    if (SECRET_KEYS.test(key)) return '[redacted]'
    if (BASE64_KEYS.test(key) || DATA_URL.test(value.trim()) || isLikelyBareBase64(value)) {
      return '[media-data-omitted]'
    }
    if (TRANSIENT_URL.test(value.trim())) return '[transient-media-reference-omitted]'
    // Artifact URLs are deliberately retained for local, read-only display.
    if (PERSISTABLE_ARTIFACT_URL.test(value.trim())) return safePersistableUrl(value, maxStringLength)
    return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value
  }
  if (value instanceof Error) {
    return sanitizeRunHistoryValue({
      name: value.name || 'Error',
      message: value.message || String(value),
      ...(value.code == null ? {} : { code: value.code })
    }, options, seen, depth, key)
  }
  if (depth >= maxDepth) return '[max-depth]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.slice(0, maxArrayLength)
      .map(item => sanitizeRunHistoryValue(item, options, seen, depth + 1))
      .filter(item => item !== undefined)
    seen.delete(value)
    return result
  }

  const result = {}
  for (const [childKey, childValue] of Object.entries(value).slice(0, maxObjectKeys)) {
    if (SECRET_KEYS.test(childKey)) {
      result[childKey] = '[redacted]'
      continue
    }
    if (BASE64_KEYS.test(childKey)) {
      result[childKey] = '[media-data-omitted]'
      continue
    }
    const sanitized = sanitizeRunHistoryValue(
      childValue,
      options,
      seen,
      depth + 1,
      childKey
    )
    if (sanitized !== undefined) result[childKey] = sanitized
  }
  seen.delete(value)
  return result
}

function storageMethod(storage, primary, fallback) {
  if (typeof storage?.[primary] === 'function') return storage[primary].bind(storage)
  if (typeof storage?.[fallback] === 'function') return storage[fallback].bind(storage)
  return null
}

function runIdOf(run) {
  const value = run?.runId ?? run?.id
  return value == null ? '' : String(value).trim()
}

function emptyDocument() {
  return {
    schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
    runs: []
  }
}

/** Pure-JS, localStorage-compatible repository for bounded Agent run history. */
export class RunHistoryRepository {
  constructor({
    storage,
    storageKey = RUN_HISTORY_STORAGE_KEY,
    maxEntries = RUN_HISTORY_MAX_ENTRIES,
    maxRecordLength = 64_000,
    sanitizerOptions = {},
    now = () => Date.now()
  } = {}) {
    const read = storageMethod(storage, 'getItem', 'get')
    const write = storageMethod(storage, 'setItem', 'set')
    if (!read || !write) {
      throw new TypeError('RunHistoryRepository requires getItem/setItem or get/set storage methods')
    }
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new TypeError('maxEntries must be a positive integer')
    }
    if (!Number.isInteger(maxRecordLength) || maxRecordLength < 1) {
      throw new TypeError('maxRecordLength must be a positive integer')
    }
    if (typeof now !== 'function') throw new TypeError('now must be a function')

    this.storage = storage
    this.readStorage = read
    this.writeStorage = write
    this.removeStorage = storageMethod(storage, 'removeItem', 'delete')
    this.storageKey = String(storageKey)
    this.maxEntries = Math.min(maxEntries, RUN_HISTORY_MAX_ENTRIES)
    this.maxRecordLength = maxRecordLength
    this.maxDocumentLength = (this.maxEntries * this.maxRecordLength) + 4_096
    this.sanitizerOptions = { ...sanitizerOptions }
    this.now = now
  }

  upsert(run) {
    if (!run || typeof run !== 'object' || Array.isArray(run)) {
      throw new TypeError('Run history entry must be an object')
    }
    const runId = runIdOf(run)
    if (!runId) throw new TypeError('Run history entry requires runId or id')

    const document = this.#readDocument()
    const existing = document.runs.find(item => runIdOf(item) === runId)
    const timestamp = this.now()
    const sanitized = sanitizeRunHistoryValue({
      ...run,
      runId,
      historyCreatedAt: existing?.historyCreatedAt ?? timestamp,
      historyUpdatedAt: timestamp
    }, this.sanitizerOptions)
    const serialized = JSON.stringify(sanitized)
    if (serialized.length > this.maxRecordLength) {
      const error = new Error(`Run history entry exceeds ${this.maxRecordLength} characters`)
      error.code = 'RUN_HISTORY_RECORD_TOO_LARGE'
      throw error
    }

    document.runs = [
      sanitized,
      ...document.runs.filter(item => runIdOf(item) !== runId)
    ].slice(0, this.maxEntries)
    this.#writeDocument(document)
    return clone(sanitized)
  }

  list(limit = this.maxEntries) {
    const normalizedLimit = Number.isInteger(limit) && limit >= 0
      ? Math.min(limit, this.maxEntries)
      : this.maxEntries
    return clone(this.#readDocument().runs.slice(0, normalizedLimit))
  }

  get(runId) {
    const normalizedId = runId == null ? '' : String(runId).trim()
    if (!normalizedId) return null
    const found = this.#readDocument().runs.find(run => runIdOf(run) === normalizedId)
    return found ? clone(found) : null
  }

  delete(runId) {
    const normalizedId = runId == null ? '' : String(runId).trim()
    if (!normalizedId) return false
    const document = this.#readDocument()
    const nextRuns = document.runs.filter(run => runIdOf(run) !== normalizedId)
    if (nextRuns.length === document.runs.length) return false
    document.runs = nextRuns
    this.#writeDocument(document)
    return true
  }

  clear() {
    if (this.removeStorage) this.removeStorage(this.storageKey)
    else this.#writeDocument(emptyDocument())
  }

  #readDocument() {
    let raw
    try {
      raw = this.readStorage(this.storageKey)
    } catch {
      return emptyDocument()
    }
    if (typeof raw !== 'string' || !raw || raw.length > this.maxDocumentLength) return emptyDocument()

    try {
      const parsed = JSON.parse(raw)
      if (parsed?.schemaVersion !== RUN_HISTORY_SCHEMA_VERSION || !Array.isArray(parsed.runs)) {
        return emptyDocument()
      }
      const runs = parsed.runs
        .map(run => sanitizeRunHistoryValue(run, this.sanitizerOptions))
        .filter(run => run && typeof run === 'object' && runIdOf(run))
        .filter(run => JSON.stringify(run).length <= this.maxRecordLength)
        .slice(0, this.maxEntries)
      return { schemaVersion: RUN_HISTORY_SCHEMA_VERSION, runs }
    } catch {
      return emptyDocument()
    }
  }

  #writeDocument(document) {
    this.writeStorage(this.storageKey, JSON.stringify({
      schemaVersion: RUN_HISTORY_SCHEMA_VERSION,
      runs: document.runs.slice(0, this.maxEntries)
    }))
  }
}

export default RunHistoryRepository
