const STATUS_VIEW = {
  idle: { label: '等待开始', tone: 'idle' },
  queued: { label: '已排队', tone: 'running' },
  planning: { label: '正在规划', tone: 'running' },
  running: { label: '正在执行', tone: 'running' },
  waiting: { label: '等待结果', tone: 'running' },
  retrying: { label: '正在重试', tone: 'retry' },
  completed: { label: '已完成', tone: 'success' },
  complete: { label: '已完成', tone: 'success' },
  succeeded: { label: '已完成', tone: 'success' },
  success: { label: '已完成', tone: 'success' },
  failed: { label: '执行失败', tone: 'error' },
  error: { label: '执行失败', tone: 'error' },
  cancelled: { label: '已停止', tone: 'stopped' },
  canceled: { label: '已停止', tone: 'stopped' },
  stopped: { label: '已停止', tone: 'stopped' },
  aborted: { label: '已停止', tone: 'stopped' },
  interrupted: { label: '上次运行中断', tone: 'stopped' }
}

function text(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function finiteCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : null
}

function timestamp(value) {
  if (value == null || value === '') return 0
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function recordSnapshot(record) {
  if (record?.snapshot && typeof record.snapshot === 'object') return record.snapshot
  if (record?.view && typeof record.view === 'object') return record.view
  if (record?.run && typeof record.run === 'object') return record.run
  return record && typeof record === 'object' ? record : {}
}

function countArtifacts(record, snapshot) {
  const explicit = finiteCount(record?.artifactCount ?? snapshot?.artifactCount)
  if (explicit != null) return explicit

  const collections = [
    record?.artifacts,
    record?.artifactManifest?.artifacts,
    Array.isArray(record?.artifactManifest) ? record.artifactManifest : null,
    snapshot?.artifacts,
    snapshot?.artifactManifest?.artifacts,
    snapshot?.final?.artifactIds
  ]
  const collection = collections.find(Array.isArray)
  return collection?.length || 0
}

function countSteps(record, snapshot) {
  const explicit = finiteCount(record?.stepCount ?? snapshot?.stepCount ?? snapshot?.final?.stepCount)
  if (explicit != null) return explicit

  const timeline = Array.isArray(record?.timeline)
    ? record.timeline
    : (Array.isArray(snapshot?.timeline) ? snapshot.timeline : [])
  return timeline.reduce((highest, entry) => {
    const step = finiteCount(entry?.step ?? entry?.stepNumber)
    return step == null ? highest : Math.max(highest, step)
  }, 0)
}

export function getAgentRunHistoryStatus(status) {
  const normalized = text(status).toLowerCase() || 'idle'
  return {
    status: normalized,
    ...(STATUS_VIEW[normalized] || { label: text(status) || '未知状态', tone: 'idle' })
  }
}

export function formatAgentRunHistoryTime(value, locale = 'zh-CN') {
  const time = timestamp(value)
  if (!time) return '时间未记录'
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(time))
}

export function normalizeAgentRunHistoryRecord(record, index = 0) {
  const raw = record && typeof record === 'object' ? record : {}
  const snapshot = recordSnapshot(raw)
  const id = text(raw.id ?? raw.runId ?? snapshot.runId ?? snapshot.id)
  const goal = text(raw.goal ?? raw.title ?? snapshot.goal ?? snapshot.userGoal ?? snapshot.objective)
  const statusView = getAgentRunHistoryStatus(raw.status ?? snapshot.status)
  const time = timestamp(
    raw.historyUpdatedAt || raw.updatedAt || raw.completedAt || raw.historyCreatedAt || raw.createdAt ||
    snapshot.updatedAt || snapshot.completedAt || snapshot.startedAt || snapshot.createdAt
  )

  return {
    id,
    key: id || `history-record-${index}`,
    goal: goal || '未提供用户目标',
    ...statusView,
    time,
    timeLabel: formatAgentRunHistoryTime(time),
    stepCount: countSteps(raw, snapshot),
    artifactCount: countArtifacts(raw, snapshot),
    raw
  }
}

export function normalizeAgentRunHistoryRecords(records) {
  return (Array.isArray(records) ? records : []).map(normalizeAgentRunHistoryRecord)
}

export default normalizeAgentRunHistoryRecord
