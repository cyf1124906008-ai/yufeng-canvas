import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AgentRunner,
  ContextManager,
  Planner,
  ToolRegistry,
  Verifier,
  inferTargetType
} from '../src/agent/core/index.js'

test('ToolRegistry hides disabled tools and fails closed at execution time', async () => {
  let executions = 0
  const tools = new ToolRegistry({
    inspect: async () => {
      executions += 1
      return { ok: true }
    }
  })

  assert.deepEqual(tools.list().map(tool => tool.name), ['inspect'])
  assert.equal(tools.setEnabled('inspect', false), false)
  assert.equal(tools.has('inspect'), false)
  assert.equal(tools.isEnabled('inspect'), false)
  assert.deepEqual(tools.list(), [])
  await assert.rejects(tools.execute('inspect'), error => error.code === 'TOOL_DISABLED')
  assert.equal(executions, 0)

  assert.equal(tools.setEnabled('inspect', true), true)
  assert.equal((await tools.execute('inspect')).ok, true)
  assert.equal(executions, 1)
  assert.throws(() => tools.setEnabled('missing', false), error => error.code === 'TOOL_NOT_FOUND')
})

test('image goal completes through generate_image then finish', async () => {
  const calls = []
  const events = []
  const tools = new ToolRegistry({
    generate_image: async input => {
      calls.push(['generate_image', input])
      return { url: 'https://example.test/poster.png' }
    }
  })
  const runner = new AgentRunner({ toolRegistry: tools })
  runner.subscribe(event => events.push(event.type))

  const state = await runner.run('帮我做一张赛博朋克汽车海报')

  assert.equal(state.status, 'completed')
  assert.equal(state.targetType, 'image')
  assert.deepEqual(state.actions.map(action => action.name), ['generate_image', 'finish'])
  assert.equal(state.outputs[0].type, 'image')
  assert.equal(calls[0][1].prompt, '帮我做一张赛博朋克汽车海报')
  assert.ok(events.includes('tool_succeeded'))
  assert.equal(events.at(-1), 'completed')
})

test('a timed ad is inferred as video and completes image-to-video', async () => {
  const calls = []
  const tools = new ToolRegistry({
    generate_image: async input => {
      calls.push(['generate_image', input])
      return { imageUrl: 'https://example.test/coffee.png' }
    },
    generate_video: async input => {
      calls.push(['generate_video', input])
      return { url: 'https://example.test/coffee.mp4' }
    }
  })

  assert.equal(inferTargetType('帮我做一个10秒咖啡广告'), 'video')
  const state = await new AgentRunner({ toolRegistry: tools }).run('帮我做一个10秒咖啡广告')

  assert.equal(state.status, 'completed')
  assert.deepEqual(state.actions.map(action => action.name), [
    'generate_image',
    'generate_video',
    'finish'
  ])
  assert.equal(calls[1][1].duration, 10)
  assert.equal(calls[1][1].image, 'https://example.test/coffee.png')
  assert.equal(state.outputs.at(-1).type, 'video')
})

test('verifier gates an early LLM finish before allowing completion', async () => {
  let call = 0
  const llm = async () => {
    call += 1
    if (call === 1) return '{"name":"finish","input":{}}'
    // Invalid JSON deliberately activates the deterministic fallback.
    return 'not-json'
  }
  const planner = new Planner({ llm })
  const runner = new AgentRunner({
    planner,
    verifier: new Verifier(),
    tools: {
      generate_image: async () => ({ url: 'https://example.test/final.png' })
    }
  })
  const events = []
  runner.subscribe(event => events.push(event.type))

  const state = await runner.run('生成一张产品主视觉')

  assert.equal(state.status, 'completed')
  assert.deepEqual(state.actions.map(action => action.name), ['finish', 'generate_image', 'finish'])
  assert.equal(state.finishBlocks.length, 1)
  assert.match(state.finishBlocks[0].reason, /image result/)
  assert.ok(events.includes('finish_blocked'))
})

test('tool failure fails the run and is observable in state events', async () => {
  const expected = new Error('provider timeout')
  const events = []
  const runner = new AgentRunner({
    tools: { generate_image: async () => { throw expected } }
  })
  runner.subscribe(event => events.push(event))

  await assert.rejects(runner.run('生成一张海报'), /provider timeout/)

  assert.equal(runner.state.status, 'failed')
  assert.equal(runner.state.errors[0].message, 'provider timeout')
  assert.equal(runner.state.errors[0].action, 'generate_image')
  assert.equal(events.at(-1).type, 'failed')
  assert.equal(events.at(-1).state.status, 'failed')
})

test('runner supports cancellation during a tool call', async () => {
  const runner = new AgentRunner({
    tools: {
      generate_image: (_input, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }
  })
  const running = runner.run('生成一张海报')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(runner.cancel('user stopped'), true)

  await assert.rejects(running, /user stopped/)
  assert.equal(runner.state.status, 'cancelled')
})

test('subscriber failures never strand or fail an Agent run', async () => {
  const listenerErrors = []
  const runner = new AgentRunner({
    tools: {
      generate_image: async () => ({ artifactId: 'image-safe' })
    },
    onListenerError: (error, detail) => listenerErrors.push([error.message, detail.type])
  })
  runner.subscribe(() => {
    throw new Error('broken observer')
  })

  const first = await runner.run('生成一张海报')
  const second = await runner.run('再生成一张海报')

  assert.equal(first.status, 'completed')
  assert.equal(second.status, 'completed')
  assert.equal(runner.controller, null)
  assert.ok(listenerErrors.some(([, type]) => type === 'started'))
  assert.ok(listenerErrors.some(([, type]) => type === 'tool_succeeded'))
  assert.ok(listenerErrors.some(([, type]) => type === 'completed'))
})

test('runner enforces maxSteps when finish is repeatedly rejected', async () => {
  const planner = new Planner({
    llm: async () => '{"name":"finish","input":{}}'
  })
  const runner = new AgentRunner({ planner, maxSteps: 2 })

  await assert.rejects(runner.run('生成一张图片'), error => {
    assert.equal(error.code, 'MAX_STEPS_EXCEEDED')
    return true
  })
  assert.equal(runner.state.status, 'failed')
  assert.equal(runner.state.finishBlocks.length, 2)
})

test('planner repairs an impossible video-first action before calling tools', async () => {
  let plannerCall = 0
  const planner = new Planner({
    llm: async () => {
      plannerCall += 1
      if (plannerCall < 3) return '{"name":"generate_video","input":{"prompt":"咖啡广告"}}'
      return '{"name":"finish","input":{}}'
    }
  })
  const calls = []
  const runner = new AgentRunner({
    planner,
    tools: {
      generate_image: async () => {
        calls.push('generate_image')
        return { outputNodeId: 'image-1' }
      },
      generate_video: async () => {
        calls.push('generate_video')
        return { outputNodeId: 'video-1' }
      }
    }
  })

  const state = await runner.run('制作一个 10 秒咖啡广告')

  assert.deepEqual(calls, ['generate_image', 'generate_video'])
  assert.equal(state.status, 'completed')
  assert.match(state.actions[0].fallbackReason, /source image/)
})

test('planner context hides media URLs and credentials', async () => {
  const bareBase64 = 'QUJD'.repeat(40)
  const context = new ContextManager()
  context.addObservation('generate_image', {
    outputNodeId: 'image-1',
    url: 'https://example.test/private.png',
    nested: {
      apiKey: 'top-secret',
      b64_json: 'short-base64-media',
      imageData: 'short-image-media',
      access_token: 'access-secret',
      refreshToken: 'refresh-secret',
      clientSecret: 'client-secret',
      sessionToken: 'session-secret',
      cookie: 'cookie-secret',
      privateKey: 'private-key-secret',
      password: 'password-secret',
      providerPayload: bareBase64
    }
  })

  const serialized = JSON.stringify(context.toMessages())
  for (const secret of [
    'private.png',
    'top-secret',
    'short-base64-media',
    'short-image-media',
    'access-secret',
    'refresh-secret',
    'client-secret',
    'session-secret',
    'cookie-secret',
    'private-key-secret',
    'password-secret',
    bareBase64
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace('.', '\\.')))
  }
  assert.match(serialized, /media-reference-hidden|media-data-omitted|redacted/)

  const plannerPayloads = []
  const planner = new Planner({
    llm: async payload => {
      plannerPayloads.push(payload)
      return plannerPayloads.length === 1
        ? '{"name":"generate_image","input":{"prompt":"海报"}}'
        : '{"name":"finish","input":{}}'
    }
  })
  const runner = new AgentRunner({
    planner,
    contextManager: context,
    tools: {
      generate_image: async () => ({
        outputNodeId: 'image-2',
        url: 'data:image/png;base64,secret-media',
        authorization: 'Bearer private-token',
        b64_json: 'provider-b64-json',
        imageData: 'provider-image-data',
        access_token: 'provider-access-token',
        refreshToken: 'provider-refresh-token',
        clientSecret: 'provider-client-secret',
        sessionToken: 'provider-session-token',
        cookie: 'provider-cookie',
        privateKey: 'provider-private-key',
        password: 'provider-password',
        rawPayload: bareBase64
      })
    }
  })

  await runner.run('生成一张海报')
  const secondPayload = JSON.stringify(plannerPayloads[1])
  for (const secret of [
    'secret-media',
    'private-token',
    'provider-b64-json',
    'provider-image-data',
    'provider-access-token',
    'provider-refresh-token',
    'provider-client-secret',
    'provider-session-token',
    'provider-cookie',
    'provider-private-key',
    'provider-password',
    bareBase64
  ]) {
    assert.doesNotMatch(secondPayload, new RegExp(secret))
  }
  assert.match(secondPayload, /media-reference-hidden|media-data-omitted|redacted/)
})
