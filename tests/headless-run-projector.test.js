import test from 'node:test'
import assert from 'node:assert/strict'

import { AgentRunner } from '../src/agent/core/index.js'
import {
  RunProjector,
  RunViewState,
  sanitizeRunValue
} from '../src/agent/headless/index.js'

test('projects a completed AgentRunner run without Canvas dependencies', async () => {
  const runner = new AgentRunner({
    tools: {
      generate_image: async () => ({
        outputNodeId: 'artifact-image-1',
        url: 'https://cdn.example.test/image.png',
        imageData: 'data:image/png;base64,TOP_SECRET_MEDIA_PAYLOAD'
      })
    }
  })
  const projector = new RunProjector({ runner })
  const updates = []
  projector.subscribe(view => updates.push(view.status))

  await runner.run('生成一张无 Canvas 依赖的海报')
  const view = projector.snapshot()

  assert.equal(view.goal, '生成一张无 Canvas 依赖的海报')
  assert.equal(view.status, 'completed')
  assert.equal(view.currentAction, null)
  assert.equal(view.artifacts.length, 1)
  assert.equal(view.artifacts[0].id, 'artifact-image-1')
  assert.equal(view.artifacts[0].type, 'image')
  assert.equal(view.final.status, 'completed')
  assert.equal(view.final.artifactId, 'artifact-image-1')
  assert.deepEqual(view.final.artifactIds, ['artifact-image-1'])
  assert.ok(view.timeline.some(entry => entry.type === 'tool_started'))
  assert.ok(view.timeline.some(entry => entry.type === 'completed' && entry.status === 'completed'))
  assert.ok(view.timeline.some(entry => entry.type === 'tool_succeeded' && entry.status === 'completed'))
  assert.ok(updates.includes('running'))

  const serialized = JSON.stringify(view)
  assert.doesNotMatch(serialized, /TOP_SECRET_MEDIA_PAYLOAD/)
  assert.doesNotMatch(serialized, /data:image\/png;base64/i)
  assert.match(serialized, /media-data-omitted/)
})

test('projects failed runs with an error and no false final result', async () => {
  const error = new Error('provider unavailable')
  error.code = 'PROVIDER_DOWN'
  const runner = new AgentRunner({
    tools: { generate_image: async () => { throw error } }
  })
  const projector = new RunProjector({ runner })

  await assert.rejects(runner.run('生成图片'), /provider unavailable/)
  const view = projector.snapshot()

  assert.equal(view.status, 'failed')
  assert.equal(view.currentAction, null)
  assert.equal(view.final, null)
  assert.deepEqual(view.error, {
    name: 'Error',
    message: 'provider unavailable',
    code: 'PROVIDER_DOWN'
  })
  assert.equal(view.timeline.at(-1).type, 'failed')
})

test('projects nested Provider acceptance so the UI can suppress unsafe retry', () => {
  const projector = new RunProjector()
  const error = new Error('Model fallback stopped')
  error.code = 'MODEL_FALLBACK_STOPPED'
  error.lastError = {
    code: 'VIDEO_TASK_PENDING',
    acceptedByProvider: true,
    taskId: 'task-safe-1'
  }
  error.acceptedByProvider = true
  error.taskId = 'task-safe-1'

  projector.project({
    type: 'failed',
    error,
    state: { id: 'run-pending', goal: '视频', status: 'failed', stepCount: 2 }
  })
  const projected = projector.snapshot().error

  assert.equal(projected.code, 'MODEL_FALLBACK_STOPPED')
  assert.equal(projected.providerCode, 'VIDEO_TASK_PENDING')
  assert.equal(projected.acceptedByProvider, true)
  assert.equal(projected.taskId, 'task-safe-1')
})

test('manual event projection rebuilds artifacts from state snapshots', () => {
  const projector = new RunProjector()
  projector.project({
    type: 'tool_succeeded',
    timestamp: 123,
    action: { name: 'generate_video' },
    result: { url: 'https://cdn.example.test/video.mp4' },
    state: {
      id: 'run-1',
      goal: '制作短片',
      targetType: 'video',
      status: 'running',
      stepCount: 3,
      outputs: [{
        type: 'video',
        action: 'generate_video',
        step: 3,
        value: { id: 'video-1', b64_json: 'A'.repeat(1024) }
      }]
    }
  })
  const view = projector.snapshot()

  assert.equal(view.runId, 'run-1')
  assert.equal(view.artifacts.length, 1)
  assert.equal(view.artifacts[0].id, 'video-1')
  assert.equal(view.artifacts[0].value.b64_json, '[media-data-omitted]')
  assert.doesNotMatch(JSON.stringify(view), /A{100}/)
})

test('projection sanitizes secrets and bare base64 recursively', () => {
  const bareBase64 = 'QUJD'.repeat(40)
  const safe = sanitizeRunValue({
    apiKey: 'sk-private',
    nested: {
      authorization: 'Bearer secret',
      access_token: 'access-secret',
      refreshToken: 'refresh-secret',
      clientSecret: 'client-secret',
      sessionToken: 'session-secret',
      cookie: 'cookie-secret',
      privateKey: 'private-key-secret',
      password: 'password-secret',
      b64_json: 'short-base64-media',
      imageData: 'short-image-media',
      payload: bareBase64
    }
  })

  assert.equal(safe.apiKey, '[redacted]')
  assert.equal(safe.nested.authorization, '[redacted]')
  assert.equal(safe.nested.access_token, '[redacted]')
  assert.equal(safe.nested.refreshToken, '[redacted]')
  assert.equal(safe.nested.clientSecret, '[redacted]')
  assert.equal(safe.nested.sessionToken, '[redacted]')
  assert.equal(safe.nested.cookie, '[redacted]')
  assert.equal(safe.nested.privateKey, '[redacted]')
  assert.equal(safe.nested.password, '[redacted]')
  assert.equal(safe.nested.b64_json, '[media-data-omitted]')
  assert.equal(safe.nested.imageData, '[media-data-omitted]')
  assert.equal(safe.nested.payload, '[media-data-omitted]')

  const serialized = JSON.stringify(safe)
  assert.doesNotMatch(serialized, /access-secret|refresh-secret|client-secret|session-secret/)
  assert.doesNotMatch(serialized, /cookie-secret|private-key-secret|password-secret|short-(?:base64|image)-media/)
  assert.doesNotMatch(serialized, new RegExp(bareBase64))
})

test('current action is projected and cleared without retaining media input', () => {
  const projector = new RunProjector()
  projector.project({
    type: 'action',
    action: {
      name: 'generate_image',
      reason: 'Create the deliverable',
      input: { prompt: 'poster', imageData: 'QUJD'.repeat(40) }
    },
    state: { id: 'run-current', goal: 'poster', status: 'running', stepCount: 1 }
  })
  assert.equal(projector.snapshot().currentAction.name, 'generate_image')
  assert.equal(projector.snapshot().currentAction.input.imageData, '[media-data-omitted]')

  projector.project({
    type: 'tool_succeeded',
    action: { name: 'generate_image' },
    result: { id: 'poster-1' },
    state: { id: 'run-current', goal: 'poster', status: 'running', stepCount: 1 }
  })
  assert.equal(projector.snapshot().currentAction, null)
})

test('RunViewState is serializable, bounded, and snapshot-isolated', () => {
  const view = new RunViewState({ goal: 'test', status: 'running' })
  view.addTimeline({ type: 'one' }, 2)
  view.addTimeline({ type: 'two' }, 2)
  view.addTimeline({ type: 'three' }, 2)
  view.upsertArtifact({ id: 'a', type: 'file', value: { url: 'https://example.test/a' } })

  const snapshot = view.snapshot()
  assert.deepEqual(snapshot.timeline.map(entry => entry.type), ['two', 'three'])
  snapshot.artifacts[0].value.url = 'mutated'
  assert.equal(view.snapshot().artifacts[0].value.url, 'https://example.test/a')
  assert.doesNotThrow(() => JSON.stringify(view.snapshot()))
})

test('detaching stops event projection', async () => {
  const runner = new AgentRunner({
    tools: { generate_image: async () => ({ id: 'detached-artifact' }) }
  })
  const projector = new RunProjector({ runner })
  projector.detach()

  await runner.run('detached run')
  assert.equal(projector.snapshot().status, 'idle')
})

test('reusing a runner starts a clean projection for the new run id', async () => {
  let count = 0
  const runner = new AgentRunner({
    tools: { generate_image: async () => ({ id: `artifact-${++count}` }) }
  })
  const projector = new RunProjector({ runner })

  await runner.run('first run')
  const firstId = projector.snapshot().runId
  await runner.run('second run')
  const second = projector.snapshot()

  assert.notEqual(second.runId, firstId)
  assert.equal(second.goal, 'second run')
  assert.deepEqual(second.artifacts.map(artifact => artifact.id), ['artifact-2'])
  assert.equal(second.timeline.filter(entry => entry.type === 'started').length, 1)
})

test('projection listener errors cannot fail the Agent run', async () => {
  const runner = new AgentRunner({
    tools: { generate_image: async () => ({ id: 'safe-artifact' }) }
  })
  const projector = new RunProjector({
    runner,
    onListenerError: () => { throw new Error('error reporter also failed') }
  })
  projector.subscribe(() => { throw new Error('observer failed') })

  const result = await runner.run('listener isolation')
  assert.equal(result.status, 'completed')
  assert.equal(projector.snapshot().status, 'completed')
})
