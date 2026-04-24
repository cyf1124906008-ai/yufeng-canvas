const CAPABILITY_PATTERNS = {
  chat: [
    /(^|[-_])gpt[-_][45]/i,
    /gpt-4o/i,
    /deepseek/i,
    /gemini/i,
    /claude/i,
    /qwen/i,
    /doubao/i,
    /moonshot/i
  ],
  image: [
    /(^|[-_])image([-_]|$)/i,
    /image[-_]?preview/i,
    /gpt[-_]?image/i,
    /dall[-_]?e/i,
    /seedream/i,
    /nano[-_\s]?banana/i,
    /imagen/i
  ],
  video: [
    /kling/i,
    /seedance/i,
    /sora/i,
    /veo/i,
    /wan[-_]?/i,
    /hailuo/i,
    /runway/i,
    /pika/i,
    /luma/i
  ]
}

const getLikelyCapabilities = (modelName = '') => {
  const value = String(modelName).trim()
  if (!value) return []

  return Object.entries(CAPABILITY_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(value)))
    .map(([capability]) => capability)
}

export const getModelCapabilityConflict = (modelName, expectedCapability) => {
  const matches = getLikelyCapabilities(modelName)

  if (matches.length === 0 || matches.includes(expectedCapability)) {
    return ''
  }

  return matches[0]
}

export const isModelAllowedForCapability = (modelName, expectedCapability) =>
  !getModelCapabilityConflict(modelName, expectedCapability)

export const getCapabilityLabel = (capability) => ({
  chat: '文本',
  image: '图片',
  video: '视频'
}[capability] || capability)
