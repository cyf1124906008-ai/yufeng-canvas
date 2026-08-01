import { normalizeNextAction, sanitizeWorkbenchValue } from '../workbench/index.js'

export const WORKBENCH_MESSAGE_CONTEXT_CHARACTERS = 24 * 1024

function read(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function extractText(response) {
  if (typeof response === 'string') return response
  if (typeof response?.output_text === 'string') return response.output_text
  if (typeof response?.content === 'string') return response.content
  if (Array.isArray(response?.content)) return response.content.map(item => item?.text || '').join('')
  return response?.choices?.[0]?.message?.content || ''
}

function parseAction(text) {
  const source = String(text || '').trim()
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || source
  const objectMatch = candidate.match(/\{[\s\S]*\}/)
  if (!objectMatch) return { type: 'message', content: source }

  const raw = JSON.parse(objectMatch[0])
  if (!raw.type && (raw.tool || raw.name)) {
    raw.type = 'tool_call'
    raw.name = raw.name || raw.tool
    raw.input = raw.input || raw.arguments || raw.params || {}
  }
  if (!raw.type && (raw.answer || raw.message)) {
    raw.type = 'message'
    raw.content = raw.content || raw.answer || raw.message
  }
  return normalizeNextAction(raw)
}

function truncateForPrompt(value, {
  depth = 0,
  maxDepth = 7,
  maxString = 20_000,
  maxArray = 80,
  maxKeys = 80
} = {}) {
  if (typeof value === 'string') {
    return value.length > maxString
      ? `${value.slice(0, maxString)}\n…[已截断 ${value.length - maxString} 个字符]`
      : value
  }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (depth >= maxDepth) return '[上下文层级已截断]'
  if (Array.isArray(value)) {
    const next = value.slice(-maxArray).map(item => truncateForPrompt(item, {
      depth: depth + 1,
      maxDepth,
      maxString,
      maxArray,
      maxKeys
    }))
    if (value.length > maxArray) next.unshift(`[已省略前 ${value.length - maxArray} 项]`)
    return next
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    const next = Object.fromEntries(keys.slice(0, maxKeys).map(key => [key, truncateForPrompt(value[key], {
      depth: depth + 1,
      maxDepth,
      maxString,
      maxArray,
      maxKeys
    })]))
    if (keys.length > maxKeys) next.__truncatedKeys = keys.length - maxKeys
    return next
  }
  return String(value).slice(0, maxString)
}

function compactSession(session = {}) {
  const messages = Array.isArray(session.messages) ? session.messages.slice(-18) : []
  const toolCalls = Array.isArray(session.toolCalls) ? session.toolCalls.slice(-16) : []
  const observations = Array.isArray(session.observations) ? session.observations.slice(-16) : []
  const workspaceDiffs = Array.isArray(session.workspaceDiffs) ? session.workspaceDiffs.slice(-8) : []
  return sanitizeWorkbenchValue({
    status: session.status,
    turnCount: session.turnCount,
    plan: truncateForPrompt(session.plan),
    messages: messages.map(message => ({
      role: message.role,
      content: String(message.content || '').slice(0, WORKBENCH_MESSAGE_CONTEXT_CHARACTERS)
    })),
    toolCalls: toolCalls.map(call => ({
      id: call.id,
      name: call.name,
      input: truncateForPrompt(call.input),
      status: call.status,
      approvalStatus: call.approvalStatus
    })),
    observations: observations.map(observation => ({
      toolCallId: observation.toolCallId,
      toolName: observation.toolName,
      status: observation.status,
      output: truncateForPrompt(observation.output),
      error: truncateForPrompt(observation.error)
    })),
    workspaceDiffs: workspaceDiffs.map(diff => truncateForPrompt(diff)),
    latestToolProgress: toolCalls.map(call => call.latestProgress ? {
      toolCallId: call.id,
      progress: truncateForPrompt(call.latestProgress)
    } : null).filter(Boolean)
  })
}

function plannerPrompt({ session, tools }) {
  return [
    '你是 YUFENG Desktop Agent，一个在用户本机工作区内完成任务的通用 Agent。',
    '每次只能决定一个 next action，并且只输出一个 JSON 对象，不要输出 Markdown。',
    '可用动作：',
    '{"type":"tool_call","name":"工具名","input":{}}：需要工具时调用一个工具。',
    '{"type":"message","content":"..."}：确实需要用户补充信息时提问，或只需回答而无需工具时回复。',
    '{"type":"finish","result":{"content":"..."}}：任务已经完成时给出最终答复。',
    '不要声称执行了尚未调用的工具。不要臆造文件、命令输出或电脑状态。',
    '工具失败或被拒绝后，读取 observation，再解释、改用安全方案或向用户提问。',
    '危险工具会由 Harness 自动暂停并请求批准；你不能伪造 approval 参数。',
    '多步骤任务先调用 task.update_plan 建立简短计划；推进时保持至多一个 in_progress，并及时标记 completed。',
    '修改现有文件时，先 workspace.read 获取 content 与 sha256，再优先调用 workspace.patch；不要用 workspace.write 整体覆盖现有文件。',
    '回滚文件变更只能使用 workspace.revert_patch，并传入 workspace_diff.rollback.rollbackId 与 workspace_diff.id；回滚记录过期或 SHA 不匹配时不要强行覆盖。',
    '终端运行期间 Harness 只提供阶段、输出长度等状态事件；完整输出在最终 observation 中统一脱敏，只根据实际 observation 判断命令是否成功。',
    '不要输出隐藏思维链，只给必要结论、操作事实和简短计划摘要。',
    `可用工具：${JSON.stringify(tools)}`,
    `当前任务状态：${JSON.stringify(compactSession(session))}`
  ].join('\n\n')
}

export function createWorkbenchPlanner({ sendChat, modelStore } = {}) {
  if (typeof sendChat !== 'function') throw new TypeError('Workbench planner 需要 sendChat')

  return {
    async nextAction({ session, tools, signal } = {}) {
      const response = await sendChat(plannerPrompt({ session, tools }), false, {
        model: read(modelStore?.selectedChatModel),
        isolated: true,
        signal,
        systemPrompt: '你是桌面 Agent 的单步调度器。严格返回一个 JSON next action。'
      })
      const text = extractText(response)
      if (!text.trim()) {
        const error = new Error('Workbench Planner 返回为空')
        error.code = 'EMPTY_WORKBENCH_PLAN'
        throw error
      }
      try {
        return parseAction(text)
      } catch (error) {
        const invalid = new Error(`Workbench Planner 返回了无效动作：${error?.message || error}`)
        invalid.code = 'INVALID_WORKBENCH_PLAN'
        throw invalid
      }
    }
  }
}

export { compactSession, parseAction, plannerPrompt, truncateForPrompt }

export default createWorkbenchPlanner
