import { computed, getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'
import {
  normalizeApprovalMode,
  projectWorkbenchEvents
} from '../workbench/index.js'
import {
  createCompatibilityWorkbenchHarness,
  createWorkbenchHarnessKernel
} from '../harness/index.js'
import { WorkbenchSessionRepository } from '../memory/index.js'
import { createHeadlessChatClient } from './headlessChatClient.js'
import {
  WORKBENCH_TOOL_GROUPS,
  createDesktopWorkbenchToolRegistry,
  desktopApi,
  setWorkbenchToolGroupEnabled
} from './desktopWorkbenchTools.js'
import { createWorkbenchPlanner } from './workbenchPlanner.js'
import { useHeadlessCreativeAgent } from './useHeadlessCreativeAgent.js'
import { appendRuntimeLog } from './runtimeLog.js'

const ACTIVE_STATUSES = new Set(['running', 'awaiting_approval'])
const RESTART_STATUSES = new Set(['failed', 'cancelled'])
const DEFAULT_MAX_ACTIONS_PER_TURN = 24
const MIN_MAX_ACTIONS_PER_TURN = 4
const MAX_MAX_ACTIONS_PER_TURN = 64

function readSettingSource(source) {
  try {
    const value = typeof source === 'function' ? source() : source
    return value && typeof value === 'object' && 'value' in value ? value.value : value
  } catch {
    return undefined
  }
}

export function resolveMaxActionsPerTurn(source) {
  const parsed = Number.parseInt(readSettingSource(source), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ACTIONS_PER_TURN
  return Math.min(MAX_MAX_ACTIONS_PER_TURN, Math.max(MIN_MAX_ACTIONS_PER_TURN, parsed))
}

function initialToolGroupState(source) {
  const value = readSettingSource(source)
  const configured = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(Object.keys(WORKBENCH_TOOL_GROUPS).map(group => [
    group,
    typeof configured[group] === 'boolean' ? configured[group] : true
  ]))
}

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
  return String(firstUser?.displayContent || firstUser?.content || '新任务').trim().slice(0, 160)
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
  approvalMode: initialApprovalMode = 'ask',
  toolGroups: initialToolGroups = null,
  maxActionsPerTurn = 24,
  reasoningEffort = 'auto',
  planner: injectedPlanner = null,
  plannerFactory: injectedPlannerFactory = null,
  plannerOptions = {},
  harnessKernelFactory = createWorkbenchHarnessKernel
} = {}) {
  if (!modelStore) throw new TypeError('useAgentWorkbench 需要 modelStore')

  const creativeAgent = injectedCreativeAgent || useHeadlessCreativeAgent({ modelStore })
  const runtimeLogs = creativeAgent.runtimeLogs || ref([])
  const chatClient = injectedChatClient || createHeadlessChatClient({
    modelStore,
    runtimeLogs,
    reasoningEffort
  })
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
  const toolGroupState = ref(initialToolGroupState(initialToolGroups))
  for (const [group, enabled] of Object.entries(toolGroupState.value)) {
    setWorkbenchToolGroupEnabled(toolRegistry, group, enabled)
  }
  const createPlanner = () => {
    if (typeof injectedPlannerFactory === 'function') {
      return injectedPlannerFactory({ sendChat, modelStore, ...plannerOptions })
    }
    if (injectedPlanner) return injectedPlanner
    return createWorkbenchPlanner({ sendChat, modelStore, ...plannerOptions })
  }
  let planner = null
  let harnessKernel
  try {
    harnessKernel = harnessKernelFactory({
      plannerFactory: createPlanner,
      toolRegistry
    })
    const requiredKernelMethods = ['createSession', 'plannerFor', 'snapshot', 'disposeSession', 'dispose']
    if (!harnessKernel || requiredKernelMethods.some(method => typeof harnessKernel[method] !== 'function')) {
      throw new TypeError('Harness kernel factory returned an invalid runtime')
    }
  } catch (kernelError) {
    appendRuntimeLog(runtimeLogs, 'warning', 'DeepSeek Harness 内核启动失败，已进入可观测兼容模式', {
      code: kernelError?.code || 'HARNESS_KERNEL_INIT_FAILED'
    })
    harnessKernel = createCompatibilityWorkbenchHarness({
      plannerFactory: createPlanner,
      toolRegistry,
      error: kernelError
    })
  }
  const harnessRuntimeSnapshot = shallowRef(harnessKernel.snapshot())
  const unsubscribeHarness = harnessKernel.subscribe?.(snapshot => {
    harnessRuntimeSnapshot.value = snapshot
  }) || (() => {})
  void Promise.resolve(harnessKernel.ready).then(snapshot => {
    harnessRuntimeSnapshot.value = snapshot
    if (snapshot.lifecycle === 'degraded' && snapshot.mode !== 'compatibility-fallback') {
      appendRuntimeLog(runtimeLogs, 'warning', 'DeepSeek Harness 插件树未完全激活', {
        code: snapshot.errors?.[0]?.code || 'HARNESS_PLUGIN_TREE_DEGRADED'
      })
    }
  }).catch(kernelError => {
    appendRuntimeLog(runtimeLogs, 'warning', 'DeepSeek Harness 就绪检查失败', {
      code: kernelError?.code || 'HARNESS_KERNEL_READY_FAILED'
    })
  })
  const repository = injectedHistoryRepository === undefined
    ? createHistoryRepository(historyStorage === undefined ? defaultStorage() : historyStorage)
    : injectedHistoryRepository

  const session = shallowRef(null)
  const selectedApprovalMode = ref(normalizeApprovalMode(
    initialApprovalMode && typeof initialApprovalMode === 'object' && 'value' in initialApprovalMode
      ? initialApprovalMode.value
      : initialApprovalMode
  ))
  const projection = ref({
    status: 'idle',
    approvalMode: selectedApprovalMode.value,
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
  const activeOperationCount = ref(0)
  let unsubscribe = null
  let disposePromise = null

  const releaseHarnessSession = (target, reason) => {
    if (!target) return
    target.cancel(reason)
    void Promise.resolve(harnessKernel.disposeSession(target, reason)).catch(scopeError => {
      appendRuntimeLog(runtimeLogs, 'warning', 'DeepSeek Harness 会话 scope 销毁失败', {
        code: scopeError?.code || 'HARNESS_SESSION_SCOPE_DISPOSE_FAILED',
        sessionId: target.sessionId
      })
    })
  }

  const trackOperation = async operation => {
    activeOperationCount.value += 1
    try {
      return await operation()
    } finally {
      activeOperationCount.value = Math.max(0, activeOperationCount.value - 1)
    }
  }

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
    const previousSession = session.value
    unsubscribe?.()
    if (previousSession && previousSession !== nextSession) {
      releaseHarnessSession(previousSession, 'Workbench switched session')
    }
    session.value = nextSession
    selectedSessionId.value = nextSession.sessionId
    isHistorySelection.value = history
    projection.value = nextSession.snapshot()
    selectedApprovalMode.value = normalizeApprovalMode(projection.value.approvalMode || 'ask')
    error.value = null
    screenshots.value = []
    creativeArtifacts.value = []
    unsubscribe = nextSession.subscribe(() => {
      projection.value = nextSession.snapshot()
      selectedApprovalMode.value = normalizeApprovalMode(projection.value.approvalMode || 'ask')
      persistCurrent()
    })
    if (persist) persistCurrent()
    return nextSession
  }

  const createSession = ({ sessionId, events = [] } = {}) => {
    const nextSession = harnessKernel.createSession({
      sessionId,
      events,
      approvalMode: selectedApprovalMode.value,
      maxActionsPerTurn: resolveMaxActionsPerTurn(maxActionsPerTurn)
    })
    planner = harnessKernel.plannerFor(nextSession)
    return attachSession(nextSession, { history: false })
  }

  const newTask = () => {
    if (session.value && ACTIVE_STATUSES.has(projection.value.status)) {
      session.value.cancel('用户创建了新任务')
    }
    return createSession()
  }

  const submit = async (content, options = {}) => {
    const text = String(content || '').trim()
    if (!text) return null
    if (!session.value || RESTART_STATUSES.has(projection.value.status)) newTask()
    error.value = null
    try {
      return await trackOperation(() => session.value.submitUserMessage(text, {
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.displayContent != null ? { displayContent: options.displayContent } : {})
      }))
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
      return await trackOperation(() => session.value.resolveApproval(pending.id, { status: decision, reason }))
    } catch (approvalError) {
      error.value = approvalError
      throw approvalError
    }
  }

  const approve = () => resolveApproval('approved')
  const reject = reason => resolveApproval('rejected', reason || '用户拒绝了这项操作')
  const cancel = () => session.value?.cancel('用户停止了任务') || false

  const guide = async (content, options = {}) => {
    if (!session.value) return null
    error.value = null
    try {
      return await trackOperation(() => session.value.submitGuidance(content, options))
    } catch (guidanceError) {
      error.value = guidanceError
      throw guidanceError
    }
  }

  const resume = async (options = {}) => {
    if (!session.value) return null
    error.value = null
    const wasHistory = isHistorySelection.value
    const previousResumeCount = Number(projection.value.resumeCount || 0)
    try {
      const running = trackOperation(() => session.value.resume(options))
      isHistorySelection.value = false
      return await running
    } catch (resumeError) {
      if (wasHistory && Number(projection.value.resumeCount || 0) === previousResumeCount) {
        isHistorySelection.value = true
      }
      error.value = resumeError
      throw resumeError
    }
  }

  const setApprovalMode = async (value) => {
    const nextMode = normalizeApprovalMode(value)
    if (isHistorySelection.value) {
      const historyModeError = new Error('历史任务中的审批模式仅供审计展示；请创建新任务后再切换')
      historyModeError.code = 'APPROVAL_MODE_HISTORY_READ_ONLY'
      error.value = historyModeError
      throw historyModeError
    }
    if (!session.value) {
      selectedApprovalMode.value = nextMode
      return null
    }
    error.value = null
    try {
      const result = await session.value.setApprovalMode(nextMode)
      selectedApprovalMode.value = nextMode
      return result
    } catch (modeError) {
      error.value = modeError
      throw modeError
    }
  }

  const setToolGroupEnabled = (group, enabled) => {
    const normalizedGroup = String(group || '')
    const nextEnabled = setWorkbenchToolGroupEnabled(toolRegistry, normalizedGroup, enabled)
    toolGroupState.value = { ...toolGroupState.value, [normalizedGroup]: nextEnabled }
    return nextEnabled
  }

  const selectSession = (sessionId) => {
    if (session.value && ACTIVE_STATUSES.has(projection.value.status)) return null
    try {
      const record = repository?.get?.(String(sessionId || '').trim())
      if (!record) return null
      const restoredSession = harnessKernel.createSession({
        sessionId: record.sessionId,
        events: interruptedEvents(record),
        maxActionsPerTurn: resolveMaxActionsPerTurn(maxActionsPerTurn)
      })
      planner = harnessKernel.plannerFor(restoredSession)
      return attachSession(restoredSession, { persist: true, history: true })
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
      releaseHarnessSession(session.value, '用户删除了任务历史')
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
    releaseHarnessSession(session.value, '用户清空了任务历史')
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
      const unavailable = new Error('工作区选择只在 DataEyes Code 桌面 App 中可用')
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

  const displayMessages = computed(() => [...(projection.value.messages || [])])

  const pendingToolCall = computed(() => {
    const approval = projection.value.pendingApproval
    if (!approval) return null
    return projection.value.toolCalls?.find(call => call.id === approval.toolCallId) || null
  })

  const dispose = () => {
    if (disposePromise) return disposePromise
    session.value?.cancel('Workbench runtime disposed')
    unsubscribe?.()
    creativeAgent.dispose?.()
    disposePromise = Promise.resolve(harnessKernel.dispose())
      .then(snapshot => {
        harnessRuntimeSnapshot.value = snapshot
        return snapshot
      })
      .catch(kernelError => {
        appendRuntimeLog(runtimeLogs, 'warning', 'DeepSeek Harness 内核销毁失败', {
          code: kernelError?.code || 'HARNESS_KERNEL_DISPOSE_FAILED'
        })
        throw kernelError
      })
      .finally(unsubscribeHarness)
    return disposePromise
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
    toolProgress: computed(() => projection.value.toolProgress || []),
    workspaceDiffs: computed(() => projection.value.workspaceDiffs || []),
    plan: computed(() => projection.value.plan || null),
    pendingApproval: computed(() => projection.value.pendingApproval),
    pendingToolCall,
    status: computed(() => projection.value.status || 'idle'),
    isRunning: computed(() => projection.value.status === 'running'),
    isAwaitingApproval: computed(() => projection.value.status === 'awaiting_approval'),
    guidancePending: computed(() => Boolean(projection.value.guidancePending)),
    lastGuidance: computed(() => projection.value.lastGuidance || null),
    isStopping: computed(() => projection.value.status === 'cancelled' && activeOperationCount.value > 0),
    canResume: computed(() => (
      ['failed', 'cancelled'].includes(projection.value.status) && activeOperationCount.value === 0
    )),
    approvalMode: computed(() => selectedApprovalMode.value),
    setApprovalMode,
    toolGroups: computed(() => ({ ...toolGroupState.value })),
    setToolGroupEnabled,
    error,
    submit,
    approve,
    reject,
    cancel,
    guide,
    resume,
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
    harnessRuntime: computed(() => harnessRuntimeSnapshot.value),
    runtimeSnapshot: computed(() => harnessRuntimeSnapshot.value),
    toolRegistry,
    planner,
    repository,
    dispose
  }
}

export { interruptedEvents, titleFromProjection }

export default useAgentWorkbench
