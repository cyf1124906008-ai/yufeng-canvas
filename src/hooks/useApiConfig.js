/**
 * API configuration hook backed by the Pinia model store.
 */

import { computed } from 'vue'
import { useModelStore } from '@/stores/pinia'

export const useApiConfig = () => {
  const modelStore = useModelStore()

  const apiKey = computed({
    get: () => modelStore.currentApiKey,
    set: (value) => {
      modelStore.setApiKeyByProvider(modelStore.currentProvider, value, 'default')
    }
  })

  const baseUrl = computed({
    get: () => modelStore.currentBaseUrl,
    set: (value) => {
      modelStore.setBaseUrlByProvider(modelStore.currentProvider, value)
    }
  })

  const isConfigured = computed(() => modelStore.hasAnyApiKey)

  const setApiKey = (value) => {
    modelStore.setApiKeyByProvider(modelStore.currentProvider, value, 'default')
  }

  const setBaseUrl = (value) => {
    modelStore.setBaseUrlByProvider(modelStore.currentProvider, value)
  }

  const configure = ({ apiKey: nextApiKey, baseUrl: nextBaseUrl } = {}) => {
    if (nextApiKey !== undefined) {
      setApiKey(nextApiKey)
    }

    if (nextBaseUrl !== undefined) {
      setBaseUrl(nextBaseUrl)
    }
  }

  const clear = () => {
    modelStore.clearApiConfigByProvider(modelStore.currentProvider)
  }

  return {
    apiKey,
    baseUrl,
    isConfigured,
    setApiKey,
    setBaseUrl,
    configure,
    clear
  }
}
