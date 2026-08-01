import {
  WORKBENCH_SCHEMA_VERSION,
  sanitizeWorkbenchValue
} from './protocol.js'

function defaultId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeStoredEvent(event, sessionId, index) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('Workbench events must be objects')
  }
  if (String(event.sessionId || '') !== sessionId) {
    const error = new Error('Workbench event belongs to another session')
    error.code = 'WORKBENCH_EVENT_SESSION_MISMATCH'
    throw error
  }
  return {
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    sessionId,
    seq: index + 1,
    id: String(event.id || `event_${index + 1}`),
    type: String(event.type || ''),
    timestamp: Number(event.timestamp || Date.now()),
    detail: sanitizeWorkbenchValue(event.detail || {})
  }
}

/** Append-only, JSON-safe task event stream. */
export class WorkbenchEventStream {
  constructor({ sessionId, events = [], now = Date.now, idFactory = defaultId, onListenerError = null } = {}) {
    this.sessionId = String(sessionId || idFactory('session'))
    this.now = now
    this.idFactory = idFactory
    this.onListenerError = onListenerError
    this.listeners = new Set()
    this.events = events.map((event, index) => normalizeStoredEvent(event, this.sessionId, index))
  }

  append(type, detail = {}) {
    const normalizedType = String(type || '').trim()
    if (!normalizedType) throw new TypeError('Workbench event type is required')
    const event = {
      schemaVersion: WORKBENCH_SCHEMA_VERSION,
      sessionId: this.sessionId,
      seq: this.events.length + 1,
      id: String(this.idFactory('event')),
      type: normalizedType,
      timestamp: this.now(),
      detail: sanitizeWorkbenchValue(detail || {})
    }
    // Assert the storage boundary remains plain JSON even when callers pass
    // exotic values such as BigInt, Error, functions, or cyclic objects.
    JSON.stringify(event)
    this.events.push(event)
    for (const listener of this.listeners) {
      try {
        listener(clone(event))
      } catch (error) {
        try {
          this.onListenerError?.(error, clone(event))
        } catch {
          // Observability must never stop task execution.
        }
      }
    }
    return clone(event)
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Workbench event listener must be a function')
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  list() {
    return clone(this.events)
  }

  toJSON() {
    return this.list()
  }
}

export default WorkbenchEventStream
