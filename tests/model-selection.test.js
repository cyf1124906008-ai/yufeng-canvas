import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'

const readSource = relativePath => readFile(new URL(relativePath, import.meta.url), 'utf8')

test('model availability keeps explicit outages out of the selectable catalog', async () => {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  })

  try {
    const { isModelAvailable } = await server.ssrLoadModule('/src/stores/pinia/models.js')
    assert.equal(isModelAvailable({ key: 'catalog-without-status' }), true)
    assert.equal(isModelAvailable({ key: 'active', status: 'active' }), true)
    assert.equal(isModelAvailable({ key: 'offline', status: 'offline' }), false)
    assert.equal(isModelAvailable({ key: 'disabled', enabled: false }), false)
    assert.equal(isModelAvailable({ key: 'unavailable', availability: { available: false } }), false)
    assert.equal(isModelAvailable({ key: 'unknown-status', status: 'maintenance' }), true)
  } finally {
    await server.close()
  }
})

test('provider sync exposes imported models but never fabricates a default model', async () => {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  })

  try {
    const { useModelStore } = await server.ssrLoadModule('/src/stores/pinia/models.js')
    setActivePinia(createPinia())
    const store = useModelStore()
    const provider = String(store.currentProvider)

    store.clearCustomModels()
    assert.deepEqual(store.chatModelOptions, [])
    assert.deepEqual(store.imageModelOptions, [])
    assert.deepEqual(store.videoModelOptions, [])

    store.syncModelsFromProvider(provider, [
      { id: 'chat-ready', endpointTypes: ['chat'], status: 'active' },
      { id: 'chat-offline', endpointTypes: ['chat'], status: 'offline' },
      { id: 'image-ready', endpointTypes: ['image-generation'] }
    ])

    assert.deepEqual(store.chatModelOptions.map(model => model.key), ['chat-ready'])
    assert.deepEqual(store.imageModelOptions.map(model => model.key), ['image-ready'])
    assert.deepEqual(store.videoModelOptions, [])
    assert.equal(store.selectedChatModel, 'chat-ready')
  } finally {
    await server.close()
  }
})

test('AgentWorkspace gives an actionable setup path when the model catalog is empty', async () => {
  const source = await readSource('../src/views/AgentWorkspace.vue')

  assert.match(source, /const modelCatalogEmpty = computed\(/)
  assert.match(source, /先配置模型/)
  assert.match(source, /const ensurePlannerModelReady = \(\) =>/)
  assert.match(source, /openSettings\('api'\)/)
  assert.match(source, /同步目录或手动添加一个可用模型/)
  assert.match(source, /模型不在当前 Provider 的可用目录中/)
  assert.match(source, /modelStore\.chatModelOptions/)
  assert.doesNotMatch(source, /modelOptions[\s\S]{0,600}CHAT_MODELS/)
})
