import { sanitizeContextValue } from './ContextManager.js'

const ACTION_NAMES = new Set(['generate_image', 'generate_video', 'finish'])

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
  constructor({ llm = null, systemPrompt = '' } = {}) {
    this.llm = llm
    this.systemPrompt = systemPrompt
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
      system: `${this.systemPrompt || 'You are YUFENG Creative Agent.'}\nReturn exactly one JSON object: {"name":"generate_image|generate_video|finish","input":{},"reason":"..."}. Never return an action list.`,
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
