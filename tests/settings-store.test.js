import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_SETTINGS_STORAGE_KEY,
  createAgentSettingsStore,
  normalizeAgentSettings
} from '../src/stores/settings.js'

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed))
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  }
}

function createRoot() {
  const classes = new Set()
  return {
    dataset: {},
    style: {},
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name)
        else classes.delete(name)
      },
      contains: name => classes.has(name)
    }
  }
}

function createMedia(matches = false) {
  let listener = null
  return {
    matches,
    addEventListener: (_name, callback) => { listener = callback },
    removeEventListener: () => { listener = null },
    update(value) {
      this.matches = value
      listener?.({ matches: value })
    }
  }
}

test('settings normalization uses safe defaults and supports legacy workspace tool preference', () => {
  const normalized = normalizeAgentSettings({
    theme: 'invalid',
    approvalMode: 'auto',
    maxActionsPerTurn: 999,
    tools: { workspace: false, terminal: false }
  }, { restoring: true })

  assert.equal(normalized.theme, 'system')
  assert.equal(normalized.approvalMode, 'ask')
  assert.equal(normalized.reasoningEffort, 'auto')
  assert.equal(normalized.maxActionsPerTurn, 64)
  assert.equal(normalized.tools.workspaceRead, false)
  assert.equal(normalized.tools.workspaceWrite, false)
  assert.equal(normalized.tools.terminal, false)
  assert.equal(normalized.tools.computer, true)
})

test('auto mode is usable for the current session but is never restored from persistence', () => {
  const storage = createStorage()
  const store = createAgentSettingsStore({ storage, root: createRoot(), systemTheme: createMedia(false) })

  assert.equal(store.approvalMode.value, 'ask')
  assert.equal(store.setApprovalMode('auto'), true)
  assert.equal(store.approvalMode.value, 'auto')

  const persisted = JSON.parse(storage.snapshot()[AGENT_SETTINGS_STORAGE_KEY])
  assert.equal(persisted.approvalMode, 'ask')

  const restored = createAgentSettingsStore({ storage, root: createRoot(), systemTheme: createMedia(false) })
  assert.equal(restored.approvalMode.value, 'ask')
  store.dispose()
  restored.dispose()
})

test('full access preference is accepted in memory but never persisted or restored as authority', () => {
  const storage = createStorage()
  const store = createAgentSettingsStore({ storage, root: createRoot(), systemTheme: createMedia(false) })

  assert.equal(store.setApprovalMode('full_access'), true)
  assert.equal(store.approvalMode.value, 'full_access')
  assert.equal(JSON.parse(storage.snapshot()[AGENT_SETTINGS_STORAGE_KEY]).approvalMode, 'ask')

  const restored = createAgentSettingsStore({
    storage: createStorage({
      [AGENT_SETTINGS_STORAGE_KEY]: JSON.stringify({ approvalMode: 'full_access' })
    }),
    root: createRoot(),
    systemTheme: createMedia(false)
  })
  assert.equal(restored.approvalMode.value, 'ask')
  store.dispose()
  restored.dispose()
})

test('theme, density and desktop preferences persist and update the document contract', () => {
  const storage = createStorage()
  const root = createRoot()
  const media = createMedia(true)
  const store = createAgentSettingsStore({ storage, root, systemTheme: media })

  assert.equal(store.isDark.value, true)
  assert.equal(root.classList.contains('dark'), true)
  assert.equal(root.dataset.yufengThemePreference, 'system')

  store.setTheme('light')
  store.setDensity('compact')
  store.state.backgroundMode = false
  store.state.launchAtLogin = true
  store.state.preventSleepDuringRuns = false

  assert.equal(store.isDark.value, false)
  assert.equal(root.dataset.yufengTheme, 'light')
  assert.equal(root.dataset.yufengDensity, 'compact')

  const persisted = JSON.parse(storage.snapshot()[AGENT_SETTINGS_STORAGE_KEY])
  assert.equal(persisted.backgroundMode, false)
  assert.equal(persisted.launchAtLogin, true)
  assert.equal(persisted.preventSleepDuringRuns, false)
  store.dispose()
})

test('max actions and five tool groups validate before persistence', () => {
  const storage = createStorage()
  const store = createAgentSettingsStore({ storage, root: createRoot(), systemTheme: createMedia(false) })

  assert.equal(store.setMaxActionsPerTurn(2), 4)
  assert.equal(store.setMaxActionsPerTurn(31), 31)
  assert.equal(store.setToolEnabled('workspaceRead', false), true)
  assert.equal(store.setToolEnabled('workspaceWrite', false), true)
  assert.equal(store.setToolEnabled('unknown', false), false)
  assert.deepEqual(Object.keys(store.tools.value), [
    'workspaceRead',
    'workspaceWrite',
    'terminal',
    'computer',
    'creative'
  ])
  store.dispose()
})

test('reasoning effort accepts only supported levels and persists the selected preference', () => {
  const storage = createStorage()
  const store = createAgentSettingsStore({ storage, root: createRoot(), systemTheme: createMedia(false) })
  const levels = ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

  assert.equal(store.reasoningEffort.value, 'auto')
  for (const level of levels) {
    assert.equal(store.setReasoningEffort(level), true)
    assert.equal(store.reasoningEffort.value, level)
  }
  assert.equal(store.setReasoningEffort('ultra'), false)
  assert.equal(store.reasoningEffort.value, 'max')
  assert.equal(JSON.parse(storage.snapshot()[AGENT_SETTINGS_STORAGE_KEY]).reasoningEffort, 'max')
  store.dispose()
})
