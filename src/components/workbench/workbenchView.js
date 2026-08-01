const STATUS_META = {
  idle: { label: '就绪', tone: 'idle' },
  queued: { label: '已排队', tone: 'running' },
  planning: { label: '规划中', tone: 'running' },
  running: { label: '执行中', tone: 'running' },
  waiting: { label: '等待中', tone: 'running' },
  pending: { label: '待处理', tone: 'idle' },
  approved: { label: '已批准', tone: 'success' },
  rejected: { label: '已拒绝', tone: 'stopped' },
  retrying: { label: '重试中', tone: 'retry' },
  awaiting_user: { label: '等待你的回复', tone: 'idle' },
  awaiting_approval: { label: '需要批准', tone: 'approval' },
  completed: { label: '已完成', tone: 'success' },
  complete: { label: '已完成', tone: 'success' },
  succeeded: { label: '已完成', tone: 'success' },
  success: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  error: { label: '失败', tone: 'error' },
  cancelled: { label: '已停止', tone: 'stopped' },
  canceled: { label: '已停止', tone: 'stopped' },
  stopped: { label: '已停止', tone: 'stopped' },
  aborted: { label: '已停止', tone: 'stopped' },
  interrupted: { label: '已中断', tone: 'stopped' },
  pending_approval: { label: '需要批准', tone: 'approval' }
}

const TOOL_META = {
  generate_image: { label: '生成图片', icon: 'IMG' },
  analyze_image: { label: '检查图片', icon: 'VIS' },
  edit_image: { label: '编辑图片', icon: 'EDT' },
  upscale_image: { label: '放大图片', icon: '2×' },
  generate_video: { label: '生成视频', icon: 'VID' },
  image_to_video: { label: '图片转视频', icon: 'I2V' },
  generate_text: { label: '生成文本', icon: 'TXT' },
  'workspace.get': { label: '读取工作区', icon: 'DIR' },
  'workspace.list': { label: '列出文件', icon: 'LS' },
  'workspace.read': { label: '读取文件', icon: 'TXT' },
  'workspace.search': { label: '搜索文件', icon: 'RG' },
  'workspace.write': { label: '写入文件', icon: 'W' },
  'workspace.patch': { label: '修改文件', icon: 'DIF' },
  'workspace.revert_patch': { label: '回滚修改', icon: 'REV' },
  'terminal.run': { label: '运行命令', icon: '>_' },
  'computer.permissions': { label: '检查电脑权限', icon: 'PER' },
  'computer.inspect_screen': { label: '查看屏幕', icon: 'VIS' },
  'computer.open_application': { label: '打开应用', icon: 'APP' },
  'computer.click': { label: '点击屏幕', icon: 'CLK' },
  'computer.type_text': { label: '输入文本', icon: 'KEY' },
  'creative.generate': { label: '创作图片或视频', icon: 'ART' },
  'task.update_plan': { label: '更新执行计划', icon: 'PLAN' },
  terminal: { label: '终端', icon: '>_' },
  computer: { label: '电脑', icon: 'UI' },
  finish: { label: '验证交付', icon: '✓' }
}

const ACTIVE_STATUSES = new Set(['queued', 'planning', 'running', 'waiting', 'retrying', 'awaiting_user', 'awaiting_approval'])

function text(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function timestamp(value) {
  if (value == null || value === '') return 0
  const result = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(result) && result > 0 ? result : 0
}

function jsonText(value, maxLength = 2_000) {
  if (typeof value === 'string') return value.trim().slice(0, maxLength)
  if (value == null) return ''
  try {
    const result = JSON.stringify(value, null, 2)
    return result.length > maxLength ? `${result.slice(0, maxLength)}…` : result
  } catch {
    return ''
  }
}

export function workbenchStatus(status) {
  const normalized = text(status).toLowerCase() || 'idle'
  return {
    status: normalized,
    ...(STATUS_META[normalized] || { label: text(status) || '未知', tone: 'idle' })
  }
}

export function workbenchTool(action) {
  const name = text(typeof action === 'object' ? action?.name : action)
  return {
    name,
    ...(TOOL_META[name] || {
      label: name ? name.replaceAll('_', ' ') : 'Agent 操作',
      icon: name ? name.slice(0, 3).toUpperCase() : 'AI'
    })
  }
}

export function formatWorkbenchTime(value, locale = 'zh-CN') {
  const numeric = timestamp(value)
  if (!numeric) return ''
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(numeric))
}

function activityKind(type, actionName) {
  if (['approval_required', 'approval_requested', 'pending_approval'].includes(type)) return 'approval'
  if (type === 'message' || type.endsWith('_message')) return 'message'
  if (type.includes('terminal') || actionName === 'terminal' || actionName.startsWith('terminal.')) return 'terminal'
  if (type.includes('computer') || actionName === 'computer' || actionName.startsWith('computer.')) return 'computer'
  if (type === 'planning') return 'plan'
  if (['action', 'tool_call', 'tool_started', 'tool_progress', 'tool_succeeded', 'observation'].includes(type)) return 'tool'
  if (['completed', 'finished'].includes(type)) return 'result'
  if (['failed'].includes(type)) return 'error'
  return 'system'
}

function activityTitle(type, tool, raw) {
  if (raw?.title) return text(raw.title)
  if (type === 'message' || type.endsWith('_message')) return raw?.role === 'user' ? '你' : 'Agent'
  if (type === 'started') return 'Agent 任务已开始'
  if (type === 'planning') return '正在规划下一步'
  if (type === 'action') return `已选择：${tool.label}`
  if (type === 'tool_call') return `请求执行：${tool.label}`
  if (type === 'tool_started') return `正在执行：${tool.label}`
  if (type === 'tool_progress') {
    const phase = text(raw?.phase).toLowerCase()
    const label = {
      starting: '正在准备',
      started: '已启动',
      polling: '正在运行',
      running: '正在运行',
      retrying: '正在重试',
      completed: '执行完成',
      failed: '执行失败'
    }[phase] || '运行进度'
    return `${label}：${tool.label}`
  }
  if (type === 'tool_succeeded') return `已完成：${tool.label}`
  if (type === 'observation') return raw?.status === 'succeeded' ? `已完成：${tool.label}` : `${tool.label}：${raw?.status || '已返回'}`
  if (type === 'finish_blocked') return '交付检查要求继续执行'
  if (type === 'completed') return '创作任务已完成'
  if (type === 'finished') return '任务已完成'
  if (type === 'failed') return 'Agent 任务失败'
  if (['cancelled', 'canceled', 'stopped'].includes(type)) return 'Agent 任务已停止'
  if (['approval_required', 'approval_requested', 'pending_approval'].includes(type)) return '需要你的批准'
  if (type.includes('terminal')) return '终端结果'
  if (type.includes('computer')) return '电脑操作结果'
  return text(raw?.message || type) || 'Agent 更新'
}

function activityStatus(type, rawStatus, raw) {
  if (type === 'tool_succeeded' || ['completed', 'finished'].includes(type)) return 'completed'
  if (type === 'tool_progress') {
    const phase = text(raw?.phase).toLowerCase()
    if (phase === 'completed') return 'completed'
    if (['failed', 'error'].includes(phase)) return 'failed'
    if (['cancelled', 'canceled', 'stopped'].includes(phase)) return 'cancelled'
    return rawStatus || 'running'
  }
  if (type === 'observation' && rawStatus === 'succeeded') return 'completed'
  if (type === 'observation' && rawStatus === 'failed') return 'failed'
  if (type === 'failed') return 'failed'
  if (['cancelled', 'canceled', 'stopped'].includes(type)) return 'cancelled'
  if (type === 'finish_blocked') return 'retrying'
  if (['approval_required', 'approval_requested', 'pending_approval'].includes(type)) return 'pending_approval'
  if (type === 'tool_call' && rawStatus === 'awaiting_approval') return 'pending_approval'
  return rawStatus || (['started', 'action', 'tool_call', 'tool_started', 'planning'].includes(type) ? 'running' : 'idle')
}

function normalizeActivity(raw, index) {
  const inferredType = raw?.role ? 'message' : ''
  const type = text(raw?.type || raw?.event || raw?.kind || inferredType).toLowerCase() || 'event'
  const actionName = text(raw?.action?.name || raw?.action || raw?.tool || raw?.toolName || raw?.name)
  const tool = type === 'message' || type.endsWith('_message')
    ? { name: 'message', label: raw?.role === 'user' ? '用户消息' : 'Agent 消息', icon: raw?.role === 'user' ? 'U' : 'AI' }
    : workbenchTool(actionName)
  const status = activityStatus(type, text(raw?.status).toLowerCase(), raw)
  const statusView = workbenchStatus(status)
  const time = timestamp(raw?.timestamp || raw?.createdAt || raw?.requestedAt || raw?.resolvedAt || raw?.completedAt || raw?.startedAt || raw?.time)
  const stepValue = Number(raw?.step ?? raw?.stepNumber)
  const step = Number.isFinite(stepValue) && stepValue > 0 ? stepValue : 0
  const message = text(raw?.displayContent || raw?.content || raw?.description || raw?.reason || raw?.message || raw?.error?.message || raw?.error)

  return {
    id: text(raw?.id) || `${type}-${time || 'time'}-${index}`,
    type,
    kind: activityKind(type, actionName),
    title: activityTitle(type, tool, raw),
    message,
    actionName,
    tool,
    status: statusView.status,
    statusLabel: statusView.label,
    tone: statusView.tone,
    step,
    time,
    timeLabel: formatWorkbenchTime(time),
    attempt: Math.max(0, Number(raw?.attempt || raw?.revision) || 0),
    artifactRef: text(raw?.artifactRef || raw?.artifactId || raw?.outputRef),
    command: text(raw?.command || raw?.input?.command || raw?.input?.cmd),
    input: jsonText(raw?.input, 8_000),
    output: jsonText(raw?.output ?? raw?.stdout ?? raw?.stdoutDelta ?? raw?.stderrDelta ?? raw?.result?.text),
    approvalId: text(raw?.approvalId || raw?.requestId || raw?.id),
    toolCallId: text(raw?.toolCallId || raw?.id),
    role: text(raw?.role),
    raw
  }
}

export function buildWorkbenchActivities(snapshot = {}, injectedActivities = []) {
  const timeline = Array.isArray(snapshot?.timeline) ? snapshot.timeline : []
  const injected = Array.isArray(injectedActivities) ? injectedActivities : []
  return [...timeline, ...injected]
    .map((item, index) => ({ ...normalizeActivity(item, index), sourceIndex: index }))
    .sort((left, right) => {
      if (!left.time && !right.time) return left.sourceIndex - right.sourceIndex
      if (!left.time) return 1
      if (!right.time) return -1
      return left.time - right.time || left.sourceIndex - right.sourceIndex
    })
}

export function buildWorkbenchPlan(snapshot = {}, activities = []) {
  const runtimeSteps = Array.isArray(snapshot?.plan?.steps) ? snapshot.plan.steps : []
  if (runtimeSteps.length) {
    return runtimeSteps.map((item, index) => {
      const sourceStatus = text(item?.status).toLowerCase()
      const status = ['completed', 'succeeded', 'success'].includes(sourceStatus)
        ? 'completed'
        : (['in_progress', 'running', 'active'].includes(sourceStatus)
            ? 'running'
            : (['failed', 'error'].includes(sourceStatus) ? 'failed' : 'planned'))
      return {
        id: text(item?.id) || `plan-step-${index + 1}`,
        step: index + 1,
        actionName: text(item?.actionName || item?.toolName),
        label: text(item?.step || item?.label || item?.title) || `步骤 ${index + 1}`,
        icon: 'PLAN',
        status
      }
    })
  }

  const source = Array.isArray(activities) ? activities : buildWorkbenchActivities(snapshot)
  const actions = []
  const seen = new Map()

  for (const activity of source) {
    if (!activity.actionName || !['action', 'tool_call', 'tool_started', 'tool_succeeded', 'observation'].includes(activity.type)) continue
    const sourceId = activity.type === 'observation' ? activity.raw?.toolCallId : activity.raw?.id
    const key = text(sourceId) || `${activity.step || 'step'}:${activity.actionName}:${activity.attempt || 1}`
    const existingIndex = seen.get(key)
    const sourceStatus = text(activity.raw?.status).toLowerCase()
    const item = {
      id: key,
      step: activity.step,
      actionName: activity.actionName,
      label: activity.tool.label,
      icon: activity.tool.icon,
      status: activity.type === 'tool_succeeded' || (activity.type === 'observation' && sourceStatus === 'succeeded')
        ? 'completed'
        : (activity.type === 'tool_started' || sourceStatus === 'running'
            ? 'running'
            : (['failed', 'rejected'].includes(sourceStatus) ? 'failed' : 'planned'))
    }
    if (existingIndex == null) {
      seen.set(key, actions.length)
      actions.push(item)
    } else if (item.status === 'completed' || (item.status === 'running' && actions[existingIndex].status === 'planned')) {
      actions[existingIndex] = item
    }
  }

  const current = snapshot?.currentAction
  const currentName = text(current?.name)
  if (currentName && !actions.some(item => item.actionName === currentName && item.status === 'running')) {
    const tool = workbenchTool(currentName)
    actions.push({
      id: `current:${currentName}`,
      step: Number(current?.step) || 0,
      actionName: currentName,
      label: tool.label,
      icon: tool.icon,
      status: 'running'
    })
  }
  return actions
}

function safeArtifactUrl(raw, value) {
  const candidate = text(raw?.url || raw?.source || raw?.previewUrl || value?.url || value?.source)
  return /^(?:data:image\/|blob:|file:|https?:\/\/)/i.test(candidate) ? candidate : ''
}

export function normalizeWorkbenchArtifacts(artifacts = [], snapshot = {}) {
  const source = Array.isArray(artifacts) && artifacts.length
    ? artifacts
    : (Array.isArray(snapshot?.artifacts) ? snapshot.artifacts : [])
  const finalId = text(snapshot?.final?.artifactId)
  return source.map((raw, index) => {
    const value = raw?.value && typeof raw.value === 'object' ? raw.value : {}
    const id = text(raw?.id || raw?.artifactId || value?.artifactId || value?.id) || `artifact-${index + 1}`
    const kindValue = text(raw?.kind || raw?.type || raw?.mediaType || value?.kind || value?.type).toLowerCase()
    const url = safeArtifactUrl(raw, value)
    const kind = kindValue.includes('video') ? 'video' : (kindValue.includes('image') ? 'image' : 'file')
    return {
      id,
      kind,
      url,
      label: text(raw?.label || raw?.title || raw?.name || value?.label) || `产物 ${index + 1}`,
      status: workbenchStatus(raw?.status || value?.status || 'completed'),
      isFinal: raw?.isFinal === true || raw?.selected === true || id === finalId,
      raw
    }
  })
}

export function buildWorkbenchInspector({ snapshot = {}, artifacts = [], context = {}, fileChanges = [], usage = {} } = {}) {
  const status = workbenchStatus(snapshot?.status)
  const normalizedArtifacts = normalizeWorkbenchArtifacts(artifacts, snapshot)
  const changedFiles = (Array.isArray(fileChanges) ? fileChanges : []).map((file, index) => {
    const hunks = Array.isArray(file?.hunks) ? file.hunks.map(hunk => ({
      startLine: Math.max(1, Number(hunk?.startLine) || 1),
      oldLines: Array.isArray(hunk?.oldLines) ? hunk.oldLines.map(line => String(line)) : [],
      newLines: Array.isArray(hunk?.newLines) ? hunk.newLines.map(line => String(line)) : []
    })) : []
    const additions = file?.additions == null
      ? hunks.reduce((sum, hunk) => sum + hunk.newLines.length, 0)
      : Math.max(0, Number(file.additions) || 0)
    const deletions = file?.deletions == null
      ? hunks.reduce((sum, hunk) => sum + hunk.oldLines.length, 0)
      : Math.max(0, Number(file.deletions) || 0)
    return {
      id: text(file?.id || file?.eventId || file?.path) || `file-${index}`,
      path: text(file?.path || file?.name) || '未知文件',
      status: text(file?.status || file?.change) || 'modified',
      operation: text(file?.operation) || 'apply',
      revertsDiffId: text(file?.revertsDiffId),
      additions,
      deletions,
      hunks,
      rollback: file?.rollback && typeof file.rollback === 'object' ? file.rollback : null
    }
  })
  return {
    run: {
      id: text(snapshot?.runId || snapshot?.sessionId || snapshot?.id),
      goal: text(snapshot?.goal),
      targetType: text(snapshot?.targetType),
      status: status.status,
      statusLabel: status.label,
      tone: status.tone,
      stepCount: Math.max(0, Number(snapshot?.stepCount ?? snapshot?.turnCount ?? snapshot?.eventCount) || 0),
      startedAt: timestamp(snapshot?.startedAt || snapshot?.createdAt),
      updatedAt: timestamp(snapshot?.updatedAt),
      completedAt: timestamp(snapshot?.completedAt),
      active: ACTIVE_STATUSES.has(status.status)
    },
    context: context && typeof context === 'object' ? context : {},
    files: changedFiles,
    artifacts: normalizedArtifacts,
    usage: {
      inputTokens: Number.isFinite(Number(usage?.inputTokens)) ? Number(usage.inputTokens) : null,
      outputTokens: Number.isFinite(Number(usage?.outputTokens)) ? Number(usage.outputTokens) : null,
      cost: Number.isFinite(Number(usage?.cost)) ? Number(usage.cost) : null,
      currency: text(usage?.currency) || 'CNY'
    }
  }
}

export const WORKBENCH_TOOL_SHORTCUTS = [
  { id: 'auto', label: '自动', hint: '' },
  { id: 'files', label: '文件', hint: '检查当前工作区文件：' },
  { id: 'terminal', label: '终端', hint: '在工作区运行并检查命令：' },
  { id: 'computer', label: '电脑', hint: '查看并操作当前电脑：' },
  { id: 'creative', label: '创作', hint: '调用 Creative 工具：' }
]

export { ACTIVE_STATUSES }
