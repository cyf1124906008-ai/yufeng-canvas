export const REASONING_EFFORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'auto', label: '自动', short: 'AUTO', description: '由模型与任务自动选择', tone: 'auto' }),
  Object.freeze({ id: 'minimal', label: '极速', short: 'MIN', description: '尽快回应简单任务', tone: 'fast' }),
  Object.freeze({ id: 'low', label: '轻量', short: 'LOW', description: '少量推理与工具规划', tone: 'light' }),
  Object.freeze({ id: 'medium', label: '标准', short: 'MED', description: '质量与速度的平衡', tone: 'balanced' }),
  Object.freeze({ id: 'high', label: '深度', short: 'HIGH', description: '复杂分析与多步执行', tone: 'deep' }),
  Object.freeze({ id: 'xhigh', label: '极致', short: 'XHIGH', description: '更长的复杂任务推理', tone: 'intense' }),
  Object.freeze({ id: 'max', label: 'Max', short: 'MAX', description: '最高可用推理强度', tone: 'max' })
])

const REASONING_IDS = new Set(REASONING_EFFORT_OPTIONS.map(option => option.id))
const TERMINAL_TOOL_STATUSES = new Set(['completed', 'succeeded', 'failed', 'cancelled', 'canceled', 'rejected'])
const ACTIVE_TOOL_STATUSES = new Set(['queued', 'pending', 'running', 'awaiting_approval'])
const COMPLETE_SESSION_STATUSES = new Set(['completed', 'complete', 'succeeded', 'success'])

export function normalizeReasoningEffort(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return REASONING_IDS.has(normalized) ? normalized : 'auto'
}

export function reasoningEffortView(value) {
  const id = normalizeReasoningEffort(value)
  return REASONING_EFFORT_OPTIONS.find(option => option.id === id) || REASONING_EFFORT_OPTIONS[0]
}

function stage(id, label, description, status, evidence = '') {
  return { id, label, description, status, evidence }
}

export function deriveReasoningStages({
  running = false,
  status = '',
  plan = null,
  toolCalls = [],
  observations = []
} = {}) {
  const calls = Array.isArray(toolCalls) ? toolCalls : []
  const results = Array.isArray(observations) ? observations : []
  const planSteps = Array.isArray(plan?.steps) ? plan.steps : []
  const normalizedStatus = String(status || '').trim().toLowerCase()
  const complete = COMPLETE_SESSION_STATUSES.has(normalizedStatus)
  const activeCalls = calls.filter(call => ACTIVE_TOOL_STATUSES.has(String(call?.status || '').toLowerCase()))
  const terminalCalls = calls.filter(call => TERMINAL_TOOL_STATUSES.has(String(call?.status || '').toLowerCase()))
  const hasPlan = planSteps.length > 0
  const hasExecution = calls.length > 0 || results.length > 0
  const executionSettled = calls.length > 0 && activeCalls.length === 0 && terminalCalls.length === calls.length
  const verificationActive = Boolean(running && hasExecution && executionSettled)

  return [
    stage(
      'understand',
      '理解任务',
      '读取用户目标与可用上下文',
      hasPlan || hasExecution || complete ? 'completed' : (running ? 'running' : 'pending'),
      hasPlan || hasExecution ? '已进入结构化执行' : ''
    ),
    stage(
      'plan',
      '制定计划',
      '依据公开计划选择下一步',
      hasExecution || complete ? 'completed' : (running && hasPlan ? 'running' : 'pending'),
      hasPlan ? `${planSteps.length} 个公开计划步骤` : ''
    ),
    stage(
      'execute',
      '执行工具',
      '运行已启用并通过权限门的工具',
      complete || executionSettled ? 'completed' : (running && hasExecution ? 'running' : 'pending'),
      calls.length ? `${terminalCalls.length}/${calls.length} 个工具调用结束` : ''
    ),
    stage(
      'verify',
      '验证结果',
      '根据公开结果与状态确认交付',
      complete ? 'completed' : (verificationActive ? 'running' : 'pending'),
      results.length ? `${results.length} 条公开工具结果` : ''
    )
  ]
}

export function reasoningProgress(stages = []) {
  const source = Array.isArray(stages) ? stages : []
  if (!source.length) return 0
  const score = source.reduce((total, item) => {
    if (item?.status === 'completed') return total + 1
    if (item?.status === 'running') return total + 0.45
    return total
  }, 0)
  return Math.max(0, Math.min(100, Math.round((score / source.length) * 100)))
}

export function activePublicToolLabel(toolCalls = []) {
  const calls = Array.isArray(toolCalls) ? toolCalls : []
  const active = [...calls].reverse().find(call => ACTIVE_TOOL_STATUSES.has(String(call?.status || '').toLowerCase()))
  return String(active?.label || active?.name || active?.toolName || '').trim()
}
