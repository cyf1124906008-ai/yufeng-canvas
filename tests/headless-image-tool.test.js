import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BACKGROUND_PENDING_CODE,
  createHeadlessGenerateImageTool,
  createHeadlessImageArtifactStore,
  normalizeHeadlessImageResponse
} from '../src/agent/runtime/headlessImageTool.js'

function route(model, overrides = {}) {
  return {
    capability: 'text_to_image',
    model,
    provider: 'dataeyes',
    profile: { defaultParams: { size: '1024x1024' } },
    ...overrides
  }
}

function createModelStore(protocolFor = () => 'image') {
  return {
    currentProvider: { value: 'dataeyes' },
    adaptRequest: (_type, payload) => ({ ...payload, adapted: true }),
    adaptResponse: (_type, response) => response.data,
    getImageModelProtocol: protocolFor,
    getImageEndpoint: () => 'https://provider.example/v1/images/generations',
    getChatEndpoint: () => 'https://provider.example/v1/chat/completions'
  }
}

function deterministicStore() {
  let id = 0
  return createHeadlessImageArtifactStore({ idFactory: () => `artifact-${++id}` })
}

test('headless generate_image calls the image Provider and returns only stable artifact references', async () => {
  const selected = route('image-a')
  selected.candidates = [selected]
  const requests = []
  const store = deterministicStore()
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => selected },
    artifactStore: store,
    apiClient: {
      async generateImage(payload, options) {
        requests.push({ payload, options })
        return { data: [{ url: 'https://media.example/generated.png', revised_prompt: 'refined' }] }
      }
    }
  })

  const result = await tool.execute({ prompt: '一辆黑银色概念车' })

  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].payload, {
    model: 'image-a',
    prompt: '一辆黑银色概念车',
    size: '1024x1024',
    adapted: true
  })
  assert.equal(requests[0].options.endpoint, 'https://provider.example/v1/images/generations')
  assert.equal(result.artifactId, 'artifact-1')
  assert.equal(result.artifactRef, 'artifact:artifact-1')
  assert.equal(result.fallbackAttempts, 1)
  assert.doesNotMatch(JSON.stringify(result), /media\.example|generated\.png/)
  assert.equal(store.get('artifact-1').source, 'https://media.example/generated.png')
  assert.equal(tool.resolveArtifact('artifact-1').revisedPrompt, 'refined')
})

test('headless generate_image preserves ModelRouter candidate order and retries transient Provider errors', async () => {
  const first = route('image-a')
  const second = route('image-b')
  const routing = { ...first, candidates: [first, second] }
  const calls = []
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => routing },
    artifactStore: deterministicStore(),
    apiClient: {
      async generateImage(payload) {
        calls.push(payload.model)
        if (payload.model === 'image-a') {
          throw Object.assign(new Error('upstream unavailable'), { status: 503 })
        }
        return { data: [{ b64_json: 'c2Vjb25kLW1vZGVs' }] }
      }
    }
  })

  const result = await tool.execute({ prompt: '产品主视觉' })

  assert.deepEqual(calls, ['image-a', 'image-b'])
  assert.equal(result.model, 'image-b')
  assert.equal(result.fallbackAttempts, 2)
  assert.equal(tool.resolveArtifact(result.artifactId).source, 'data:image/png;base64,c2Vjb25kLW1vZGVs')
})

test('default headless image client uses direct fetch without loading Canvas request modules', async () => {
  const selected = route('image-direct')
  selected.candidates = [selected]
  const requests = []
  const tool = createHeadlessGenerateImageTool({
    modelStore: {
      ...createModelStore(),
      currentImageApiKey: { value: 'image-secret' }
    },
    modelRouter: { route: () => selected },
    artifactStore: deterministicStore(),
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: [{ url: 'https://media.example/direct.png' }]
        })
      }
    }
  })

  const result = await tool.execute({ prompt: 'direct fetch' })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://provider.example/v1/images/generations')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer image-secret')
  assert.ok(requests[0].options.signal instanceof AbortSignal)
  assert.equal(JSON.parse(requests[0].options.body).model, 'image-direct')
  assert.equal(tool.resolveArtifact(result.artifactId).source, 'https://media.example/direct.png')
})

test('a successful image response with no recognized media never submits a fallback model', async () => {
  const first = route('accepted-image')
  const second = route('must-not-run')
  const calls = []
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: deterministicStore(),
    apiClient: {
      async generateImage(payload) {
        calls.push(payload.model)
        return { data: [] }
      }
    }
  })

  await assert.rejects(
    tool.execute({ prompt: 'ambiguous accepted response' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.code === 'PROVIDER_EMPTY_IMAGE_RESULT' &&
      error.lastError?.status === 200
  )
  assert.deepEqual(calls, ['accepted-image'])
})

test('chat-protocol image models use the existing chat image client without Canvas', async () => {
  const selected = route('gemini-image-preview')
  selected.candidates = [selected]
  let chatRequest
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(() => 'chat'),
    modelRouter: { route: () => selected },
    artifactStore: deterministicStore(),
    apiClient: {
      async generateImageWithChat(payload, options) {
        chatRequest = { payload, options }
        return {
          choices: [{ message: { content: '完成：![image](https://media.example/chat-image.webp)' } }]
        }
      }
    }
  })

  const result = await tool.execute({ prompt: '未来城市海报', size: '1536x1024' })

  assert.equal(chatRequest.payload.model, 'gemini-image-preview')
  assert.match(chatRequest.payload.messages[0].content[0].text, /1536x1024/)
  assert.equal(chatRequest.options.endpoint, 'https://provider.example/v1/chat/completions')
  assert.equal(result.protocol, 'chat')
  assert.equal(tool.resolveArtifact(result.artifactId).source, 'https://media.example/chat-image.webp')
})

test('an unsupported image endpoint falls back to chat protocol for the same model', async () => {
  const selected = route('hybrid-image')
  selected.candidates = [selected]
  const calls = []
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(() => 'image'),
    modelRouter: { route: () => selected },
    artifactStore: deterministicStore(),
    apiClient: {
      async generateImage() {
        calls.push('image')
        throw Object.assign(new Error('unsupported model for image generation'), { status: 404 })
      },
      async generateImageWithChat() {
        calls.push('chat')
        return { data: [{ url: 'https://media.example/hybrid.png' }] }
      }
    }
  })

  const result = await tool.execute({ prompt: '混合协议测试' })

  assert.deepEqual(calls, ['image', 'chat'])
  assert.equal(result.protocol, 'chat')
  assert.equal(result.fallbackAttempts, 1)
})

test('Electron background-pending timeout suppresses model fallback to avoid duplicate billing', async () => {
  const first = route('slow-image')
  const second = route('must-not-run')
  const calls = []
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: deterministicStore(),
    apiClient: {
      async generateImage(payload) {
        calls.push(payload.model)
        throw Object.assign(new Error('frontend wait expired'), { _frontendTimeout: true })
      }
    }
  })

  await assert.rejects(
    tool.execute({ prompt: '不要重复扣费' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.code === BACKGROUND_PENDING_CODE
  )
  assert.deepEqual(calls, ['slow-image'])
})

test('background-pending timeout after same-model chat fallback also suppresses another model', async () => {
  const first = route('hybrid-slow')
  const second = route('must-not-run')
  const calls = []
  const tool = createHeadlessGenerateImageTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: deterministicStore(),
    apiClient: {
      async generateImage(payload) {
        calls.push(`image:${payload.model}`)
        throw Object.assign(new Error('unsupported model for image generation'), { status: 404 })
      },
      async generateImageWithChat(payload) {
        calls.push(`chat:${payload.model}`)
        throw Object.assign(new Error('前端等待超时'), { _frontendTimeout: true })
      }
    }
  })

  await assert.rejects(
    tool.execute({ prompt: '混合协议后台任务' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.code === BACKGROUND_PENDING_CODE
  )
  assert.deepEqual(calls, ['image:hybrid-slow', 'chat:hybrid-slow'])
})

test('normalizeHeadlessImageResponse handles OpenAI, base64 and chat response shapes', () => {
  const records = normalizeHeadlessImageResponse({
    data: [
      { url: 'https://media.example/a.png' },
      { b64_json: 'YmFzZTY0' }
    ],
    choices: [{ message: { content: '<img src="https://media.example/b.webp">' } }]
  })

  assert.deepEqual(records.map(record => record.url), [
    'https://media.example/a.png',
    'data:image/png;base64,YmFzZTY0',
    'https://media.example/b.webp'
  ])
})
