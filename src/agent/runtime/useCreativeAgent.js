import { computed, getCurrentScope, onScopeDispose, ref, unref } from 'vue'
import { runtimeLogs as canvasRuntimeLogs } from '@/stores/canvas'
import {
  AgentRunner,
  ContextManager,
  Planner,
  Verifier
} from '../core/index.js'
import { createModelRouter } from '../ModelRouter.js'
import { createCreativeToolRegistry } from './createCreativeToolRegistry.js'
import { appendRuntimeLog, sanitizeValue } from './runtimeLog.js'

const DEFAULT_MAX_STEPS = 8
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

const ACTION_LABELS = {
  generate_image: '生成图片',
  generate_video: '生成视频',
  finish: '检查并交付结果'
}

function normalizeBasePosition(value) {
  const position = typeof value === 'function' ? value() : value
  return {
    x: Number.isFinite(Number(position?.x)) ? Number(position.x) : 120,
    y: Number.isFinite(Number(position?.y)) ? Number(position.y) : 160
  }
}

function buildSteps(state, eventType) {
  const actions = state?.actions || []
  return actions.map((action, index) => {
    const isLast = index === actions.length - 1
    let status = 'completed'
    if (isLast && ['action', 'tool_started'].includes(eventType)) status = 'running'
    if (isLast && ['failed', 'cancelled'].includes(eventType)) status = eventType

    return {
      step: action.step || index + 1,
      tool: action.name,
      title: ACTION_LABELS[action.name] || action.name,
      description: action.reason || ACTION_LABELS[action.name] || action.name,
      status
    }
  })
}

function toViewState(state = {}, eventType = '') {
  const steps = buildSteps(state, eventType)
  const lastError = state.errors?.[state.errors.length - 1]
  return {
    ...sanitizeValue(state),
    steps,
    currentStep: steps[steps.length - 1] || null,
    result: state.outputs?.[state.outputs.length - 1]?.value || null,
    error: lastError?.message || ''
  }
}

function eventStatusText(event) {
  const actionName = event?.action?.name
  switch (event?.type) {
    case 'started': return '正在理解创作目标'
    case 'planning': return '正在决定下一步'
    case 'action': return actionName ? `已决定：${ACTION_LABELS[actionName] || actionName}` : '已制定下一步'
    case 'tool_started': return actionName === 'generate_video' ? '正在生成视频' : '正在生成图片'
    case 'tool_succeeded': return actionName === 'generate_video' ? '视频生成完成，正在检查' : '图片生成完成，正在检查'
    case 'finish_blocked': return '结果尚未达到交付条件，继续执行'
    case 'completed': return '任务已完成'
    case 'failed': return '任务执行失败'
    case 'cancelled': return '任务已取消'
    default: return ''
  }
}

function createPlannerLlm(sendChat, modelStore) {
  if (typeof sendChat !== 'function') return null

  return async ({ system, goal, targetType, state, messages }) => {
    const hasChatKey = String(unref(modelStore.currentChatApiKey) || '').trim()
    const chatModel = unref(modelStore.selectedChatModel)
    if (!hasChatKey || !chatModel) {
      throw new Error('未配置文本模型，使用本地 Creative Agent 计划器')
    }

    const userPrompt = [
      `创作目标：${goal}`,
      `最终交付类型：${targetType}`,
      `当前执行状态：${JSON.stringify(sanitizeValue(state))}`,
      messages?.length ? `最近上下文：${JSON.stringify(sanitizeValue(messages.slice(-8)))}` : '',
      '只决定现在要执行的一个动作。视频任务必须先有已完成图片，再调用 generate_video。',
      'input 中给出适合生成模型的中文 prompt，但不要指定模型名或 Provider。'
    ].filter(Boolean).join('\n\n')

    return sendChat(userPrompt, true, {
      model: chatModel,
      systemPrompt: system,
      isolated: true
    })
  }
}

/**
 * Vue bridge for the framework-agnostic Creative Agent core.
 *
 * @param {Object} options
 * @param {Function} options.sendChat useChat().send compatible function
 * @param {Object} options.modelStore active Pinia model store
 * @param {Object|Function} [options.basePosition] default canvas origin
 * @param {Function} [options.getBasePosition] default canvas origin getter
 */
export function useCreativeAgent({
  sendChat,
  modelStore,
  basePosition,
  getBasePosition,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxSteps = DEFAULT_MAX_STEPS,
  runtimeLogs: injectedRuntimeLogs,
  runner: injectedRunner
} = {}) {
  if (!modelStore) throw new Error('useCreativeAgent 需要 modelStore')

  const isRunning = ref(false)
  const currentState = ref({
    status: 'idle',
    goal: '',
    steps: [],
    currentStep: null,
    result: null,
    error: ''
  })
  const runtimeLogs = injectedRuntimeLogs || canvasRuntimeLogs
  const error = ref(null)
  const statusText = ref('等待创作目标')
  let runBasePosition = null

  const resolveBasePosition = () => normalizeBasePosition(
    runBasePosition || getBasePosition || basePosition
  )

  const modelRouter = createModelRouter(modelStore)
  const toolRegistry = createCreativeToolRegistry({
    modelStore,
    modelRouter,
    runtimeLogs,
    getBasePosition: resolveBasePosition,
    timeoutMs
  })
  const contextManager = new ContextManager()
  const planner = new Planner({
    llm: createPlannerLlm(sendChat, modelStore),
    systemPrompt: '你是 YUFENG Creative Agent。你按目标逐步调用工具，不能指定具体模型，不能假设媒体已生成。'
  })
  const verifier = new Verifier()
  const runner = injectedRunner || new AgentRunner({
    planner,
    toolRegistry,
    verifier,
    contextManager,
    maxSteps
  })

  const unsubscribe = runner.subscribe((event) => {
    currentState.value = toViewState(event.state, event.type)
    isRunning.value = event.state?.status === 'running'
    statusText.value = eventStatusText(event) || statusText.value

    const logType = ['failed'].includes(event.type)
      ? 'error'
      : ['completed', 'tool_succeeded'].includes(event.type)
        ? 'success'
        : event.type === 'cancelled'
          ? 'warning'
          : 'info'
    appendRuntimeLog(runtimeLogs, logType, statusText.value, {
      event: event.type,
      action: event.action?.name,
      step: event.state?.stepCount
    })
  })

  const run = async (goal, options = {}) => {
    const normalizedGoal = String(goal || '').trim()
    if (!normalizedGoal) throw new Error('请输入创作目标')
    if (isRunning.value) throw new Error('Creative Agent 正在执行另一个任务')

    error.value = null
    runBasePosition = options.basePosition || null
    contextManager.clear()
    currentState.value = {
      status: 'running',
      goal: normalizedGoal,
      steps: [],
      currentStep: null,
      result: null,
      error: ''
    }
    isRunning.value = true
    statusText.value = '正在启动 Creative Agent'
    appendRuntimeLog(runtimeLogs, 'info', 'Creative Agent 任务已启动', { goal: normalizedGoal })

    try {
      const result = await runner.run(normalizedGoal, {
        signal: options.signal,
        targetType: options.targetType,
        maxSteps: options.maxSteps || maxSteps,
        contextManager
      })
      currentState.value = toViewState(result, 'completed')
      statusText.value = '任务已完成'
      return currentState.value
    } catch (runError) {
      error.value = runError
      const snapshot = runner.state?.snapshot?.() || {
        ...currentState.value,
        status: runError?.name === 'AbortError' ? 'cancelled' : 'failed'
      }
      currentState.value = toViewState(snapshot, snapshot.status)
      currentState.value.error = runError?.message || String(runError)
      statusText.value = snapshot.status === 'cancelled' ? '任务已取消' : '任务执行失败'
      throw runError
    } finally {
      isRunning.value = false
      runBasePosition = null
    }
  }

  const cancel = (reason = '用户取消了 Creative Agent 任务') => runner.cancel(reason)
  const dispose = () => {
    runner.cancel('Creative Agent runtime disposed')
    unsubscribe()
  }

  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    run,
    cancel,
    dispose,
    isRunning: computed(() => isRunning.value),
    currentState,
    statusText: computed(() => statusText.value),
    runtimeLogs,
    error,
    runner,
    planner,
    toolRegistry,
    modelRouter,
    contextManager,
    verifier
  }
}

export { toViewState, eventStatusText }

export default useCreativeAgent
