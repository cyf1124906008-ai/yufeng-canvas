import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'

const readSource = path => readFile(new URL(path, import.meta.url), 'utf8')

test('API settings uses a professional provider, connection, catalog, and status layout', async () => {
  const source = await readSource('../src/components/ApiSettings.vue')

  assert.match(source, /class="settings-grid"/)
  assert.match(source, /class="provider-rail"/)
  assert.match(source, /class="settings-panel connection-panel"/)
  assert.match(source, /class="settings-panel catalog-panel"/)
  assert.match(source, /class="status-rail"/)
  assert.match(source, /grid-template-columns: 210px minmax\(420px, 1fr\) 254px/)
  assert.match(source, /@media \(max-width: 1020px\)/)
  assert.match(source, /@media \(max-width: 760px\)/)
  assert.match(source, /@media \(max-width: 520px\)/)
  assert.doesNotMatch(source, /font-size: (?:8|9)px/)
})

test('API settings keeps credentials masked and wires every operational action', async () => {
  const source = await readSource('../src/components/ApiSettings.vue')

  assert.match(source, /v-model:value="formData\.apiKey"\s+type="password"/)
  assert.match(source, /v-model:value="formData\[capability\.keyField\]"\s+type="password"/)
  assert.match(source, /@click="handleTestConnection"/)
  assert.match(source, /@click="handleSyncModels"/)
  assert.match(source, /@click="handleImportDataEyesModels"/)
  assert.match(source, /@click="handleExportData"/)
  assert.match(source, /@click="handleImportData"/)
  assert.match(source, /@click="openAssetsFolder"/)
  assert.match(source, /@click="handleSave"/)
  assert.match(source, /@click="handleClear"/)
  assert.match(source, /resolveProviderConnectionPair\(profiles\)/)
  assert.match(source, /testProviderConnection\(\{\s*baseUrl: pair\.baseUrl,\s*apiKey: pair\.apiKey,/)
  assert.match(source, /exportUserDataToFile\(\)/)
  assert.match(source, /importUserDataFromFile\(\{ overwrite: true \}\)/)
})

test('model catalog actions are scoped to the provider selected in the settings rail', async () => {
  const source = await readSource('../src/components/ApiSettings.vue')

  assert.match(source, /getModelsByProvider\(formData\.provider/)
  assert.match(source, /addCustomChatModelByProvider\(modelName, formData\.provider\)/)
  assert.match(source, /addCustomImageModelByProvider\(modelName, formData\.provider/)
  assert.match(source, /addCustomVideoModelByProvider\(modelName, formData\.provider\)/)
  assert.match(source, /removeCustomChatModelByProvider/)
  assert.match(source, /removeCustomImageModelByProvider/)
  assert.match(source, /removeCustomVideoModelByProvider/)
  assert.match(source, /customImageModelsByProvider\[formData\.provider\]/)
})

test('connection checks select one coherent capability URL and key pair', async () => {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  })

  try {
    const { resolveProviderConnectionPair } = await server.ssrLoadModule('/src/stores/pinia/models.js')
    assert.deepEqual(resolveProviderConnectionPair({
      default: { baseUrl: 'https://default.example/v1', apiKey: 'default-key' },
      chat: { baseUrl: 'https://chat.example/v1', apiKey: 'chat-key' }
    }), {
      capability: 'default',
      baseUrl: 'https://default.example/v1',
      apiKey: 'default-key',
      warnings: []
    })

    assert.deepEqual(resolveProviderConnectionPair({
      default: { baseUrl: 'https://default.example/v1', apiKey: '' },
      chat: { baseUrl: 'https://chat.example/v1', apiKey: '' },
      image: { baseUrl: 'https://image.example/v1', apiKey: 'image-key' },
      video: { baseUrl: 'https://video.example/v1', apiKey: 'video-key' }
    }), {
      capability: 'image',
      baseUrl: 'https://image.example/v1',
      apiKey: 'image-key',
      warnings: []
    })

    assert.equal(resolveProviderConnectionPair({
      chat: { baseUrl: 'https://chat.example/v1', apiKey: '' },
      image: { baseUrl: '', apiKey: 'image-key' }
    }), null)
  } finally {
    await server.close()
  }
})

test('provider-scoped model mutations preserve global selections and safely repair active deletions', async () => {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent'
  })

  try {
    const { useModelStore } = await server.ssrLoadModule('/src/stores/pinia/models.js')
    setActivePinia(createPinia())
    const store = useModelStore()
    const activeProvider = store.currentProvider
    const inactiveProvider = store.providerList.find(provider => provider.key !== activeProvider)?.key
    assert.ok(inactiveProvider, 'test requires at least two Providers')

    const cases = [
      {
        kind: 'chat',
        selected: 'selectedChatModel',
        available: 'availableChatModels',
        add: 'addCustomChatModelByProvider',
        remove: 'removeCustomChatModelByProvider'
      },
      {
        kind: 'image',
        selected: 'selectedImageModel',
        available: 'availableImageModels',
        add: 'addCustomImageModelByProvider',
        remove: 'removeCustomImageModelByProvider'
      },
      {
        kind: 'video',
        selected: 'selectedVideoModel',
        available: 'availableVideoModels',
        add: 'addCustomVideoModelByProvider',
        remove: 'removeCustomVideoModelByProvider'
      }
    ]

    for (const entry of cases) {
      const initialSelection = store[entry.selected]
      const inactiveModel = `test-inactive-${entry.kind}`
      assert.equal(store[entry.add](inactiveModel, inactiveProvider), true)
      assert.equal(store[entry.selected], initialSelection)
      assert.equal(store[entry.remove](inactiveModel, inactiveProvider), true)
      assert.equal(store[entry.selected], initialSelection)

      const activeModel = `test-active-${entry.kind}`
      assert.equal(store[entry.add](activeModel, activeProvider), true)
      assert.equal(store[entry.selected], activeModel)
      assert.equal(store[entry.remove](activeModel, activeProvider), true)
      assert.notEqual(store[entry.selected], activeModel)
      assert.ok(
        !store[entry.selected] || store[entry.available].some(model => model.key === store[entry.selected]),
        `${entry.kind} selection must fall back to an available model`
      )
    }

    store.setApiKeyByProvider(activeProvider, 'snapshot-key', 'default')
    const snapshotModel = 'snapshot-chat-model'
    assert.equal(store.addCustomChatModelByProvider(snapshotModel, activeProvider), true)
    const snapshot = store.createApiSettingsSnapshot()

    store.setProvider(inactiveProvider)
    store.setApiKeyByProvider(activeProvider, 'mutated-key', 'default')
    store.removeCustomChatModelByProvider(snapshotModel, activeProvider)
    assert.equal(store.restoreApiSettingsSnapshot(snapshot), true)
    await Promise.resolve()
    assert.deepEqual(store.createApiSettingsSnapshot(), snapshot)
    assert.equal(store.restoreApiSettingsSnapshot(null), false)
  } finally {
    await server.close()
  }
})

test('API settings guards async Provider results and restores cancelable transactions', async () => {
  const source = await readSource('../src/components/ApiSettings.vue')

  assert.match(source, /:disabled="DISTRIBUTION_CONFIG\.api\.lockProvider \|\| providerSwitchLocked"/)
  assert.match(source, /const providerDrafts = new Map\(\)/)
  assert.match(source, /captureProviderDraft\(\)[\s\S]*applyProviderDraft\(provider\)/)
  assert.match(source, /providerRequestTokens = \{ connection: 0, sync: 0, dataeyes: 0 \}/)
  assert.match(source, /provider: formData\.provider,[\s\S]*revision: connectionRevision/)
  assert.match(source, /isCurrentProviderRequest\(request\)/)
  assert.match(source, /settingsSnapshot = modelStore\.createApiSettingsSnapshot\(\)/)
  assert.match(source, /modelStore\.restoreApiSettingsSnapshot\(snapshot\)/)
  assert.match(source, /@click="handleCancel"/)
  assert.match(source, /window\.confirm\(`确定清除/)
  assert.doesNotMatch(source, /const handleSyncModels = async \(\) => \{\s*const provider = persistFormConfig\(\)/)
})

test('mobile API settings keep protocol and clear controls available', async () => {
  const source = await readSource('../src/components/ApiSettings.vue')
  const mobileRules = source.slice(source.indexOf('@media (max-width: 520px)'))

  assert.match(mobileRules, /\.catalog-row \.protocol-select,[\s\S]*grid-column: 2 \/ 4/)
  assert.match(mobileRules, /\.footer-actions \.n-button:first-child \{ margin-right: auto; \}/)
  assert.doesNotMatch(mobileRules, /\.catalog-row \.protocol-select,[\s\S]{0,120}display:\s*none/)
  assert.doesNotMatch(mobileRules, /\.footer-actions \.n-button:first-child \{\s*display:\s*none/)
})

test('settings and support surfaces avoid the retired Canvas brand while distribution uses DataEyes Code', async () => {
  const [settings, support, distribution] = await Promise.all([
    readSource('../src/components/ApiSettings.vue'),
    readSource('../src/components/SupportModal.vue'),
    readSource('../src/config/distribution.js')
  ])

  assert.doesNotMatch(settings, /YUFENG Canvas/)
  assert.doesNotMatch(support, /YUFENG Canvas/)
  assert.match(distribution, /appName: 'DataEyes Code'/)
  assert.doesNotMatch(distribution, /appName: 'YUFENG Canvas'/)
})
