import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveImageNode } from '../src/agent/runtime/analyzeImageTool.js'
import {
  createHeadlessAnalyzeImageTool
} from '../src/agent/runtime/headlessAnalyzeImageTool.js'
import { createHeadlessImageArtifactStore } from '../src/agent/runtime/headlessImageTool.js'

test('shared analyzer resolves a direct headless artifact without loading Canvas', async () => {
  const image = await resolveImageNode({
    artifactId: 'image-direct',
    image: 'https://media.example/direct.png',
    prompt: '产品海报'
  })

  assert.equal(image.id, 'image-direct')
  assert.equal(image.type, 'image')
  assert.equal(image.data.url, 'https://media.example/direct.png')
  assert.equal(image.data.prompt, '产品海报')
})

test('headless analyze_image resolves private media from artifact store', async () => {
  const store = createHeadlessImageArtifactStore({ idFactory: () => 'image-1' })
  store.put({
    kind: 'image',
    source: 'data:image/png;base64,cHJpdmF0ZQ==',
    prompt: '黑银汽车海报'
  })
  let received
  const analyze = createHeadlessAnalyzeImageTool({
    artifactStore: store,
    analyze: async (input) => {
      received = input
      return { status: 'completed', accepted: true, decision: 'accept' }
    }
  })

  const result = await analyze({
    artifactId: 'image-1',
    artifactRef: 'output:1'
  })

  assert.equal(received.image, 'data:image/png;base64,cHJpdmF0ZQ==')
  assert.equal(received.prompt, '黑银汽车海报')
  assert.equal(result.artifactId, 'image-1')
  assert.equal(result.imageArtifactId, 'image-1')
  assert.doesNotMatch(JSON.stringify(result), /cHJpdmF0ZQ/)
})

test('headless analyze_image fails clearly for an unknown artifact', async () => {
  const analyze = createHeadlessAnalyzeImageTool({
    artifactStore: createHeadlessImageArtifactStore(),
    analyze: async () => ({})
  })

  await assert.rejects(
    analyze({ artifactId: 'missing-image' }),
    error => error.code === 'IMAGE_ARTIFACT_NOT_FOUND'
  )
})
