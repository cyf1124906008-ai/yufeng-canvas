/**
 * Image API | 图片生成 API
 */

import { request } from '@/utils'
import { getRuntimeApiKey, getRuntimeBaseUrl, getRuntimeProvider } from '@/utils/runtimeConfig'

const DATA_URL_PATTERN = /^data:(.+?);base64,(.+)$/

const dataUrlToBlob = (dataUrl) => {
  const match = dataUrl.match(DATA_URL_PATTERN)
  if (!match) {
    throw new Error('Unsupported data URL format')
  }

  const [, mimeType, encoded] = match
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: mimeType })
}

const fileExtensionFromType = (mimeType, fallback = 'png') => {
  if (!mimeType) {
    return fallback
  }

  const extension = mimeType.split('/')[1]
  return extension || fallback
}

export const normalizeImageSourceToBlob = async (imageSource, index = 0) => {
  if (!imageSource) {
    throw new Error('Missing image source')
  }

  if (imageSource instanceof File || imageSource instanceof Blob) {
    return imageSource
  }

  if (typeof imageSource !== 'string') {
    throw new Error(`Unsupported image source at index ${index}`)
  }

  if (imageSource.startsWith('data:')) {
    return dataUrlToBlob(imageSource)
  }

  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    const response = await fetch(imageSource)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`)
    }

    return response.blob()
  }

  throw new Error(`Unsupported image source at index ${index}`)
}

export const buildImageEditFormData = async (params) => {
  const formData = new FormData()
  const imageSources = Array.isArray(params.image) ? params.image : [params.image]

  if (!imageSources.length || !imageSources[0]) {
    throw new Error('Image edit requires at least one source image')
  }

  for (const [index, imageSource] of imageSources.entries()) {
    const blob = await normalizeImageSourceToBlob(imageSource, index)
    const extension = fileExtensionFromType(blob.type)
    formData.append('image[]', blob, `reference-${index + 1}.${extension}`)
  }

  Object.entries(params).forEach(([key, value]) => {
    if (key === 'image' || value === undefined || value === null || value === '') {
      return
    }

    formData.append(key, String(value))
  })

  return formData
}

export const generateImageWithChat = async (data, options = {}) => {
  const { endpoint = '/v1/chat/completions', _taskId } = options

  const ipc = window.desktopApp?.imageGen
  if (ipc) {
    const provider = getRuntimeProvider()
    const apiKey = getRuntimeApiKey(provider, 'image')
    const baseUrl = getRuntimeBaseUrl(provider, 'image')
    const fullUrl = /^https?:\/\//.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`

    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    return ipcGenerateImage(fullUrl, headers, data, _taskId || `chat_img_${Date.now()}`)
  }

  return request({
    url: endpoint,
    method: 'post',
    data,
    headers: { 'Content-Type': 'application/json' },
    metadata: { capability: 'image' }
  })
}

/**
 * Send a FormData (image-edit) request through Electron main process.
 * The main process keeps the request alive even if renderer crashes.
 */
const ipcFormDataGenerate = async (fullUrl, authHeaders, formData, taskId) => {
  const ipc = window.desktopApp?.imageGen
  if (!ipc) return null

  // Convert FormData to a multipart serialisable form for IPC transport
  const parts = []
  for (const [key, value] of formData.entries()) {
    if (value instanceof Blob) {
      const buffer = await value.arrayBuffer()
      parts.push({
        key,
        type: 'blob',
        mimeType: value.type || 'application/octet-stream',
        filename: value.name || 'file',
        data: Buffer.from(buffer).toString('base64')
      })
    } else {
      parts.push({ key, type: 'text', value: String(value) })
    }
  }

  const { ipcImageGenerate } = await import('@/integrations/imageGeneration/client')
  const result = await ipcImageGenerate({
    url: fullUrl,
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(parts),
    taskId,
    isFormData: true
  })

  if (!result) return null

  if (!result.ok) {
    const error = new Error(result.error)
    error.status = result.status
    error.response = { status: result.status, data: result.data }
    throw error
  }

  return result.data
}

/**
 * Reconstruct FormData from IPC-serialised parts in main process result.
 * (Used by main process to rebuild the request body.)
 */

/**
 * Route a JSON image generation request through Electron main process.
 * Falls back to renderer-side request when not in Electron desktop.
 */
const ipcGenerateImage = async (fullUrl, headers, body, taskId) => {
  const ipc = window.desktopApp?.imageGen
  if (!ipc) return null

  const { ipcImageGenerate } = await import('@/integrations/imageGeneration/client')

  const result = await ipcImageGenerate({
    url: fullUrl,
    method: 'POST',
    headers,
    body,
    taskId
  })

  if (!result) return null

  if (!result.ok) {
    const error = new Error(result.error)
    error.status = result.status
    error.response = { status: result.status, data: result.data }
    throw error
  }

  return result.data
}

const parseJsonSafely = async (response) => {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

const requestImageEdit = async (endpoint, formData, _taskId) => {
  const provider = getRuntimeProvider()
  const apiKey = getRuntimeApiKey(provider, 'image')
  const resolvedEndpoint = /^https?:\/\//.test(endpoint)
    ? endpoint
    : `${getRuntimeBaseUrl(provider, 'image')}${endpoint}`

  // Route FormData through Electron main process when available
  const ipc = window.desktopApp?.imageGen
  if (ipc) {
    const authHeaders = {}
    if (apiKey) authHeaders.Authorization = `Bearer ${apiKey}`

    const result = await ipcFormDataGenerate(resolvedEndpoint, authHeaders, formData, _taskId || `edit_${Date.now()}`)
    if (result !== null) return result
  }

  // Fallback: renderer-side fetch
  const headers = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(resolvedEndpoint, {
    method: 'POST',
    headers,
    body: formData
  })

  const payload = await parseJsonSafely(response)

  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || `Request failed with status ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.response = {
      status: response.status,
      data: payload
    }
    throw error
  }

  return payload
}

// 生成图片
export const generateImage = async (data, options = {}) => {
  const { endpoint = '/images/generations', _taskId } = options

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return requestImageEdit(endpoint, data, _taskId)
  }

  // Route through main process when in Electron desktop for stability
  const ipc = window.desktopApp?.imageGen
  if (ipc) {
    const provider = getRuntimeProvider()
    const apiKey = getRuntimeApiKey(provider, 'image')
    const baseUrl = getRuntimeBaseUrl(provider, 'image')
    const fullUrl = /^https?:\/\//.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`

    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    return ipcGenerateImage(fullUrl, headers, data, _taskId || `img_${Date.now()}`)
  }

  return request({
    url: endpoint,
    method: 'post',
    data,
    headers: {},
    metadata: { capability: 'image' }
  })
}
