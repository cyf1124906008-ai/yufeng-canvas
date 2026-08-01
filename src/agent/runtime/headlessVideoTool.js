import { createModelRouter } from '../ModelRouter.js'
import {
  classifyFallbackError,
  executeWithModelFallback
} from './ModelFallbackExecutor.js'
import { createHeadlessVideoApiClient } from './headlessProviderClient.js'
import { appendRuntimeLog } from './runtimeLog.js'

const DEFAULT_CAPABILITY = 'image_to_video'
const VIDEO_TASK_PENDING_CODE = 'VIDEO_TASK_PENDING'
const VIDEO_RESULT_MISSING_CODE = 'PROVIDER_EMPTY_VIDEO_RESULT'
const VIDEO_TASK_FAILED_CODE = 'VIDEO_TASK_FAILED'

const VIDEO_URL_KEYS = new Set([
  'url',
  'video_url',
  'videoUrl',
  'output_url',
  'outputUrl',
  'file_url',
  'fileUrl',
  'download_url',
  'downloadUrl',
  'media_url',
  'mediaUrl',
  'play_url',
  'playUrl',
  'source_url',
  'sourceUrl'
])

const FAILED_STATES = new Set(['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected'])

let videoArtifactSequence = 0

function cleanString(value) {
  return String(value || '').trim()
}

function readValue(value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function modelDefault(route, key, fallback = '') {
  return route?.profile?.defaultParams?.[key] ?? route?.modelProfile?.defaultParams?.[key] ?? fallback
}

function candidateList(routing) {
  return Array.isArray(routing?.candidates) && routing.candidates.length
    ? routing.candidates
    : [routing]
}

function normalizeRatio(value = '16:9') {
  return cleanString(value || '16:9').replace('x', ':')
}

function normalizeDuration(value, fallback = 5) {
  const duration = Number(value || fallback)
  return Number.isFinite(duration) && duration > 0 ? duration : fallback
}

function normalizeResolution(value) {
  return cleanString(value).toLowerCase()
}

function unwrapArtifactRef(value) {
  if (value && typeof value === 'object') {
    value = value.artifactId || value.artifactRef || value.id || value.ref || ''
  }
  const ref = cleanString(value)
  return ref.startsWith('artifact:') ? ref.slice('artifact:'.length) : ref
}

function resolveSourceArtifactId(input = {}, runtime = {}) {
  const latest = runtime.state?.latestOutput?.('image')?.value
  const candidates = [
    input.imageArtifactId,
    input.sourceArtifactId,
    input.artifactId,
    input.artifactRef,
    input.source,
    latest?.artifactId,
    latest?.artifactRef
  ]
  return candidates.map(unwrapArtifactRef).find(Boolean) || ''
}

function resolveSourceArtifact(artifactStore, input, runtime) {
  const artifactId = resolveSourceArtifactId(input, runtime)
  if (!artifactId) throw new Error('generate_video 需要 imageArtifactId 或稳定的 artifactRef')
  if (/^(?:data:|blob:|file:|https?:\/\/)/i.test(artifactId)) {
    throw new Error('generate_video 不接受媒体 URL 作为输入，请传入 artifactStore 中的稳定引用')
  }
  const artifact = artifactStore.get?.(artifactId)
  if (!artifact) throw new Error(`generate_video 找不到图片 artifact: ${artifactId}`)
  if (artifact.kind !== 'image' && artifact.mediaType !== 'image') {
    throw new Error(`generate_video 的源 artifact 不是图片: ${artifactId}`)
  }
  if (artifact.status && artifact.status !== 'completed') {
    throw new Error(`generate_video 的源图片尚未完成: ${artifactId}`)
  }
  if (!cleanString(artifact.source)) {
    throw new Error(`generate_video 的源图片没有可执行媒体内容: ${artifactId}`)
  }
  return { artifactId, artifact }
}

function trimUrl(value) {
  return cleanString(value).replace(/[),.;\]\s]+$/g, '')
}

function looksLikeVideoUrl(value) {
  const url = cleanString(value)
  return /^data:video\//i.test(url) ||
    /\.(?:mp4|webm|mov|m4v|m3u8)(?:\?|#|$)/i.test(url) ||
    /\/(?:video|videos|media|files|download|outputs?)\//i.test(url)
}

export function extractHeadlessVideoUrls(value, seen = new WeakSet(), path = []) {
  if (!value) return []
  if (typeof value === 'string') {
    if (/^data:video\//i.test(value)) return [value]
    return [...value.matchAll(/https?:\/\/[^\s"'<>]+/gi)]
      .map((match) => trimUrl(match[0]))
      .filter(looksLikeVideoUrl)
  }
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item, index) =>
      extractHeadlessVideoUrls(item, seen, [...path, index])))]
  }
  if (typeof value !== 'object' || seen.has(value)) return []
  seen.add(value)

  const urls = []
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key]
    if (VIDEO_URL_KEYS.has(key) && typeof nested === 'string') {
      const direct = trimUrl(nested)
      const contextual = key !== 'url' || nextPath.some((part) =>
        /video|output|result|file|download|media|play/i.test(String(part)))
      if (looksLikeVideoUrl(direct) || (contextual && /^https?:\/\//i.test(direct))) urls.push(direct)
    }
    urls.push(...extractHeadlessVideoUrls(nested, seen, nextPath))
  }
  return [...new Set(urls)]
}

function findNestedValue(value, keys, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined
  seen.add(value)
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] != null) return value[key]
  }
  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    const found = findNestedValue(nested, keys, seen)
    if (found != null) return found
  }
  return undefined
}

export function getHeadlessVideoTaskId(value) {
  const taskId = value?.task_id ||
    value?.taskId ||
    value?.id ||
    value?.data?.task_id ||
    value?.data?.taskId ||
    value?.data?.id ||
    value?.data?.[0]?.task_id ||
    value?.data?.[0]?.taskId ||
    value?.data?.[0]?.id ||
    value?.task_info?.task_id ||
    value?.task_info?.id ||
    findNestedValue(value, ['task_id', 'taskId'])
  return cleanString(taskId)
}

export function getHeadlessVideoTaskState(value) {
  return cleanString(findNestedValue(value, ['status', 'state', 'task_status', 'taskStatus'])).toLowerCase()
}

function getFailureMessage(value, fallback = '视频生成失败') {
  const message = findNestedValue(value, ['error_message', 'errorMessage', 'reason', 'message'])
  return cleanString(message || value?.error?.message || fallback)
}

function providerBaseUrl(modelStore) {
  return cleanString(readValue(modelStore?.currentVideoBaseUrl) || readValue(modelStore?.currentBaseUrl))
    .replace(/\/+$/, '')
}

function inferProtocol(route) {
  const model = cleanString(route.model).toLowerCase()
  const family = cleanString(route.profile?.endpointFamily || route.modelProfile?.endpointFamily).toLowerCase()
  const value = `${family} ${model}`
  if (/veo/.test(value)) return 'veo'
  if (/kling/.test(value)) return 'kling'
  if (/seedance|doubao|dataeyes-video/.test(value)) return 'seedance'
  if (/sora|runway|luma|wan|hailuo|minimax|openai-video/.test(value)) return 'openai-video'
  return 'generic'
}

function openAIVideoSize(ratio, resolution) {
  const shortSide = normalizeResolution(resolution).includes('1080') ? 1080 : 720
  if (ratio === '9:16') return `${shortSide}x${Math.round(shortSide * 16 / 9)}`
  if (ratio === '1:1') return `${shortSide}x${shortSide}`
  if (ratio === '4:3') return `${Math.round(shortSide * 4 / 3)}x${shortSide}`
  if (ratio === '3:4') return `${shortSide}x${Math.round(shortSide * 4 / 3)}`
  return `${Math.round(shortSide * 16 / 9)}x${shortSide}`
}

function genericVideoPayload(input, route, prompt, imageSource) {
  const ratio = normalizeRatio(input.ratio || modelDefault(route, 'ratio', '16:9'))
  const duration = normalizeDuration(input.duration || input.dur, modelDefault(route, 'duration', 5))
  const resolution = normalizeResolution(input.resolution || modelDefault(route, 'resolution'))
  const payload = {
    model: route.model,
    prompt,
    first_frame_image: imageSource,
    size: ratio,
    seconds: duration
  }
  if (resolution) payload.resolution = resolution
  if (input.seed !== undefined && input.seed !== null && input.seed !== '') payload.seed = input.seed
  if (cleanString(input.negativePrompt || input.negative_prompt)) {
    payload.negative_prompt = cleanString(input.negativePrompt || input.negative_prompt)
  }
  if (cleanString(input.cameraMotion || input.camera_motion)) {
    payload.camera_motion = cleanString(input.cameraMotion || input.camera_motion)
  }
  return { payload, ratio, duration, resolution }
}

/** Mirrors the model-family normalization currently private in useApi.js. */
export function buildHeadlessVideoRequest(input, route, modelStore, prompt, imageSource) {
  const common = genericVideoPayload(input, route, prompt, imageSource)
  const protocol = inferProtocol(route)
  const baseUrl = providerBaseUrl(modelStore)
  const knownEndpoint = baseUrl ? `${baseUrl}/v1/videos` : null
  const knownTaskEndpoint = baseUrl ? `${baseUrl}/v1/videos/{taskId}` : null
  let payload

  if (protocol === 'veo') {
    payload = {
      model: route.model,
      prompt,
      seconds: String(common.duration),
      image: imageSource,
      first_frame_image: imageSource
    }
  } else if (protocol === 'seedance') {
    payload = {
      model: route.model,
      prompt,
      ratio: common.ratio,
      aspect_ratio: common.ratio,
      duration: common.duration,
      seconds: String(common.duration),
      image: imageSource,
      first_frame_image: imageSource,
      metadata: { ratio: common.ratio, watermark: false }
    }
    if (common.resolution) {
      payload.resolution = common.resolution
      payload.metadata.resolution = common.resolution
    }
    if (input.seed !== undefined && input.seed !== '') payload.metadata.seed = Number(input.seed)
    if (cleanString(input.cameraMotion || input.camera_motion)) {
      payload.metadata.camera_motion = cleanString(input.cameraMotion || input.camera_motion)
    }
  } else if (protocol === 'kling') {
    payload = {
      model: route.model,
      prompt,
      duration: common.duration,
      aspect_ratio: common.ratio,
      mode: 'std',
      cfg_scale: 0.5,
      image: imageSource
    }
    if (cleanString(input.negativePrompt || input.negative_prompt)) {
      payload.negative_prompt = cleanString(input.negativePrompt || input.negative_prompt)
    }
  } else if (protocol === 'openai-video') {
    payload = {
      model: route.model,
      prompt,
      seconds: String(common.duration),
      size: openAIVideoSize(common.ratio, common.resolution),
      image: imageSource
    }
  } else {
    payload = typeof modelStore?.adaptRequest === 'function'
      ? modelStore.adaptRequest('video', common.payload) || common.payload
      : common.payload
  }

  return {
    payload,
    protocol,
    endpoint: protocol !== 'generic' && knownEndpoint
      ? knownEndpoint
      : modelStore?.getVideoEndpoint?.() || '/v1/videos',
    taskEndpoint: protocol !== 'generic' && knownTaskEndpoint
      ? knownTaskEndpoint
      : modelStore?.getVideoTaskEndpoint?.() || '/v1/videos/{taskId}',
    ratio: common.ratio,
    duration: common.duration,
    resolution: common.resolution
  }
}

function abortError(reason) {
  const error = reason instanceof Error ? reason : new Error(cleanString(reason) || 'Agent 任务已取消')
  error.name = 'AbortError'
  error.code = 'ABORT_ERR'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal.reason)
}

function withAbort(promise, signal) {
  if (!signal) return Promise.resolve(promise)
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal.reason))
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

function abortableDelay(ms, signal) {
  if (!(ms > 0)) {
    throwIfAborted(signal)
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, ms)
    const onAbort = () => finish(abortError(signal.reason))
    function finish(error) {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }
    if (signal?.aborted) onAbort()
    else signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

function adaptVideoResponse(modelStore, response) {
  if (typeof modelStore?.adaptResponse !== 'function') return response
  try {
    return modelStore.adaptResponse('video', response) || response
  } catch {
    return response
  }
}

function taskEndpointFor(template, taskId) {
  const endpoint = cleanString(template || '/v1/videos/{taskId}')
  if (endpoint.includes('{taskId}')) return endpoint.replace('{taskId}', encodeURIComponent(taskId))
  if (endpoint.endsWith(`/${taskId}`)) return endpoint
  return `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`
}

function pendingTaskError(taskId, message, cause) {
  const detail = message || '供应商后台仍在执行，已停止切换模型以避免重复计费'
  const error = new Error(`视频任务 ${taskId}: ${detail}`)
  error.name = 'VideoTaskPendingError'
  error.code = VIDEO_TASK_PENDING_CODE
  error.retryable = false
  error.backgroundPending = true
  error.taskId = taskId
  if (cause) error.cause = cause
  return error
}

async function pollVideoTask({
  apiClient,
  modelStore,
  taskId,
  taskEndpoint,
  signal,
  pollIntervalMs,
  maxPollAttempts,
  maxTransientPollErrors
}) {
  let transientErrors = 0
  let lastResponse = null

  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    throwIfAborted(signal)
    let response
    try {
      response = await withAbort(apiClient.getVideoTaskStatus(taskId, {
        endpoint: taskEndpointFor(taskEndpoint, taskId),
        signal
      }), signal)
      transientErrors = 0
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      const classification = classifyFallbackError(error)
      if (classification.retryable && transientErrors < maxTransientPollErrors) {
        transientErrors += 1
        await abortableDelay(pollIntervalMs, signal)
        continue
      }
      if (classification.retryable) {
        throw pendingTaskError(taskId, '视频任务已创建，但轮询服务持续异常；已停止创建备用任务', error)
      }
      // Once taskId exists, any non-cancellation failure is still tied to a
      // Provider-accepted task. Preserve that fact so the UI cannot offer an
      // unsafe one-click resubmission.
      error.acceptedByProvider = true
      error.taskId = taskId
      throw error
    }

    lastResponse = response
    const adapted = adaptVideoResponse(modelStore, response)
    const url = extractHeadlessVideoUrls(adapted)[0] || extractHeadlessVideoUrls(response)[0]
    if (url) return { source: url, taskId, pollAttempts: attempt, response }

    const state = getHeadlessVideoTaskState(adapted) || getHeadlessVideoTaskState(response)
    if (FAILED_STATES.has(state)) {
      const message = getFailureMessage(adapted, '') || getFailureMessage(response)
      const error = new Error(message)
      error.code = VIDEO_TASK_FAILED_CODE
      // A task ID proves the Provider accepted this generation. Even a terminal
      // failure may already be billable, so never create a second task here.
      error.retryable = false
      error.acceptedByProvider = true
      error.taskId = taskId
      throw error
    }

    if (attempt < maxPollAttempts) await abortableDelay(pollIntervalMs, signal)
  }

  throw pendingTaskError(
    taskId,
    `视频任务已创建，但在 ${maxPollAttempts} 次轮询内尚未返回媒体；已停止切换模型`,
    lastResponse
  )
}

async function executeCandidate({
  apiClient,
  modelStore,
  route,
  input,
  prompt,
  imageSource,
  signal,
  pollIntervalMs,
  maxPollAttempts,
  maxTransientPollErrors
}) {
  const request = buildHeadlessVideoRequest(input, route, modelStore, prompt, imageSource)
  throwIfAborted(signal)
  const task = await withAbort(apiClient.createVideoTask(request.payload, {
    endpoint: request.endpoint,
    requestType: 'json',
    signal
  }), signal)
  const adaptedTask = adaptVideoResponse(modelStore, task)
  const directUrl = extractHeadlessVideoUrls(adaptedTask)[0] || extractHeadlessVideoUrls(task)[0]
  if (directUrl) {
    return { source: directUrl, taskId: null, pollAttempts: 0, request, route }
  }

  const taskId = getHeadlessVideoTaskId(task) || getHeadlessVideoTaskId(adaptedTask)
  if (!taskId) {
    const error = new Error(`模型 ${route.model} 已返回成功响应，但没有可识别的视频地址或任务 ID；已停止切换模型以避免重复生成和重复计费`)
    error.code = VIDEO_RESULT_MISSING_CODE
    error.status = 200
    error.retryable = false
    error.acceptedByProvider = true
    throw error
  }

  const completed = await pollVideoTask({
    apiClient,
    modelStore,
    taskId,
    taskEndpoint: request.taskEndpoint,
    signal,
    pollIntervalMs,
    maxPollAttempts,
    maxTransientPollErrors
  })
  return { ...completed, request, route }
}

function defaultVideoArtifactId() {
  videoArtifactSequence += 1
  const random = globalThis.crypto?.randomUUID?.()
  return random ? `video_${random}` : `video_${Date.now()}_${videoArtifactSequence}`
}

function putArtifact(store, record) {
  if (typeof store?.put === 'function') return store.put(record)
  if (typeof store?.set === 'function') {
    const id = defaultVideoArtifactId()
    store.set(id, { ...record, id })
    return id
  }
  throw new TypeError('Headless generate_video 需要共享 artifactStore.put(record)')
}

function logAttempt(runtimeLogs, summary) {
  appendRuntimeLog(runtimeLogs, summary.status === 'succeeded' ? 'success' : 'warning',
    `Headless 视频模型尝试 #${summary.attempt} ${summary.status === 'succeeded' ? '完成' : '失败'}`, {
      attempt: summary.attempt,
      model: summary.candidate?.model || summary.candidate?.key || '',
      status: summary.status,
      retryable: summary.retryable,
      category: summary.error?.category,
      durationMs: summary.durationMs
    })
}

/** ToolRegistry-compatible headless generate_video. */
export function createHeadlessGenerateVideoTool({
  modelStore,
  modelRouter = modelStore ? createModelRouter(modelStore) : null,
  apiClient,
  fetchImpl,
  artifactStore,
  runtimeLogs,
  pollIntervalMs = 5_000,
  maxPollAttempts = 72,
  maxTransientPollErrors = 3,
  attemptTimeoutMs = 0
} = {}) {
  if (!modelStore) throw new Error('Headless generate_video 需要 modelStore')
  if (!modelRouter?.route) throw new Error('Headless generate_video 需要 modelRouter')
  if (!artifactStore?.get || (!artifactStore?.put && !artifactStore?.set)) {
    throw new Error('Headless generate_video 需要与图片工具共享的 artifactStore')
  }

  const execute = async (input = {}, runtime = {}) => {
    const { artifactId: sourceArtifactId, artifact: sourceArtifact } = resolveSourceArtifact(
      artifactStore,
      input,
      runtime
    )
    const prompt = cleanString(input.prompt || input.goal || runtime.state?.goal) ||
      '根据参考图片生成一段自然流畅的视频，保持主体一致，镜头运动自然，画面稳定。'
    const routingOptions = {
      ...input,
      goal: input.goal || runtime.state?.goal || prompt,
      prompt,
      referenceImage: true
    }
    if (input.duration || input.dur) routingOptions.duration = input.duration || input.dur
    const routing = modelRouter.route(DEFAULT_CAPABILITY, routingOptions)
    const candidates = candidateList(routing)
    const client = apiClient || createHeadlessVideoApiClient({ modelStore, fetchImpl })

    appendRuntimeLog(runtimeLogs, 'info', '开始 Headless 图生视频', {
      sourceArtifactId,
      capability: routing.capability,
      candidateCount: candidates.length,
      selectedModel: routing.model,
      policy: routing.policy
    })

    const outcome = await executeWithModelFallback(candidates, (route, attemptContext) =>
      executeCandidate({
        apiClient: client,
        modelStore,
        route,
        input,
        prompt,
        imageSource: sourceArtifact.source,
        signal: attemptContext.signal,
        pollIntervalMs,
        maxPollAttempts,
        maxTransientPollErrors
      }), {
      signal: runtime.signal,
      timeoutMs: attemptTimeoutMs,
      onAttempt: summary => logAttempt(runtimeLogs, summary)
    })

    const artifactId = putArtifact(artifactStore, {
      kind: 'video',
      mediaType: 'video',
      status: 'completed',
      source: outcome.result.source,
      sourceArtifactId,
      prompt,
      model: outcome.result.route.model,
      provider: outcome.result.route.provider || cleanString(readValue(modelStore.currentProvider)),
      protocol: outcome.result.request.protocol,
      taskId: outcome.result.taskId,
      pollAttempts: outcome.result.pollAttempts,
      ratio: outcome.result.request.ratio,
      duration: outcome.result.request.duration,
      resolution: outcome.result.request.resolution,
      createdAt: Date.now()
    })

    appendRuntimeLog(runtimeLogs, 'success', 'Headless 视频生成完成', {
      artifactId,
      sourceArtifactId,
      model: outcome.result.route.model,
      attempts: outcome.attempts.length,
      pollAttempts: outcome.result.pollAttempts
    })

    return {
      status: 'completed',
      mediaType: 'video',
      artifactId,
      artifactRef: `artifact:${artifactId}`,
      sourceArtifactId,
      model: outcome.result.route.model,
      provider: outcome.result.route.provider || cleanString(readValue(modelStore.currentProvider)),
      protocol: outcome.result.request.protocol,
      taskId: outcome.result.taskId,
      pollAttempts: outcome.result.pollAttempts,
      fallbackAttempts: outcome.attempts.length
    }
  }

  return {
    metadata: {
      description: '从共享图片 artifact 直连 Provider 生成视频，不依赖 Canvas 节点挂载',
      capability: DEFAULT_CAPABILITY,
      runtime: 'headless',
      output: 'artifact_reference'
    },
    execute,
    artifactStore,
    resolveArtifact: artifactId => artifactStore.get?.(artifactId) || null
  }
}

export {
  DEFAULT_CAPABILITY,
  VIDEO_RESULT_MISSING_CODE,
  VIDEO_TASK_FAILED_CODE,
  VIDEO_TASK_PENDING_CODE,
  resolveSourceArtifactId,
  taskEndpointFor
}

export default createHeadlessGenerateVideoTool
