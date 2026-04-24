/**
 * Runtime config helpers for persisted API settings.
 */

import { getDefaultBaseUrl } from '@/config/providers'
import { DISTRIBUTION_CONFIG, getPresetApiKey, getPresetBaseUrl } from '@/config/distribution'

const STORAGE_KEYS = {
  provider: 'api-provider',
  apiKeysByProvider: 'api-keys-by-provider',
  baseUrlsByProvider: 'base-urls-by-provider'
}

const API_KEY_CAPABILITIES = ['default', 'chat', 'image', 'video']

const readStorage = (key, defaultValue = '') => {
  try {
    return localStorage.getItem(key) || defaultValue
  } catch {
    return defaultValue
  }
}

const readJsonStorage = (key, defaultValue = {}) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

const normalizeApiKeyEntry = (entry) => {
  if (typeof entry === 'string') {
    return {
      default: entry,
      chat: '',
      image: '',
      video: ''
    }
  }

  const normalized = {
    default: '',
    chat: '',
    image: '',
    video: ''
  }

  if (!entry || typeof entry !== 'object') {
    return normalized
  }

  API_KEY_CAPABILITIES.forEach((capability) => {
    const value = entry[capability]
    normalized[capability] = typeof value === 'string' ? value.trim() : ''
  })

  return normalized
}

export const getRuntimeProvider = () => {
  const fallbackProvider = DISTRIBUTION_CONFIG.api.defaultProvider || 'dataeyes'

  if (DISTRIBUTION_CONFIG.api.lockProvider) {
    return fallbackProvider
  }

  return readStorage(STORAGE_KEYS.provider, fallbackProvider)
}

export const getRuntimeApiKeyEntry = (provider = getRuntimeProvider()) => {
  const apiKeysByProvider = readJsonStorage(STORAGE_KEYS.apiKeysByProvider)
  const normalizedEntry = normalizeApiKeyEntry(apiKeysByProvider[provider])
  const presetApiKey = getPresetApiKey(provider)

  if (!normalizedEntry.default && presetApiKey) {
    normalizedEntry.default = presetApiKey
  }

  return normalizedEntry
}

export const getRuntimeApiKey = (provider = getRuntimeProvider(), capability = 'default') => {
  const normalizedCapability = API_KEY_CAPABILITIES.includes(capability) ? capability : 'default'
  const apiKeyEntry = getRuntimeApiKeyEntry(provider)

  return apiKeyEntry[normalizedCapability] || apiKeyEntry.default || ''
}

export const getRuntimeBaseUrl = (provider = getRuntimeProvider()) => {
  const presetBaseUrl = getPresetBaseUrl(provider)

  if (DISTRIBUTION_CONFIG.api.lockBaseUrl && presetBaseUrl) {
    return presetBaseUrl
  }

  const baseUrlsByProvider = readJsonStorage(STORAGE_KEYS.baseUrlsByProvider)
  return baseUrlsByProvider[provider] || presetBaseUrl || getDefaultBaseUrl(provider)
}
