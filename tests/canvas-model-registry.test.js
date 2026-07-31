import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { createCanvasModelRegistry } from '../src/agent/routing/createCanvasModelRegistry.js'

test('adapts all three Canvas capability groups without hard-locking the selected model', () => {
  const registry = createCanvasModelRegistry({
    currentProvider: 'dataeyes',
    selectedChatModel: 'chat-b',
    selectedImageModel: 'image-b',
    selectedVideoModel: 'video-b',
    availableChatModels: [{ key: 'chat-a' }, { key: 'chat-b' }],
    availableImageModels: [
      { key: 'image-a', label: 'Image A' },
      { key: 'image-b', label: 'Image B' }
    ],
    availableVideoModels: [{ key: 'video-a' }, { key: 'video-b' }]
  })

  assert.equal(registry.provider, 'dataeyes')
  assert.deepEqual(registry.preferences, {
    chat: 'chat-b',
    image: 'image-b',
    video: 'video-b'
  })
  assert.deepEqual(registry.byGroup.image.map((candidate) => candidate.key), ['image-a', 'image-b'])
  assert.equal(registry.byGroup.image[0].preferred, false)
  assert.equal(registry.byGroup.image[1].preferred, true)
  assert.equal(registry.candidates.length, 6)
})

test('merges routing metadata and legacy supported fields into a unified candidate', () => {
  const registry = createCanvasModelRegistry({
    currentProvider: 'dataeyes',
    selectedVideoModel: 'video-pro',
    availableVideoModels: [{
      key: 'video-pro',
      label: 'Video Pro',
      provider: ['dataeyes', 'backup'],
      type: 't2v+i2v',
      capabilities: ['text-to-video', 'image_to_video', 'start_end_frame'],
      defaultParams: { ratio: '9:16', duration: 5 },
      quality: 9,
      speed: { score: 7 },
      cost: { amount: 0.8, currency: 'CNY' },
      reliability: 0.97,
      availability: { status: 'online' },
      supported: { audio: true, custom: ['camera_control'] },
      ratios: ['16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      durs: [{ label: '5 s', key: 5 }, { label: '10 s', key: 10 }]
    }]
  })

  const candidate = registry.byGroup.video[0]
  assert.deepEqual(candidate.capabilities, ['text_to_video', 'image_to_video', 'start_end_frame'])
  assert.deepEqual(candidate.defaultParams, { ratio: '9:16', duration: 5 })
  assert.equal(candidate.quality, 9)
  assert.deepEqual(candidate.speed, { score: 7 })
  assert.deepEqual(candidate.cost, { amount: 0.8, currency: 'CNY' })
  assert.equal(candidate.reliability, 0.97)
  assert.deepEqual(candidate.availability, { status: 'online' })
  assert.deepEqual(candidate.supported, {
    audio: true,
    custom: ['camera_control'],
    ratios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p'],
    durations: [5, 10]
  })
  assert.deepEqual(candidate.providers, ['dataeyes', 'backup'])
  assert.deepEqual(registry.getCandidates('image_to_video').map((item) => item.key), ['video-pro'])
})

test('supports Vue refs and grouped selected/available compatibility stubs', () => {
  const registry = createCanvasModelRegistry({
    currentProvider: ref('local-provider'),
    selected: ref({
      chat: ref({ key: 'chat-ref' }),
      image: ref('image-ref'),
      video: ref('video-ref')
    }),
    available: ref({
      chat: ref([{ id: 'chat-ref', capabilities: { generate_text: true, analyze_image: true } }]),
      image: ref([{ id: 'image-ref' }]),
      video: ref([{ id: 'video-ref', type: 'i2v' }])
    })
  })

  assert.equal(registry.getPreference('analyze_image'), 'chat-ref')
  assert.deepEqual(registry.getCandidates('analyze_image').map((item) => item.key), ['chat-ref'])
  assert.deepEqual(registry.getCandidates('text_to_image').map((item) => item.key), ['image-ref'])
  assert.deepEqual(registry.getCandidates('image_to_video').map((item) => item.key), ['video-ref'])
  assert.deepEqual(registry.getCandidates('text_to_video'), [])
})

test('keeps an unavailable selection as preference metadata but never fabricates a candidate', () => {
  const registry = createCanvasModelRegistry({
    selectedImageModel: ref('missing-selected-model'),
    availableImageModels: ref([{ key: 'available-a' }, { key: 'available-b' }])
  })

  assert.equal(registry.preferences.image, 'missing-selected-model')
  assert.deepEqual(registry.byGroup.image.map((candidate) => candidate.key), ['available-a', 'available-b'])
  assert.equal(registry.byGroup.image.some((candidate) => candidate.preferred), false)
})

test('does not read store API key fields or leak secret-shaped model metadata', () => {
  let apiKeyReadCount = 0
  const store = {
    selectedImageModel: 'safe-image',
    availableImageModels: [{
      key: 'safe-image',
      apiKey: 'model-level-secret',
      defaultParams: {
        size: '1024x1024',
        authorization: 'nested-secret'
      },
      supported: {
        ratios: ['1:1'],
        access_token: 'supported-secret'
      }
    }]
  }

  Object.defineProperty(store, 'currentImageApiKey', {
    enumerable: true,
    get() {
      apiKeyReadCount += 1
      return 'store-secret'
    }
  })

  const registry = createCanvasModelRegistry(store)
  const serialized = JSON.stringify(registry.candidates)

  assert.equal(apiKeyReadCount, 0)
  assert.equal(serialized.includes('store-secret'), false)
  assert.equal(serialized.includes('model-level-secret'), false)
  assert.equal(serialized.includes('nested-secret'), false)
  assert.equal(serialized.includes('supported-secret'), false)
  assert.deepEqual(registry.byGroup.image[0].defaultParams, { size: '1024x1024' })
  assert.deepEqual(registry.byGroup.image[0].supported, { ratios: ['1:1'] })
})

test('infers legacy Vision chat and reference-only image capabilities conservatively', () => {
  const registry = createCanvasModelRegistry({
    availableChatModels: [{ key: 'gpt-4o-mini' }, { key: 'plain-chat' }],
    availableImageModels: [
      { key: 'text-image' },
      { key: 'edit-image', requiresReference: true }
    ]
  })

  assert.deepEqual(registry.getCandidates('analyze_image').map(model => model.key), ['gpt-4o-mini'])
  assert.deepEqual(registry.getCandidates('text_to_image').map(model => model.key), ['text-image'])
  assert.deepEqual(registry.getCandidates('image_to_image').map(model => model.key), ['edit-image'])
})
