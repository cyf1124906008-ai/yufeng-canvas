import {
  WORKBENCH_SCHEMA_VERSION,
  normalizeApprovalMode,
  sanitizeWorkbenchValue
} from './protocol.js'

function upsertById(items, next) {
  const index = items.findIndex(item => item.id === next.id)
  if (index === -1) items.push(next)
  else items[index] = { ...items[index], ...next }
}

function updateToolCall(state, id, patch) {
  const index = state.toolCalls.findIndex(call => call.id === id)
  if (index !== -1) state.toolCalls[index] = { ...state.toolCalls[index], ...patch }
}

function finalMessage(event, result, timestamp) {
  const content = typeof result === 'string'
    ? result.trim()
    : String(result?.content || '').trim()
  if (!content) return null
  return {
    id: `message_final_${String(event.id || event.seq || timestamp)}`,
    role: 'assistant',
    content,
    final: true,
    createdAt: timestamp
  }
}

function projectedApprovalMode(value) {
  try {
    return normalizeApprovalMode(value || 'ask')
  } catch {
    return 'ask'
  }
}

function initialProjection(sessionId = '') {
  return {
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    sessionId: String(sessionId || ''),
    approvalMode: 'ask',
    recordedApprovalMode: 'ask',
    status: 'idle',
    turnCount: 0,
    messages: [],
    toolCalls: [],
    observations: [],
    toolProgress: [],
    workspaceDiffs: [],
    approvals: [],
    plan: null,
    pendingApproval: null,
    guidancePending: false,
    lastGuidance: null,
    guidanceCount: 0,
    turnGuidanceCount: 0,
    resumeCount: 0,
    lastResumedAt: null,
    final: null,
    error: null,
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    eventCount: 0
  }
}

/** Rebuild a read model using only persisted Workbench events. */
export function projectWorkbenchEvents(events = []) {
  const list = Array.isArray(events) ? events : []
  const state = initialProjection(list[0]?.sessionId)

  for (const event of list) {
    if (!event || typeof event !== 'object') continue
    const detail = event.detail || {}
    const timestamp = Number(event.timestamp || Date.now())
    if (!state.sessionId) state.sessionId = String(event.sessionId || '')
    if (String(event.sessionId || '') !== state.sessionId) continue
    if (!state.createdAt) state.createdAt = timestamp
    state.updatedAt = timestamp
    state.eventCount += 1

    if (event.type === 'session_created') {
      state.status = 'idle'
      state.recordedApprovalMode = projectedApprovalMode(detail.approvalMode)
    } else if (event.type === 'approval_mode_changed') {
      state.recordedApprovalMode = projectedApprovalMode(detail.approvalMode)
    } else if (event.type === 'user_message') {
      if (detail.message) state.messages.push(detail.message)
      state.turnCount += 1
      state.guidancePending = false
      state.lastGuidance = null
      state.turnGuidanceCount = 0
      state.status = 'running'
      state.final = null
      state.error = null
      state.completedAt = null
    } else if (event.type === 'user_guidance') {
      if (detail.message) {
        state.messages.push(detail.message)
        state.lastGuidance = detail.message
      }
      state.guidancePending = true
      state.guidanceCount += 1
      state.turnGuidanceCount += 1
      if (state.status !== 'awaiting_approval') state.status = 'running'
    } else if (event.type === 'planning') {
      state.status = 'running'
      state.guidancePending = false
    } else if (event.type === 'planning_superseded') {
      state.status = 'running'
    } else if (event.type === 'resumed') {
      state.status = 'running'
      state.guidancePending = false
      state.error = null
      state.pendingApproval = null
      state.final = null
      state.completedAt = null
      state.resumeCount += 1
      state.lastResumedAt = timestamp
      state.toolCalls = state.toolCalls.map(call => (
        ['pending', 'running', 'awaiting_approval'].includes(call.status)
          ? {
              ...call,
              status: 'abandoned',
              ...(call.approvalStatus === 'pending' ? { approvalStatus: 'rejected' } : {}),
              abandonedAt: timestamp
            }
          : call
      ))
      state.approvals = state.approvals.map(approval => approval.status === 'pending'
        ? {
            ...approval,
            status: 'rejected',
            resolution: 'policy',
            reason: '任务恢复时废弃旧审批，未执行原工具',
            resolvedAt: timestamp
          }
        : approval)
    } else if (event.type === 'assistant_message') {
      if (detail.message) state.messages.push(detail.message)
      state.guidancePending = false
      state.status = 'awaiting_user'
    } else if (event.type === 'tool_call') {
      if (detail.toolCall) upsertById(state.toolCalls, detail.toolCall)
      state.status = detail.toolCall?.approvalStatus === 'pending' ? 'awaiting_approval' : 'running'
    } else if (event.type === 'approval_requested') {
      if (detail.approval) {
        upsertById(state.approvals, detail.approval)
        state.pendingApproval = detail.approval
        updateToolCall(state, detail.approval.toolCallId, {
          approvalStatus: 'pending',
          status: 'awaiting_approval'
        })
      }
      state.status = 'awaiting_approval'
    } else if (event.type === 'approval_resolved') {
      if (detail.approval) {
        upsertById(state.approvals, detail.approval)
        updateToolCall(state, detail.approval.toolCallId, {
          approvalStatus: detail.approval.status,
          status: detail.approval.status === 'approved' ? 'pending' : 'rejected'
        })
      }
      state.pendingApproval = null
      state.status = 'running'
    } else if (event.type === 'tool_started') {
      updateToolCall(state, detail.toolCallId, { status: 'running', startedAt: timestamp })
      state.status = 'running'
    } else if (event.type === 'tool_progress') {
      const progress = {
        eventId: String(event.id || ''),
        toolCallId: String(detail.toolCallId || ''),
        toolName: String(detail.toolName || ''),
        timestamp,
        ...(detail.progress || {})
      }
      state.toolProgress.push(progress)
      updateToolCall(state, progress.toolCallId, {
        status: 'running',
        latestProgress: progress,
        progressUpdatedAt: timestamp
      })
      state.status = 'running'
    } else if (event.type === 'plan_updated') {
      const revision = Number(state.plan?.revision || 0) + 1
      state.plan = detail.plan ? { ...detail.plan, revision, updatedAt: timestamp } : null
      state.status = 'running'
    } else if (event.type === 'workspace_diff') {
      if (detail.diff) {
        const diff = {
          ...detail.diff,
          eventId: String(event.id || ''),
          toolCallId: String(detail.toolCallId || ''),
          timestamp
        }
        upsertById(state.workspaceDiffs, diff)
        updateToolCall(state, diff.toolCallId, { workspaceDiffId: diff.id })
      }
      state.status = 'running'
    } else if (event.type === 'observation') {
      if (detail.observation) {
        upsertById(state.observations, detail.observation)
        updateToolCall(state, detail.observation.toolCallId, {
          status: detail.observation.status,
          completedAt: detail.observation.completedAt
        })
      }
      state.status = 'running'
    } else if (event.type === 'finished') {
      state.status = 'completed'
      state.guidancePending = false
      state.final = detail.result ?? null
      const message = finalMessage(event, state.final, timestamp)
      if (message) upsertById(state.messages, message)
      state.pendingApproval = null
      state.completedAt = timestamp
    } else if (event.type === 'failed') {
      state.status = 'failed'
      state.guidancePending = false
      state.error = detail.error || null
      state.pendingApproval = null
      state.completedAt = timestamp
    } else if (event.type === 'cancelled') {
      state.status = 'cancelled'
      state.guidancePending = false
      state.error = detail.error || null
      state.pendingApproval = null
      state.completedAt = timestamp
    }
  }

  return sanitizeWorkbenchValue(state)
}

export default projectWorkbenchEvents
