export const INTERVENTION_ACTIONS = Object.freeze([
  'regenerate_image',
  'edit_image',
  'upscale_image',
  'accept'
])

const DYNAMIC_ACTIONS = new Set(INTERVENTION_ACTIONS.filter(action => action !== 'accept'))

const HARD_REGENERATE_CODES = new Set([
  'UNDECODABLE',
  'POSSIBLE_BLANK_IMAGE',
  'MISSING_SUBJECT',
  'SEVERE_DEFORMATION',
  'WRONG_ASPECT_RATIO',
  'REQUIRED_TEXT_BROKEN',
  'GOAL_MISMATCH'
])

const LOCAL_EDIT_CODES = new Set([
  'LOCAL_TEXT_ISSUE',
  'TEXT_INTEGRITY_LOW',
  'TYPOGRAPHY_ISSUE',
  'MINOR_STRUCTURE_ISSUE',
  'LOCAL_STRUCTURE_ISSUE',
  'COMPOSITION_LOCAL_ISSUE'
])

const UPSCALE_CODES = new Set([
  'LOW_RESOLUTION',
  'RESOLUTION_TOO_LOW',
  'LOW_CLARITY',
  'CLARITY_LOW',
  'DETAILS_SOFT',
  'VISUAL_QUALITY_LOW'
])

const GENERIC_SCORE_CODES = new Set([
  'TOTAL_SCORE_BELOW_MINIMUM',
  'DIMENSION_BELOW_MINIMUM'
])

const CAPABILITY_ALIASES = Object.freeze({
  image_edit: 'edit_image',
  edit: 'edit_image',
  upscale: 'upscale_image',
  super_resolution: 'upscale_image',
  generate_image: 'regenerate_image'
})

export class InterventionPolicyError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'InterventionPolicyError'
    this.code = code
    Object.assign(this, details)
  }
}

function normalizedName(value) {
  const name = String(value || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
  return CAPABILITY_ALIASES[name] || name
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values.flat()) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function capabilitySet(input, state) {
  const sources = [
    input.capabilities,
    input.availableCapabilities,
    state?.capabilities,
    state?.availableCapabilities
  ]
  const values = []
  for (const source of sources) {
    if (Array.isArray(source)) values.push(...source)
    else if (source && typeof source === 'object') {
      values.push(...Object.entries(source).filter(([, enabled]) => enabled === true).map(([name]) => name))
    } else if (typeof source === 'string') values.push(...source.split(','))
  }
  return new Set(values.map(normalizedName).filter(Boolean))
}

function blockingReasons(evaluation) {
  return Array.isArray(evaluation?.blockingReasons) ? evaluation.blockingReasons : []
}

function collectCodes(review, evaluation) {
  return uniqueStrings([
    Array.isArray(review?.hardFailures) ? review.hardFailures.map(value =>
      typeof value === 'object' && value !== null ? value.code : value) : [],
    blockingReasons(evaluation).map(reason => typeof reason === 'string' ? reason : reason?.code),
    Array.isArray(evaluation?.codes) ? evaluation.codes : []
  ]).map(code => code.toUpperCase())
}

function collectInstructions(review, evaluation, fallback) {
  const reasonMessages = blockingReasons(evaluation).map(reason =>
    typeof reason === 'string' ? reason : reason?.message)
  return uniqueStrings([
    Array.isArray(review?.improvements) ? review.improvements : [],
    Array.isArray(review?.suggestedPrompt?.additions) ? review.suggestedPrompt.additions : [],
    Array.isArray(review?.suggestedPrompt?.negative)
      ? review.suggestedPrompt.negative.map(item => `避免：${item}`)
      : [],
    reasonMessages,
    fallback ? [fallback] : []
  ]).slice(0, 8)
}

function findDimensionReason(evaluation, dimension) {
  return blockingReasons(evaluation).some(reason =>
    typeof reason === 'object' && reason?.dimension === dimension)
}

function isLocalEditIssue(review, evaluation, codes) {
  if (codes.some(code => LOCAL_EDIT_CODES.has(code))) return true
  const textScore = review?.dimensions?.textIntegrity?.score
  if (Number.isFinite(textScore) && textScore < 70) return true
  if (findDimensionReason(evaluation, 'textIntegrity')) return true

  const structureScore = review?.dimensions?.subjectIntegrity?.score
  // Severe structural problems belong in hardFailures. A middling score with
  // no hard failure is treated as a localized repair candidate.
  if (Number.isFinite(structureScore) && structureScore >= 50 && structureScore < 70) return true
  return false
}

function addDerivedCodes(codes, review, evaluation, input, state) {
  if (inferredResolutionIssue(review, input, state)) codes.push('LOW_RESOLUTION')
  if (evaluation.accepted === true || evaluation.decision === 'accept') return
  const textScore = review?.dimensions?.textIntegrity?.score
  if ((Number.isFinite(textScore) && textScore < 70) || findDimensionReason(evaluation, 'textIntegrity')) {
    codes.push('TEXT_INTEGRITY_LOW')
  }
  const structureScore = review?.dimensions?.subjectIntegrity?.score
  if (Number.isFinite(structureScore) && structureScore >= 50 && structureScore < 70) {
    codes.push('MINOR_STRUCTURE_ISSUE')
  }
  const visualScore = review?.dimensions?.visualQuality?.score
  if (Number.isFinite(visualScore) && visualScore < 60) codes.push('LOW_CLARITY')
}

function inferredResolutionIssue(review, input, state) {
  const technical = review?.technical || {}
  const minWidth = Number(input.minWidth ?? state?.requirements?.minWidth)
  const minHeight = Number(input.minHeight ?? state?.requirements?.minHeight)
  return technical.warnings?.includes('low_resolution') || (
    Number.isFinite(minWidth) && Number.isFinite(technical.width) && technical.width < minWidth
  ) || (
    Number.isFinite(minHeight) && Number.isFinite(technical.height) && technical.height < minHeight
  )
}

function isUpscaleOnlyIssue(review, evaluation, codes, input, state) {
  const upscaleCodes = codes.filter(code => UPSCALE_CODES.has(code))
  const resolutionIssue = inferredResolutionIssue(review, input, state)
  const visualScore = review?.dimensions?.visualQuality?.score
  const clarityIssue = Number.isFinite(visualScore) && visualScore < 60
  if (upscaleCodes.length === 0 && !resolutionIssue && !clarityIssue) return false

  const disqualifyingCodes = codes.filter(code =>
    !UPSCALE_CODES.has(code) && !GENERIC_SCORE_CODES.has(code))
  if (disqualifyingCodes.length > 0) return false

  // Goal and subject content must be sound before an upscale can be useful.
  const goalScore = review?.dimensions?.goalAlignment?.score
  const subjectScore = review?.dimensions?.subjectIntegrity?.score
  if (Number.isFinite(goalScore) && goalScore < 70) return false
  if (Number.isFinite(subjectScore) && subjectScore < 70) return false
  return true
}

function artifactReference(input, review, evaluation, attempt, state) {
  const explicit = input.artifactRef ?? review?.artifactRef ?? evaluation?.review?.artifactRef
  if (explicit) return String(explicit)
  if (typeof state?.latestOutput === 'function') {
    const output = state.latestOutput('image')
    if (output?.value?.outputNodeId) return String(output.value.outputNodeId)
    if (output?.step != null) return `output:${output.step}`
  }
  const outputs = Array.isArray(state?.outputs) ? state.outputs : []
  const latestImage = [...outputs].reverse().find(output => output?.type === 'image')
  if (latestImage?.value?.outputNodeId) return String(latestImage.value.outputNodeId)
  if (latestImage?.step != null) return `output:${latestImage.step}`
  return `attempt:${attempt}`
}

function normalizeHistoryEntry(entry) {
  const decision = entry?.interventionDecision ?? entry?.input?.interventionDecision
  const action = normalizedName(decision?.action ?? entry?.action ?? entry?.name)
  if (!DYNAMIC_ACTIONS.has(action)) return null
  const artifactRef = decision?.artifactRef ?? entry?.artifactRef ?? entry?.input?.artifactRef ?? entry?.input?.retryOf
  if (!artifactRef) return null
  return { artifactRef: String(artifactRef), action }
}

function stateHistory(state) {
  const sources = [
    state?.interventions,
    state?.dynamicInterventions,
    state?.dynamic?.interventions,
    state?.actions
  ]
  return sources.flatMap(source => Array.isArray(source) ? source : [])
    .map(normalizeHistoryEntry)
    .filter(Boolean)
}

function entryKey(entry) {
  return `${entry.artifactRef}\u0000${entry.action}`
}

function reasonFor(action, codes) {
  if (action === 'accept') return 'The latest result passed the local quality evaluation.'
  if (action === 'edit_image') return 'The result has localized, repairable issues and image editing is available.'
  if (action === 'upscale_image') return 'The content is usable, but resolution or clarity needs enhancement.'
  if (codes.some(code => HARD_REGENERATE_CODES.has(code))) {
    return 'A hard quality failure requires a new image rather than a local repair.'
  }
  return 'No safe local repair is available; regenerate with the review instructions.'
}

/**
 * Pure-JS local decision policy. Recorded Agent state is the only source of
 * intervention history, so planning itself never mutates retry state.
 */
export class InterventionPolicy {
  constructor({ maxDynamicSteps = 4, maxPerArtifactAction = 1 } = {}) {
    if (!Number.isInteger(maxDynamicSteps) || maxDynamicSteps < 0) {
      throw new TypeError('maxDynamicSteps must be a non-negative integer')
    }
    if (maxPerArtifactAction !== 1) {
      throw new TypeError('maxPerArtifactAction is fixed at 1 for loop safety')
    }
    this.maxDynamicSteps = maxDynamicSteps
    this.maxPerArtifactAction = maxPerArtifactAction
  }

  decide(input = {}) {
    const review = input.review ?? input.evaluation?.review ?? null
    const evaluation = input.evaluation ?? {}
    const state = input.state ?? {}
    const attempt = Number.isFinite(Number(input.attempt)) ? Number(input.attempt) : 1
    const artifactRef = artifactReference(input, review, evaluation, attempt, state)
    const codes = collectCodes(review, evaluation)
    addDerivedCodes(codes, review, evaluation, input, state)
    const capabilities = capabilitySet(input, state)

    let action
    if (codes.some(code => HARD_REGENERATE_CODES.has(code))) {
      action = 'regenerate_image'
    } else if (isUpscaleOnlyIssue(review, evaluation, codes, input, state)) {
      action = capabilities.has('upscale_image') ? 'upscale_image' : 'regenerate_image'
      if (!capabilities.has('upscale_image')) codes.push('UPSCALE_CAPABILITY_UNAVAILABLE')
    } else if (evaluation.accepted === true || evaluation.decision === 'accept') {
      action = 'accept'
    } else if (isLocalEditIssue(review, evaluation, codes)) {
      action = capabilities.has('edit_image') ? 'edit_image' : 'regenerate_image'
      if (!capabilities.has('edit_image')) codes.push('EDIT_CAPABILITY_UNAVAILABLE')
    } else {
      action = 'regenerate_image'
      if (codes.length === 0) codes.push('UNKNOWN_QUALITY_FAILURE')
    }

    const result = {
      action,
      artifactRef,
      attempt,
      reason: reasonFor(action, codes),
      codes: [...new Set(codes)],
      instructions: action === 'accept'
        ? []
        : collectInstructions(
          review,
          evaluation,
          action === 'upscale_image'
            ? '提高分辨率和边缘清晰度，保持构图与内容不变'
            : action === 'edit_image'
              ? '只修复标记的局部问题，保持其余画面不变'
              : '重新生成并修正上述问题，保留用户原始目标约束'
        )
    }

    if (action !== 'accept') this.#guard(result, state)
    return result
  }

  #history(state) {
    const history = new Map()
    for (const entry of stateHistory(state)) history.set(entryKey(entry), entry)
    return history
  }

  #guard(result, state) {
    const history = this.#history(state)
    const key = entryKey(result)
    if (history.has(key)) {
      throw new InterventionPolicyError(
        `${result.action} was already applied to ${result.artifactRef}`,
        'INTERVENTION_ALREADY_APPLIED',
        { artifactRef: result.artifactRef, action: result.action }
      )
    }
    if (history.size >= this.maxDynamicSteps) {
      throw new InterventionPolicyError(
        `Dynamic intervention limit of ${this.maxDynamicSteps} reached`,
        'DYNAMIC_STEP_LIMIT_REACHED',
        { maxDynamicSteps: this.maxDynamicSteps, dynamicSteps: history.size }
      )
    }
  }

  snapshot(state = {}) {
    const interventions = [...this.#history(state).values()]
    return {
      maxDynamicSteps: this.maxDynamicSteps,
      dynamicSteps: interventions.length,
      interventions: interventions.map(entry => ({ ...entry }))
    }
  }

  reset() {}
}

export function chooseIntervention(input, options = {}) {
  return new InterventionPolicy(options).decide(input)
}

export default InterventionPolicy
