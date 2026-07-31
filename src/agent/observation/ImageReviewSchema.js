export const IMAGE_REVIEW_SCHEMA_VERSION = '1'

export const IMAGE_REVIEW_DIMENSIONS = Object.freeze([
  'goalAlignment',
  'subjectIntegrity',
  'composition',
  'visualQuality',
  'styleMatch',
  'textIntegrity'
])

export const IMAGE_REVIEW_HARD_FAILURES = Object.freeze([
  'UNDECODABLE',
  'MISSING_SUBJECT',
  'SEVERE_DEFORMATION',
  'WRONG_ASPECT_RATIO',
  'REQUIRED_TEXT_BROKEN',
  'GOAL_MISMATCH'
])

const HARD_FAILURE_SET = new Set(IMAGE_REVIEW_HARD_FAILURES)
const VISION_DECISIONS = new Set(['accept', 'retry'])

export class ImageReviewValidationError extends TypeError {
  constructor(issues) {
    super(`Invalid image review: ${issues.join('; ')}`)
    this.name = 'ImageReviewValidationError'
    this.code = 'VISION_SCHEMA_INVALID'
    this.issues = issues
  }
}

function trimmed(value, maxLength = Infinity) {
  if (typeof value !== 'string') return value
  return value.trim().slice(0, maxLength)
}

function normalizeStringArray(value, maxItems = 8, maxLength = 300) {
  if (!Array.isArray(value)) return value
  const seen = new Set()
  const result = []
  for (const item of value) {
    if (typeof item !== 'string') {
      result.push(item)
      continue
    }
    const normalized = trimmed(item, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= maxItems) break
  }
  return result
}

function normalizeDimension(value) {
  if (typeof value === 'number' || value === null) {
    return { score: value, feedback: '' }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  return {
    score: value.score,
    feedback: trimmed(value.feedback ?? '', 300)
  }
}

function normalizeTechnical(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return value
  return {
    decodable: value.decodable,
    ...(value.width == null ? {} : { width: value.width }),
    ...(value.height == null ? {} : { height: value.height }),
    ...(value.mimeType == null ? {} : { mimeType: trimmed(value.mimeType, 100) })
  }
}

function normalizeUsage(value) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return value
  if (value.cost == null) return { cost: null }
  if (typeof value.cost !== 'object' || Array.isArray(value.cost)) return { cost: value.cost }
  return {
    cost: {
      amount: value.cost.amount,
      currency: typeof value.cost.currency === 'string'
        ? value.cost.currency.trim().toUpperCase()
        : value.cost.currency,
      estimated: Boolean(value.cost.estimated)
    }
  }
}

function toCandidate(raw, options) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw

  const rawDimensions = raw.dimensions
  const dimensions = rawDimensions && typeof rawDimensions === 'object' && !Array.isArray(rawDimensions)
    ? Object.fromEntries(IMAGE_REVIEW_DIMENSIONS.map(name => [name, normalizeDimension(rawDimensions[name])]))
    : rawDimensions
  const hardFailures = Array.isArray(raw.hardFailures)
    ? raw.hardFailures.map(item => typeof item === 'object' && item !== null ? item.code : item)
    : raw.hardFailures ?? []
  const suggested = raw.suggestedPrompt && typeof raw.suggestedPrompt === 'object'
    ? raw.suggestedPrompt
    : {}

  return {
    schemaVersion: String(raw.schemaVersion ?? IMAGE_REVIEW_SCHEMA_VERSION),
    artifactRef: trimmed(options.artifactRef ?? raw.artifactRef, 200),
    reviewMode: raw.reviewMode,
    overallScore: raw.overallScore,
    dimensions,
    hardFailures,
    decision: raw.decision,
    summary: trimmed(raw.summary ?? '', 500),
    improvements: normalizeStringArray(raw.improvements ?? []),
    suggestedPrompt: {
      additions: normalizeStringArray(suggested.additions ?? []),
      negative: normalizeStringArray(suggested.negative ?? [])
    },
    technical: normalizeTechnical(options.technical ?? raw.technical),
    usage: normalizeUsage(raw.usage)
  }
}

function isScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function validateTechnical(technical, issues, required) {
  if (technical == null) {
    if (required) issues.push('technical is required for degraded review')
    return
  }
  if (typeof technical !== 'object' || Array.isArray(technical)) {
    issues.push('technical must be an object')
    return
  }
  if (typeof technical.decodable !== 'boolean') issues.push('technical.decodable must be boolean')
  for (const field of ['width', 'height']) {
    if (technical[field] != null && (!Number.isFinite(technical[field]) || technical[field] <= 0)) {
      issues.push(`technical.${field} must be a positive number`)
    }
  }
  if (technical.mimeType != null && typeof technical.mimeType !== 'string') {
    issues.push('technical.mimeType must be a string')
  }
}

function collectIssues(candidate) {
  const issues = []
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return ['review must be an object']
  }
  if (candidate.schemaVersion !== IMAGE_REVIEW_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be ${IMAGE_REVIEW_SCHEMA_VERSION}`)
  }
  if (typeof candidate.artifactRef !== 'string' || !candidate.artifactRef) {
    issues.push('artifactRef is required')
  }
  if (!['vision', 'degraded'].includes(candidate.reviewMode)) {
    issues.push('reviewMode must be vision or degraded')
  }
  if (typeof candidate.summary !== 'string') issues.push('summary must be a string')
  if (!Array.isArray(candidate.improvements) || candidate.improvements.some(item => typeof item !== 'string')) {
    issues.push('improvements must be a string array')
  }
  if (!candidate.suggestedPrompt || typeof candidate.suggestedPrompt !== 'object') {
    issues.push('suggestedPrompt must be an object')
  } else {
    for (const field of ['additions', 'negative']) {
      if (!Array.isArray(candidate.suggestedPrompt[field]) || candidate.suggestedPrompt[field].some(item => typeof item !== 'string')) {
        issues.push(`suggestedPrompt.${field} must be a string array`)
      }
    }
  }

  if (!Array.isArray(candidate.hardFailures)) {
    issues.push('hardFailures must be an array')
  } else {
    for (const code of candidate.hardFailures) {
      if (typeof code !== 'string' || !HARD_FAILURE_SET.has(code)) {
        issues.push(`unknown hard failure code: ${String(code)}`)
      }
    }
  }

  if (candidate.reviewMode === 'vision') {
    if (!isScore(candidate.overallScore)) issues.push('overallScore must be a score from 0 to 100')
    if (!VISION_DECISIONS.has(candidate.decision)) issues.push('vision decision must be accept or retry')
    if (!candidate.dimensions || typeof candidate.dimensions !== 'object' || Array.isArray(candidate.dimensions)) {
      issues.push('dimensions must be an object for vision review')
    } else {
      for (const name of IMAGE_REVIEW_DIMENSIONS) {
        const dimension = candidate.dimensions[name]
        if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)) {
          issues.push(`dimensions.${name} is required`)
          continue
        }
        const mayBeNull = name === 'textIntegrity'
        if (!(mayBeNull && dimension.score === null) && !isScore(dimension.score)) {
          issues.push(`dimensions.${name}.score must be a score${mayBeNull ? ' or null' : ''}`)
        }
        if (typeof dimension.feedback !== 'string') {
          issues.push(`dimensions.${name}.feedback must be a string`)
        }
      }
    }
    validateTechnical(candidate.technical, issues, false)
  }

  if (candidate.reviewMode === 'degraded') {
    if (candidate.overallScore !== null) issues.push('degraded overallScore must be null')
    if (candidate.dimensions !== null) issues.push('degraded dimensions must be null')
    if (candidate.decision !== 'unverified') issues.push('degraded decision must be unverified')
    validateTechnical(candidate.technical, issues, true)
  }

  if (candidate.usage != null) {
    const cost = candidate.usage?.cost
    if (cost != null) {
      if (!Number.isFinite(cost.amount) || cost.amount < 0) issues.push('usage.cost.amount must be non-negative')
      if (typeof cost.currency !== 'string' || !cost.currency) issues.push('usage.cost.currency is required')
      if (typeof cost.estimated !== 'boolean') issues.push('usage.cost.estimated must be boolean')
    }
  }
  return issues
}

/**
 * Non-throwing validation suitable for JSON repair loops.
 */
export function validateImageReview(raw, options = {}) {
  const value = toCandidate(raw, options)
  const errors = collectIssues(value)
  return { ok: errors.length === 0, value: errors.length === 0 ? value : null, errors }
}

/**
 * Produce the canonical review shape or throw a stable schema error.
 */
export function normalizeImageReview(raw, options = {}) {
  const result = validateImageReview(raw, options)
  if (!result.ok) throw new ImageReviewValidationError(result.errors)
  return result.value
}

export default normalizeImageReview
