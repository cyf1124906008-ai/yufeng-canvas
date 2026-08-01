import test from 'node:test'
import assert from 'node:assert/strict'

import { createHeadlessChatClient } from '../src/agent/runtime/headlessChatClient.js'
import { PROVIDERS } from '../src/config/providers.js'

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  }
}

test('headless chat calls the configured endpoint without Canvas logging dependencies', async () => {
  let request
  const client = createHeadlessChatClient({
    modelStore: {
      selectedChatModel: 'chat-model',
      currentProvider: 'dataeyes',
      currentChatApiKey: 'secret-key',
      getChatEndpoint: () => 'https://api.example/v1/chat/completions',
      adaptRequest: (_type, payload) => ({ ...payload, temperature: 0.2 }),
      adaptResponse: (_type, payload) => payload
    },
    fetchImpl: async (url, options) => {
      request = { url, options }
      return response({ choices: [{ message: { content: '{"name":"finish"}' } }] })
    }
  })

  const result = await client.send('下一步是什么', false)
  const body = JSON.parse(request.options.body)
  assert.equal(request.url, 'https://api.example/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer secret-key')
  assert.equal(body.model, 'chat-model')
  assert.equal(body.temperature, 0.2)
  assert.equal(result, '{"name":"finish"}')
})

test('headless chat sends real image input to a selected Vision model', async () => {
  let body
  const client = createHeadlessChatClient({
    modelStore: {
      selectedChatModel: 'text-default',
      getChatEndpoint: () => 'https://api.example/v1/chat/completions'
    },
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body)
      return response({ choices: [{ message: { content: '{"reviewMode":"vision"}' } }] })
    }
  })

  await client.send('检查图片', false, {
    model: 'vision-model',
    images: ['https://media.example/image.png'],
    isolated: true
  })

  assert.equal(body.model, 'vision-model')
  assert.equal(body.messages[0].content[1].image_url.url, 'https://media.example/image.png')
})

test('headless chat preserves HTTP status for fallback classification', async () => {
  const client = createHeadlessChatClient({
    modelStore: {
      selectedChatModel: 'chat-model',
      getChatEndpoint: () => 'https://api.example/v1/chat/completions'
    },
    fetchImpl: async () => response({ error: { message: 'rate limited' } }, 429)
  })

  await assert.rejects(
    client.send('hello'),
    error => error.status === 429 && /rate limited/.test(error.message)
  )
})

test('headless chat sends the selected reasoning effort through the provider adapter', async () => {
  let body
  const client = createHeadlessChatClient({
    modelStore: {
      selectedChatModel: 'reasoning-model',
      currentProvider: 'dataeyes',
      getChatEndpoint: () => 'https://api.example/v1/chat/completions',
      adaptRequest: (_type, payload) => ({ ...payload })
    },
    reasoningEffort: { value: 'xhigh' },
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body)
      return response({ choices: [{ message: { content: 'done' } }] })
    }
  })

  await client.send('solve')
  assert.equal(body.reasoning_effort, 'xhigh')
})

test('headless chat retries once without reasoning effort only for an unsupported parameter response', async () => {
  const bodies = []
  const client = createHeadlessChatClient({
    modelStore: {
      selectedChatModel: 'legacy-model',
      currentProvider: 'legacy',
      getChatEndpoint: () => 'https://api.example/v1/chat/completions'
    },
    reasoningEffort: () => 'max',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body)
      bodies.push(body)
      if (bodies.length === 1) {
        return response({ error: { message: "Unknown parameter: 'reasoning_effort' is not supported" } }, 400)
      }
      return response({ choices: [{ message: { content: 'fallback result' } }] })
    }
  })

  assert.equal(await client.send('solve'), 'fallback result')
  assert.equal(bodies.length, 2)
  assert.equal(bodies[0].reasoning_effort, 'max')
  assert.equal('reasoning_effort' in bodies[1], false)

  await client.send('solve again')
  assert.equal(bodies.length, 3)
  assert.equal('reasoning_effort' in bodies[2], false)
})

test('headless chat does not retry authentication, rate limit, or unrelated validation errors', async () => {
  for (const [status, message] of [
    [401, 'invalid API key'],
    [429, 'rate limited'],
    [400, 'messages is required']
  ]) {
    let calls = 0
    const client = createHeadlessChatClient({
      modelStore: {
        selectedChatModel: 'reasoning-model',
        getChatEndpoint: () => 'https://api.example/v1/chat/completions'
      },
      reasoningEffort: 'high',
      fetchImpl: async () => {
        calls += 1
        return response({ error: { message } }, status)
      }
    })
    await assert.rejects(client.send('solve'), error => error.status === status)
    assert.equal(calls, 1)
  }
})

test('every configured OpenAI-compatible provider adapter preserves reasoning_effort', () => {
  for (const providerId of ['yufeng', 'openai', 'dataeyes', 'custom']) {
    const adapted = PROVIDERS[providerId].requestAdapter.chat({
      model: 'reasoning-model',
      messages: [{ role: 'user', content: 'solve' }],
      reasoning_effort: 'high',
      stream: false
    })
    assert.equal(adapted.reasoning_effort, 'high', providerId)
  }
  assert.equal(PROVIDERS.default.requestAdapter, undefined)
})
