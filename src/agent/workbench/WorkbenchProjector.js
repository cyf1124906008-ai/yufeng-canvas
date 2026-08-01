import { WORKBENCH_SCHEMA_VERSION, sanitizeWorkbenchValue } from './protocol.js'

function upsertById(items, next) {
  const index = items.findIndex(item => item.id === next.id)
  if (index === -1) items.push(next)
  else items[index] = { ...items[index], ...next }
}

function updateToolCall(state, id, patch) {
  const index = state.toolCalls.findIndex(call => call.id === id)
  if (index !== -1) state.toolCalls[index] = { ...state.toolCalls[index], ...patch }
}

function initialProjection(sessionId = '') {
  return {
    schemaVersion: WORKBENCH_SCHEMA_VERSION,
    sessionId: String(sessionId || ''),
    status: 'idle',
    turnCount: 0,
    messages: [],
    toolCalls: [],
    observations: [],
    approvals: [],
    pendingApproval: null,
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
    } else if (event.type === 'user_message') {
      if (detail.message) state.messages.push(detail.message)
      state.turnCount += 1
      state.status = 'running'
      state.error = null
    } else if (event.type === 'planning') {
      state.status = 'running'
    } else if (event.type === 'assistant_message') {
      if (detail.message) state.messages.push(detail.message)
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
      state.final = detail.result ?? null
      state.pendingApproval = null
      state.completedAt = timestamp
    } else if (event.type === 'failed') {
      state.status = 'failed'
      state.error = detail.error || null
      state.pendingApproval = null
      state.completedAt = timestamp
    } else if (event.type === 'cancelled') {
      state.status = 'cancelled'
      state.error = detail.error || null
      state.pendingApproval = null
      state.completedAt = timestamp
    }
  }

  return sanitizeWorkbenchValue(state)
}

export default projectWorkbenchEvents
