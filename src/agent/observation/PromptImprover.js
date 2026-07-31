export class PromptImprovementError extends Error {
  constructor(message, code = 'PROMPT_IMPROVEMENT_FAILED') {
    super(message)
    this.name = 'PromptImprovementError'
    this.code = code
  }
}

function uniqueStrings(values, limit, maxLength) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const item = value.trim().slice(0, maxLength)
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
    if (result.length >= limit) break
  }
  return result
}

/** Browser-safe deterministic FNV-1a hash. */
export function hashPrompt(value, negativePrompt = '') {
  const prompt = typeof value === 'object' && value !== null ? value.prompt : value
  const negative = typeof value === 'object' && value !== null
    ? value.negativePrompt || ''
    : negativePrompt
  const text = `${String(prompt || '')}\u0000${String(negative || '')}`
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export class PromptImprover {
  constructor({ maxSuggestions = 6, maxSuggestionLength = 300, maxPromptLength = 8_000 } = {}) {
    this.maxSuggestions = maxSuggestions
    this.maxSuggestionLength = maxSuggestionLength
    this.maxPromptLength = maxPromptLength
  }

  improve({
    goal,
    prompt,
    negativePrompt = '',
    review,
    revision = 2,
    retryOf = review?.artifactRef,
    reviewRef = review?.artifactRef ? `review:${review.artifactRef}` : undefined,
    previousHashes = []
  } = {}) {
    const normalizedGoal = String(goal || '').trim()
    const normalizedPrompt = String(prompt || '').trim()
    if (!normalizedGoal) throw new PromptImprovementError('goal is required', 'PROMPT_GOAL_REQUIRED')
    if (!normalizedPrompt) throw new PromptImprovementError('prompt is required', 'PROMPT_REQUIRED')

    const additions = uniqueStrings([
      ...(Array.isArray(review?.improvements) ? review.improvements : []),
      ...(Array.isArray(review?.suggestedPrompt?.additions) ? review.suggestedPrompt.additions : [])
    ], this.maxSuggestions, this.maxSuggestionLength)
    const suggestedNegative = uniqueStrings(
      Array.isArray(review?.suggestedPrompt?.negative) ? review.suggestedPrompt.negative : [],
      this.maxSuggestions,
      this.maxSuggestionLength
    )
    if (additions.length === 0 && suggestedNegative.length === 0) {
      throw new PromptImprovementError('Review did not provide an actionable prompt change', 'PROMPT_NOT_IMPROVED')
    }

    const promptParts = [
      `用户目标：${normalizedGoal}`,
      `当前创作提示词：${normalizedPrompt}`
    ]
    let appliedAdditions = [...additions]
    let nextPrompt = `${promptParts.join('\n')}\n本轮修正：${appliedAdditions.join('；')}`
    while (nextPrompt.length > this.maxPromptLength && appliedAdditions.length > 1) {
      appliedAdditions.pop()
      nextPrompt = `${promptParts.join('\n')}\n本轮修正：${appliedAdditions.join('；')}`
    }
    if (nextPrompt.length > this.maxPromptLength) {
      throw new PromptImprovementError('Improved prompt exceeds maxPromptLength', 'PROMPT_TOO_LONG')
    }

    const existingNegative = uniqueStrings(
      String(negativePrompt || '').split(/[，,;；\n]+/),
      this.maxSuggestions,
      this.maxSuggestionLength
    )
    const appliedNegative = uniqueStrings(
      [...existingNegative, ...suggestedNegative],
      this.maxSuggestions * 2,
      this.maxSuggestionLength
    )
    const nextNegativePrompt = appliedNegative.join('，')
    const hash = hashPrompt(nextPrompt, nextNegativePrompt)
    const knownHashes = new Set(previousHashes)
    if (knownHashes.has(hash)) {
      throw new PromptImprovementError('Improved prompt repeats a previous revision', 'PROMPT_NOT_IMPROVED')
    }

    return {
      prompt: nextPrompt,
      negativePrompt: nextNegativePrompt,
      revision,
      retryOf,
      reviewRef,
      hash,
      appliedSuggestions: {
        additions: appliedAdditions,
        negative: suggestedNegative.filter(item => appliedNegative.includes(item))
      }
    }
  }
}

export default PromptImprover
