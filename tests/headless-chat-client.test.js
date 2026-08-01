import test from 'node:test'
import assert from 'node:assert/strict'

import { createHeadlessChatClient } from '../src/agent/runtime/headlessChatClient.js'

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
