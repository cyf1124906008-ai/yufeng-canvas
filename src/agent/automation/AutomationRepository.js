import { normalizeApprovalMode, sanitizeWorkbenchValue } from '../workbench/index.js'
import { nextAutomationOccurrence, normalizeAutomationSchedule } from './AutomationSchedule.js'

export const AUTOMATION_STORAGE_KEY = 'yufeng-agent-automations-v1'
export const AUTOMATION_SCHEMA_VERSION = 1
export const AUTOMATION_MAX_ENTRIES = 40
export const AUTOMATION_MAX_RUNS = 20

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled'])
const RUN_STATUSES = new Set(['queued', 'running', 'waiting_approval', ...TERMINAL_RUN_STATUSES])

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

function defaultId() {
  if (globalThis.crypto?.randomUUID) return `automation_${globalThis.crypto.randomUUID()}`
  return `automation_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function boundedText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeRunError(value) {
  if (value == null) return null
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { message: value }
  const sanitized = sanitizeWorkbenchValue({
    name: boundedText(source.name, 120) || 'Error',
    code: boundedText(source.code, 160) || 'AUTOMATION_RUN_FAILED',
    message: boundedText(source.message, 4_000) || '自动化运行失败'
  })
  return {
    name: boundedText(sanitized.name, 120) || 'Error',
    code: boundedText(sanitized.code, 160) || 'AUTOMATION_RUN_FAILED',
    message: boundedText(sanitized.message, 4_000) || '自动化运行失败'
  }
}

function approvalGrantFingerprint(record) {
  if (!record || typeof record !== 'object') return ''
  const { approvalMode: _approvalMode, ...persistedRecord } = record
  return JSON.stringify(persistedRecord)
}

function timestamp(value, fallback = 0) {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized >= 0 ? Math.trunc(normalized) : fallback
}

function normalizeRun(value = {}) {
  const status = String(value.status || 'failed').trim()
  if (!RUN_STATUSES.has(status)) throw new TypeError(`不支持的自动化运行状态：${status}`)
  return sanitizeWorkbenchValue({
    id: boundedText(value.id, 160) || `run_${timestamp(value.startedAt, Date.now())}`,
    status,
    scheduledFor: timestamp(value.scheduledFor),
    startedAt: timestamp(value.startedAt),
    finishedAt: timestamp(value.finishedAt),
    sessionId: boundedText(value.sessionId, 160),
    error: normalizeRunError(value.error)
  })
}

function normalizeRecord(value, { now = Date.now(), forCreate = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('自动化记录必须是对象')
  }
  const id = boundedText(value.id, 160)
  const name = boundedText(value.name, 100)
  const prompt = boundedText(value.prompt, 12_000)
  if (!id) throw new TypeError('自动化缺少 id')
  if (!name) throw new TypeError('自动化需要名称')
  if (!prompt) throw new TypeError('自动化需要任务说明')

  const createdAt = timestamp(value.createdAt, now)
  const enabled = value.enabled !== false
  const schedule = normalizeAutomationSchedule({
    ...value.schedule,
    ...(value.schedule?.type === 'interval' && !value.schedule?.anchorAt
      ? { anchorAt: createdAt }
      : {})
  })
  const requestedApprovalMode = normalizeApprovalMode(value.approvalMode || 'read_only')
  // Full access always requires an interactive risk page plus a native App
  // confirmation. A persisted or unattended automation must never recover it.
  const approvalMode = requestedApprovalMode === 'full_access' ? 'ask' : requestedApprovalMode
  const runs = []
  const runIds = new Set()
  for (const candidate of Array.isArray(value.runs) ? value.runs : []) {
    if (runs.length >= AUTOMATION_MAX_RUNS) break
    try {
      const run = normalizeRun(candidate)
      if (runIds.has(run.id)) continue
      runIds.add(run.id)
      runs.push(run)
    } catch {
      // A malformed historical run must not discard the automation itself.
    }
  }
  let nextRunAt = enabled ? timestamp(value.nextRunAt) : 0
  if (enabled && !nextRunAt) {
    nextRunAt = nextAutomationOccurrence(schedule, now, createdAt)
  }

  return sanitizeWorkbenchValue({
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    id,
    name,
    prompt,
    enabled,
    schedule,
    approvalMode,
    workspaceRoot: boundedText(value.workspaceRoot, 1_024),
    createdAt,
    updatedAt: timestamp(value.updatedAt, now),
    nextRunAt,
    lastRunAt: timestamp(value.lastRunAt),
    lastStatus: boundedText(value.lastStatus, 40) || (forCreate ? 'never' : 'never'),
    queuedAt: timestamp(value.queuedAt),
    activeRunId: boundedText(value.activeRunId, 160),
    runCount: Math.max(0, Math.trunc(Number(value.runCount) || 0)),
    runs
  })
}

function emptyDocument() {
  return { schemaVersion: AUTOMATION_SCHEMA_VERSION, automations: [] }
}

export class AutomationRepository {
  constructor({
    storage,
    storageKey = AUTOMATION_STORAGE_KEY,
    maxEntries = AUTOMATION_MAX_ENTRIES,
    now = Date.now,
    idFactory = defaultId
  } = {}) {
    this.readStorage = storageMethod(storage, 'getItem', 'get')
    this.writeStorage = storageMethod(storage, 'setItem', 'set')
    this.removeStorage = storageMethod(storage, 'removeItem', 'delete')
    if (!this.readStorage || !this.writeStorage) {
      throw new TypeError('AutomationRepository 需要兼容 localStorage 的存储')
    }
    this.storageKey = String(storageKey)
    this.maxEntries = Math.min(Math.max(Math.trunc(Number(maxEntries) || 1), 1), AUTOMATION_MAX_ENTRIES)
    this.now = now
    this.idFactory = idFactory
    // Auto is an ephemeral, per-record grant. It must never become authority
    // merely because mutable localStorage says so.
    this.approvalModeGrants = new Map()
  }

  list() {
    const document = this.#readDocument()
    const ids = new Set(document.automations.map(record => record.id))
    for (const id of this.approvalModeGrants.keys()) {
      if (!ids.has(id)) this.approvalModeGrants.delete(id)
    }
    return clone(document.automations.map(record => this.#withApprovalGrant(record)))
  }

  get(id) {
    const normalizedId = boundedText(id, 160)
    const found = this.#readDocument().automations.find(item => item.id === normalizedId)
    if (!found) this.approvalModeGrants.delete(normalizedId)
    return found ? clone(this.#withApprovalGrant(found)) : null
  }

  create(input = {}) {
    const now = this.now()
    const record = normalizeRecord({
      ...input,
      id: boundedText(input.id, 160) || String(this.idFactory()),
      createdAt: now,
      updatedAt: now,
      lastStatus: 'never',
      runCount: 0,
      runs: []
    }, { now, forCreate: true })
    const document = this.#readDocument()
    if (document.automations.some(item => item.id === record.id)) {
      const error = new Error('自动化 id 已存在')
      error.code = 'AUTOMATION_ID_CONFLICT'
      throw error
    }
    document.automations = [record, ...document.automations].slice(0, this.maxEntries)
    this.#writeDocument(document)
    if (record.approvalMode === 'auto') {
      this.approvalModeGrants.set(record.id, approvalGrantFingerprint(record))
    } else {
      this.approvalModeGrants.delete(record.id)
    }
    return clone(this.#withApprovalGrant(record))
  }

  update(id, patch = {}) {
    const normalizedId = boundedText(id, 160)
    const document = this.#readDocument()
    const index = document.automations.findIndex(item => item.id === normalizedId)
    if (index < 0) return null
    const previous = this.#withApprovalGrant(document.automations[index])
    const now = this.now()
    const scheduleChanged = patch.schedule !== undefined
    const enabled = patch.enabled === undefined ? previous.enabled : Boolean(patch.enabled)
    const next = normalizeRecord({
      ...previous,
      ...patch,
      id: previous.id,
      createdAt: previous.createdAt,
      updatedAt: now,
      enabled,
      runs: previous.runs,
      ...(scheduleChanged || (enabled && !previous.enabled)
        ? { nextRunAt: enabled ? 0 : 0, queuedAt: 0, activeRunId: '' }
        : {}),
      ...(!enabled ? { nextRunAt: 0, queuedAt: 0, activeRunId: '' } : {})
    }, { now })
    document.automations[index] = next
    this.#writeDocument(document)
    if (patch.approvalMode !== undefined) {
      if (next.approvalMode === 'auto') {
        this.approvalModeGrants.set(next.id, approvalGrantFingerprint(next))
      }
      else this.approvalModeGrants.delete(next.id)
    } else if (next.approvalMode === 'auto') {
      this.approvalModeGrants.set(next.id, approvalGrantFingerprint(next))
    }
    return clone(this.#withApprovalGrant(next))
  }

  delete(id) {
    const normalizedId = boundedText(id, 160)
    const document = this.#readDocument()
    const next = document.automations.filter(item => item.id !== normalizedId)
    if (next.length === document.automations.length) return false
    document.automations = next
    this.#writeDocument(document)
    this.approvalModeGrants.delete(normalizedId)
    return true
  }

  clear() {
    this.approvalModeGrants.clear()
    if (this.removeStorage) this.removeStorage(this.storageKey)
    else this.#writeDocument(emptyDocument())
  }

  due(at = this.now()) {
    const now = timestamp(at, this.now())
    return this.list()
      .filter(item => item.enabled && item.nextRunAt > 0 && item.nextRunAt <= now && !item.activeRunId)
      .sort((left, right) => left.nextRunAt - right.nextRunAt)
  }

  queued() {
    return this.list()
      .filter(item => item.enabled && item.lastStatus === 'queued' && item.activeRunId)
      .sort((left, right) => left.queuedAt - right.queuedAt)
  }

  queue(id, { scheduledFor, runId } = {}) {
    const record = this.get(id)
    if (!record || !record.enabled) return null
    if (record.activeRunId) return record
    const now = this.now()
    const normalizedRunId = boundedText(runId, 160) || `automation_run_${now}_${Math.random().toString(36).slice(2, 8)}`
    const dueAt = timestamp(scheduledFor, record.nextRunAt || now)
    return this.#replace(record.id, {
      ...record,
      updatedAt: now,
      queuedAt: now,
      activeRunId: normalizedRunId,
      lastStatus: 'queued',
      nextRunAt: nextAutomationOccurrence(record.schedule, Math.max(now, dueAt), record.createdAt),
      runs: [normalizeRun({
        id: normalizedRunId,
        status: 'queued',
        scheduledFor: dueAt,
        startedAt: 0,
        finishedAt: 0
      }), ...record.runs].slice(0, AUTOMATION_MAX_RUNS)
    })
  }

  markRunning(id, { runId, sessionId = '' } = {}) {
    return this.#updateRun(id, runId, 'running', {
      sessionId,
      startedAt: this.now(),
      finishedAt: 0
    })
  }

  markWaitingApproval(id, { runId, sessionId = '' } = {}) {
    return this.#updateRun(id, runId, 'waiting_approval', { sessionId })
  }

  deferRun(id, { runId } = {}) {
    return this.#updateRun(id, runId, 'queued', {
      sessionId: '',
      startedAt: 0,
      finishedAt: 0
    })
  }

  finishRun(id, { runId, status = 'succeeded', sessionId = '', error = null } = {}) {
    if (!TERMINAL_RUN_STATUSES.has(status)) throw new TypeError(`自动化终态无效：${status}`)
    const record = this.#updateRun(id, runId, status, {
      sessionId,
      error,
      finishedAt: this.now()
    }, { terminal: true })
    return record
  }

  recoverInterrupted() {
    const document = this.#readDocument()
    let changed = false
    const now = this.now()
    document.automations = document.automations.map(record => {
      if (!record.activeRunId || !['running', 'waiting_approval'].includes(record.lastStatus)) return record
      changed = true
      const error = normalizeRunError({
        name: 'AutomationInterrupted',
        code: 'AUTOMATION_INTERRUPTED',
        message: '应用上次关闭时自动化仍在运行或等待审批；为避免重复副作用，本次执行未自动恢复'
      })
      const runs = record.runs.map(run => run.id === record.activeRunId
        ? normalizeRun({ ...run, status: 'failed', finishedAt: now, error })
        : run)
      return normalizeRecord({
        ...record,
        lastStatus: 'failed',
        lastRunAt: now,
        queuedAt: 0,
        activeRunId: '',
        runCount: record.runCount + 1,
        runs,
        updatedAt: now
      }, { now })
    })
    if (changed) this.#writeDocument(document)
    return this.list()
  }

  #updateRun(id, runId, status, patch = {}, { terminal = false } = {}) {
    const record = this.get(id)
    const normalizedRunId = boundedText(runId, 160)
    if (!record || !normalizedRunId || record.activeRunId !== normalizedRunId) return null
    const now = this.now()
    const runs = record.runs.map(run => run.id === normalizedRunId
      ? normalizeRun({ ...run, ...patch, id: normalizedRunId, status })
      : run)
    return this.#replace(record.id, {
      ...record,
      updatedAt: now,
      lastRunAt: terminal ? now : record.lastRunAt,
      lastStatus: status,
      runCount: terminal ? record.runCount + 1 : record.runCount,
      activeRunId: terminal ? '' : normalizedRunId,
      queuedAt: terminal ? 0 : record.queuedAt,
      runs
    })
  }

  #replace(id, value) {
    const document = this.#readDocument()
    const index = document.automations.findIndex(item => item.id === id)
    if (index < 0) return null
    const normalized = normalizeRecord(value, { now: this.now() })
    document.automations[index] = normalized
    this.#writeDocument(document)
    if (normalized.approvalMode === 'auto') {
      this.approvalModeGrants.set(normalized.id, approvalGrantFingerprint(normalized))
    }
    return clone(this.#withApprovalGrant(normalized))
  }

  #withApprovalGrant(record) {
    if (!record) return record
    const grant = this.approvalModeGrants.get(record.id)
    if (!grant) return record
    if (grant !== approvalGrantFingerprint(record)) {
      this.approvalModeGrants.delete(record.id)
      return record
    }
    return { ...record, approvalMode: 'auto' }
  }

  #readDocument() {
    let raw
    try {
      raw = this.readStorage(this.storageKey)
    } catch {
      return emptyDocument()
    }
    if (typeof raw !== 'string' || !raw || raw.length > 1_000_000) return emptyDocument()
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.schemaVersion !== AUTOMATION_SCHEMA_VERSION || !Array.isArray(parsed.automations)) {
        return emptyDocument()
      }
      const automations = []
      const ids = new Set()
      for (const value of parsed.automations) {
        if (automations.length >= this.maxEntries) break
        try {
          if (value?.schemaVersion !== AUTOMATION_SCHEMA_VERSION) continue
          const record = normalizeRecord({
            ...value,
            approvalMode: ['auto', 'full_access'].includes(value?.approvalMode) ? 'ask' : value?.approvalMode
          }, { now: this.now() })
          if (ids.has(record.id)) continue
          ids.add(record.id)
          automations.push(record)
        } catch {
          // One malformed record must not discard unrelated automations.
        }
      }
      return { schemaVersion: AUTOMATION_SCHEMA_VERSION, automations }
    } catch {
      return emptyDocument()
    }
  }

  #writeDocument(document) {
    this.writeStorage(this.storageKey, JSON.stringify({
      schemaVersion: AUTOMATION_SCHEMA_VERSION,
      automations: document.automations.slice(0, this.maxEntries).map(record => ({
        ...record,
        approvalMode: ['auto', 'full_access'].includes(record.approvalMode) ? 'ask' : record.approvalMode
      }))
    }))
  }
}

export {
  normalizeRecord as normalizeAutomationRecord,
  normalizeRun as normalizeAutomationRun,
  normalizeRunError as normalizeAutomationRunError
}

export default AutomationRepository
