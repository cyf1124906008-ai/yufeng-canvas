/**
 * Distribution configuration
 *
 * This file centralizes product-style defaults for packaged builds.
 * Edit these values when you want to ship a preconfigured version
 * that only requires end users to enter their own API key.
 */

export const DISTRIBUTION_CONFIG = {
  branding: {
    appName: 'YUFENG Canvas',
    apiKeyHelpUrl: 'https://dataeyes.ai/?promoter_code=nqg9bv83',
    githubUrl: 'https://github.com/cyf1124906008-ai/yufeng-canvas'
  },
  api: {
    defaultProvider: 'dataeyes',
    lockProvider: false,
    hideProviderSelect: false,
    lockBaseUrl: false,
    hideBaseUrlInput: false,
    presetBaseUrls: {
      dataeyes: 'https://cloud.dataeyes.ai'
    }
  },
  models: {
    requireUserModels: true
  }
}

export const getApiKeyHelpUrl = () => DISTRIBUTION_CONFIG.branding.apiKeyHelpUrl
export const getGithubUrl = () => DISTRIBUTION_CONFIG.branding.githubUrl

export const getPresetBaseUrl = (provider) => {
  const baseUrl = DISTRIBUTION_CONFIG.api.presetBaseUrls?.[provider]
  return typeof baseUrl === 'string' ? baseUrl.trim() : ''
}

export const getPresetApiKey = (provider) => {
  const apiKey = DISTRIBUTION_CONFIG.api.presetApiKeys?.[provider]
  return typeof apiKey === 'string' ? apiKey.trim() : ''
}
