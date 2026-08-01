import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import {
  AgentRunner,
  ContextManager,
  Planner,
  ToolRegistry,
  Verifier
} from '../core/index.js'
import { RunProjector } from '../headless/index.js'
import { createModelRouter } from '../ModelRouter.js'
import { createHeadlessChatClient } from './headlessChatClient.js'
import {
  createHeadlessGenerateImageTool,
  createHeadlessImageArtifactStore
} from './headlessImageTool.js'
import { createHeadlessAnalyzeImageTool } from './headlessAnalyzeImageTool.js'
import { createHeadlessGenerateVideoTool } from './headlessVideoTool.js'
import { appendRuntimeLog } from './runtimeLog.js'

const DEFAULT_MAX_STEPS = 10
const UNSAFE_RETRY_CODES = new Set([
  'BACKGROUND_REQUEST_PENDING',
  'VIDEO_TASK_PENDING',
  'PROVIDER_EMPTY_IMAGE_RESULT',
  'PROVIDER_EMPTY_VIDEO_RESULT',
  'VIDEO_TASK_FAILED'
])

function read(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function plannerPrompt({ goal, targetType, state, messages }) {
  return [
    `用户最终目标：${goal}`,
    `交付类型：${targetType}`,
    `当前状态：${JSON.stringify(state)}`,
    messages?.length ? `最近上下文：${JSON.stringify(messages.slice(-8))}` : '',
    '只决定当前要执行的一个动作，不要输出动作列表。',
    '每张新图片都必须先 analyze_image；质量未通过时改进后重新生成，通过后才能 finish 或生成视频。',
    '不要指定模型名或 Provider。'
  ].filter(Boolean).join('\n\n')
}

function createPlannerLlm(sendChat, modelStore) {
  if (typeof sendChat !== 'function') return null
  return async ({ goal, targetType, state, messages, signal }) => sendChat(
    plannerPrompt({ goal, targetType, state, messages }),
    false,
    {
      model: read(modelStore.selectedChatModel),
      isolated: true,
      signal
    }
  )
}

function artifactView(record, index) {
  return {
    id: record.id,
    artifactRef: `artifact:${record.id}`,
    type: record.mediaType || record.kind || 'image',
    kind: record.kind || record.mediaType || 'image',
    status: record.status || 'completed',
    url: record.source || record.url || '',
    label: record.label || `候选作品 #${index + 1}`,
    model: record.model || '',
    protocol: record.protocol || '',
    createdAt: record.createdAt || null,
    attempt: index + 1
  }
}

/** Vue bridge for a Canvas-free Creative Agent runtime. */
export function useHeadlessCreativeAgent({
  modelStore,
  modelRouter: injectedModelRouter,
  sendChat: injectedSendChat,
  chatClient: injectedChatClient,
  imageApiClient,
  videoApiClient,
  artifactStore: injectedArtifactStore,
  generateImageTool: injectedGenerateImageTool,
  analyzeImageTool: injectedAnalyzeImageTool,
  generateVideoTool: injectedGenerateVideoTool,
  plannerLlm,
  maxSteps = DEFAULT_MAX_STEPS,
  maxQualityRetries = 2,
  allowDegradedReview = true,
  runtimeLogs: injectedRuntimeLogs
} = {}) {
  if (!modelStore) throw new Error('useHeadlessCreativeAgent 需要 modelStore')

  const runtimeLogs = injectedRuntimeLogs || ref([])
  const artifactStore = injectedArtifactStore || createHeadlessImageArtifactStore()
  const modelRouter = injectedModelRouter || createModelRouter(modelStore)
  const chatClient = injectedChatClient || createHeadlessChatClient({ modelStore, runtimeLogs })
  const sendChat = injectedSendChat || chatClient.send
  const generateImageTool = injectedGenerateImageTool || createHeadlessGenerateImageTool({
    modelStore,
    modelRouter,
    apiClient: imageApiClient,
    artifactStore,
    runtimeLogs
  })
  const analyzeImageTool = injectedAnalyzeImageTool || createHeadlessAnalyzeImageTool({
    artifactStore,
    modelRouter,
    sendChat,
    runtimeLogs,
    qualityPolicy: { allowDegradedReview }
  })
  const generateVideoTool = injectedGenerateVideoTool || (
    typeof modelRouter?.route === 'function'
      ? createHeadlessGenerateVideoTool({
          modelStore,
          modelRouter,
          apiClient: videoApiClient,
          artifactStore,
          runtimeLogs
        })
      : null
  )

  const toolRegistry = new ToolRegistry()
    .register('generate_image', generateImageTool)
    .register('analyze_image', analyzeImageTool)
  if (generateVideoTool) toolRegistry.register('generate_video', generateVideoTool)

  const contextManager = new ContextManager()
  const planner = new Planner({
    llm: plannerLlm === undefined ? createPlannerLlm(sendChat, modelStore) : plannerLlm,
    systemPrompt: '你是 YUFENG Creative Agent。你逐步调用工具实现用户最终目标，不依赖人工搭建工作流。',
    observationEnabled: true,
    maxQualityRetries,
    allowDegradedReview,
    dynamicWorkflowEnabled: false
  })
  const verifier = new Verifier({ requireImageReview: true, allowDegradedReview })
  const runner = new AgentRunner({
    planner,
    toolRegistry,
    verifier,
    contextManager,
    maxSteps
  })
  const projector = new RunProjector({ runner })
  const snapshot = ref(projector.snapshot())
  const artifacts = ref([])
  const error = ref(null)
  const lastGoal = ref('')

  const refreshArtifacts = () => {
    artifacts.value = typeof artifactStore.list === 'function'
      ? artifactStore.list().map(artifactView)
      : []
  }
  const unsubscribeProjection = projector.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot
    refreshArtifacts()
  }, { emitCurrent: true })

  const run = async (goal, options = {}) => {
    const normalizedGoal = String(goal || '').trim()
    if (!normalizedGoal) throw new Error('请输入创作目标')
    if (snapshot.value.status === 'running') throw new Error('Agent 正在执行另一个任务')

    error.value = null
    lastGoal.value = normalizedGoal
    artifactStore.clear?.()
    refreshArtifacts()
    projector.reset({ goal: normalizedGoal, status: 'idle' })
    contextManager.clear()
    appendRuntimeLog(runtimeLogs, 'info', 'Headless Agent 任务已启动', { goal: normalizedGoal })

    try {
      const result = await runner.run(normalizedGoal, {
        signal: options.signal,
        targetType: options.targetType,
        maxSteps: options.maxSteps || maxSteps,
        contextManager
      })
      refreshArtifacts()
      return result
    } catch (runError) {
      error.value = runError
      refreshArtifacts()
      throw runError
    }
  }

  const cancel = (reason = '用户停止了 Agent 任务') => runner.cancel(reason)
  const canRetry = computed(() => {
    const current = snapshot.value
    return current.status === 'failed' &&
      current.error?.acceptedByProvider !== true &&
      !UNSAFE_RETRY_CODES.has(current.error?.code) &&
      !UNSAFE_RETRY_CODES.has(current.error?.providerCode)
  })
  const retry = (options = {}) => {
    if (!canRetry.value) {
      const retryError = new Error('当前任务不能安全地自动重新提交；供应商任务可能仍在执行，或本次运行并非可重试失败')
      retryError.code = 'UNSAFE_AGENT_RETRY'
      throw retryError
    }
    return run(lastGoal.value, options)
  }
  const dispose = () => {
    runner.cancel('Headless Agent runtime disposed')
    unsubscribeProjection()
    projector.detach()
  }
  if (getCurrentScope()) onScopeDispose(dispose)

  return {
    run,
    retry,
    cancel,
    dispose,
    snapshot,
    artifacts,
    runtimeLogs,
    error,
    isRunning: computed(() => snapshot.value.status === 'running'),
    canRetry,
    runner,
    planner,
    verifier,
    toolRegistry,
    modelRouter,
    artifactStore,
    projector
  }
}

export { artifactView, createPlannerLlm }

export default useHeadlessCreativeAgent
