/**
 * HTTP request utility.
 */

import axios from 'axios'
import { getRuntimeApiKey, getRuntimeBaseUrl, getRuntimeProvider } from './runtimeConfig'
import { addRuntimeLog } from '@/stores/canvas'
import { normalizeProviderEndpoint } from './providerEndpoint'

/**
 * Normalize a base URL: strip trailing slashes, add protocol, validate format.
 */
/**
 * Normalize a base URL: strip trailing slashes, add protocol, and
 * strip known API endpoint paths to recover the true base URL.
 */
export function normalizeBaseUrl(url) {
  return normalizeProviderEndpoint(url).baseUrl || ''
}

/**
 * Get a Chinese error message for common HTTP status codes.
 */
export function getChineseHttpError(status, message) {
  if (status === 401) return 'API Key 无效或已过期'
  if (status === 403) return '没有访问权限，请检查 API Key 和账户状态'
  if (status === 404) return '模型不存在或暂不可用，请检查模型名称'
  if (status === 400) return '参数不合法，请检查尺寸、数量等参数是否在支持范围内'
  if (status === 429) return '请求过于频繁，请稍后再试'
  if (status === 451) return '内容被安全策略拦截，请修改提示词'
  if (status === 500) return '服务端内部错误，请稍后重试'
  if (status === 502 || status === 503) return '服务暂时不可用，请稍后重试'
  return message || '请求失败'
}

const getNow = () => {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now()
  }
  return Date.now()
}

const getRequestDuration = (config) => {
  const startedAt = config?.metadata?.startedAt
  if (!startedAt) return null
  return Math.max(0, Math.round(getNow() - startedAt))
}

const formatDuration = (durationMs) => {
  if (durationMs === null || durationMs === undefined) return ''
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

const instance = axios.create({
  baseURL: '/',
  timeout: 240000
})

instance.interceptors.request.use(
  (config) => {
    config.metadata = {
      ...(config.metadata || {}),
      startedAt: getNow()
    }

    const currentProvider = getRuntimeProvider()
    const capability = config.metadata?.capability || 'default'
    const apiKey = getRuntimeApiKey(currentProvider, capability)
    const isAbsoluteUrl = /^https?:\/\//i.test(config.url || '')

    if (!isAbsoluteUrl) {
      config.baseURL = getRuntimeBaseUrl(currentProvider, capability)
    }

    const noAuthEndpoints = ['/model/page', '/model/fullName', '/model/types']
    const isNoAuth = noAuthEndpoints.some((endpoint) => config.url?.includes(endpoint))

    if (apiKey && !isNoAuth) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${apiKey}`
    }

    addRuntimeLog('info', `请求开始：${String(config.method || 'GET').toUpperCase()} ${config.url}`, {
      capability,
      provider: currentProvider
    })

    return config
  },
  (error) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  }
)

instance.interceptors.response.use(
  (response) => {
    const { code, message } = response.data || {}

    if (response.config.responseType === 'stream') {
      return response.data
    }

    if (response.data instanceof Blob) {
      return response.data
    }

    if (code === 200 || response.status === 200) {
      const durationMs = getRequestDuration(response.config)
      addRuntimeLog('success', `请求成功：${response.config?.url || ''}${durationMs !== null ? `（${formatDuration(durationMs)}）` : ''}`, {
        status: response.status,
        durationMs
      })
      return response.data
    }

    const durationMs = getRequestDuration(response.config)
    addRuntimeLog('error', `请求失败：${message || 'Request failed'}`, {
      url: response.config?.url,
      status: response.status,
      durationMs
    })
    if (response.config?.metadata?.capability !== 'image') {
      window.$message?.error(message || 'Request failed')
    }
    return Promise.reject(response.data)
  },
  (error) => {
    const { response } = error
    const capability = error.config?.metadata?.capability || 'default'

    if (response) {
      const { status, data } = response
      const message = data?.message || data?.error?.message || error.message
      const durationMs = getRequestDuration(error.config)
      addRuntimeLog('error', `请求失败：${message || 'Request failed'}`, {
        url: error.config?.url,
        status,
        durationMs
      })

      // Image/video generation: silent here — useApi.js handles friendly Chinese bubbles + fallback.
      if (capability !== 'image' && capability !== 'video') {
        window.$message?.error(getChineseHttpError(status, message))
      }
    } else {
      const durationMs = getRequestDuration(error.config)
      addRuntimeLog('error', `网络异常：${error.code === 'ECONNABORTED' ? '请求超时' : (error.message || 'Network error')}`, {
        url: error.config?.url,
        code: error.code,
        durationMs
      })
      if (capability !== 'image' && capability !== 'video') {
        window.$message?.error(error.code === 'ECONNABORTED' ? '请求超时，请检查网络连接' : (error.message || '网络异常'))
      }
    }

    return Promise.reject(error)
  }
)

export const setBaseUrl = (url) => {
  instance.defaults.baseURL = url
}

export const getBaseUrl = () => instance.defaults.baseURL

export default instance
