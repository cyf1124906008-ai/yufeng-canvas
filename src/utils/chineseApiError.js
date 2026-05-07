/**
 * Unified Chinese API error explanation system.
 * Converts provider / HTTP / network errors into short Chinese messages that non-technical users can act on.
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

const capabilityLabel = (capability = '') => {
  if (capability === 'image') return '图片'
  if (capability === 'video') return '视频'
  if (capability === 'chat') return '对话'
  if (capability === 'audio') return '音频'
  return ''
}

const result = (title, description, suggestion = '', isRecoverable = false, extra = {}) => ({
  title,
  description,
  suggestion,
  isRecoverable,
  ...extra
})

/**
 * Get a unified Chinese error explanation.
 * @param {Error|object} error
 * @param {{ capability?: 'chat'|'image'|'video'|'audio', action?: string }} context
 * @returns {{ title: string, description: string, suggestion: string, isRecoverable: boolean, status?: number, rawMessage?: string }}
 */
export function getChineseApiError(error, context = {}) {
  if (!error) return result('未知错误', '没有错误信息。')

  const status = Number(extractStatus(error)) || 0
  const rawText = extractErrorText(error) || error?.message || ''
  const message = rawText.toLowerCase()
  const capLabel = capabilityLabel(context.capability)
  const prefix = capLabel ? `${capLabel}请求` : '请求'
  const extra = { status, rawMessage: rawText }

  // Auth / permission / quota
  if (status === 401 || /unauthorized|invalid.*key|incorrect.*api.*key|api key.*invalid|authentication/i.test(message)) {
    return result(
      'API Key 无效',
      `${prefix}被供应商拒绝，通常是 API Key 填错、已过期，或没有正确保存。`,
      '请打开 API 设置，检查 API Key 是否完整、是否属于当前供应商。',
      false,
      extra
    )
  }

  if (status === 403 || /permission|forbidden|access denied|no permission|无权限|权限不足/i.test(message)) {
    return result(
      '没有模型权限',
      `${prefix}被供应商拒绝，当前账号或 Key 没有访问该模型的权限。`,
      '请确认供应商后台已开通该模型，或换一个有权限的模型/API Key。',
      false,
      extra
    )
  }

  if (/quota|credit|insufficient|balance|out of funds|余额|额度|欠费/i.test(message)) {
    return result(
      '额度或余额不足',
      `${prefix}因为账号余额、额度或套餐限制被拒绝。`,
      '请到供应商后台充值、升级套餐，或切换到其他可用供应商。',
      false,
      extra
    )
  }

  // Rate limit
  if (status === 429 || /rate.?limit|too many|throttl|频率|限流|请求过于频繁/i.test(message)) {
    return result(
      '请求过于频繁',
      `${prefix}触发了供应商的频率限制。`,
      '请稍后重试，或降低批量生成数量和并发请求。',
      true,
      extra
    )
  }

  // Content policy
  if (status === 451 || /content|policy|safety|inappropriate|blocked|flagged|refused|审核|安全策略|违规|敏感/i.test(message)) {
    return result(
      '内容被审核拦截',
      `${prefix}触发了供应商的安全或内容审核策略。`,
      '请修改提示词，减少敏感、违规或过于具体的危险描述；也可以换一个供应商重试。',
      false,
      extra
    )
  }

  // Model / endpoint
  if (/model.*not.*found|model_not_found|no such model|not found model|model.*not.*exist|模型不存在/i.test(message)) {
    return result(
      '模型不存在或不可用',
      '当前供应商不认识这个模型名，或该 API Key 没有权限使用它。',
      '请在 API 设置里同步模型列表，或按供应商后台显示的模型名重新填写。',
      false,
      extra
    )
  }

  if (status === 404) {
    return result(
      '接口地址不正确',
      '供应商返回 404，通常是 Base URL 或 endpoint 拼接错误。',
      'Base URL 应只填写到域名、/v1 或 /api/v1，不要包含 /images/generations、/chat/completions 等完整接口路径。',
      false,
      extra
    )
  }

  // Parameter incompatibility: image
  if (context.capability === 'image') {
    if (/quality|style/i.test(message)) {
      return result('图片画质参数不支持', '当前图片模型不支持 quality/style 等画质参数。', '系统会尝试移除不支持的画质参数后重试。', true, extra)
    }
    if (/size|resolution|pixels|尺寸|分辨率|像素/i.test(message)) {
      return result('图片尺寸不支持', '当前图片模型不支持所选尺寸。', '请换成模型支持的尺寸；系统也会尝试自动切换到可用尺寸。', true, extra)
    }
    if (/steps|cfg|cfg_scale|sampler|scheduler|denois|negative_prompt|unknown parameter|unrecognized|unsupported parameter|invalid.*parameter/i.test(message)) {
      return result('专业参数不兼容', '当前图片模型不支持部分专业参数，例如 Steps、CFG、Sampler、Scheduler、Denoise 或反向提示词。', '系统会尝试自动移除这些专业参数后重试。', true, extra)
    }
    if (/count|number|num| n |数量/i.test(message)) {
      return result('生成数量不支持', '当前图片模型不支持一次生成多张。', '系统会尝试改为一次生成 1 张后重试。', true, extra)
    }
    if (/image.?format|unsupported.*image|图片格式|参考图/i.test(message)) {
      return result('参考图格式不支持', '上传的参考图格式或大小不被供应商支持。', '请尝试 JPG/PNG 图片，或压缩图片后重试。', false, extra)
    }
    if (/not supported model|unsupported model|not support.*image|image generation/i.test(message)) {
      return result('图片接口不支持该模型', '当前模型不支持标准图片生成接口。', '系统会尝试切换到 Chat 图片通道；如果仍失败，请在模型配置中手动切换协议。', true, extra)
    }
  }

  // Parameter incompatibility: video
  if (context.capability === 'video') {
    if (/ratio|aspect.?ratio|比例/i.test(message)) {
      return result('视频比例不支持', '当前视频模型不支持所选画面比例。', '请换成 16:9、9:16、1:1 等模型支持的比例。', true, extra)
    }
    if (/resolution|分辨率/i.test(message)) {
      return result('视频分辨率不支持', '当前视频模型不支持所选分辨率。', '请降低到 720p 或选择模型支持的分辨率。', true, extra)
    }
    if (/duration|seconds|时长/i.test(message)) {
      return result('视频时长不支持', '当前视频模型不支持所选时长。', '请改为 5 秒、8 秒或供应商支持的时长。', true, extra)
    }
    if (/image.?format|unsupported.*image|first.*frame|last.*frame|首帧|尾帧/i.test(message)) {
      return result('视频参考图不支持', '首帧、尾帧或参考图格式不被该视频模型支持。', '请使用 JPG/PNG，或换一个支持图生视频的模型。', false, extra)
    }
  }

  // Network / timeout / server
  if (/failed to fetch|network error|econnrefused|enotfound|getaddrinfo|dns|网络/i.test(message)) {
    return result(
      '网络连接失败',
      '应用无法连接到模型供应商。',
      '请检查网络、代理、防火墙和 Base URL 是否正确。',
      false,
      extra
    )
  }

  if (status === 408 || status === 504 || /timeout|timed out|超时/i.test(message)) {
    return result(
      '供应商响应超时',
      `${prefix}等待时间过长。桌面端会尽量让后台任务继续等待供应商返回，避免结果丢失。`,
      '请稍后查看任务是否恢复；如果长期无结果，再重新生成。',
      true,
      extra
    )
  }

  if (status === 400 || /bad request|invalid|参数|不合法/i.test(message)) {
    return result(
      '请求参数错误',
      `${prefix}参数不符合供应商要求。`,
      '请检查模型名、尺寸、时长、参考图和专业参数；运行日志里保留了原始错误详情。',
      false,
      extra
    )
  }

  if (status >= 500 || /server|upstream|internal|gateway|service unavailable/i.test(message)) {
    return result(
      '供应商服务异常',
      `供应商返回 ${status || '服务端'} 错误，可能是上游模型临时故障。`,
      '请稍后重试，或切换到其他模型/供应商。',
      true,
      extra
    )
  }

  return result(
    `${capLabel || 'API'}请求失败`,
    rawText || '请求失败，但供应商没有返回明确原因。',
    '请打开运行日志查看技术详情，或更换模型、供应商后重试。',
    false,
    extra
  )
}
