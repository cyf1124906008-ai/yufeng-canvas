import { unref } from 'vue'
import { ModelScorer } from './routing/ModelScorer.js'
import { createCanvasModelRegistry } from './routing/createCanvasModelRegistry.js'

const CAPABILITY_GROUPS = {
  chat: new Set([
    'chat',
    'generate_text',
    'text_generation',
    'analyze_image',
    'analyze_video'
  ]),
  image: new Set([
    'image',
    'generate_image',
    'text_to_image',
    'image_to_image',
    'image_edit',
    'edit_image',
    'upscale'
  ]),
  video: new Set([
    'video',
    'generate_video',
    'text_to_video',
    'image_to_video',
    'start_end_frame'
  ])
}

const STORE_FIELDS = {
  chat: { apiKey: 'currentChatApiKey' },
  image: { apiKey: 'currentImageApiKey' },
  video: { apiKey: 'currentVideoApiKey' }
}

const GROUP_LABELS = {
  chat: '文本',
  image: '图片',
  video: '视频'
}

const QUALITY_POLICY_TERMS = /(?:最高质量|最佳质量|高质量|高品质|电影级|大片感|精品|精细|premium|best quality|high quality|cinematic)/i
const SPEED_POLICY_TERMS = /(?:尽快|快速|最快|马上|立刻|秒出|赶时间|fast|quick|urgent)/i
const COST_POLICY_TERMS = /(?:省钱|便宜|低成本|控制成本|经济型|预算有限|economy|cheap|low cost|budget)/i

function read(value) {
  return unref(value)
}

function modelKey(model) {
  return typeof model === 'string' ? model : model?.key || model?.id || model?.model || ''
}

function compactSupported(options = {}) {
  const supported = {
    ratio: options.ratio,
    resolution: options.resolution,
    duration: options.duration ?? options.dur,
    size: options.size,
    audio: options.audio === true ? true : undefined,
    referenceImage: options.referenceImage === true || options.hasReference === true ? true : undefined,
    multiImageReference: options.multiImageReference === true ? true : undefined
  }
  return Object.fromEntries(Object.entries(supported).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function preferenceBonus(options = {}) {
  const value = Number(options.preferenceBonus)
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 0.2) : 0.06
}

export function normalizeCapability(capability = '') {
  return String(capability).trim().toLowerCase().replaceAll('-', '_')
}

export function resolveCapabilityGroup(capability) {
  const normalized = normalizeCapability(capability)
  const group = Object.entries(CAPABILITY_GROUPS)
    .find(([, capabilities]) => capabilities.has(normalized))?.[0]

  if (!group) throw new Error(`不支持的模型能力: ${capability || '(empty)'}`)
  return { normalized, group }
}

export function inferRoutingPolicy(goal = '', explicitPolicy) {
  if (explicitPolicy && typeof explicitPolicy === 'object') return explicitPolicy
  const explicit = String(explicitPolicy || '').trim().toLowerCase()
  if (['quality', 'speed', 'balanced', 'cost'].includes(explicit)) return explicit
  if (['economy', 'budget', 'cheap'].includes(explicit)) return 'cost'

  const text = String(goal || '')
  if (COST_POLICY_TERMS.test(text)) return 'cost'
  if (SPEED_POLICY_TERMS.test(text)) return 'speed'
  if (QUALITY_POLICY_TERMS.test(text)) return 'quality'
  return 'balanced'
}

/**
 * Model-intelligence router for the active Canvas provider.
 *
 * Agent actions only name a capability. The router adapts the current model
 * store into ModelProfiles, applies hard task constraints, scores compatible
 * candidates and returns a stable order for runtime fallback.
 */
export class ModelRouter {
  constructor(modelStore, {
    registryFactory = createCanvasModelRegistry,
    scorerFactory = (policy, provider) => new ModelScorer({
      policy,
      normalizeOptions: { provider }
    })
  } = {}) {
    if (!modelStore) throw new Error('ModelRouter 需要 modelStore')
    this.modelStore = modelStore
    this.registryFactory = registryFactory
    this.scorerFactory = scorerFactory
  }

  rank(capability, options = {}) {
    const { normalized, group } = resolveCapabilityGroup(capability)
    const provider = String(read(this.modelStore.currentProvider) || '').trim()
    this.#assertApiKey(group, provider)

    const registry = this.registryFactory(this.modelStore)
    const candidates = registry.byGroup?.[group] || []
    const policy = inferRoutingPolicy(options.goal || options.prompt, options.policy || options.routingPolicy)
    const requirements = {
      capability: normalized,
      ...(provider ? { provider } : {}),
      supported: compactSupported(options)
    }
    const scorer = this.scorerFactory(policy, provider)
    const scored = scorer.rank(candidates, requirements, policy)
    const originals = new Map(candidates.map((candidate) => [modelKey(candidate), candidate]))
    const selectedPreference = registry.getPreference?.(group) || ''
    const selectedLocked = options.lockSelected === true || registry.getRoutingMode?.(group) === 'locked'
    const bonus = preferenceBonus(options)

    const ranked = scored
      .map((entry) => {
        const candidate = originals.get(entry.profile.key) || entry.profile
        const preferred = candidate.preferred === true || entry.profile.key === selectedPreference
        const preferredContribution = preferred ? bonus : 0
        return {
          capability: normalized,
          type: group,
          model: entry.profile.key,
          profile: candidate,
          modelProfile: entry.profile,
          provider: entry.profile.provider || provider,
          score: entry.score + preferredContribution,
          scoreBreakdown: {
            ...entry.components,
            preference: {
              value: preferred ? 1 : 0,
              known: true,
              source: preferred ? 'user_preference' : 'not_preferred',
              weight: bonus,
              contribution: preferredContribution
            }
          },
          policy,
          preferred,
          baseRank: entry.rank
        }
      })
      .sort((left, right) =>
        right.score - left.score ||
        left.baseRank - right.baseRank ||
        left.model.localeCompare(right.model)
      )
    // A concrete model chosen in the Workbench can be locked explicitly.
    // Keep the intelligent scorer as the default, but do not silently replace
    // a user's deliberate model choice when the selected candidate satisfies
    // the task constraints. If it is incompatible, retain the safe ranked
    // fallback instead of fabricating an impossible route.
    const selected = selectedLocked && selectedPreference
      ? ranked.filter(entry => entry.model === selectedPreference)
      : []
    const ordered = selected.length ? selected : ranked

    return ordered
      .map((entry, index) => ({ ...entry, rank: index + 1 }))
  }

  route(capability, options = {}) {
    const { normalized, group } = resolveCapabilityGroup(capability)
    const candidates = this.rank(normalized, options)
    if (!candidates.length) {
      const error = new Error(`当前 Provider 没有满足任务约束的${GROUP_LABELS[group]}模型`)
      error.code = 'NO_COMPATIBLE_MODEL'
      throw error
    }

    return {
      ...candidates[0],
      candidates
    }
  }

  select(capability, options) {
    return this.route(capability, options)
  }

  selectModel(capability, options) {
    return this.route(capability, options)
  }

  getModel(capability, options) {
    return this.route(capability, options).model
  }

  #assertApiKey(group, provider) {
    const directApiKey = read(this.modelStore[STORE_FIELDS[group].apiKey])
    const apiKey = directApiKey || this.modelStore.getApiKeyByProvider?.(provider, group) || ''
    if (!String(apiKey).trim()) {
      throw new Error(`请先为当前 Provider 配置${GROUP_LABELS[group]} API Key`)
    }
  }
}

export function createModelRouter(modelStore, options) {
  return new ModelRouter(modelStore, options)
}

export default ModelRouter
