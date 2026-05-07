/**
 * API Hooks | API Hooks
 * Simplified hooks for open source version | 开源版简化 hooks
 */

import { ref, reactive, onUnmounted } from 'vue'
import {
  generateImage,
  generateImageWithChat,
  buildImageEditFormData,
  createVideoTask,
  getVideoTaskStatus,
  streamChatCompletions
} from '@/api'
import { getModelByName } from '@/config/models'
import { useApiConfig } from './useApiConfig'
import { useProvider } from './useProvider'
import { useModelStore } from '@/stores/pinia'
import { getCapabilityLabel, getModelCapabilityConflict } from '@/utils/modelCapability'
import { addRuntimeLog } from '@/stores/canvas'
import { showBubble } from '@/utils/bubble'
import { getChineseApiError } from '@/utils/chineseApiError'

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
const elapsedMs = (startedAt) => Math.max(0, Math.round(nowMs() - startedAt))

const isGeminiImageModel = (model = '') =>
  /gemini/i.test(model) && /image/i.test(model)

const isImageEndpointUnsupportedError = (error) => {
  const message = [
    error?.message,
    error?.error?.message,
    error?.error?.code,
    error?.code,
    error?.response?.data?.message,
    error?.response?.data?.error?.message,
    error?.response?.data?.error?.code,
    typeof error?.response?.data === 'string' ? error.response.data : ''
  ].filter(Boolean).join(' ').toLowerCase()

  return /not supported model|unsupported model|not support|image generation/.test(message)
}

const getApiErrorText = (error) => [
  error?.message,
  error?.error?.message,
  error?.error?.code,
  error?.code,
  error?.details,
  error?.response?.data?.message,
  error?.response?.data?.error?.message,
  error?.response?.data?.error?.code,
  typeof error?.response?.data === 'string' ? error.response.data : ''
].filter(Boolean).join(' ')

const getApiErrorStatus = (error) => error?.response?.status || error?.status || error?.error?.status || error?.code || ''

const IMAGE_PROFESSIONAL_PARAM_KEYS = [
  'steps',
  'cfg_scale',
  'sampler',
  'scheduler',
  'denoising_strength',
  'seed',
  'negative_prompt'
]

const hasImageProfessionalParams = (payload = {}) =>
  IMAGE_PROFESSIONAL_PARAM_KEYS.some((key) => payload[key] !== undefined && payload[key] !== null && payload[key] !== '')

const stripImageProfessionalParams = (payload = {}) => {
  const next = { ...payload }
  IMAGE_PROFESSIONAL_PARAM_KEYS.forEach((key) => {
    delete next[key]
  })
  return next
}

const isRecoverableImageParamError = (error) => {
  const message = getApiErrorText(error).toLowerCase()
  return /quality|不合法的quality|size|resolution|不合法的size|尺寸|像素|pixels|count|数量|num| n |unsupported|not support|unknown parameter|unrecognized|invalid.*(steps|cfg|sampler|scheduler|denois|seed|negative)|steps|cfg_scale|sampler|scheduler|denoising_strength|negative_prompt/.test(message)
}

const getFriendlyImageErrorMessage = (error) => {
  const status = getApiErrorStatus(error)
  const message = getApiErrorText(error).toLowerCase()

  if (status === 401 || status === 403 || /permission|forbidden|unauthorized|无权限|权限|余额|quota|credit/.test(message)) {
    return '模型供应商拒绝了请求，通常是 API Key 没权限、额度不足，或当前 Key 不支持这个模型。'
  }

  if (/quality|不合法的quality/.test(message)) {
    return '当前模型不支持所选画质参数，已尝试自动移除画质参数。'
  }

  if (/size|resolution|不合法的size|尺寸|像素|pixels/.test(message)) {
    return '当前模型不支持所选尺寸，已尝试自动切换到模型支持的尺寸。'
  }

  if (/not supported model|unsupported model|not support|image generation/.test(message)) {
    return '当前模型不支持图片生成接口，已尝试自动切换到 Chat 图片通道。'
  }

  if (status >= 500 || /server|upstream|timeout|超时/.test(message)) {
    return '模型供应商返回服务异常，可能是上游模型临时失败或参数未被该厂商兼容。'
  }

  return error?.message || '图片生成失败，请打开运行日志查看请求详情。'
}

const getMinimumPixelsFromError = (error) => {
  const message = getApiErrorText(error)
  const match = message.match(/at least\s+(\d+)\s+pixels/i)
  return match ? Number(match[1]) : 0
}

const getImageSizePixels = (size = '') => {
  const match = String(size || '').match(/^(\d+)\s*x\s*(\d+)$/i)
  if (!match) return 0
  return Number(match[1]) * Number(match[2])
}

const isGptImageFamily = (model = '') =>
  /(^|[-_])gpt-image|chatgpt-image/i.test(model)

const isSeedreamFamily = (model = '') =>
  /seedream/i.test(model)

const getSafeImageSize = ({ requestedSize, modelKey, imageModel, modelConfig }) => {
  const availableSizes = [
    ...(Array.isArray(imageModel?.sizes) ? imageModel.sizes : []),
    ...(Array.isArray(modelConfig?.sizes) ? modelConfig.sizes : [])
  ].filter(Boolean)

  const defaultSize = imageModel?.defaultParams?.size || modelConfig?.defaultParams?.size || availableSizes[0]

  if (isSeedreamFamily(modelKey)) {
    const minPixels = 3686400
    const isValidSeedreamSize = (size) => getImageSizePixels(size) >= minPixels

    if (requestedSize && isValidSeedreamSize(requestedSize)) {
      return requestedSize
    }

    if (defaultSize && isValidSeedreamSize(defaultSize)) {
      return defaultSize
    }

    return availableSizes.find(isValidSeedreamSize) || '2048x2048'
  }

  if (isGptImageFamily(modelKey) && availableSizes.length > 0) {
    return availableSizes.includes(requestedSize)
      ? requestedSize
      : defaultSize || availableSizes[0] || '1024x1024'
  }

  return requestedSize || defaultSize || '1024x1024'
}

const getImageSizeCandidates = ({ modelKey, imageModel, modelConfig, minPixels = 0 }) => {
  const candidates = [
    ...(Array.isArray(imageModel?.sizes) ? imageModel.sizes : []),
    ...(Array.isArray(modelConfig?.sizes) ? modelConfig.sizes : []),
    imageModel?.defaultParams?.size,
    modelConfig?.defaultParams?.size,
    ...(isSeedreamFamily(modelKey) ? ['2048x2048', '2560x1440', '1440x2560'] : []),
    ...(isGptImageFamily(modelKey) ? ['1024x1024', '1536x1024', '1024x1536'] : []),
    '1024x1024'
  ].filter(Boolean)

  return [...new Set(candidates)]
    .filter((size) => !minPixels || getImageSizePixels(size) >= minPixels)
}

const shouldSendImageQuality = ({ quality, modelKey, imageModel, modelConfig }) => {
  if (!quality) return false
  if (isGptImageFamily(modelKey)) return false

  const qualityOptions = imageModel?.qualities || modelConfig?.qualities
  if (!Array.isArray(qualityOptions) || qualityOptions.length === 0) {
    return false
  }

  return qualityOptions.some((option) => option?.key === quality || option === quality)
}

const normalizeImageGenerationParams = (params, imageModel, modelConfig) => {
  const modelKey = params.model
  const size = getSafeImageSize({
    requestedSize: params.size,
    modelKey,
    imageModel,
    modelConfig
  })

  const requestData = {
    model: modelKey,
    prompt: params.prompt,
    size
  }

  if (params.n && Number(params.n) > 1) {
    requestData.n = Number(params.n)
  }

  if (shouldSendImageQuality({ quality: params.quality, modelKey, imageModel, modelConfig })) {
    requestData.quality = params.quality
  }

  if (params.image) {
    requestData.image = params.image
  }

  // Cloud workflow professional params — pass through when present
  if (params.steps != null) requestData.steps = Number(params.steps)
  if (params.cfg_scale != null) requestData.cfg_scale = Number(params.cfg_scale)
  if (params.sampler) requestData.sampler = params.sampler
  if (params.scheduler) requestData.scheduler = params.scheduler
  if (params.denoising_strength != null) requestData.denoising_strength = Number(params.denoising_strength)
  if (params.seed != null) requestData.seed = Number(params.seed)
  if (params.negative_prompt) requestData.negative_prompt = params.negative_prompt

  return requestData
}

const extractImageUrlsFromChatContent = (content) => {
  const urls = []

  const visit = (value) => {
    if (!value) return

    if (typeof value === 'string') {
      const markdownMatches = [...value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)]
      markdownMatches.forEach((match) => urls.push(match[1]))

      const htmlMatches = [...value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
      htmlMatches.forEach((match) => urls.push(match[1]))

      const dataMatches = [...value.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g)]
      dataMatches.forEach((match) => urls.push(match[0]))

      const urlMatches = [...value.matchAll(/https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)"']*)?/gi)]
      urlMatches.forEach((match) => urls.push(match[0]))
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value === 'object') {
      if (value.image_url?.url) urls.push(value.image_url.url)
      if (value.url) urls.push(value.url)
      if (value.b64_json) urls.push(`data:image/png;base64,${value.b64_json}`)
      if (value.text) visit(value.text)
      if (value.content) visit(value.content)
    }
  }

  visit(content)
  return [...new Set(urls)]
}

const normalizeGeminiImageResponse = (response) => {
  const candidates = [
    response?.choices?.[0]?.message?.content,
    response?.choices?.[0]?.delta?.content,
    response?.data,
    response?.content,
    response
  ]

  const urls = candidates.flatMap(extractImageUrlsFromChatContent)
  return urls.map((url) => ({ url, revisedPrompt: '' }))
}

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

const COMPLETED_VIDEO_STATES = new Set(['completed', 'complete', 'succeeded', 'success', 'done', 'finished'])
const FAILED_VIDEO_STATES = new Set(['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected'])
const PENDING_VIDEO_STATES = new Set(['pending', 'queued', 'queueing', 'running', 'processing', 'in_progress', 'created', 'submitted'])

const trimUrl = (url) => url.replace(/[),.;\]\s]+$/g, '')

const looksLikeVideoUrl = (url) =>
  /^data:video\//i.test(url) ||
  /\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(url) ||
  /\/(video|videos|media|files|download|outputs?)\//i.test(url)

const extractUrlsFromString = (value) => {
  if (!value) return []
  if (/^data:video\//i.test(value)) return [value]

  return [...String(value).matchAll(/https?:\/\/[^\s"'<>]+/gi)]
    .map((match) => trimUrl(match[0]))
    .filter(looksLikeVideoUrl)
}

const hasVideoUrlContext = (path) =>
  path.some((key) => /video|output|result|file|download|media|play/i.test(String(key)))

const extractVideoUrls = (value, seen = new WeakSet(), path = []) => {
  if (!value) return []

  if (typeof value === 'string') {
    return extractUrlsFromString(value)
  }

  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item, index) => extractVideoUrls(item, seen, [...path, index])))]
  }

  if (typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const urls = []
  Object.entries(value).forEach(([key, nestedValue]) => {
    const nextPath = [...path, key]
    if (VIDEO_URL_KEYS.has(key) && typeof nestedValue === 'string') {
      const directUrl = trimUrl(nestedValue)
      const isSpecificVideoKey = key !== 'url'
      if (looksLikeVideoUrl(directUrl) || (isSpecificVideoKey && /^https?:\/\//i.test(directUrl)) || hasVideoUrlContext(nextPath)) {
        urls.push(directUrl)
      }
    }

    urls.push(...extractVideoUrls(nestedValue, seen, nextPath))
  })

  return [...new Set(urls)]
}

const findNestedValueByKeys = (value, keys, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object') return undefined
  if (seen.has(value)) return undefined
  seen.add(value)

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined && value[key] !== null) {
      return value[key]
    }
  }

  const entries = Array.isArray(value) ? value.entries() : Object.entries(value)
  for (const [, nestedValue] of entries) {
    const found = findNestedValueByKeys(nestedValue, keys, seen)
    if (found !== undefined && found !== null) return found
  }

  return undefined
}

const getVideoTaskState = (response) => {
  const value = findNestedValueByKeys(response, ['status', 'state', 'task_status', 'taskStatus'])
  return value === undefined || value === null ? '' : String(value).toLowerCase()
}

const getVideoTaskFailureMessage = (response) => {
  const value = findNestedValueByKeys(response, ['message', 'error_message', 'errorMessage', 'reason'])
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (response?.error?.message) return response.error.message
  return '视频生成失败'
}

const summarizeVideoTaskResponse = (response) => {
  try {
    return JSON.parse(JSON.stringify(response, (key, value) => {
      if (typeof value === 'string' && value.length > 1200) {
        return `${value.slice(0, 1200)}...`
      }
      return value
    }))
  } catch {
    return { rawType: typeof response }
  }
}

/**
 * Base API state hook | 基础 API 状态 Hook
 */
const normalizeVideoRatio = (ratio = '16:9') =>
  String(ratio || '16:9').replace('x', ':')

const normalizeVideoDuration = (duration, fallback = 5) => {
  const numericDuration = Number(duration || fallback)
  return Number.isFinite(numericDuration) && numericDuration > 0 ? numericDuration : fallback
}

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '')

const getVideoTaskId = (task) =>
  task?.id ||
  task?.task_id ||
  task?.taskId ||
  task?.data?.id ||
  task?.data?.task_id ||
  task?.data?.taskId ||
  task?.data?.[0]?.id ||
  task?.data?.[0]?.task_id ||
  task?.data?.[0]?.taskId ||
  task?.task_info?.id ||
  task?.task_info?.task_id

const isDataEyesLikeVideoGateway = (baseUrl = '') =>
  /dataeyes|shuyanai|platform\.shuyanai/i.test(String(baseUrl || ''))

const inferVideoRequestProtocol = (model = '', modelConfig = {}) => {
  const modelLower = String(model || '').toLowerCase()
  const configuredFamily = String(modelConfig?.endpointFamily || '').toLowerCase()

  if (configuredFamily && configuredFamily !== 'auto') {
    if (configuredFamily.includes('veo')) return 'veo'
    if (configuredFamily.includes('kling')) return 'kling'
    if (configuredFamily.includes('seedance') || configuredFamily.includes('doubao') || configuredFamily.includes('dataeyes-video')) return 'seedance'
    if (configuredFamily.includes('sora') || configuredFamily.includes('openai-video')) return 'openai-video'
  }

  if (/veo/.test(modelLower)) return 'veo'
  if (/kling/.test(modelLower)) return 'kling'
  if (/seedance|doubao/.test(modelLower)) return 'seedance'
  if (/sora/.test(modelLower)) return 'openai-video'
  if (/runway|luma|wan|hailuo|minimax/.test(modelLower)) return 'openai-video'
  return 'auto'
}

const normalizeOpenAIVideoSize = (ratio = '16:9', resolution = '720p') => {
  const normalizedRatio = normalizeVideoRatio(ratio)
  const normalizedResolution = String(resolution || '720p').toLowerCase()
  const shortSide = normalizedResolution.includes('1080') ? 1080 : 720

  if (normalizedRatio === '9:16') return `${shortSide}x${Math.round(shortSide * 16 / 9)}`
  if (normalizedRatio === '1:1') return `${shortSide}x${shortSide}`
  if (normalizedRatio === '4:3') return `${Math.round(shortSide * 4 / 3)}x${shortSide}`
  if (normalizedRatio === '3:4') return `${shortSide}x${Math.round(shortSide * 4 / 3)}`
  return `${Math.round(shortSide * 16 / 9)}x${shortSide}`
}

const buildDataEyesVideoProfile = (params, modelStore, modelConfig) => {
  const model = String(params.model || '')
  const modelLower = model.toLowerCase()
  const baseUrl = trimTrailingSlash(modelStore.currentVideoBaseUrl || modelStore.currentBaseUrl)
  const protocol = inferVideoRequestProtocol(model, modelConfig)
  const isKnownVideoModel = protocol !== 'auto'

  if (!isKnownVideoModel && !isDataEyesLikeVideoGateway(baseUrl)) {
    return null
  }

  const ratio = normalizeVideoRatio(params.ratio || modelConfig?.defaultParams?.ratio || '16:9')
  const duration = normalizeVideoDuration(params.dur || modelConfig?.defaultParams?.duration, 5)
  const resolution = params.resolution || modelConfig?.defaultParams?.resolution || modelConfig?.defaultResolution

  if (protocol === 'veo') {
    const data = {
      model,
      prompt: params.prompt || '',
      seconds: String(duration)
    }

    // Veo on DataEyes rejects ratio strings such as "16:9" in the `size` field.
    // Keep size/aspect_ratio out of the payload unless the provider exposes a
    // confirmed format, otherwise task polling returns "不合法的size".
    if (params.first_frame_image) {
      data.image = params.first_frame_image
      data.first_frame_image = params.first_frame_image
    } else if (params.images?.[0]) {
      data.image = params.images[0]
    }

    if (params.last_frame_image) data.last_frame_image = params.last_frame_image
    if (params.images?.length) data.images = params.images

    return {
      data,
      endpoint: `${baseUrl}/v1/videos`,
      taskEndpoint: `${baseUrl}/v1/videos/{taskId}`,
      protocol: 'dataeyes-veo'
    }
  }

  if (protocol === 'seedance') {
    const metadata = {
      ratio,
      watermark: false
    }

    if (resolution) metadata.resolution = resolution
    if (params.seed !== undefined && params.seed !== '') metadata.seed = Number(params.seed)
    if (params.camera_motion) metadata.camera_motion = params.camera_motion
    if (params.last_frame_image) {
      metadata.content = [
        {
          type: 'text',
          text: params.prompt || '',
          image_url: { url: params.last_frame_image }
        }
      ]
    }

    const data = {
      model,
      prompt: params.prompt || '',
      ratio,
      aspect_ratio: ratio,
      duration,
      seconds: String(duration),
      metadata
    }

    if (params.first_frame_image) {
      data.image = params.first_frame_image
      data.first_frame_image = params.first_frame_image
    } else if (params.images?.[0]) {
      data.image = params.images[0]
    }

    if (params.last_frame_image) data.last_frame_image = params.last_frame_image
    if (params.images?.length) data.images = params.images
    if (resolution) data.resolution = resolution

    return {
      data,
      endpoint: `${baseUrl}/v1/videos`,
      taskEndpoint: `${baseUrl}/v1/videos/{taskId}`,
      protocol: 'dataeyes-video'
    }
  }

  if (protocol === 'kling') {
    const data = {
      model,
      prompt: params.prompt || '',
      duration,
      aspect_ratio: ratio,
      mode: params.last_frame_image ? 'pro' : 'std',
      cfg_scale: 0.5
    }

    if (params.negative_prompt) data.negative_prompt = params.negative_prompt
    if (params.first_frame_image) data.image = params.first_frame_image
    if (params.last_frame_image) data.image_tail = params.last_frame_image
    if (params.images?.length && !data.image) data.images = params.images

    return {
      data,
      endpoint: `${baseUrl}/v1/videos`,
      taskEndpoint: `${baseUrl}/v1/videos/{taskId}`,
      protocol: 'dataeyes-kling'
    }
  }

  if (protocol === 'openai-video') {
    const data = {
      model,
      prompt: params.prompt || '',
      seconds: String(duration),
      size: normalizeOpenAIVideoSize(ratio, resolution)
    }

    if (params.first_frame_image) data.image = params.first_frame_image
    if (params.last_frame_image) data.last_frame_image = params.last_frame_image
    if (params.images?.length) data.images = params.images

    return {
      data,
      endpoint: `${baseUrl}/v1/videos`,
      taskEndpoint: `${baseUrl}/v1/videos/{taskId}`,
      protocol: 'openai-video'
    }
  }

  return null
}

export const useApiState = () => {
  const loading = ref(false)
  const error = ref(null)
  const status = ref('idle')

  const reset = () => {
    loading.value = false
    error.value = null
    status.value = 'idle'
  }

  const setLoading = (isLoading) => {
    loading.value = isLoading
    status.value = isLoading ? 'running' : status.value
  }

  const setError = (err) => {
    error.value = err
    status.value = 'error'
    loading.value = false
  }

  const setSuccess = () => {
    status.value = 'success'
    loading.value = false
    error.value = null
  }

  return { loading, error, status, reset, setLoading, setError, setSuccess }
}

/**
 * Chat composable | 问答组合式函数
 */
export const useChat = (options = {}) => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const { adaptRequest, adaptResponse } = useProvider()
  const modelStore = useModelStore()

  const messages = ref([])
  const currentResponse = ref('')
  let abortController = null

  const send = async (content, stream = true, chatOptions = {}) => {
    setLoading(true)
    currentResponse.value = ''
    const startedAt = nowMs()

    try {
      const chatModel = chatOptions.model || options.model || modelStore.selectedChatModel
      if (!chatModel) {
        throw new Error('请先在模型配置里添加文本模型')
      }

      const conflict = getModelCapabilityConflict(chatModel, 'chat')
      if (conflict) {
        throw new Error(`当前选择的是${getCapabilityLabel(conflict)}模型，不能用于文本/AI 润色。请在文本模型里填写对话模型。`)
      }

      const configuredChatModel = modelStore.availableChatModels.find((model) => model.key === chatModel)
      if (!configuredChatModel) {
        throw new Error('当前模型不在文本模型列表中，请先配置正确的文本模型')
      }

      // 构建用户消息内容（支持参考图片）
      addRuntimeLog('info', `AI 文本请求：${chatModel}`, {
        capability: 'chat'
      })

      let userContent
      const images = chatOptions.images || options.images || []

      if (images.length > 0) {
        // 多模态消息：文本 + 图片
        userContent = [
          { type: 'text', text: content },
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img.url || img }
          }))
        ]
      } else {
        userContent = content
      }

      const systemPrompt = chatOptions.systemPrompt || options.systemPrompt
      const msgList = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.value,
        { role: 'user', content: userContent }
      ]

      // 适配请求参数
      const adaptedParams = adaptRequest('chat', {
        model: chatModel,
        messages: msgList
      })

      if (stream) {
        status.value = 'streaming'
        abortController = new AbortController()
        let fullResponse = ''

        // 使用 modelStore 获取完整 URL
        const chatUrl = modelStore.getChatEndpoint()
        const endpoint = new URL(chatUrl).pathname

        for await (const chunk of streamChatCompletions(
          adaptedParams,
          abortController.signal,
          { baseUrl: new URL(chatUrl).origin, endpoint }
        )) {
          fullResponse += chunk
          currentResponse.value = fullResponse
        }

        messages.value.push({ role: 'user', content })
        messages.value.push({ role: 'assistant', content: fullResponse })
        addRuntimeLog('success', `AI 文本完成：${chatModel}`, {
          durationMs: elapsedMs(startedAt)
        })
        setSuccess()
        return fullResponse
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addRuntimeLog('error', `AI 文本失败：${err.message || '未知错误'}`, {
          durationMs: elapsedMs(startedAt)
        })
        setError(err)
        throw err
      }
    }
  }

  const stop = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  const clear = () => {
    messages.value = []
    currentResponse.value = ''
    reset()
  }

  onUnmounted(() => stop())

  return { loading, error, status, messages, currentResponse, send, stop, clear, reset }
}

/**
 * Image generation composable | 图片生成组合式函数
 * Simplified for open source - fixed input/output format
 */
export const useImageGeneration = () => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const { adaptRequest, adaptResponse } = useProvider()
  const modelStore = useModelStore()

  const images = ref([])
  const currentImage = ref(null)

  /**
   * Generate image with fixed params | 固定参数生成图片
   * @param {Object} params - { model, prompt, size, n, image (optional ref image) }
   */
  const generate = async (params) => {
    setLoading(true)
    images.value = []
    currentImage.value = null
    const startedAt = nowMs()

    try {
      if (!params.model) {
        throw new Error('请先在模型配置里添加图片模型')
      }

      const conflict = getModelCapabilityConflict(params.model, 'image')
      if (conflict) {
        throw new Error(`当前选择的是${getCapabilityLabel(conflict)}模型，不能用于图片生成。请在图片模型里填写 gpt-image-2 这类图片模型。`)
      }

      const imageModel = modelStore.availableImageModels.find((model) => model.key === params.model)
      if (!imageModel) {
        throw new Error('当前模型不在图片模型列表中，请先配置正确的图片模型')
      }

      const modelConfig = getModelByName(params.model)
      if (imageModel.requiresReference && !params.image) {
        throw new Error('当前模型是图片编辑模型，需要先连接或上传参考图后再生成。')
      }
      addRuntimeLog('info', `图片生成开始：${params.model}`, {
        size: params.size,
        count: params.n || 1,
        quality: params.quality,
        hasReference: !!params.image
      })

      // Build request data | 构建请求数据
      const requestData = {
        model: params.model,
        prompt: params.prompt,
        size: params.size || imageModel?.defaultParams?.size || modelConfig?.defaultParams?.size || '2048x2048'
      }

      if (params.n && Number(params.n) > 1) {
        requestData.n = Number(params.n)
      }

      if (params.quality) {
        requestData.quality = params.quality
      }

      // Add reference image if provided | 添加参考图
      if (params.image) {
        requestData.image = params.image
      }

      // 适配请求参数
      const normalizedRequestData = normalizeImageGenerationParams(params, imageModel, modelConfig)
      Object.keys(requestData).forEach((key) => delete requestData[key])
      Object.assign(requestData, normalizedRequestData)

      addRuntimeLog('info', `图片请求参数已适配：${params.model}`, {
        requestedSize: params.size,
        size: requestData.size,
        requestedQuality: params.quality,
        quality: requestData.quality || '',
        count: requestData.n || 1
      })

      let activeRequestData = { ...requestData }
      let adaptedParams = adaptRequest('image', activeRequestData)

      // Call API | 调用 API
      const hasImages = (payload) => Array.isArray(payload.image)
        ? payload.image.length > 0
        : !!payload.image

      let adaptedData = []

      const imageProtocol = modelStore.getImageModelProtocol(params.model)
      const generateViaChatImageProtocol = async (payload = adaptedParams) => {
        const promptText = [
          params.prompt,
          activeRequestData.size ? `\n\nTarget image size/aspect ratio: ${activeRequestData.size}.` : ''
        ].filter(Boolean).join('')

        const content = [
          { type: 'text', text: promptText }
        ]

        if (hasImages(payload)) {
          const imageSources = Array.isArray(payload.image) ? payload.image : [payload.image]
          imageSources.filter(Boolean).forEach((url) => {
            content.push({
              type: 'image_url',
              image_url: { url }
            })
          })
        }

        addRuntimeLog('info', `图片模型使用 Chat 图片通道：${params.model}`)
        const response = await generateImageWithChat({
          model: params.model,
          messages: [
            {
              role: 'user',
              content
            }
          ]
        }, {
          endpoint: modelStore.getChatEndpoint(),
          _taskId: params._taskId
        })

        return normalizeGeminiImageResponse(response)
      }

      const generateViaImageEndpoint = async (payload = adaptedParams) => {
        const response = hasImages(payload)
          ? await generateImage(await buildImageEditFormData(payload), {
              requestType: 'formdata',
              endpoint: modelStore.getImageEditEndpoint(),
              _taskId: params._taskId
            })
          : await generateImage(payload, {
              requestType: 'json',
              endpoint: modelStore.getImageEndpoint(),
              _taskId: params._taskId
            })

        return adaptResponse('image', response)
      }

      const retryImageEndpointWith = async (nextRequestData, reason) => {
        activeRequestData = { ...nextRequestData }
        adaptedParams = adaptRequest('image', activeRequestData)
        addRuntimeLog('info', `图片生成自动重试：${reason}`, {
          model: params.model,
          size: activeRequestData.size || '',
          quality: activeRequestData.quality || '',
          count: activeRequestData.n || 1
        })
        showBubble('retry', reason)
        return generateViaImageEndpoint(adaptedParams)
      }

      const tryImageEndpointFallbacks = async (initialError) => {
        const tried = new Set([JSON.stringify(activeRequestData)])
        let lastError = initialError

        const runCandidate = async (candidate, reason) => {
          const signature = JSON.stringify(candidate)
          if (tried.has(signature)) return null
          tried.add(signature)

          try {
            return await retryImageEndpointWith(candidate, reason)
          } catch (fallbackError) {
            lastError = fallbackError
            return null
          }
        }

        for (let attempt = 0; attempt < 4; attempt += 1) {
          const errorText = getApiErrorText(lastError).toLowerCase()
          const minPixels = getMinimumPixelsFromError(lastError)

          if (hasImageProfessionalParams(activeRequestData) && /unsupported|not support|unknown parameter|unrecognized|invalid|steps|cfg|sampler|scheduler|denois|negative_prompt/.test(errorText)) {
            const result = await runCandidate(
              stripImageProfessionalParams(activeRequestData),
              '当前模型不支持部分专业参数，已自动移除 Steps / CFG / Sampler / Scheduler / Denoise 等参数后重试。'
            )
            if (result) return result
            continue
          }

          if (activeRequestData.quality && /quality|不合法的quality/.test(errorText)) {
            const nextRequestData = { ...activeRequestData }
            delete nextRequestData.quality
            const result = await runCandidate(nextRequestData, '当前模型不支持画质参数，已自动移除后重试。')
            if (result) return result
            continue
          }

          if (/size|resolution|不合法的size|尺寸|像素|pixels/.test(errorText)) {
            const sizeCandidates = getImageSizeCandidates({
              modelKey: params.model,
              imageModel,
              modelConfig,
              minPixels
            }).filter((size) => size !== activeRequestData.size)

            for (const size of sizeCandidates) {
              const result = await runCandidate({
                ...activeRequestData,
                size
              }, `当前尺寸不被模型支持，已自动切换为 ${size} 后重试。`)
              if (result) return result
            }
          }

          if (activeRequestData.n && /count|数量|num| n /.test(errorText)) {
            const nextRequestData = { ...activeRequestData }
            delete nextRequestData.n
            const result = await runCandidate(nextRequestData, '当前模型不支持多张生成，已自动改为 1 张后重试。')
            if (result) return result
            continue
          }

          break
        }

        throw lastError
      }

      if (imageProtocol === 'chat') {
        adaptedData = await generateViaChatImageProtocol()
      } else {
        try {
          adaptedData = await generateViaImageEndpoint(adaptedParams)
        } catch (imageEndpointError) {
          if (isRecoverableImageParamError(imageEndpointError)) {
            try {
              adaptedData = await tryImageEndpointFallbacks(imageEndpointError)
            } catch (fallbackError) {
              if (!isImageEndpointUnsupportedError(fallbackError)) {
                throw fallbackError
              }

              addRuntimeLog('info', `图片模型自动切换 Chat 图片通道：${params.model}`, {
                reason: fallbackError.message || 'image endpoint unsupported after parameter fallback'
              })
              modelStore.updateCustomImageModelProtocol?.(params.model, 'chat')
              adaptedData = await generateViaChatImageProtocol()
            }
          } else if (isImageEndpointUnsupportedError(imageEndpointError)) {
            addRuntimeLog('info', `图片模型自动切换 Chat 图片通道：${params.model}`, {
              reason: imageEndpointError.message || 'image endpoint unsupported'
            })
            modelStore.updateCustomImageModelProtocol?.(params.model, 'chat')
            adaptedData = await generateViaChatImageProtocol()
          } else {
            throw imageEndpointError
          }
        }
      }

      if (!adaptedData[0]?.url) {
        throw new Error(imageProtocol === 'chat'
          ? 'Chat 图片通道返回成功，但没有解析到图片链接。请打开运行日志查看原始响应格式。'
          : '图片接口返回成功，但没有拿到图片地址或 base64 数据')
      }

      images.value = adaptedData
      currentImage.value = adaptedData[0] || null
      addRuntimeLog('success', `图片生成完成：${params.model}`, {
        count: adaptedData.length,
        durationMs: elapsedMs(startedAt)
      })
      setSuccess()
      showBubble('success', `图片生成完成 (${adaptedData.length} 张)`)
      return adaptedData
    } catch (err) {
      const structured = getChineseApiError(err, { capability: 'image' })
      const friendlyMessage = structured.description || getFriendlyImageErrorMessage(err)
      const friendlyError = new Error(friendlyMessage)
      friendlyError.cause = err
      friendlyError.originalMessage = err?.message || ''
      friendlyError.status = getApiErrorStatus(err)
      friendlyError.chineseError = structured
      if (err?._frontendTimeout) {
        friendlyError._frontendTimeout = true
      }
      addRuntimeLog('error', `图片生成失败：${err.message || '未知错误'}`, {
        model: params.model,
        durationMs: elapsedMs(startedAt),
        friendlyMessage
      })
      showBubble('error', friendlyMessage)
      setError(friendlyError)
      throw friendlyError
    }
  }

  return { loading, error, status, images, currentImage, generate, reset }
}

/**
 * Video generation composable | 视频生成组合式函数
 * Simplified for open source - fixed input/output format
 */

export const useVideoGeneration = () => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const { adaptRequest, adaptResponse } = useProvider()
  const modelStore = useModelStore()

  const video = ref(null)
  const taskId = ref(null)
  const progress = reactive({
    attempt: 0,
    maxAttempts: 72,
    percentage: 0
  })

  /**
   * Create video task only (no polling) | 仅创建视频任务（不轮询）
   */
  const createVideoTaskOnly = async (params) => {
    const startedAt = nowMs()

    if (!params.model) {
      throw new Error('请先在模型配置里添加视频模型')
    }

    const conflict = getModelCapabilityConflict(params.model, 'video')
    if (conflict) {
      throw new Error(`当前选择的是${getCapabilityLabel(conflict)}模型，不能用于视频生成。请在视频模型里填写 kling-v2-5-turbo 这类视频模型。`)
    }

    const videoModel = modelStore.availableVideoModels.find((model) => model.key === params.model)
    if (!videoModel) {
      throw new Error('当前模型不在视频模型列表中，请先配置正确的视频模型')
    }

    const modelConfig = getModelByName(params.model)
    const safePrompt = String(params.prompt || '').trim() ||
      '根据参考图片生成一段自然流畅的视频，保持主体一致，镜头运动自然，画面稳定。'
    addRuntimeLog('info', `视频任务创建开始：${params.model}`, {
      ratio: params.ratio,
      duration: params.dur,
      hasFirstFrame: !!params.first_frame_image,
      hasLastFrame: !!params.last_frame_image,
      referenceImageCount: params.images?.length || 0,
      promptLength: safePrompt.length
    })

    // Build request data | 构建请求数据
    const requestData = {
      model: params.model,
      prompt: safePrompt
    }
    // Add optional params | 添加可选参数
    if (params.first_frame_image) requestData.first_frame_image = params.first_frame_image
    if (params.last_frame_image) requestData.last_frame_image = params.last_frame_image
    if (params.images?.length) requestData.images = params.images
    if (params.ratio) requestData.size = params.ratio
    if (params.resolution || modelConfig?.defaultParams?.resolution || modelConfig?.defaultResolution) {
      requestData.resolution = params.resolution || modelConfig?.defaultParams?.resolution || modelConfig?.defaultResolution
    }
    if (params.dur) requestData.seconds = params.dur
    if (params.seed !== undefined && params.seed !== '') requestData.seed = params.seed
    if (params.negative_prompt) requestData.negative_prompt = params.negative_prompt
    if (params.camera_motion) requestData.camera_motion = params.camera_motion

    // 适配请求参数
    const dataEyesProfile = buildDataEyesVideoProfile({ ...params, prompt: safePrompt }, modelStore, modelConfig)
    const adaptedParams = dataEyesProfile?.data || adaptRequest('video', requestData)
    const videoEndpoint = dataEyesProfile?.endpoint || modelStore.getVideoEndpoint()
    const taskEndpoint = dataEyesProfile?.taskEndpoint || modelStore.getVideoTaskEndpoint()
    addRuntimeLog('info', `Video request profile: ${dataEyesProfile?.protocol || 'default'}`, {
      endpoint: videoEndpoint,
      taskEndpoint,
      payloadKeys: Object.keys(adaptedParams || {}),
      hasImage: Boolean(adaptedParams?.image || adaptedParams?.first_frame_image),
      hasTailImage: Boolean(adaptedParams?.image_tail || adaptedParams?.last_frame_image)
    })

    // Call API to create task | 调用 API 创建任务
    const task = await createVideoTask(adaptedParams, {
      requestType: 'json',
      endpoint: videoEndpoint
    })

    // Check if async (need polling) | 检查是否异步
    const isAsync = modelConfig?.async !== false

    const directVideoUrl = extractVideoUrls(task)[0]

    // If has video URL directly, return | 如果直接有视频 URL，返回
    if (directVideoUrl) {
      addRuntimeLog('success', `视频直接返回完成：${params.model}`, {
        durationMs: elapsedMs(startedAt)
      })
      return {
        taskId: null,
        url: directVideoUrl,
        taskEndpoint,
        videoProtocol: dataEyesProfile?.protocol || 'default'
      }
    }

    if (!isAsync) {
      addRuntimeLog('error', `视频接口没有返回可播放地址：${params.model}`, {
        response: summarizeVideoTaskResponse(task)
      })
      throw new Error('视频接口没有返回可播放地址，右侧运行日志已记录原始响应。')
    }

    // Get task ID | 获取任务 ID
    const newTaskId = getVideoTaskId(task)
    if (!newTaskId) {
      throw new Error('未获取到任务 ID')
    }

    addRuntimeLog('success', `视频任务已创建：${newTaskId}`, {
      model: params.model,
      durationMs: elapsedMs(startedAt)
    })
    return {
      taskId: newTaskId,
      taskEndpoint,
      videoProtocol: dataEyesProfile?.protocol || 'default'
    }
  }

  /**
   * Poll video task | 轮询视频任务
   */
  const pollVideoTask = async (pollTaskId, onProgress = () => {}, options = {}) => {
    const maxAttempts = 72
    const interval = 5000
    let lastResponse = null

    addRuntimeLog('info', `开始轮询视频任务：${pollTaskId}`, {
      maxSeconds: Math.round((maxAttempts * interval) / 1000)
    })

    for (let i = 0; i < maxAttempts; i++) {
      onProgress(i + 1, Math.min(Math.round((i / maxAttempts) * 100), 99))

      // 获取任务查询端点，支持 {taskId} 占位符替换
      let taskEndpoint = options.taskEndpoint || modelStore.getVideoTaskEndpoint()
      if (taskEndpoint.includes('{taskId}')) {
        taskEndpoint = taskEndpoint.replace('{taskId}', pollTaskId)
      }

      const result = await getVideoTaskStatus(pollTaskId, {
        endpoint: taskEndpoint
      })
      lastResponse = result

      // 适配轮询响应
      const adaptedResult = adaptResponse('video', result)
      const taskState = getVideoTaskState(result)
      const videoUrl = extractVideoUrls(adaptedResult)[0] || extractVideoUrls(result)[0]

      if (videoUrl) {
        addRuntimeLog('success', `视频任务完成：${pollTaskId}`, {
          state: taskState || 'unknown',
          url: videoUrl
        })
        return { ...adaptedResult, url: videoUrl }
      }

      if (FAILED_VIDEO_STATES.has(taskState)) {
        const message = getVideoTaskFailureMessage(result)
        addRuntimeLog('error', `视频任务失败：${message}`, {
          taskId: pollTaskId,
          state: taskState,
          response: summarizeVideoTaskResponse(result)
        })
        throw new Error(message)
      }

      if (COMPLETED_VIDEO_STATES.has(taskState)) {
        addRuntimeLog('info', `视频任务显示完成，正在等待视频地址：${pollTaskId}`, {
          attempt: i + 1,
          state: taskState,
          response: summarizeVideoTaskResponse(result)
        })
      } else if (taskState && !PENDING_VIDEO_STATES.has(taskState)) {
        addRuntimeLog('info', `视频任务状态：${taskState}`, {
          taskId: pollTaskId,
          attempt: i + 1,
          response: summarizeVideoTaskResponse(result)
        })
      }

      // Wait before next poll | 等待下次轮询
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    addRuntimeLog('error', `视频任务未返回可播放地址：${pollTaskId}`, {
      maxSeconds: Math.round((maxAttempts * interval) / 1000),
      lastResponse: summarizeVideoTaskResponse(lastResponse)
    })
    throw new Error(`视频任务暂未返回可播放地址（任务ID：${pollTaskId}）。右侧运行日志已记录最后一次响应。`)
  }

  const getFriendlyVideoErrorMessage = (error) => {
    const status = getApiErrorStatus(error)
    const message = getApiErrorText(error).toLowerCase()

    if (status === 401 || status === 403 || /permission|forbidden|unauthorized|无权限|权限|余额|quota|credit/.test(message)) {
      return '模型供应商拒绝了请求，请检查 API Key 权限和余额。'
    }
    if (status === 429 || /rate.?limit|频率|频繁/.test(message)) {
      return '请求过于频繁，请稍后再试。'
    }
    if (/ratio|aspect.?ratio|不合法的ratio|不合法的aspect/.test(message)) {
      return '当前比例不被模型支持，已尝试自动切换比例。'
    }
    if (/resolution|分辨率|不合法的resolution/.test(message)) {
      return '当前分辨率不被模型支持，已尝试自动降低分辨率。'
    }
    if (/duration|seconds|时长|不合法的duration/.test(message)) {
      return '当前时长不被模型支持，已尝试自动调整时长。'
    }
    if (/content|policy|违禁|审核|safety|inappropriate/.test(message)) {
      return '提示词内容触发审核，请修改后重试。'
    }
    if (/image.?format|图片格式|unsupported.*image/.test(message)) {
      return '参考图片格式不被支持，请尝试其他图片。'
    }
    if (status >= 500 || /server|upstream|timeout|超时|internal.?error/.test(message)) {
      return '模型供应商服务异常，可能是临时故障，请稍后再试。'
    }
    return error?.message || '视频生成失败，请打开运行日志查看请求详情。'
  }

  const isRecoverableVideoParamError = (error) => {
    const message = getApiErrorText(error).toLowerCase()
    return /ratio|aspect.?ratio|不合法的ratio|resolution|分辨率|duration|seconds|时长|不合法的duration/.test(message)
  }

  const getVideoRatioCandidates = (modelKey, modelConfig, currentRatio) => {
    const available = modelConfig?.ratios || modelConfig?.defaultParams?.ratios || []
    const fallback = ['16:9', '9:16', '1:1', '4:3', '3:4']
    const pool = [...new Set([...available, ...fallback])]
    return pool.filter((r) => r && r !== currentRatio)
  }

  const getVideoDurationCandidates = (modelConfig, currentDuration) => {
    const available = modelConfig?.durs || modelConfig?.defaultParams?.durs || []
    const fallback = [5, 10, 8]
    const pool = [...new Set([...available, ...fallback])]
    return pool.filter((d) => d && d !== currentDuration)
  }

  /**
   * Generate video with fixed params (includes polling + fallback) | 固定参数生成视频（含轮询+回退）
   */
  const generate = async (params) => {
    setLoading(true)
    video.value = null
    taskId.value = null
    progress.attempt = 0
    progress.percentage = 0

    const modelConfig = getModelByName(params.model)

    try {
      let result = null
      let lastError = null

      try {
        result = await executeVideoGeneration(params)
      } catch (initialError) {
        lastError = initialError

        if (!isRecoverableVideoParamError(initialError)) {
          throw initialError
        }

        const tried = new Set([JSON.stringify({ ratio: params.ratio, dur: params.dur })])

        for (let attempt = 0; attempt < 3; attempt += 1) {
          const errorText = getApiErrorText(lastError).toLowerCase()
          let nextParams = null
          let reason = ''

          if (/ratio|aspect.?ratio|不合法的ratio|不合法的aspect/.test(errorText)) {
            const candidates = getVideoRatioCandidates(params.model, modelConfig, params.ratio)
              .filter((r) => !tried.has(JSON.stringify({ ratio: r, dur: params.dur })))
            if (candidates.length > 0) {
              nextParams = { ...params, ratio: candidates[0] }
              reason = `当前比例不被模型支持，已自动切换为 ${candidates[0]} 后重试。`
            }
          }

          if (!nextParams && /duration|seconds|时长|不合法的duration/.test(errorText)) {
            const candidates = getVideoDurationCandidates(modelConfig, params.dur)
              .filter((d) => !tried.has(JSON.stringify({ ratio: params.ratio, dur: d })))
            if (candidates.length > 0) {
              nextParams = { ...params, dur: candidates[0] }
              reason = `当前时长不被模型支持，已自动调整为 ${candidates[0]} 秒后重试。`
            }
          }

          if (!nextParams) break

          tried.add(JSON.stringify({ ratio: nextParams.ratio, dur: nextParams.dur }))

          addRuntimeLog('info', `视频生成自动重试：${reason}`, {
            model: params.model,
            ratio: nextParams.ratio,
            dur: nextParams.dur
          })
          showBubble('retry', reason)

          try {
            result = await executeVideoGeneration(nextParams)
            break
          } catch (fallbackError) {
            lastError = fallbackError
          }
        }

        if (!result) {
          throw lastError
        }
      }

      return result
    } catch (err) {
      const structured = getChineseApiError(err, { capability: 'video' })
      const friendlyMessage = structured.description || getFriendlyVideoErrorMessage(err)
      addRuntimeLog('error', `视频生成失败：${err.message || '未知错误'}`, {
        model: params.model,
        friendlyMessage
      })
      showBubble('error', friendlyMessage)
      const friendlyError = new Error(friendlyMessage)
      friendlyError.chineseError = structured
      setError(friendlyError)
      throw friendlyError
    }
  }

  const executeVideoGeneration = async (params) => {
    const { taskId: newTaskId, url, taskEndpoint } = await createVideoTaskOnly(params)

    if (url) {
      video.value = { url }
      setSuccess()
      showBubble('success', '视频生成完成')
      return video.value
    }

    taskId.value = newTaskId
    status.value = 'polling'
    showBubble('info', '视频任务已创建，正在排队处理...')

    const result = await pollVideoTask(newTaskId, (attempt, percentage) => {
      progress.attempt = attempt
      progress.percentage = percentage
    }, { taskEndpoint })

    video.value = result
    setSuccess()
    showBubble('success', '视频生成完成')
    return result
  }

  return { loading, error, status, video, taskId, progress, generate, reset, createVideoTaskOnly, pollVideoTask }
}

/**
 * Combined API composable | 综合 API 组合式函数
 */
export const useApi = () => {
  const config = useApiConfig()
  const chat = useChat()
  const image = useImageGeneration()
  const videoGen = useVideoGeneration()

  return { config, chat, image, video: videoGen }
}
