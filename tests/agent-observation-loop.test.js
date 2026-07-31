import test from 'node:test'
import assert from 'node:assert/strict'

import { AgentRunner, AgentState, Planner, Verifier } from '../src/agent/core/index.js'

function createObservationRunner(tools, options = {}) {
  return new AgentRunner({
    planner: new Planner({
      observationEnabled: true,
      maxQualityRetries: options.maxQualityRetries ?? 2,
      llm: options.llm || null
    }),
    verifier: new Verifier({ requireImageReview: true }),
    tools,
    maxSteps: options.maxSteps || 8
  })
}

test('V0.2 accepts an image only after Result Observation', async () => {
  const runner = createObservationRunner({
    generate_image: async () => ({ outputNodeId: 'image-1' }),
    analyze_image: async input => ({
      artifactRef: input.artifactRef,
      imageNodeId: input.imageNodeId,
      accepted: true,
      decision: 'accept',
      score: 88,
      reviewMode: 'vision'
    })
  })

  const state = await runner.run('生成一张黑银科技感汽车海报')

  assert.equal(state.status, 'completed')
  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'finish'
  ])
})

test('V0.2 keeps the failed candidate and retries with an improved prompt', async () => {
  let imageCalls = 0
  const prompts = []
  const runner = createObservationRunner({
    generate_image: async input => {
      imageCalls += 1
      prompts.push(input.prompt)
      return { outputNodeId: `image-${imageCalls}` }
    },
    analyze_image: async input => ({
      artifactRef: input.artifactRef,
      imageNodeId: input.imageNodeId,
      accepted: imageCalls > 1,
      decision: imageCalls > 1 ? 'accept' : 'retry',
      score: imageCalls > 1 ? 86 : 71,
      nextPrompt: imageCalls > 1 ? undefined : `${input.goal}\n本轮修正：主体完整入镜`
    })
  })

  const state = await runner.run('生成一张 9:16 黑银汽车海报')

  assert.equal(state.status, 'completed')
  assert.equal(state.outputs.filter(output => output.type === 'image').length, 2)
  assert.match(prompts[1], /主体完整入镜/)
  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'generate_image',
    'analyze_image',
    'finish'
  ])
})

test('V0.2 fails instead of generating a fourth candidate', async () => {
  let imageCalls = 0
  let analyzeCalls = 0
  const runner = createObservationRunner({
    generate_image: async () => ({ outputNodeId: `image-${++imageCalls}` }),
    analyze_image: async input => {
      analyzeCalls += 1
      return {
        artifactRef: input.artifactRef,
        imageNodeId: input.imageNodeId,
        accepted: false,
        decision: 'retry',
        score: 60,
        nextPrompt: `${input.goal}\nrevision ${analyzeCalls + 1}`
      }
    }
  }, { maxQualityRetries: 2 })

  await assert.rejects(runner.run('生成一张产品图'), error => {
    assert.equal(error.code, 'QUALITY_RETRIES_EXHAUSTED')
    return true
  })

  assert.equal(imageCalls, 3)
  assert.equal(analyzeCalls, 3)
  assert.equal(runner.state.status, 'failed')
})

test('V0.2 reviews a video source frame before video generation', async () => {
  const runner = createObservationRunner({
    generate_image: async () => ({ outputNodeId: 'frame-1' }),
    analyze_image: async input => ({
      artifactRef: input.artifactRef,
      imageNodeId: input.imageNodeId,
      accepted: true,
      decision: 'accept',
      score: 90
    }),
    generate_video: async input => {
      assert.equal(input.imageNodeId, 'frame-1')
      return { outputNodeId: 'video-1' }
    }
  })

  const state = await runner.run('制作一个 10 秒咖啡广告')

  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'generate_video',
    'finish'
  ])
  assert.equal(state.status, 'completed')
})

test('V0.2 Planner guards an early LLM finish and continues the required loop', async () => {
  let llmCall = 0
  const runner = createObservationRunner({
    generate_image: async () => ({ outputNodeId: 'image-1' }),
    analyze_image: async input => ({
      artifactRef: input.artifactRef,
      imageNodeId: input.imageNodeId,
      accepted: true,
      decision: 'accept'
    })
  }, {
    llm: async () => {
      llmCall += 1
      if (llmCall === 1) return '{"name":"finish","input":{}}'
      return 'invalid-json-use-guarded-fallback'
    }
  })

  const state = await runner.run('生成一张海报')

  assert.equal(state.finishBlocks.length, 0)
  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'finish'
  ])
})

test('V0.2 Verifier independently blocks finish before review and after retry review', () => {
  const state = new AgentState({ goal: '生成一张海报', targetType: 'image' })
  state.recordAction({ name: 'generate_image', input: {} })
  state.recordOutput('image', { outputNodeId: 'image-1' }, 'generate_image')

  const verifier = new Verifier({ requireImageReview: true })
  assert.equal(verifier.verifyFinish(state).ok, false)

  state.recordAction({ name: 'analyze_image', input: { artifactRef: 'output:1' } })
  state.recordObservation({ name: 'analyze_image' }, {
    artifactRef: 'output:1',
    imageNodeId: 'image-1',
    accepted: false,
    decision: 'retry'
  })

  assert.equal(verifier.verifyFinish(state).ok, false)
})

test('V0.2 rejects degraded review when the runtime requires Vision', async () => {
  const runner = new AgentRunner({
    planner: new Planner({ observationEnabled: true, allowDegradedReview: false }),
    verifier: new Verifier({ requireImageReview: true, allowDegradedReview: false }),
    tools: {
      generate_image: async () => ({ outputNodeId: 'image-1' }),
      analyze_image: async input => ({
        artifactRef: input.artifactRef,
        imageNodeId: input.imageNodeId,
        accepted: true,
        decision: 'unverified',
        qualityUnverified: true
      })
    }
  })

  await assert.rejects(runner.run('生成一张海报'), error => error.code === 'VISION_REVIEW_REQUIRED')
})
