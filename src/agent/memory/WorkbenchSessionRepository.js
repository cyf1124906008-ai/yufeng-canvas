import { projectWorkbenchEvents, sanitizeWorkbenchValue } from '../workbench/index.js'

export const WORKBENCH_HISTORY_STORAGE_KEY = 'yufeng-agent-workbench-history-v1'
export const WORKBENCH_HISTORY_SCHEMA_VERSION = 1
export const WORKBENCH_HISTORY_MAX_ENTRIES = 30

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function storageMethod(storage, primary, fallback) {
  if (typeof storage?.[primary] === 'function') return storage[primary].bind(storage)
  if (typeof storage?.[fallback] === 'function') return storage[fallback].bind(storage)
  return null
}

function sessionIdOf(value) {
  return String(value?.sessionId || value?.id || '').trim()
}

function emptyDocument() {
  return { schemaVersion: WORKBENCH_HISTORY_SCHEMA_VERSION, sessions: [] }
}

function hasValidEvents(record) {
  const id = sessionIdOf(record)
  return Boolean(id) && Array.isArray(record?.events) && record.events.every((event, index) => (
    event &&
    typeof event === 'object' &&
    !Array.isArray(event) &&
    Number(event.schemaVersion) === WORKBENCH_HISTORY_SCHEMA_VERSION &&
    String(event.sessionId || '') === id &&
    String(event.type || '').trim() &&
    Number(event.seq) === index + 1
  ))
}

function summaryFor(record) {
  const projection = projectWorkbenchEvents(record.events)
  const firstUser = projection.messages.find(message => message.role === 'user')
  return {
    sessionId: record.sessionId,
    title: String(record.title || firstUser?.content || '新任务').slice(0, 160),
    status: projection.status,
    approvalMode: 'ask',
    recordedApprovalMode: projection.recordedApprovalMode,
    turnCount: projection.turnCount,
    toolCallCount: projection.toolCalls.length,
    createdAt: projection.createdAt || record.createdAt,
    updatedAt: record.updatedAt || projection.updatedAt,
    completedAt: projection.completedAt
  }
}

export class WorkbenchSessionRepository {
  constructor({
    storage,
    storageKey = WORKBENCH_HISTORY_STORAGE_KEY,
    maxEntries = WORKBENCH_HISTORY_MAX_ENTRIES,
    maxSessionLength = 320_000,
    now = Date.now
  } = {}) {
    this.readStorage = storageMethod(storage, 'getItem', 'get')
    this.writeStorage = storageMethod(storage, 'setItem', 'set')
    this.removeStorage = storageMethod(storage, 'removeItem', 'delete')
    if (!this.readStorage || !this.writeStorage) {
      throw new TypeError('WorkbenchSessionRepository requires localStorage-compatible storage')
    }
    this.storageKey = String(storageKey)
    this.maxEntries = Math.min(Math.max(Number(maxEntries) || 1, 1), WORKBENCH_HISTORY_MAX_ENTRIES)
    this.maxSessionLength = Math.min(Math.max(Number(maxSessionLength) || 1, 1), 1_000_000)
    this.maxDocumentLength = (this.maxEntries * this.maxSessionLength) + 8_192
    this.now = now
  }

  upsert({ sessionId, id, title = '', events = [] } = {}) {
    const normalizedId = String(sessionId || id || '').trim()
    if (!normalizedId) throw new TypeError('Workbench history requires sessionId')
    if (!Array.isArray(events)) throw new TypeError('Workbench history events must be an array')
    if (!hasValidEvents({ sessionId: normalizedId, events })) {
      const error = new Error('Workbench history events do not belong to this session')
      error.code = 'WORKBENCH_HISTORY_EVENT_INVALID'
      throw error
    }

    const document = this.#readDocument()
    const existing = document.sessions.find(item => item.sessionId === normalizedId)
    const record = sanitizeWorkbenchValue({
      sessionId: normalizedId,
      title: String(title || '').trim().slice(0, 160),
      events,
      createdAt: existing?.createdAt || this.now(),
      updatedAt: this.now()
    })
    if (JSON.stringify(record).length > this.maxSessionLength) {
      const error = new Error(`Workbench session exceeds ${this.maxSessionLength} characters`)
      error.code = 'WORKBENCH_HISTORY_SESSION_TOO_LARGE'
      throw error
    }
    document.sessions = [
      record,
      ...document.sessions.filter(item => item.sessionId !== normalizedId)
    ].slice(0, this.maxEntries)
    this.#writeDocument(document)
    return clone(record)
  }

  list() {
    return clone(this.#readDocument().sessions.map(summaryFor))
  }

  get(sessionId) {
    const id = String(sessionId || '').trim()
    if (!id) return null
    const found = this.#readDocument().sessions.find(item => item.sessionId === id)
    return found ? clone(found) : null
  }

  delete(sessionId) {
    const id = String(sessionId || '').trim()
    if (!id) return false
    const document = this.#readDocument()
    const next = document.sessions.filter(item => item.sessionId !== id)
    if (next.length === document.sessions.length) return false
    document.sessions = next
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
      if (parsed?.schemaVersion !== WORKBENCH_HISTORY_SCHEMA_VERSION || !Array.isArray(parsed.sessions)) {
        return emptyDocument()
      }
      const sessions = parsed.sessions
        .map(value => sanitizeWorkbenchValue(value))
        .filter(value => hasValidEvents(value))
        .filter(value => JSON.stringify(value).length <= this.maxSessionLength)
        .slice(0, this.maxEntries)
      return { schemaVersion: WORKBENCH_HISTORY_SCHEMA_VERSION, sessions }
    } catch {
      return emptyDocument()
    }
  }

  #writeDocument(document) {
    this.writeStorage(this.storageKey, JSON.stringify({
      schemaVersion: WORKBENCH_HISTORY_SCHEMA_VERSION,
      sessions: document.sessions.slice(0, this.maxEntries)
    }))
  }
}

export { hasValidEvents }

export default WorkbenchSessionRepository
