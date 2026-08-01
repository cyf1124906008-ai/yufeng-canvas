import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import {
  AgentRunner,
  ContextManager,
  Planner,
  ToolRegistry,
  Verifier
} from '../core/index.js'
import { RunProjector } from '../headless/index.js'
import { RunHistoryRepository } from '../memory/index.js'
import { createModelRouter } from '../ModelRouter.js'
import { createHeadlessChatClient } from './headlessChatClient.js'
import {
  createHeadlessGenerateImageTool,
  createHeadlessImageArtifactStore
} from './headlessImageTool.js'
import { createHeadlessAnalyzeImageTool } from './headlessAnalyzeImageTool.js'
import { createHeadlessGenerateVideoTool } from './headlessVideoTool.js'
import { appendRuntimeLog } from './runtimeLog.js'
import {
  hydrateArtifactManifest,
  normalizeRemoteUrl,
  serializeArtifactManifest
} from './artifactPersistence.js'

const DEFAULT_MAX_STEPS = 10
const UNSAFE_RETRY_CODES = new Set([
  'BACKGROUND_REQUEST_PENDING',
  'VIDEO_TASK_PENDING',
  'PROVIDER_EMPTY_IMAGE_RESULT',
  'PROVIDER_EMPTY_VIDEO_RESULT',
  'VIDEO_TASK_FAILED'
])
const REMOTE_URL = /^https?:\/\//i
const DATA_IMAGE_URL = /^data:image\/[^;,]+(?:;[^,]*)?;base64,/i
const ACTIVE_HISTORY_STATUSES = new Set(['queued', 'planning', 'running', 'waiting', 'retrying'])
const DEFAULT_HISTORY_IO_TIMEOUT_MS = 5_000

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

function defaultHistoryStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function createDefaultHistoryRepository(storage) {
  if (!storage) return null
  try {
    return new RunHistoryRepository({ storage })
  } catch {
    return null
  }
}

function desktopAssetApi(injected) {
  if (injected !== undefined) return injected
  try {
    return globalThis.window?.desktopApp?.agentAssets || null
  } catch {
    return null
  }
}

function withHistoryIoTimeout(value, timeoutMs, code = 'RUN_HISTORY_IO_TIMEOUT') {
  const duration = Number(timeoutMs)
  if (!Number.isFinite(duration) || duration <= 0) return Promise.resolve(value)
  let timer
  return Promise.race([
    Promise.resolve(value),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('本地运行历史 I/O 超时')
        error.code = code
        reject(error)
      }, duration)
    })
  ]).finally(() => clearTimeout(timer))
}

function recoverInterruptedHistory(repository, onError = null) {
  if (!repository?.list || !repository?.upsert) return []
  const report = (error, operation) => {
    try {
      onError?.(error, operation)
    } catch {
      // Optional history diagnostics must never block Agent initialization.
    }
  }
  let records
  try {
    records = repository.list()
  } catch (error) {
    report(error, 'list')
    return []
  }

  const recovered = (Array.isArray(records) ? records : []).map((record) => {
    const status = String(record?.status || record?.snapshot?.status || '').toLowerCase()
    if (!ACTIVE_HISTORY_STATUSES.has(status)) return record
    const interrupted = {
      ...record,
      status: 'interrupted',
      completedAt: record.completedAt || Date.now(),
      snapshot: {
        ...(record.snapshot || {}),
        status: 'interrupted',
        currentAction: null,
        completedAt: record.snapshot?.completedAt || Date.now()
      }
    }
    try {
      repository.upsert(interrupted)
    } catch (error) {
      report(error, 'upsert_interrupted')
    }
    return interrupted
  })

  try {
    const persisted = repository.list()
    if (!Array.isArray(persisted)) return recovered
    return persisted.map((record) => {
      const id = String(record?.runId || record?.id || '')
      const fallback = recovered.find(item => String(item?.runId || item?.id || '') === id)
      const persistedStatus = String(record?.status || record?.snapshot?.status || '').toLowerCase()
      return ACTIVE_HISTORY_STATUSES.has(persistedStatus) && fallback?.status === 'interrupted'
        ? fallback
        : record
    })
  } catch (error) {
    report(error, 'list_recovered')
    return recovered
  }
}

function createAssetSaveEntry({ save, inFlightSaves, cacheKey, cleanupLateAsset }) {
  const existing = inFlightSaves.get(cacheKey)
  if (existing) return existing

  const entry = {
    promise: null,
    waiters: 0,
    settled: false,
    timedOut: false,
    adopted: false,
    cleanupStarted: false,
    saved: null
  }
  const finalize = async () => {
    if (!entry.settled || entry.waiters > 0 || entry.cleanupStarted) return
    entry.cleanupStarted = true
    try {
      if (entry.timedOut && !entry.adopted && entry.saved?.ok && entry.saved.assetRef && entry.saved.assetProof) {
        await cleanupLateAsset?.({
          ref: String(entry.saved.assetRef),
          proof: String(entry.saved.assetProof)
        })
      }
    } catch {
      // Cleanup is best-effort; the history queue must continue draining.
    } finally {
      if (inFlightSaves.get(cacheKey) === entry) inFlightSaves.delete(cacheKey)
    }
  }

  entry.promise = Promise.resolve().then(save)
  entry.promise.then(
    saved => {
      entry.saved = saved
      entry.settled = true
      void finalize()
    },
    () => {
      entry.settled = true
      void finalize()
    }
  )
  entry.finalize = finalize
  inFlightSaves.set(cacheKey, entry)
  return entry
}

async function externalizeArtifacts(records, {
  runId,
  assets,
  assetRefs,
  inFlightSaves,
  cleanupLateAsset,
  timeoutMs = DEFAULT_HISTORY_IO_TIMEOUT_MS
} = {}) {
  const result = []
  for (const original of Array.isArray(records) ? records : []) {
    if (!original || typeof original !== 'object') continue
    const record = { ...original }
    const source = String(record.source || record.url || '').trim()

    if (DATA_IMAGE_URL.test(source)) {
      const cacheKey = `${runId || 'run'}:${record.id || result.length}`
      const cachedAsset = assetRefs.get(cacheKey)
      let assetRef = cachedAsset?.ref || ''
      let assetProof = cachedAsset?.proof || ''
      if (!assetRef && typeof assets?.saveDataUrl === 'function') {
        const saveEntry = createAssetSaveEntry({
          save: () => assets.saveDataUrl(source, runId || 'run'),
          inFlightSaves,
          cacheKey,
          cleanupLateAsset
        })
        saveEntry.waiters += 1
        try {
          const saved = await withHistoryIoTimeout(
            saveEntry.promise,
            timeoutMs,
            'RUN_HISTORY_ASSET_SAVE_TIMEOUT'
          )
          if (saved?.ok && saved.assetRef && saved.assetProof) {
            assetRef = String(saved.assetRef)
            assetProof = String(saved.assetProof)
            saveEntry.adopted = true
            assetRefs.set(cacheKey, { ref: assetRef, proof: assetProof })
          }
        } catch (saveError) {
          if (saveError?.code === 'RUN_HISTORY_ASSET_SAVE_TIMEOUT') saveEntry.timedOut = true
          // Metadata history remains useful even when desktop media
          // externalization fails. The media bytes are still never persisted.
        } finally {
          saveEntry.waiters = Math.max(0, saveEntry.waiters - 1)
          await saveEntry.finalize()
        }
      }
      record.source = ''
      record.url = ''
      if (assetRef && assetProof) {
        record.assetRef = assetRef
        record.assetProof = assetProof
      }
    } else if (REMOTE_URL.test(source)) {
      try {
        record.source = normalizeRemoteUrl(source)
      } catch {
        record.source = ''
        record.url = ''
      }
    } else if (source && !record.assetRef && !record.assetPath) {
      // blob/data/bare media and unknown local references cannot survive a
      // renderer restart. Preserve the artifact metadata, never its bytes.
      record.source = ''
      record.url = ''
    }
    result.push(record)
  }
  return result
}

function localAssetRefs(records) {
  const refs = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    const runId = String(record?.runId || record?.id || '').trim()
    if (!runId) continue
    for (const artifact of record?.artifactManifest?.artifacts || []) {
      if (artifact?.media?.kind === 'local_asset' && artifact.media.ref && artifact.media.proof) {
        refs.set(`${runId}:${String(artifact.media.ref)}`, {
          runId,
          ref: String(artifact.media.ref),
          proof: String(artifact.media.proof)
        })
      }
    }
  }
  return [...refs.values()]
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
  runtimeLogs: injectedRuntimeLogs,
  historyRepository: injectedHistoryRepository,
  historyStorage,
  desktopAssets: injectedDesktopAssets,
  historyIoTimeoutMs = DEFAULT_HISTORY_IO_TIMEOUT_MS
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
  const historyRepository = injectedHistoryRepository === undefined
    ? createDefaultHistoryRepository(historyStorage === undefined ? defaultHistoryStorage() : historyStorage)
    : injectedHistoryRepository
  const desktopAssets = desktopAssetApi(injectedDesktopAssets)
  const historyRecords = ref(recoverInterruptedHistory(historyRepository, (historyError, operation) => {
    appendRuntimeLog(runtimeLogs, 'warning', '运行历史恢复失败，Agent 将继续启动', {
      operation,
      code: historyError?.code || 'RUN_HISTORY_RECOVERY_FAILED'
    })
  }))
  const historyLoading = ref(false)
  const selectedHistoryId = ref('')
  const historySnapshot = ref(null)
  const historyArtifacts = ref([])
  const persistedAssetRefs = new Map()
  const inFlightAssetSaves = new Map()
  const deletedRunIds = new Set()
  let historySelectionSequence = 0
  let historyGeneration = 0
  let persistenceQueue = Promise.resolve()

  const forgetAssetRefs = (refs) => {
    const removed = new Set(refs.map(value => typeof value === 'string' ? value : value?.ref))
    for (const [key, value] of persistedAssetRefs) {
      if (removed.has(value?.ref)) persistedAssetRefs.delete(key)
    }
  }

  const refreshArtifacts = () => {
    artifacts.value = typeof artifactStore.list === 'function'
      ? artifactStore.list().map(artifactView)
      : []
  }
  const refreshHistory = () => {
    historyRecords.value = historyRepository?.list?.() || []
    return historyRecords.value
  }
  const deleteLocalAssets = async (descriptors, { runId = '', retained = [] } = {}) => {
    if (!descriptors.length || typeof desktopAssets?.deleteRefs !== 'function') return null
    const groups = new Map()
    for (const descriptor of descriptors) {
      const owner = String(descriptor?.runId || runId || '').trim()
      if (!owner || !descriptor?.ref || !descriptor?.proof) continue
      if (!groups.has(owner)) groups.set(owner, [])
      groups.get(owner).push({ ref: descriptor.ref, proof: descriptor.proof })
    }
    const results = []
    for (const [owner, ownedDescriptors] of groups) {
      const retainedForRun = retained
        .filter(value => String(value?.runId || '') === owner)
        .map(value => ({ ref: value.ref, proof: value.proof }))
      results.push(await withHistoryIoTimeout(
        desktopAssets.deleteRefs(owner, ownedDescriptors, retainedForRun),
        historyIoTimeoutMs,
        'RUN_HISTORY_ASSET_DELETE_TIMEOUT'
      ))
    }
    return results
  }
  const persistRun = async (nextSnapshot, rawArtifacts, scheduledGeneration) => {
    if (!historyRepository?.upsert || !nextSnapshot?.runId) return null
    if (scheduledGeneration !== historyGeneration || deletedRunIds.has(nextSnapshot.runId)) return null
    const previousRecords = historyRepository.list?.() || []
    const durableArtifacts = await externalizeArtifacts(rawArtifacts, {
      runId: nextSnapshot.runId,
      assets: desktopAssets,
      assetRefs: persistedAssetRefs,
      inFlightSaves: inFlightAssetSaves,
      cleanupLateAsset: descriptor => deleteLocalAssets([descriptor], {
        runId: nextSnapshot.runId
      }),
      timeoutMs: historyIoTimeoutMs
    })
    if (scheduledGeneration !== historyGeneration || deletedRunIds.has(nextSnapshot.runId)) {
      const staleAssets = durableArtifacts
        .filter(record => record.assetRef && record.assetProof)
        .map(record => ({ runId: nextSnapshot.runId, ref: record.assetRef, proof: record.assetProof }))
      forgetAssetRefs(staleAssets)
      await deleteLocalAssets(staleAssets, {
        retained: localAssetRefs(historyRepository.list?.() || [])
      }).catch(() => null)
      return null
    }
    const artifactManifest = await serializeArtifactManifest(durableArtifacts, {
      runId: nextSnapshot.runId,
      projectId: nextSnapshot.runId
    })
    if (scheduledGeneration !== historyGeneration || deletedRunIds.has(nextSnapshot.runId)) return null
    const saved = historyRepository.upsert({
      runId: nextSnapshot.runId,
      goal: nextSnapshot.goal,
      status: nextSnapshot.status,
      stepCount: nextSnapshot.stepCount,
      startedAt: nextSnapshot.startedAt,
      updatedAt: nextSnapshot.updatedAt,
      completedAt: nextSnapshot.completedAt,
      artifactCount: artifactManifest.artifacts.length,
      snapshot: nextSnapshot,
      artifactManifest
    })
    const currentRecords = refreshHistory()
    const retainedIds = new Set(currentRecords.map(record => String(record?.runId || record?.id || '')))
    const evictedRecords = previousRecords.filter(record => !retainedIds.has(String(record?.runId || record?.id || '')))
    const evictedRefs = localAssetRefs(evictedRecords)
    if (evictedRefs.length) await deleteLocalAssets(evictedRefs, { retained: localAssetRefs(currentRecords) })
    return saved
  }
  const schedulePersistence = (nextSnapshot) => {
    if (!historyRepository?.upsert || !nextSnapshot?.runId || deletedRunIds.has(nextSnapshot.runId)) return persistenceQueue
    const scheduledGeneration = historyGeneration
    const capturedArtifacts = typeof artifactStore.list === 'function'
      ? artifactStore.list().map(record => ({ ...record }))
      : []
    persistenceQueue = persistenceQueue
      .catch(() => null)
      .then(() => persistRun(nextSnapshot, capturedArtifacts, scheduledGeneration))
      .catch((historyError) => {
        appendRuntimeLog(runtimeLogs, 'warning', '运行历史保存失败', {
          code: historyError?.code || 'RUN_HISTORY_WRITE_FAILED'
        })
        return null
      })
    return persistenceQueue
  }
  const unsubscribeProjection = projector.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot
    refreshArtifacts()
    schedulePersistence(nextSnapshot)
  }, { emitCurrent: true })

  const selectHistory = async (runId) => {
    const normalizedId = String(runId || '').trim()
    const record = historyRepository?.get?.(normalizedId)
    if (!record) return null
    const selection = ++historySelectionSequence
    historyLoading.value = true
    try {
      const manifest = record.artifactManifest
      const hydrated = manifest
        ? await hydrateArtifactManifest(manifest, {
            resolveAssetRef: async (assetRef, _artifact, assetProof) => {
              if (typeof desktopAssets?.readAsDataUrl !== 'function') return null
              const restored = await withHistoryIoTimeout(
                desktopAssets.readAsDataUrl(assetRef, normalizedId, assetProof),
                historyIoTimeoutMs,
                'RUN_HISTORY_ASSET_READ_TIMEOUT'
              )
              return restored?.ok ? { dataUrl: restored.dataUrl } : null
            }
          })
        : { artifacts: [] }
      if (selection !== historySelectionSequence) return null
      selectedHistoryId.value = normalizedId
      historySnapshot.value = record.snapshot || record
      historyArtifacts.value = hydrated.artifacts.map(artifactView)
      return record
    } catch (historyError) {
      if (selection === historySelectionSequence) {
        selectedHistoryId.value = normalizedId
        historySnapshot.value = record.snapshot || record
        historyArtifacts.value = []
      }
      appendRuntimeLog(runtimeLogs, 'warning', '历史作品恢复失败', {
        code: historyError?.code || 'RUN_HISTORY_READ_FAILED'
      })
      return record
    } finally {
      if (selection === historySelectionSequence) historyLoading.value = false
    }
  }
  const showLiveRun = () => {
    historySelectionSequence += 1
    selectedHistoryId.value = ''
    historySnapshot.value = null
    historyArtifacts.value = []
    historyLoading.value = false
  }
  const deleteHistory = (runId) => {
    const normalizedId = String(runId || '').trim()
    if (normalizedId) deletedRunIds.add(normalizedId)
    const record = historyRepository?.get?.(normalizedId)
    const deleted = historyRepository?.delete?.(normalizedId) || false
    if (selectedHistoryId.value === normalizedId) showLiveRun()
    refreshHistory()
    const refs = localAssetRefs(record ? [record] : [])
    if (deleted && refs.length && typeof desktopAssets?.deleteRefs === 'function') {
      forgetAssetRefs(refs)
      deleteLocalAssets(refs, { retained: localAssetRefs(historyRecords.value) }).catch(() => null)
    }
    return deleted
  }
  const clearHistory = () => {
    const records = historyRepository?.list?.() || []
    historyGeneration += 1
    for (const record of records) deletedRunIds.add(String(record?.runId || record?.id || ''))
    if (snapshot.value.runId) deletedRunIds.add(String(snapshot.value.runId))
    historyRepository?.clear?.()
    showLiveRun()
    refreshHistory()
    const refs = localAssetRefs(records)
    if (refs.length && typeof desktopAssets?.deleteRefs === 'function') {
      forgetAssetRefs(refs)
      deleteLocalAssets(refs).catch(() => null)
    }
  }

  const run = async (goal, options = {}) => {
    const normalizedGoal = String(goal || '').trim()
    if (!normalizedGoal) throw new Error('请输入创作目标')
    if (snapshot.value.status === 'running') throw new Error('Agent 正在执行另一个任务')

    error.value = null
    lastGoal.value = normalizedGoal
    showLiveRun()
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
    historyRecords,
    historyLoading,
    selectedHistoryId,
    historySnapshot,
    historyArtifacts,
    refreshHistory,
    selectHistory,
    showLiveRun,
    deleteHistory,
    clearHistory,
    waitForHistoryPersistence: () => persistenceQueue,
    historyRepository,
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
