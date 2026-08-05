import { unref } from 'vue'

const GROUP_CONFIG = {
  chat: {
    selected: 'selectedChatModel',
    available: 'availableChatModels',
    defaultCapabilities: ['generate_text']
  },
  image: {
    selected: 'selectedImageModel',
    available: 'availableImageModels',
    defaultCapabilities: ['text_to_image']
  },
  video: {
    selected: 'selectedVideoModel',
    available: 'availableVideoModels',
    defaultCapabilities: ['text_to_video', 'image_to_video']
  }
}

const CAPABILITY_GROUPS = {
  chat: 'chat',
  generate_text: 'chat',
  text_generation: 'chat',
  analyze_image: 'chat',
  analyze_video: 'chat',
  image: 'image',
  generate_image: 'image',
  text_to_image: 'image',
  image_to_image: 'image',
  image_edit: 'image',
  edit_image: 'image',
  upscale: 'image',
  video: 'video',
  generate_video: 'video',
  text_to_video: 'video',
  image_to_video: 'video',
  start_end_frame: 'video'
}

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'secret',
  'access_token',
  'accesstoken',
  'token'
])

const VISION_MODEL_NAME_PATTERN = /(?:vision|multimodal|gpt-4o|gpt-4\.1|gpt-5|claude-(?:3|4)|gemini|qwen[^\s]*(?:vl|vision)|(?:^|[-_])vl(?:[-_]|$)|glm-4v|doubao[^\s]*vision)/i

function read(value) {
  return unref(value)
}

function normalizeName(value = '') {
  return String(value).trim().toLowerCase().replaceAll('-', '_')
}

function modelKey(model) {
  const value = read(model)
  if (typeof value === 'string') return value.trim()
  return String(value?.key || value?.id || value?.model || '').trim()
}

function safeClone(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object') return value
  if (seen.has(value)) return undefined

  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => safeClone(item, seen)).filter((item) => item !== undefined)
  }

  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) continue
    const cloned = safeClone(item, seen)
    if (cloned !== undefined) result[key] = cloned
  }
  return result
}

function normalizeStringList(value) {
  const raw = read(value)
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(normalizeName).filter(Boolean))]
  }
  if (raw && typeof raw === 'object') {
    return [...new Set(Object.entries(raw)
      .filter(([, enabled]) => Boolean(read(enabled)))
      .map(([name]) => normalizeName(name))
      .filter(Boolean))]
  }
  return [...new Set(String(raw || '')
    .split(',')
    .map(normalizeName)
    .filter(Boolean))]
}

function inferCapabilities(model, group) {
  const configured = normalizeStringList(model.capabilities)
  if (configured.length) return configured

  if (group === 'chat') {
    const modalities = normalizeStringList(
      model.modalities ?? model.inputModalities ?? model.supportedModalities
    )
    const modelName = [model.key, model.id, model.name, model.label].filter(Boolean).join(' ')
    const supportsVision = model.supportsVision === false
      ? false
      : model.supportsVision === true ||
        modalities.some((value) => ['image', 'vision', 'visual'].includes(value)) ||
        VISION_MODEL_NAME_PATTERN.test(modelName)
    return supportsVision
      ? ['generate_text', 'analyze_image']
      : ['generate_text']
  }

  if (group === 'image' && model.requiresReference === true) {
    return ['image_to_image', 'image_edit']
  }

  if (group === 'video') {
    const legacyType = normalizeName(model.type)
    const inferred = []
    if (legacyType.includes('t2v')) inferred.push('text_to_video')
    if (legacyType.includes('i2v')) inferred.push('image_to_video')
    if (inferred.length) return inferred
  }

  return [...GROUP_CONFIG[group].defaultCapabilities]
}

function normalizeProviders(value) {
  const raw = read(value)
  const providers = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return [...new Set(providers.map((provider) => String(provider).trim()).filter(Boolean))]
}

function legacyDurations(model) {
  const durations = model.durations || model.durs
  if (!Array.isArray(durations)) return undefined
  return durations
    .map((item) => Number(typeof item === 'object' ? item?.key : item))
    .filter(Number.isFinite)
}

function mergeSupported(model) {
  const explicit = safeClone(model.supported)
  const supported = explicit && !Array.isArray(explicit) && typeof explicit === 'object'
    ? explicit
    : (Array.isArray(explicit) ? { features: explicit } : {})

  const mergeLegacy = (key, value) => {
    if (supported[key] !== undefined || value === undefined) return
    const cloned = safeClone(value)
    if (cloned !== undefined) supported[key] = cloned
  }

  mergeLegacy('sizes', model.sizes)
  mergeLegacy('ratios', model.ratios)
  mergeLegacy('resolutions', model.resolutions)
  mergeLegacy('durations', legacyDurations(model))
  mergeLegacy('audio', model.audio ?? model.supportsAudio)
  mergeLegacy('reference_image', model.reference_image ?? model.requiresReference)

  return supported
}

function readGroupValue(modelStore, group, kind) {
  const directField = GROUP_CONFIG[group][kind]
  const direct = read(modelStore?.[directField])
  if (direct !== undefined && direct !== null) return direct

  const grouped = read(modelStore?.[kind])
  return read(grouped?.[group])
}

function createCandidate(modelValue, { group, provider, selectedKey }) {
  const raw = read(modelValue)
  const model = typeof raw === 'string' ? { key: raw, label: raw } : (raw || {})
  const key = modelKey(model)
  if (!key) return null

  const providers = normalizeProviders(model.provider ?? model.providers)
  const preferred = key === selectedKey

  return {
    id: `${group}:${key}`,
    key,
    model: key,
    label: String(model.label || model.name || key),
    group,
    type: group,
    modelType: model.type || '',
    provider: provider || providers[0] || '',
    providers,
    preferred,
    preference: preferred,
    capabilities: inferCapabilities(model, group),
    defaultParams: safeClone(model.defaultParams) || {},
    quality: safeClone(model.quality ?? model.qualityScore ?? model.quality_score),
    speed: safeClone(model.speed ?? (
      model.latencyMs != null || model.latency_ms != null
        ? { latencyMs: model.latencyMs ?? model.latency_ms }
        : undefined
    )),
    cost: safeClone(model.cost ?? model.pricing?.cost ?? (
      model.price != null
        ? { amount: model.price, currency: model.currency, unit: model.costUnit }
        : undefined
    )),
    reliability: safeClone(model.reliability ?? model.reliabilityScore ?? model.reliability_score ?? (
      model.successRate != null || model.success_rate != null
        ? { successRate: model.successRate ?? model.success_rate }
        : undefined
    )),
    availability: safeClone(model.availability ?? (
      typeof model.available === 'boolean'
        ? model.available
        : model.status ? { status: model.status } : true
    )),
    supported: mergeSupported(model),
    supportsVision: typeof model.supportsVision === 'boolean' ? model.supportsVision : undefined,
    modalities: safeClone(model.modalities ?? model.inputModalities ?? model.supportedModalities)
  }
}

function resolveGroup(groupOrCapability) {
  const normalized = normalizeName(groupOrCapability)
  return CAPABILITY_GROUPS[normalized] || ''
}

/**
 * Convert the current model store into a provider-neutral registry.
 * Selected models remain preference annotations in `auto` mode; an explicit
 * `locked` routing mode is carried separately so the router can honor a
 * deliberate user choice without weakening capability/availability filters.
 */
export function createCanvasModelRegistry(modelStore = {}) {
  const provider = String(read(modelStore.currentProvider ?? modelStore.provider) || '').trim()
  const preferences = {}
  const routingModes = {}
  const byGroup = {}

  for (const group of Object.keys(GROUP_CONFIG)) {
    const selectedKey = modelKey(readGroupValue(modelStore, group, 'selected'))
    const available = readGroupValue(modelStore, group, 'available')
    const values = Array.isArray(available) ? available : []
    const seen = new Set()

    preferences[group] = selectedKey
    const configuredModes = read(modelStore.modelRoutingModes ?? modelStore.routingModes)
    const configuredMode = configuredModes && typeof configuredModes === 'object'
      ? read(configuredModes[group])
      : ''
    routingModes[group] = configuredMode === 'locked' ? 'locked' : 'auto'
    byGroup[group] = values
      .map((model) => createCandidate(model, { group, provider, selectedKey }))
      .filter((candidate) => {
        if (!candidate || seen.has(candidate.key)) return false
        seen.add(candidate.key)
        return true
      })
  }

  const candidates = Object.values(byGroup).flat()

  const getCandidates = (groupOrCapability) => {
    const requested = normalizeName(groupOrCapability)
    const group = resolveGroup(requested)
    if (!group) return []

    const groupCandidates = byGroup[group] || []
    if (requested === group || requested === `generate_${group}`) return [...groupCandidates]
    return groupCandidates.filter((candidate) => candidate.capabilities.includes(requested))
  }

  const getPreference = (groupOrCapability) => {
    const group = resolveGroup(groupOrCapability)
    return group ? preferences[group] : ''
  }

  const getRoutingMode = (groupOrCapability) => {
    const group = resolveGroup(groupOrCapability)
    return group ? routingModes[group] : 'auto'
  }

  return {
    provider,
    preferences,
    candidates,
    byGroup,
    getCandidates,
    getPreference,
    getRoutingMode
  }
}

export {
  GROUP_CONFIG,
  createCandidate,
  inferCapabilities,
  mergeSupported,
  resolveGroup,
  safeClone
}

export default createCanvasModelRegistry
