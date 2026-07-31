import { normalizeImageReview } from './ImageReviewSchema.js'

export const DEFAULT_QUALITY_WEIGHTS = Object.freeze({
  goalAlignment: 30,
  subjectIntegrity: 20,
  composition: 15,
  visualQuality: 15,
  styleMatch: 15,
  textIntegrity: 5
})

export const DEFAULT_DIMENSION_MINIMUMS = Object.freeze({
  goalAlignment: 70,
  subjectIntegrity: 70,
  composition: 60,
  visualQuality: 60,
  styleMatch: 60,
  textIntegrity: 70
})

function roundScore(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export class QualityPolicy {
  constructor({
    minAcceptScore = 82,
    weights = DEFAULT_QUALITY_WEIGHTS,
    dimensionMinimums = DEFAULT_DIMENSION_MINIMUMS,
    allowDegradedReview = true
  } = {}) {
    this.minAcceptScore = minAcceptScore
    this.weights = { ...DEFAULT_QUALITY_WEIGHTS, ...weights }
    this.dimensionMinimums = { ...DEFAULT_DIMENSION_MINIMUMS, ...dimensionMinimums }
    this.allowDegradedReview = allowDegradedReview
  }

  computeScore(review) {
    if (review.reviewMode !== 'vision') return null
    let weightedScore = 0
    let activeWeight = 0
    for (const [name, weight] of Object.entries(this.weights)) {
      const score = review.dimensions?.[name]?.score
      if (score == null || !Number.isFinite(weight) || weight <= 0) continue
      weightedScore += score * weight
      activeWeight += weight
    }
    if (activeWeight === 0) return null
    return roundScore(weightedScore / activeWeight)
  }

  evaluate(input) {
    const review = normalizeImageReview(input)

    if (review.reviewMode === 'degraded') {
      const technicalOk = review.technical?.decodable === true
      const accepted = this.allowDegradedReview && technicalOk && review.hardFailures.length === 0
      const blockingReasons = []
      if (!this.allowDegradedReview) {
        blockingReasons.push({ code: 'DEGRADED_REVIEW_DISABLED', message: 'Degraded review is not allowed.' })
      }
      if (!technicalOk) {
        blockingReasons.push({ code: 'UNDECODABLE', message: 'The image failed the technical decode check.' })
      }
      for (const code of review.hardFailures) {
        blockingReasons.push({ code, message: `Hard failure: ${code}` })
      }
      return {
        accepted,
        decision: 'unverified',
        score: null,
        qualityUnverified: true,
        blockingReasons,
        review: { ...review, overallScore: null, decision: 'unverified' }
      }
    }

    const score = this.computeScore(review)
    const blockingReasons = []
    if (review.technical?.decodable === false) {
      blockingReasons.push({ code: 'UNDECODABLE', message: 'The image failed the technical decode check.' })
    }
    for (const code of review.hardFailures) {
      blockingReasons.push({ code, message: `Hard failure: ${code}` })
    }
    for (const [name, minimum] of Object.entries(this.dimensionMinimums)) {
      const actual = review.dimensions[name]?.score
      if (actual != null && actual < minimum) {
        blockingReasons.push({
          code: 'DIMENSION_BELOW_MINIMUM',
          dimension: name,
          actual,
          required: minimum,
          message: `${name} scored ${actual}; minimum is ${minimum}.`
        })
      }
    }
    if (score == null || score < this.minAcceptScore) {
      blockingReasons.push({
        code: 'TOTAL_SCORE_BELOW_MINIMUM',
        actual: score,
        required: this.minAcceptScore,
        message: `Quality score ${score ?? 'unknown'}; minimum is ${this.minAcceptScore}.`
      })
    }
    const accepted = blockingReasons.length === 0
    const decision = accepted ? 'accept' : 'retry'
    return {
      accepted,
      decision,
      score,
      qualityUnverified: false,
      blockingReasons,
      review: {
        ...review,
        reportedOverallScore: review.overallScore,
        reportedDecision: review.decision,
        overallScore: score,
        decision
      }
    }
  }
}

/** Stable functional API used by the runtime adapter. */
export function evaluateImageReview(normalized, policyOptions = {}) {
  const policy = policyOptions instanceof QualityPolicy
    ? policyOptions
    : new QualityPolicy(policyOptions)
  return policy.evaluate(normalized)
}

export default QualityPolicy
