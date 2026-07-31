import { sanitizeContextValue } from './ContextManager.js'

const ACTION_NAMES = new Set(['generate_image', 'analyze_image', 'generate_video', 'finish'])

const VIDEO_TERMS = /(?:视频|短片|影片|动画|动起来|tvc|video|film|movie)/i
const IMAGE_TERMS = /(?:图片|图像|海报|封面|照片|主视觉|poster|image|photo)/i
const DURATION = /(\d+(?:\.\d+)?)\s*(?:秒钟?|s(?:ec(?:ond)?s?)?)/iu
const AD_TERMS = /(?:广告|宣传片|推广片|commercial|ad\b)/i

function extractText(response) {
  if (typeof response === 'string') return response
  if (typeof response?.output_text === 'string') return response.output_text
  if (typeof response?.content === 'string') return response.content
  if (Array.isArray(response?.content)) {
    return response.content.map(item => item?.text || '').join('')
  }
  return response?.choices?.[0]?.message?.content || ''
}

function parseJson(text) {
  const trimmed = String(text || '').trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || trimmed
  const objectMatch = candidate.match(/\{[\s\S]*\}/)
  if (!objectMatch) throw new SyntaxError('Planner response did not contain a JSON object')
  return JSON.parse(objectMatch[0])
}

function normalizeAction(value) {
  const raw = value?.next_action || value
  if (Array.isArray(raw) || Array.isArray(raw?.actions)) {
    throw new TypeError('Planner must return exactly one next action')
  }
  const name = raw?.name || raw?.action || raw?.tool
  if (!ACTION_NAMES.has(name)) throw new TypeError(`Unsupported planner action: ${name}`)
  const input = raw?.input || raw?.arguments || raw?.params || {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Action input must be an object')
  }
  return {
    name,
    input,
    reason: raw?.reason || raw?.reasoning || '',
    source: 'llm'
  }
}

function mediaReference(output) {
  if (!output) return null
  const value = output.value
  if (typeof value === 'string') return value
  return value?.url || value?.imageUrl || value?.image || value?.src || value
}

function imageOutputs(state) {
  return (state?.outputs || []).filter(output => output.type === 'image')
}

function outputNodeId(output) {
  return output?.value?.outputNodeId || output?.value?.imageNodeId || ''
}

function artifactRef(output) {
  return output ? `output:${output.step}` : ''
}

export function findLatestImageReview(state) {
  const image = state?.latestOutput?.('image')
  if (!image) return null
  const imageId = outputNodeId(image)
  const ref = artifactRef(image)
  const observations = state?.observations || []

  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const observation = observations[index]
    if (observation.action !== 'analyze_image') continue
    const result = observation.result || {}
    if (
      (ref && result.artifactRef === ref) ||
      (imageId && [result.imageNodeId, result.outputNodeId].includes(imageId))
    ) {
      return observation
    }
  }
  return null
}

export function inferTargetType(goal) {
  const input = String(goal || '')
  if (VIDEO_TERMS.test(input)) return 'video'
  // “10 秒广告” implies a time-based deliverable even without the word 视频.
  if (DURATION.test(input) && AD_TERMS.test(input)) return 'video'
  if (IMAGE_TERMS.test(input)) return 'image'
  return 'image'
}

export function inferDuration(goal, fallback = 5) {
  const match = String(goal || '').match(DURATION)
  return match ? Number(match[1]) : fallback
}

export class Planner {
  constructor({
    llm = null,
    systemPrompt = '',
    observationEnabled = false,
    maxQualityRetries = 2,
    allowDegradedReview = true
  } = {}) {
    this.llm = llm
    this.systemPrompt = systemPrompt
    this.observationEnabled = observationEnabled
    this.maxQualityRetries = maxQualityRetries
    this.allowDegradedReview = allowDegradedReview
  }

  inferTargetType(goal) {
    return inferTargetType(goal)
  }

  async nextAction({ state, context, signal } = {}) {
    if (!state) throw new TypeError('Planner.nextAction requires state')

    if (this.llm) {
      try {
        const response = await this.#callLlm(state, context, signal)
        const action = normalizeAction(parseJson(extractText(response)))
        if (this.observationEnabled) {
          const expected = this.fallback(state)
          if (action.name !== expected.name) {
            return {
              ...expected,
              fallbackReason: `Planner requested ${action.name}, but the guarded next action is ${expected.name}.`
            }
          }

          const isQualityRetry = expected.name === 'generate_image' && expected.input?.revision > 1
          return {
            ...action,
            input: isQualityRetry
              ? { ...action.input, ...expected.input }
              : { ...expected.input, ...action.input }
          }
        }
        if (action.name === 'generate_video' && !state.hasOutput('image')) {
          return {
            ...this.fallback(state),
            fallbackReason: 'Planner requested video before a completed source image existed.'
          }
        }
        return action
      } catch (error) {
        return {
          ...this.fallback(state),
          fallbackReason: error?.message || String(error)
        }
      }
    }
    return this.fallback(state)
  }

  fallback(state) {
    const targetType = state.targetType || inferTargetType(state.goal)
    const commonInput = { prompt: state.goal, goal: state.goal }

    if (this.observationEnabled) {
      const images = imageOutputs(state)
      const latestImage = state.latestOutput('image')

      if (!latestImage) {
        return {
          name: 'generate_image',
          input: targetType === 'video'
            ? { ...commonInput, purpose: 'video_start_frame', revision: 1 }
            : { ...commonInput, revision: 1 },
          reason: targetType === 'video'
            ? 'Generate the source frame before reviewing and animating it.'
            : 'Generate the first image candidate.',
          source: 'fallback'
        }
      }

      const reviewObservation = findLatestImageReview(state)
      if (!reviewObservation) {
        const imageId = outputNodeId(latestImage)
        return {
          name: 'analyze_image',
          input: {
            goal: state.goal,
            imageNodeId: imageId,
            outputNodeId: imageId,
            artifactRef: artifactRef(latestImage),
            attempt: images.length,
            prompt: state.actions.find(action => action.step === latestImage.step)?.input?.prompt || state.goal
          },
          reason: 'Review the latest image before deciding whether it is ready.',
          source: 'fallback'
        }
      }

      const reviewResult = reviewObservation.result || {}
      if (reviewResult.qualityUnverified === true && !this.allowDegradedReview) {
        const error = new Error('A Vision review is required, but only a degraded technical review is available')
        error.code = 'VISION_REVIEW_REQUIRED'
        throw error
      }

      const accepted = (
        reviewResult.accepted === true || reviewResult.decision === 'accept'
      ) && (this.allowDegradedReview || reviewResult.qualityUnverified !== true)

      if (!accepted) {
        const retriesUsed = Math.max(0, images.length - 1)
        if (retriesUsed >= this.maxQualityRetries) {
          const error = new Error(`Image quality did not pass after ${images.length} candidates`)
          error.code = 'QUALITY_RETRIES_EXHAUSTED'
          throw error
        }

        return {
          name: 'generate_image',
          input: {
            goal: state.goal,
            prompt: reviewResult.nextPrompt || state.goal,
            negativePrompt: reviewResult.nextNegativePrompt || '',
            revision: images.length + 1,
            retryOf: reviewResult.artifactRef || artifactRef(latestImage),
            reviewRef: `review:${reviewResult.artifactRef || artifactRef(latestImage)}`,
            purpose: targetType === 'video' ? 'video_start_frame' : undefined
          },
          reason: 'The latest candidate did not pass quality review; generate an improved candidate.',
          source: 'fallback'
        }
      }

      if (targetType === 'video' && !state.hasOutput('video')) {
        return {
          name: 'generate_video',
          input: {
            ...commonInput,
            image: mediaReference(latestImage),
            imageNodeId: outputNodeId(latestImage),
            duration: inferDuration(state.goal)
          },
          reason: 'The reviewed source image is ready; generate the requested video.',
          source: 'fallback'
        }
      }

      return {
        name: 'finish',
        input: {},
        reason: 'The requested deliverable has a completed quality review.',
        source: 'fallback'
      }
    }

    if (targetType === 'video') {
      if (!state.hasOutput('image')) {
        return {
          name: 'generate_image',
          input: { ...commonInput, purpose: 'video_start_frame' },
          reason: 'A video target needs a source frame before video generation.',
          source: 'fallback'
        }
      }
      if (!state.hasOutput('video')) {
        return {
          name: 'generate_video',
          input: {
            ...commonInput,
            image: mediaReference(state.latestOutput('image')),
            duration: inferDuration(state.goal)
          },
          reason: 'The source image is ready; generate the requested video.',
          source: 'fallback'
        }
      }
    } else if (!state.hasOutput('image')) {
      return {
        name: 'generate_image',
        input: commonInput,
        reason: 'Generate the requested image deliverable.',
        source: 'fallback'
      }
    }

    return {
      name: 'finish',
      input: {},
      reason: 'The requested deliverable exists.',
      source: 'fallback'
    }
  }

  async #callLlm(state, context, signal) {
    const payload = {
      system: `${this.systemPrompt || 'You are YUFENG Creative Agent.'}\nReturn exactly one JSON object: {"name":"generate_image|analyze_image|generate_video|finish","input":{},"reason":"..."}. Never return an action list.`,
      goal: state.goal,
      targetType: state.targetType,
      state: sanitizeContextValue(state.snapshot()),
      messages: sanitizeContextValue(context?.toMessages?.() || []),
      signal
    }
    if (typeof this.llm === 'function') return this.llm(payload)
    if (typeof this.llm.nextAction === 'function') return this.llm.nextAction(payload)
    if (typeof this.llm.complete === 'function') return this.llm.complete(payload)
    throw new TypeError('llm must be a function or expose nextAction/complete')
  }
}

export default Planner
