import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ModelFallbackError,
  ModelFallbackExecutor,
  classifyFallbackError,
  executeWithModelFallback
} from '../src/agent/runtime/ModelFallbackExecutor.js'

function httpError(status, message = `HTTP ${status}`) {
  const error = new Error(message)
  error.status = status
  return error
}

test('falls through retryable 5xx and 429 responses in candidate order', async () => {
  const candidates = [{ key: 'model-a' }, { key: 'model-b' }, { key: 'model-c' }]
  const calls = []
  const attemptEvents = []

  const outcome = await executeWithModelFallback(candidates, async (candidate, context) => {
    calls.push([candidate.key, context.attempt, context.previousAttempts.length])
    if (candidate.key === 'model-a') throw httpError(503)
    if (candidate.key === 'model-b') throw httpError(429)
    return { outputNodeId: 'image-1' }
  }, {
    onAttempt: event => attemptEvents.push(event)
  })

  assert.deepEqual(calls, [
    ['model-a', 1, 0],
    ['model-b', 2, 1],
    ['model-c', 3, 2]
  ])
  assert.equal(outcome.candidate.key, 'model-c')
  assert.equal(outcome.candidateIndex, 2)
  assert.deepEqual(outcome.result, { outputNodeId: 'image-1' })
  assert.deepEqual(outcome.attempts.map(attempt => attempt.status), ['failed', 'failed', 'succeeded'])
  assert.equal(attemptEvents.length, 3)
  assert.deepEqual(attemptEvents.map(event => event.candidate.key), ['model-a', 'model-b', 'model-c'])
})

test('attempt timeout aborts the current candidate and switches to the next', async () => {
  const seen = []
  const executor = new ModelFallbackExecutor({ timeoutMs: 10 })
  const outcome = await executor.run(['slow', 'fast'], (candidate, { signal }) => {
    seen.push(candidate)
    if (candidate === 'fast') return 'done'
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })

  assert.deepEqual(seen, ['slow', 'fast'])
  assert.equal(outcome.result, 'done')
  assert.equal(outcome.attempts[0].error.code, 'MODEL_ATTEMPT_TIMEOUT')
  assert.equal(outcome.attempts[0].error.category, 'timeout')
})

test('401, 403, parameter, capability, and AbortError failures never switch models', async (t) => {
  const cases = [
    ['401', httpError(401)],
    ['403', httpError(403)],
    ['parameter', Object.assign(new Error('invalid size'), { status: 400, retryable: true })],
    ['capability', Object.assign(new Error('unsupported image input'), { code: 'CAPABILITY_NOT_SUPPORTED', status: 500 })]
  ]

  for (const [name, expectedError] of cases) {
    await t.test(name, async () => {
      let calls = 0
      await assert.rejects(
        executeWithModelFallback(['first', 'second'], async () => {
          calls += 1
          throw expectedError
        }),
        error => {
          assert.ok(error instanceof ModelFallbackError)
          assert.equal(error.code, 'MODEL_FALLBACK_STOPPED')
          assert.equal(error.attempts.length, 1)
          return true
        }
      )
      assert.equal(calls, 1)
    })
  }

  await t.test('AbortError', async () => {
    let calls = 0
    const abort = new Error('user cancelled')
    abort.name = 'AbortError'
    await assert.rejects(
      executeWithModelFallback(['first', 'second'], async () => {
        calls += 1
        throw abort
      }),
      error => error.name === 'AbortError' && error.attempts.length === 1
    )
    assert.equal(calls, 1)
  })
})

test('an external AbortSignal cancels the active attempt without starting another', async () => {
  const controller = new AbortController()
  const seen = []
  const running = executeWithModelFallback(['active', 'must-not-run'], (candidate, { signal }) => {
    seen.push(candidate)
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }, { signal: controller.signal })

  await new Promise(resolve => setTimeout(resolve, 0))
  controller.abort('stop now')

  await assert.rejects(running, error => {
    assert.equal(error.name, 'AbortError')
    assert.match(error.message, /stop now/)
    assert.equal(error.attempts.length, 1)
    return true
  })
  assert.deepEqual(seen, ['active'])
})

test('an already-aborted signal starts no attempt', async () => {
  const controller = new AbortController()
  controller.abort('cancelled before start')
  let calls = 0

  await assert.rejects(
    executeWithModelFallback(['first'], async () => {
      calls += 1
    }, { signal: controller.signal }),
    error => error.name === 'AbortError' && error.attempts.length === 0
  )
  assert.equal(calls, 0)
})

test('final attempts are sanitized and never retain credentials or media URLs', async () => {
  const candidates = [
    {
      key: 'model-a',
      apiKey: 'sk-candidate-secret',
      endpoint: 'https://provider.example/v1'
    },
    {
      key: 'model-b',
      authorization: 'Bearer candidate-token'
    }
  ]
  let finalError

  try {
    await executeWithModelFallback(candidates, async candidate => {
      const error = httpError(
        503,
        `upstream failed at https://media.example/private.png apiKey=sk-error-secret Bearer private-token for ${candidate.key}`
      )
      error.response = {
        status: 503,
        data: {
          url: 'data:image/png;base64,secret-media',
          token: 'response-token'
        }
      }
      throw error
    })
  } catch (error) {
    finalError = error
  }

  assert.ok(finalError instanceof ModelFallbackError)
  assert.equal(finalError.code, 'MODEL_FALLBACK_EXHAUSTED')
  assert.equal(finalError.attempts.length, 2)
  assert.deepEqual(finalError.attempts.map(attempt => attempt.candidate), [
    { key: 'model-a' },
    { key: 'model-b' }
  ])

  const serialized = JSON.stringify({
    message: finalError.message,
    attempts: finalError.attempts,
    lastError: finalError.lastError
  })
  assert.doesNotMatch(serialized, /candidate-secret|error-secret|private-token|response-token|secret-media/)
  assert.doesNotMatch(serialized, /media\.example|provider\.example/)
  assert.match(serialized, /redacted|url-hidden/)
})

test('classification permits explicit and network retry hints but never overrides auth', () => {
  assert.equal(classifyFallbackError(Object.assign(new Error('busy'), { retryable: true })).retryable, true)
  assert.equal(classifyFallbackError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })).retryable, true)
  const timeout = Object.assign(new Error('operation exceeded its deadline'), { name: 'TimeoutError' })
  assert.deepEqual(classifyFallbackError(timeout), {
    retryable: true,
    category: 'timeout',
    status: null,
    code: ''
  })
  assert.equal(classifyFallbackError(Object.assign(new Error('no'), { status: 401, retryable: true })).retryable, false)
  const abort = Object.assign(new Error('timeout wording does not matter'), { name: 'AbortError' })
  assert.equal(classifyFallbackError(abort).retryable, false)
})
