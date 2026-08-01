import { AgentState } from './AgentState.js'
import { ContextManager } from './ContextManager.js'
import { ToolRegistry } from './ToolRegistry.js'
import { Planner } from './Planner.js'
import { Verifier } from './Verifier.js'

function abortError(reason) {
  if (reason instanceof Error) return reason
  const error = new Error(reason || 'Agent run cancelled')
  error.name = 'AbortError'
  error.code = 'AGENT_CANCELLED'
  return error
}

function outputTypeFor(actionName) {
  if (['generate_image', 'edit_image', 'upscale_image'].includes(actionName)) return 'image'
  if (actionName === 'generate_video') return 'video'
  return null
}

export class AgentRunner {
  constructor({
    planner = new Planner(),
    toolRegistry,
    tools,
    verifier = new Verifier(),
    contextManager = null,
    maxSteps = 8,
    onListenerError = null
  } = {}) {
    this.planner = planner
    this.toolRegistry = toolRegistry || new ToolRegistry(tools)
    this.verifier = verifier
    this.contextManager = contextManager
    this.maxSteps = maxSteps
    this.onListenerError = onListenerError
    this.listeners = new Set()
    this.controller = null
    this.state = null
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function')
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  cancel(reason = 'Agent run cancelled') {
    if (this.controller && !this.controller.signal.aborted) {
      this.controller.abort(abortError(reason))
      return true
    }
    return false
  }

  async run(goalOrOptions, runOptions = {}) {
    if (this.controller && !this.controller.signal.aborted && this.state?.status === 'running') {
      throw new Error('AgentRunner is already running')
    }

    const options = typeof goalOrOptions === 'object' && goalOrOptions !== null
      ? { ...goalOrOptions, ...runOptions }
      : { ...runOptions, goal: goalOrOptions }
    const goal = String(options.goal || '').trim()
    if (!goal) throw new TypeError('AgentRunner.run requires a goal')

    const targetType = options.targetType || this.planner.inferTargetType?.(goal) || 'image'
    const state = options.state || new AgentState({ goal, targetType })
    const context = options.contextManager || this.contextManager || new ContextManager()
    const maxSteps = options.maxSteps || this.maxSteps
    const controller = new AbortController()
    this.controller = controller
    this.state = state

    const detachExternalSignal = this.#forwardAbort(options.signal, controller)
    let activeAction = null
    context.addGoal(goal)
    state.setStatus('running')
    this.#emit('started', { targetType }, state)

    try {
      while (state.stepCount < maxSteps) {
        this.#throwIfAborted(controller.signal)
        this.#emit('planning', {}, state)

        const action = await this.#withCancellation(
          this.planner.nextAction({ state, context, signal: controller.signal }),
          controller.signal
        )
        this.#throwIfAborted(controller.signal)
        activeAction = action
        state.recordAction(action)
        context.addAction(action)
        this.#emit('action', { action }, state)

        if (action.name === 'finish') {
          const verdict = this.verifier.verifyFinish(state)
          if (!verdict.ok) {
            state.recordFinishBlock(verdict.reason)
            context.addSystem(verdict.reason, { kind: 'finish_blocked' })
            this.#emit('finish_blocked', { action, verdict }, state)
            continue
          }

          state.setStatus('completed')
          const result = state.snapshot()
          this.#emit('completed', { result }, state)
          return result
        }

        this.#emit('tool_started', { action }, state)
        const result = await this.#withCancellation(
          this.toolRegistry.execute(action.name, action.input, {
            signal: controller.signal,
            state,
            context,
            action
          }),
          controller.signal
        )
        this.#throwIfAborted(controller.signal)

        const observation = state.recordObservation(action, result)
        const outputType = outputTypeFor(action.name)
        if (outputType && result != null) state.recordOutput(outputType, result, action.name)
        context.addObservation(action.name, result)
        this.#emit('tool_succeeded', { action, result, observation }, state)
        activeAction = null
      }

      const error = new Error(`Agent exceeded the maximum of ${maxSteps} steps`)
      error.code = 'MAX_STEPS_EXCEEDED'
      throw error
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError'
      state.recordError(error, activeAction?.name || null)
      state.setStatus(cancelled ? 'cancelled' : 'failed')
      this.#emit(cancelled ? 'cancelled' : 'failed', { error }, state)
      throw error
    } finally {
      detachExternalSignal()
      if (this.controller === controller) this.controller = null
    }
  }

  #emit(type, detail, state) {
    const event = {
      type,
      ...detail,
      state: state.snapshot(),
      timestamp: Date.now()
    }
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        try {
          this.onListenerError?.(error, { type, event })
        } catch {
          // Observability hooks must never be able to stop or strand a run.
        }
      }
    }
  }

  #forwardAbort(signal, controller) {
    if (!signal) return () => {}
    const forward = () => controller.abort(signal.reason || abortError())
    if (signal.aborted) forward()
    else signal.addEventListener('abort', forward, { once: true })
    return () => signal.removeEventListener('abort', forward)
  }

  #throwIfAborted(signal) {
    if (signal.aborted) throw abortError(signal.reason)
  }

  #withCancellation(promise, signal) {
    if (signal.aborted) return Promise.reject(abortError(signal.reason))
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError(signal.reason))
      signal.addEventListener('abort', onAbort, { once: true })
      Promise.resolve(promise).then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
    })
  }
}

export default AgentRunner
