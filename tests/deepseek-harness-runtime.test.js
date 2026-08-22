import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { scopeOf } from '@deepseek-ai/dsh-scope'

import { ToolRegistry } from '../src/agent/core/ToolRegistry.js'
import {
  DEEPSEEK_HARNESS_VERSIONS,
  HARNESS_PLUGIN_IDS,
  createWorkbenchHarnessKernel
} from '../src/agent/harness/index.js'
import { useAgentWorkbench } from '../src/agent/runtime/useAgentWorkbench.js'

const require = createRequire(import.meta.url)

function installedVersion(packageName) {
  const packagePath = require.resolve(`${packageName}/package.json`)
  return JSON.parse(readFileSync(packagePath, 'utf8')).version
}

function kernelFixture(options = {}) {
  return createWorkbenchHarnessKernel({
    plannerFactory: options.plannerFactory || (() => ({
      nextAction: async () => ({ type: 'finish', result: { content: '完成' } })
    })),
    toolRegistry: options.toolRegistry || new ToolRegistry()
  })
}

test('DeepSeek Harness runtime pins the official Cordis, scope and invariant packages', () => {
  assert.deepEqual(DEEPSEEK_HARNESS_VERSIONS, {
    cordis: installedVersion('@deepseek-ai/cordis'),
    scope: installedVersion('@deepseek-ai/dsh-scope'),
    invariants: installedVersion('@deepseek-ai/dsh-invariants')
  })
  assert.deepEqual(DEEPSEEK_HARNESS_VERSIONS, {
    cordis: '4.0.1',
    scope: '0.1.1-rc.2',
    invariants: '0.1.1-rc.2'
  })
})

test('Cordis orders service plugins by dependency and unloading reverses their effects', async t => {
  const kernel = kernelFixture()
  t.after(() => kernel.dispose())
  const ready = await kernel.ready

  assert.equal(ready.lifecycle, 'ready')
  assert.equal(ready.mode, 'cordis')
  assert.equal(ready.pluginCount, 6)
  assert.equal(ready.serviceCount, 3)
  assert.equal(Object.isFrozen(ready), true)
  assert.equal(Object.isFrozen(ready.plugins), true)

  const planner = ready.plugins.find(plugin => plugin.id === HARNESS_PLUGIN_IDS.planner)
  const tools = ready.plugins.find(plugin => plugin.id === HARNESS_PLUGIN_IDS.tools)
  const sessions = ready.plugins.find(plugin => plugin.id === HARNESS_PLUGIN_IDS.sessions)
  assert.equal(planner.state, 'active')
  assert.equal(tools.state, 'active')
  assert.equal(sessions.state, 'active')
  assert.ok(sessions.activationIndex > planner.activationIndex)
  assert.ok(sessions.activationIndex > tools.activationIndex)

  assert.equal(await kernel.unloadPlugin(HARNESS_PLUGIN_IDS.planner), true)
  const unloaded = kernel.snapshot()
  assert.equal(unloaded.plugins.find(plugin => plugin.id === HARNESS_PLUGIN_IDS.planner).state, 'disposed')
  assert.equal(unloaded.plugins.find(plugin => plugin.id === HARNESS_PLUGIN_IDS.planner).deactivationCount, 1)
  assert.equal(unloaded.services.find(service => service.role === 'plannerFactory').available, false)
  assert.equal(unloaded.services.find(service => service.role === 'sessionFactory').available, false)
  assert.throws(
    () => kernel.createSession(),
    error => error.code === 'HARNESS_SESSION_FACTORY_UNAVAILABLE'
  )
})

test('each WorkbenchSession receives a lifecycle-scoped dsh context that is not an authority boundary', async t => {
  const kernel = kernelFixture()
  t.after(() => kernel.dispose())
  await kernel.ready

  const first = kernel.createSession({ sessionId: 'scope-session-1' })
  const second = kernel.createSession({ sessionId: 'scope-session-2' })
  const firstContext = kernel.contextForSession(first)
  const secondContext = kernel.contextForSession(second)

  assert.ok(firstContext)
  assert.ok(secondContext)
  assert.notEqual(scopeOf(firstContext), scopeOf(secondContext))
  assert.equal(kernel.snapshot().scopes.lifecycleScoped, true)
  assert.equal(kernel.snapshot().scopes.authorityBoundary, false)
  assert.equal(kernel.snapshot().scopes.sessionCount, 2)
  assert.equal(kernel.snapshot().scopeCount, 2)
  assert.notEqual(firstContext.fiber.uid, null)
  assert.notEqual(secondContext.fiber.uid, null)

  assert.equal(await kernel.disposeSession(first, 'test scope disposal'), true)
  assert.equal(firstContext.fiber.uid, null)
  assert.equal(kernel.contextForSession(first), null)
  assert.equal(kernel.contextForSession(second), secondContext)
  assert.equal(kernel.snapshot().scopes.sessionCount, 1)

  await kernel.dispose()
  assert.equal(secondContext.fiber.uid, null)
  assert.equal(kernel.snapshot().sessionCount, 0)
  assert.equal(kernel.snapshot().lifecycle, 'disposed')
})

test('useAgentWorkbench creates and rotates sessions through the harness kernel', async () => {
  let kernelCreateCalls = 0
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent: { runtimeLogs: { value: [] }, dispose() {}, artifacts: { value: [] } },
    desktopAgentTools: null,
    historyRepository: null,
    sendChat: async () => '{"type":"finish","result":{"content":"Harness 已执行"}}',
    harnessKernelFactory(options) {
      const kernel = createWorkbenchHarnessKernel(options)
      const createSession = kernel.createSession.bind(kernel)
      kernel.createSession = sessionOptions => {
        kernelCreateCalls += 1
        return createSession(sessionOptions)
      }
      return kernel
    }
  })

  assert.equal(kernelCreateCalls, 1)
  assert.equal(workbench.harnessRuntime.value.mode, 'cordis')
  assert.equal(workbench.harnessRuntime.value.sessionCount, 1)
  assert.equal(Object.isFrozen(workbench.runtimeSnapshot.value), true)

  const firstId = workbench.session.value.sessionId
  workbench.newTask()
  assert.equal(kernelCreateCalls, 2)
  assert.notEqual(workbench.session.value.sessionId, firstId)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(workbench.harnessRuntime.value.sessionCount, 1)

  const completed = await workbench.submit('验证 Harness 路径')
  assert.equal(completed.final.content, 'Harness 已执行')
  const disposed = await workbench.dispose()
  assert.equal(disposed.lifecycle, 'disposed')
  assert.equal(workbench.harnessRuntime.value.sessionCount, 0)
})

test('kernel bootstrap failure falls back compatibly and remains visible in the snapshot', async () => {
  const runtimeLogs = { value: [] }
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent: { runtimeLogs, dispose() {}, artifacts: { value: [] } },
    desktopAgentTools: null,
    historyRepository: null,
    sendChat: async () => '{"type":"finish","result":{"content":"兼容完成"}}',
    harnessKernelFactory() {
      const error = new Error('synthetic Cordis bootstrap failure')
      error.code = 'SYNTHETIC_CORDIS_FAILURE'
      throw error
    }
  })

  assert.equal(workbench.harnessRuntime.value.mode, 'compatibility-fallback')
  assert.equal(workbench.harnessRuntime.value.lifecycle, 'degraded')
  assert.equal(workbench.harnessRuntime.value.errors[0].code, 'SYNTHETIC_CORDIS_FAILURE')
  assert.equal(runtimeLogs.value.some(log => log.code === 'HARNESS_KERNEL_INIT_FAILED' || log.meta?.code === 'SYNTHETIC_CORDIS_FAILURE'), true)
  assert.equal((await workbench.submit('继续旧语义')).final.content, '兼容完成')
  await workbench.dispose()
})
