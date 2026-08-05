import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { OpenCodeRuntime } from '../electron/opencode-runtime.cjs'

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' }
})

test('OpenCode health wraps connection failures without echoing the URL', async () => {
  const secretUrl = 'http://user:super-secret@example.test:4096/private'
  const runtime = new OpenCodeRuntime({
    baseUrl: secretUrl,
    fetchImpl: async () => {
      throw new Error(`connect ECONNREFUSED ${secretUrl}`)
    }
  })

  await assert.rejects(runtime.health(), error => {
    assert.equal(error.code, 'OPENCODE_UNAVAILABLE')
    assert.equal(error.message, 'OpenCode 服务不可用')
    assert.doesNotMatch(error.message, /super-secret|example\.test/)
    return true
  })
  assert.equal(runtime.status().lastError.code, 'OPENCODE_UNAVAILABLE')
})

test('HTTP 200 with healthy=false is not considered a running OpenCode service', async () => {
  const runtime = new OpenCodeRuntime({
    baseUrl: 'http://127.0.0.1:4096',
    fetchImpl: async () => jsonResponse({ healthy: false, version: '1.18.13' })
  })

  await assert.rejects(runtime.health(), error => error.code === 'OPENCODE_UNAVAILABLE')
  assert.equal(runtime.status().state, 'stopped')
  assert.equal(runtime.status().healthy, undefined)
})

test('start waits for healthy=true instead of adopting a false health response', async () => {
  const child = new EventEmitter()
  child.pid = 4242
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true
  let healthChecks = 0
  let spawnCall = null
  const runtime = new OpenCodeRuntime({
    binaryPath: '/tmp/opencode',
    baseUrl: 'http://127.0.0.1:41993',
    healthIntervalMs: 20,
    fetchImpl: async () => {
      healthChecks += 1
      return jsonResponse({ healthy: healthChecks >= 3, version: '1.18.13' })
    },
    spawnImpl: (...args) => {
      spawnCall = args
      return child
    }
  })

  const status = await runtime.start()
  assert.equal(status.state, 'running')
  assert.equal(status.healthy, true)
  assert.equal(healthChecks >= 3, true)
  assert.equal(spawnCall?.[0], '/tmp/opencode')
  await runtime.stop()
})
