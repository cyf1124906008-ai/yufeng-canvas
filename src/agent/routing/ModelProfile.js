const CAPABILITY_ALIASES = Object.freeze({
  chat: 'generate_text',
  text: 'generate_text',
  text_generation: 'generate_text',
  image: 'generate_image',
  text_to_image: 'generate_image',
  image_generation: 'generate_image',
  video: 'generate_video',
  video_generation: 'generate_video',
  vision: 'analyze_image',
  image_understanding: 'analyze_image',
  visual_understanding: 'analyze_image'
})

const VIDEO_ENDPOINTS = new Set(['video', 'videos', 'openai_videos', 'doubao'])
const IMAGE_ENDPOINTS = new Set(['image', 'images', 'image_generation'])
const TEXT_ENDPOINTS = new Set(['chat', 'openai', 'openai_response', 'anthropic', 'gemini'])

export class ModelProfileValidationError extends TypeError {
  constructor(message, code = 'MODEL_PROFILE_INVALID') {
    super(message)
    this.name = 'ModelProfileValidationError'
    this.code = code
  }
}

function valueAt(object, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], object)
    if (value !== undefined && value !== null) return { value, path }
  }
  return { value: undefined, path: null }
}

function uniqueStrings(values) {
  return [...new Set(values
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => value !== undefined && value !== null && value !== '')
    .map(value => String(value).trim())
    .filter(Boolean))]
}

export function normalizeCapability(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
  return CAPABILITY_ALIASES[normalized] || normalized
}

function capabilityValues(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(/[,+]/)
  if (value && typeof value === 'object') {
    return Object.entries(value).filter(([, enabled]) => enabled === true).map(([name]) => name)
  }
  return []
}

function endpointCapabilities(raw) {
  const endpoints = uniqueStrings([
    raw.endpointTypes,
    raw.endpoint_types,
    raw.supported_endpoint_types,
    raw.endpoints
  ]).flatMap(value => value.split(/[,+]/))
    .map(value => value.trim().toLowerCase().replaceAll('-', '_'))
    .filter(Boolean)
  const capabilities = []
  if (endpoints.some(value => VIDEO_ENDPOINTS.has(value))) capabilities.push('generate_video')
  if (endpoints.some(value => IMAGE_ENDPOINTS.has(value))) capabilities.push('generate_image')
  if (endpoints.some(value => TEXT_ENDPOINTS.has(value))) capabilities.push('generate_text')
  return capabilities
}

function inferLegacyCapabilities(raw) {
  const capabilities = []
  const type = String(raw.type || '').trim().toLowerCase()
  if (type.includes('t2v')) capabilities.push('text_to_video', 'generate_video')
  if (type.includes('i2v')) capabilities.push('image_to_video', 'generate_video')
  if (Array.isArray(raw.sizes) || raw.defaultParams?.size) capabilities.push('generate_image')
  if (Array.isArray(raw.ratios) || Array.isArray(raw.durs) || Array.isArray(raw.resolutions)) {
    capabilities.push('generate_video')
  }
  if (raw.supportsVision === true) capabilities.push('analyze_image')
  return capabilities
}

function normalizeCapabilities(raw, options) {
  const explicit = capabilityValues(raw.capabilities ?? raw.capability)
  const defaults = capabilityValues(options.defaultCapabilities ?? options.capability)
  const values = [
    ...explicit,
    ...defaults,
    ...endpointCapabilities(raw),
    ...inferLegacyCapabilities(raw)
  ].map(normalizeCapability).filter(Boolean)

  // Specialized video capabilities also satisfy the generic generation action.
  if (values.includes('image_to_video') || values.includes('text_to_video')) {
    values.push('generate_video')
  }
  return [...new Set(values)]
}

function normalizedUnitScore(value) {
  if (!Number.isFinite(value) || value < 0) return null
  if (value <= 1) return value
  if (value <= 10) return value / 10
  if (value <= 100) return value / 100
  return null
}

function normalizeScoredMetric(raw, paths, extra = {}) {
  const selected = valueAt(raw, paths)
  const metric = selected.value
  const object = metric && typeof metric === 'object' && !Array.isArray(metric) ? metric : null
  const scoreValue = object ? object.score ?? object.value ?? object.rating : metric
  const score = normalizedUnitScore(scoreValue)
  const result = {
    score,
    known: score !== null,
    source: score !== null ? selected.path : 'unknown',
    ...extra
  }
  return { result, object, selected }
}

function normalizeQuality(raw) {
  return normalizeScoredMetric(raw, [
    'quality', 'qualityScore', 'quality_score', 'metrics.quality', 'scores.quality'
  ]).result
}

function normalizeSpeed(raw) {
  const normalized = normalizeScoredMetric(raw, [
    'speed', 'speedScore', 'speed_score', 'metrics.speed', 'scores.speed'
  ], { latencyMs: null })
  const latency = normalized.object?.latencyMs ?? normalized.object?.latency_ms ??
    valueAt(raw, ['latencyMs', 'latency_ms', 'metrics.latencyMs']).value
  if (Number.isFinite(latency) && latency >= 0) {
    normalized.result.latencyMs = latency
    normalized.result.known = true
    if (normalized.result.source === 'unknown') normalized.result.source = 'latencyMs'
  }
  return normalized.result
}

function normalizeReliability(raw) {
  const normalized = normalizeScoredMetric(raw, [
    'reliability', 'reliabilityScore', 'reliability_score', 'metrics.reliability', 'scores.reliability'
  ], { successRate: null })
  const successValue = normalized.object?.successRate ?? normalized.object?.success_rate ??
    valueAt(raw, ['successRate', 'success_rate', 'metrics.successRate']).value
  const successRate = normalizedUnitScore(successValue)
  if (successRate !== null) {
    normalized.result.successRate = successRate
    normalized.result.known = true
    if (normalized.result.score === null) normalized.result.score = successRate
    if (normalized.result.source === 'unknown') normalized.result.source = 'successRate'
  }
  return normalized.result
}

function normalizeCost(raw, options) {
  const selected = valueAt(raw, ['cost', 'pricing.cost', 'price', 'metrics.cost'])
  const cost = selected.value
  const object = cost && typeof cost === 'object' && !Array.isArray(cost) ? cost : null
  const amount = object ? object.amount ?? object.value : cost
  const validAmount = Number.isFinite(amount) && amount >= 0 ? amount : null
  const currency = object?.currency ?? raw.currency ?? options.defaultCurrency ?? null
  const unit = object?.unit ?? object?.per ?? raw.costUnit ?? options.defaultCostUnit ?? null
  return {
    amount: validAmount,
    currency: typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : null,
    unit: typeof unit === 'string' && unit.trim() ? unit.trim() : null,
    known: validAmount !== null,
    source: validAmount !== null ? selected.path : 'unknown'
  }
}

function normalizeAvailability(raw) {
  const direct = raw.availability
  const object = direct && typeof direct === 'object' && !Array.isArray(direct) ? direct : null
  let value = typeof direct === 'boolean' ? direct : object?.available
  let source = value !== undefined ? 'availability' : null

  if (value === undefined && typeof object?.status === 'string') {
    const status = object.status.trim().toLowerCase()
    if (['available', 'online', 'ready', 'healthy', 'active'].includes(status)) value = true
    if (['unavailable', 'offline', 'disabled', 'error', 'inactive'].includes(status)) value = false
    if (value !== undefined) source = 'availability.status'
  }

  if (value === undefined && typeof raw.available === 'boolean') {
    value = raw.available
    source = 'available'
  }
  if (value === undefined && typeof raw.enabled === 'boolean') {
    value = raw.enabled
    source = 'enabled'
  }
  if (value === undefined && typeof raw.status === 'string') {
    const status = raw.status.trim().toLowerCase()
    if (['available', 'online', 'ready', 'healthy', 'active'].includes(status)) value = true
    if (['unavailable', 'offline', 'disabled', 'error', 'inactive'].includes(status)) value = false
    if (value !== undefined) source = 'status'
  }

  return {
    // Missing availability means “not reported”, not a fabricated outage.
    available: value === undefined ? true : value === true,
    known: object?.known === false ? false : value !== undefined,
    reason: object?.reason ?? raw.unavailableReason ?? (value === undefined ? 'not_reported' : null),
    source: object?.source ?? source ?? 'unknown'
  }
}

function normalizeRatio(value) {
  return String(value || '').trim().replace(/^([0-9.]+)x([0-9.]+)$/i, '$1:$2')
}

function listFrom(rawValue, map = value => value) {
  const values = Array.isArray(rawValue) ? rawValue : rawValue == null ? [] : [rawValue]
  return [...new Set(values.map(value => {
    const item = value && typeof value === 'object' ? value.key ?? value.value ?? value.id : value
    return map(item)
  }).filter(value => value !== '' && value !== null && value !== undefined))]
}

function selectSupported(raw, names) {
  return valueAt(raw, names.map(name => `supported.${name}`).concat(names)).value
}

function normalizeSupported(raw, capabilities) {
  const ratiosRaw = selectSupported(raw, ['ratios', 'aspectRatios', 'aspect_ratios'])
  const resolutionsRaw = selectSupported(raw, ['resolutions', 'resolution'])
  const durationsRaw = selectSupported(raw, ['durations', 'duration', 'durs'])
  const sizesRaw = selectSupported(raw, ['sizes', 'imageSizes', 'image_sizes'])
  const audioRaw = selectSupported(raw, ['audio', 'supportsAudio'])
  const referenceRaw = selectSupported(raw, ['referenceImage', 'reference_image', 'supportsReferenceImage'])
  const multiReferenceRaw = selectSupported(raw, ['multiImageReference', 'multi_image_reference'])

  const declaredKnown = raw.supported?.known || {}
  return {
    ratios: listFrom(ratiosRaw, normalizeRatio),
    resolutions: listFrom(resolutionsRaw, value => String(value || '').trim().toLowerCase()),
    durations: listFrom(durationsRaw, value => Number(value)).filter(Number.isFinite),
    sizes: listFrom(sizesRaw, value => String(value || '').trim().toLowerCase()),
    audio: typeof audioRaw === 'boolean' ? audioRaw : null,
    referenceImage: typeof referenceRaw === 'boolean'
      ? referenceRaw
      : capabilities.includes('image_to_video') ? true : null,
    multiImageReference: typeof multiReferenceRaw === 'boolean' ? multiReferenceRaw : null,
    known: {
      ratios: declaredKnown.ratios ?? ratiosRaw !== undefined,
      resolutions: declaredKnown.resolutions ?? resolutionsRaw !== undefined,
      durations: declaredKnown.durations ?? durationsRaw !== undefined,
      sizes: declaredKnown.sizes ?? sizesRaw !== undefined,
      audio: declaredKnown.audio ?? typeof audioRaw === 'boolean',
      referenceImage: declaredKnown.referenceImage ??
        (typeof referenceRaw === 'boolean' || capabilities.includes('image_to_video')),
      multiImageReference: declaredKnown.multiImageReference ?? typeof multiReferenceRaw === 'boolean'
    }
  }
}

function normalizeProviders(raw, options) {
  const providers = uniqueStrings([raw.providers, raw.provider])
  const preferred = String(options.provider || '').trim()
  const provider = preferred && (providers.length === 0 || providers.includes(preferred))
    ? preferred
    : providers[0] || preferred || null
  return { provider, providers }
}

/** Canonical, provider-agnostic model intelligence record. */
export class ModelProfile {
  constructor(raw, options = {}) {
    if (typeof raw === 'string') raw = { key: raw }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ModelProfileValidationError('Model profile must be an object')
    }
    const key = String(raw.key ?? raw.id ?? raw.model ?? raw.modelId ?? '').trim()
    if (!key) {
      throw new ModelProfileValidationError('Model profile requires id or key', 'MODEL_PROFILE_ID_REQUIRED')
    }
    const id = String(raw.id ?? key).trim()
    const { provider, providers } = normalizeProviders(raw, options)
    const capabilities = normalizeCapabilities(raw, options)

    this.id = id
    this.key = key
    this.label = String(raw.label ?? raw.name ?? key).trim()
    this.provider = provider
    this.providers = providers
    this.capabilities = capabilities
    this.quality = normalizeQuality(raw)
    this.speed = normalizeSpeed(raw)
    this.cost = normalizeCost(raw, options)
    this.reliability = normalizeReliability(raw)
    this.availability = normalizeAvailability(raw)
    this.supported = normalizeSupported(raw, capabilities)
  }

  supports(capability) {
    return this.capabilities.includes(normalizeCapability(capability))
  }
}

export function normalizeModelProfile(raw, options = {}) {
  return raw instanceof ModelProfile ? raw : new ModelProfile(raw, options)
}

export function normalizeModelProfiles(models, options = {}) {
  if (!Array.isArray(models)) throw new TypeError('models must be an array')
  return models.map(model => normalizeModelProfile(model, options))
}

export default ModelProfile
