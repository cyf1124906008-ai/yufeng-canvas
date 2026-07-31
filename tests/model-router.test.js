import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'

import { ModelRouter } from '../src/agent/ModelRouter.js'

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
