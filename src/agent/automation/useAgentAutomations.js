import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { normalizeApprovalMode } from '../workbench/index.js'
import { AutomationRepository } from './AutomationRepository.js'
import { AutomationScheduler } from './AutomationScheduler.js'

const REPOSITORY_MUTATIONS = new Set([
  'create',
  'update',
  'delete',
  'clear',
  'queue',
  'markRunning',
  'markWaitingApproval',
  'deferRun',
  'finishRun',
  'recoverInterrupted'
])

function controllerError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function defaultStorage() {
  try {
    return globalThis.localStorage || new Map()
  } catch {
    return new Map()
  }
}

function clockNow(clock) {
  if (typeof clock?.now === 'function') return clock.now.bind(clock)
  if (typeof clock === 'function') return clock
  return Date.now
}

function terminalStatus(value) {
  const status = String(value || '').trim()
  if (status === 'completed' || status === 'succeeded') return 'succeeded'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'failed') return 'failed'
  return ''
}

function automationApprovalMode(value, fallback = 'read_only') {
  const normalized = normalizeApprovalMode(value || fallback)
  return normalized === 'full_access' ? 'ask' : normalized
}

/**
 * Reactive controller for durable automations.
 *
 * `auto` authority is owned by the lifetime of one AutomationRepository
 * instance. That repository writes `ask` to storage and fingerprints its
 * in-memory grant, so recreating this composable cannot restore authority.
 */
export function useAgentAutomations({
  onRun,
  storage = defaultStorage(),
  clock = Date,
  timers = {},
  tickMs,
  repository: injectedRepository = null
} = {}) {
  const now = clockNow(clock)
  const repository = injectedRepository || new AutomationRepository({ storage, now })
  const automations = ref([])
  let disposed = false

  const effectiveRecord = (record) => {
    if (!record || typeof record !== 'object') return record
    return { ...record, approvalMode: automationApprovalMode(record.approvalMode) }
  }

  const refresh = () => {
    const listed = repository.list?.()
    const records = Array.isArray(listed) ? listed : []
    automations.value = records.map(effectiveRecord)
    return automations.value
  }

  const repositoryForScheduler = new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      return (...args) => {
        const result = value.apply(target, args)
        if (!REPOSITORY_MUTATIONS.has(property)) return result
        if (result && typeof result.then === 'function') return result.finally(refresh)
        refresh()
        return result
      }
    }
  })

  const runHandler = typeof onRun === 'function'
    ? onRun
    : async () => ({ deferred: true })
  const scheduler = new AutomationScheduler({
    repository: repositoryForScheduler,
    onRun: (record, context = {}) => {
      const effective = effectiveRecord(record)
      return runHandler(effective, { ...context, approvalMode: effective.approvalMode })
    },
    now,
    ...(tickMs == null ? {} : { tickMs }),
    ...(typeof timers?.setInterval === 'function'
      ? { setInterval: (...args) => timers.setInterval(...args) }
      : {}),
    ...(typeof timers?.clearInterval === 'function'
      ? { clearInterval: (...args) => timers.clearInterval(...args) }
      : {})
  })

  const recordOrThrow = (id) => {
    const record = repository.get?.(id)
    if (!record) throw controllerError('AUTOMATION_NOT_FOUND', '没有找到这条自动化')
    return record
  }

  const create = (input = {}) => {
    const approvalMode = automationApprovalMode(input.approvalMode)
    const created = repository.create({
      ...input,
      approvalMode
    })
    refresh()
    return effectiveRecord(created)
  }

  const update = (id, patch = {}) => {
    const current = recordOrThrow(id)
    if (current.activeRunId && (patch.enabled === false || patch.schedule !== undefined)) {
      throw controllerError('AUTOMATION_ACTIVE_RUN', '自动化运行期间不能停用或修改计划')
    }
    const approvalMode = patch.approvalMode === undefined
      ? null
      : automationApprovalMode(patch.approvalMode, 'ask')
    const updated = repository.update(id, {
      ...patch,
      ...(approvalMode == null ? {} : { approvalMode })
    })
    if (!updated) return null
    refresh()
    return effectiveRecord(updated)
  }

  const remove = (id) => {
    const record = recordOrThrow(id)
    if (record.activeRunId) {
      throw controllerError('AUTOMATION_ACTIVE_RUN', '运行中的自动化不能删除')
    }
    const deleted = repository.delete(id)
    refresh()
    return deleted
  }

  const toggle = (id, enabled) => {
    const record = recordOrThrow(id)
    const nextEnabled = enabled === undefined ? !record.enabled : Boolean(enabled)
    return update(id, { enabled: nextEnabled })
  }

  const runNow = async (id, options = {}) => {
    const record = recordOrThrow(id)
    if (options.approvalMode !== undefined) {
      const mode = automationApprovalMode(options.approvalMode, 'ask')
      repository.update(record.id, { approvalMode: mode })
      refresh()
    }
    try {
      return await scheduler.runNow(id)
    } finally {
      refresh()
    }
  }

  const start = () => {
    const started = scheduler.start()
    refresh()
    return started
  }

  const stop = () => {
    const stopped = scheduler.stop()
    refresh()
    return stopped
  }

  const runOptions = (id, options = {}) => {
    const record = recordOrThrow(id)
    return {
      ...options,
      runId: String(options.runId || record.activeRunId || ''),
      sessionId: String(options.sessionId || '')
    }
  }

  const markRunning = (id, options = {}) => {
    const result = repository.markRunning(id, runOptions(id, options))
    refresh()
    return result ? effectiveRecord(result) : null
  }

  const finishRun = (id, options = {}) => {
    const result = repository.finishRun(id, runOptions(id, options))
    refresh()
    return result ? effectiveRecord(result) : null
  }

  const finishSession = (id, options = {}) => {
    const session = options.session || options.snapshot || {}
    const status = terminalStatus(options.status || session.status)
    if (!status) {
      throw controllerError('AUTOMATION_SESSION_NOT_TERMINAL', '只能用终态 Session 完成自动化运行')
    }
    return finishRun(id, {
      ...options,
      status,
      sessionId: options.sessionId || session.sessionId || '',
      error: options.error ?? session.error ?? null
    })
  }

  const dispose = () => {
    if (disposed) return false
    disposed = true
    scheduler.dispose()
    return true
  }

  refresh()
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    automations,
    create,
    update,
    delete: remove,
    toggle,
    runNow,
    start,
    stop,
    refresh,
    markRunning,
    finishSession,
    finishRun,
    dispose,
    repository,
    scheduler
  }
}

export default useAgentAutomations
