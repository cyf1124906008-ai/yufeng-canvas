const VALID_STATUSES = new Set([
  'idle',
  'running',
  'completed',
  'failed',
  'cancelled'
])

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Serializable state for one Creative Agent run.
 */
export class AgentState {
  constructor(options = {}) {
    if (typeof options === 'string') options = { goal: options }

    this.id = options.id || createId()
    this.goal = String(options.goal || '').trim()
    this.targetType = options.targetType || 'image'
    this.status = options.status || 'idle'
    this.stepCount = Number(options.stepCount || 0)
    this.actions = clone(options.actions || [])
    this.observations = clone(options.observations || [])
    this.outputs = clone(options.outputs || [])
    this.errors = clone(options.errors || [])
    this.finishBlocks = clone(options.finishBlocks || [])
    this.createdAt = options.createdAt || Date.now()
    this.startedAt = options.startedAt || null
    this.completedAt = options.completedAt || null
  }

  setStatus(status) {
    if (!VALID_STATUSES.has(status)) {
      throw new TypeError(`Unknown agent status: ${status}`)
    }
    this.status = status
    if (status === 'running' && !this.startedAt) this.startedAt = Date.now()
    if (['completed', 'failed', 'cancelled'].includes(status)) {
      this.completedAt = Date.now()
    }
    return this
  }

  recordAction(action) {
    this.stepCount += 1
    this.actions.push({ step: this.stepCount, ...clone(action), timestamp: Date.now() })
    return this.stepCount
  }

  recordObservation(action, result) {
    const observation = {
      step: this.stepCount,
      action: action.name,
      result: clone(result),
      timestamp: Date.now()
    }
    this.observations.push(observation)
    return observation
  }

  recordOutput(type, value, action = type) {
    const output = {
      type,
      action,
      value: clone(value),
      step: this.stepCount,
      timestamp: Date.now()
    }
    this.outputs.push(output)
    return output
  }

  recordError(error, action = null) {
    const entry = {
      action,
      name: error?.name || 'Error',
      message: error?.message || String(error),
      code: error?.code,
      step: this.stepCount,
      timestamp: Date.now()
    }
    this.errors.push(entry)
    return entry
  }

  recordFinishBlock(reason) {
    const block = { reason, step: this.stepCount, timestamp: Date.now() }
    this.finishBlocks.push(block)
    return block
  }

  hasOutput(type) {
    return this.outputs.some(output => output.type === type)
  }

  latestOutput(type) {
    for (let index = this.outputs.length - 1; index >= 0; index -= 1) {
      if (!type || this.outputs[index].type === type) return this.outputs[index]
    }
    return null
  }

  snapshot() {
    return clone({
      id: this.id,
      goal: this.goal,
      targetType: this.targetType,
      status: this.status,
      stepCount: this.stepCount,
      actions: this.actions,
      observations: this.observations,
      outputs: this.outputs,
      errors: this.errors,
      finishBlocks: this.finishBlocks,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    })
  }
}

export default AgentState
