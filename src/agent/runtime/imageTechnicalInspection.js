const DEFAULT_TIMEOUT_MS = 20_000

function createAbortError(reason = '图片技术检查已取消') {
  if (reason instanceof Error) return reason
  const error = new Error(reason)
  error.name = 'AbortError'
  return error
}

function round(value, digits = 2) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function inferMimeType(source = '') {
  const value = String(source)
  const dataMime = value.match(/^data:([^;,]+)/i)?.[1]
  if (dataMime) return dataMime.toLowerCase()

  const extension = value.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  return ({
    avif: 'image/avif',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  })[extension] || 'unknown'
}

function estimateDataUrlBytes(source = '') {
  const match = String(source).match(/^data:[^;,]+;base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return null
  const payload = match[1].replace(/\s/g, '')
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding)
}

function imageOrientation(width, height) {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

function samplePixels(image) {
  if (typeof document === 'undefined') {
    return { sampled: false, reason: 'canvas_unavailable' }
  }

  try {
    const width = Math.min(64, image.naturalWidth || image.width)
    const height = Math.min(64, image.naturalHeight || image.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return { sampled: false, reason: 'canvas_context_unavailable' }

    context.drawImage(image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height).data
    const luminance = []
    let transparentPixels = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255
      if (alpha < 0.01) transparentPixels += 1
      luminance.push(
        (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) * alpha
      )
    }

    const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length
    const variance = luminance.reduce((sum, value) => sum + (value - mean) ** 2, 0) / luminance.length
    const luminanceStdDev = Math.sqrt(variance)
    const transparencyRatio = transparentPixels / luminance.length

    return {
      sampled: true,
      sampleWidth: width,
      sampleHeight: height,
      meanLuminance: round(mean, 1),
      luminanceStdDev: round(luminanceStdDev, 1),
      transparencyRatio: round(transparencyRatio, 4),
      possibleBlankImage: luminanceStdDev < 1.5 || transparencyRatio > 0.995
    }
  } catch (error) {
    // Cross-origin images can be displayed but cannot always be sampled. The
    // dimensions remain trustworthy, so this is a degraded technical check.
    return {
      sampled: false,
      reason: error?.name === 'SecurityError' ? 'cross_origin_pixels_unavailable' : 'pixel_sampling_failed'
    }
  }
}

function loadBrowserImage(source, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.Image !== 'function') {
      reject(new Error('当前环境不支持浏览器 Image 解码'))
      return
    }

    const image = new globalThis.Image()
    let settled = false

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      image.onload = null
      image.onerror = null
      callback(value)
    }
    const onAbort = () => finish(reject, createAbortError(signal?.reason))
    const timer = setTimeout(() => finish(reject, new Error('图片技术检查超时')), timeoutMs)

    if (signal?.aborted) {
      finish(reject, createAbortError(signal.reason))
      return
    }

    signal?.addEventListener?.('abort', onAbort, { once: true })
    image.onload = () => finish(resolve, image)
    image.onerror = () => finish(reject, new Error('图片无法被浏览器解码'))
    image.src = source
  })
}

/**
 * Decode an image in the browser and return metadata only. The source URL is
 * intentionally never copied into the result.
 */
export async function inspectImageTechnical(source, options = {}) {
  if (!source || typeof source !== 'string') throw new Error('图片技术检查需要有效的图片源')

  const image = await loadBrowserImage(source, options)
  const width = Number(image.naturalWidth || image.width || 0)
  const height = Number(image.naturalHeight || image.height || 0)
  if (!width || !height) throw new Error('图片解码成功但尺寸无效')

  const shortestSide = Math.min(width, height)
  const warnings = []
  if (shortestSide < 512) warnings.push('low_resolution')

  const pixelSample = samplePixels(image)
  if (pixelSample.possibleBlankImage) warnings.push('possible_blank_image')
  if (!pixelSample.sampled) warnings.push(pixelSample.reason)

  return {
    decoded: true,
    width,
    height,
    aspectRatio: round(width / height, 4),
    orientation: imageOrientation(width, height),
    pixelCount: width * height,
    megapixels: round(width * height / 1_000_000, 2),
    mimeType: inferMimeType(source),
    estimatedBytes: estimateDataUrlBytes(source),
    pixelSample,
    warnings
  }
}

export {
  DEFAULT_TIMEOUT_MS,
  estimateDataUrlBytes,
  inferMimeType,
  samplePixels
}
