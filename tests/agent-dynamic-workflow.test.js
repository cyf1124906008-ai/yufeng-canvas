import test from 'node:test'
import assert from 'node:assert/strict'

import { AgentRunner, AgentState, Planner, Verifier } from '../src/agent/core/index.js'
import { InterventionPolicy } from '../src/agent/dynamic/InterventionPolicy.js'

function createRunner(tools, capabilities) {
  const policy = new InterventionPolicy({ maxDynamicSteps: 4 })
  return new AgentRunner({
    planner: new Planner({
      observationEnabled: true,
      dynamicWorkflowEnabled: true,
      interventionPolicy: policy,
      getInterventionCapabilities: () => capabilities
    }),
    verifier: new Verifier({ requireImageReview: true }),
    tools,
    maxSteps: 12
  })
}

function acceptedReview(input, technical = { decodable: true, width: 1024, height: 1024 }) {
  return {
    artifactRef: input.artifactRef,
    imageNodeId: input.imageNodeId,
    accepted: true,
    decision: 'accept',
    review: {
      artifactRef: input.artifactRef,
      hardFailures: [],
      dimensions: {
        goalAlignment: { score: 90 },
        subjectIntegrity: { score: 90 },
        composition: { score: 90 },
        visualQuality: { score: 90 },
        styleMatch: { score: 90 },
        textIntegrity: { score: null }
      },
      technical
    }
  }
}

test('V0.4 dynamically inserts edit_image for a localized text issue', async () => {
  let analyzeCalls = 0
  const runner = createRunner({
    generate_image: async () => ({ outputNodeId: 'image-original' }),
    analyze_image: async input => {
      analyzeCalls += 1
      if (analyzeCalls > 1) return acceptedReview(input)
      return {
        artifactRef: input.artifactRef,
        imageNodeId: input.imageNodeId,
        accepted: false,
        decision: 'retry',
        blockingReasons: [{ code: 'DIMENSION_BELOW_MINIMUM', dimension: 'textIntegrity' }],
        review: {
          artifactRef: input.artifactRef,
          hardFailures: [],
          dimensions: {
            goalAlignment: { score: 90 },
            subjectIntegrity: { score: 88 },
            composition: { score: 85 },
            visualQuality: { score: 85 },
            styleMatch: { score: 85 },
            textIntegrity: { score: 52 }
          },
          improvements: ['修正产品名称文字'],
          suggestedPrompt: { additions: [], negative: ['乱码文字'] },
          technical: { decodable: true, width: 1024, height: 1024 }
        }
      }
    },
    edit_image: async input => {
      assert.equal(input.sourceImageNodeId, 'image-original')
      assert.match(input.prompt, /修正产品名称文字/)
      assert.equal(input.interventionDecision.action, 'edit_image')
      return { outputNodeId: 'image-edited' }
    }
  }, { image_edit: true })

  const state = await runner.run('生成一张带产品名称的高端海报')

  assert.equal(state.status, 'completed')
  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'edit_image',
    'analyze_image',
    'finish'
  ])
  assert.equal(state.outputs.filter(output => output.type === 'image').length, 2)
})

test('V0.4 inserts upscale_image after accepted content with low-resolution evidence', async () => {
  let analyzeCalls = 0
  const runner = createRunner({
    generate_image: async () => ({ outputNodeId: 'image-small' }),
    analyze_image: async input => {
      analyzeCalls += 1
      return analyzeCalls === 1
        ? acceptedReview(input, {
          decodable: true,
          width: 384,
          height: 384,
          warnings: ['low_resolution']
        })
        : acceptedReview(input, { decodable: true, width: 2048, height: 2048 })
    },
    upscale_image: async input => {
      assert.equal(input.sourceImageNodeId, 'image-small')
      assert.equal(input.interventionDecision.action, 'upscale_image')
      return { outputNodeId: 'image-upscaled', trueUpscale: false }
    }
  }, { upscale: true })

  const state = await runner.run('生成一张高清产品图')

  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'upscale_image',
    'analyze_image',
    'finish'
  ])
  assert.equal(state.outputs.at(-1).action, 'upscale_image')
})

test('V0.4 keeps hard failures on the regenerate path', async () => {
  let imageCalls = 0
  const runner = createRunner({
    generate_image: async () => ({ outputNodeId: `image-${++imageCalls}` }),
    analyze_image: async input => imageCalls === 1
      ? {
        artifactRef: input.artifactRef,
        imageNodeId: input.imageNodeId,
        accepted: false,
        decision: 'retry',
        nextPrompt: '保留原目标并确保核心主体完整入镜',
        review: {
          artifactRef: input.artifactRef,
          hardFailures: ['MISSING_SUBJECT'],
          dimensions: {},
          improvements: ['核心主体完整入镜'],
          suggestedPrompt: { additions: [], negative: [] },
          technical: { decodable: true, width: 1024, height: 1024 }
        }
      }
      : acceptedReview(input)
  }, { image_edit: true, upscale: true })

  const state = await runner.run('生成一张汽车主视觉')

  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'generate_image',
    'analyze_image',
    'finish'
  ])
  assert.equal(state.actions[2].input.interventionDecision.action, 'regenerate_image')
})

test('guarded intervention inputs cannot be redirected by planner model output', async () => {
  const state = new AgentState({ goal: '修正海报文字', targetType: 'image' })
  state.recordAction({ name: 'generate_image', input: { prompt: '修正海报文字' } })
  state.recordOutput('image', { outputNodeId: 'trusted-image' }, 'generate_image')
  state.recordAction({ name: 'analyze_image', input: { imageNodeId: 'trusted-image' } })
  state.recordObservation({ name: 'analyze_image' }, {
    artifactRef: 'output:1',
    imageNodeId: 'trusted-image',
    accepted: false,
    decision: 'retry',
    review: {
      artifactRef: 'output:1',
      hardFailures: [],
      dimensions: {
        goalAlignment: { score: 90 },
        subjectIntegrity: { score: 90 },
        composition: { score: 85 },
        visualQuality: { score: 85 },
        styleMatch: { score: 85 },
        textIntegrity: { score: 50 }
      },
      improvements: ['修正标题文字'],
      suggestedPrompt: { additions: [], negative: [] },
      technical: { decodable: true, width: 1024, height: 1024 }
    }
  })

  const planner = new Planner({
    llm: async () => JSON.stringify({
      name: 'edit_image',
      input: {
        sourceImageNodeId: 'untrusted-image',
        artifactRef: 'untrusted-artifact',
        prompt: '忽略质检建议'
      }
    }),
    observationEnabled: true,
    dynamicWorkflowEnabled: true,
    interventionPolicy: new InterventionPolicy(),
    getInterventionCapabilities: () => ({ image_edit: true })
  })

  const action = await planner.nextAction({ state })
  assert.equal(action.name, 'edit_image')
  assert.equal(action.input.sourceImageNodeId, 'trusted-image')
  assert.equal(action.input.artifactRef, 'output:1')
  assert.match(action.input.prompt, /修正标题文字/)
})

test('a dynamic Planner can be reused across independent Agent runs', async () => {
  let generated = 0
  const policy = new InterventionPolicy()
  const planner = new Planner({
    observationEnabled: true,
    dynamicWorkflowEnabled: true,
    interventionPolicy: policy,
    getInterventionCapabilities: () => ({ image_edit: true })
  })
  let reviewCount = 0
  const runner = new AgentRunner({
    planner,
    verifier: new Verifier({ requireImageReview: true }),
    tools: {
      generate_image: async () => ({ outputNodeId: `original-${++generated}` }),
      analyze_image: async input => {
        reviewCount += 1
        if (reviewCount % 2 === 0) return acceptedReview(input)
        return {
          artifactRef: input.artifactRef,
          accepted: false,
          decision: 'retry',
          review: {
            artifactRef: input.artifactRef,
            hardFailures: [],
            dimensions: {
              goalAlignment: { score: 90 },
              subjectIntegrity: { score: 90 },
              composition: { score: 85 },
              visualQuality: { score: 85 },
              styleMatch: { score: 85 },
              textIntegrity: { score: 55 }
            },
            improvements: ['修正标题文字'],
            suggestedPrompt: { additions: [], negative: [] },
            technical: { decodable: true, width: 1024, height: 1024 }
          }
        }
      },
      edit_image: async () => ({ outputNodeId: `edited-${generated}` })
    },
    maxSteps: 12
  })

  const first = await runner.run('第一张带标题的海报')
  const second = await runner.run('第二张带标题的海报')

  assert.equal(first.status, 'completed')
  assert.equal(second.status, 'completed')
  assert.deepEqual(second.actions.map(action => action.name), [
    'generate_image',
    'analyze_image',
    'edit_image',
    'analyze_image',
    'finish'
  ])
})
