const DEFAULT_TICK_MS = 15_000

function schedulerError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Lightweight in-app scheduler. It owns no Agent implementation: `onRun`
 * receives one claimed job and may return `{ deferred: true }` when the
 * interactive Workbench is busy.
 */
export class AutomationScheduler {
  constructor({
    repository,
    onRun,
    now = Date.now,
    tickMs = DEFAULT_TICK_MS,
    setInterval: scheduleInterval = globalThis.setInterval,
    clearInterval: cancelInterval = globalThis.clearInterval
  } = {}) {
    if (!repository?.list || !repository?.queue) {
      throw new TypeError('AutomationScheduler 需要 AutomationRepository')
    }
    if (typeof onRun !== 'function') throw new TypeError('AutomationScheduler 需要 onRun 回调')
    this.repository = repository
    this.onRun = onRun
    this.now = now
    this.tickMs = Math.max(1_000, Math.trunc(Number(tickMs) || DEFAULT_TICK_MS))
    this.scheduleInterval = scheduleInterval
    this.cancelInterval = cancelInterval
    this.timer = null
    this.draining = null
    this.disposed = false
  }

  start() {
    if (this.disposed) throw schedulerError('AUTOMATION_SCHEDULER_DISPOSED', '自动化调度器已关闭')
    if (this.timer != null) return false
    this.repository.recoverInterrupted?.()
    void this.tick()
    this.timer = this.scheduleInterval(() => void this.tick(), this.tickMs)
    return true
  }

  stop() {
    if (this.timer == null) return false
    this.cancelInterval(this.timer)
    this.timer = null
    return true
  }

  async tick() {
    if (this.disposed) return []
    const claimed = []
    for (const automation of this.repository.due(this.now())) {
      const queued = this.repository.queue(automation.id, { scheduledFor: automation.nextRunAt })
      if (queued) claimed.push(queued)
    }
    await this.drain()
    return claimed
  }

  async runNow(id) {
    if (this.disposed) throw schedulerError('AUTOMATION_SCHEDULER_DISPOSED', '自动化调度器已关闭')
    const automation = this.repository.get(id)
    if (!automation) throw schedulerError('AUTOMATION_NOT_FOUND', '没有找到这条自动化')
    if (!automation.enabled) throw schedulerError('AUTOMATION_DISABLED', '请先启用这条自动化')
    const queued = this.repository.queue(id, { scheduledFor: this.now() })
    await this.drain()
    return queued
  }

  async drain() {
    if (this.draining) return this.draining
    this.draining = this.#drainQueue().finally(() => { this.draining = null })
    return this.draining
  }

  async #drainQueue() {
    const completed = []
    while (!this.disposed) {
      const automation = this.repository.queued()[0]
      if (!automation) break
      const runId = automation.activeRunId
      let result
      try {
        result = await this.onRun(automation, { runId })
      } catch (error) {
        this.repository.finishRun(automation.id, {
          runId,
          status: 'failed',
          error: { name: error?.name || 'Error', code: error?.code || 'AUTOMATION_RUN_FAILED', message: error?.message || String(error) }
        })
        completed.push({ automationId: automation.id, runId, status: 'failed' })
        continue
      }
      if (result?.deferred) {
        // onRun may have optimistically marked the run as running before it
        // discovered that the interactive Workbench is busy. Put the same
        // run back into the durable queue instead of silently stranding it.
        this.repository.deferRun?.(automation.id, { runId })
        break
      }
      if (result?.status === 'waiting_approval') {
        this.repository.markWaitingApproval(automation.id, {
          runId,
          sessionId: result.sessionId
        })
        completed.push({ automationId: automation.id, runId, status: 'waiting_approval' })
        continue
      }
      const status = ['succeeded', 'failed', 'cancelled'].includes(result?.status)
        ? result.status
        : 'succeeded'
      this.repository.finishRun(automation.id, {
        runId,
        status,
        sessionId: result?.sessionId,
        error: result?.error || null
      })
      completed.push({ automationId: automation.id, runId, status })
    }
    return completed
  }

  dispose() {
    this.stop()
    this.disposed = true
  }
}

export { DEFAULT_TICK_MS }

export default AutomationScheduler
