import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ImageReviewValidationError,
  PromptImprover,
  RunPolicy,
  evaluateImageReview,
  normalizeImageReview
} from '../src/agent/observation/index.js'

function visionReview(overrides = {}) {
  return {
    reviewMode: 'vision',
    overallScore: 95,
    dimensions: {
      goalAlignment: { score: 80, feedback: '' },
      subjectIntegrity: { score: 80, feedback: '' },
      composition: { score: 80, feedback: '' },
      visualQuality: { score: 80, feedback: '' },
      styleMatch: { score: 80, feedback: '' },
      textIntegrity: { score: null, feedback: 'not required' }
    },
    hardFailures: [],
    decision: 'accept',
    summary: 'review',
    improvements: [],
    suggestedPrompt: { additions: [], negative: [] },
    ...overrides
  }
}

test('normalizes review and locally recomputes score instead of trusting model score', () => {
  const normalized = normalizeImageReview(visionReview(), { artifactRef: 'output:1' })
  const result = evaluateImageReview(normalized, {
    minAcceptScore: 82,
    dimensionMinimums: {
      goalAlignment: 0,
      subjectIntegrity: 0,
      composition: 0,
      visualQuality: 0,
      styleMatch: 0,
      textIntegrity: 0
    }
  })

  assert.equal(normalized.schemaVersion, '1')
  assert.equal(result.score, 80)
  assert.equal(result.accepted, false)
  assert.equal(result.decision, 'retry')
  assert.equal(result.review.reportedOverallScore, 95)
  assert.equal(result.review.overallScore, 80)
})

test('renormalizes weights when text integrity is not applicable', () => {
  const normalized = normalizeImageReview(visionReview({
    overallScore: 0,
    dimensions: {
      goalAlignment: { score: 90, feedback: '' },
      subjectIntegrity: { score: 90, feedback: '' },
      composition: { score: 90, feedback: '' },
      visualQuality: { score: 90, feedback: '' },
      styleMatch: { score: 90, feedback: '' },
      textIntegrity: { score: null, feedback: '' }
    }
  }), { artifactRef: 'output:2' })

  const result = evaluateImageReview(normalized)
  assert.equal(result.score, 90)
  assert.equal(result.accepted, true)
})

test('hard failure blocks an otherwise high-scoring review', () => {
  const normalized = normalizeImageReview(visionReview({
    overallScore: 99,
    dimensions: Object.fromEntries([
      'goalAlignment', 'subjectIntegrity', 'composition', 'visualQuality', 'styleMatch'
    ].map(name => [name, { score: 99, feedback: '' }]).concat([
      ['textIntegrity', { score: null, feedback: '' }]
    ])),
    hardFailures: ['MISSING_SUBJECT']
  }), { artifactRef: 'output:3' })

  const result = evaluateImageReview(normalized)
  assert.equal(result.accepted, false)
  assert.ok(result.blockingReasons.some(reason => reason.code === 'MISSING_SUBJECT'))
})

test('rejects invalid scores and unknown hard failure codes', () => {
  const invalid = visionReview({
    dimensions: {
      ...visionReview().dimensions,
      goalAlignment: { score: 101, feedback: '' }
    },
    hardFailures: ['MADE_UP_FAILURE']
  })

  assert.throws(
    () => normalizeImageReview(invalid, { artifactRef: 'output:4' }),
    error => {
      assert.ok(error instanceof ImageReviewValidationError)
      assert.equal(error.code, 'VISION_SCHEMA_INVALID')
      assert.ok(error.issues.some(issue => issue.includes('goalAlignment')))
      assert.ok(error.issues.some(issue => issue.includes('MADE_UP_FAILURE')))
      return true
    }
  )
})

test('degraded technical review is unverified but may be accepted by policy', () => {
  const normalized = normalizeImageReview({
    reviewMode: 'degraded',
    overallScore: null,
    dimensions: null,
    hardFailures: [],
    decision: 'unverified',
    summary: 'technical checks only',
    technical: { decodable: true, width: 1080, height: 1920 }
  }, { artifactRef: 'output:5' })

  const result = evaluateImageReview(normalized)
  assert.equal(result.accepted, true)
  assert.equal(result.qualityUnverified, true)
  assert.equal(result.score, null)
})

test('prompt improver preserves the goal and merges actionable suggestions', () => {
  const improver = new PromptImprover()
  const improved = improver.improve({
    goal: '黑银科技感汽车海报，9:16',
    prompt: '新能源汽车在未来城市中行驶',
    negativePrompt: '低清晰度',
    review: {
      artifactRef: 'output:1',
      improvements: ['车身完整入镜'],
      suggestedPrompt: {
        additions: ['主体垂直居中', '车身完整入镜'],
        negative: ['车轮畸变']
      }
    }
  })

  assert.match(improved.prompt, /黑银科技感汽车海报，9:16/)
  assert.match(improved.prompt, /新能源汽车在未来城市中行驶/)
  assert.match(improved.prompt, /车身完整入镜；主体垂直居中/)
  assert.equal(improved.negativePrompt, '低清晰度，车轮畸变')
  assert.equal(improved.retryOf, 'output:1')
  assert.equal(improved.reviewRef, 'review:output:1')
})

test('prompt improver rejects a repeated revision hash', () => {
  const improver = new PromptImprover()
  const input = {
    goal: '产品海报',
    prompt: '白色背景的产品图',
    review: {
      artifactRef: 'output:1',
      improvements: ['增强主体对比度'],
      suggestedPrompt: { additions: [], negative: [] }
    }
  }
  const first = improver.improve(input)

  assert.throws(
    () => improver.improve({ ...input, previousHashes: [first.hash] }),
    error => error.code === 'PROMPT_NOT_IMPROVED'
  )
})

test('run policy blocks duplicate analysis, excessive retries, and over-budget retry', () => {
  const policy = new RunPolicy({
    maxQualityRetries: 2,
    budget: { amount: 10, currency: 'CNY' }
  })

  policy.markAnalyzed('output:1')
  assert.throws(() => policy.assertCanAnalyze('output:1'), error => error.code === 'IMAGE_ALREADY_ANALYZED')

  policy.recordUsage({ cost: { amount: 8, currency: 'CNY' } })
  assert.throws(
    () => policy.assertCanRetry({ estimatedCost: { amount: 3, currency: 'CNY' } }),
    error => error.code === 'AGENT_BUDGET_EXCEEDED'
  )

  policy.markRetry({ estimatedCost: { amount: 1, currency: 'CNY' } })
  policy.markRetry({ estimatedCost: { amount: 1, currency: 'CNY' } })
  assert.throws(() => policy.assertCanRetry(), error => error.code === 'QUALITY_RETRIES_EXHAUSTED')
  assert.equal(policy.snapshot().retriesRemaining, 0)
})

test('run policy tracks unknown costs without treating them as zero-priced calls', () => {
  const policy = new RunPolicy()
  policy.recordUsage(null)
  policy.recordUsage({ cost: null })

  assert.equal(policy.snapshot().spent, 0)
  assert.equal(policy.snapshot().unmeteredCalls, 2)
})
