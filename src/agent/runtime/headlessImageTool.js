import { createModelRouter } from '../ModelRouter.js'
import { executeWithModelFallback } from './ModelFallbackExecutor.js'
import { createHeadlessImageApiClient } from './headlessProviderClient.js'
import { appendRuntimeLog } from './runtimeLog.js'

const DEFAULT_CAPABILITY = 'text_to_image'
const BACKGROUND_PENDING_CODE = 'BACKGROUND_REQUEST_PENDING'
const IMAGE_RESULT_MISSING_CODE = 'PROVIDER_EMPTY_IMAGE_RESULT'
const MEDIA_URL_PATTERN = /^(?:data:image\/|blob:|https?:\/\/)/i

let artifactSequence = 0

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

function normalizeProtocol(value, model = '') {
  const protocol = cleanString(value).toLowerCase()
  if (protocol === 'chat' || protocol === 'image') return protocol
  return /gemini/i.test(model) && /image/i.test(model) ? 'chat' : 'image'
}

function resolveProtocol(modelStore, route) {
  const configured = modelStore?.getImageModelProtocol?.(route.model)
  return normalizeProtocol(
    configured || route.profile?.resolvedProtocol || route.profile?.protocol,
    route.model
  )
}

function taskSafeModelName(model) {
  return cleanString(model).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'image'
}

function createTaskId(route, attempt) {
  return `agent_img_${taskSafeModelName(route.model)}_${Date.now()}_${attempt}`
}

function addImageRecord(records, seenUrls, url, revisedPrompt = '') {
  const normalized = cleanString(url)
  if (!normalized || seenUrls.has(normalized)) return
  seenUrls.add(normalized)
  records.push({ url: normalized, revisedPrompt: cleanString(revisedPrompt) })
}

function extractUrlsFromText(text, records, seenUrls) {
  const value = cleanString(text)
  if (!value) return
  if (MEDIA_URL_PATTERN.test(value)) addImageRecord(records, seenUrls, value)

  for (const match of value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
    addImageRecord(records, seenUrls, match[1])
  }
  for (const match of value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    addImageRecord(records, seenUrls, match[1])
  }
  for (const match of value.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g)) {
    addImageRecord(records, seenUrls, match[0])
  }
}

export function normalizeHeadlessImageResponse(response) {
  const records = []
  const seenUrls = new Set()
  const seenObjects = new WeakSet()

  const visit = (value) => {
    if (!value) return
    if (typeof value === 'string') {
      extractUrlsFromText(value, records, seenUrls)
      return
    }
    if (typeof value !== 'object') return
    if (seenObjects.has(value)) return
    seenObjects.add(value)

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (value.b64_json) {
      addImageRecord(records, seenUrls, `data:image/png;base64,${value.b64_json}`, value.revised_prompt)
    }
    if (typeof value.url === 'string') {
      addImageRecord(records, seenUrls, value.url, value.revised_prompt || value.revisedPrompt)
    }
    if (typeof value.image_url?.url === 'string') {
      addImageRecord(records, seenUrls, value.image_url.url, value.revised_prompt || value.revisedPrompt)
    }

    for (const key of ['data', 'images', 'output', 'content', 'choices', 'message', 'text']) {
      if (value[key] !== undefined) visit(value[key])
    }
  }

  visit(response)
  return records
}

function adaptImageResponse(modelStore, response) {
  let adapted = response
  if (typeof modelStore?.adaptResponse === 'function') {
    try {
      adapted = modelStore.adaptResponse('image', response)
    } catch {
      adapted = response
    }
  }
  const normalized = normalizeHeadlessImageResponse(adapted)
  return normalized.length ? normalized : normalizeHeadlessImageResponse(response)
}

function buildRequest(input, route, prompt) {
  const payload = {
    model: route.model,
    prompt,
    size: cleanString(input.size || modelDefault(route, 'size', '1024x1024'))
  }
  const count = Number(input.n || input.count || 1)
  if (Number.isFinite(count) && count > 1) payload.n = Math.floor(count)

  // Quality is intentionally opt-in here. The existing mounted composable has
  // private model-family logic that removes unsupported quality values.
  if (cleanString(input.quality)) payload.quality = cleanString(input.quality)
  if (cleanString(input.style)) payload.style = cleanString(input.style)
  if (input.seed !== undefined && input.seed !== null && input.seed !== '') payload.seed = input.seed
  if (cleanString(input.negativePrompt || input.negative_prompt)) {
    payload.negative_prompt = cleanString(input.negativePrompt || input.negative_prompt)
  }
  return payload
}

function adaptImageRequest(modelStore, payload) {
  if (typeof modelStore?.adaptRequest !== 'function') return payload
  return modelStore.adaptRequest('image', payload) || payload
}

function imageEndpoint(modelStore) {
  return modelStore?.getImageEndpoint?.() || '/v1/images/generations'
}

function chatEndpoint(modelStore) {
  return modelStore?.getChatEndpoint?.() || '/v1/chat/completions'
}

function isImageEndpointUnsupported(error) {
  const message = [
    error?.message,
    error?.code,
    error?.response?.data?.message,
    error?.response?.data?.error?.message,
    typeof error?.response?.data === 'string' ? error.response.data : ''
  ].filter(Boolean).join(' ').toLowerCase()
  return /not supported model|unsupported model|not support|image generation/.test(message)
}

function backgroundPendingError(error) {
  if (!error?._frontendTimeout && error?.code !== BACKGROUND_PENDING_CODE) return error
  const pending = new Error('供应商请求仍在后台运行，已停止切换模型以避免重复生成和重复计费')
  pending.name = 'BackgroundRequestPendingError'
  pending.code = BACKGROUND_PENDING_CODE
  pending.retryable = false
  pending.backgroundPending = true
  pending.cause = error
  return pending
}

async function requestViaChat(apiClient, modelStore, route, payload, taskId, signal) {
  if (typeof apiClient.generateImageWithChat !== 'function') {
    const error = new Error('Headless 图片工具缺少 Chat 图片协议客户端')
    error.code = 'CHAT_IMAGE_CLIENT_UNAVAILABLE'
    throw error
  }

  const sizeHint = payload.size ? `\n\nTarget image size/aspect ratio: ${payload.size}.` : ''
  const response = await apiClient.generateImageWithChat({
    model: route.model,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: `${payload.prompt}${sizeHint}` }]
    }]
  }, {
    endpoint: chatEndpoint(modelStore),
    _taskId: taskId,
    signal
  })
  return normalizeHeadlessImageResponse(response)
}

async function requestViaImage(apiClient, modelStore, payload, taskId, signal) {
  if (typeof apiClient.generateImage !== 'function') {
    const error = new Error('Headless 图片工具缺少图片生成客户端')
    error.code = 'IMAGE_CLIENT_UNAVAILABLE'
    throw error
  }
  const adapted = adaptImageRequest(modelStore, payload)
  const response = await apiClient.generateImage(adapted, {
    endpoint: imageEndpoint(modelStore),
    _taskId: taskId,
    signal
  })
  return adaptImageResponse(modelStore, response)
}

async function executeCandidate({ apiClient, modelStore, route, input, prompt, attempt, signal }) {
  const payload = buildRequest(input, route, prompt)
  const taskId = createTaskId(route, attempt)
  let protocol = resolveProtocol(modelStore, route)
  let records

  try {
    records = protocol === 'chat'
      ? await requestViaChat(apiClient, modelStore, route, payload, taskId, signal)
      : await requestViaImage(apiClient, modelStore, payload, taskId, signal)
  } catch (originalError) {
    const error = backgroundPendingError(originalError)
    if (error !== originalError || protocol === 'chat' || !isImageEndpointUnsupported(error)) throw error

    // Preserve the mounted ImageConfig behavior for image models exposed only
    // through an OpenAI-compatible chat endpoint.
    protocol = 'chat'
    try {
      records = await requestViaChat(apiClient, modelStore, route, payload, taskId, signal)
    } catch (chatError) {
      throw backgroundPendingError(chatError)
    }
  }

  if (!records.length) {
    const error = new Error(`模型 ${route.model} 已返回成功响应，但其中没有可识别图片；已停止切换模型以避免重复生成和重复计费`)
    error.code = IMAGE_RESULT_MISSING_CODE
    error.status = 200
    error.retryable = false
    error.acceptedByProvider = true
    throw error
  }

  return { route, records, protocol, taskId, payload }
}

function defaultArtifactId(record = {}) {
  artifactSequence += 1
  const random = globalThis.crypto?.randomUUID?.()
  const prefix = record?.kind === 'video' || record?.mediaType === 'video' ? 'video' : 'image'
  return random ? `${prefix}_${random}` : `${prefix}_${Date.now()}_${artifactSequence}`
}

export function createHeadlessImageArtifactStore({ idFactory = defaultArtifactId } = {}) {
  const records = new Map()
  return {
    put(record) {
      const id = cleanString(idFactory(record)) || defaultArtifactId(record)
      records.set(id, Object.freeze({ ...record, id }))
      return id
    },
    get(id) {
      return records.get(id) || null
    },
    has(id) {
      return records.has(id)
    },
    delete(id) {
      return records.delete(id)
    },
    clear() {
      records.clear()
    },
    list() {
      return [...records.values()]
    },
    get size() {
      return records.size
    }
  }
}

function putArtifact(store, record) {
  if (typeof store?.put === 'function') return store.put(record)
  if (typeof store?.set === 'function') {
    const id = defaultArtifactId()
    store.set(id, { ...record, id })
    return id
  }
  throw new TypeError('headless generate_image 需要支持 put(record) 或 set(id, record) 的 artifactStore')
}

function logAttempt(runtimeLogs, summary) {
  appendRuntimeLog(runtimeLogs, summary.status === 'succeeded' ? 'success' : 'warning',
    `Headless 图片模型尝试 #${summary.attempt} ${summary.status === 'succeeded' ? '完成' : '失败'}`, {
      attempt: summary.attempt,
      model: summary.candidate?.model || summary.candidate?.key || '',
      status: summary.status,
      retryable: summary.retryable,
      category: summary.error?.category,
      durationMs: summary.durationMs
    })
}

/**
 * ToolRegistry-compatible generate_image that executes Provider requests
 * directly. It never creates or waits for Canvas/Vue nodes.
 */
export function createHeadlessGenerateImageTool({
  modelStore,
  modelRouter = modelStore ? createModelRouter(modelStore) : null,
  apiClient,
  fetchImpl,
  artifactStore = createHeadlessImageArtifactStore(),
  runtimeLogs,
  attemptTimeoutMs = 0
} = {}) {
  if (!modelStore) throw new Error('Headless generate_image 需要 modelStore')
  if (!modelRouter?.route) throw new Error('Headless generate_image 需要 modelRouter')

  const execute = async (input = {}, runtime = {}) => {
    const goal = cleanString(input.goal || runtime.state?.goal || input.prompt)
    const prompt = cleanString(input.prompt || goal)
    if (!prompt) throw new Error('generate_image 需要图片提示词')

    const routing = modelRouter.route(DEFAULT_CAPABILITY, {
      ...input,
      goal,
      prompt
    })
    const client = apiClient || createHeadlessImageApiClient({ modelStore, fetchImpl })
    const candidates = candidateList(routing)

    appendRuntimeLog(runtimeLogs, 'info', '开始 Headless 图片生成', {
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
        attempt: attemptContext.attempt,
        signal: attemptContext.signal
      }), {
      signal: runtime.signal,
      timeoutMs: attemptTimeoutMs,
      onAttempt: summary => logAttempt(runtimeLogs, summary)
    })

    const artifactIds = outcome.result.records.map((media, index) => putArtifact(artifactStore, {
      kind: 'image',
      mediaType: 'image',
      status: 'completed',
      source: media.url,
      revisedPrompt: media.revisedPrompt,
      prompt,
      model: outcome.result.route.model,
      provider: outcome.result.route.provider || cleanString(readValue(modelStore.currentProvider)),
      protocol: outcome.result.protocol,
      taskId: outcome.result.taskId,
      outputIndex: index,
      createdAt: Date.now()
    }))
    const artifactId = artifactIds[0]

    appendRuntimeLog(runtimeLogs, 'success', 'Headless 图片生成完成', {
      artifactId,
      count: artifactIds.length,
      model: outcome.result.route.model,
      attempts: outcome.attempts.length
    })

    // Provider URLs and base64 stay in artifactStore. The Agent receives only
    // stable references and compact execution metadata.
    return {
      status: 'completed',
      mediaType: 'image',
      artifactId,
      artifactRef: `artifact:${artifactId}`,
      artifactIds,
      count: artifactIds.length,
      model: outcome.result.route.model,
      provider: outcome.result.route.provider || cleanString(readValue(modelStore.currentProvider)),
      protocol: outcome.result.protocol,
      fallbackAttempts: outcome.attempts.length
    }
  }

  return {
    metadata: {
      description: '不依赖 Canvas 节点挂载，直接按能力路由并调用 Provider 生成图片',
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
  BACKGROUND_PENDING_CODE,
  IMAGE_RESULT_MISSING_CODE,
  buildRequest,
  resolveProtocol
}

export default createHeadlessGenerateImageTool
