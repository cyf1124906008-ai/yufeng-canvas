import test from 'node:test'
import assert from 'node:assert/strict'

import {
  InterventionPolicy,
  InterventionPolicyError,
  chooseIntervention
} from '../src/agent/dynamic/InterventionPolicy.js'

function baseReview(overrides = {}) {
  return {
    artifactRef: 'output:1',
    dimensions: {
      goalAlignment: { score: 85 },
      subjectIntegrity: { score: 85 },
      composition: { score: 80 },
      visualQuality: { score: 80 },
      styleMatch: { score: 80 },
      textIntegrity: { score: null }
    },
    hardFailures: [],
    improvements: [],
    suggestedPrompt: { additions: [], negative: [] },
    technical: { decodable: true, width: 1080, height: 1920 },
    ...overrides
  }
}

test('hard failure, goal mismatch, or missing subject always regenerates', () => {
  for (const code of ['SEVERE_DEFORMATION', 'GOAL_MISMATCH', 'MISSING_SUBJECT']) {
    const result = chooseIntervention({
      review: baseReview({ hardFailures: [code] }),
      evaluation: { accepted: true },
      capabilities: ['edit_image', 'upscale_image']
    })
    assert.equal(result.action, 'regenerate_image')
    assert.ok(result.codes.includes(code))
    assert.match(result.reason, /hard quality failure/i)
  }
})

test('a possible blank image always regenerates instead of editing or upscaling', () => {
  const result = chooseIntervention({
    review: baseReview(),
    evaluation: {
      accepted: false,
      blockingReasons: [{ code: 'POSSIBLE_BLANK_IMAGE' }]
    },
    capabilities: ['edit_image', 'upscale_image']
  })

  assert.equal(result.action, 'regenerate_image')
  assert.match(result.reason, /hard quality failure/i)
})

test('localized text issue uses edit_image when editing is available', () => {
  const review = baseReview({
    dimensions: {
      ...baseReview().dimensions,
      textIntegrity: { score: 55 }
    },
    improvements: ['修正产品名称的字形'],
    suggestedPrompt: { additions: [], negative: ['乱码文字'] }
  })
  const result = chooseIntervention({
    review,
    evaluation: {
      accepted: false,
      blockingReasons: [{ code: 'DIMENSION_BELOW_MINIMUM', dimension: 'textIntegrity' }]
    },
    capabilities: ['image_edit']
  })

  assert.equal(result.action, 'edit_image')
  assert.ok(result.codes.includes('TEXT_INTEGRITY_LOW'))
  assert.ok(result.instructions.some(instruction => instruction.includes('修正产品名称')))
  assert.ok(result.instructions.some(instruction => instruction.includes('乱码文字')))
})

test('minor structural issue falls back to regenerate without edit capability', () => {
  const result = chooseIntervention({
    review: baseReview({
      dimensions: {
        ...baseReview().dimensions,
        subjectIntegrity: { score: 62 }
      }
    }),
    evaluation: { accepted: false },
    capabilities: []
  })

  assert.equal(result.action, 'regenerate_image')
  assert.ok(result.codes.includes('EDIT_CAPABILITY_UNAVAILABLE'))
})

test('content-safe low resolution result uses upscale when available', () => {
  const result = chooseIntervention({
    review: baseReview({ technical: { decodable: true, width: 512, height: 512 } }),
    evaluation: {
      accepted: false,
      blockingReasons: [{ code: 'LOW_RESOLUTION', message: '输出分辨率不足' }]
    },
    minWidth: 1024,
    minHeight: 1024,
    capabilities: { upscale: true }
  })

  assert.equal(result.action, 'upscale_image')
  assert.ok(result.codes.includes('LOW_RESOLUTION'))
  assert.ok(result.instructions.some(instruction => instruction.includes('保持构图与内容不变')))
})

test('low resolution falls back to regeneration when upscale is unavailable', () => {
  const result = chooseIntervention({
    review: baseReview(),
    evaluation: {
      accepted: false,
      blockingReasons: [{ code: 'RESOLUTION_TOO_LOW' }]
    },
    capabilities: []
  })

  assert.equal(result.action, 'regenerate_image')
  assert.ok(result.codes.includes('UPSCALE_CAPABILITY_UNAVAILABLE'))
})

test('accepted result returns accept and does not consume a dynamic step', () => {
  const policy = new InterventionPolicy({ maxDynamicSteps: 0 })
  const result = policy.decide({
    review: baseReview(),
    evaluation: { accepted: true, decision: 'accept' }
  })

  assert.equal(result.action, 'accept')
  assert.deepEqual(result.instructions, [])
  assert.equal(policy.snapshot().dynamicSteps, 0)
})

test('accepted content with a low-resolution technical warning is upscaled first', () => {
  const result = chooseIntervention({
    review: baseReview({
      technical: {
        decodable: true,
        width: 384,
        height: 384,
        warnings: ['low_resolution']
      }
    }),
    evaluation: { accepted: true, decision: 'accept' },
    capabilities: ['upscale_image']
  })

  assert.equal(result.action, 'upscale_image')
  assert.ok(result.codes.includes('LOW_RESOLUTION'))
})

test('unknown failure conservatively regenerates', () => {
  const result = chooseIntervention({
    review: baseReview(),
    evaluation: { accepted: false },
    attempt: 2
  })

  assert.equal(result.action, 'regenerate_image')
  assert.ok(result.codes.includes('UNKNOWN_QUALITY_FAILURE'))
  assert.equal(result.attempt, 2)
})

test('same artifact cannot receive the same intervention twice', () => {
  const policy = new InterventionPolicy()
  const input = {
    review: baseReview(),
    evaluation: { accepted: false },
    state: {
      actions: [{
        name: 'generate_image',
        input: {
          interventionDecision: {
            action: 'regenerate_image',
            artifactRef: 'output:1'
          }
        }
      }]
    }
  }

  assert.throws(() => policy.decide(input), error => {
    assert.ok(error instanceof InterventionPolicyError)
    assert.equal(error.code, 'INTERVENTION_ALREADY_APPLIED')
    assert.equal(error.artifactRef, 'output:1')
    return true
  })
})

test('total dynamic insertion limit stops interventions across artifacts', () => {
  const policy = new InterventionPolicy({ maxDynamicSteps: 2 })
  const state = {
    interventions: [
      { artifactRef: 'output:1', action: 'regenerate_image' },
      { artifactRef: 'output:2', action: 'regenerate_image' }
    ]
  }

  assert.throws(() => policy.decide({
    review: baseReview({ artifactRef: 'output:3' }),
    evaluation: { accepted: false },
    state
  }), error => error.code === 'DYNAMIC_STEP_LIMIT_REACHED')
  assert.equal(policy.snapshot(state).dynamicSteps, 2)
})

test('planning is pure until an intervention action is recorded in state', () => {
  const policy = new InterventionPolicy()
  const input = {
    review: baseReview(),
    evaluation: { accepted: false },
    state: { actions: [] }
  }

  assert.deepEqual(policy.decide(input), policy.decide(input))
  assert.equal(policy.snapshot(input.state).dynamicSteps, 0)
})

test('state intervention history participates in loop protection', () => {
  const policy = new InterventionPolicy()
  assert.throws(() => policy.decide({
    review: baseReview({ artifactRef: 'output:9' }),
    evaluation: { accepted: false },
    state: {
      interventions: [{ artifactRef: 'output:9', action: 'regenerate_image' }]
    }
  }), error => error.code === 'INTERVENTION_ALREADY_APPLIED')
})
