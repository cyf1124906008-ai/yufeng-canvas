import { ModelProfile, normalizeCapability, normalizeModelProfile } from './ModelProfile.js'

export const MODEL_POLICY_PRESETS = Object.freeze({
  balanced: Object.freeze({ quality: 0.35, speed: 0.20, cost: 0.20, reliability: 0.20, availability: 0.05 }),
  quality: Object.freeze({ quality: 0.65, speed: 0.10, cost: 0.05, reliability: 0.15, availability: 0.05 }),
  speed: Object.freeze({ quality: 0.15, speed: 0.55, cost: 0.10, reliability: 0.15, availability: 0.05 }),
  cost: Object.freeze({ quality: 0.15, speed: 0.10, cost: 0.55, reliability: 0.15, availability: 0.05 })
})

export const DEFAULT_UNKNOWN_SCORES = Object.freeze({
  quality: 0.25,
  speed: 0.25,
  cost: 0.10,
  reliability: 0.25,
  availability: 0.50
})

function stableStringCompare(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function normalizeRatio(value) {
  return String(value || '').trim().replace(/^([0-9.]+)x([0-9.]+)$/i, '$1:$2')
}

function resolveWeights(policy) {
  const presetName = typeof policy === 'string' ? policy : policy?.preset || 'balanced'
  const preset = MODEL_POLICY_PRESETS[presetName]
  if (!preset) throw new TypeError(`Unknown model scoring policy: ${presetName}`)
  const supplied = typeof policy === 'object' ? policy.weights || {} : {}
  const merged = { ...preset, ...supplied }
  const positive = Object.fromEntries(Object.entries(merged).map(([name, value]) => [
    name,
    Number.isFinite(value) && value > 0 ? value : 0
  ]))
  const total = Object.values(positive).reduce((sum, value) => sum + value, 0)
  if (total <= 0) throw new TypeError('Model scoring weights must contain a positive value')
  return Object.fromEntries(Object.entries(positive).map(([name, value]) => [name, value / total]))
}

function resolvePolicy(policy = 'balanced') {
  const suppliedUnknown = typeof policy === 'object' ? policy.unknownScores || {} : {}
  const unknownScores = { ...DEFAULT_UNKNOWN_SCORES }
  for (const name of Object.keys(unknownScores)) {
    const value = suppliedUnknown[name]
    if (Number.isFinite(value) && value >= 0 && value <= 1) unknownScores[name] = value
  }
  return {
    weights: resolveWeights(policy),
    unknownScores,
    costCurrency: typeof policy === 'object' ? policy.costCurrency?.toUpperCase() || null : null,
    costUnit: typeof policy === 'object' ? policy.costUnit || null : null
  }
}

function requirementReasons(profile, requirements = {}) {
  const reasons = []
  const requiredCapabilities = [
    ...(Array.isArray(requirements.capabilities) ? requirements.capabilities : []),
    ...(requirements.capability ? [requirements.capability] : [])
  ].map(normalizeCapability)
  for (const capability of requiredCapabilities) {
    if (!profile.capabilities.includes(capability)) reasons.push(`missing_capability:${capability}`)
  }

  if (!profile.availability.available) reasons.push('unavailable')
  if (requirements.provider && profile.providers.length > 0 &&
      !profile.providers.includes(requirements.provider) && profile.provider !== requirements.provider) {
    reasons.push(`provider:${requirements.provider}`)
  }

  const supported = requirements.supported || requirements
  if (supported.ratio) {
    const ratio = normalizeRatio(supported.ratio)
    if (!profile.supported.known.ratios || !profile.supported.ratios.includes(ratio)) {
      reasons.push(`unsupported_ratio:${ratio}`)
    }
  }
  if (supported.resolution) {
    const resolution = String(supported.resolution).trim().toLowerCase()
    if (!profile.supported.known.resolutions || !profile.supported.resolutions.includes(resolution)) {
      reasons.push(`unsupported_resolution:${resolution}`)
    }
  }
  if (supported.duration != null) {
    const duration = Number(supported.duration)
    if (!profile.supported.known.durations || !profile.supported.durations.includes(duration)) {
      reasons.push(`unsupported_duration:${supported.duration}`)
    }
  }
  if (supported.size) {
    const size = String(supported.size).trim().toLowerCase()
    if (!profile.supported.known.sizes || !profile.supported.sizes.includes(size)) {
      reasons.push(`unsupported_size:${size}`)
    }
  }
  if (supported.audio === true && profile.supported.audio !== true) reasons.push('unsupported_audio')
  if (supported.referenceImage === true && profile.supported.referenceImage !== true) {
    reasons.push('unsupported_reference_image')
  }
  if (supported.multiImageReference === true && profile.supported.multiImageReference !== true) {
    reasons.push('unsupported_multi_image_reference')
  }
  return reasons
}

export function inspectModelCompatibility(model, requirements = {}, normalizeOptions = {}) {
  const profile = normalizeModelProfile(model, normalizeOptions)
  const reasons = requirementReasons(profile, requirements)
  return { compatible: reasons.length === 0, reasons, profile }
}

export function filterCompatibleModels(models, requirements = {}, normalizeOptions = {}) {
  return models
    .map(model => inspectModelCompatibility(model, requirements, normalizeOptions))
    .filter(result => result.compatible)
    .map(result => result.profile)
}

function metricUtility(profile, name, context) {
  if (name === 'availability') {
    return profile.availability.known
      ? { value: profile.availability.available ? 1 : 0, known: true, source: profile.availability.source }
      : { value: context.unknownScores.availability, known: false, source: 'conservative_default' }
  }
  if (name === 'speed') {
    if (profile.speed.score !== null) return { value: profile.speed.score, known: true, source: profile.speed.source }
    if (profile.speed.latencyMs !== null && context.latencyRange) {
      const { min, max } = context.latencyRange
      const value = max === min ? 1 : 1 - ((profile.speed.latencyMs - min) / (max - min))
      return { value, known: true, source: 'relative_latency' }
    }
    return { value: context.unknownScores.speed, known: false, source: 'conservative_default' }
  }
  if (name === 'cost') {
    const costKey = `${profile.cost.currency || ''}\u0000${profile.cost.unit || ''}`
    const range = context.costRanges.get(costKey)
    if (profile.cost.known && range && context.comparableCostKeys.has(costKey)) {
      const value = range.max === range.min ? 1 : 1 - ((profile.cost.amount - range.min) / (range.max - range.min))
      return { value, known: true, source: 'relative_cost' }
    }
    return { value: context.unknownScores.cost, known: false, source: 'conservative_default' }
  }
  const metric = profile[name]
  if (metric?.score !== null && metric?.score !== undefined) {
    return { value: metric.score, known: true, source: metric.source }
  }
  return { value: context.unknownScores[name], known: false, source: 'conservative_default' }
}

function buildScoreContext(profiles, policy) {
  const costGroups = new Map()
  for (const profile of profiles) {
    if (!profile.cost.known) continue
    if (policy.costCurrency && profile.cost.currency !== policy.costCurrency) continue
    if (policy.costUnit && profile.cost.unit !== policy.costUnit) continue
    const key = `${profile.cost.currency || ''}\u0000${profile.cost.unit || ''}`
    const values = costGroups.get(key) || []
    values.push(profile.cost.amount)
    costGroups.set(key, values)
  }
  const largestGroupSize = Math.max(0, ...[...costGroups.values()].map(values => values.length))
  const largestGroups = [...costGroups.entries()]
    .filter(([, values]) => values.length === largestGroupSize && largestGroupSize >= 2)
  // Never compare equally represented currencies/units without a conversion rule.
  const comparableCostKeys = new Set(largestGroups.length === 1 ? [largestGroups[0][0]] : [])
  const costRanges = new Map([...costGroups.entries()].map(([key, values]) => [key, {
    min: Math.min(...values),
    max: Math.max(...values)
  }]))

  const latencies = profiles.map(profile => profile.speed.latencyMs).filter(value => value !== null)
  const latencyRange = latencies.length >= 2
    ? { min: Math.min(...latencies), max: Math.max(...latencies) }
    : null
  return { ...policy, costRanges, comparableCostKeys, latencyRange }
}

function scoreProfile(profile, context) {
  const components = {}
  let score = 0
  for (const [name, weight] of Object.entries(context.weights)) {
    const utility = metricUtility(profile, name, context)
    const contribution = utility.value * weight
    components[name] = { ...utility, weight, contribution }
    score += contribution
  }
  return { profile, score, components }
}

/**
 * Rank only compatible models. Equal scores use key then id as a stable,
 * input-order-independent tie break.
 */
export function rankModelProfiles(models, requirements = {}, policy = 'balanced', normalizeOptions = {}) {
  const compatible = filterCompatibleModels(models, requirements, normalizeOptions)
  const resolvedPolicy = resolvePolicy(policy)
  const context = buildScoreContext(compatible, resolvedPolicy)
  return compatible
    .map(profile => scoreProfile(profile, context))
    .sort((left, right) =>
      right.score - left.score ||
      stableStringCompare(left.profile.key, right.profile.key) ||
      stableStringCompare(left.profile.id, right.profile.id)
    )
    .map((result, index) => ({ ...result, rank: index + 1 }))
}

export class ModelScorer {
  constructor({ policy = 'balanced', normalizeOptions = {} } = {}) {
    this.policy = policy
    this.normalizeOptions = normalizeOptions
  }

  filter(models, requirements = {}) {
    return filterCompatibleModels(models, requirements, this.normalizeOptions)
  }

  rank(models, requirements = {}, policy = this.policy) {
    return rankModelProfiles(models, requirements, policy, this.normalizeOptions)
  }

  select(models, requirements = {}, policy = this.policy) {
    return this.rank(models, requirements, policy)[0] || null
  }
}

export { ModelProfile }

export default ModelScorer
