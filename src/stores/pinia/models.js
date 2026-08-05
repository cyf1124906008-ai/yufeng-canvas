/**
 * Pinia Store: Model Config
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import {
  CHAT_MODELS,
  IMAGE_MODELS,
  VIDEO_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  getDefaultChatModelForProvider,
  getDefaultVideoModelForProvider
} from '@/config/models'
import { PROVIDERS, getProviderList, getDefaultProvider, getProviderConfig, getDefaultBaseUrl } from '@/config/providers'
import { DISTRIBUTION_CONFIG, getPresetApiKey, getPresetBaseUrl } from '@/config/distribution'
import { isModelAllowedForCapability } from '@/utils/modelCapability'
import { normalizeProviderEndpoint } from '@/utils/providerEndpoint'

const STORAGE_KEYS = {
  PROVIDER: 'api-provider',
  CUSTOM_CHAT_MODELS: 'custom-chat-models',
  CUSTOM_IMAGE_MODELS: 'custom-image-models',
  CUSTOM_VIDEO_MODELS: 'custom-video-models',
  SELECTED_CHAT_MODEL: 'selected-chat-model',
  SELECTED_IMAGE_MODEL: 'selected-image-model',
  SELECTED_VIDEO_MODEL: 'selected-video-model',
  MODEL_ROUTING_MODES: 'model-routing-modes-v1',
  CUSTOM_CHAT_MODELS_BY_PROVIDER: 'custom-chat-models-by-provider',
  CUSTOM_IMAGE_MODELS_BY_PROVIDER: 'custom-image-models-by-provider',
  CUSTOM_VIDEO_MODELS_BY_PROVIDER: 'custom-video-models-by-provider',
  API_KEYS_BY_PROVIDER: 'api-keys-by-provider',
  BASE_URLS_BY_PROVIDER: 'base-urls-by-provider'
}

const API_KEY_CAPABILITIES = ['default', 'chat', 'image', 'video']
const API_BASE_URL_CAPABILITIES = ['default', 'chat', 'image', 'video']
const MODEL_ROUTING_GROUPS = ['chat', 'image', 'video']
const REQUIRE_USER_MODELS = DISTRIBUTION_CONFIG.models?.requireUserModels === true
const MODEL_INTELLIGENCE_FIELDS = [
  'capabilities',
  'quality',
  'qualityScore',
  'quality_score',
  'speed',
  'speedScore',
  'speed_score',
  'latencyMs',
  'latency_ms',
  'cost',
  'pricing',
  'price',
  'currency',
  'costUnit',
  'reliability',
  'reliabilityScore',
  'reliability_score',
  'successRate',
  'success_rate',
  'availability',
  'available',
  'status',
  'supported',
  'supportsVision',
  'modalities',
  'limits'
]

const pickModelIntelligence = (model = {}) => Object.fromEntries(
  MODEL_INTELLIGENCE_FIELDS
    .filter((field) => model[field] !== undefined)
    .map((field) => [field, model[field]])
)

const inferImageProtocol = (modelKey = '') => {
  const value = String(modelKey).toLowerCase()
  if (value.includes('gemini') && value.includes('image')) {
    return 'chat'
  }
  return 'image'
}

const resolveImageProtocol = (model = {}) => {
  const inferredProtocol = inferImageProtocol(model.key)
  const configuredProtocol = model.protocol || 'auto'

  // Gemini image-preview models are served through chat-completions on many
  // OpenAI-compatible aggregators. Older user configs may still say "image",
  // so the safer automatic route must win here.
  if (inferredProtocol === 'chat') {
    return 'chat'
  }

  return configuredProtocol && configuredProtocol !== 'auto'
    ? configuredProtocol
    : inferredProtocol
}

const mergeModelsByKey = (...groups) => {
  const merged = new Map()

  groups.flat().filter(Boolean).forEach((model) => {
    if (!model?.key) return
    merged.set(model.key, {
      ...(merged.get(model.key) || {}),
      ...model
    })
  })

  return [...merged.values()]
}

const normalizeEndpointTypes = (model = {}) => {
  const endpointTypes = model.supported_endpoint_types ?? model.endpoints ?? model.endpointTypes ?? []
  if (Array.isArray(endpointTypes)) {
    return endpointTypes.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  }
  return String(endpointTypes)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

const inferImageSizes = (modelKey = '') => {
  const value = String(modelKey).toLowerCase()
  if (value.includes('seedream-4-5') || value.includes('seedream-5') || value.includes('4.5')) {
    return ['2048x2048', '2560x1440', '1440x2560', '2304x1728', '1728x2304']
  }
  if (value.includes('seedream') || value.includes('imagen')) {
    return ['2048x2048', '2560x1440', '1440x2560', '1536x1024', '1024x1536']
  }
  return ['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792']
}

const inferImageDefaultSize = (modelKey = '') => inferImageSizes(modelKey)[0] || '1024x1024'

const inferVideoEndpointFamily = (modelKey = '', endpointTypes = []) => {
  const value = String(modelKey).toLowerCase()
  if (value.includes('seedance') || value.includes('doubao')) return 'dataeyes-video'
  if (value.includes('kling')) return 'kling'
  if (value.includes('veo')) return 'veo'
  if (value.includes('sora')) return 'openai-video'
  if (endpointTypes.includes('openai-videos')) return 'openai-video'
  if (endpointTypes.includes('doubao')) return 'dataeyes-video'
  return endpointTypes.includes('videos') || endpointTypes.includes('video') ? 'openai-video' : 'auto'
}

const inferDiscoveredCapability = (model = {}) => {
  const key = String(model.id || model.key || '').toLowerCase()
  const endpointTypes = normalizeEndpointTypes(model)

  // Video: endpoint type signals or model name patterns
  if (
    endpointTypes.some((type) => ['video', 'videos', 'openai-videos', 'doubao'].includes(type)) ||
    /seedance|sora|veo|kling|wan2?\.?|hailuo|minimax-video|runway|luma|cogvideo|animate|video/i.test(key)
  ) {
    return 'video'
  }

  // Image: endpoint type signals or model name patterns
  if (
    endpointTypes.includes('image-generation') ||
    /gpt-image|chatgpt-image|seedream|imagen|flux|banana|grok-imagine|qwen-image|stable.?diffusion|dall.?e|midjourney|sd3|sdxl/i.test(key) ||
    (key.includes('gemini') && key.includes('image'))
  ) {
    return 'image'
  }

  // Skip: embeddings, rerank, TTS, ASR, moderation
  if (endpointTypes.some((type) => ['embeddings', 'rerank', 'tts', 'asr', 'audio', 'moderation'].includes(type))) {
    return ''
  }
  if (/embed|rerank|tts|asr|whisper|moderation|clip/i.test(key) && !/clip-interrogat/i.test(key)) {
    return ''
  }

  // Chat: explicit endpoint types or remaining models (default fallback)
  if (endpointTypes.some((type) => ['openai', 'openai-response', 'anthropic', 'gemini', 'chat'].includes(type))) {
    return 'chat'
  }

  // Heuristic: if no endpoint type matched but looks like a chat model by name
  if (/gpt-|claude|qwen|deepseek|llama|mistral|gemini|doubao|kimi|minimax|yi-|chatglm|phi-|command|granite/i.test(key)) {
    return 'chat'
  }

  return ''
}

/**
 * Deduplicate model keys by stripping common version suffixes.
 * Returns the canonical key for dedup comparison.
 */
const canonicalModelKey = (key = '') => {
  let canonical = String(key).trim().toLowerCase()
  // Strip trailing version tags like -v2, -v3, -v1.5, but keep meaningful suffixes
  canonical = canonical.replace(/-v\d+(\.\d+)?$/, '')
  return canonical
}

export const resolveProviderConnectionPair = (profiles = {}) => {
  for (const capability of API_KEY_CAPABILITIES) {
    const profile = profiles?.[capability]
    if (!profile || typeof profile !== 'object') continue
    const apiKey = String(profile.apiKey || '').trim()
    const normalized = normalizeProviderEndpoint(profile.baseUrl)
    if (!apiKey || !normalized.baseUrl) continue
    return {
      capability,
      apiKey,
      baseUrl: normalized.baseUrl,
      warnings: normalized.warnings || []
    }
  }
  return null
}

const cloneSettingsValue = value => JSON.parse(JSON.stringify(value))

const getStored = (key, defaultValue = '') => {
  try {
    return localStorage.getItem(key) || defaultValue
  } catch {
    return defaultValue
  }
}

const setStored = (key, value) => {
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

const removeStored = (key) => {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

const getStoredJson = (key, defaultValue = []) => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

const setStoredJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const normalizeApiKeyEntry = (entry, presetDefault = '') => {
  const normalized = {
    default: '',
    chat: '',
    image: '',
    video: ''
  }

  if (typeof entry === 'string') {
    normalized.default = entry.trim()
  } else if (entry && typeof entry === 'object') {
    API_KEY_CAPABILITIES.forEach((capability) => {
      const value = entry[capability]
      normalized[capability] = typeof value === 'string' ? value.trim() : ''
    })
  }

  if (!normalized.default && presetDefault) {
    normalized.default = presetDefault
  }

  return normalized
}

const normalizeApiKeysByProvider = (apiKeysByProvider = {}) =>
  Object.entries(apiKeysByProvider).reduce((result, [provider, entry]) => {
    result[provider] = normalizeApiKeyEntry(entry)
    return result
  }, {})

const normalizeBaseUrlEntry = (entry, presetDefault = '') => {
  const normalized = {
    default: '',
    chat: '',
    image: '',
    video: ''
  }

  if (typeof entry === 'string') {
    normalized.default = normalizeProviderEndpoint(entry).baseUrl || ''
  } else if (entry && typeof entry === 'object') {
    API_BASE_URL_CAPABILITIES.forEach((capability) => {
      const value = entry[capability]
      normalized[capability] = typeof value === 'string' ? (normalizeProviderEndpoint(value).baseUrl || '') : ''
    })
  }

  if (!normalized.default && presetDefault) {
    normalized.default = presetDefault
  }

  return normalized
}

const normalizeBaseUrlsByProvider = (baseUrlsByProvider = {}) =>
  Object.entries(baseUrlsByProvider).reduce((result, [provider, entry]) => {
    result[provider] = normalizeBaseUrlEntry(entry)
    return result
  }, {})

const normalizeModelRoutingModes = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(MODEL_ROUTING_GROUPS.map((group) => [
    group,
    source[group] === 'locked' ? 'locked' : 'auto'
  ]))
}

const joinApiEndpoint = (baseUrl = '', endpoint = '') => {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  let path = String(endpoint || '')
  if (!base) return path
  if (/\/(api\/)?v\d+$/i.test(base) && /^\/v\d+\//i.test(path)) {
    path = path.replace(/^\/v\d+/i, '')
  }
  if (!path.startsWith('/')) path = `/${path}`
  return `${base}${path}`
}

const isModelSupported = (model, provider) => {
  if (!model.provider) {
    return true
  }

  return model.provider.includes(provider)
}

const buildCustomChatModel = (model, provider) => ({
  ...pickModelIntelligence(model),
  label: model.label || model.key,
  key: model.key,
  isCustom: true,
  ...(provider ? { provider: [provider] } : {})
})

const buildCustomImageModel = (model, provider) => ({
  ...pickModelIntelligence(model),
  label: model.label || model.key,
  key: model.key,
  isCustom: true,
  protocol: model.protocol || 'auto',
  resolvedProtocol: resolveImageProtocol(model),
  sizes: model.sizes || inferImageSizes(model.key),
  qualities: model.qualities || [],
  defaultParams: {
    size: model.defaultParams?.size || inferImageDefaultSize(model.key),
    quality: model.defaultParams?.quality || 'standard',
    style: model.defaultParams?.style || 'vivid'
  },
  endpointTypes: model.endpointTypes || [],
  ownedBy: model.ownedBy || '',
  requiresReference: Boolean(model.requiresReference),
  ...(provider ? { provider: [provider] } : {})
})

const buildCustomVideoModel = (model, provider) => ({
  ...pickModelIntelligence(model),
  label: model.label || model.key,
  key: model.key,
  isCustom: true,
  ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  durs: [{ label: '5 s', key: 5 }, { label: '10 s', key: 10 }],
  resolutions: model.resolutions || ['720p', '1080p'],
  defaultResolution: model.defaultResolution || '720p',
  defaultParams: {
    ratio: model.defaultParams?.ratio || '16:9',
    duration: model.defaultParams?.duration || 5,
    resolution: model.defaultParams?.resolution || model.defaultResolution || '720p'
  },
  endpointTypes: model.endpointTypes || [],
  endpointFamily: model.endpointFamily || inferVideoEndpointFamily(model.key, model.endpointTypes || []),
  ownedBy: model.ownedBy || '',
  ...(provider ? { provider: [provider] } : {})
})

export const useModelStore = defineStore('model', () => {
  const distributionDefaultProvider = DISTRIBUTION_CONFIG.api.defaultProvider || getDefaultProvider()

  const resolveInitialProvider = () => {
    if (DISTRIBUTION_CONFIG.api.lockProvider) {
      return distributionDefaultProvider
    }

    const storedProvider = getStored(STORAGE_KEYS.PROVIDER, distributionDefaultProvider)
    return PROVIDERS[storedProvider] ? storedProvider : distributionDefaultProvider
  }

  const resolveBaseUrl = (provider, baseUrlsByProvider, capability = 'default') => {
    const normalizedCapability = API_BASE_URL_CAPABILITIES.includes(capability) ? capability : 'default'
    const presetBaseUrl = getPresetBaseUrl(provider)

    if (DISTRIBUTION_CONFIG.api.lockBaseUrl && presetBaseUrl) {
      return presetBaseUrl
    }

    const baseUrlEntry = normalizeBaseUrlEntry(baseUrlsByProvider[provider], presetBaseUrl || getDefaultBaseUrl(provider))
    return baseUrlEntry[normalizedCapability] || baseUrlEntry.default || presetBaseUrl || getDefaultBaseUrl(provider)
  }

  const currentProvider = ref(resolveInitialProvider())
  const providerList = computed(() => getProviderList())
  const providerConfig = computed(() => getProviderConfig(currentProvider.value))
  const providerLabel = computed(() => providerConfig.value.label || currentProvider.value)
  const getProviderChatFallback = (provider = currentProvider.value) =>
    REQUIRE_USER_MODELS ? '' : getDefaultChatModelForProvider(provider)
  const getProviderVideoFallback = (provider = currentProvider.value) =>
    REQUIRE_USER_MODELS ? '' : getDefaultVideoModelForProvider(provider)

  const setProvider = (provider) => {
    const nextProvider = DISTRIBUTION_CONFIG.api.lockProvider
      ? distributionDefaultProvider
      : provider

    if (!PROVIDERS[nextProvider]) {
      return
    }

    currentProvider.value = nextProvider
    setStored(STORAGE_KEYS.PROVIDER, nextProvider)
  }

  const clearProvider = () => {
    currentProvider.value = distributionDefaultProvider
    removeStored(STORAGE_KEYS.PROVIDER)
  }

  const adaptRequest = (type, params) => {
    const adapter = providerConfig.value.requestAdapter?.[type]
    return adapter ? adapter(params) : params
  }

  const adaptResponse = (type, response) => {
    const adapter = providerConfig.value.responseAdapter?.[type]
    return adapter ? adapter(response) : response
  }

  const customChatModels = ref(getStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS, []))
  const customImageModels = ref(getStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS, []))
  const customVideoModels = ref(getStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS, []))

  const customChatModelsByProvider = ref(getStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS_BY_PROVIDER, {}))
  const customImageModelsByProvider = ref(getStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS_BY_PROVIDER, {}))
  const customVideoModelsByProvider = ref(getStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS_BY_PROVIDER, {}))

  const selectedChatModel = ref(getStored(STORAGE_KEYS.SELECTED_CHAT_MODEL, getProviderChatFallback()))
  const selectedImageModel = ref(getStored(STORAGE_KEYS.SELECTED_IMAGE_MODEL, REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL))
  const selectedVideoModel = ref(
    getStored(STORAGE_KEYS.SELECTED_VIDEO_MODEL, getProviderVideoFallback(currentProvider.value))
  )
  const modelRoutingModes = ref(normalizeModelRoutingModes(
    getStoredJson(STORAGE_KEYS.MODEL_ROUTING_MODES, {})
  ))

  const apiKeysByProvider = ref(normalizeApiKeysByProvider(getStoredJson(STORAGE_KEYS.API_KEYS_BY_PROVIDER, {})))
  const baseUrlsByProvider = ref(normalizeBaseUrlsByProvider(getStoredJson(STORAGE_KEYS.BASE_URLS_BY_PROVIDER, {})))

  const getApiKeyByProvider = (provider, capability = 'default') => {
    const normalizedCapability = API_KEY_CAPABILITIES.includes(capability) ? capability : 'default'
    const apiKeyEntry = normalizeApiKeyEntry(apiKeysByProvider.value[provider], getPresetApiKey(provider))
    return apiKeyEntry[normalizedCapability] || apiKeyEntry.default || ''
  }

  const currentApiKey = computed(() => getApiKeyByProvider(currentProvider.value))
  const currentChatApiKey = computed(() => getApiKeyByProvider(currentProvider.value, 'chat'))
  const currentImageApiKey = computed(() => getApiKeyByProvider(currentProvider.value, 'image'))
  const currentVideoApiKey = computed(() => getApiKeyByProvider(currentProvider.value, 'video'))
  const hasAnyApiKey = computed(() =>
    API_KEY_CAPABILITIES.some((capability) => !!getApiKeyByProvider(currentProvider.value, capability))
  )
  const getBaseUrlByProvider = (provider, capability = 'default') =>
    resolveBaseUrl(provider, baseUrlsByProvider.value, capability)

  const currentBaseUrl = computed(() => getBaseUrlByProvider(currentProvider.value))
  const currentChatBaseUrl = computed(() => getBaseUrlByProvider(currentProvider.value, 'chat'))
  const currentImageBaseUrl = computed(() => getBaseUrlByProvider(currentProvider.value, 'image'))
  const currentVideoBaseUrl = computed(() => getBaseUrlByProvider(currentProvider.value, 'video'))

  const setApiKeyByProvider = (provider, apiKey, capability = 'default') => {
    const normalizedCapability = API_KEY_CAPABILITIES.includes(capability) ? capability : 'default'
    const normalizedApiKey = apiKey?.trim?.() || ''
    const nextEntry = normalizeApiKeyEntry(apiKeysByProvider.value[provider])

    if (normalizedApiKey) {
      nextEntry[normalizedCapability] = normalizedApiKey
    } else {
      nextEntry[normalizedCapability] = ''
    }

    if (API_KEY_CAPABILITIES.some((key) => nextEntry[key])) {
      apiKeysByProvider.value[provider] = nextEntry
    } else {
      delete apiKeysByProvider.value[provider]
    }
  }

  const setBaseUrlByProvider = (provider, baseUrl, capability = 'default') => {
    const normalizedCapability = API_BASE_URL_CAPABILITIES.includes(capability) ? capability : 'default'
    const normalizedBaseUrl = normalizeProviderEndpoint(baseUrl).baseUrl || ''
    const nextBaseUrl = DISTRIBUTION_CONFIG.api.lockBaseUrl
      ? resolveBaseUrl(provider, {})
      : normalizedBaseUrl
    const nextEntry = normalizeBaseUrlEntry(baseUrlsByProvider.value[provider])

    if (nextBaseUrl) {
      nextEntry[normalizedCapability] = nextBaseUrl
    } else {
      nextEntry[normalizedCapability] = ''
    }

    if (API_BASE_URL_CAPABILITIES.some((key) => nextEntry[key])) {
      baseUrlsByProvider.value[provider] = nextEntry
    } else {
      delete baseUrlsByProvider.value[provider]
    }
  }

  const clearApiConfigByProvider = (provider) => {
    delete apiKeysByProvider.value[provider]
    delete baseUrlsByProvider.value[provider]
  }

  const createApiSettingsSnapshot = () => cloneSettingsValue({
    currentProvider: currentProvider.value,
    selectedChatModel: selectedChatModel.value,
    selectedImageModel: selectedImageModel.value,
    selectedVideoModel: selectedVideoModel.value,
    modelRoutingModes: modelRoutingModes.value,
    customChatModels: customChatModels.value,
    customImageModels: customImageModels.value,
    customVideoModels: customVideoModels.value,
    customChatModelsByProvider: customChatModelsByProvider.value,
    customImageModelsByProvider: customImageModelsByProvider.value,
    customVideoModelsByProvider: customVideoModelsByProvider.value,
    apiKeysByProvider: apiKeysByProvider.value,
    baseUrlsByProvider: baseUrlsByProvider.value
  })

  const restoreApiSettingsSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !PROVIDERS[snapshot.currentProvider]) return false
    customChatModels.value = cloneSettingsValue(snapshot.customChatModels || [])
    customImageModels.value = cloneSettingsValue(snapshot.customImageModels || [])
    customVideoModels.value = cloneSettingsValue(snapshot.customVideoModels || [])
    customChatModelsByProvider.value = cloneSettingsValue(snapshot.customChatModelsByProvider || {})
    customImageModelsByProvider.value = cloneSettingsValue(snapshot.customImageModelsByProvider || {})
    customVideoModelsByProvider.value = cloneSettingsValue(snapshot.customVideoModelsByProvider || {})
    apiKeysByProvider.value = cloneSettingsValue(snapshot.apiKeysByProvider || {})
    baseUrlsByProvider.value = cloneSettingsValue(snapshot.baseUrlsByProvider || {})
    currentProvider.value = snapshot.currentProvider
    selectedChatModel.value = String(snapshot.selectedChatModel || '')
    selectedImageModel.value = String(snapshot.selectedImageModel || '')
    selectedVideoModel.value = String(snapshot.selectedVideoModel || '')
    modelRoutingModes.value = normalizeModelRoutingModes(snapshot.modelRoutingModes)
    return true
  }

  const allChatModels = computed(() => mergeModelsByKey(
    REQUIRE_USER_MODELS ? [] : CHAT_MODELS.map((model) => ({ ...model, isCustom: false })),
    customChatModels.value.map((model) => buildCustomChatModel(model)),
    (customChatModelsByProvider.value[currentProvider.value] || []).map((model) =>
      buildCustomChatModel(model, currentProvider.value)
    )
  ).filter((model) => isModelAllowedForCapability(model.key, 'chat')))

  const allImageModels = computed(() => mergeModelsByKey(
    REQUIRE_USER_MODELS ? [] : IMAGE_MODELS.map((model) => ({ ...model, isCustom: false })),
    customImageModels.value.map((model) => buildCustomImageModel(model)),
    (customImageModelsByProvider.value[currentProvider.value] || []).map((model) =>
      buildCustomImageModel(model, currentProvider.value)
    )
  ).filter((model) => isModelAllowedForCapability(model.key, 'image')))

  const allVideoModels = computed(() => mergeModelsByKey(
    REQUIRE_USER_MODELS ? [] : VIDEO_MODELS.map((model) => ({ ...model, isCustom: false })),
    customVideoModels.value.map((model) => buildCustomVideoModel(model)),
    (customVideoModelsByProvider.value[currentProvider.value] || []).map((model) =>
      buildCustomVideoModel(model, currentProvider.value)
    )
  ).filter((model) => isModelAllowedForCapability(model.key, 'video')))

  const availableChatModels = computed(() =>
    allChatModels.value.filter((model) => isModelSupported(model, currentProvider.value))
  )

  const availableImageModels = computed(() =>
    allImageModels.value.filter((model) => isModelSupported(model, currentProvider.value))
  )

  const availableVideoModels = computed(() =>
    allVideoModels.value.filter((model) => isModelSupported(model, currentProvider.value))
  )

  const allImageModelOptions = computed(() =>
    allImageModels.value.map((model) => ({
      label: model.label,
      key: model.key
    }))
  )

  const allVideoModelOptions = computed(() =>
    allVideoModels.value.map((model) => ({
      label: model.label,
      key: model.key
    }))
  )

  const allChatModelOptions = computed(() =>
    allChatModels.value.map((model) => ({
      label: model.label,
      key: model.key
    }))
  )

  const imageModelOptions = computed(() =>
    availableImageModels.value.map((model) => ({
      label: model.label,
      key: model.key
    }))
  )

  const videoModelOptions = computed(() =>
    availableVideoModels.value.map((model) => ({
      label: model.label,
      key: model.key
    }))
  )

  const chatModelOptions = computed(() =>
    availableChatModels.value.map((model) => ({
      label: model.label,
      key: model.key
    }))
  )

  const addCustomChatModel = (modelKey, label = '') => {
    if (!modelKey || customChatModels.value.some((model) => model.key === modelKey)) {
      return false
    }

    customChatModels.value.push({ key: modelKey, label: label || modelKey })
    setSelectedModel('chat', modelKey)
    return true
  }

  const addCustomImageModel = (modelKey, label = '', options = {}) => {
    if (!modelKey || customImageModels.value.some((model) => model.key === modelKey)) {
      return false
    }

    customImageModels.value.push({ key: modelKey, label: label || modelKey, protocol: options.protocol || 'auto' })
    setSelectedModel('image', modelKey)
    return true
  }

  const addCustomVideoModel = (modelKey, label = '') => {
    if (!modelKey || customVideoModels.value.some((model) => model.key === modelKey)) {
      return false
    }

    customVideoModels.value.push({ key: modelKey, label: label || modelKey })
    setSelectedModel('video', modelKey)
    return true
  }

  const removeCustomChatModel = (modelKey) => {
    const index = customChatModels.value.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    customChatModels.value.splice(index, 1)
    if (selectedChatModel.value === modelKey) {
      setSelectedModel('chat', availableChatModels.value[0]?.key || getProviderChatFallback(), { mode: 'auto' })
    }
    return true
  }

  const removeCustomImageModel = (modelKey) => {
    const index = customImageModels.value.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    customImageModels.value.splice(index, 1)
    if (selectedImageModel.value === modelKey) {
      setSelectedModel('image', availableImageModels.value[0]?.key || (REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL), { mode: 'auto' })
    }
    return true
  }

  const removeCustomVideoModel = (modelKey) => {
    const index = customVideoModels.value.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    customVideoModels.value.splice(index, 1)
    if (selectedVideoModel.value === modelKey) {
      setSelectedModel('video', availableVideoModels.value[0]?.key || getProviderVideoFallback(), { mode: 'auto' })
    }
    return true
  }

  const getChatModel = (key) => allChatModels.value.find((model) => model.key === key)
  const getImageModel = (key) => allImageModels.value.find((model) => model.key === key)
  const getVideoModel = (key) => allVideoModels.value.find((model) => model.key === key)

  const setModelRoutingMode = (group, mode) => {
    const normalizedGroup = MODEL_ROUTING_GROUPS.includes(group) ? group : ''
    if (!normalizedGroup || !['auto', 'locked'].includes(mode)) return false
    modelRoutingModes.value[normalizedGroup] = mode
    return true
  }

  const setSelectedModel = (group, modelKey, { mode = 'locked' } = {}) => {
    const normalizedGroup = MODEL_ROUTING_GROUPS.includes(group) ? group : ''
    if (!normalizedGroup) return false
    const fields = {
      chat: selectedChatModel,
      image: selectedImageModel,
      video: selectedVideoModel
    }
    fields[normalizedGroup].value = String(modelKey || '').trim()
    setModelRoutingMode(normalizedGroup, fields[normalizedGroup].value ? mode : 'auto')
    return true
  }

  const isModelLocked = group => modelRoutingModes.value[group] === 'locked'

  const getImageModelProtocol = (key) => getImageModel(key)?.resolvedProtocol || inferImageProtocol(key)

  const updateCustomImageModelProtocol = (modelKey, protocol = 'auto') => {
    const normalizedProtocol = ['auto', 'image', 'chat'].includes(protocol) ? protocol : 'auto'
    const updateList = (list) => {
      const model = list.find((item) => item.key === modelKey)
      if (!model) return false
      model.protocol = normalizedProtocol
      return true
    }

    if (updateList(customImageModels.value)) return true

    for (const models of Object.values(customImageModelsByProvider.value)) {
      if (Array.isArray(models) && updateList(models)) {
        return true
      }
    }

    return false
  }

  const getImageEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.image || '/images/generations'
    return joinApiEndpoint(currentImageBaseUrl.value, endpoint)
  }

  const getImageEditEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.imageEdit || '/images/edits'
    return joinApiEndpoint(currentImageBaseUrl.value, endpoint)
  }

  const getVideoEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.video || '/videos'
    return joinApiEndpoint(currentVideoBaseUrl.value, endpoint)
  }

  const getVideoTaskEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.videoQuery || providerConfig.value.endpoints?.video || '/videos'
    return joinApiEndpoint(currentVideoBaseUrl.value, endpoint)
  }

  const getChatEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.chat || '/chat/completions'
    return joinApiEndpoint(currentChatBaseUrl.value, endpoint)
  }

  const getModelsByProvider = (provider) => ({
    chat: [
      ...(REQUIRE_USER_MODELS ? [] : CHAT_MODELS.filter((model) => isModelSupported(model, provider)).map((model) => ({
        ...model,
        isCustom: false
      }))),
      ...(customChatModelsByProvider.value[provider] || []).map((model) => buildCustomChatModel(model, provider))
    ],
    image: [
      ...(REQUIRE_USER_MODELS ? [] : IMAGE_MODELS.filter((model) => isModelSupported(model, provider)).map((model) => ({
        ...model,
        isCustom: false
      }))),
      ...(customImageModelsByProvider.value[provider] || []).map((model) => buildCustomImageModel(model, provider))
    ],
    video: [
      ...(REQUIRE_USER_MODELS ? [] : VIDEO_MODELS.filter((model) => isModelSupported(model, provider)).map((model) => ({
        ...model,
        isCustom: false
      }))),
      ...(customVideoModelsByProvider.value[provider] || []).map((model) => buildCustomVideoModel(model, provider))
    ]
  })

  const addCustomChatModelByProvider = (modelKey, provider, label = '') => {
    if (!modelKey) {
      return false
    }

    if (!customChatModelsByProvider.value[provider]) {
      customChatModelsByProvider.value[provider] = []
    }

    if (customChatModelsByProvider.value[provider].some((model) => model.key === modelKey)) {
      return false
    }

    customChatModelsByProvider.value[provider].push({ key: modelKey, label: label || modelKey })
    if (provider === currentProvider.value) setSelectedModel('chat', modelKey)
    return true
  }

  const addCustomImageModelByProvider = (modelKey, provider, label = '', options = {}) => {
    if (!modelKey) {
      return false
    }

    if (!customImageModelsByProvider.value[provider]) {
      customImageModelsByProvider.value[provider] = []
    }

    if (customImageModelsByProvider.value[provider].some((model) => model.key === modelKey)) {
      return false
    }

    customImageModelsByProvider.value[provider].push({ key: modelKey, label: label || modelKey, protocol: options.protocol || 'auto' })
    if (provider === currentProvider.value) setSelectedModel('image', modelKey)
    return true
  }

  const addCustomVideoModelByProvider = (modelKey, provider, label = '') => {
    if (!modelKey) {
      return false
    }

    if (!customVideoModelsByProvider.value[provider]) {
      customVideoModelsByProvider.value[provider] = []
    }

    if (customVideoModelsByProvider.value[provider].some((model) => model.key === modelKey)) {
      return false
    }

    customVideoModelsByProvider.value[provider].push({ key: modelKey, label: label || modelKey })
    if (provider === currentProvider.value) setSelectedModel('video', modelKey)
    return true
  }

  const upsertProviderModel = (collection, provider, model) => {
    if (!collection.value[provider]) {
      collection.value[provider] = []
    }

    const existingIndex = collection.value[provider].findIndex((item) => item.key === model.key)
    if (existingIndex >= 0) {
      collection.value[provider][existingIndex] = {
        ...collection.value[provider][existingIndex],
        ...model
      }
      return false
    }

    collection.value[provider].push(model)
    return true
  }

  const syncModelsFromProvider = (provider, discoveredModels = []) => {
    const stats = { chat: 0, image: 0, video: 0, skipped: 0, deduplicated: 0 }
    const models = Array.isArray(discoveredModels) ? discoveredModels : []

    // Dedup by canonical key to avoid version-variant duplicates
    const seenCanonicalKeys = new Set()

    models.forEach((rawModel) => {
      const key = rawModel?.id || rawModel?.key
      if (!key) {
        stats.skipped += 1
        return
      }

      // Dedup by canonical key
      const canonical = canonicalModelKey(key)
      if (seenCanonicalKeys.has(canonical)) {
        stats.deduplicated += 1
        return
      }
      seenCanonicalKeys.add(canonical)

      const endpointTypes = normalizeEndpointTypes(rawModel)
      const baseModel = {
        key,
        label: rawModel.label || rawModel.name || key,
        endpointTypes,
        ownedBy: rawModel.owned_by || rawModel.ownedBy || '',
        ...pickModelIntelligence(rawModel)
      }
      const capability = inferDiscoveredCapability(rawModel)

      if (capability === 'chat') {
        const added = upsertProviderModel(customChatModelsByProvider, provider, baseModel)
        if (added) stats.chat += 1
        return
      }

      if (capability === 'image') {
        const isEditModel = /edit/i.test(key)
        const added = upsertProviderModel(customImageModelsByProvider, provider, {
          ...baseModel,
          protocol: inferImageProtocol(key),
          sizes: inferImageSizes(key),
          defaultParams: { size: inferImageDefaultSize(key), quality: 'standard', style: 'vivid' },
          requiresReference: isEditModel
        })
        if (added) stats.image += 1
        return
      }

      if (capability === 'video') {
        const added = upsertProviderModel(customVideoModelsByProvider, provider, {
          ...baseModel,
          endpointFamily: inferVideoEndpointFamily(key, endpointTypes),
          resolutions: ['720p', '1080p'],
          defaultResolution: '720p',
          defaultParams: { ratio: '16:9', duration: 5, resolution: '720p' }
        })
        if (added) stats.video += 1
        return
      }

      stats.skipped += 1
    })

    if (!availableChatModels.value.some((model) => model.key === selectedChatModel.value)) {
      setSelectedModel('chat', availableChatModels.value[0]?.key || getProviderChatFallback(provider), { mode: 'auto' })
    }
    if (!availableImageModels.value.some((model) => model.key === selectedImageModel.value)) {
      setSelectedModel('image', availableImageModels.value[0]?.key || (REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL), { mode: 'auto' })
    }
    if (!availableVideoModels.value.some((model) => model.key === selectedVideoModel.value)) {
      setSelectedModel('video', availableVideoModels.value[0]?.key || getProviderVideoFallback(provider), { mode: 'auto' })
    }

    return stats
  }

  const removeCustomChatModelByProvider = (modelKey, provider) => {
    const models = customChatModelsByProvider.value[provider]
    if (!models) {
      return false
    }

    const index = models.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    models.splice(index, 1)
    if (provider === currentProvider.value && selectedChatModel.value === modelKey) {
      setSelectedModel('chat', availableChatModels.value[0]?.key || getProviderChatFallback(provider), { mode: 'auto' })
    }
    return true
  }

  const removeCustomImageModelByProvider = (modelKey, provider) => {
    const models = customImageModelsByProvider.value[provider]
    if (!models) {
      return false
    }

    const index = models.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    models.splice(index, 1)
    if (provider === currentProvider.value && selectedImageModel.value === modelKey) {
      setSelectedModel('image', availableImageModels.value[0]?.key || (REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL), { mode: 'auto' })
    }
    return true
  }

  const removeCustomVideoModelByProvider = (modelKey, provider) => {
    const models = customVideoModelsByProvider.value[provider]
    if (!models) {
      return false
    }

    const index = models.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    models.splice(index, 1)
    if (provider === currentProvider.value && selectedVideoModel.value === modelKey) {
      setSelectedModel('video', availableVideoModels.value[0]?.key || getProviderVideoFallback(provider), { mode: 'auto' })
    }
    return true
  }

  const clearCustomModels = () => {
    customChatModels.value = []
    customImageModels.value = []
    customVideoModels.value = []
    setSelectedModel('chat', getProviderChatFallback(), { mode: 'auto' })
    setSelectedModel('image', REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL, { mode: 'auto' })
    setSelectedModel('video', getProviderVideoFallback(), { mode: 'auto' })
    modelRoutingModes.value = normalizeModelRoutingModes({})
  }

  watch(customChatModels, (value) => setStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS, value), { deep: true })
  watch(customImageModels, (value) => setStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS, value), { deep: true })
  watch(customVideoModels, (value) => setStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS, value), { deep: true })

  watch(customChatModelsByProvider, (value) => setStoredJson(STORAGE_KEYS.CUSTOM_CHAT_MODELS_BY_PROVIDER, value), {
    deep: true
  })
  watch(customImageModelsByProvider, (value) => setStoredJson(STORAGE_KEYS.CUSTOM_IMAGE_MODELS_BY_PROVIDER, value), {
    deep: true
  })
  watch(customVideoModelsByProvider, (value) => setStoredJson(STORAGE_KEYS.CUSTOM_VIDEO_MODELS_BY_PROVIDER, value), {
    deep: true
  })

  watch(selectedChatModel, (value) => setStored(STORAGE_KEYS.SELECTED_CHAT_MODEL, value))
  watch(selectedImageModel, (value) => setStored(STORAGE_KEYS.SELECTED_IMAGE_MODEL, value))
  watch(selectedVideoModel, (value) => setStored(STORAGE_KEYS.SELECTED_VIDEO_MODEL, value))
  watch(modelRoutingModes, (value) => setStoredJson(STORAGE_KEYS.MODEL_ROUTING_MODES, value), { deep: true })

  watch(apiKeysByProvider, (value) => setStoredJson(STORAGE_KEYS.API_KEYS_BY_PROVIDER, value), { deep: true })
  watch(baseUrlsByProvider, (value) => setStoredJson(STORAGE_KEYS.BASE_URLS_BY_PROVIDER, value), { deep: true })
  watch(currentProvider, (value) => setStored(STORAGE_KEYS.PROVIDER, value), { immediate: true })
  watch(currentProvider, (provider) => {
    const isSelectedModelSupported = availableChatModels.value.some((model) => model.key === selectedChatModel.value)
    if (!isSelectedModelSupported) {
      setSelectedModel('chat', availableChatModels.value[0]?.key || getProviderChatFallback(provider), { mode: 'auto' })
    }
  }, { immediate: true })
  watch(currentProvider, () => {
    const isSelectedModelSupported = availableImageModels.value.some((model) => model.key === selectedImageModel.value)
    if (!isSelectedModelSupported) {
      setSelectedModel('image', availableImageModels.value[0]?.key || (REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL), { mode: 'auto' })
    }
  }, { immediate: true })
  watch(currentProvider, (provider) => {
    const isSelectedModelSupported = availableVideoModels.value.some((model) => model.key === selectedVideoModel.value)
    if (!isSelectedModelSupported) {
      setSelectedModel('video', availableVideoModels.value[0]?.key || getProviderVideoFallback(provider), { mode: 'auto' })
    }
  }, { immediate: true })

  return {
    currentProvider,
    providerList,
    providerConfig,
    providerLabel,
    setProvider,
    clearProvider,
    adaptRequest,
    adaptResponse,
    allChatModels,
    allImageModels,
    allVideoModels,
    availableChatModels,
    availableImageModels,
    availableVideoModels,
    imageModelOptions,
    videoModelOptions,
    chatModelOptions,
    allImageModelOptions,
    allVideoModelOptions,
    allChatModelOptions,
    selectedChatModel,
    selectedImageModel,
    selectedVideoModel,
    modelRoutingModes,
    setModelRoutingMode,
    setSelectedModel,
    isModelLocked,
    customChatModels,
    customImageModels,
    customVideoModels,
    customChatModelsByProvider,
    customImageModelsByProvider,
    customVideoModelsByProvider,
    addCustomChatModel,
    addCustomImageModel,
    addCustomVideoModel,
    removeCustomChatModel,
    removeCustomImageModel,
    removeCustomVideoModel,
    addCustomChatModelByProvider,
    addCustomImageModelByProvider,
    addCustomVideoModelByProvider,
    syncModelsFromProvider,
    removeCustomChatModelByProvider,
    removeCustomImageModelByProvider,
    removeCustomVideoModelByProvider,
    getChatModel,
    getImageModel,
    getVideoModel,
    getImageModelProtocol,
    updateCustomImageModelProtocol,
    getImageEndpoint,
    getImageEditEndpoint,
    getVideoEndpoint,
    getVideoTaskEndpoint,
    getChatEndpoint,
    getModelsByProvider,
    getProviderChatFallback,
    clearCustomModels,
    currentApiKey,
    currentChatApiKey,
    currentImageApiKey,
    currentVideoApiKey,
    hasAnyApiKey,
    currentBaseUrl,
    currentChatBaseUrl,
    currentImageBaseUrl,
    currentVideoBaseUrl,
    apiKeysByProvider,
    baseUrlsByProvider,
    getApiKeyByProvider,
    getBaseUrlByProvider,
    setApiKeyByProvider,
    setBaseUrlByProvider,
    clearApiConfigByProvider,
    createApiSettingsSnapshot,
    restoreApiSettingsSnapshot
  }
})
