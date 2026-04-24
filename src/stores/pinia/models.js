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

const STORAGE_KEYS = {
  PROVIDER: 'api-provider',
  CUSTOM_CHAT_MODELS: 'custom-chat-models',
  CUSTOM_IMAGE_MODELS: 'custom-image-models',
  CUSTOM_VIDEO_MODELS: 'custom-video-models',
  SELECTED_CHAT_MODEL: 'selected-chat-model',
  SELECTED_IMAGE_MODEL: 'selected-image-model',
  SELECTED_VIDEO_MODEL: 'selected-video-model',
  CUSTOM_CHAT_MODELS_BY_PROVIDER: 'custom-chat-models-by-provider',
  CUSTOM_IMAGE_MODELS_BY_PROVIDER: 'custom-image-models-by-provider',
  CUSTOM_VIDEO_MODELS_BY_PROVIDER: 'custom-video-models-by-provider',
  API_KEYS_BY_PROVIDER: 'api-keys-by-provider',
  BASE_URLS_BY_PROVIDER: 'base-urls-by-provider'
}

const API_KEY_CAPABILITIES = ['default', 'chat', 'image', 'video']
const REQUIRE_USER_MODELS = DISTRIBUTION_CONFIG.models?.requireUserModels === true

const inferImageProtocol = (modelKey = '') => {
  const value = String(modelKey).toLowerCase()
  if (value.includes('gemini') && value.includes('image')) {
    return 'chat'
  }
  return 'image'
}

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

const isModelSupported = (model, provider) => {
  if (!model.provider) {
    return true
  }

  return model.provider.includes(provider)
}

const buildCustomChatModel = (model, provider) => ({
  label: model.label || model.key,
  key: model.key,
  isCustom: true,
  ...(provider ? { provider: [provider] } : {})
})

const buildCustomImageModel = (model, provider) => ({
  label: model.label || model.key,
  key: model.key,
  isCustom: true,
  protocol: model.protocol || 'auto',
  resolvedProtocol: model.protocol && model.protocol !== 'auto' ? model.protocol : inferImageProtocol(model.key),
  sizes: model.sizes || ['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'],
  defaultParams: { size: '1024x1024', quality: 'standard', style: 'vivid' },
  ...(provider ? { provider: [provider] } : {})
})

const buildCustomVideoModel = (model, provider) => ({
  label: model.label || model.key,
  key: model.key,
  isCustom: true,
  ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  durs: [{ label: '5 s', key: 5 }, { label: '10 s', key: 10 }],
  defaultParams: { ratio: '16:9', duration: 5 },
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

  const resolveBaseUrl = (provider, baseUrlsByProvider) => {
    const presetBaseUrl = getPresetBaseUrl(provider)

    if (DISTRIBUTION_CONFIG.api.lockBaseUrl && presetBaseUrl) {
      return presetBaseUrl
    }

    return baseUrlsByProvider[provider] || presetBaseUrl || getDefaultBaseUrl(provider)
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

  const apiKeysByProvider = ref(normalizeApiKeysByProvider(getStoredJson(STORAGE_KEYS.API_KEYS_BY_PROVIDER, {})))
  const baseUrlsByProvider = ref(getStoredJson(STORAGE_KEYS.BASE_URLS_BY_PROVIDER, {}))

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
  const currentBaseUrl = computed(() => resolveBaseUrl(currentProvider.value, baseUrlsByProvider.value))

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

  const setBaseUrlByProvider = (provider, baseUrl) => {
    const normalizedBaseUrl = baseUrl?.trim?.() || ''
    const nextBaseUrl = DISTRIBUTION_CONFIG.api.lockBaseUrl
      ? resolveBaseUrl(provider, {})
      : normalizedBaseUrl

    if (nextBaseUrl) {
      baseUrlsByProvider.value[provider] = nextBaseUrl
    } else {
      delete baseUrlsByProvider.value[provider]
    }
  }

  const clearApiConfigByProvider = (provider) => {
    delete apiKeysByProvider.value[provider]
    delete baseUrlsByProvider.value[provider]
  }

  const allChatModels = computed(() => [
    ...(REQUIRE_USER_MODELS ? [] : CHAT_MODELS.map((model) => ({ ...model, isCustom: false }))),
    ...customChatModels.value.map((model) => buildCustomChatModel(model)),
    ...(customChatModelsByProvider.value[currentProvider.value] || []).map((model) =>
      buildCustomChatModel(model, currentProvider.value)
    )
  ].filter((model) => isModelAllowedForCapability(model.key, 'chat')))

  const allImageModels = computed(() => [
    ...(REQUIRE_USER_MODELS ? [] : IMAGE_MODELS.map((model) => ({ ...model, isCustom: false }))),
    ...customImageModels.value.map((model) => buildCustomImageModel(model)),
    ...(customImageModelsByProvider.value[currentProvider.value] || []).map((model) =>
      buildCustomImageModel(model, currentProvider.value)
    )
  ].filter((model) => isModelAllowedForCapability(model.key, 'image')))

  const allVideoModels = computed(() => [
    ...(REQUIRE_USER_MODELS ? [] : VIDEO_MODELS.map((model) => ({ ...model, isCustom: false }))),
    ...customVideoModels.value.map((model) => buildCustomVideoModel(model)),
    ...(customVideoModelsByProvider.value[currentProvider.value] || []).map((model) =>
      buildCustomVideoModel(model, currentProvider.value)
    )
  ].filter((model) => isModelAllowedForCapability(model.key, 'video')))

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
    selectedChatModel.value = modelKey
    return true
  }

  const addCustomImageModel = (modelKey, label = '', options = {}) => {
    if (!modelKey || customImageModels.value.some((model) => model.key === modelKey)) {
      return false
    }

    customImageModels.value.push({ key: modelKey, label: label || modelKey, protocol: options.protocol || 'auto' })
    selectedImageModel.value = modelKey
    return true
  }

  const addCustomVideoModel = (modelKey, label = '') => {
    if (!modelKey || customVideoModels.value.some((model) => model.key === modelKey)) {
      return false
    }

    customVideoModels.value.push({ key: modelKey, label: label || modelKey })
    selectedVideoModel.value = modelKey
    return true
  }

  const removeCustomChatModel = (modelKey) => {
    const index = customChatModels.value.findIndex((model) => model.key === modelKey)
    if (index < 0) {
      return false
    }

    customChatModels.value.splice(index, 1)
    if (selectedChatModel.value === modelKey) {
      selectedChatModel.value = availableChatModels.value[0]?.key || getProviderChatFallback()
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
      selectedImageModel.value = availableImageModels.value[0]?.key || (REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL)
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
      selectedVideoModel.value = availableVideoModels.value[0]?.key || getProviderVideoFallback()
    }
    return true
  }

  const getChatModel = (key) => allChatModels.value.find((model) => model.key === key)
  const getImageModel = (key) => allImageModels.value.find((model) => model.key === key)
  const getVideoModel = (key) => allVideoModels.value.find((model) => model.key === key)

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
    return `${currentBaseUrl.value}${endpoint}`
  }

  const getImageEditEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.imageEdit || '/images/edits'
    return `${currentBaseUrl.value}${endpoint}`
  }

  const getVideoEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.video || '/videos'
    return `${currentBaseUrl.value}${endpoint}`
  }

  const getVideoTaskEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.videoQuery || providerConfig.value.endpoints?.video || '/videos'
    return `${currentBaseUrl.value}${endpoint}`
  }

  const getChatEndpoint = () => {
    const endpoint = providerConfig.value.endpoints?.chat || '/chat/completions'
    return `${currentBaseUrl.value}${endpoint}`
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
    selectedChatModel.value = modelKey
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
    selectedImageModel.value = modelKey
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
    selectedVideoModel.value = modelKey
    return true
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
    return true
  }

  const clearCustomModels = () => {
    customChatModels.value = []
    customImageModels.value = []
    customVideoModels.value = []
    selectedChatModel.value = getProviderChatFallback()
    selectedImageModel.value = REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL
    selectedVideoModel.value = getProviderVideoFallback()
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

  watch(apiKeysByProvider, (value) => setStoredJson(STORAGE_KEYS.API_KEYS_BY_PROVIDER, value), { deep: true })
  watch(baseUrlsByProvider, (value) => setStoredJson(STORAGE_KEYS.BASE_URLS_BY_PROVIDER, value), { deep: true })
  watch(currentProvider, (value) => setStored(STORAGE_KEYS.PROVIDER, value), { immediate: true })
  watch(currentProvider, (provider) => {
    const isSelectedModelSupported = availableChatModels.value.some((model) => model.key === selectedChatModel.value)
    if (!isSelectedModelSupported) {
      selectedChatModel.value = availableChatModels.value[0]?.key || getProviderChatFallback(provider)
    }
  }, { immediate: true })
  watch(currentProvider, () => {
    const isSelectedModelSupported = availableImageModels.value.some((model) => model.key === selectedImageModel.value)
    if (!isSelectedModelSupported) {
      selectedImageModel.value = availableImageModels.value[0]?.key || (REQUIRE_USER_MODELS ? '' : DEFAULT_IMAGE_MODEL)
    }
  }, { immediate: true })
  watch(currentProvider, (provider) => {
    const isSelectedModelSupported = availableVideoModels.value.some((model) => model.key === selectedVideoModel.value)
    if (!isSelectedModelSupported) {
      selectedVideoModel.value = availableVideoModels.value[0]?.key || getProviderVideoFallback(provider)
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
    apiKeysByProvider,
    baseUrlsByProvider,
    getApiKeyByProvider,
    setApiKeyByProvider,
    setBaseUrlByProvider,
    clearApiConfigByProvider
  }
})
