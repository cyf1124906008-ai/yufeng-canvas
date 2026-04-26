/**
 * HTTP request utility.
 */

import axios from 'axios'
import { getRuntimeApiKey, getRuntimeBaseUrl, getRuntimeProvider } from './runtimeConfig'
import { addRuntimeLog } from '@/stores/canvas'

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
      config.baseURL = getRuntimeBaseUrl(currentProvider)
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
    window.$message?.error(message || 'Request failed')
    return Promise.reject(response.data)
  },
  (error) => {
    const { response } = error

    if (response) {
      const { status, data } = response
      const message = data?.message || data?.error?.message || error.message
      const durationMs = getRequestDuration(error.config)
      addRuntimeLog('error', `请求失败：${message || 'Request failed'}`, {
        url: error.config?.url,
        status,
        durationMs
      })

      if (status === 401) {
        window.$message?.error('API Key invalid or expired')
      } else if (status === 429) {
        window.$message?.error('Too many requests, please try again later')
      } else {
        window.$message?.error(message || 'Request failed')
      }
    } else {
      const durationMs = getRequestDuration(error.config)
      addRuntimeLog('error', `网络异常：${error.code === 'ECONNABORTED' ? '请求超时' : (error.message || 'Network error')}`, {
        url: error.config?.url,
        code: error.code,
        durationMs
      })
      window.$message?.error(error.message || 'Network error')
    }

    return Promise.reject(error)
  }
)

export const setBaseUrl = (url) => {
  instance.defaults.baseURL = url
}

export const getBaseUrl = () => instance.defaults.baseURL

export default instance
