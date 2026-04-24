/**
 * Provider hook.
 */

import { ref, computed } from 'vue'
import { PROVIDERS, getProviderList, getDefaultProvider, getProviderConfig } from '@/config/providers'
import { DISTRIBUTION_CONFIG } from '@/config/distribution'

const STORAGE_KEY = 'api-provider'

const getStored = (key, defaultValue = '') => {
  try {
    return localStorage.getItem(key) || defaultValue
  } catch {
    return defaultValue
  }
}

const setStored = (key, value) => {
  try {
    localStorage.setItem(key, value)
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

const resolveProvider = () => {
  const defaultProvider = DISTRIBUTION_CONFIG.api.defaultProvider || getDefaultProvider()

  if (DISTRIBUTION_CONFIG.api.lockProvider) {
    return defaultProvider
  }

  const storedProvider = getStored(STORAGE_KEY, defaultProvider)
  return PROVIDERS[storedProvider] ? storedProvider : defaultProvider
}

export const useProvider = () => {
  const currentProvider = ref(resolveProvider())
  const providerList = getProviderList()
  const providerConfig = computed(() => getProviderConfig(currentProvider.value))
  const providerLabel = computed(() => providerConfig.value.label || currentProvider.value)

  const setProvider = (provider) => {
    const nextProvider = DISTRIBUTION_CONFIG.api.lockProvider
      ? (DISTRIBUTION_CONFIG.api.defaultProvider || getDefaultProvider())
      : provider

    if (PROVIDERS[nextProvider]) {
      currentProvider.value = nextProvider
      setStored(STORAGE_KEY, nextProvider)
    }
  }

  const clearProvider = () => {
    currentProvider.value = DISTRIBUTION_CONFIG.api.defaultProvider || getDefaultProvider()
    removeStored(STORAGE_KEY)
  }

  const adaptRequest = (type, params) => {
    const adapter = providerConfig.value.requestAdapter?.[type]
    return adapter ? adapter(params) : params
  }

  const adaptResponse = (type, response) => {
    const adapter = providerConfig.value.responseAdapter?.[type]
    return adapter ? adapter(response) : response
  }

  return {
    currentProvider,
    providerList,
    providerConfig,
    providerLabel,
    setProvider,
    clearProvider,
    adaptRequest,
    adaptResponse
  }
}
