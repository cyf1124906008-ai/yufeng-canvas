export const AUTOMATION_SCHEDULE_TYPES = Object.freeze(['interval', 'daily', 'weekly'])

const SCHEDULE_TYPE_SET = new Set(AUTOMATION_SCHEDULE_TYPES)
const MIN_INTERVAL_MINUTES = 5
const MAX_INTERVAL_MINUTES = 30 * 24 * 60

function finiteTimestamp(value, fallback = 0) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp >= 0 ? Math.trunc(timestamp) : fallback
}

function normalizeTime(value = '09:00') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) throw new TypeError('自动化时间必须使用 HH:mm 格式')
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new TypeError('自动化时间超出有效范围')
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function normalizeDays(value) {
  const source = Array.isArray(value) ? value : []
  const days = [...new Set(source.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((left, right) => left - right)
  if (!days.length) throw new TypeError('每周自动化至少需要选择一天')
  return days
}

export function normalizeAutomationSchedule(value = {}) {
  const type = String(value?.type || 'daily').trim()
  if (!SCHEDULE_TYPE_SET.has(type)) throw new TypeError(`不支持的自动化计划类型：${type || '(empty)'}`)

  if (type === 'interval') {
    const intervalMinutes = Math.trunc(Number(value.intervalMinutes) || 0)
    if (intervalMinutes < MIN_INTERVAL_MINUTES || intervalMinutes > MAX_INTERVAL_MINUTES) {
      throw new TypeError(`自动化间隔必须在 ${MIN_INTERVAL_MINUTES} 到 ${MAX_INTERVAL_MINUTES} 分钟之间`)
    }
    return {
      type,
      intervalMinutes,
      anchorAt: finiteTimestamp(value.anchorAt)
    }
  }

  if (type === 'daily') return { type, time: normalizeTime(value.time) }
  return { type, time: normalizeTime(value.time), days: normalizeDays(value.days) }
}

function localTimeOn(date, time) {
  const [hours, minutes] = normalizeTime(time).split(':').map(Number)
  const candidate = new Date(date)
  candidate.setHours(hours, minutes, 0, 0)
  return candidate
}

/**
 * Return the first occurrence strictly after `afterAt`.
 * All calendar schedules intentionally follow the computer's local timezone.
 */
export function nextAutomationOccurrence(scheduleValue, afterAt = Date.now(), fallbackAnchorAt = afterAt) {
  const schedule = normalizeAutomationSchedule(scheduleValue)
  const after = finiteTimestamp(afterAt, Date.now())

  if (schedule.type === 'interval') {
    const intervalMs = schedule.intervalMinutes * 60_000
    const anchor = schedule.anchorAt || finiteTimestamp(fallbackAnchorAt, after)
    if (anchor > after) return anchor
    const elapsed = Math.max(0, after - anchor)
    return anchor + ((Math.floor(elapsed / intervalMs) + 1) * intervalMs)
  }

  const cursor = new Date(after)
  if (schedule.type === 'daily') {
    const today = localTimeOn(cursor, schedule.time)
    if (today.getTime() > after) return today.getTime()
    today.setDate(today.getDate() + 1)
    return today.getTime()
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidateDate = new Date(cursor)
    candidateDate.setDate(candidateDate.getDate() + offset)
    if (!schedule.days.includes(candidateDate.getDay())) continue
    const candidate = localTimeOn(candidateDate, schedule.time).getTime()
    if (candidate > after) return candidate
  }

  throw new Error('无法计算下一次自动化运行时间')
}

export function automationScheduleLabel(scheduleValue) {
  const schedule = normalizeAutomationSchedule(scheduleValue)
  if (schedule.type === 'interval') return `每 ${schedule.intervalMinutes} 分钟`
  if (schedule.type === 'daily') return `每天 ${schedule.time}`
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${schedule.days.map(day => names[day]).join('、')} ${schedule.time}`
}

export { MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, normalizeTime as normalizeAutomationTime }
