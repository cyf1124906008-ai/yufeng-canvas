export const AUTOMATION_WEEKDAYS = Object.freeze([
  Object.freeze({ id: 1, short: '一', label: '周一' }),
  Object.freeze({ id: 2, short: '二', label: '周二' }),
  Object.freeze({ id: 3, short: '三', label: '周三' }),
  Object.freeze({ id: 4, short: '四', label: '周四' }),
  Object.freeze({ id: 5, short: '五', label: '周五' }),
  Object.freeze({ id: 6, short: '六', label: '周六' }),
  Object.freeze({ id: 0, short: '日', label: '周日' })
])

const STATUS_VIEWS = Object.freeze({
  never: Object.freeze({ label: '尚未运行', tone: 'idle' }),
  queued: Object.freeze({ label: '等待运行', tone: 'queued' }),
  running: Object.freeze({ label: '运行中', tone: 'running' }),
  waiting_approval: Object.freeze({ label: '等待审批', tone: 'approval' }),
  succeeded: Object.freeze({ label: '成功', tone: 'success' }),
  failed: Object.freeze({ label: '失败', tone: 'error' }),
  cancelled: Object.freeze({ label: '已取消', tone: 'stopped' })
})

const APPROVAL_LABELS = Object.freeze({
  read_only: '只读',
  ask: '每次审批',
  auto: '自动执行'
})

const normalizeTime = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return ''
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const normalizedDays = value => [...new Set(
  (Array.isArray(value) ? value : [])
    .map(Number)
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
)].sort((left, right) => left - right)

export function createAutomationDraft(workspaceRoot = '') {
  const root = String(workspaceRoot || '').trim()
  return {
    name: '',
    prompt: '',
    scheduleType: 'daily',
    intervalMinutes: 30,
    time: '09:00',
    days: [1],
    approvalMode: 'read_only',
    bindWorkspace: Boolean(root),
    workspaceRoot: root,
    enabled: true
  }
}

export function automationDraftFromRecord(record = {}, workspaceRoot = '') {
  const schedule = record?.schedule && typeof record.schedule === 'object' ? record.schedule : {}
  const type = ['interval', 'daily', 'weekly'].includes(schedule.type) ? schedule.type : 'daily'
  const boundRoot = String(record.workspaceRoot || '').trim()
  return {
    name: String(record.name || ''),
    prompt: String(record.prompt || ''),
    scheduleType: type,
    intervalMinutes: Math.max(5, Number.parseInt(schedule.intervalMinutes, 10) || 30),
    time: normalizeTime(schedule.time) || '09:00',
    days: normalizedDays(schedule.days).length ? normalizedDays(schedule.days) : [1],
    approvalMode: ['read_only', 'ask', 'auto'].includes(record.approvalMode) ? record.approvalMode : 'read_only',
    bindWorkspace: Boolean(boundRoot),
    workspaceRoot: boundRoot || String(workspaceRoot || '').trim(),
    enabled: record.enabled !== false
  }
}

export function validateAutomationDraft(draft = {}) {
  const errors = {}
  const name = String(draft.name || '').trim()
  const prompt = String(draft.prompt || '').trim()
  if (!name) errors.name = '请输入自动化名称'
  else if (name.length > 100) errors.name = '名称不能超过 100 个字符'
  if (!prompt) errors.prompt = '请输入要交给 Agent 的任务说明'
  else if (prompt.length > 12_000) errors.prompt = '任务说明不能超过 12,000 个字符'

  if (!['interval', 'daily', 'weekly'].includes(draft.scheduleType)) {
    errors.schedule = '请选择有效的计划类型'
  } else if (draft.scheduleType === 'interval') {
    const interval = Number(draft.intervalMinutes)
    if (!Number.isInteger(interval) || interval < 5 || interval > 43_200) {
      errors.schedule = '运行间隔必须是 5–43,200 分钟的整数'
    }
  } else if (!normalizeTime(draft.time)) {
    errors.schedule = '请选择有效的本地时间'
  } else if (draft.scheduleType === 'weekly' && !normalizedDays(draft.days).length) {
    errors.schedule = '每周计划至少选择一天'
  }

  if (!['read_only', 'ask', 'auto'].includes(draft.approvalMode)) {
    errors.approvalMode = '请选择有效的执行模式'
  }
  if (draft.bindWorkspace && !String(draft.workspaceRoot || '').trim()) {
    errors.workspaceRoot = '请先在工作台选择项目目录'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export function automationPayloadFromDraft(draft = {}) {
  const validation = validateAutomationDraft(draft)
  if (!validation.valid) {
    const error = new TypeError(Object.values(validation.errors)[0])
    error.code = 'AUTOMATION_FORM_INVALID'
    error.errors = validation.errors
    throw error
  }

  const schedule = draft.scheduleType === 'interval'
    ? { type: 'interval', intervalMinutes: Number(draft.intervalMinutes) }
    : draft.scheduleType === 'weekly'
      ? { type: 'weekly', time: normalizeTime(draft.time), days: normalizedDays(draft.days) }
      : { type: 'daily', time: normalizeTime(draft.time) }

  return {
    name: String(draft.name).trim(),
    prompt: String(draft.prompt).trim(),
    schedule,
    approvalMode: draft.approvalMode,
    workspaceRoot: draft.bindWorkspace ? String(draft.workspaceRoot).trim() : '',
    enabled: draft.enabled !== false
  }
}

export function automationScheduleView(schedule = {}) {
  if (schedule.type === 'interval') {
    const minutes = Math.max(0, Number.parseInt(schedule.intervalMinutes, 10) || 0)
    if (minutes && minutes % 1_440 === 0) return `每 ${minutes / 1_440} 天`
    if (minutes && minutes % 60 === 0) return `每 ${minutes / 60} 小时`
    return minutes ? `每 ${minutes} 分钟` : '间隔计划'
  }
  const time = normalizeTime(schedule.time) || '--:--'
  if (schedule.type === 'weekly') {
    const labelById = Object.fromEntries(AUTOMATION_WEEKDAYS.map(day => [day.id, day.label]))
    const days = normalizedDays(schedule.days).map(day => labelById[day]).filter(Boolean)
    return `${days.join('、') || '未选日期'} ${time}`
  }
  return `每天 ${time}`
}

export function automationStatusView(status) {
  const normalized = String(status || 'never').trim().toLowerCase()
  return { status: normalized, ...(STATUS_VIEWS[normalized] || { label: normalized || '未知', tone: 'idle' }) }
}

export function automationApprovalLabel(mode) {
  return APPROVAL_LABELS[String(mode || '')] || APPROVAL_LABELS.read_only
}

export function automationIsActive(record = {}) {
  if (String(record.activeRunId || '').trim()) return true
  return ['queued', 'running', 'waiting_approval'].includes(String(record.lastStatus || '').trim())
}

export function formatAutomationDateTime(value, emptyLabel = '未安排') {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return emptyLabel
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return emptyLabel
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

export function automationWorkspaceLabel(value) {
  const normalized = String(value || '').trim().replace(/[\\/]+$/, '')
  if (!normalized) return '未绑定工作区'
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) || normalized
}
