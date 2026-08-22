import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  DATAEYES_STARTUP_DEFAULT_HOLD_MS,
  DATAEYES_STARTUP_EXIT_MS,
  DATAEYES_STARTUP_MAX_HOLD_MS,
  DATAEYES_STARTUP_REDUCED_HOLD_MS,
  DATAEYES_STARTUP_STORAGE_KEY,
  prefersReducedStartupMotion,
  rememberDataEyesStartup,
  resolveDataEyesStartupHold,
  shouldShowDataEyesStartup
} from '../src/components/dataEyesStartup.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  }
}

test('DataEyes startup is shown once per app session and remains storage-safe', () => {
  const storage = createMemoryStorage()

  assert.equal(shouldShowDataEyesStartup(storage), true)
  assert.equal(rememberDataEyesStartup(storage), true)
  assert.equal(storage.getItem(DATAEYES_STARTUP_STORAGE_KEY), '1')
  assert.equal(shouldShowDataEyesStartup(storage), false)

  const deniedStorage = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('denied') }
  }
  assert.equal(shouldShowDataEyesStartup(deniedStorage), true)
  assert.equal(rememberDataEyesStartup(deniedStorage), false)
})

test('DataEyes startup duration is bounded and reduced motion exits promptly', () => {
  assert.equal(resolveDataEyesStartupHold(undefined), DATAEYES_STARTUP_DEFAULT_HOLD_MS)
  assert.equal(resolveDataEyesStartupHold(99_000), DATAEYES_STARTUP_MAX_HOLD_MS)
  assert.equal(resolveDataEyesStartupHold(-50), 0)
  assert.equal(resolveDataEyesStartupHold(99_000, true), DATAEYES_STARTUP_REDUCED_HOLD_MS)
  assert.ok(DATAEYES_STARTUP_MAX_HOLD_MS + DATAEYES_STARTUP_EXIT_MS < 1600)
  assert.equal(prefersReducedStartupMotion(() => ({ matches: true })), true)
  assert.equal(prefersReducedStartupMotion(() => ({ matches: false })), false)
})

test('App mounts the reusable startup shell above an already-mounted router view', async () => {
  const [app, component] = await Promise.all([
    readFile(new URL('../src/App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DataEyesCodeStartup.vue', import.meta.url), 'utf8')
  ])

  assert.match(app, /import DataEyesCodeStartup/)
  assert.match(app, /<router-view \/>[\s\S]*<data-eyes-code-startup \/>/)
  assert.match(component, /<Teleport to="body">/)
  assert.match(component, /DataEyes/)
  assert.match(component, /Code/)
  assert.match(component, /跳过 DataEyes Code 启动动画/)
  assert.match(component, /event\.key !== 'Escape'/)
  assert.match(component, /prefers-reduced-motion: reduce/)
  assert.match(component, /transition: opacity 160ms ease/)
  assert.doesNotMatch(component, /transition:\s*all\b/)
  assert.doesNotMatch(component, /LOCAL AGENT|BOOT 01|WORKSPACE BOUNDARY/)

  const keyframes = [...component.matchAll(/@keyframes\s+[^{]+\{([\s\S]*?)\n\}/g)]
  assert.ok(keyframes.length >= 4)
  for (const [, body] of keyframes) {
    assert.doesNotMatch(body, /\b(?:width|height|inset|top|right|bottom|left|margin|padding)\s*:/)
  }
})
