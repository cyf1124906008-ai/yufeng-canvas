import { findLatestImageReview } from './Planner.js'

export class Verifier {
  constructor({ requireImageReview = false, allowDegradedReview = true } = {}) {
    this.requireImageReview = requireImageReview
    this.allowDegradedReview = allowDegradedReview
  }

  verifyFinish(state) {
    if (!state) return { ok: false, reason: 'Agent state is missing.' }
    const requiredType = state.targetType === 'video' ? 'video' : 'image'
    if (!state.hasOutput(requiredType)) {
      return {
        ok: false,
        requiredType,
        reason: `Cannot finish before a ${requiredType} result has been produced.`
      }
    }

    if (this.requireImageReview) {
      const reviewObservation = findLatestImageReview(state)
      if (!reviewObservation) {
        return {
          ok: false,
          requiredType,
          reason: 'Cannot finish before the latest image has been reviewed.'
        }
      }

      const review = reviewObservation.result || {}
      if (review.qualityUnverified === true && !this.allowDegradedReview) {
        return {
          ok: false,
          requiredType,
          reason: 'Cannot finish because a Vision review is required.'
        }
      }

      const accepted = review.accepted === true || review.decision === 'accept'
      if (!accepted) {
        return {
          ok: false,
          requiredType,
          reason: 'Cannot finish while the latest image quality review requires a retry.'
        }
      }
    }
    return { ok: true, requiredType }
  }

  verify(state) {
    return this.verifyFinish(state)
  }
}

export default Verifier
