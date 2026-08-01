import test from 'node:test'
import assert from 'node:assert/strict'

import { createHeadlessImageArtifactStore } from '../src/agent/runtime/headlessImageTool.js'
import {
  VIDEO_TASK_PENDING_CODE,
  buildHeadlessVideoRequest,
  createHeadlessGenerateVideoTool,
  extractHeadlessVideoUrls
} from '../src/agent/runtime/headlessVideoTool.js'

function route(model, overrides = {}) {
  return {
    capability: 'image_to_video',
    model,
    provider: 'dataeyes',
    profile: { defaultParams: { ratio: '16:9', duration: 5, resolution: '720p' } },
    ...overrides
  }
}

function createModelStore() {
  return {
    currentProvider: { value: 'dataeyes' },
    currentVideoBaseUrl: 'https://provider.example',
    adaptRequest: (_type, payload) => ({ ...payload, adapted: true }),
    adaptResponse: (_type, response) => response,
    getVideoEndpoint: () => 'https://provider.example/v1/videos',
    getVideoTaskEndpoint: () => 'https://provider.example/v1/videos/{taskId}'
  }
}

function sharedStore() {
  let index = 0
  const store = createHeadlessImageArtifactStore({ idFactory: record =>
    record.kind === 'image' ? `image-${++index}` : `video-${++index}`
  })
  const imageArtifactId = store.put({
    kind: 'image',
    mediaType: 'image',
    status: 'completed',
    source: 'https://media.example/source.png'
  })
  return { store, imageArtifactId }
}

test('headless generate_video resolves the shared image artifact and stores a direct video URL', async () => {
  const { store, imageArtifactId } = sharedStore()
  const selected = route('custom-video')
  selected.candidates = [selected]
  const calls = []
  const routerCalls = []
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: {
      route(capability, options) {
        routerCalls.push({ capability, options })
        return selected
      }
    },
    artifactStore: store,
    apiClient: {
      async createVideoTask(payload, options) {
        calls.push({ payload, options })
        return { data: { output_url: 'https://media.example/videos/result.mp4' } }
      }
    }
  })

  const result = await tool.execute({
    imageArtifactId,
    prompt: '镜头环绕汽车',
    ratio: '9:16',
    duration: 10
  })

  assert.equal(routerCalls[0].capability, 'image_to_video')
  assert.equal(routerCalls[0].options.referenceImage, true)
  assert.equal(calls[0].payload.first_frame_image, 'https://media.example/source.png')
  assert.equal(calls[0].payload.size, '9:16')
  assert.equal(calls[0].payload.seconds, 10)
  assert.equal(calls[0].payload.adapted, true)
  assert.equal(result.sourceArtifactId, imageArtifactId)
  assert.equal(result.fallbackAttempts, 1)
  assert.doesNotMatch(JSON.stringify(result), /media\.example|result\.mp4/)
  assert.equal(tool.resolveArtifact(result.artifactId).source, 'https://media.example/videos/result.mp4')
})

test('headless generate_video polls an accepted task until the real video is ready', async () => {
  const { store, imageArtifactId } = sharedStore()
  const selected = route('custom-video')
  selected.candidates = [selected]
  const pollEndpoints = []
  let polls = 0
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => selected },
    artifactStore: store,
    pollIntervalMs: 0,
    maxPollAttempts: 3,
    apiClient: {
      async createVideoTask() {
        return { data: [{ id: 'task/with space' }] }
      },
      async getVideoTaskStatus(_taskId, options) {
        polls += 1
        pollEndpoints.push(options.endpoint)
        return polls === 1
          ? { status: 'processing' }
          : { status: 'completed', data: { video_url: 'https://media.example/video/final.webm' } }
      }
    }
  })

  const result = await tool.execute({ source: `artifact:${imageArtifactId}`, prompt: '自然推进镜头' })

  assert.equal(result.taskId, 'task/with space')
  assert.equal(result.pollAttempts, 2)
  assert.deepEqual(pollEndpoints, [
    'https://provider.example/v1/videos/task%2Fwith%20space',
    'https://provider.example/v1/videos/task%2Fwith%20space'
  ])
  assert.equal(tool.resolveArtifact(result.artifactId).source, 'https://media.example/video/final.webm')
})

test('temporary task creation failure switches to the next routed model', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('video-a')
  const second = route('video-b')
  const calls = []
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    apiClient: {
      async createVideoTask(payload) {
        calls.push(payload.model)
        if (payload.model === 'video-a') {
          throw Object.assign(new Error('upstream unavailable'), { status: 503 })
        }
        return { output: { video_url: 'https://media.example/video/fallback.mp4' } }
      }
    }
  })

  const result = await tool.execute({ imageArtifactId, prompt: 'fallback test' })

  assert.deepEqual(calls, ['video-a', 'video-b'])
  assert.equal(result.model, 'video-b')
  assert.equal(result.fallbackAttempts, 2)
})

test('default headless video client uses direct fetch with video credentials and AbortSignal', async () => {
  const { store, imageArtifactId } = sharedStore()
  const selected = route('custom-video')
  selected.candidates = [selected]
  const requests = []
  const modelStore = {
    ...createModelStore(),
    currentVideoApiKey: { value: 'video-secret' }
  }
  const tool = createHeadlessGenerateVideoTool({
    modelStore,
    modelRouter: { route: () => selected },
    artifactStore: store,
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          output: { video_url: 'https://media.example/video/direct.mp4' }
        })
      }
    }
  })

  const result = await tool.execute({ imageArtifactId, prompt: 'direct video fetch' })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'https://provider.example/v1/videos')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer video-secret')
  assert.ok(requests[0].options.signal instanceof AbortSignal)
  assert.equal(JSON.parse(requests[0].options.body).model, 'custom-video')
  assert.equal(tool.resolveArtifact(result.artifactId).source, 'https://media.example/video/direct.mp4')
})

test('a successful video response with no recognized URL or task ID never submits a fallback model', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('accepted-video')
  const second = route('must-not-create')
  const calls = []
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    apiClient: {
      async createVideoTask(payload) {
        calls.push(payload.model)
        return { status: 'accepted' }
      }
    }
  })

  await assert.rejects(
    tool.execute({ imageArtifactId, prompt: 'ambiguous accepted response' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.code === 'PROVIDER_EMPTY_VIDEO_RESULT' &&
      error.lastError?.status === 200
  )
  assert.deepEqual(calls, ['accepted-video'])
})

test('a terminal failure after task acceptance never creates a fallback task', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('accepted-video')
  const second = route('must-not-create')
  const creates = []
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    pollIntervalMs: 0,
    maxPollAttempts: 2,
    apiClient: {
      async createVideoTask(payload) {
        creates.push(payload.model)
        return { taskId: 'accepted-task' }
      },
      async getVideoTaskStatus() {
        return { status: 'failed', message: 'temporary upstream failure' }
      }
    }
  })

  await assert.rejects(
    tool.execute({ imageArtifactId, prompt: 'accepted task failure' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.code === 'VIDEO_TASK_FAILED'
  )
  assert.deepEqual(creates, ['accepted-video'])
})

test('a non-retryable poll error after task acceptance remains marked as accepted', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('accepted-video')
  const second = route('must-not-create')
  const creates = []
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    pollIntervalMs: 0,
    apiClient: {
      async createVideoTask(payload) {
        creates.push(payload.model)
        return { taskId: 'accepted-auth-task' }
      },
      async getVideoTaskStatus() {
        throw Object.assign(new Error('status endpoint forbidden'), { status: 403, code: 'FORBIDDEN' })
      }
    }
  })

  await assert.rejects(
    tool.execute({ imageArtifactId, prompt: 'accepted task auth error' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.acceptedByProvider === true &&
      error.lastError?.taskId === 'accepted-auth-task'
  )
  assert.deepEqual(creates, ['accepted-video'])
})

test('transient poll failures retry the accepted task without creating a second task', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('accepted-video')
  const second = route('must-not-create')
  let creates = 0
  let polls = 0
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    pollIntervalMs: 0,
    maxPollAttempts: 4,
    maxTransientPollErrors: 2,
    apiClient: {
      async createVideoTask() {
        creates += 1
        return { taskId: 'task-1' }
      },
      async getVideoTaskStatus() {
        polls += 1
        if (polls === 1) throw Object.assign(new Error('temporary upstream'), { status: 503 })
        return { status: 'completed', video_url: 'https://media.example/video/recovered.mp4' }
      }
    }
  })

  const result = await tool.execute({ imageArtifactId, prompt: 'recover poll' })

  assert.equal(creates, 1)
  assert.equal(polls, 2)
  assert.equal(result.fallbackAttempts, 1)
})

test('poll exhaustion reports a pending task and never submits a fallback model', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('pending-video')
  const second = route('must-not-create')
  const creates = []
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    pollIntervalMs: 0,
    maxPollAttempts: 2,
    apiClient: {
      async createVideoTask(payload) {
        creates.push(payload.model)
        return { id: 'still-running' }
      },
      async getVideoTaskStatus() {
        return { status: 'processing' }
      }
    }
  })

  await assert.rejects(
    tool.execute({ imageArtifactId, prompt: 'long video' }),
    error => error.code === 'MODEL_FALLBACK_STOPPED' &&
      error.lastError?.code === VIDEO_TASK_PENDING_CODE
  )
  assert.deepEqual(creates, ['pending-video'])
})

test('AbortSignal stops polling and does not start another candidate', async () => {
  const { store, imageArtifactId } = sharedStore()
  const first = route('active-video')
  const second = route('must-not-create')
  const controller = new AbortController()
  let creates = 0
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => ({ ...first, candidates: [first, second] }) },
    artifactStore: store,
    pollIntervalMs: 10_000,
    maxPollAttempts: 3,
    apiClient: {
      async createVideoTask() {
        creates += 1
        return { id: 'cancel-task' }
      },
      async getVideoTaskStatus() {
        controller.abort('user stop')
        return { status: 'processing' }
      }
    }
  })

  await assert.rejects(
    tool.execute({ imageArtifactId, prompt: 'cancel test' }, { signal: controller.signal }),
    error => error.name === 'AbortError'
  )
  assert.equal(creates, 1)
})

test('Kling request profile matches the audited DataEyes execution contract', () => {
  const request = buildHeadlessVideoRequest({
    ratio: '9x16',
    duration: 10,
    negativePrompt: '画面抖动'
  }, route('kling-v2-5-turbo'), createModelStore(), '汽车广告', 'data:image/png;base64,c291cmNl')

  assert.equal(request.protocol, 'kling')
  assert.equal(request.endpoint, 'https://provider.example/v1/videos')
  assert.deepEqual(request.payload, {
    model: 'kling-v2-5-turbo',
    prompt: '汽车广告',
    duration: 10,
    aspect_ratio: '9:16',
    mode: 'std',
    cfg_scale: 0.5,
    image: 'data:image/png;base64,c291cmNl',
    negative_prompt: '画面抖动'
  })
})

test('raw media URLs are rejected in favor of shared artifact references', async () => {
  const { store } = sharedStore()
  const tool = createHeadlessGenerateVideoTool({
    modelStore: createModelStore(),
    modelRouter: { route: () => route('video') },
    artifactStore: store,
    apiClient: {}
  })

  await assert.rejects(
    tool.execute({ source: 'https://media.example/source.png', prompt: 'invalid input' }),
    /不接受媒体 URL/
  )
})

test('extractHeadlessVideoUrls ignores unrelated URLs and accepts provider video fields', () => {
  assert.deepEqual(extractHeadlessVideoUrls({
    docs: 'https://provider.example/docs',
    result: { video_url: 'https://cdn.example/download/output?id=1' },
    data: [{ url: 'https://cdn.example/video/render.mp4' }]
  }), [
    'https://cdn.example/download/output?id=1',
    'https://cdn.example/video/render.mp4'
  ])
})
