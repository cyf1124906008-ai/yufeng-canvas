import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { ModelRouter, inferRoutingPolicy } from '../src/agent/ModelRouter.js'

function createStore(overrides = {}) {
  return {
    currentProvider: ref('dataeyes'),
    selectedChatModel: ref('chat-selected'),
    selectedImageModel: ref('image-selected'),
    selectedVideoModel: ref('video-selected'),
    availableChatModels: ref([{ key: 'chat-first' }, { key: 'chat-selected' }]),
    availableImageModels: ref([{ key: 'image-first' }, { key: 'image-selected' }]),
    availableVideoModels: ref([{ key: 'video-first' }, { key: 'video-selected' }]),
    currentChatApiKey: ref('chat-key'),
    currentImageApiKey: ref('image-key'),
    currentVideoApiKey: ref('video-key'),
    ...overrides
  }
}

test('ModelRouter keeps model names outside the Agent capability contract', () => {
  const router = new ModelRouter(createStore())

  assert.equal(router.route('generate_image').model, 'image-selected')
  assert.equal(router.route('image_to_video').model, 'video-selected')
  assert.equal(router.route('generate_text').model, 'chat-selected')
})

test('ModelRouter falls back to the first available capability model', () => {
  const router = new ModelRouter(createStore({ selectedImageModel: ref('missing') }))

  assert.equal(router.route('text_to_image').model, 'image-first')
})

test('ModelRouter rejects a capability without its API key', () => {
  const router = new ModelRouter(createStore({ currentVideoApiKey: ref('') }))

  assert.throws(() => router.route('generate_video'), /API Key/)
})

test('V0.3 ranks declared model intelligence differently for quality, speed, and cost', () => {
  const router = new ModelRouter(createStore({
    selectedImageModel: ref('balanced-default'),
    availableImageModels: ref([
      {
        key: 'balanced-default',
        quality: 70,
        speed: 70,
        cost: { amount: 5, currency: 'CNY', unit: 'image' }
      },
      {
        key: 'quality-pro',
        quality: 100,
        speed: 30,
        cost: { amount: 10, currency: 'CNY', unit: 'image' }
      },
      {
        key: 'speed-turbo',
        quality: 55,
        speed: 100,
        cost: { amount: 6, currency: 'CNY', unit: 'image' }
      },
      {
        key: 'economy-lite',
        quality: 50,
        speed: 50,
        cost: { amount: 1, currency: 'CNY', unit: 'image' }
      }
    ])
  }))

  assert.equal(router.route('text_to_image', { policy: 'quality' }).model, 'quality-pro')
  assert.equal(router.route('text_to_image', { policy: 'speed' }).model, 'speed-turbo')
  assert.equal(router.route('text_to_image', { policy: 'economy' }).model, 'economy-lite')
})

test('V0.3 applies hard capability and supported-parameter constraints before preference', () => {
  const router = new ModelRouter(createStore({
    selectedVideoModel: ref('preferred-text-only'),
    availableVideoModels: ref([
      {
        key: 'preferred-text-only',
        type: 't2v',
        ratios: ['16:9'],
        durs: [5]
      },
      {
        key: 'compatible-image-video',
        type: 'i2v',
        ratios: ['9:16'],
        durs: [5, 10]
      }
    ])
  }))

  const route = router.route('image_to_video', { ratio: '9:16', duration: 10 })
  assert.equal(route.model, 'compatible-image-video')
  assert.equal(route.candidates.length, 1)
})

test('V0.3 infers bounded routing policies from the creative goal', () => {
  assert.equal(inferRoutingPolicy('请用最高质量做电影级产品广告'), 'quality')
  assert.equal(inferRoutingPolicy('赶时间，尽快给我一张图'), 'speed')
  assert.equal(inferRoutingPolicy('预算有限，尽量省钱'), 'cost')
  assert.equal(inferRoutingPolicy('做一张产品图'), 'balanced')
})
