import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  OpenCodeRequestError,
  createOpenCodeAdapter,
  createOpenCodeBridgeAdapter,
  createOpenCodePlanner,
  flattenProviderModels,
  modelReference,
  parseOpenCodeSseChunk,
  selectOpenCodeModel
} from '../src/agent/runtime/openCodeAdapter.js'
import { createWorkbenchPlanner } from '../src/agent/runtime/workbenchPlanner.js'
import {
  OpenCodeRuntime,
  discoverOpenCodeBinary
} from '../electron/opencode-runtime.cjs'

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(value === null ? '' : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  })
}

test('OpenCode model references and provider payloads normalize to provider/model keys', () => {
  assert.deepEqual(modelReference('openai/gpt-5'), {
    providerID: 'openai',
    modelID: 'gpt-5'
  })
  assert.deepEqual(modelReference({ provider: 'anthropic', model: 'claude-sonnet' }), {
    providerID: 'anthropic',
    modelID: 'claude-sonnet'
  })
  assert.equal(modelReference('gpt-5'), undefined)

  const models = flattenProviderModels({
    all: [{
      id: 'openai',
      name: 'OpenAI',
      models: {
        'gpt-5': {
          name: 'GPT-5',
          capabilities: { reasoning: true, toolcall: true, attachment: true },
          variants: { high: { reasoningEffort: 'high' } }
        }
      }
    }]
  })
  assert.deepEqual(models[0], {
    key: 'openai/gpt-5',
    id: 'gpt-5',
    model: 'gpt-5',
    modelID: 'gpt-5',
    provider: 'openai',
    providerID: 'openai',
    providerLabel: 'OpenAI',
    label: 'GPT-5',
    reasoning: true,
    toolCall: true,
    attachment: true,
    capabilities: { reasoning: true, toolcall: true, attachment: true },
    variants: { high: { reasoningEffort: 'high' } },
    limit: {},
    cost: undefined,
    status: 'active'
  })
})

test('OpenCode model selection rejects unconfigured YUFENG keys and accepts connected sidecar models', () => {
  const catalog = {
    connected: ['opencode'],
    models: [{ key: 'opencode/big-pickle', providerID: 'opencode', status: 'active' }]
  }
  assert.equal(selectOpenCodeModel('gpt-5'), undefined)
  assert.equal(selectOpenCodeModel('dataeyes/gpt-5', catalog), undefined)
  assert.equal(selectOpenCodeModel('opencode/missing', catalog), undefined)
  assert.equal(selectOpenCodeModel('opencode/big-pickle', catalog), 'opencode/big-pickle')
  assert.equal(selectOpenCodeModel('opencode/big-pickle', {
    ...catalog,
    connected: ['other-provider']
  }), undefined)
})

test('OpenCode adapter calls the documented server endpoints without copying provider keys', async () => {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init })
    if (url.endsWith('/global/health')) return jsonResponse({ healthy: true, version: '1.18.13' })
    if (url.includes('/provider')) {
      return jsonResponse({
        all: [{ id: 'opencode', name: 'OpenCode', models: { 'big-pickle': { name: 'Big Pickle' } } }],
        connected: ['opencode'],
        default: { opencode: 'big-pickle' }
      })
    }
    if (url.includes('/experimental/tool')) return jsonResponse([{ id: 'read', parameters: {} }])
    if (url.includes('/session?')) return jsonResponse({ id: 'ses_test', title: 'test' })
    if (url.includes('/message?')) return jsonResponse({ info: {}, parts: [{ type: 'text', text: 'ok' }] })
    if (url.includes('/permissions/')) return jsonResponse(true)
    return jsonResponse({ ok: true })
  }
  const adapter = createOpenCodeAdapter({
    baseUrl: 'http://127.0.0.1:4096/',
    directory: '/tmp/yufeng-test',
    fetchImpl,
    headers: { 'X-Test': 'adapter' }
  })

  assert.deepEqual(await adapter.health(), { healthy: true, version: '1.18.13' })
  const listed = await adapter.listModels()
  assert.equal(listed.models[0].key, 'opencode/big-pickle')
  assert.deepEqual(await adapter.listTools({ model: 'opencode/big-pickle' }), [{ id: 'read', parameters: {} }])
  assert.equal((await adapter.createSession({ title: 'test' })).id, 'ses_test')
  await adapter.prompt({ sessionId: 'ses_test', text: 'hello', model: 'opencode/big-pickle' })
  await adapter.legacyReplyPermission({ sessionId: 'ses_test', permissionId: 'perm-1', response: 'reject' })

  const promptCall = calls.find(call => call.url.includes('/session/ses_test/message'))
  assert.equal(promptCall.init.headers['X-Test'], 'adapter')
  assert.equal('authorization' in Object.fromEntries(Object.entries(promptCall.init.headers).map(([key, value]) => [key.toLowerCase(), value])), false)
  assert.deepEqual(JSON.parse(promptCall.init.body).model, {
    providerID: 'opencode',
    modelID: 'big-pickle'
  })
  assert.match(calls.find(call => call.url.includes('/provider')).url, /directory=%2Ftmp%2Fyufeng-test/)
})

test('OpenCode adapter surfaces bounded HTTP errors', async () => {
  const adapter = createOpenCodeAdapter({
    baseUrl: 'http://127.0.0.1:4096',
    fetchImpl: async () => jsonResponse({ data: { message: 'server unavailable' } }, 503)
  })
  await assert.rejects(adapter.health(), error => {
    assert.ok(error instanceof OpenCodeRequestError)
    assert.equal(error.code, 'OPENCODE_REQUEST_FAILED')
    assert.equal(error.status, 503)
    assert.match(error.message, /server unavailable/)
    return true
  })
})

test('OpenCode bridge adapter keeps packaged renderer traffic inside Main IPC', async () => {
  const calls = []
  const bridge = {
    health: async input => {
      calls.push(['health', input])
      return { healthy: true, version: '1.18.13' }
    },
    createSession: async input => {
      calls.push(['createSession', input])
      return { id: 'ses_ipc' }
    },
    prompt: async input => {
      calls.push(['prompt', input])
      return { parts: [{ type: 'text', text: '{"type":"finish","result":{"content":"ok"}}' }] }
    },
    abort: async input => {
      calls.push(['abort', input])
      return true
    },
    listProviders: async input => {
      calls.push(['listProviders', input])
      return {
        all: [{ id: 'opencode', name: 'OpenCode', models: { 'big-pickle': { name: 'Big Pickle' } } }],
        connected: ['opencode'],
        default: { opencode: 'big-pickle' }
      }
    }
  }
  const adapter = createOpenCodeBridgeAdapter({ bridge, directory: '/tmp/ignored-by-main' })
  assert.equal(adapter.baseUrl, 'ipc://opencode')
  assert.deepEqual(await adapter.health(), { healthy: true, version: '1.18.13' })
  assert.equal((await adapter.listModels()).models[0].key, 'opencode/big-pickle')
  assert.deepEqual(await adapter.createSession({ title: 'IPC task' }), { id: 'ses_ipc' })
  await adapter.prompt({
    sessionId: 'ses_ipc',
    text: 'next',
    model: 'opencode/big-pickle',
    system: 'return JSON',
    variant: 'high',
    tools: { bash: false, read: false }
  })
  await adapter.abort({ sessionId: 'ses_ipc' })
  assert.deepEqual(calls, [
    ['health', {}],
    ['listProviders', {}],
    ['createSession', { title: 'IPC task' }],
    ['prompt', {
      sessionId: 'ses_ipc',
      text: 'next',
      model: { providerID: 'opencode', modelID: 'big-pickle' },
      system: 'return JSON',
      variant: 'high',
      tools: { bash: false, read: false }
    }],
    ['abort', { sessionId: 'ses_ipc' }]
  ])
  await assert.rejects(
    Promise.resolve().then(() => adapter.prompt({ sessionId: 'ses_ipc', text: 'cancelled', signal: AbortSignal.abort() })),
    error => error.code === 'OPENCODE_ABORTED'
  )
})

test('OpenCode bridge cancellation aborts the matching remote session', async () => {
  const controller = new AbortController()
  let abortInput = null
  let resolvePrompt
  const bridge = {
    prompt: async () => new Promise(resolve => { resolvePrompt = resolve }),
    abort: async input => {
      abortInput = input
      return true
    }
  }
  const adapter = createOpenCodeBridgeAdapter({ bridge })
  const pending = adapter.prompt({ sessionId: 'ses_cancel', text: 'long task', signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, error => error.code === 'OPENCODE_ABORTED')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(abortInput, { sessionId: 'ses_cancel' })
  resolvePrompt?.({ parts: [] })
})

test('OpenCode SSE parser handles split frames and ignores heartbeat comments', () => {
  const first = parseOpenCodeSseChunk(': heartbeat\n\ndata: {"type":"server.connected"}\n\n')
  assert.deepEqual(first.events, [{ type: 'server.connected' }])
  const second = parseOpenCodeSseChunk('data: {"type":"message.', { final: false })
  assert.deepEqual(second.events, [])
  const third = parseOpenCodeSseChunk(`${second.remainder}updated"}\n\n`)
  assert.deepEqual(third.events, [{ type: 'message.updated' }])
})

test('OpenCode planner keeps execution inside the existing Workbench tool boundary', async () => {
  const calls = []
  const planner = createOpenCodePlanner({
    model: 'opencode/big-pickle',
    adapter: {
      createSession: async input => {
        calls.push(['create', input])
        return { id: 'remote-session' }
      },
      prompt: async input => {
        calls.push(['prompt', input])
        return { parts: [{ type: 'text', text: '{"type":"tool_call","name":"read_file","input":{"path":"a.txt"}}' }] }
      }
    }
  })
  const action = await planner.nextAction({
    session: {
      status: 'running',
      approvalMode: 'ask',
      messages: [{ role: 'user', content: '检查文件' }],
      toolCalls: [],
      observations: []
    },
    tools: [{ name: 'read_file', riskLevel: 'safe' }]
  })
  assert.deepEqual(action, {
    type: 'tool_call',
    name: 'read_file',
    input: { path: 'a.txt' }
  })
  assert.equal(calls[0][0], 'create')
  assert.equal(calls[1][1].tools.bash, false)
  assert.equal(calls[1][1].model, 'opencode/big-pickle')
})

test('Workbench can select OpenCode as the planner while retaining a native fallback', async () => {
  let nativeCalls = 0
  let factoryCalls = 0
  const planner = createWorkbenchPlanner({
    sendChat: async () => {
      nativeCalls += 1
      return '{"type":"message","content":"native"}'
    },
    engine: () => 'opencode',
    openCodePlannerFactory: () => {
      factoryCalls += 1
      return {
        nextAction: async () => ({ type: 'finish', result: { content: 'OpenCode' } })
      }
    }
  })
  const action = await planner.nextAction({ session: {}, tools: [] })
  assert.deepEqual(action, { type: 'finish', result: { content: 'OpenCode' } })
  assert.equal(factoryCalls, 1)
  assert.equal(nativeCalls, 0)
})

test('OpenCode binary discovery honors an explicit path and runtime status/health', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yufeng-opencode-'))
  const fakeBinary = path.join(tempDir, process.platform === 'win32' ? 'opencode.exe' : 'opencode')
  fs.writeFileSync(fakeBinary, '#!/bin/sh\n')
  fs.chmodSync(fakeBinary, 0o755)
  assert.equal(discoverOpenCodeBinary({
    env: { OPENCODE_BIN: fakeBinary },
    platform: process.platform,
    spawnSyncImpl: () => ({ status: 1, stdout: '' })
  }), fakeBinary)

  const requests = []
  const runtime = new OpenCodeRuntime({
    binaryPath: fakeBinary,
    baseUrl: 'http://127.0.0.1:41991',
    directory: '/tmp/project',
    fetchImpl: async (url, init = {}) => {
      requests.push({ url, init })
      if (url.endsWith('/global/health')) return jsonResponse({ healthy: true, version: '1.18.13' })
      if (url.endsWith('/provider?directory=%2Ftmp%2Fproject')) return jsonResponse({ all: [], connected: [], default: {} })
      if (url.includes('/session/status')) return jsonResponse({ ses_test: { type: 'idle' } })
      if (url.includes('/session?')) return jsonResponse({ id: 'ses_test' })
      return jsonResponse(true)
    }
  })
  assert.equal(runtime.status().state, 'stopped')
  assert.deepEqual(await runtime.health(), { healthy: true, version: '1.18.13' })
  assert.deepEqual(await runtime.listProviders(), { all: [], connected: [], default: {} })
  assert.deepEqual(await runtime.createSession({ title: 'runtime test' }), { id: 'ses_test' })
  assert.deepEqual(await runtime.sessionStatus({ sessionId: 'ses_test' }), { type: 'idle' })
  assert.deepEqual(await runtime.abort({ sessionId: 'ses_test' }), true)
  assert.equal(requests.some(request => request.url.includes('/session/ses_test/abort')), true)
})

test('OpenCode runtime start uses spawn without shell and transitions to running', async () => {
  const child = new EventEmitter()
  child.pid = 9876
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => true
  let spawnCall
  let healthChecks = 0
  const runtime = new OpenCodeRuntime({
    binaryPath: '/tmp/opencode',
    baseUrl: 'http://127.0.0.1:41992',
    fetchImpl: async url => {
      assert.match(url, /global\/health$/)
      healthChecks += 1
      if (healthChecks === 1) throw new Error('no external server')
      return jsonResponse({ healthy: true, version: '1.18.13' })
    },
    spawnImpl: (...args) => {
      spawnCall = args
      return child
    }
  })
  const status = await runtime.start()
  assert.equal(status.state, 'running')
  assert.equal(healthChecks >= 2, true)
  assert.equal(spawnCall[0], '/tmp/opencode')
  assert.deepEqual(spawnCall[1].slice(0, 3), ['serve', '--hostname', '127.0.0.1'])
  assert.equal(spawnCall[2].shell, false)
  await runtime.stop()
  assert.equal(runtime.status().state, 'stopped')
})
