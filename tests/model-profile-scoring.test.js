import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ModelProfile,
  normalizeModelProfile
} from '../src/agent/routing/ModelProfile.js'
import {
  ModelScorer,
  filterCompatibleModels,
  inspectModelCompatibility,
  rankModelProfiles
} from '../src/agent/routing/ModelScorer.js'

function imageModel(key, overrides = {}) {
  return {
    key,
    provider: ['dataeyes'],
    capabilities: ['generate_image'],
    quality: { score: 0.7 },
    speed: { score: 0.7 },
    cost: { amount: 1, currency: 'CNY', unit: 'image' },
    reliability: { score: 0.9 },
    availability: true,
    ...overrides
  }
}

test('normalizes legacy video model fields into a standard ModelProfile', () => {
  const profile = normalizeModelProfile({
    label: 'Legacy I2V',
    key: 'legacy-i2v',
    provider: ['dataeyes', 'yufeng'],
    type: 't2v+i2v',
    ratios: ['16x9', '9:16'],
    durs: [{ label: '5 秒', key: 5 }, { label: '10 秒', key: 10 }],
    resolutions: ['720P', '1080p']
  }, { provider: 'yufeng' })

  assert.ok(profile instanceof ModelProfile)
  assert.equal(profile.id, 'legacy-i2v')
  assert.equal(profile.provider, 'yufeng')
  assert.deepEqual(profile.providers, ['dataeyes', 'yufeng'])
  assert.ok(profile.capabilities.includes('generate_video'))
  assert.ok(profile.capabilities.includes('image_to_video'))
  assert.deepEqual(profile.supported.ratios, ['16:9', '9:16'])
  assert.deepEqual(profile.supported.durations, [5, 10])
  assert.deepEqual(profile.supported.resolutions, ['720p', '1080p'])
  assert.equal(profile.supported.referenceImage, true)
})

test('missing intelligence metadata remains explicit and conservative', () => {
  const profile = normalizeModelProfile({
    key: 'legacy-image',
    sizes: ['1024x1024']
  })

  assert.deepEqual(profile.capabilities, ['generate_image'])
  assert.equal(profile.quality.score, null)
  assert.equal(profile.quality.known, false)
  assert.equal(profile.speed.score, null)
  assert.equal(profile.cost.amount, null)
  assert.equal(profile.reliability.known, false)
  assert.deepEqual(profile.availability, {
    available: true,
    known: false,
    reason: 'not_reported',
    source: 'unknown'
  })
})

test('hard capability and supported-parameter filters reject incompatible models', () => {
  const models = [
    imageModel('poster', { supported: { ratios: ['1:1'] } }),
    {
      key: 'video-vertical',
      capabilities: ['image_to_video'],
      available: true,
      supported: { ratios: ['9:16'], durations: [10], referenceImage: true }
    },
    {
      key: 'video-short',
      capabilities: ['image_to_video'],
      available: true,
      supported: { ratios: ['9:16'], durations: [5], referenceImage: true }
    }
  ]

  const compatible = filterCompatibleModels(models, {
    capability: 'generate_video',
    supported: { ratio: '9x16', duration: 10, referenceImage: true }
  })
  assert.deepEqual(compatible.map(profile => profile.key), ['video-vertical'])

  const rejected = inspectModelCompatibility(models[0], { capability: 'generate_video' })
  assert.equal(rejected.compatible, false)
  assert.ok(rejected.reasons.includes('missing_capability:generate_video'))
})

test('explicitly unavailable models are always removed before scoring', () => {
  const models = [
    imageModel('offline-perfect', { quality: 1, availability: { available: false, reason: 'maintenance' } }),
    imageModel('online-normal', { quality: 0.6, availability: true })
  ]

  const ranked = rankModelProfiles(models, { capability: 'generate_image' }, 'quality')
  assert.deepEqual(ranked.map(result => result.profile.key), ['online-normal'])
})

test('quality, speed, and cost policies choose different declared strengths', () => {
  const models = [
    imageModel('premium', {
      quality: 1,
      speed: 0.35,
      cost: { amount: 8, currency: 'CNY', unit: 'image' },
      reliability: 0.9
    }),
    imageModel('fast', {
      quality: 0.55,
      speed: 1,
      cost: { amount: 4, currency: 'CNY', unit: 'image' },
      reliability: 0.9
    }),
    imageModel('cheap', {
      quality: 0.5,
      speed: 0.5,
      cost: { amount: 1, currency: 'CNY', unit: 'image' },
      reliability: 0.9
    })
  ]
  const scorer = new ModelScorer()

  assert.equal(scorer.select(models, { capability: 'generate_image' }, 'quality').profile.key, 'premium')
  assert.equal(scorer.select(models, { capability: 'generate_image' }, 'speed').profile.key, 'fast')
  assert.equal(scorer.select(models, { capability: 'generate_image' }, 'cost').profile.key, 'cheap')
})

test('unknown metrics use labeled conservative defaults rather than fabricated profile values', () => {
  const ranked = rankModelProfiles([
    { key: 'unknown', capabilities: ['generate_image'] },
    imageModel('known-moderate', {
      quality: 0.6,
      speed: 0.6,
      cost: { amount: 2, currency: 'CNY', unit: 'image' },
      reliability: 0.6
    })
  ], { capability: 'generate_image' })

  assert.equal(ranked[0].profile.key, 'known-moderate')
  const unknown = ranked.find(result => result.profile.key === 'unknown')
  assert.equal(unknown.profile.quality.score, null)
  assert.equal(unknown.components.quality.known, false)
  assert.equal(unknown.components.quality.source, 'conservative_default')
})

test('equal scores use a stable key tie-break independent of input order', () => {
  const alpha = imageModel('alpha')
  const beta = imageModel('beta')

  assert.deepEqual(
    rankModelProfiles([beta, alpha], { capability: 'generate_image' }).map(item => item.profile.key),
    ['alpha', 'beta']
  )
})

test('supports discovered endpoint formats and explicit score scales', () => {
  const profile = normalizeModelProfile({
    id: 'discovered-image',
    supported_endpoint_types: ['image-generation'],
    provider: 'dataeyes',
    qualityScore: 8,
    speed_score: 75,
    successRate: 0.98,
    pricing: { cost: { amount: 0.08, currency: 'cny', unit: 'image' } },
    status: 'online'
  })

  assert.equal(profile.key, 'discovered-image')
  assert.deepEqual(profile.capabilities, ['generate_image'])
  assert.equal(profile.quality.score, 0.8)
  assert.equal(profile.speed.score, 0.75)
  assert.equal(profile.reliability.score, 0.98)
  assert.equal(profile.cost.currency, 'CNY')
  assert.equal(profile.availability.available, true)
})

test('canonical profile JSON can be normalized again without inventing known metadata', () => {
  const first = normalizeModelProfile({
    key: 'round-trip',
    capabilities: ['generate_image'],
    supported: { ratios: [] }
  })
  const second = normalizeModelProfile(JSON.parse(JSON.stringify(first)))

  assert.equal(second.availability.available, true)
  assert.equal(second.availability.known, false)
  assert.equal(second.supported.known.ratios, true)
  assert.equal(second.quality.known, false)
})
