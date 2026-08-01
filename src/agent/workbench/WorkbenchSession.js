import { ToolRegistry } from '../core/ToolRegistry.js'
import { WorkbenchEventStream } from './WorkbenchEventStream.js'
import { projectWorkbenchEvents } from './WorkbenchProjector.js'
import {
  createApproval,
  createObservation,
  createToolCall,
  normalizeApprovalDecision,
  normalizeApprovalMode,
  normalizeNextAction,
  normalizeTaskPlan,
  normalizeToolProgress,
  normalizeToolDefinition,
  normalizeUserGuidance,
  normalizeWorkspaceDiff,
  serializeWorkbenchError,
  toolDefinitionsFromRegistry,
  toolRequiresApproval,
  WORKBENCH_GUIDANCE_MAX_PER_TURN
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
  #approvalMode
  #guidanceVersion

  constructor({
    id,
    sessionId,
    planner,
    toolRegistry,
    tools,
    events = [],
    eventStream,
    approvalMode = 'ask',
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
    const normalizedApprovalMode = normalizeApprovalMode(approvalMode)
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
    // Approval authority is intentionally ephemeral. Persisted events are an
    // audit trail, never a capability that can be restored after a reload.
    this.#approvalMode = this.stream.events.length > 0 ? 'ask' : normalizedApprovalMode
    this.sessionId = this.stream.sessionId
    this.controller = null
    this.activePromise = null
    this.pendingSettlements = new Set()
    this.pendingToolExecutions = new Map()
    this.#guidanceVersion = this.stream.events.filter(event => event.type === 'user_guidance').length
    this.turnActionCount = this.#restoredTurnActionCount()
    this.listTools()

    if (this.stream.events.length === 0) {
      this.stream.append('session_created', { approvalMode: normalizedApprovalMode })
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
    const projected = projectWorkbenchEvents(this.stream.list())
    return {
      ...projected,
      approvalMode: this.#approvalMode
    }
  }

  subscribe(listener) {
    return this.stream.subscribe(listener)
  }

  async setApprovalMode(value) {
    const approvalMode = normalizeApprovalMode(value)
    const state = this.snapshot()
    if (this.activePromise || ['running', 'awaiting_approval'].includes(state.status)) {
      throw sessionError(
        'APPROVAL_MODE_CHANGE_UNSAFE',
        '任务运行中或存在待审批操作时不能切换审批保护模式'
      )
    }
    if (state.approvalMode === approvalMode) return state

    this.#approvalMode = approvalMode
    this.stream.append('approval_mode_changed', { approvalMode })
    return this.snapshot()
  }

  async submitUserMessage(content, options = {}) {
    const message = String(content || '').trim()
    if (!message) throw new TypeError('Workbench user message is required')
    const displayContent = String(options.displayContent ?? message).trim() || message
    this.#assertCanAcceptUserMessage()
    this.turnActionCount = 0
    this.stream.append('user_message', {
      message: {
        id: String(this.idFactory('message')),
        role: 'user',
        content: message,
        ...(displayContent !== message ? { displayContent } : {}),
        createdAt: this.now()
      }
    })
    return this.#runExclusive(signal => this.#pump(signal), options.signal)
  }

  async submitGuidance(content, options = {}) {
    const guidance = normalizeUserGuidance(content)
    const state = this.snapshot()
    if (!['running', 'awaiting_approval'].includes(state.status)) {
      throw sessionError('WORKBENCH_GUIDANCE_NOT_ACCEPTED', '只有执行中或等待审批的任务可以接收引导')
    }
    if (state.status === 'running' && !this.activePromise) {
      throw sessionError('WORKBENCH_GUIDANCE_RUNTIME_INACTIVE', '任务没有活动运行，不能追加引导')
    }
    if (Number(state.turnGuidanceCount || 0) >= WORKBENCH_GUIDANCE_MAX_PER_TURN) {
      throw sessionError(
        'WORKBENCH_GUIDANCE_RATE_LIMITED',
        `同一轮最多追加 ${WORKBENCH_GUIDANCE_MAX_PER_TURN} 条引导`
      )
    }

    this.#guidanceVersion += 1
    this.stream.append('user_guidance', {
      version: this.#guidanceVersion,
      message: {
        id: String(this.idFactory('message')),
        role: 'user',
        content: guidance,
        guidance: true,
        createdAt: this.now()
      }
    })

    if (state.status === 'awaiting_approval' && state.pendingApproval) {
      return this.resolveApproval(state.pendingApproval.id, {
        status: 'rejected',
        reason: '用户提供了新的执行引导，旧待审批工具已废弃且不会执行'
      }, { ...options, source: 'user_guidance' })
    }
    return this.snapshot()
  }

  async resume(options = {}) {
    if (this.activePromise) {
      throw sessionError('WORKBENCH_RESUME_BUSY', '上一次运行尚未完全结束，不能恢复任务')
    }
    const state = this.snapshot()
    if (!['failed', 'cancelled'].includes(state.status)) {
      throw sessionError('WORKBENCH_RESUME_NOT_ALLOWED', '只有失败或已取消的任务可以恢复')
    }

    this.pendingToolExecutions.clear()
    this.turnActionCount = 0
    this.stream.append('resumed', {
      previousStatus: state.status,
      abandonedToolCallIds: state.toolCalls
        .filter(call => ['pending', 'running', 'awaiting_approval'].includes(call.status))
        .map(call => call.id)
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
      resolution: options.source === 'auto'
        ? 'auto'
        : ['approval_mode', 'user_guidance'].includes(options.source) ? 'policy' : 'user',
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
        const blockedByMode = options.source === 'approval_mode'
        const supersededByGuidance = options.source === 'user_guidance'
        const observation = createObservation(toolCall, 'rejected', {
          startedAt: timestamp,
          completedAt: timestamp,
          error: {
            name: blockedByMode
              ? 'ApprovalModeRejected'
              : supersededByGuidance ? 'UserGuidanceRejected' : 'ApprovalRejected',
            code: blockedByMode
              ? 'TOOL_BLOCKED_BY_APPROVAL_MODE'
              : supersededByGuidance ? 'TOOL_SUPERSEDED_BY_GUIDANCE' : 'TOOL_APPROVAL_REJECTED',
            message: normalized.reason || `User rejected tool ${toolCall.name}`
          }
        }, { id: this.idFactory('observation'), now: this.now })
        this.stream.append('observation', { observation })
      } else {
        await this.#executeTool({
          ...executableToolCall,
          approvalStatus: 'approved',
          approvalResolution: approval.resolution
        }, signal)
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
      const planningGuidanceVersion = this.#guidanceVersion
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
      if (planningGuidanceVersion !== this.#guidanceVersion) {
        this.stream.append('planning_superseded', {
          plannedGuidanceVersion: planningGuidanceVersion,
          currentGuidanceVersion: this.#guidanceVersion,
          reason: 'user_guidance'
        })
        continue
      }
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
      let toolCall = createToolCall(action, definition, {
        id: this.idFactory('tool_call'),
        now: this.now
      })
      const approvalMode = this.#approvalMode
      const readOnlyAllowed = definition.riskLevel === 'safe' && !toolRequiresApproval(definition)
      if (approvalMode === 'read_only' && !readOnlyAllowed) {
        toolCall = { ...toolCall, approvalStatus: 'rejected', status: 'rejected' }
        this.stream.append('tool_call', { toolCall })
        const timestamp = this.now()
        const observation = createObservation(toolCall, 'rejected', {
          startedAt: timestamp,
          completedAt: timestamp,
          error: {
            name: 'ApprovalModeRejected',
            code: 'TOOL_BLOCKED_BY_APPROVAL_MODE',
            message: `只读模式只允许无需审批的 safe 工具；已阻止 ${toolCall.name}`
          }
        }, { id: this.idFactory('observation'), now: this.now })
        this.stream.append('observation', { observation })
        continue
      }
      this.stream.append('tool_call', { toolCall })

      if (toolCall.approvalStatus === 'pending') {
        if (approvalMode === 'auto' || approvalMode === 'full_access') {
          const resolution = approvalMode === 'full_access' ? 'full_access' : 'auto'
          const approval = createApproval(toolCall, {
            id: this.idFactory('approval'),
            now: this.now
          })
          this.stream.append('approval_requested', { approval })
          this.stream.append('approval_resolved', {
            approval: {
              ...approval,
              status: 'approved',
              reason: approvalMode === 'full_access'
                ? 'Workbench 全权限模式'
                : 'Workbench 自动批准模式',
              resolution,
              resolvedAt: this.now()
            }
          })
          await this.#executeTool({
            ...toolCall,
            approvalStatus: 'approved',
            approvalResolution: resolution
          }, signal)
          continue
        }
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
    let acceptsRuntimeEvents = true
    const appendRuntimeEvent = (type, detail) => {
      if (!acceptsRuntimeEvents || signal.aborted) return null
      return this.stream.append(type, { toolCallId: toolCall.id, toolName: toolCall.name, ...detail })
    }
    const reportProgress = progress => appendRuntimeEvent('tool_progress', {
      progress: normalizeToolProgress(progress)
    })
    const updatePlan = plan => appendRuntimeEvent('plan_updated', {
      plan: normalizeTaskPlan(plan)
    })
    const reportWorkspaceDiff = diff => {
      const normalized = normalizeWorkspaceDiff(diff)
      const diffId = String(this.idFactory('diff'))
      const event = appendRuntimeEvent('workspace_diff', {
        diff: { id: diffId, ...normalized }
      })
      return event ? { id: diffId, eventId: event.id } : null
    }
    try {
      const output = await this.#withCancellation(
        this.toolRegistry.execute(toolCall.name, toolCall.input, {
          signal,
          session: this.snapshot(),
          toolCall,
          definition: this.#definitionFor(toolCall.name),
          reportProgress,
          reportWorkspaceDiff,
          updatePlan
        }),
        signal
      )
      this.#throwIfAborted(signal)
      acceptsRuntimeEvents = false
      const observation = createObservation(toolCall, 'succeeded', {
        output,
        startedAt,
        completedAt: this.now()
      }, { id: this.idFactory('observation'), now: this.now })
      this.stream.append('observation', { observation })
      return observation
    } catch (error) {
      acceptsRuntimeEvents = false
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
    if (['failed', 'cancelled'].includes(status)) {
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
        // Aborting the Workbench wait does not prove the underlying planner or
        // tool has stopped. Keep the session lock until every real operation
        // settles so resume cannot overlap an abort-insensitive side effect.
        await this.#waitForPendingSettlements()
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
    const operation = Promise.resolve(value)
    // This non-rejecting companion handles late failures and gives
    // #runExclusive a definitive settlement barrier after cancellation.
    const settlement = operation.then(
      () => undefined,
      () => undefined
    )
    this.pendingSettlements.add(settlement)
    void settlement.finally(() => {
      this.pendingSettlements.delete(settlement)
    })
    if (signal.aborted) return Promise.reject(abortError(signal.reason))
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError(signal.reason))
      signal.addEventListener('abort', onAbort, { once: true })
      operation.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort)
      })
    })
  }

  async #waitForPendingSettlements() {
    while (this.pendingSettlements.size > 0) {
      await Promise.all([...this.pendingSettlements])
    }
  }
}

export default WorkbenchSession
