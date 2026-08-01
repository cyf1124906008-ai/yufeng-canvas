import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import { WorkbenchSession, projectWorkbenchEvents } from '../workbench/index.js'
import { WorkbenchSessionRepository } from '../memory/index.js'
import { createHeadlessChatClient } from './headlessChatClient.js'
import { createDesktopWorkbenchToolRegistry, desktopApi } from './desktopWorkbenchTools.js'
import { createWorkbenchPlanner } from './workbenchPlanner.js'
import { useHeadlessCreativeAgent } from './useHeadlessCreativeAgent.js'
import { appendRuntimeLog } from './runtimeLog.js'

const ACTIVE_STATUSES = new Set(['running', 'awaiting_approval'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

function defaultStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function createHistoryRepository(storage) {
  if (!storage) return null
  try {
    return new WorkbenchSessionRepository({ storage })
  } catch {
    return null
  }
}

function titleFromProjection(projection) {
  const firstUser = projection?.messages?.find(message => message.role === 'user')
  return String(firstUser?.content || '新任务').trim().slice(0, 160)
}

function interruptedEvents(record) {
  const events = Array.isArray(record?.events) ? record.events.map(event => ({ ...event })) : []
  const projection = projectWorkbenchEvents(events)
  if (!['running', 'awaiting_approval'].includes(projection.status)) return events
  events.push({
    schemaVersion: 1,
    sessionId: record.sessionId,
    seq: events.length + 1,
    id: `event_interrupted_${Date.now()}`,
    type: 'cancelled',
    timestamp: Date.now(),
    detail: {
      error: {
        name: 'InterruptedSession',
        code: 'WORKBENCH_SESSION_INTERRUPTED',
        message: 'App 上次关闭时任务仍在执行；未自动重提本地或远程工具。'
      }
    }
  })
  return events
}

export function useAgentWorkbench({
  modelStore,
  sendChat: injectedSendChat,
  chatClient: injectedChatClient,
  desktopAgentTools: injectedDesktopAgentTools,
  creativeAgent: injectedCreativeAgent,
  historyRepository: injectedHistoryRepository,
  historyStorage,
  maxActionsPerTurn = 24
} = {}) {
  if (!modelStore) throw new TypeError('useAgentWorkbench 需要 modelStore')

  const creativeAgent = injectedCreativeAgent || useHeadlessCreativeAgent({ modelStore })
  const runtimeLogs = creativeAgent.runtimeLogs || ref([])
  const chatClient = injectedChatClient || createHeadlessChatClient({ modelStore, runtimeLogs })
  const sendChat = injectedSendChat || chatClient.send
  const agentTools = desktopApi(injectedDesktopAgentTools)
  const screenshots = ref([])
  const creativeArtifacts = ref([])
  const toolRegistry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: agentTools,
    creativeAgent,
    sendChat,
    onScreenshot: screenshot => {
      screenshots.value = [screenshot, ...screenshots.value].slice(0, 8)
    },
    onCreativeArtifacts: artifacts => {
      creativeArtifacts.value = artifacts
    }
  })
  const planner = createWorkbenchPlanner({ sendChat, modelStore })
  const repository = injectedHistoryRepository === undefined
    ? createHistoryRepository(historyStorage === undefined ? defaultStorage() : historyStorage)
    : injectedHistoryRepository

  const session = shallowRef(null)
  const projection = ref({
    status: 'idle',
    messages: [],
    toolCalls: [],
    observations: [],
    approvals: [],
    pendingApproval: null,
    final: null
  })
  const historyRecords = ref([])
  const selectedSessionId = ref('')
  const isHistorySelection = ref(false)
  const workspaceRoot = ref('')
  const capabilities = ref(null)
  const desktopReady = ref(false)
  const workspaceLoading = ref(false)
  const error = ref(null)
  let unsubscribe = null

  const refreshHistory = () => {
    try {
      historyRecords.value = repository?.list?.() || []
    } catch (historyError) {
      appendRuntimeLog(runtimeLogs, 'warning', 'Workbench 历史读取失败', {
        code: historyError?.code || 'WORKBENCH_HISTORY_READ_FAILED'
      })
      historyRecords.value = []
    }
    return historyRecords.value
  }

  const persistCurrent = () => {
    if (!repository?.upsert || !session.value) return
    const snapshot = session.value.snapshot()
    if (!snapshot.messages.length) return
    try {
      repository.upsert({
        sessionId: session.value.sessionId,
        title: titleFromProjection(snapshot),
        events: session.value.events()
      })
      refreshHistory()
    } catch (historyError) {
      appendRuntimeLog(runtimeLogs, 'warning', 'Workbench 历史保存失败', {
        code: historyError?.code || 'WORKBENCH_HISTORY_WRITE_FAILED'
      })
    }
  }

  const attachSession = (nextSession, { persist = false, history = false } = {}) => {
    unsubscribe?.()
    session.value = nextSession
    selectedSessionId.value = nextSession.sessionId
    isHistorySelection.value = history
    projection.value = nextSession.snapshot()
    error.value = null
    screenshots.value = []
    creativeArtifacts.value = []
    unsubscribe = nextSession.subscribe(() => {
      projection.value = nextSession.snapshot()
      persistCurrent()
    })
    if (persist) persistCurrent()
    return nextSession
  }

  const createSession = ({ sessionId, events = [] } = {}) => attachSession(new WorkbenchSession({
    sessionId,
    events,
    planner,
    toolRegistry,
    maxActionsPerTurn
  }), { history: false })

  const newTask = () => {
    if (session.value && ACTIVE_STATUSES.has(projection.value.status)) {
      session.value.cancel('用户创建了新任务')
    }
    return createSession()
  }

  const submit = async (content) => {
    const text = String(content || '').trim()
    if (!text) return null
    if (!session.value || TERMINAL_STATUSES.has(projection.value.status)) newTask()
    error.value = null
    try {
      return await session.value.submitUserMessage(text)
    } catch (submitError) {
      error.value = submitError
      throw submitError
    }
  }

  const resolveApproval = async (decision, reason = '') => {
    const pending = projection.value.pendingApproval
    if (!pending || !session.value) return null
    error.value = null
    try {
      return await session.value.resolveApproval(pending.id, { status: decision, reason })
    } catch (approvalError) {
      error.value = approvalError
      throw approvalError
    }
  }

  const approve = () => resolveApproval('approved')
  const reject = reason => resolveApproval('rejected', reason || '用户拒绝了这项操作')
  const cancel = () => session.value?.cancel('用户停止了任务') || false

  const selectSession = (sessionId) => {
    if (session.value && ACTIVE_STATUSES.has(projection.value.status)) return null
    try {
      const record = repository?.get?.(String(sessionId || '').trim())
      if (!record) return null
      return attachSession(new WorkbenchSession({
        sessionId: record.sessionId,
        events: interruptedEvents(record),
        planner,
        toolRegistry,
        maxActionsPerTurn
      }), { persist: true, history: true })
    } catch (historyError) {
      appendRuntimeLog(runtimeLogs, 'warning', 'Workbench 历史任务恢复失败', {
        code: historyError?.code || 'WORKBENCH_HISTORY_RESTORE_FAILED'
      })
      return null
    }
  }

  const deleteSession = (sessionId) => {
    const id = String(sessionId || '').trim()
    const isCurrent = selectedSessionId.value === id
    if (isCurrent) {
      unsubscribe?.()
      unsubscribe = null
      session.value?.cancel('用户删除了任务历史')
      session.value = null
      selectedSessionId.value = ''
      isHistorySelection.value = false
    }
    const deleted = repository?.delete?.(id) || false
    if (isCurrent) newTask()
    refreshHistory()
    return deleted
  }

  const clearHistory = () => {
    unsubscribe?.()
    unsubscribe = null
    session.value?.cancel('用户清空了任务历史')
    session.value = null
    selectedSessionId.value = ''
    isHistorySelection.value = false
    repository?.clear?.()
    newTask()
    refreshHistory()
  }

  const refreshDesktop = async () => {
    if (!agentTools) {
      desktopReady.value = false
      capabilities.value = { ok: false, platform: 'web', workspace: false, terminal: false, computer: {} }
      workspaceRoot.value = ''
      return capabilities.value
    }
    try {
      const [nextCapabilities, workspace] = await Promise.all([
        agentTools.getCapabilities?.(),
        agentTools.getWorkspaceRoot?.()
      ])
      capabilities.value = nextCapabilities || null
      workspaceRoot.value = String(workspace?.workspaceRoot || nextCapabilities?.workspaceRoot || '')
      desktopReady.value = true
      return nextCapabilities
    } catch (desktopError) {
      desktopReady.value = false
      appendRuntimeLog(runtimeLogs, 'warning', '桌面工具初始化失败', {
        code: desktopError?.code || 'DESKTOP_TOOLS_INIT_FAILED'
      })
      return null
    }
  }

  const chooseWorkspace = async () => {
    if (typeof agentTools?.chooseWorkspaceRoot !== 'function') {
      const unavailable = new Error('工作区选择只在 YUFENG Desktop App 中可用')
      unavailable.code = 'DESKTOP_TOOL_UNAVAILABLE'
      throw unavailable
    }
    workspaceLoading.value = true
    try {
      const result = await agentTools.chooseWorkspaceRoot({
        approval: { granted: true, action: 'workspace.choose' }
      })
      if (result?.ok && result.workspaceRoot) workspaceRoot.value = result.workspaceRoot
      await refreshDesktop()
      return result
    } finally {
      workspaceLoading.value = false
    }
  }

  const displayMessages = computed(() => {
    const items = [...(projection.value.messages || [])]
    const finalContent = projection.value.final?.content || (
      typeof projection.value.final === 'string' ? projection.value.final : ''
    )
    if (finalContent) {
      items.push({
        id: `final_${selectedSessionId.value}`,
        role: 'assistant',
        content: finalContent,
        final: true,
        createdAt: projection.value.completedAt
      })
    }
    return items
  })

  const pendingToolCall = computed(() => {
    const approval = projection.value.pendingApproval
    if (!approval) return null
    return projection.value.toolCalls?.find(call => call.id === approval.toolCallId) || null
  })

  const dispose = () => {
    session.value?.cancel('Workbench runtime disposed')
    unsubscribe?.()
    creativeAgent.dispose?.()
  }

  refreshHistory()
  newTask()
  void refreshDesktop()
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    session,
    projection,
    messages: displayMessages,
    toolCalls: computed(() => projection.value.toolCalls || []),
    observations: computed(() => projection.value.observations || []),
    pendingApproval: computed(() => projection.value.pendingApproval),
    pendingToolCall,
    status: computed(() => projection.value.status || 'idle'),
    isRunning: computed(() => projection.value.status === 'running'),
    isAwaitingApproval: computed(() => projection.value.status === 'awaiting_approval'),
    error,
    submit,
    approve,
    reject,
    cancel,
    newTask,
    selectSession,
    deleteSession,
    clearHistory,
    historyRecords,
    selectedSessionId,
    isHistorySelection,
    refreshHistory,
    workspaceRoot,
    workspaceLoading,
    chooseWorkspace,
    refreshDesktop,
    capabilities,
    desktopReady,
    screenshots,
    creativeArtifacts,
    creativeAgent,
    runtimeLogs,
    toolRegistry,
    planner,
    repository,
    dispose
  }
}

export { interruptedEvents, titleFromProjection }

export default useAgentWorkbench
