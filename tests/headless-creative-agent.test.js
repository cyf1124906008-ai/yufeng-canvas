import test from 'node:test'
import assert from 'node:assert/strict'

import { useHeadlessCreativeAgent } from '../src/agent/runtime/useHeadlessCreativeAgent.js'
import { createHeadlessImageArtifactStore } from '../src/agent/runtime/headlessImageTool.js'

test('headless creative agent completes image generation and review without Canvas', async () => {
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'headless-image' })
  const generateImageTool = {
    execute: async () => {
      const artifactId = store.put({
        kind: 'image',
        mediaType: 'image',
        status: 'completed',
        source: 'https://media.example/poster.png',
        prompt: '海报',
        createdAt: Date.now()
      })
      return { status: 'completed', artifactId, artifactRef: `artifact:${artifactId}` }
    }
  }
  const analyzeImageTool = async input => ({
    status: 'completed',
    artifactId: input.artifactId,
    artifactRef: input.artifactRef,
    accepted: true,
    decision: 'accept',
    qualityUnverified: false,
    review: {
      artifactRef: input.artifactRef,
      hardFailures: [],
      technical: { decodable: true, width: 1024, height: 1024 }
    }
  })
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool,
    analyzeImageTool,
    plannerLlm: null
  })

  const result = await agent.run('生成一张黑银汽车海报')

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'finish'
  ])
  assert.equal(agent.snapshot.value.status, 'completed')
  assert.equal(agent.artifacts.value[0].id, 'headless-image')
  assert.equal(agent.artifacts.value[0].url, 'https://media.example/poster.png')
  assert.equal(agent.snapshot.value.artifacts[0].value.artifactId, 'headless-image')
  assert.doesNotMatch(JSON.stringify(agent.snapshot.value), /media\.example/)
})

test('headless creative agent cancellation remains available to the desktop UI', async () => {
  let started
  const generateImageTool = {
    execute: (_input, runtime) => new Promise((resolve, reject) => {
      started = true
      runtime.signal.addEventListener('abort', () => reject(runtime.signal.reason), { once: true })
    })
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    generateImageTool,
    analyzeImageTool: async () => ({}),
    plannerLlm: null
  })

  const pending = agent.run('生成图片')
  while (!started) await Promise.resolve()
  assert.equal(agent.cancel('用户停止'), true)
  await assert.rejects(pending)
  assert.equal(agent.snapshot.value.status, 'cancelled')
  assert.equal(agent.canRetry.value, false)
  assert.throws(() => agent.retry(), error => error.code === 'UNSAFE_AGENT_RETRY')
})

test('headless creative agent refuses programmatic retry after Provider acceptance', async () => {
  let calls = 0
  const generateImageTool = async () => {
    calls += 1
    const error = new Error('Provider accepted the request and is still working')
    error.code = 'VIDEO_TASK_PENDING'
    error.acceptedByProvider = true
    error.taskId = 'provider-task-1'
    throw error
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    generateImageTool,
    analyzeImageTool: async () => ({}),
    plannerLlm: null
  })

  await assert.rejects(agent.run('生成图片'), /still working/)
  assert.equal(agent.snapshot.value.error.acceptedByProvider, true)
  assert.equal(agent.canRetry.value, false)
  assert.throws(() => agent.retry(), error => error.code === 'UNSAFE_AGENT_RETRY')
  assert.equal(calls, 1)
})

test('headless creative agent autonomously continues from reviewed image to video', async () => {
  let id = 0
  const store = createHeadlessImageArtifactStore({ idFactory: record =>
    `${record.kind}-${++id}`
  })
  const generateImageTool = async () => {
    const artifactId = store.put({
      kind: 'image',
      mediaType: 'image',
      status: 'completed',
      source: 'https://media.example/frame.png'
    })
    return { artifactId, artifactRef: `artifact:${artifactId}` }
  }
  const analyzeImageTool = async input => ({
    artifactId: input.artifactId,
    artifactRef: input.artifactRef,
    accepted: true,
    decision: 'accept',
    review: { artifactRef: input.artifactRef, hardFailures: [] }
  })
  const generateVideoTool = async input => {
    assert.equal(input.imageArtifactId, 'image-1')
    const artifactId = store.put({
      kind: 'video',
      mediaType: 'video',
      status: 'completed',
      source: 'https://media.example/final.mp4'
    })
    return { artifactId, artifactRef: `artifact:${artifactId}` }
  }
  const agent = useHeadlessCreativeAgent({
    modelStore: {},
    modelRouter: {},
    artifactStore: store,
    generateImageTool,
    analyzeImageTool,
    generateVideoTool,
    plannerLlm: null
  })

  const result = await agent.run('制作一个 5 秒汽车广告视频', { targetType: 'video' })
  assert.deepEqual(result.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'generate_video',
    'finish'
  ])
  assert.equal(agent.artifacts.value.at(-1).kind, 'video')
  assert.equal(agent.artifacts.value.at(-1).url, 'https://media.example/final.mp4')
})
