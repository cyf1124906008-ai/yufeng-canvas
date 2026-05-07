/**
 * Unified Chinese API error explanation system.
 * Translates HTTP errors, API-specific errors, network errors, and provider
 * rejection messages into clear Chinese with structured output for UI display.
 */

/**
 * Extract all error text from an error object (handles Axios, fetch, and custom shapes).
 */
const extractErrorText = (error) => [
  error?.message,
  error?.error?.message,
  error?.error?.code,
  error?.code,
  error?.details,
  error?.response?.data?.message,
  error?.response?.data?.error?.message,
  error?.response?.data?.error?.code,
  typeof error?.response?.data === 'string' ? error.response.data : ''
].filter(Boolean).join(' ')

const extractStatus = (error) =>
  error?.response?.status || error?.status || error?.error?.status || 0

/**
 * Get a unified Chinese error explanation.
 * @param {Error|object} error - The error object
 * @param {{ capability?: 'chat'|'image'|'video', action?: string }} context
 * @returns {{ title: string, description: string, suggestion: string, isRecoverable: boolean }}
 */
export function getChineseApiError(error, context = {}) {
  if (!error) {
    return { title: '未知错误', description: '没有错误信息', suggestion: '', isRecoverable: false }
  }

  const status = extractStatus(error)
  const message = extractErrorText(error).toLowerCase()
  const capability = context.capability || ''
  const capLabel = capability === 'image' ? '图片' : capability === 'video' ? '视频' : capability === 'chat' ? '对话' : ''
  const action = context.action || ''

  // --- Auth / Quota ---
  if (status === 401 || status === 403 || /permission|forbidden|unauthorized|无权限|权限/.test(message)) {
    return {
      title: '认证失败',
      description: `模型供应商拒绝了${capLabel ? capLabel : ''}请求。`,
      suggestion: '通常是 API Key 无效、过期、或没有该模型的访问权限。请在 API 设置中检查 Key 是否正确。',
      isRecoverable: false
    }
  }

  if (/余额|quota|credit|insufficient|balance|out of funds/i.test(message)) {
    return {
      title: '额度不足',
      description: `${capLabel ? capLabel : ''}请求因账户余额不足被拒绝。`,
      suggestion: '请到供应商后台充值，或更换有余额的 API Key。',
      isRecoverable: false
    }
  }

  // --- Rate limit ---
  if (status === 429 || /rate.?limit|频率|频繁|too many|throttl/i.test(message)) {
    return {
      title: '请求过于频繁',
      description: `${capLabel ? capLabel : ''}请求被限流。`,
      suggestion: '请等待几秒后重试，或降低并发请求数。部分供应商限制每分钟请求数。',
      isRecoverable: true
    }
  }

  // --- Content safety ---
  if (/content|policy|违禁|审核|safety|inappropriate|blocked| flagged|refused/i.test(message)) {
    return {
      title: '内容审核拦截',
      description: `${capLabel ? capLabel : ''}提示词触发了供应商的安全策略。`,
      suggestion: '请修改提示词中的敏感内容后重试。不同供应商的审核标准不同，可以尝试换一个供应商。',
      isRecoverable: false
    }
  }

  // --- Model not found ---
  if (status === 404 || /not found|不存在|no such model|model.*not.*(exist|available)/i.test(message)) {
    return {
      title: '模型不存在',
      description: `请求的模型名称不被当前供应商识别。`,
      suggestion: '请检查模型名称拼写是否正确。也可以在 API 设置的「模型配置」中点「获取并自动配置」来拉取可用模型。',
      isRecoverable: false
    }
  }

  // --- Image-specific parameter errors ---
  if (capability === 'image') {
    if (/quality|不合法的quality/i.test(message)) {
      return {
        title: '画质参数不支持',
        description: '当前模型不支持所选画质参数。',
        suggestion: '已尝试自动移除画质参数重试。如果仍然失败，请切换模型或调整参数。',
        isRecoverable: true
      }
    }

    if (/size|resolution|不合法的size|尺寸|像素|pixels/i.test(message)) {
      return {
        title: '尺寸参数不支持',
        description: '当前模型不支持所选的图片尺寸。',
        suggestion: '已尝试自动切换到模型支持的尺寸。如果仍然失败，请手动选择其他尺寸。',
        isRecoverable: true
      }
    }

    if (/not supported model|unsupported model|not support.*image|image generation/i.test(message)) {
      return {
        title: '图片接口不支持此模型',
        description: '当前模型不支持标准图片生成接口。',
        suggestion: '已尝试自动切换到 Chat 图片通道。如果仍然失败，请在模型配置中手动切换协议。',
        isRecoverable: true
      }
    }

    if (/image.?format|图片格式|unsupported.*image/i.test(message)) {
      return {
        title: '参考图片格式不支持',
        description: '上传的参考图片格式不被模型支持。',
        suggestion: '请尝试使用 JPG 或 PNG 格式的图片。',
        isRecoverable: false
      }
    }

    if (/count|数量|num\s/i.test(message)) {
      return {
        title: '生成数量不支持',
        description: '当前模型不支持同时生成多张图片。',
        suggestion: '已尝试自动改为生成 1 张。',
        isRecoverable: true
      }
    }
  }

  // --- Video-specific parameter errors ---
  if (capability === 'video') {
    if (/ratio|aspect.?ratio|不合法的ratio|不合法的aspect/i.test(message)) {
      return {
        title: '视频比例不支持',
        description: '当前模型不支持所选的视频比例。',
        suggestion: '已尝试自动切换比例。请检查模型支持的比例列表。',
        isRecoverable: true
      }
    }

    if (/resolution|分辨率|不合法的resolution/i.test(message)) {
      return {
        title: '分辨率不支持',
        description: '当前模型不支持所选的分辨率。',
        suggestion: '已尝试自动降低分辨率。请检查模型支持的分辨率。',
        isRecoverable: true
      }
    }

    if (/duration|seconds|时长|不合法的duration/i.test(message)) {
      return {
        title: '视频时长不支持',
        description: '当前模型不支持所选的视频时长。',
        suggestion: '已尝试自动调整时长。请检查模型支持的时长选项。',
        isRecoverable: true
      }
    }
  }

  // --- Server errors ---
  if (status >= 500 || /server|upstream|timeout|超时|internal.?error/i.test(message)) {
    return {
      title: '服务端异常',
      description: `模型供应商${status ? `返回 ${status}` : '服务异常'}。`,
      suggestion: '可能是上游模型临时故障或参数未被该厂商兼容。请稍后再试。',
      isRecoverable: true
    }
  }

  // --- Network errors ---
  if (/dns|ENOTFOUND|getaddrinfo/i.test(message)) {
    return {
      title: '域名解析失败',
      description: '无法解析 Base URL 的域名。',
      suggestion: '请检查 Base URL 拼写是否正确。',
      isRecoverable: false
    }
  }

  if (/ECONNREFUSED|network error|网络/i.test(message)) {
    return {
      title: '网络连接失败',
      description: '无法连接到模型供应商。',
      suggestion: '请检查网络连接和 Base URL 是否正确。',
      isRecoverable: false
    }
  }

  if (/abort|cancel/i.test(message)) {
    return {
      title: '请求已取消',
      description: `${capLabel ? capLabel : ''}请求被取消。`,
      suggestion: '',
      isRecoverable: false
    }
  }

  // --- Generic 400 ---
  if (status === 400 || /bad request|参数不合法|invalid/i.test(message)) {
    return {
      title: '请求参数错误',
      description: `供应商拒绝了${capLabel ? capLabel : ''}请求参数。`,
      suggestion: '请检查模型名称、尺寸、时长等参数是否在模型支持范围内。可在运行日志中查看完整错误。',
      isRecoverable: false
    }
  }

  // --- Fallback ---
  const fallbackMessage = error?.message || '未知错误'
  return {
    title: `${capLabel ? capLabel : ''}请求失败`,
    description: fallbackMessage,
    suggestion: '请打开运行日志查看请求详情，或尝试更换参数重试。',
    isRecoverable: false
  }
}
