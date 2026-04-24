/**
 * Image API | 鍥剧墖鐢熸垚 API
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

export const generateImageWithChat = (data, options = {}) => {
  const { endpoint = '/v1/chat/completions' } = options

  return request({
    url: endpoint,
    method: 'post',
    data,
    headers: { 'Content-Type': 'application/json' },
    metadata: { capability: 'image' }
  })
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

const requestImageEdit = async (endpoint, formData) => {
  const provider = getRuntimeProvider()
  const apiKey = getRuntimeApiKey(provider, 'image')
  const resolvedEndpoint = /^https?:\/\//.test(endpoint)
    ? endpoint
    : `${getRuntimeBaseUrl(provider)}${endpoint}`
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
    throw new Error(message)
  }

  return payload
}

// 鐢熸垚鍥剧墖
export const generateImage = (data, options = {}) => {
  const { endpoint = '/images/generations' } = options

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return requestImageEdit(endpoint, data)
  }

  return request({
    url: endpoint,
    method: 'post',
    data,
    headers: {},
    metadata: { capability: 'image' }
  })
}
