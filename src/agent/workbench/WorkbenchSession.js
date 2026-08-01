import { ToolRegistry } from '../core/ToolRegistry.js'
import { WorkbenchEventStream } from './WorkbenchEventStream.js'
import { projectWorkbenchEvents } from './WorkbenchProjector.js'
import {
  createApproval,
  createObservation,
  createToolCall,
  normalizeApprovalDecision,
  normalizeNextAction,
  normalizeToolDefinition,
  serializeWorkbenchError,
  toolDefinitionsFromRegistry
} from './protocol.js'

function defaultId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function abortError(reason) {
  if (reason instanceof Error) return reason
  const error = new Error(reason || 'Workbench session cancelled')
  error.name = 'AbortError'
  error.code = 'WORKBENCH_CANCELLED'
  return error
}

function sessionError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * General-purpose, multi-turn task session.
 *
 * A message action yields to the user, a tool_call executes or pauses for
 * approval, and finish is the only action that completes the task.
 */
export class WorkbenchSession {
  constructor({
    id,
    sessionId,
    planner,
    toolRegistry,
    tools,
    events = [],
    eventStream,
    maxActionsPerTurn = 24,
    now = Date.now,
    idFactory = defaultId,
    onListenerError = null
  } = {}) {
    const nextAction = typeof planner === 'function' ? planner : planner?.nextAction?.bind(planner)
    if (typeof nextAction !== 'function') {
      throw new TypeError('WorkbenchSession requires a planner.nextAction function')
    }
    if (!Number.isInteger(maxActionsPerTurn) || maxActionsPerTurn < 1) {
      throw new TypeError('maxActionsPerTurn must be a positive integer')
    }

    this.planner = { nextAction }
    this.toolRegistry = toolRegistry || new ToolRegistry(tools)
    this.maxActionsPerTurn = maxActionsPerTurn
    this.now = now
    this.idFactory = idFactory
    this.stream = eventStream || new WorkbenchEventStream({
      sessionId: sessionId || id,
      events,
      now,
      idFactory,
      onListenerError
    })
    this.sessionId = this.stream.sessionId
    this.controller = null
    this.activePromise = null
    this.pendingToolExecutions = new Map()
    this.turnActionCount = this.#restoredTurnActionCount()
    this.listTools()

    if (this.stream.events.length === 0) {
      this.stream.append('session_created', {})
    }
  }

  listTools() {
    // ToolRegistry.list() intentionally returns metadata only. Normalization
    // selects the public ToolDefinition fields and cannot expose execute.
    return toolDefinitionsFromRegistry(this.toolRegistry)
  }

  events() {
    return this.stream.list()
  }

  snapshot() {
    return projectWorkbenchEvents(this.stream.list())
  }

  subscribe(listener) {
    return this.stream.subscribe(listener)
  }

  async submitUserMessage(content, options = {}) {
    const message = String(content || '').trim()
    if (!message) throw new TypeError('Workbench user message is required')
    this.#assertCanAcceptUserMessage()
    this.turnActionCount = 0
    this.stream.append('user_message', {
      message: {
        id: String(this.idFactory('message')),
        role: 'user',
        content: message,
        createdAt: this.now()
      }
    })
    return this.#runExclusive(signal => this.#pump(signal), options.signal)
  }

  async resolveApproval(approvalId, decision, options = {}) {
    const state = this.snapshot()
    if (state.status !== 'awaiting_approval' || !state.pendingApproval) {
      throw sessionError('APPROVAL_NOT_PENDING', 'Workbench session has no pending approval')
    }
    if (String(approvalId || '') !== state.pendingApproval.id) {
      throw sessionError('APPROVAL_NOT_FOUND', 'Approval request does not match the pending tool call')
    }
    const normalized = normalizeApprovalDecision(decision)
    const approval = {
      ...state.pendingApproval,
      status: normalized.status,
      ...(normalized.reason ? { reason: normalized.reason } : {}),
      resolvedAt: this.now()
    }
    const toolCall = state.toolCalls.find(call => call.id === approval.toolCallId)
    if (!toolCall) throw sessionError('TOOL_CALL_NOT_FOUND', 'Pending approval has no tool call')
    const executableToolCall = this.pendingToolExecutions.get(toolCall.id)
    if (normalized.status === 'approved' && !executableToolCall) {
      throw sessionError(
        'WORKBENCH_RAW_TOOL_INPUT_UNAVAILABLE',
        '该审批来自已恢复的脱敏历史，不能安全重放；请拒绝操作并重新发起任务'
      )
    }
    this.pendingToolExecutions.delete(toolCall.id)
    this.stream.append('approval_resolved', { approval })

    return this.#runExclusive(async (signal) => {
      if (normalized.status === 'rejected') {
        const timestamp = this.now()
        const observation = createObservation(toolCall, 'rejected', {
          startedAt: timestamp,
          completedAt: timestamp,
          error: {
            name: 'ApprovalRejected',
            code: 'TOOL_APPROVAL_REJECTED',
            message: normalized.reason || `User rejected tool ${toolCall.name}`
          }
        }, { id: this.idFactory('observation'), now: this.now })
        this.stream.append('observation', { observation })
      } else {
        await this.#executeTool({ ...executableToolCall, approvalStatus: 'approved' }, signal)
      }
      return this.#pump(signal)
    }, options.signal)
  }

  cancel(reason = 'Workbench session cancelled') {
    if (this.controller && !this.controller.signal.aborted) {
      this.pendingToolExecutions.clear()
      this.controller.abort(abortError(reason))
      return true
    }
    const status = this.snapshot().status
    if (!['awaiting_user', 'awaiting_approval'].includes(status)) return false
    this.pendingToolExecutions.clear()
    this.stream.append('cancelled', {
      error: serializeWorkbenchError(abortError(reason), 'WORKBENCH_CANCELLED')
    })
    return true
  }

  async #pump(signal) {
    while (this.turnActionCount < this.maxActionsPerTurn) {
      this.#throwIfAborted(signal)
      this.stream.append('planning', { turn: this.snapshot().turnCount })
      const planned = await this.#withCancellation(
        this.planner.nextAction({
          session: this.snapshot(),
          tools: this.listTools(),
          signal
        }),
        signal
      )
      this.#throwIfAborted(signal)
      const action = normalizeNextAction(planned)
      this.turnActionCount += 1

      if (action.type === 'message') {
        this.stream.append('assistant_message', {
          message: {
            id: String(this.idFactory('message')),
            role: 'assistant',
            content: action.content,
            createdAt: this.now()
          }
        })
        return this.snapshot()
      }

      if (action.type === 'finish') {
        this.stream.append('finished', {
          result: action.result ?? null
        })
        return this.snapshot()
      }

      const definition = this.#definitionFor(action.name)
      const toolCall = createToolCall(action, definition, {
        id: this.idFactory('tool_call'),
        now: this.now
      })
      this.stream.append('tool_call', { toolCall })

      if (toolCall.approvalStatus === 'pending') {
        this.pendingToolExecutions.set(toolCall.id, toolCall)
        const approval = createApproval(toolCall, {
          id: this.idFactory('approval'),
          now: this.now
        })
        this.stream.append('approval_requested', { approval })
        return this.snapshot()
      }

      await this.#executeTool(toolCall, signal)
    }

    throw sessionError(
      'MAX_ACTIONS_EXCEEDED',
      `Workbench turn exceeded the maximum of ${this.maxActionsPerTurn} actions`
    )
  }

  async #executeTool(toolCall, signal) {
    const startedAt = this.now()
    this.stream.append('tool_started', { toolCallId: toolCall.id })
    try {
      const output = await this.#withCancellation(
        this.toolRegistry.execute(toolCall.name, toolCall.input, {
          signal,
          session: this.snapshot(),
          toolCall,
          definition: this.#definitionFor(toolCall.name)
        }),
        signal
      )
      this.#throwIfAborted(signal)
      const observation = createObservation(toolCall, 'succeeded', {
        output,
        startedAt,
        completedAt: this.now()
      }, { id: this.idFactory('observation'), now: this.now })
      this.stream.append('observation', { observation })
      return observation
    } catch (error) {
      if (signal.aborted) throw abortError(signal.reason)
      const observation = createObservation(toolCall, 'failed', {
        error: serializeWorkbenchError(error, 'TOOL_EXECUTION_FAILED'),
        startedAt,
        completedAt: this.now()
      }, { id: this.idFactory('observation'), now: this.now })
      this.stream.append('observation', { observation })
      return observation
    }
  }

  #definitionFor(name) {
    const found = this.listTools().find(definition => definition.name === name)
    return found || normalizeToolDefinition({
      name,
      description: 'Unregistered tool',
      riskLevel: 'safe',
      approvalPolicy: 'never'
    })
  }

  #assertCanAcceptUserMessage() {
    if (this.activePromise) throw sessionError('WORKBENCH_BUSY', 'Workbench session is already running')
    const status = this.snapshot().status
    if (status === 'awaiting_approval') {
      throw sessionError('APPROVAL_REQUIRED', 'Resolve the pending approval before sending another message')
    }
    if (['completed', 'failed', 'cancelled'].includes(status)) {
      throw sessionError('WORKBENCH_TERMINAL', `Workbench session is already ${status}`)
    }
  }

  #restoredTurnActionCount() {
    let count = 0
    for (const event of this.stream.events) {
      if (event.type === 'user_message') count = 0
      else if (['assistant_message', 'tool_call', 'finished'].includes(event.type)) count += 1
    }
    return count
  }

  #runExclusive(task, externalSignal) {
    if (this.activePromise) {
      return Promise.reject(sessionError('WORKBENCH_BUSY', 'Workbench session is already running'))
    }
    const controller = new AbortController()
    const detach = this.#forwardAbort(externalSignal, controller)
    this.controller = controller
    const running = (async () => {
      try {
        return await task(controller.signal)
      } catch (error) {
        const cancelled = controller.signal.aborted
        const status = this.snapshot().status
        if (!['completed', 'failed', 'cancelled'].includes(status)) {
          this.stream.append(cancelled ? 'cancelled' : 'failed', {
            error: serializeWorkbenchError(
              cancelled ? abortError(controller.signal.reason) : error,
              cancelled ? 'WORKBENCH_CANCELLED' : 'WORKBENCH_FAILED'
            )
          })
        }
        throw error
      } finally {
        detach()
        if (this.controller === controller) this.controller = null
        if (this.activePromise === running) this.activePromise = null
      }
    })()
    this.activePromise = running
    return running
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

  #withCancellation(value, signal) {
    if (signal.aborted) return Promise.reject(abortError(signal.reason))
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError(signal.reason))
      signal.addEventListener('abort', onAbort, { once: true })
      Promise.resolve(value).then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
    })
  }
}

export default WorkbenchSession
